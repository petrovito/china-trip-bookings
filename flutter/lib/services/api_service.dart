import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config.dart';
import '../models/booking.dart';
import '../models/trip.dart';
import '../models/todo.dart';
import '../models/summary.dart';

class ApiService {
  final String _base;
  String? _writeToken;

  ApiService({String? base}) : _base = (base ?? kApiUrl).replaceAll(RegExp(r'/$'), '');

  void setWriteToken(String? token) => _writeToken = token;

  Map<String, String> get _headers => {
    'Content-Type': 'application/json',
    if (_writeToken != null && _writeToken!.isNotEmpty)
      'Authorization': 'Bearer $_writeToken',
  };

  // ── Reads ──────────────────────────────────────────────────────────────────

  Future<List<Booking>> fetchBookings() async {
    final res = await http.get(Uri.parse('$_base/api/bookings'));
    _check(res);
    final List<dynamic> list = jsonDecode(res.body) as List<dynamic>;
    return list.map((j) => Booking.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<TripResponse> fetchTrip() async {
    final res = await http.get(Uri.parse('$_base/api/trip'));
    _check(res);
    return TripResponse.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  Future<List<Todo>> fetchTodos() async {
    final res = await http.get(Uri.parse('$_base/api/todos'));
    _check(res);
    final List<dynamic> list = jsonDecode(res.body) as List<dynamic>;
    return list.map((j) => Todo.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<SummaryData> fetchSummary() async {
    final res = await http.get(Uri.parse('$_base/api/summary'));
    _check(res);
    return SummaryData.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  Future<String?> fetchUnsplash(String location) async {
    try {
      final res = await http.get(
        Uri.parse('$_base/api/unsplash?location=${Uri.encodeComponent(location)}'),
      );
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        return data['url']?.toString();
      }
    } catch (_) {}
    return null;
  }

  // ── Todos ─────────────────────────────────────────────────────────────────

  Future<Todo> createTodo(Map<String, dynamic> body) async {
    final res = await http.post(
      Uri.parse('$_base/api/todos'),
      headers: _headers,
      body: jsonEncode(body),
    );
    _checkAuthed(res);
    return Todo.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  Future<void> toggleTodo(String id, bool done) async {
    final res = await http.patch(
      Uri.parse('$_base/api/todos/$id'),
      headers: _headers,
      body: jsonEncode({'done': done}),
    );
    _checkAuthed(res);
  }

  Future<void> updateTodo(String id, Map<String, dynamic> body) async {
    final res = await http.patch(
      Uri.parse('$_base/api/todos/$id'),
      headers: _headers,
      body: jsonEncode(body),
    );
    _checkAuthed(res);
  }

  Future<void> deleteTodo(String id) async {
    final res = await http.delete(Uri.parse('$_base/api/todos/$id'), headers: _headers);
    _checkAuthed(res);
  }

  // ── Bookings ──────────────────────────────────────────────────────────────

  Future<Booking> createBooking(Map<String, dynamic> body) async {
    final res = await http.post(
      Uri.parse('$_base/api/bookings'),
      headers: _headers,
      body: jsonEncode(body),
    );
    _checkAuthed(res);
    return Booking.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  Future<Booking> updateBooking(String id, Map<String, dynamic> patch) async {
    final res = await http.patch(
      Uri.parse('$_base/api/bookings/$id'),
      headers: _headers,
      body: jsonEncode(patch),
    );
    _checkAuthed(res);
    return Booking.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  Future<void> deleteBooking(String id) async {
    final res = await http.delete(Uri.parse('$_base/api/bookings/$id'), headers: _headers);
    _checkAuthed(res);
  }

  Future<Booking> settleBooking(String id, bool settled) async {
    return updateBooking(id, {'settled': settled});
  }

  Future<Booking> updatePasses(String id, List<PassEntry> passes) async {
    return updateBooking(id, {
      'passes': passes.map((p) => p.toJson()).toList(),
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  void _check(http.Response res) {
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw ApiException(res.statusCode, res.body);
    }
  }

  void _checkAuthed(http.Response res) {
    if (res.statusCode == 401) throw UnauthorizedException();
    _check(res);
  }
}

class ApiException implements Exception {
  final int statusCode;
  final String body;
  ApiException(this.statusCode, this.body);
  @override
  String toString() => 'ApiException($statusCode): $body';
}

class UnauthorizedException implements Exception {
  @override
  String toString() => 'Unauthorized — wrong password';
}
