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
  final Map<String, GlobalKey> _dayKeys = {};
  GlobalKey? _todayKey;

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  void _scrollToToday() {
    if (_todayKey?.currentContext != null) {
      Scrollable.ensureVisible(
        _todayKey!.currentContext!,
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
            ? const Center(
                child: Text('LOADING…',
                    style: TextStyle(fontFamily: 'monospace', fontSize: 12, color: AppColors.border, letterSpacing: 0.1)),
              )
            : trip.timeline.isEmpty
                ? const Center(
                    child: Text('NO BOOKINGS YET',
                        style: TextStyle(fontFamily: 'monospace', fontSize: 12, color: AppColors.border, letterSpacing: 0.1)),
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
                  boxShadow: [BoxShadow(color: AppColors.accent.withOpacity(0.45), blurRadius: 12)],
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 6, height: 6,
                      decoration: const BoxDecoration(shape: BoxShape.circle, color: Colors.white),
                    ),
                    const SizedBox(width: 6),
                    const Text('today',
                        style: TextStyle(fontFamily: 'monospace', fontSize: 11, fontWeight: FontWeight.w600,
                            color: Colors.white, letterSpacing: 0.08)),
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
    final widgets = <Widget>[];

    for (final item in timeline) {
      if (item.kind == 'transit') {
        final b = item.booking!;
        final isToday = b.date == today;
        final key = GlobalKey();
        if (isToday) _todayKey = key;
        widgets.add(KeyedSubtree(key: key, child: TransitCard(booking: b)));
      } else {
        final seg = item.segment!;
        for (final day in seg.days) {
          if (day.isToday) {
            final key = GlobalKey();
            _todayKey = key;
            _dayKeys[day.date] = key;
          }
        }
        if (seg.isActive && _todayKey == null) {
          final key = GlobalKey();
          _todayKey = key;
          widgets.add(KeyedSubtree(key: key, child: SegmentCard(segment: seg)));
          continue;
        }
        widgets.add(SegmentCard(segment: seg));
      }
    }

    return ListView(
      controller: _scroll,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
      children: widgets,
    );
  }
}
