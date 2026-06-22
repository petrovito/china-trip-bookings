import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../config.dart';

class CacheService {
  static const _prefix = 'ct_cache_$kCacheVersion';

  Future<T?> read<T>(String key, T Function(dynamic) parse) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString('${_prefix}_$key');
      if (raw == null) return null;
      final envelope = jsonDecode(raw) as Map<String, dynamic>;
      if (envelope['v'] != kCacheVersion) return null;
      return parse(envelope['data']);
    } catch (_) {
      return null;
    }
  }

  Future<void> write(String key, dynamic data) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final envelope = jsonEncode({'v': kCacheVersion, 'data': data, 'at': DateTime.now().toIso8601String()});
      await prefs.setString('${_prefix}_$key', envelope);
    } catch (_) {}
  }

  Future<DateTime?> cachedAt(String key) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString('${_prefix}_$key');
      if (raw == null) return null;
      final envelope = jsonDecode(raw) as Map<String, dynamic>;
      final at = envelope['at']?.toString();
      if (at == null) return null;
      return DateTime.tryParse(at);
    } catch (_) {
      return null;
    }
  }

  Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    final keys = prefs.getKeys().where((k) => k.startsWith(_prefix)).toList();
    for (final k in keys) await prefs.remove(k);
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  Future<String?> readWriteToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('ct_wt');
  }

  Future<void> saveWriteToken(String token) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('ct_wt', token);
  }

  Future<void> clearWriteToken() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('ct_wt');
  }

  // ── Identity (peter / friend) ─────────────────────────────────────────────

  Future<String?> readIdentity() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('ct_who');
  }

  Future<void> saveIdentity(String who) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('ct_who', who);
  }

  Future<void> clearIdentity() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('ct_who');
  }

  // ── Misc prefs ────────────────────────────────────────────────────────────

  Future<String?> readActiveTab() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('ct_tab');
  }

  Future<void> saveActiveTab(String tab) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('ct_tab', tab);
  }
}
