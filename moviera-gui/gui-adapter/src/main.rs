use std::net::SocketAddr;

fn main() {
    let port: u16 = std::env::var("MOVIERA_ADAPTER_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8787);
    let host = std::env::var("MOVIERA_ADAPTER_HOST").unwrap_or_else(|_| "127.0.0.1".into());

    let rt = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("failed to start tokio runtime");

    rt.block_on(async {
        let addr: SocketAddr = format!("{host}:{port}")
            .parse()
            .expect("invalid MOVIERA_ADAPTER_HOST:MOVIERA_ADAPTER_PORT");
        let listener = tokio::net::TcpListener::bind(addr)
            .await
            .unwrap_or_else(|e| panic!("failed to bind {addr}: {e}"));
        log::info!(
            "moviera-adapter listening on http://{addr} (backend: moviebox-tui, MovieBox-TUI core)"
        );
        println!("moviera-adapter listening on http://{addr}");
        axum::serve(listener, moviera_adapter::router()).await.expect("server error");
    });
}
