import 'booking.dart';

class TripResponse {
  final String today;
  final List<TripItem> timeline;

  const TripResponse({required this.today, required this.timeline});

  factory TripResponse.fromJson(Map<String, dynamic> j) => TripResponse(
    today:    j['today']?.toString() ?? '',
    timeline: (j['timeline'] as List? ?? [])
        .map((i) => TripItem.fromJson(i as Map<String, dynamic>))
        .toList(),
  );

  Map<String, dynamic> toJson() => {
    'today': today,
    'timeline': timeline.map((i) => i.toJson()).toList(),
  };
}

class TripItem {
  final String kind; // 'transit' | 'segment'
  final Booking? booking;
  final TripSegment? segment;

  const TripItem({required this.kind, this.booking, this.segment});

  factory TripItem.fromJson(Map<String, dynamic> j) => TripItem(
    kind:    j['kind']?.toString() ?? 'segment',
    booking: j['booking'] != null ? Booking.fromJson(j['booking'] as Map<String, dynamic>) : null,
    segment: j['segment'] != null ? TripSegment.fromJson(j['segment'] as Map<String, dynamic>) : null,
  );

  Map<String, dynamic> toJson() => {
    'kind': kind,
    if (booking != null) 'booking': booking!.toJson(),
    if (segment != null) 'segment': segment!.toJson(),
  };
}

class TripSegment {
  final String id;
  final String location;
  final int sortOrder;
  final String? startDate;
  final String? endDate;
  final String? displayEndDate;
  final bool isPast;
  final bool isActive;
  final bool missingHotel;
  final bool missingTransportNext;
  final Booking? hotel;
  final List<TripDay> days;
  final List<dynamic> todos;

  const TripSegment({
    required this.id,
    required this.location,
    required this.sortOrder,
    this.startDate,
    this.endDate,
    this.displayEndDate,
    this.isPast = false,
    this.isActive = false,
    this.missingHotel = false,
    this.missingTransportNext = false,
    this.hotel,
    this.days = const [],
    this.todos = const [],
  });

  factory TripSegment.fromJson(Map<String, dynamic> j) => TripSegment(
    id:                   j['id']?.toString() ?? '',
    location:             j['location']?.toString() ?? '',
    sortOrder:            (j['sort_order'] as num?)?.toInt() ?? 0,
    startDate:            j['start_date']?.toString(),
    endDate:              j['end_date']?.toString(),
    displayEndDate:       j['display_end_date']?.toString(),
    isPast:               j['is_past'] as bool? ?? false,
    isActive:             j['is_active'] as bool? ?? false,
    missingHotel:         j['missing_hotel'] as bool? ?? false,
    missingTransportNext: j['missing_transport_next'] as bool? ?? false,
    hotel:                j['hotel'] != null ? Booking.fromJson(j['hotel'] as Map<String, dynamic>) : null,
    days:                 (j['days'] as List? ?? [])
        .map((d) => TripDay.fromJson(d as Map<String, dynamic>))
        .toList(),
    todos: j['todos'] as List? ?? [],
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'location': location,
    'sort_order': sortOrder,
    if (startDate != null) 'start_date': startDate,
    if (endDate != null) 'end_date': endDate,
    if (displayEndDate != null) 'display_end_date': displayEndDate,
    'is_past': isPast,
    'is_active': isActive,
    'missing_hotel': missingHotel,
    'missing_transport_next': missingTransportNext,
    if (hotel != null) 'hotel': hotel!.toJson(),
    'days': days.map((d) => d.toJson()).toList(),
    'todos': todos,
  };
}

class TripDay {
  final String date;
  final bool isToday;
  final List<Booking> otherBookings;
  final TripDayGroup food;
  final TripDayGroup cityTransport;

  const TripDay({
    required this.date,
    this.isToday = false,
    this.otherBookings = const [],
    required this.food,
    required this.cityTransport,
  });

  factory TripDay.fromJson(Map<String, dynamic> j) => TripDay(
    date:          j['date']?.toString() ?? '',
    isToday:       j['is_today'] as bool? ?? false,
    otherBookings: (j['other_bookings'] as List? ?? [])
        .map((b) => Booking.fromJson(b as Map<String, dynamic>))
        .toList(),
    food:          TripDayGroup.fromJson(j['food'] as Map<String, dynamic>? ?? {}),
    cityTransport: TripDayGroup.fromJson(j['city_transport'] as Map<String, dynamic>? ?? {}),
  );

  Map<String, dynamic> toJson() => {
    'date': date,
    'is_today': isToday,
    'other_bookings': otherBookings.map((b) => b.toJson()).toList(),
    'food': food.toJson(),
    'city_transport': cityTransport.toJson(),
  };
}

class TripDayGroup {
  final int count;
  final String summary;
  final List<Booking> items;

  const TripDayGroup({this.count = 0, this.summary = '', this.items = const []});

  factory TripDayGroup.fromJson(Map<String, dynamic> j) => TripDayGroup(
    count:   (j['count'] as num?)?.toInt() ?? 0,
    summary: j['summary']?.toString() ?? '',
    items:   (j['items'] as List? ?? [])
        .map((b) => Booking.fromJson(b as Map<String, dynamic>))
        .toList(),
  );

  Map<String, dynamic> toJson() => {
    'count': count,
    'summary': summary,
    'items': items.map((b) => b.toJson()).toList(),
  };
}
