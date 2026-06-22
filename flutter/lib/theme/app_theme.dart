import 'package:flutter/material.dart';

class AppColors {
  static const bg        = Color(0xFF0f1117);
  static const surface   = Color(0xFF151820);
  static const surface2  = Color(0xFF181c27);
  static const border    = Color(0xFF1e2533);
  static const border2   = Color(0xFF252d3d);
  static const accent    = Color(0xFF0ea5e9);
  static const text      = Color(0xFFe2e8f0);
  static const textMuted = Color(0xFF94a3b8);
  static const textFaint = Color(0xFF64748b);
  static const textTiny  = Color(0xFF475569);
  static const green     = Color(0xFF10b981);
  static const red       = Color(0xFFf87171);
  static const purple    = Color(0xFF8b5cf6);
  static const orange    = Color(0xFFf97316);
  static const pink      = Color(0xFFe879f9);
  static const yellow    = Color(0xFFfbbf24);
  static const cyan      = Color(0xFF06b6d4);
  static const lime      = Color(0xFF84cc16);

  static Color typeColor(String type) {
    const map = {
      'flight':         accent,
      'hotel':          purple,
      'train':          green,
      'ticket':         orange,
      'food':           pink,
      'activity':       yellow,
      'city_transport': cyan,
      'shopping':       lime,
    };
    return map[type] ?? textFaint;
  }
}

class AppTextStyles {
  static const mono = TextStyle(fontFamily: 'monospace');

  static TextStyle label({double size = 11, Color color = AppColors.textTiny}) =>
      TextStyle(fontFamily: 'monospace', fontSize: size, color: color,
          letterSpacing: 0.08, fontWeight: FontWeight.w600);

  static TextStyle mono11({Color color = AppColors.textMuted}) =>
      TextStyle(fontFamily: 'monospace', fontSize: 11, color: color);

  static TextStyle mono12({Color color = AppColors.textMuted}) =>
      TextStyle(fontFamily: 'monospace', fontSize: 12, color: color);

  static TextStyle mono13({Color color = AppColors.text}) =>
      TextStyle(fontFamily: 'monospace', fontSize: 13, color: color);

  static TextStyle body({double size = 13.5, Color color = AppColors.text}) =>
      TextStyle(fontSize: size, color: color, height: 1.4);

  static TextStyle heading({double size = 24, Color color = AppColors.text}) =>
      TextStyle(fontSize: size, fontWeight: FontWeight.w700, color: color,
          letterSpacing: -0.01, height: 1.2);
}

ThemeData buildTheme() {
  return ThemeData(
    brightness: Brightness.dark,
    scaffoldBackgroundColor: AppColors.bg,
    colorScheme: const ColorScheme.dark(
      surface: AppColors.surface,
      primary: AppColors.accent,
      secondary: AppColors.accent,
      onSurface: AppColors.text,
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.bg,
      foregroundColor: AppColors.text,
      elevation: 0,
      titleTextStyle: TextStyle(
        fontFamily: 'monospace',
        fontSize: 12,
        letterSpacing: 0.15,
        color: AppColors.textMuted,
        fontWeight: FontWeight.w600,
      ),
    ),
    dividerColor: AppColors.border,
    textTheme: const TextTheme(
      bodyMedium: TextStyle(color: AppColors.text, fontSize: 14),
      bodySmall: TextStyle(color: AppColors.textMuted, fontSize: 12),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.surface2,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(6),
        borderSide: const BorderSide(color: AppColors.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(6),
        borderSide: const BorderSide(color: AppColors.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(6),
        borderSide: const BorderSide(color: AppColors.accent),
      ),
      labelStyle: const TextStyle(color: AppColors.textFaint, fontSize: 12),
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: AppColors.accent,
        foregroundColor: Colors.white,
        textStyle: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w600, fontSize: 12),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
      ),
    ),
    bottomNavigationBarTheme: const BottomNavigationBarThemeData(
      backgroundColor: AppColors.surface,
      selectedItemColor: AppColors.accent,
      unselectedItemColor: AppColors.textFaint,
      selectedLabelStyle: TextStyle(fontFamily: 'monospace', fontSize: 10, fontWeight: FontWeight.w600),
      unselectedLabelStyle: TextStyle(fontFamily: 'monospace', fontSize: 10),
      showUnselectedLabels: true,
      type: BottomNavigationBarType.fixed,
      elevation: 0,
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith((s) =>
          s.contains(WidgetState.selected) ? AppColors.accent : AppColors.textFaint),
      trackColor: WidgetStateProperty.resolveWith((s) =>
          s.contains(WidgetState.selected)
              ? AppColors.accent.withValues(alpha: 0.3)
              : AppColors.border),
    ),
    checkboxTheme: CheckboxThemeData(
      checkColor: WidgetStateProperty.all(Colors.white),
      fillColor: WidgetStateProperty.resolveWith((s) =>
          s.contains(WidgetState.selected) ? AppColors.accent : Colors.transparent),
      side: const BorderSide(color: AppColors.border, width: 1.5),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(3)),
    ),
  );
}
