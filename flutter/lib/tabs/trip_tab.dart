import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/trip.dart';
import '../providers/app_provider.dart';
import '../theme/app_theme.dart';
import '../widgets/transit_card.dart';
import '../widgets/segment_card.dart';

class TripTab extends StatefulWidget {
  const TripTab({super.key});

  @override
  State<TripTab> createState() => _TripTabState();
}

class _TripTabState extends State<TripTab> {
  final ScrollController _scroll = ScrollController();
  String? _todayKeyObj;
  bool _pastCollapsed = true;

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  void _scrollToToday() {
    if (_todayKeyObj == null) return;
    final ctx = GlobalObjectKey(_todayKeyObj!).currentContext;
    if (ctx != null) {
      Scrollable.ensureVisible(
        ctx,
        duration: const Duration(milliseconds: 400),
        curve: Curves.easeInOut,
        alignment: 0.1,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final prov = context.watch<AppProvider>();
    final trip = prov.trip;

    return Stack(
      children: [
        trip == null
            ? Center(
                child: prov.tripState == LoadState.error
                    ? Column(
                        mainAxisSize: MainAxisSize.min,
                        children: const [
                          Icon(Icons.wifi_off, size: 24, color: AppColors.border),
                          SizedBox(height: 8),
                          Text('OFFLINE — NO CACHED DATA',
                              style: TextStyle(
                                  fontFamily: 'monospace',
                                  fontSize: 11,
                                  color: AppColors.textTiny,
                                  letterSpacing: 0.1)),
                        ],
                      )
                    : const Text('LOADING…',
                        style: TextStyle(
                            fontFamily: 'monospace',
                            fontSize: 12,
                            color: AppColors.border,
                            letterSpacing: 0.1)),
              )
            : trip.timeline.isEmpty
                ? const Center(
                    child: Text('NO BOOKINGS YET',
                        style: TextStyle(
                            fontFamily: 'monospace',
                            fontSize: 12,
                            color: AppColors.border,
                            letterSpacing: 0.1)),
                  )
                : RefreshIndicator(
                    color: AppColors.accent,
                    backgroundColor: AppColors.surface,
                    onRefresh: prov.refreshAll,
                    child: _buildTimeline(prov, trip.timeline),
                  ),

        // Today FAB
        if (trip != null && trip.timeline.isNotEmpty)
          Positioned(
            bottom: 20,
            right: 16,
            child: GestureDetector(
              onTap: _scrollToToday,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                decoration: BoxDecoration(
                  color: AppColors.accent,
                  borderRadius: BorderRadius.circular(20),
                  boxShadow: [
                    BoxShadow(color: AppColors.accent.withOpacity(0.45), blurRadius: 12)
                  ],
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 6, height: 6,
                      decoration: const BoxDecoration(
                          shape: BoxShape.circle, color: Colors.white),
                    ),
                    const SizedBox(width: 6),
                    const Text('today',
                        style: TextStyle(
                            fontFamily: 'monospace',
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: Colors.white,
                            letterSpacing: 0.08)),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildTimeline(AppProvider prov, List<TripItem> timeline) {
    final today = prov.trip?.today ?? '';
    _todayKeyObj = null;

    // Partition into past vs live (current + future).
    // Only partition when we know today (avoids misclassifying on stale cache).
    final pastItems = <TripItem>[];
    final liveItems = <TripItem>[];

    for (final item in timeline) {
      bool isPast;
      if (today.isEmpty) {
        isPast = false; // unknown date — don't hide anything
      } else if (item.kind == 'transit') {
        final d = item.booking?.date ?? '';
        isPast = d.isNotEmpty && d.compareTo(today) < 0;
      } else {
        isPast = item.segment?.isPast ?? false;
      }
      isPast ? pastItems.add(item) : liveItems.add(item);
    }

    final widgets = <Widget>[];

    // ── Past section ───────────────────────────────────────────────────────
    if (pastItems.isNotEmpty) {
      final segCount = pastItems.where((i) => i.kind == 'segment').length;
      final firstDate = _itemDate(pastItems.first);
      final lastDate  = _itemDate(pastItems.last);
      final range = '${_shortDate(firstDate)} – ${_shortDate(lastDate)}';

      widgets.add(_PastBar(
        segmentCount: segCount,
        dateRange: range,
        collapsed: _pastCollapsed,
        onToggle: () => setState(() => _pastCollapsed = !_pastCollapsed),
      ));

      if (!_pastCollapsed) {
        for (final item in pastItems) {
          final child = item.kind == 'transit'
              ? TransitCard(booking: item.booking!)
              : SegmentCard(segment: item.segment!);
          widgets.add(Opacity(opacity: 0.45, child: child));
        }
        // Divider before live content
        widgets.add(const Padding(
          padding: EdgeInsets.only(bottom: 16),
          child: Divider(color: AppColors.border, height: 1),
        ));
      }
    }

    // ── Live items (current + future) ──────────────────────────────────────
    for (final item in liveItems) {
      if (item.kind == 'transit') {
        final b = item.booking!;
        final keyObj = 'transit_${b.id}';
        if (b.date == today && _todayKeyObj == null) _todayKeyObj = keyObj;
        widgets.add(KeyedSubtree(
          key: GlobalObjectKey(keyObj),
          child: TransitCard(booking: b),
        ));
      } else {
        final seg = item.segment!;
        final keyObj = 'seg_${seg.id}';
        final hasToday = seg.days.any((d) => d.isToday) ||
            (seg.isActive && today.isNotEmpty);
        if (hasToday && _todayKeyObj == null) _todayKeyObj = keyObj;
        widgets.add(KeyedSubtree(
          key: GlobalObjectKey(keyObj),
          child: SegmentCard(segment: seg),
        ));
      }
    }

    // Use SingleChildScrollView + Column (NOT ListView) so that ALL items are
    // rendered eagerly. ListView is lazy — off-screen items have no build
    // context, making GlobalObjectKey.currentContext null → today scroll fails
    // until the target scrolls into view on its own. The trip has ~20-30 items
    // at most so eager rendering has no meaningful cost.
    return SingleChildScrollView(
      controller: _scroll,
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: widgets,
      ),
    );
  }

  String _itemDate(TripItem item) {
    if (item.kind == 'transit') return item.booking?.date ?? '';
    return item.segment?.startDate ?? item.segment?.endDate ?? '';
  }

  String _shortDate(String date) {
    if (date.isEmpty) return '';
    try {
      final d = DateTime.parse(date);
      const months = [
        'Jan','Feb','Mar','Apr','May','Jun',
        'Jul','Aug','Sep','Oct','Nov','Dec'
      ];
      return '${months[d.month - 1]} ${d.day}';
    } catch (_) {
      return date;
    }
  }
}

// ── Past-section collapse bar ──────────────────────────────────────────────────

class _PastBar extends StatelessWidget {
  final int segmentCount;
  final String dateRange;
  final bool collapsed;
  final VoidCallback onToggle;

  const _PastBar({
    required this.segmentCount,
    required this.dateRange,
    required this.collapsed,
    required this.onToggle,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onToggle,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(7),
          border: Border.all(color: AppColors.border),
        ),
        child: Row(
          children: [
            Icon(
              collapsed ? Icons.history : Icons.keyboard_arrow_up,
              size: 13,
              color: AppColors.textTiny,
            ),
            const SizedBox(width: 8),
            Text(
              'past',
              style: AppTextStyles.label(size: 9, color: AppColors.textTiny),
            ),
            const SizedBox(width: 10),
            Text(
              collapsed
                  ? '$segmentCount stop${segmentCount != 1 ? 's' : ''}  ·  $dateRange'
                  : dateRange,
              style: AppTextStyles.mono11(color: AppColors.textFaint),
            ),
            const Spacer(),
            Icon(
              collapsed ? Icons.expand_more : Icons.expand_less,
              size: 14,
              color: AppColors.textTiny,
            ),
          ],
        ),
      ),
    );
  }
}
