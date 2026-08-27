import 'package:flutter/material.dart';
import 'package:cassiel_drive/core/storage/safe_storage.dart';
import 'package:cassiel_drive/core/theme/app_theme.dart';
import 'package:cassiel_drive/core/constants/app_constants.dart';
import 'package:cassiel_drive/widgets/themed_logo.dart';

class ThemeProvider extends ChangeNotifier {
  final SafeStorage _storage = SafeStorage();
  ThemeMode _themeMode = ThemeMode.dark;
  Color _primaryColor = AppColors.cassielBlue;

  ThemeMode get themeMode => _themeMode;
  bool get isDark => _themeMode == ThemeMode.dark;
  Color get primaryColor => _primaryColor;
  LogoVariant get logoVariant =>
      _primaryColor.toARGB32() == AppColors.cassielBlue.toARGB32()
          ? LogoVariant.natural
          : LogoVariant.mono;

  final List<Color> availableColors = [
    AppColors.cassielBlue,
    const Color(0xFFE91E63), // Pink
    const Color(0xFF4CAF50), // Green
  ];

  Future<void> initialize() async {
    try {
      await _initialize();
    } catch (e) {
      // Never let a storage failure block app start-up.
      debugPrint('ThemeProvider.initialize failed: $e');
      notifyListeners();
    }
  }

  Future<void> _initialize() async {
    final stored = await _storage.read(key: AppConstants.themeKey);
    _themeMode = stored == 'light' ? ThemeMode.light : ThemeMode.dark;

    final storedColorStr = await _storage.read(key: 'primary_color');
    if (storedColorStr != null) {
      final parsed = int.tryParse(storedColorStr);
      if (parsed != null) _primaryColor = Color(parsed);
    }

    notifyListeners();
  }

  Future<void> toggleTheme() async {
    _themeMode = _themeMode == ThemeMode.dark ? ThemeMode.light : ThemeMode.dark;
    await _storage.write(
      key: AppConstants.themeKey,
      value: _themeMode == ThemeMode.dark ? 'dark' : 'light',
    );
    notifyListeners();
  }

  Future<void> setTheme(ThemeMode mode) async {
    _themeMode = mode;
    await _storage.write(
      key: AppConstants.themeKey,
      value: mode == ThemeMode.dark ? 'dark' : 'light',
    );
    notifyListeners();
  }

  Future<void> setPrimaryColor(Color color) async {
    _primaryColor = color;
    await _storage.write(
      key: 'primary_color',
      value: color.toARGB32().toString(),
    );
    notifyListeners();
  }
}
