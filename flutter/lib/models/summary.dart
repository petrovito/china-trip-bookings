import 'booking.dart';

class SummaryData {
  final Map<String, double> rates;
  final String? ratesAt;
  final ExpenseSection collective;
  final ExpenseSection peter;
  final ExpenseSection friend;
  final PerPersonTotals perPerson;
  final SettlementData settlement;
  final Map<String, SegmentExpenses> bySegment;

  const SummaryData({
    this.rates = const {},
    this.ratesAt,
    required this.collective,
    required this.peter,
    required this.friend,
    required this.perPerson,
    required this.settlement,
    this.bySegment = const {},
  });

  factory SummaryData.fromJson(Map<String, dynamic> j) => SummaryData(
    rates:      (j['rates'] as Map<String, dynamic>? ?? {})
        .map((k, v) => MapEntry(k, (v as num).toDouble())),
    ratesAt:    j['rates_at']?.toString(),
    collective: ExpenseSection.fromJson(j['collective'] as Map<String, dynamic>? ?? {}),
    peter:      ExpenseSection.fromJson(j['peter'] as Map<String, dynamic>? ?? {}),
    friend:     ExpenseSection.fromJson(j['friend'] as Map<String, dynamic>? ?? {}),
    perPerson:  PerPersonTotals.fromJson(j['per_person'] as Map<String, dynamic>? ?? {}),
    settlement: SettlementData.fromJson(j['settlement'] as Map<String, dynamic>? ?? {}),
    bySegment:  (j['by_segment'] as Map<String, dynamic>? ?? {})
        .map((k, v) => MapEntry(k, SegmentExpenses.fromJson(v as Map<String, dynamic>))),
  );
}

class ExpenseSection {
  final Map<String, TypeExpenses> byType;
  final double totalDKK;
  final bool approx;

  const ExpenseSection({this.byType = const {}, this.totalDKK = 0, this.approx = false});

  factory ExpenseSection.fromJson(Map<String, dynamic> j) => ExpenseSection(
    byType:   (j['by_type'] as Map<String, dynamic>? ?? {})
        .map((k, v) => MapEntry(k, TypeExpenses.fromJson(v as Map<String, dynamic>))),
    totalDKK: (j['total_dkk'] as num?)?.toDouble() ?? 0,
    approx:   j['approx'] as bool? ?? false,
  );
}

class TypeExpenses {
  final List<Booking> items;
  final double totalDKK;
  final bool approx;

  const TypeExpenses({this.items = const [], this.totalDKK = 0, this.approx = false});

  factory TypeExpenses.fromJson(Map<String, dynamic> j) => TypeExpenses(
    items:    (j['items'] as List? ?? [])
        .map((b) => Booking.fromJson(b as Map<String, dynamic>))
        .toList(),
    totalDKK: (j['total_dkk'] as num?)?.toDouble() ?? 0,
    approx:   j['approx'] as bool? ?? false,
  );
}

class PerPersonTotals {
  final DKKAmount peter;
  final DKKAmount friend;

  const PerPersonTotals({required this.peter, required this.friend});

  factory PerPersonTotals.fromJson(Map<String, dynamic> j) => PerPersonTotals(
    peter:  DKKAmount.fromJson(j['peter'] as Map<String, dynamic>? ?? {}),
    friend: DKKAmount.fromJson(j['friend'] as Map<String, dynamic>? ?? {}),
  );
}

class DKKAmount {
  final double totalDKK;
  final bool approx;

  const DKKAmount({this.totalDKK = 0, this.approx = false});

  factory DKKAmount.fromJson(Map<String, dynamic> j) => DKKAmount(
    totalDKK: (j['total_dkk'] as num?)?.toDouble() ?? 0,
    approx:   j['approx'] as bool? ?? false,
  );
}

class SettlementData {
  final double netOutstandingDKK;
  final double netSettledDKK;
  final bool peterOwes;
  final bool friendOwes;
  final bool approx;
  final Map<String, TypeSettlement> byType;

  const SettlementData({
    this.netOutstandingDKK = 0,
    this.netSettledDKK = 0,
    this.peterOwes = false,
    this.friendOwes = false,
    this.approx = false,
    this.byType = const {},
  });

  factory SettlementData.fromJson(Map<String, dynamic> j) => SettlementData(
    netOutstandingDKK: (j['net_outstanding_dkk'] as num?)?.toDouble() ?? 0,
    netSettledDKK:     (j['net_settled_dkk'] as num?)?.toDouble() ?? 0,
    peterOwes:         j['peter_owes'] as bool? ?? false,
    friendOwes:        j['friend_owes'] as bool? ?? false,
    approx:            j['approx'] as bool? ?? false,
    byType:            (j['by_type'] as Map<String, dynamic>? ?? {})
        .map((k, v) => MapEntry(k, TypeSettlement.fromJson(v as Map<String, dynamic>))),
  );
}

class TypeSettlement {
  final List<Booking> items;
  final double outstandingDKK;
  final double settledDKK;
  final bool peterOwes;
  final bool friendOwes;
  final bool approx;

  const TypeSettlement({
    this.items = const [],
    this.outstandingDKK = 0,
    this.settledDKK = 0,
    this.peterOwes = false,
    this.friendOwes = false,
    this.approx = false,
  });

  factory TypeSettlement.fromJson(Map<String, dynamic> j) => TypeSettlement(
    items:          (j['items'] as List? ?? [])
        .map((b) => Booking.fromJson(b as Map<String, dynamic>))
        .toList(),
    outstandingDKK: (j['outstanding_dkk'] as num?)?.toDouble() ?? 0,
    settledDKK:     (j['settled_dkk'] as num?)?.toDouble() ?? 0,
    peterOwes:      j['peter_owes'] as bool? ?? false,
    friendOwes:     j['friend_owes'] as bool? ?? false,
    approx:         j['approx'] as bool? ?? false,
  );
}

class SegmentExpenses {
  final Map<String, DKKAmount> byType;
  final double totalDKK;
  final bool approx;

  const SegmentExpenses({this.byType = const {}, this.totalDKK = 0, this.approx = false});

  factory SegmentExpenses.fromJson(Map<String, dynamic> j) => SegmentExpenses(
    byType:   (j['by_type'] as Map<String, dynamic>? ?? {})
        .map((k, v) => MapEntry(k, DKKAmount.fromJson(v as Map<String, dynamic>))),
    totalDKK: (j['total_dkk'] as num?)?.toDouble() ?? 0,
    approx:   j['approx'] as bool? ?? false,
  );
}
