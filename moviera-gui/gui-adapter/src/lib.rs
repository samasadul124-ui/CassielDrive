//! moviera-adapter — a thin local HTTP/JSON API in front of the MovieBox-TUI core.
//!
//! This crate does NOT reimplement any provider logic. It wires HTTP handlers to
//! the existing `moviebox_tui` library (search, details, streams, subtitles,
//! downloads, Live TV, addons, settings, player launch).

use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::SystemTime;

use axum::extract::{Path as AxumPath, Query, State};
use axum::http::StatusCode;
use axum::routing::{get, post, put};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};
use tower_http::cors::{Any, CorsLayer};

use moviebox_tui::config;
use moviebox_tui::download::{self as mb_download, DownloadOutcome, DownloadProgress};
use moviebox_tui::player;
use moviebox_tui::providers::addons::models::InstalledAddon;
use moviebox_tui::providers::addons::AddonClient;
use moviebox_tui::providers::m3u::{Channel, M3UParser};
use moviebox_tui::providers::models::{ProviderError, ProviderKind, Release};
use moviebox_tui::providers::ReleaseProvider;
use moviebox_tui::service::{resolve_download_dir, MovieBoxService};

pub type ApiError = (StatusCode, Json<Value>);

fn err(status: StatusCode, msg: impl ToString) -> ApiError {
    (status, Json(json!({ "error": msg.to_string() })))
}

fn provider_err(e: ProviderError) -> ApiError {
    err(StatusCode::BAD_GATEWAY, e.to_string())
}

fn unix_ms() -> u128 {
    SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

#[derive(Clone)]
pub struct AppState {
    pub service: MovieBoxService,
    pub tasks: Arc<Mutex<HashMap<String, Value>>>,
    pub cancels: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            service: MovieBoxService::new(),
            tasks: Arc::new(Mutex::new(HashMap::new())),
            cancels: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/// Resolve playable releases for a subject. Delegates to the MovieBox-TUI
/// implementations: raw resource API + adapter for MovieBox, `ReleaseProvider`
/// trait implementations for 4KHDHub / BDIX providers.
async fn fetch_releases(
    state: &AppState,
    provider: ProviderKind,
    id: &str,
    season: usize,
    episode: usize,
    resolution: Option<&str>,
) -> Result<Vec<Release>, ApiError> {
    match provider {
        ProviderKind::MovieBox => {
            let payload = state
                .service
                .client
                .get_resources(id, season, episode, 0, resolution, 50)
                .await
                .map_err(|e| err(StatusCode::BAD_GATEWAY, format!("resource fetch failed: {e}")))?;
            Ok(moviebox_tui::providers::moviebox::adapt::moviebox_resource_json_to_releases(
                &payload,
            ))
        }
        ProviderKind::FourKHdHub => {
            let client = state
                .service
                .fourk_client
                .as_ref()
                .ok_or_else(|| err(StatusCode::SERVICE_UNAVAILABLE, "4KHDHub is unavailable"))?;
            ReleaseProvider::episode_streams(client, id, season, episode)
                .await
                .map_err(provider_err)
        }
        ProviderKind::BdixCircleFtp => ReleaseProvider::episode_streams(
            &state.service.circleftp_client,
            id,
            season,
            episode,
        )
        .await
        .map_err(provider_err),
        ProviderKind::BdixDhakaFlix => ReleaseProvider::episode_streams(
            &state.service.dhakaflix_client,
            id,
            season,
            episode,
        )
        .await
        .map_err(provider_err),
        ProviderKind::Addons => Err(err(
            StatusCode::BAD_REQUEST,
            "addon items are played through the addon provider's stream endpoint; no direct release resolution here",
        )),
    }
}

fn pick_release<'a>(
    releases: &'a [Release],
    resolution: Option<&str>,
) -> Option<&'a Release> {
    if resolution.map(str::trim).filter(|r| !r.is_empty()).is_some() {
        let wanted = resolution.unwrap().trim().to_ascii_lowercase();
        if let Some(r) = releases
            .iter()
            .find(|r| r.quality.as_deref().is_some_and(|q| q.to_ascii_lowercase().contains(&wanted)))
        {
            return Some(r);
        }
    }
    releases.first()
}

fn parse_tv_content(content: &str) -> Vec<Channel> {
    if let Ok(v) = serde_json::from_str::<Value>(content) {
        let arr = if v.is_array() { Some(v) } else { v.get("channels").cloned() };
        if let Some(Value::Array(items)) = arr {
            if let Ok(channels) = serde_json::from_value::<Vec<Channel>>(Value::Array(items)) {
                return channels;
            }
        }
    }
    M3UParser::new().parse_m3u(content)
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async fn health() -> Json<Value> {
    let players: Vec<String> = player::detect().iter().map(|p| p.label().to_string()).collect();
    Json(json!({
        "ok": true,
        "service": "moviera-adapter",
        "adapter_version": env!("CARGO_PKG_VERSION"),
        "backend": "moviebox-tui (MovieBox-TUI core)",
        "players": players,
        "active_providers": ProviderKind::ENABLED.iter().map(|k| k.label().to_string()).collect::<Vec<_>>(),
        "time": unix_ms(),
    }))
}

#[derive(Deserialize)]
struct HomeQuery {
    tab: Option<String>,
    page: Option<usize>,
}

/// Backend homepage rows. `tab` is a MovieBox tab id (e.g. "latest", "trending",
/// "popular"); whatever rows the provider returns are passed through unchanged.
async fn home(
    State(state): State<AppState>,
    Query(q): Query<HomeQuery>,
) -> Result<Json<Value>, ApiError> {
    let tab = match q.tab {
        Some(t) if !t.is_empty() => t,
        _ => "latest".to_string(),
    };
    let page = q.page.unwrap_or(0);
    let (items, metrics) = state
        .service
        .homepage(&tab, page)
        .await
        .map_err(|e| err(StatusCode::BAD_GATEWAY, e))?;
    Ok(Json(json!({ "tab": tab, "page": page, "items": items, "metrics": metrics })))
}

#[derive(Deserialize)]
struct SearchQuery {
    q: String,
    provider: Option<String>,
    page: Option<usize>,
}

/// Search. `provider` may be a specific provider key ("moviebox", "4khdhub",
/// "bdix_circleftp", "bdix_dhakaflix") or "all" to fan out to every enabled
/// MovieBox-TUI provider.
async fn search(
    State(state): State<AppState>,
    Query(q): Query<SearchQuery>,
) -> Result<Json<Value>, ApiError> {
    if q.q.trim().is_empty() {
        return Err(err(StatusCode::BAD_REQUEST, "query is empty"));
    }
    let page = q.page.unwrap_or(0);
    let provider = q
        .provider
        .as_deref()
        .filter(|p| !p.is_empty() && !p.eq_ignore_ascii_case("all"))
        .and_then(ProviderKind::parse);

    match provider {
        Some(kind) => {
            let items = state
                .service
                .search_typed(kind, q.q.trim(), page)
                .await
                .map_err(provider_err)?;
            Ok(Json(json!({ "provider": kind.label(), "items": items })))
        }
        None => {
            let mut items: Vec<Value> = Vec::new();
            let mut failures: Vec<String> = Vec::new();
            for kind in ProviderKind::ENABLED {
                match state.service.search_typed(kind, q.q.trim(), page).await {
                    Ok(found) => items.extend(found.into_iter().map(|i| serde_json::to_value(i).unwrap_or(Value::Null))),
                    Err(e) => failures.push(format!("{}: {e}", kind.label())),
                }
            }
            Ok(Json(json!({
                "provider": "all",
                "items": items,
                "failures": failures,
            })))
        }
    }
}

#[derive(Deserialize)]
struct DetailsQuery {
    subtitles: Option<bool>,
    resource_id: Option<String>,
    sibling_ids: Option<String>,
}

async fn details(
    State(state): State<AppState>,
    AxumPath((provider, id)): AxumPath<(String, String)>,
    Query(q): Query<DetailsQuery>,
) -> Result<Json<Value>, ApiError> {
    let kind = ProviderKind::parse(&provider)
        .ok_or_else(|| err(StatusCode::BAD_REQUEST, format!("unknown provider '{provider}'")))?;
    let details = state
        .service
        .details_typed(kind, &id)
        .await
        .map_err(provider_err)?;

    let mut subtitles: Vec<Value> = Vec::new();
    if q.subtitles.unwrap_or(false) || q.resource_id.is_some() {
        if let Some(rid) = q.resource_id.clone() {
            let sibs: Vec<String> = q
                .sibling_ids
                .map(|s| {
                    s.split(',')
                        .map(|x| x.trim().to_string())
                        .filter(|x| !x.is_empty())
                        .collect()
                })
                .unwrap_or_default();
            if let Ok(subs) = state.service.get_ext_captions(&id, &rid, &sibs).await {
                subtitles = subs.into_iter().map(|s| serde_json::to_value(s).unwrap_or(Value::Null)).collect();
            }
        }
    }

    Ok(Json(json!({ "details": details, "subtitles": subtitles })))
}

#[derive(Deserialize)]
struct StreamsQuery {
    season: Option<usize>,
    episode: Option<usize>,
    resolution: Option<String>,
    page: Option<usize>,
}

/// Playable stream releases for a subject (movies: season/episode = 0).
async fn streams(
    State(state): State<AppState>,
    AxumPath((provider, id)): AxumPath<(String, String)>,
    Query(q): Query<StreamsQuery>,
) -> Result<Json<Value>, ApiError> {
    let kind = ProviderKind::parse(&provider)
        .ok_or_else(|| err(StatusCode::BAD_REQUEST, format!("unknown provider '{provider}'")))?;
    let season = q.season.unwrap_or(0);
    let episode = q.episode.unwrap_or(0);
    let releases = fetch_releases(
        &state,
        kind,
        &id,
        season,
        episode,
        q.resolution.as_deref(),
    )
    .await?;
    Ok(Json(json!({ "releases": releases, "season": season, "episode": episode })))
}

#[derive(Deserialize)]
struct PlayReq {
    provider: Option<String>,
    id: String,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    season: Option<usize>,
    #[serde(default)]
    episode: Option<usize>,
    #[serde(default)]
    resolution: Option<String>,
    #[serde(default)]
    player: Option<String>,
    #[serde(default)]
    auto_launch: Option<bool>,
}

/// Resolve the actual stream (MovieBox-TUI provider resolution) and optionally
/// launch the platform player. The returned `source` is the real playable URL
/// with its required auth headers.
async fn play(State(state): State<AppState>, Json(req): Json<PlayReq>) -> Result<Json<Value>, ApiError> {
    let kind = req
        .provider
        .as_deref()
        .and_then(ProviderKind::parse)
        .unwrap_or(ProviderKind::MovieBox);
    let season = req.season.unwrap_or(1);
    let episode = req.episode.unwrap_or(1);

    let releases = fetch_releases(&state, kind, &req.id, season, episode, req.resolution.as_deref())
        .await?;
    let release = pick_release(&releases, req.resolution.as_deref())
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "no playable streams found for this title"))?;
    let mirror = release
        .mirrors
        .first()
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "release has no playable mirrors"))?;
    let url = mirror.resolver_url.clone();
    let headers: Vec<(String, String)> = mirror.headers.clone();
    let label = if mirror.label.trim().is_empty() {
        release.filename.clone()
    } else {
        format!("{} — {}", release.filename, mirror.label)
    };

    let mut launched = false;
    let mut player_used = String::new();
    let mut launch_note = "auto_launch disabled".to_string();
    if req.auto_launch.unwrap_or(false) {
        let detected = player::detect();
        let kind_choice = req
            .player
            .as_deref()
            .and_then(player::PlayerKind::parse)
            .or_else(|| detected.first().copied())
            .unwrap_or(player::PlayerKind::Mpv);
        let mut cmd = player::command(kind_choice, &url, None, &headers, None, None, None);
        cmd.stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null());
        match cmd.spawn() {
            Ok(_) => {
                launched = true;
                player_used = kind_choice.label().to_string();
            }
            Err(e) => launch_note = format!("could not launch local player: {e}"),
        }
    }

    Ok(Json(json!({
        "source": {
            "provider": kind.label(),
            "url": url,
            "headers": headers,
            "label": label,
            "quality": release.quality,
            "codec": release.codec,
            "size_bytes": release.size_bytes,
            "resource_id": release.resource_id,
        },
        "releases": releases,
        "launched": launched,
        "player": player_used,
        "launch_note": launch_note,
    })))
}

#[derive(Deserialize)]
struct SubtitlesQuery {
    resource_id: String,
    sibling_ids: Option<String>,
}

async fn subtitles(
    State(state): State<AppState>,
    AxumPath((_provider, id)): AxumPath<(String, String)>,
    Query(q): Query<SubtitlesQuery>,
) -> Result<Json<Value>, ApiError> {
    let sibs: Vec<String> = q
        .sibling_ids
        .map(|s| {
            s.split(',')
                .map(|x| x.trim().to_string())
                .filter(|x| !x.is_empty())
                .collect()
        })
        .unwrap_or_default();
    let subs = state
        .service
        .get_ext_captions(&id, &q.resource_id, &sibs)
        .await
        .map_err(|e| err(StatusCode::BAD_GATEWAY, e))?;
    Ok(Json(json!({ "subtitles": subs })))
}

// ---------------------------------------------------------------------------
// Downloads — driven by the MovieBox-TUI download engine (resume + cancel)
// ---------------------------------------------------------------------------

async fn list_downloads(State(state): State<AppState>) -> Json<Value> {
    let tasks = state.tasks.lock().unwrap();
    let list: Vec<Value> = tasks.values().cloned().collect();
    Json(json!({ "downloads": list }))
}

async fn start_download(
    State(state): State<AppState>,
    Json(req): Json<PlayReq>,
) -> Result<Json<Value>, ApiError> {
    let kind = req
        .provider
        .as_deref()
        .and_then(ProviderKind::parse)
        .unwrap_or(ProviderKind::MovieBox);
    let season = req.season.unwrap_or(1);
    let episode = req.episode.unwrap_or(1);

    let releases = fetch_releases(&state, kind, &req.id, season, episode, req.resolution.as_deref())
        .await?;
    let release = pick_release(&releases, req.resolution.as_deref())
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "no downloadable stream found for this title"))?;
    let mirror = release
        .mirrors
        .first()
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "release has no mirrors"))?;
    let url = mirror.resolver_url.clone();

    let cfg = config::load();
    let dir = resolve_download_dir(cfg.download_dir.as_deref().map(Path::new));
    let base = req
        .title
        .clone()
        .filter(|t| !t.trim().is_empty())
        .unwrap_or_else(|| req.id.clone());
    let safe = mb_download::safe_file_stem(&base);
    let filename = if season == 0 || episode == 0 {
        format!("{safe}.mp4")
    } else {
        format!("{safe} S{season:02}E{episode:02}.mp4")
    };
    let dest = dir.join(&filename);

    let id = format!("dl-{}", unix_ms());
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut tasks = state.tasks.lock().unwrap();
        tasks.insert(
            id.clone(),
            json!({
                "id": id,
                "title": base,
                "provider": kind.label(),
                "subject_id": req.id,
                "season": season,
                "episode": episode,
                "filename": filename,
                "url": url,
                "destination": dest.to_string_lossy(),
                "state": "downloading",
                "downloaded": 0,
                "total": Value::Null,
                "bytes_per_second": 0.0,
                "error": Value::Null,
                "started_at": unix_ms(),
            }),
        );
    }
    state
        .cancels
        .lock()
        .unwrap()
        .insert(id.clone(), cancel.clone());

    let http = state.service.http_client().clone();
    let tasks = state.tasks.clone();
    let url_clone = url.clone();
    tokio::spawn(async move {
        let result = mb_download::download(&http, &url_clone, &dest, cancel, move |p: DownloadProgress| {
            let mut t = tasks.lock().unwrap();
            if let Some(v) = t.get_mut(&id) {
                v["downloaded"] = json!(p.downloaded);
                v["total"] = json!(p.total);
                v["bytes_per_second"] = json!(p.bytes_per_second);
                v["attempt"] = json!(p.attempt);
                v["workers"] = json!(p.workers);
            }
        })
        .await;
        let mut t = tasks.lock().unwrap();
        if let Some(v) = t.get_mut(&id) {
            match result {
                Ok(DownloadOutcome::Completed { bytes }) => {
                    v["state"] = json!("completed");
                    v["downloaded"] = json!(bytes);
                }
                Ok(DownloadOutcome::Paused { bytes }) => {
                    v["state"] = json!("canceled");
                    v["downloaded"] = json!(bytes);
                }
                Err(e) => {
                    v["state"] = json!("failed");
                    v["error"] = json!(e.to_string());
                }
            }
        }
    });

    Ok(Json(json!({ "id": id, "destination": dest.to_string_lossy() })))
}

#[derive(Deserialize)]
struct TaskIdQuery {
    id: String,
}

async fn cancel_download(State(state): State<AppState>, Query(q): Query<TaskIdQuery>) -> Result<Json<Value>, ApiError> {
    let found = state
        .cancels
        .lock()
        .unwrap()
        .get(&q.id)
        .map(|c| {
            c.store(true, Ordering::Relaxed);
            true
        })
        .unwrap_or(false);
    if !found {
        return Err(err(StatusCode::NOT_FOUND, "unknown download task"));
    }
    if let Some(v) = state.tasks.lock().unwrap().get_mut(&q.id) {
        v["state"] = json!("canceled");
    }
    Ok(Json(json!({ "id": q.id, "canceled": true })))
}

// ---------------------------------------------------------------------------
// Live TV — channels come from the MovieBox-TUI tv config file (M3U/JSON)
// ---------------------------------------------------------------------------

async fn tv_channels(State(_state): State<AppState>) -> Result<Json<Value>, ApiError> {
    let path = config::tv_path().ok_or_else(|| err(StatusCode::INTERNAL_SERVER_ERROR, "no config directory available"))?;
    if !path.exists() {
        return Ok(Json(json!({ "channels": [], "loaded": false, "file": path.to_string_lossy() })));
    }
    let content = std::fs::read_to_string(&path).map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let channels = parse_tv_content(&content);
    Ok(Json(json!({ "channels": channels, "loaded": !channels.is_empty(), "file": path.to_string_lossy() })))
}

#[derive(Deserialize)]
struct TvLoadReq {
    url: String,
}

/// Download a playlist (M3U/M3U8 or JSON) and store it in the MovieBox-TUI
/// TV config location so both the TUI and the GUI share the same channel list.
async fn tv_load(State(state): State<AppState>, Json(req): Json<TvLoadReq>) -> Result<Json<Value>, ApiError> {
    if req.url.trim().is_empty() {
        return Err(err(StatusCode::BAD_REQUEST, "url is empty"));
    }
    let resp = state
        .service
        .http_client()
        .get(req.url.trim())
        .header("User-Agent", "MovieBox-GUI/1.0")
        .send()
        .await
        .map_err(|e| err(StatusCode::BAD_GATEWAY, format!("playlist download failed: {e}")))?;
    if !resp.status().is_success() {
        return Err(err(
            StatusCode::BAD_GATEWAY,
            format!("playlist download returned HTTP {}", resp.status()),
        ));
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| err(StatusCode::BAD_GATEWAY, e.to_string()))?;
    let content = String::from_utf8_lossy(&bytes).to_string();
    let channels = parse_tv_content(&content);
    if channels.is_empty() {
        return Err(err(StatusCode::UNPROCESSABLE_ENTITY, "no channels found in that playlist"));
    }
    if let Some(path) = config::tv_path() {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        let text = serde_json::to_string_pretty(&channels)
            .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        std::fs::write(&path, text).map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    }
    Ok(Json(json!({ "channels": channels, "count": channels.len() })))
}

// ---------------------------------------------------------------------------
// Addons — MovieBox-TUI addon registry (config::load_addons/save_addons)
// ---------------------------------------------------------------------------

async fn addon_list(State(_state): State<AppState>) -> Json<Value> {
    Json(json!({ "addons": config::load_addons() }))
}

#[derive(Deserialize)]
struct AddonInstallReq {
    url: String,
    #[serde(default)]
    enabled: Option<bool>,
}

async fn addon_install(
    State(state): State<AppState>,
    Json(req): Json<AddonInstallReq>,
) -> Result<Json<Value>, ApiError> {
    if req.url.trim().is_empty() {
        return Err(err(StatusCode::BAD_REQUEST, "url is empty"));
    }
    let manifest_url = AddonClient::normalize_manifest_url(req.url.trim());
    // Validate through the MovieBox-TUI addon client (parses AddonManifest).
    let manifest = state
        .service
        .addon_client
        .fetch_manifest(&manifest_url)
        .await
        .map_err(|e| err(StatusCode::BAD_GATEWAY, format!("invalid addon manifest: {e}")))?;

    // Inspect the raw manifest for resource types (catalog / meta / stream).
    let mut has_catalog = !manifest.catalogs.is_empty();
    let mut has_meta = false;
    let mut has_stream = false;
    let raw_text = match state
        .service
        .http_client()
        .get(&manifest_url)
        .header("User-Agent", "MovieBox-GUI/1.0")
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => resp.text().await.ok(),
        _ => None,
    };
    if let Some(raw) = raw_text {
        if let Ok(v) = serde_json::from_str::<Value>(&raw) {
            if let Some(catalogs) = v.get("catalogs").and_then(|c| c.as_array()) {
                has_catalog = has_catalog || !catalogs.is_empty();
            }
            if let Some(resources) = v.get("resources").and_then(|r| r.as_array()) {
                for r in resources {
                    let t = r.get("type").and_then(|t| t.as_str()).unwrap_or("");
                    if t.eq_ignore_ascii_case("meta") {
                        has_meta = true;
                    }
                    if t.eq_ignore_ascii_case("stream") {
                        has_stream = true;
                    }
                }
            }
        }
    }

    let mut addons = config::load_addons();
    addons.retain(|a| !a.manifest_url.eq_ignore_ascii_case(&manifest_url));
    addons.push(InstalledAddon {
        manifest_url: manifest_url.clone(),
        name: manifest.name.clone(),
        version: manifest.version.clone(),
        description: manifest.description.clone(),
        enabled: req.enabled.unwrap_or(true),
        provides_catalog: has_catalog,
        provides_meta: has_meta,
        provides_stream: has_stream,
        id_prefixes: manifest.id_prefixes.clone(),
        types: manifest.types.clone(),
    });
    config::save_addons(&addons);

    Ok(Json(json!({ "addons": addons })))
}

#[derive(Deserialize)]
struct AddonRemoveQuery {
    url: String,
}

async fn addon_remove(State(_state): State<AppState>, Query(q): Query<AddonRemoveQuery>) -> Result<Json<Value>, ApiError> {
    let mut addons = config::load_addons();
    let before = addons.len();
    addons.retain(|a| !a.manifest_url.eq_ignore_ascii_case(&q.url));
    config::save_addons(&addons);
    Ok(Json(json!({ "removed": before - addons.len(), "addons": addons })))
}

#[derive(Deserialize)]
struct AddonFlagQuery {
    url: String,
    enabled: bool,
}

async fn addon_set_enabled(
    State(_state): State<AppState>,
    Query(q): Query<AddonFlagQuery>,
) -> Result<Json<Value>, ApiError> {
    let mut addons = config::load_addons();
    for a in addons.iter_mut() {
        if a.manifest_url.eq_ignore_ascii_case(&q.url) {
            a.enabled = q.enabled;
        }
    }
    config::save_addons(&addons);
    Ok(Json(json!({ "addons": addons })))
}

/// Raw addon manifest (used by the GUI to discover catalogs/types).
async fn addon_manifest(State(state): State<AppState>, Query(q): Query<AddonRemoveQuery>) -> Result<Json<Value>, ApiError> {
    let manifest_url = AddonClient::normalize_manifest_url(&q.url);
    let resp = state
        .service
        .http_client()
        .get(&manifest_url)
        .header("User-Agent", "MovieBox-GUI/1.0")
        .send()
        .await
        .map_err(|e| err(StatusCode::BAD_GATEWAY, e.to_string()))?;
    let text = resp
        .text()
        .await
        .map_err(|e| err(StatusCode::BAD_GATEWAY, e.to_string()))?;
    let value: Value = serde_json::from_str(&text)
        .map_err(|e| err(StatusCode::UNPROCESSABLE_ENTITY, format!("manifest is not valid JSON: {e}")))?;
    Ok(Json(value))
}

#[derive(Deserialize)]
struct AddonCatalogQuery {
    manifest: String,
    #[serde(rename = "type", default)]
    r#type: String,
    #[serde(default)]
    catalog: String,
}

async fn addon_catalog(
    State(state): State<AppState>,
    Query(q): Query<AddonCatalogQuery>,
) -> Result<Json<Value>, ApiError> {
    let r#type = if q.r#type.is_empty() { "movie".to_string() } else { q.r#type };
    let catalog = if q.catalog.is_empty() { "top".to_string() } else { q.catalog };
    let items = state
        .service
        .fetch_addon_catalog(&q.manifest, &r#type, &catalog)
        .await
        .map_err(|e| err(StatusCode::BAD_GATEWAY, e))?;
    Ok(Json(json!({ "items": items })))
}

#[derive(Deserialize)]
struct AddonSearchQuery {
    manifest: String,
    #[serde(rename = "type", default)]
    r#type: String,
    #[serde(default)]
    catalog: String,
    q: String,
}

async fn addon_search(
    State(state): State<AppState>,
    Query(q): Query<AddonSearchQuery>,
) -> Result<Json<Value>, ApiError> {
    if q.q.trim().is_empty() {
        return Err(err(StatusCode::BAD_REQUEST, "q is empty"));
    }
    let r#type = if q.r#type.is_empty() { "movie".to_string() } else { q.r#type };
    let catalog = if q.catalog.is_empty() { "top".to_string() } else { q.catalog };
    let base = AddonClient::base_addon_url(&q.manifest);
    let items = state
        .service
        .addon_client
        .fetch_catalog_search(&base, &r#type, &catalog, q.q.trim())
        .await
        .map_err(|e| err(StatusCode::BAD_GATEWAY, e))?;
    let value = serde_json::to_value(items).map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(json!({ "items": value })))
}

// ---------------------------------------------------------------------------
// Settings — MovieBox-TUI Config (~/.config/moviebox-tui/config.json)
// ---------------------------------------------------------------------------

async fn settings_get(State(state): State<AppState>) -> Json<Value> {
    let cfg = config::load();
    let players: Vec<String> = player::detect().iter().map(|p| p.label().to_string()).collect();
    let download_dir = resolve_download_dir(cfg.download_dir.as_deref().map(Path::new));
    let mut caps = serde_json::Map::new();
    for k in ProviderKind::ENABLED {
        caps.insert(k.label().to_string(), serde_json::to_value(state.service.capabilities(k)).unwrap_or(Value::Null));
    }
    Json(json!({
        "config": cfg,
        "players": players,
        "download_dir": download_dir.to_string_lossy(),
        "capabilities": Value::Object(caps),
    }))
}

async fn settings_put(State(_state): State<AppState>, Json(body): Json<Value>) -> Result<Json<Value>, ApiError> {
    let mut cfg = config::load();
    if let Some(v) = body.get("auto_update").and_then(|x| x.as_bool()) {
        cfg.auto_update = v;
    }
    if let Some(v) = body.get("active_mode").and_then(|x| x.as_str()) {
        cfg.active_mode = v.to_string();
    }
    if let Some(v) = body.get("active_provider").and_then(|x| x.as_str()) {
        if let Some(kind) = ProviderKind::parse(v) {
            cfg.active_provider = kind;
        }
    }
    if let Some(v) = body.get("active_theme").and_then(|x| x.as_str()) {
        cfg.active_theme = v.to_string();
    }
    if let Some(v) = body.get("bdix_enabled").and_then(|x| x.as_bool()) {
        cfg.bdix_enabled = v;
    }
    if let Some(v) = body.get("streaming_enabled").and_then(|x| x.as_bool()) {
        cfg.streaming_enabled = v;
    }
    if let Some(v) = body.get("tv_enabled").and_then(|x| x.as_bool()) {
        cfg.tv_enabled = v;
    }
    if let Some(v) = body.get("addons_enabled").and_then(|x| x.as_bool()) {
        cfg.addons_enabled = v;
    }
    if let Some(v) = body.get("default_player").and_then(|x| x.as_str()) {
        cfg.default_player = if v.trim().is_empty() { None } else { Some(v.to_string()) };
    }
    if let Some(v) = body.get("download_dir").and_then(|x| x.as_str()) {
        cfg.download_dir = if v.trim().is_empty() { None } else { Some(v.to_string()) };
    }
    config::save(&cfg);
    Ok(Json(json!({ "config": cfg })))
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

pub fn router() -> Router {
    let cors = CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any);

    Router::new()
        .route("/api/health", get(health))
        .route("/api/home", get(home))
        .route("/api/search", get(search))
        .route("/api/details/{provider}/{id}", get(details))
        .route("/api/streams/{provider}/{id}", get(streams))
        .route("/api/play", post(play))
        .route("/api/subtitles/{provider}/{id}", get(subtitles))
        .route("/api/downloads", get(list_downloads))
        .route("/api/downloads/start", post(start_download))
        .route("/api/downloads/cancel", post(cancel_download))
        .route("/api/tv/channels", get(tv_channels))
        .route("/api/tv/load", post(tv_load))
        .route("/api/addons", get(addon_list))
        .route("/api/addons/install", post(addon_install))
        .route("/api/addons/remove", post(addon_remove))
        .route("/api/addons/set-enabled", post(addon_set_enabled))
        .route("/api/addons/manifest", get(addon_manifest))
        .route("/api/addons/catalog", get(addon_catalog))
        .route("/api/addons/search", get(addon_search))
        .route("/api/settings", get(settings_get).put(settings_put))
        .layer(cors)
        .with_state(AppState::default())
}
