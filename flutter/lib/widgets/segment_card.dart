import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/trip.dart';
import '../models/booking.dart';
import '../models/summary.dart';
import '../providers/app_provider.dart';
import '../config.dart';
import '../theme/app_theme.dart';
import 'booking_details_sheet.dart';

class SegmentCard extends StatefulWidget {
  final TripSegment segment;
  const SegmentCard({super.key, required this.segment});

  @override
  State<SegmentCard> createState() => _SegmentCardState();
}

class _SegmentCardState extends State<SegmentCard> {
  @override
  void initState() {
    super.initState();
    // Kick off Unsplash image fetch
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      context.read<AppProvider>().fetchUnsplashFor(widget.segment.location);
    });
  }

  @override
  Widget build(BuildContext context) {
    final prov = context.watch<AppProvider>();
    final seg = widget.segment;
    final isCollapsed = prov.isGroupCollapsed(seg.id);
    final isExpenseOpen = prov.segmentExpenseOpen == seg.id;
    final imgUrl = prov.locationImages[seg.location];
    final SegmentExpenses? segExp = prov.summary?.bySegment[seg.id];

    return Opacity(
      opacity: seg.isPast ? 0.45 : 1.0,
      child: Container(
        margin: const EdgeInsets.only(bottom: 28),
        decoration: BoxDecoration(
          color: AppColors.surface2,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: seg.isActive
                ? AppColors.accent.withOpacity(0.35)
                : AppColors.border2,
            width: 2,
          ),
        ),
        clipBehavior: Clip.hardEdge,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Hero header ───────────────────────────────────────────────
            GestureDetector(
              onTap: () => prov.toggleGroup(seg.id),
              child: SizedBox(
                height: 88,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    if (imgUrl != null)
                      CachedNetworkImage(
                        imageUrl: imgUrl,
                        fit: BoxFit.cover,
                        errorWidget: (_, __, ___) => const SizedBox.shrink(),
                      ),
                    // Dark overlay
                    Container(color: const Color(0xCC0f1117)),
                    // Content
                    Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: AppColors.accent.withOpacity(0.12),
                                    border: Border.all(color: AppColors.accent.withOpacity(0.22)),
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: Text('stop', style: AppTextStyles.label(size: 9, color: AppColors.accent)),
                                ),
                                const SizedBox(height: 6),
                                Row(
                                  children: [
                                    if (seg.isActive) ...[
                                      Container(
                                        width: 8, height: 8,
                                        decoration: BoxDecoration(
                                          shape: BoxShape.circle,
                                          color: AppColors.accent,
                                          boxShadow: [BoxShadow(color: AppColors.accent.withOpacity(0.6), blurRadius: 6)],
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                    ],
                                    Text(seg.location, style: AppTextStyles.heading(size: 22)),
                                  ],
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  _dateRange(seg),
                                  style: AppTextStyles.mono11(
                                    color: seg.isActive ? AppColors.accent : AppColors.textTiny,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Column(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              GestureDetector(
                                onTap: () => prov.toggleSegmentExpense(seg.id),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                  decoration: BoxDecoration(
                                    color: isExpenseOpen
                                        ? AppColors.accent.withOpacity(0.15)
                                        : Colors.white.withOpacity(0.06),
                                    border: Border.all(
                                      color: isExpenseOpen
                                          ? AppColors.accent.withOpacity(0.3)
                                          : AppColors.border,
                                    ),
                                    borderRadius: BorderRadius.circular(5),
                                  ),
                                  child: Text('¥ costs',
                                    style: AppTextStyles.label(size: 9,
                                      color: isExpenseOpen ? AppColors.accent : AppColors.textTiny)),
                                ),
                              ),
                              const SizedBox(height: 4),
                              Icon(
                                isCollapsed ? Icons.chevron_right : Icons.expand_more,
                                size: 14, color: AppColors.textTiny,
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // ── Expense panel ─────────────────────────────────────────────
            if (isExpenseOpen)
              _SegmentExpensePanel(segId: seg.id, location: seg.location, expenses: segExp),

            // ── Days ──────────────────────────────────────────────────────
            if (!isCollapsed)
              ...seg.days.map((day) => _DayRow(day: day, segId: seg.id)),

            // ── Hotel info ────────────────────────────────────────────────
            if (!isCollapsed && seg.hotel != null)
              _HotelRow(hotel: seg.hotel!),

            // ── Todos ─────────────────────────────────────────────────────
            if (!isCollapsed && seg.todos.isNotEmpty)
              _TodosRow(todos: seg.todos),
          ],
        ),
      ),
    );
  }

  String _dateRange(TripSegment seg) {
    final start = fmtDateShort(seg.startDate);
    final end = fmtDateShort(seg.displayEndDate);
    if (start.isEmpty) return '';
    if (end.isEmpty || start == end) return start;
    return '$start – $end${seg.isActive ? ' · now' : ''}';
  }
}

// ── Expense panel ──────────────────────────────────────────────────────────────

class _SegmentExpensePanel extends StatelessWidget {
  final String segId;
  final String location;
  final SegmentExpenses? expenses;

  const _SegmentExpensePanel({required this.segId, required this.location, required this.expenses});

  @override
  Widget build(BuildContext context) {
    final prov = context.watch<AppProvider>();

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 14),
      decoration: BoxDecoration(
        color: AppColors.accent.withOpacity(0.04),
        border: const Border(top: BorderSide(color: AppColors.border)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('costs · $location', style: AppTextStyles.label(size: 9, color: AppColors.accent)),
              const Spacer(),
            ],
          ),
          const SizedBox(height: 10),
          if (expenses == null)
            Text(
              prov.summaryLoading ? 'loading…' : 'no expenses yet',
              style: AppTextStyles.mono11(color: AppColors.textTiny),
            )
          else
            ..._buildRows(expenses!),
        ],
      ),
    );
  }

  List<Widget> _buildRows(SegmentExpenses segExp) {
    final rows = <Widget>[];
    for (final t in kTypes) {
      final te = segExp.byType[t['id']];
      if (te == null) continue;
      rows.add(Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Row(
          children: [
            Text('${t['icon']} ${t['label']}', style: AppTextStyles.mono11(color: AppColors.textMuted)),
            const Spacer(),
            Text(
              '${te.totalDKK.toStringAsFixed(0)} DKK${te.approx ? ' ~' : ''}',
              style: AppTextStyles.mono11(color: AppColors.textFaint),
            ),
          ],
        ),
      ));
    }
    rows.add(const Divider(color: AppColors.border, height: 16));
    rows.add(Row(
      children: [
        Text('total', style: AppTextStyles.label(size: 10, color: AppColors.textMuted)),
        const Spacer(),
        Text(
          '${segExp.totalDKK.toStringAsFixed(0)} DKK${segExp.approx ? ' ~' : ''}',
          style: AppTextStyles.mono12(color: AppColors.accent),
        ),
      ],
    ));
    return rows;
  }
}

// ── Day row ────────────────────────────────────────────────────────────────────

class _DayRow extends StatelessWidget {
  final TripDay day;
  final String segId;
  const _DayRow({required this.day, required this.segId});

  @override
  Widget build(BuildContext context) {
    final prov = context.watch<AppProvider>();
    final foodKey = '${segId}_food_${day.date}';
    final transitKey = '${segId}_transit_${day.date}';
    final isFoodExpanded    = prov.isFoodDayExpanded(foodKey);
    final isTransitExpanded = prov.isTransitDayExpanded(transitKey);

    return Container(
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 2),
      decoration: BoxDecoration(
        border: Border(
          top: BorderSide(
            color: day.isToday ? AppColors.accent.withOpacity(0.3) : AppColors.border,
          ),
        ),
        color: day.isToday ? AppColors.accent.withOpacity(0.04) : Colors.transparent,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Day header
          Row(
            children: [
              Text(
                fmtDateFull(day.date),
                style: AppTextStyles.mono11(
                  color: day.isToday ? AppColors.accent : AppColors.textFaint,
                ),
              ),
              if (day.isToday) ...[
                const SizedBox(width: 6),
                Container(
                  width: 5, height: 5,
                  decoration: const BoxDecoration(shape: BoxShape.circle, color: AppColors.accent),
                ),
              ],
            ],
          ),
          const SizedBox(height: 6),
          // Other bookings (tickets, activities, etc.)
          ...day.otherBookings.map((b) => _DayBookingRow(booking: b)),
          // Food summary
          if (day.food.count > 0)
            _DayGroupRow(
              icon: '🍜',
              count: day.food.count,
              summary: day.food.summary,
              isExpanded: isFoodExpanded,
              items: day.food.items,
              onToggle: () => prov.toggleFoodDay(foodKey),
            ),
          // City transport
          if (day.cityTransport.count > 0)
            _DayGroupRow(
              icon: '🚇',
              count: day.cityTransport.count,
              summary: day.cityTransport.summary,
              isExpanded: isTransitExpanded,
              items: day.cityTransport.items,
              onToggle: () => prov.toggleTransitDay(transitKey),
            ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}

class _DayBookingRow extends StatelessWidget {
  final Booking booking;
  const _DayBookingRow({required this.booking});

  @override
  Widget build(BuildContext context) {
    final b = booking;
    final color = AppColors.typeColor(b.type);
    return Padding(
      padding: const EdgeInsets.only(bottom: 5),
      child: Row(
        children: [
          Container(width: 3, height: 14, color: color, margin: const EdgeInsets.only(right: 8)),
          Text(typeIcon(b.type), style: const TextStyle(fontSize: 12)),
          const SizedBox(width: 6),
          Expanded(child: Text(b.name ?? '', style: AppTextStyles.body(size: 12))),
          if (b.price != null)
            Text(fmtPrice(b.price, b.currency), style: AppTextStyles.mono11(color: AppColors.green)),
        ],
      ),
    );
  }
}

class _DayGroupRow extends StatelessWidget {
  final String icon;
  final int count;
  final String summary;
  final bool isExpanded;
  final List<Booking> items;
  final VoidCallback onToggle;
  const _DayGroupRow({
    required this.icon, required this.count, required this.summary,
    required this.isExpanded, required this.items, required this.onToggle,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GestureDetector(
          onTap: onToggle,
          child: Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Row(
              children: [
                Text(icon, style: const TextStyle(fontSize: 12)),
                const SizedBox(width: 6),
                Text('$count item${count == 1 ? '' : 's'}', style: AppTextStyles.mono11(color: AppColors.textMuted)),
                const SizedBox(width: 6),
                Text(summary, style: AppTextStyles.mono11(color: AppColors.textTiny)),
                const Spacer(),
                Icon(isExpanded ? Icons.expand_less : Icons.expand_more,
                    size: 14, color: AppColors.textTiny),
              ],
            ),
          ),
        ),
        if (isExpanded)
          ...items.map((b) => Padding(
            padding: const EdgeInsets.only(left: 20, bottom: 3),
            child: Row(
              children: [
                Expanded(child: Text(b.name ?? '', style: AppTextStyles.body(size: 11, color: AppColors.textMuted))),
                if (b.price != null)
                  Text(fmtPrice(b.price, b.currency), style: AppTextStyles.mono11(color: AppColors.textFaint)),
              ],
            ),
          )),
      ],
    );
  }
}

// ── Hotel row ──────────────────────────────────────────────────────────────────

class _HotelRow extends StatelessWidget {
  final Booking hotel;
  const _HotelRow({required this.hotel});

  @override
  Widget build(BuildContext context) {
    final b = hotel;
    final prov = context.read<AppProvider>();
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 0, 12, 12),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppColors.purple.withOpacity(0.08),
        borderRadius: BorderRadius.circular(7),
        border: Border.all(color: AppColors.purple.withOpacity(0.2)),
      ),
      child: Row(
        children: [
          const Text('🏨', style: TextStyle(fontSize: 14)),
          const SizedBox(width: 8),
          Expanded(child: Text(b.name ?? '', style: AppTextStyles.body(size: 12))),
          if (b.details != null && b.details!.isNotEmpty) ...[
            GestureDetector(
              onTap: () => showBookingDetails(context, b, prov.showToast),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                margin: const EdgeInsets.only(left: 6),
                decoration: BoxDecoration(
                  border: Border.all(color: AppColors.border),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text('details', style: AppTextStyles.mono11(color: AppColors.textFaint)),
              ),
            ),
          ],
          if (b.hasMap) ...[
            const SizedBox(width: 6),
            GestureDetector(
              onTap: () async {
                final url = webMapsLink(b.toJson());
                if (url.isNotEmpty) {
                  await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
                }
              },
              child: const Text('📍', style: TextStyle(fontSize: 13)),
            ),
          ],
        ],
      ),
    );
  }
}

// ── Todos row ──────────────────────────────────────────────────────────────────

class _TodosRow extends StatelessWidget {
  final List<dynamic> todos;
  const _TodosRow({required this.todos});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 0, 12, 12),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(7),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('todos', style: AppTextStyles.label(size: 9, color: AppColors.textTiny)),
          const SizedBox(height: 6),
          ...todos.map((t) {
            final done = t['done'] as bool? ?? false;
            final title = t['title']?.toString() ?? '';
            return Padding(
              padding: const EdgeInsets.only(bottom: 3),
              child: Row(
                children: [
                  Icon(done ? Icons.check_box : Icons.check_box_outline_blank,
                      size: 13, color: done ? AppColors.accent : AppColors.border),
                  const SizedBox(width: 6),
                  Expanded(child: Text(title,
                      style: AppTextStyles.body(size: 11,
                          color: done ? AppColors.textTiny : AppColors.textMuted))),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }
}
