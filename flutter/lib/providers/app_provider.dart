import 'dart:async';
import 'package:flutter/foundation.dart';
import '../models/booking.dart';
import '../models/trip.dart';
import '../models/todo.dart';
import '../models/summary.dart';
import '../services/api_service.dart';
import '../services/cache_service.dart';
import '../config.dart';

enum LoadState { idle, loading, loaded, error }

class ToastMessage {
  final String text;
  final bool ok;
  final DateTime at;
  ToastMessage(this.text, {this.ok = true}) : at = DateTime.now();
}

class FilterState {
  final Set<String> types;
  final String settled; // 'all' | 'unsettled' | 'settled'
  final String travelers; // 'all' | 'peter' | 'friend' | 'both'
  final String paidBy;  // 'all' | 'peter' | 'friend' | 'unpaid'

  const FilterState({
    this.types = const {},
    this.settled = 'all',
    this.travelers = 'all',
    this.paidBy = 'all',
  });

  FilterState copyWith({
    Set<String>? types,
    String? settled,
    String? travelers,
    String? paidBy,
  }) => FilterState(
    types:     types     ?? this.types,
    settled:   settled   ?? this.settled,
    travelers: travelers ?? this.travelers,
    paidBy:    paidBy    ?? this.paidBy,
  );

  bool get isDefault => types.isEmpty && settled == 'all' && travelers == 'all' && paidBy == 'all';
}

class AppProvider extends ChangeNotifier {
  final ApiService _api;
  final CacheService _cache;

  AppProvider({ApiService? api, CacheService? cache})
      : _api = api ?? ApiService(),
        _cache = cache ?? CacheService();

  // ── Data ──────────────────────────────────────────────────────────────────
  List<Booking>  _bookings   = [];
  TripResponse?  _trip;
  List<Todo>     _todos      = [];
  SummaryData?   _summary;
  Map<String, String?> _locationImages = {};

  List<Booking>  get bookings => _bookings;
  TripResponse?  get trip     => _trip;
  List<Todo>     get todos    => _todos;
  SummaryData?   get summary  => _summary;
  Map<String, String?> get locationImages => _locationImages;

  // ── Load states ───────────────────────────────────────────────────────────
  LoadState _bookingsState = LoadState.idle;
  LoadState _tripState     = LoadState.idle;
  LoadState _todosState    = LoadState.idle;
  LoadState _summaryState  = LoadState.idle;

  bool get loading => _bookingsState == LoadState.loading
      || _tripState == LoadState.loading
      || _todosState == LoadState.loading;

  bool get summaryLoading => _summaryState == LoadState.loading;

  // Exposed so trip_tab can distinguish "loading first time" vs "offline, no cache"
  LoadState get tripState => _tripState;

  bool get isOffline => _bookingsState == LoadState.error;

  // ── Init done — HomeScreen watches this to show identity picker ───────────
  bool _initDone = false;
  bool get initDone => _initDone;

  // ── Auth ──────────────────────────────────────────────────────────────────
  String _writeToken = '';
  String get writeToken => _writeToken;
  bool get canWrite => _writeToken.isNotEmpty;

  // ── Identity ──────────────────────────────────────────────────────────────
  String? _identity; // 'peter' | 'friend' | null
  String? get identity => _identity;

  // ── Toast ─────────────────────────────────────────────────────────────────
  ToastMessage? _toast;
  ToastMessage? get toast => _toast;
  Timer? _toastTimer;

  void showToast(String msg, {bool ok = true}) {
    _toast = ToastMessage(msg, ok: ok);
    _toastTimer?.cancel();
    _toastTimer = Timer(const Duration(milliseconds: 2800), () {
      _toast = null;
      notifyListeners();
    });
    notifyListeners();
  }

  // ── Filters ───────────────────────────────────────────────────────────────
  FilterState _filters = const FilterState();
  FilterState get filters => _filters;

  void updateFilters(FilterState f) {
    _filters = f;
    notifyListeners();
  }

  void clearFilters() {
    _filters = const FilterState();
    notifyListeners();
  }

  // ── Filtered bookings ─────────────────────────────────────────────────────
  List<Booking> get filteredBookings {
    return _bookings.where((b) {
      if (_filters.types.isNotEmpty && !_filters.types.contains(b.type)) return false;
      if (_filters.settled == 'settled'   && !b.settled) return false;
      if (_filters.settled == 'unsettled' &&  b.settled) return false;
      if (_filters.travelers != 'all' && b.travelers != _filters.travelers) return false;
      if (_filters.paidBy == 'unpaid' && b.isPaid) return false;
      if (_filters.paidBy == 'peter'  && b.paidBy != 'peter')  return false;
      if (_filters.paidBy == 'friend' && b.paidBy != 'friend') return false;
      return true;
    }).toList();
  }

  // ── Expand / collapse state ───────────────────────────────────────────────
  final Set<String> _expandedCards   = {};
  final Set<String> _collapsedGroups = {};
  final Set<String> _expandedFoodDays    = {};
  final Set<String> _expandedTransitDays = {};
  String? _segmentExpenseOpen;

  bool isCardExpanded(String id)   => _expandedCards.contains(id);
  bool isGroupCollapsed(String id) => _collapsedGroups.contains(id);
  bool isFoodDayExpanded(String id)    => _expandedFoodDays.contains(id);
  bool isTransitDayExpanded(String id) => _expandedTransitDays.contains(id);
  String? get segmentExpenseOpen => _segmentExpenseOpen;

  void toggleCard(String id) {
    _expandedCards.contains(id) ? _expandedCards.remove(id) : _expandedCards.add(id);
    notifyListeners();
  }

  void toggleGroup(String id) {
    _collapsedGroups.contains(id) ? _collapsedGroups.remove(id) : _collapsedGroups.add(id);
    notifyListeners();
  }

  void toggleFoodDay(String key) {
    _expandedFoodDays.contains(key) ? _expandedFoodDays.remove(key) : _expandedFoodDays.add(key);
    notifyListeners();
  }

  void toggleTransitDay(String key) {
    _expandedTransitDays.contains(key) ? _expandedTransitDays.remove(key) : _expandedTransitDays.add(key);
    notifyListeners();
  }

  void toggleSegmentExpense(String id) {
    _segmentExpenseOpen = _segmentExpenseOpen == id ? null : id;
    notifyListeners();
  }

  // ── Pass viewer ───────────────────────────────────────────────────────────
  ({String bookingId, String name, List<PassEntry> passes, int idx})? _passViewer;
  ({String bookingId, String name, List<PassEntry> passes, int idx})? get passViewer => _passViewer;

  void openPassViewer(Booking b, String? forWho) {
    final who = forWho ?? _identity;
    if (who == null) return; // caller should show identity picker first
    final passes = b.passesFor(who);
    if (passes.isEmpty) return;
    _passViewer = (bookingId: b.id, name: b.name ?? '', passes: passes, idx: 0);
    notifyListeners();
  }

  void closePassViewer() {
    _passViewer = null;
    notifyListeners();
  }

  void passViewerNext() {
    if (_passViewer == null) return;
    final v = _passViewer!;
    _passViewer = (
      bookingId: v.bookingId,
      name: v.name,
      passes: v.passes,
      idx: (v.idx + 1) % v.passes.length,
    );
    notifyListeners();
  }

  void passViewerPrev() {
    if (_passViewer == null) return;
    final v = _passViewer!;
    _passViewer = (
      bookingId: v.bookingId,
      name: v.name,
      passes: v.passes,
      idx: (v.idx - 1 + v.passes.length) % v.passes.length,
    );
    notifyListeners();
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  Future<void> init() async {
    final token = await _cache.readWriteToken();
    if (token != null && token.isNotEmpty) {
      _writeToken = token;
      _api.setWriteToken(token);
    }
    final who = await _cache.readIdentity();
    if (who != null) _identity = who;
    notifyListeners();

    // Load from cache immediately (shows trip, bookings, todos right away)
    await _loadFromCache();

    // Signal init complete — HomeScreen uses this to auto-show identity picker
    // if no identity was found in cache (i.e. first launch).
    _initDone = true;
    notifyListeners();

    await refreshAll();
  }

  Future<void> _loadFromCache() async {
    final cachedBookings = await _cache.read<List<Booking>>(
      'bookings', (d) => (d as List).map((j) => Booking.fromJson(j as Map<String, dynamic>)).toList(),
    );
    if (cachedBookings != null) { _bookings = cachedBookings; notifyListeners(); }

    final cachedTrip = await _cache.read<TripResponse>(
      'trip', (d) => TripResponse.fromJson(d as Map<String, dynamic>),
    );
    if (cachedTrip != null) { _trip = cachedTrip; notifyListeners(); }

    final cachedTodos = await _cache.read<List<Todo>>(
      'todos', (d) => (d as List).map((j) => Todo.fromJson(j as Map<String, dynamic>)).toList(),
    );
    if (cachedTodos != null) { _todos = cachedTodos; notifyListeners(); }

    final cachedSummary = await _cache.read<SummaryData>(
      'summary', (d) => SummaryData.fromJson(d as Map<String, dynamic>),
    );
    if (cachedSummary != null) { _summary = cachedSummary; notifyListeners(); }
  }

  Future<void> refreshAll() async {
    await Future.wait([
      _fetchBookings(),
      _fetchTrip(),
      _fetchTodos(),
      _fetchSummary(),
    ]);
  }

  Future<void> _fetchBookings() async {
    _bookingsState = LoadState.loading;
    notifyListeners();
    try {
      final data = await _api.fetchBookings();
      _bookings = data;
      _bookingsState = LoadState.loaded;
      await _cache.write('bookings', data.map((b) => b.toJson()).toList());
    } catch (_) {
      _bookingsState = LoadState.error;
    }
    notifyListeners();
  }

  Future<void> _fetchTrip() async {
    _tripState = LoadState.loading;
    notifyListeners();
    try {
      final data = await _api.fetchTrip();
      _trip = data;
      _tripState = LoadState.loaded;
      // Cache trip so next launch shows it immediately (stale-while-revalidate).
      // The isToday/isActive flags may be stale by a day at most before the
      // live fetch corrects them — acceptable trade-off for instant offline display.
      await _cache.write('trip', data.toJson());
    } catch (_) {
      _tripState = LoadState.error;
    }
    notifyListeners();
  }

  Future<void> _fetchTodos() async {
    _todosState = LoadState.loading;
    notifyListeners();
    try {
      final data = await _api.fetchTodos();
      _todos = data;
      _todosState = LoadState.loaded;
      await _cache.write('todos', data.map((t) => t.toJson()).toList());
    } catch (_) {
      _todosState = LoadState.error;
    }
    notifyListeners();
  }

  Future<void> _fetchSummary() async {
    _summaryState = LoadState.loading;
    notifyListeners();
    try {
      final data = await _api.fetchSummary();
      _summary = data;
      _summaryState = LoadState.loaded;
      await _cache.write('summary', null); // summary not cached (has live rates)
    } catch (_) {
      _summaryState = LoadState.error;
    }
    notifyListeners();
  }

  Future<void> fetchUnsplashFor(String location) async {
    if (_locationImages.containsKey(location)) return;
    _locationImages[location] = null; // mark in progress
    final url = await _api.fetchUnsplash(location);
    _locationImages[location] = url;
    notifyListeners();
  }

  // ── Auth actions ──────────────────────────────────────────────────────────

  Future<bool> unlock(String token) async {
    // Verify by making a test write (PATCH with empty body to /api/bookings/test returns 404 not 401)
    final testApi = ApiService(base: _base)..setWriteToken(token);
    try {
      await testApi.updateBooking('00000000-0000-0000-0000-000000000000', {});
    } on UnauthorizedException {
      return false;
    } catch (_) {
      // 404 or other = token is valid, booking just doesn't exist
    }
    _writeToken = token;
    _api.setWriteToken(token);
    await _cache.saveWriteToken(token);
    notifyListeners();
    return true;
  }

  Future<void> lock() async {
    _writeToken = '';
    _api.setWriteToken(null);
    await _cache.clearWriteToken();
    notifyListeners();
  }

  // ── Identity actions ──────────────────────────────────────────────────────

  Future<void> setIdentity(String who) async {
    _identity = who;
    await _cache.saveIdentity(who);
    notifyListeners();
  }

  Future<void> clearIdentity() async {
    _identity = null;
    await _cache.clearIdentity();
    notifyListeners();
  }

  // ── Todo mutations ────────────────────────────────────────────────────────

  Future<void> toggleTodo(Todo t) async {
    // Optimistic update
    _todos = _todos.map((todo) => todo.id == t.id ? todo.copyWith(done: !t.done) : todo).toList();
    notifyListeners();
    try {
      await _api.toggleTodo(t.id, !t.done);
      await _fetchTodos();
    } on UnauthorizedException {
      // Revert
      _todos = _todos.map((todo) => todo.id == t.id ? todo.copyWith(done: t.done) : todo).toList();
      showToast('Wrong password', ok: false);
      notifyListeners();
    } catch (e) {
      showToast('Error: $e', ok: false);
    }
  }

  Future<void> deleteTodo(String id) async {
    try {
      await _api.deleteTodo(id);
      _todos = _todos.where((t) => t.id != id).toList();
      notifyListeners();
      showToast('Todo deleted');
    } on UnauthorizedException {
      showToast('Wrong password', ok: false);
    } catch (e) {
      showToast('Error: $e', ok: false);
    }
  }

  Future<void> createTodo(Map<String, dynamic> body) async {
    try {
      if (body['assignee'] == 'both') {
        await Future.wait([
          _api.createTodo({...body, 'assignee': 'peter'}),
          _api.createTodo({...body, 'assignee': 'friend'}),
        ]);
      } else {
        await _api.createTodo(body);
      }
      await _fetchTodos();
      showToast('Todo added');
    } on UnauthorizedException {
      showToast('Wrong password', ok: false);
    } catch (e) {
      showToast('Error: $e', ok: false);
    }
  }

  // ── Booking mutations ─────────────────────────────────────────────────────

  Future<void> settleBooking(String id, bool currently) async {
    try {
      final updated = await _api.settleBooking(id, !currently);
      _updateBookingInList(updated);
      showToast(!currently ? 'Settled ✓' : 'Unsettled');
    } on UnauthorizedException {
      showToast('Wrong password', ok: false);
    } catch (e) {
      showToast('Error: $e', ok: false);
    }
  }

  Future<void> deleteBooking(String id) async {
    try {
      await _api.deleteBooking(id);
      _bookings = _bookings.where((b) => b.id != id).toList();
      notifyListeners();
      showToast('Deleted');
    } on UnauthorizedException {
      showToast('Wrong password', ok: false);
    } catch (e) {
      showToast('Error: $e', ok: false);
    }
  }

  Future<void> updateBookingPasses(String id, List<PassEntry> passes) async {
    try {
      final updated = await _api.updatePasses(id, passes);
      _updateBookingInList(updated);
      showToast('Pass saved ✓');
    } on UnauthorizedException {
      showToast('Wrong password', ok: false);
    } catch (e) {
      showToast('Error: $e', ok: false);
    }
  }

  void _updateBookingInList(Booking updated) {
    _bookings = _bookings.map((b) => b.id == updated.id ? updated : b).toList();
    notifyListeners();
  }

  String get _base => kApiUrl;

  @override
  void dispose() {
    _toastTimer?.cancel();
    super.dispose();
  }
}
