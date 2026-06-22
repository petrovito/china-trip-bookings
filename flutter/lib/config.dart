// ignore_for_file: constant_identifier_names

const String kApiUrl = String.fromEnvironment(
  'API_URL',
  defaultValue: 'https://china-trip-bookings-production.up.railway.app',
);

const String kFriendName = String.fromEnvironment(
  'FRIEND_NAME',
  defaultValue: 'Friend',
);

const String kCacheVersion = 'v3';

const List<Map<String, String>> kTypes = [
  {'id': 'flight',         'label': 'Flight',    'icon': '✈',  'color': '#0ea5e9'},
  {'id': 'hotel',          'label': 'Hotel',     'icon': '🏨', 'color': '#8b5cf6'},
  {'id': 'train',          'label': 'Train',     'icon': '🚄', 'color': '#10b981'},
  {'id': 'ticket',         'label': 'Ticket',    'icon': '🎟', 'color': '#f97316'},
  {'id': 'food',           'label': 'Food',      'icon': '🍜', 'color': '#e879f9'},
  {'id': 'activity',       'label': 'Activity',  'icon': '📍', 'color': '#fbbf24'},
  {'id': 'city_transport', 'label': 'City',      'icon': '🚇', 'color': '#06b6d4'},
  {'id': 'shopping',       'label': 'Shopping',  'icon': '🛍', 'color': '#84cc16'},
];

const List<String> kExpenseTypes = [
  'flight', 'hotel', 'train', 'ticket', 'food', 'city_transport', 'shopping',
];

const List<String> kPassTypes = [
  'flight', 'train', 'ticket', 'hotel', 'activity', 'city_transport',
];

const List<String> kCurrencies = ['USD', 'CNY', 'EUR', 'KRW', 'VND', 'DKK'];

const List<Map<String, String>> kTodoCats = [
  {'id': 'pack',   'label': 'Pack',   'icon': '🧳'},
  {'id': 'book',   'label': 'Book',   'icon': '📋'},
  {'id': 'docs',   'label': 'Docs',   'icon': '🛂'},
  {'id': 'health', 'label': 'Health', 'icon': '💊'},
  {'id': 'tech',   'label': 'Tech',   'icon': '📱'},
  {'id': 'do',     'label': 'Do',     'icon': '🎯'},
];

const List<Map<String, String>> kCitySubtypes = [
  {'id': 'taxi',  'icon': '🚕', 'label': 'Taxi'},
  {'id': 'bus',   'icon': '🚌', 'label': 'Bus'},
  {'id': 'metro', 'icon': '🚇', 'label': 'Metro'},
  {'id': 'other', 'icon': '🚐', 'label': 'Other'},
];

Map<String, String> typeInfo(String type) =>
    kTypes.firstWhere((t) => t['id'] == type, orElse: () => kTypes[0]);

String typeIcon(String type) => typeInfo(type)['icon'] ?? '●';
String typeLabel(String type) => typeInfo(type)['label'] ?? type;

String fmtPrice(double? price, String? currency) {
  if (price == null) return '—';
  return '${price.toStringAsFixed(2)} ${currency ?? 'USD'}';
}

String fmtDateShort(String? dateStr) {
  if (dateStr == null || dateStr.isEmpty) return '';
  try {
    final d = DateTime.parse(dateStr);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${d.day} ${months[d.month - 1]}';
  } catch (_) { return dateStr; }
}

String fmtDateFull(String? dateStr) {
  if (dateStr == null || dateStr.isEmpty) return '';
  try {
    final d = DateTime.parse(dateStr);
    const weekdays = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${weekdays[d.weekday - 1]}, ${d.day} ${months[d.month - 1]}';
  } catch (_) { return dateStr; }
}

({String subtype, String cleanNotes}) parseSubtype(String? notes) {
  if (notes == null) return (subtype: '', cleanNotes: '');
  final m = RegExp(r'^\[(taxi|bus|metro|other)\] ?(.*)').firstMatch(notes);
  if (m != null) return (subtype: m.group(1)!, cleanNotes: m.group(2) ?? '');
  return (subtype: '', cleanNotes: notes);
}

String amapLink(Map<String, dynamic> b) {
  final lat = b['map_lat'];
  final lng = b['map_lng'];
  final query = b['map_query'] as String?;
  final name = b['name'] as String? ?? '';

  if (lat != null && lng != null) {
    return 'androidamap://viewMap?sourceApplication=china_trip&lat=$lat&lon=$lng&dev=0&name=${Uri.encodeComponent(name)}';
  }
  if (query != null && query.isNotEmpty) {
    return 'androidamap://poi?keywords=${Uri.encodeComponent(query)}&dev=0';
  }
  return '';
}

String webMapsLink(Map<String, dynamic> b) {
  final query = b['map_query'] as String?;
  final lat = b['map_lat'];
  final lng = b['map_lng'];
  if (lat != null && lng != null) {
    return 'https://maps.google.com/?q=$lat,$lng';
  }
  if (query != null && query.isNotEmpty) {
    return 'https://maps.google.com/?q=${Uri.encodeComponent(query)}';
  }
  return '';
}
