class Booking {
  final String id;
  final String type;
  final String? name;
  final String? date;
  final String? dateEnd;
  final String? time;
  final String? timeEnd;
  final String? origin;
  final String? location;
  final double? price;
  final String currency;
  final String? platform;
  final String? reference;
  final String? notes;
  final String travelers;
  final String? paidBy;
  final bool settled;
  final String? segmentId;
  final String? passCode;
  final String? passFormat;
  final List<PassEntry> passes;
  final String? mapQuery;
  final double? mapLat;
  final double? mapLng;
  final Map<String, dynamic>? details;

  const Booking({
    required this.id,
    required this.type,
    this.name,
    this.date,
    this.dateEnd,
    this.time,
    this.timeEnd,
    this.origin,
    this.location,
    this.price,
    this.currency = 'USD',
    this.platform,
    this.reference,
    this.notes,
    this.travelers = 'both',
    this.paidBy,
    this.settled = false,
    this.segmentId,
    this.passCode,
    this.passFormat,
    this.passes = const [],
    this.mapQuery,
    this.mapLat,
    this.mapLng,
    this.details,
  });

  factory Booking.fromJson(Map<String, dynamic> j) {
    List<PassEntry> passes = [];
    if (j['passes'] != null && j['passes'] is List) {
      passes = (j['passes'] as List)
          .map((p) => PassEntry.fromJson(p as Map<String, dynamic>))
          .toList();
    }
    return Booking(
      id:         j['id']?.toString() ?? '',
      type:       j['type']?.toString() ?? 'flight',
      name:       j['name']?.toString(),
      date:       j['date']?.toString(),
      dateEnd:    j['date_end']?.toString(),
      time:       j['time']?.toString(),
      timeEnd:    j['time_end']?.toString(),
      origin:     j['origin']?.toString(),
      location:   j['location']?.toString(),
      price:      (j['price'] as num?)?.toDouble(),
      currency:   j['currency']?.toString() ?? 'USD',
      platform:   j['platform']?.toString(),
      reference:  j['reference']?.toString(),
      notes:      j['notes']?.toString(),
      travelers:  j['travelers']?.toString() ?? 'both',
      paidBy:     j['paid_by']?.toString(),
      settled:    j['settled'] as bool? ?? false,
      segmentId:  j['segment_id']?.toString(),
      passCode:   j['pass_code']?.toString(),
      passFormat: j['pass_format']?.toString(),
      passes:     passes,
      mapQuery:   j['map_query']?.toString(),
      mapLat:     (j['map_lat'] as num?)?.toDouble(),
      mapLng:     (j['map_lng'] as num?)?.toDouble(),
      details:    j['details'] is Map ? Map<String, dynamic>.from(j['details'] as Map) : null,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'type': type,
    if (name != null) 'name': name,
    if (date != null) 'date': date,
    if (dateEnd != null) 'date_end': dateEnd,
    if (time != null) 'time': time,
    if (timeEnd != null) 'time_end': timeEnd,
    if (origin != null) 'origin': origin,
    if (location != null) 'location': location,
    if (price != null) 'price': price,
    'currency': currency,
    if (platform != null) 'platform': platform,
    if (reference != null) 'reference': reference,
    if (notes != null) 'notes': notes,
    'travelers': travelers,
    if (paidBy != null) 'paid_by': paidBy,
    'settled': settled,
    if (segmentId != null) 'segment_id': segmentId,
    if (passCode != null) 'pass_code': passCode,
    if (passFormat != null) 'pass_format': passFormat,
    if (passes.isNotEmpty) 'passes': passes.map((p) => p.toJson()).toList(),
    if (mapQuery != null) 'map_query': mapQuery,
    if (mapLat != null) 'map_lat': mapLat,
    if (mapLng != null) 'map_lng': mapLng,
    if (details != null) 'details': details,
  };

  List<PassEntry> get allPasses {
    if (passes.isNotEmpty) return passes;
    if (passCode != null) {
      return [PassEntry(who: 'peter', code: passCode!, format: passFormat)];
    }
    return [];
  }

  List<PassEntry> passesFor(String? who) =>
      allPasses.where((p) => p.who == who).toList();

  bool get hasMap => mapQuery != null || (mapLat != null && mapLng != null);

  bool get isPaid => paidBy != null && paidBy!.isNotEmpty;

  Booking copyWith({
    String? id, String? type, String? name, String? date, String? dateEnd,
    String? time, String? timeEnd, String? origin, String? location,
    double? price, String? currency, String? platform, String? reference,
    String? notes, String? travelers, String? paidBy, bool? settled,
    String? segmentId, String? passCode, String? passFormat,
    List<PassEntry>? passes, String? mapQuery, double? mapLat, double? mapLng,
    Map<String, dynamic>? details,
  }) => Booking(
    id:         id         ?? this.id,
    type:       type       ?? this.type,
    name:       name       ?? this.name,
    date:       date       ?? this.date,
    dateEnd:    dateEnd    ?? this.dateEnd,
    time:       time       ?? this.time,
    timeEnd:    timeEnd    ?? this.timeEnd,
    origin:     origin     ?? this.origin,
    location:   location   ?? this.location,
    price:      price      ?? this.price,
    currency:   currency   ?? this.currency,
    platform:   platform   ?? this.platform,
    reference:  reference  ?? this.reference,
    notes:      notes      ?? this.notes,
    travelers:  travelers  ?? this.travelers,
    paidBy:     paidBy     ?? this.paidBy,
    settled:    settled    ?? this.settled,
    segmentId:  segmentId  ?? this.segmentId,
    passCode:   passCode   ?? this.passCode,
    passFormat: passFormat ?? this.passFormat,
    passes:     passes     ?? this.passes,
    mapQuery:   mapQuery   ?? this.mapQuery,
    mapLat:     mapLat     ?? this.mapLat,
    mapLng:     mapLng     ?? this.mapLng,
    details:    details    ?? this.details,
  );
}

class PassEntry {
  final String who;
  final String code;
  final String? format;

  const PassEntry({required this.who, required this.code, this.format});

  factory PassEntry.fromJson(Map<String, dynamic> j) => PassEntry(
    who:    j['who']?.toString() ?? 'peter',
    code:   j['code']?.toString() ?? '',
    format: j['format']?.toString(),
  );

  Map<String, dynamic> toJson() => {'who': who, 'code': code, if (format != null) 'format': format};
}
