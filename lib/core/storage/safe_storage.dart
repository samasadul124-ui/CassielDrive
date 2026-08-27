import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:hive/hive.dart';
import 'package:cassiel_drive/core/constants/app_constants.dart';

/// A crash-proof wrapper around [FlutterSecureStorage].
///
/// On Linux (and headless / CI / freshly installed systems) `flutter_secure_storage`
/// talks to libsecret. If no keyring daemon is running — or the keyring is
/// locked — every call throws `PlatformException(Libsecret error, Failed to
/// unlock the keyring)`. Those exceptions used to bubble up out of
/// `ThemeProvider.initialize()` and the splash screen, which killed the app on
/// first launch.
///
/// [SafeStorage] catches those failures, remembers that the platform keychain
/// is unusable for this session and transparently falls back to the local Hive
/// settings box (and finally to an in-memory map). The app keeps working; it
/// simply stores data less securely, which is surfaced through
/// [isUsingFallback] so the UI can warn the user.
class SafeStorage {
  SafeStorage._internal();

  static final SafeStorage _instance = SafeStorage._internal();

  factory SafeStorage() => _instance;

  static const FlutterSecureStorage _secure = FlutterSecureStorage();
  static const String _fallbackPrefix = 'fallback_';

  final Map<String, String> _memory = <String, String>{};

  bool _secureAvailable = true;
  String? _fallbackReason;

  /// True when the OS keychain could not be used and data is being kept in the
  /// local (unencrypted) Hive box instead.
  bool get isUsingFallback => !_secureAvailable;

  /// Why we fell back, e.g. the libsecret error message. `null` when the
  /// platform keychain works fine.
  String? get fallbackReason => _fallbackReason;

  Box? get _box {
    try {
      if (Hive.isBoxOpen(AppConstants.settingsBox)) {
        return Hive.box(AppConstants.settingsBox);
      }
    } catch (_) {
      // Hive not initialised (unit tests) — fall through to memory.
    }
    return null;
  }

  void _markUnavailable(Object error) {
    if (_secureAvailable) {
      _secureAvailable = false;
      _fallbackReason = error.toString();
      debugPrint(
        'SafeStorage: OS keychain unavailable ($error). '
        'Falling back to local storage for this session.',
      );
    }
  }

  Future<String?> read({required String key}) async {
    if (_secureAvailable) {
      try {
        return await _secure.read(key: key);
      } catch (e) {
        _markUnavailable(e);
      }
    }
    final box = _box;
    if (box != null) {
      final value = box.get('$_fallbackPrefix$key');
      if (value is String) return value;
    }
    return _memory[key];
  }

  Future<void> write({required String key, required String? value}) async {
    if (value == null) {
      await delete(key: key);
      return;
    }
    if (_secureAvailable) {
      try {
        await _secure.write(key: key, value: value);
        return;
      } catch (e) {
        _markUnavailable(e);
      }
    }
    _memory[key] = value;
    try {
      await _box?.put('$_fallbackPrefix$key', value);
    } catch (e) {
      debugPrint('SafeStorage: fallback write failed for $key: $e');
    }
  }

  Future<void> delete({required String key}) async {
    if (_secureAvailable) {
      try {
        await _secure.delete(key: key);
        return;
      } catch (e) {
        _markUnavailable(e);
      }
    }
    _memory.remove(key);
    try {
      await _box?.delete('$_fallbackPrefix$key');
    } catch (e) {
      debugPrint('SafeStorage: fallback delete failed for $key: $e');
    }
  }

  Future<void> deleteAll() async {
    if (_secureAvailable) {
      try {
        await _secure.deleteAll();
        return;
      } catch (e) {
        _markUnavailable(e);
      }
    }
    _memory.clear();
    try {
      final box = _box;
      if (box != null) {
        final keys = box.keys
            .whereType<String>()
            .where((k) => k.startsWith(_fallbackPrefix))
            .toList();
        await box.deleteAll(keys);
      }
    } catch (e) {
      debugPrint('SafeStorage: fallback deleteAll failed: $e');
    }
  }

  /// Probes the platform keychain once at startup so the fallback is decided
  /// before any screen depends on it. Never throws.
  Future<void> probe() async {
    try {
      await _secure.read(key: '__cassiel_probe__');
    } catch (e) {
      _markUnavailable(e);
    }
  }
}
