import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/booking.dart';
import '../models/summary.dart';
import '../providers/app_provider.dart';
import '../config.dart';
import '../theme/app_theme.dart';
import '../widgets/booking_card.dart';

class ExpensesTab extends StatelessWidget {
  const ExpensesTab({super.key});

  @override
  Widget build(BuildContext context) {
    final prov = context.watch<AppProvider>();
    final bookings = prov.filteredBookings;
    final total = bookings.fold<double>(0, (sum, b) => sum + (b.price ?? 0));

    return Column(
      children: [
        _FilterBar(),
        // Stats row
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          color: AppColors.bg,
          child: Row(
            children: [
              Text('${bookings.length} items',
                  style: AppTextStyles.mono11(color: AppColors.textTiny)),
              const Spacer(),
              if (!prov.filters.isDefault)
                GestureDetector(
                  onTap: prov.clearFilters,
                  child: Text('clear filters',
                      style: AppTextStyles.mono11(color: AppColors.accent)),
                ),
            ],
          ),
        ),
        // Summary panel toggle
        _SummaryToggle(),
        // List
        Expanded(
          child: bookings.isEmpty
              ? const Center(
                  child: Text('no bookings',
                      style: TextStyle(fontFamily: 'monospace', fontSize: 12, color: AppColors.textTiny)),
                )
              : RefreshIndicator(
                  color: AppColors.accent,
                  backgroundColor: AppColors.surface,
                  onRefresh: prov.refreshAll,
                  child: _GroupedList(bookings: bookings),
                ),
        ),
      ],
    );
  }
}

// ── Filter bar ─────────────────────────────────────────────────────────────────

class _FilterBar extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final prov = context.watch<AppProvider>();
    final f = prov.filters;

    return Container(
      color: AppColors.surface,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Type chips
          SizedBox(
            height: 28,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: kTypes.map((t) {
                final selected = f.types.contains(t['id']);
                return GestureDetector(
                  onTap: () {
                    final types = Set<String>.from(f.types);
                    selected ? types.remove(t['id']) : types.add(t['id']!);
                    prov.updateFilters(f.copyWith(types: types));
                  },
                  child: Container(
                    margin: const EdgeInsets.only(right: 6),
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: selected ? AppColors.typeColor(t['id']!).withValues(alpha: 0.15) : AppColors.surface2,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: selected ? AppColors.typeColor(t['id']!).withValues(alpha: 0.5) : AppColors.border,
                      ),
                    ),
                    child: Text(
                      '${t['icon']} ${t['label']}',
                      style: AppTextStyles.mono11(
                        color: selected ? AppColors.typeColor(t['id']!) : AppColors.textFaint,
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 6),
          // Status filters
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _FilterChip(
                  label: 'all',
                  selected: f.settled == 'all',
                  onTap: () => prov.updateFilters(f.copyWith(settled: 'all')),
                ),
                _FilterChip(
                  label: 'unsettled',
                  selected: f.settled == 'unsettled',
                  onTap: () => prov.updateFilters(f.copyWith(settled: 'unsettled')),
                ),
                _FilterChip(
                  label: 'settled',
                  selected: f.settled == 'settled',
                  onTap: () => prov.updateFilters(f.copyWith(settled: 'settled')),
                ),
                const SizedBox(width: 12),
                _FilterChip(
                  label: 'both',
                  selected: f.travelers == 'all',
                  onTap: () => prov.updateFilters(f.copyWith(travelers: 'all')),
                ),
                _FilterChip(
                  label: 'peter',
                  selected: f.travelers == 'peter',
                  onTap: () => prov.updateFilters(f.copyWith(travelers: 'peter')),
                ),
                _FilterChip(
                  label: kFriendName.toLowerCase(),
                  selected: f.travelers == 'friend',
                  onTap: () => prov.updateFilters(f.copyWith(travelers: 'friend')),
                ),
                const SizedBox(width: 12),
                _FilterChip(
                  label: 'unpaid',
                  selected: f.paidBy == 'unpaid',
                  onTap: () => prov.updateFilters(f.copyWith(paidBy: f.paidBy == 'unpaid' ? 'all' : 'unpaid')),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _FilterChip({required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Container(
      margin: const EdgeInsets.only(right: 6),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: selected ? AppColors.accent.withValues(alpha: 0.12) : Colors.transparent,
        borderRadius: BorderRadius.circular(4),
        border: Border.all(
          color: selected ? AppColors.accent.withValues(alpha: 0.4) : AppColors.border,
        ),
      ),
      child: Text(label, style: AppTextStyles.mono11(color: selected ? AppColors.accent : AppColors.textFaint)),
    ),
  );
}

// ── Summary toggle + panel ─────────────────────────────────────────────────────

class _SummaryToggle extends StatefulWidget {
  @override
  State<_SummaryToggle> createState() => _SummaryToggleState();
}

class _SummaryToggleState extends State<_SummaryToggle> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final prov = context.watch<AppProvider>();
    final summary = prov.summary;

    return Column(
      children: [
        GestureDetector(
          onTap: () => setState(() => _open = !_open),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            color: AppColors.surface2,
            child: Row(
              children: [
                Text('summary', style: AppTextStyles.label(size: 10, color: AppColors.textTiny)),
                const Spacer(),
                if (summary != null) ...[
                  Text(
                    '${summary.perPerson.peter.totalDKK.toStringAsFixed(0)} / ${summary.perPerson.friend.totalDKK.toStringAsFixed(0)} DKK',
                    style: AppTextStyles.mono11(color: AppColors.textFaint),
                  ),
                  const SizedBox(width: 8),
                ],
                Icon(_open ? Icons.expand_less : Icons.expand_more,
                    size: 14, color: AppColors.textTiny),
              ],
            ),
          ),
        ),
        if (_open && summary != null) _SummaryPanel(summary: summary),
      ],
    );
  }
}

class _SummaryPanel extends StatelessWidget {
  final SummaryData summary;
  const _SummaryPanel({required this.summary});

  @override
  Widget build(BuildContext context) {
    final s = summary;
    final settlement = s.settlement;

    return Container(
      color: AppColors.surface2,
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Divider(color: AppColors.border),
          Row(
            children: [
              _PersonTotal(name: 'Peter', amount: s.perPerson.peter.totalDKK, approx: s.perPerson.peter.approx),
              const SizedBox(width: 24),
              _PersonTotal(name: kFriendName, amount: s.perPerson.friend.totalDKK, approx: s.perPerson.friend.approx),
            ],
          ),
          const SizedBox(height: 12),
          if (settlement.netOutstandingDKK.abs() > 0.5) ...[
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppColors.accent.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(6),
                border: Border.all(color: AppColors.accent.withValues(alpha: 0.2)),
              ),
              child: Row(
                children: [
                  Text('settlement', style: AppTextStyles.label(size: 9, color: AppColors.textTiny)),
                  const Spacer(),
                  Text(
                    '${settlement.peterOwes ? 'Peter' : kFriendName} owes '
                    '${settlement.netOutstandingDKK.abs().toStringAsFixed(0)} DKK'
                    '${settlement.approx ? ' ~' : ''}',
                    style: AppTextStyles.mono11(color: AppColors.accent),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 10),
          ],
          Text('breakdown', style: AppTextStyles.label(size: 9, color: AppColors.textTiny)),
          const SizedBox(height: 8),
          ...kTypes.where((t) => s.collective.byType.containsKey(t['id'])).map((t) {
            final te = s.collective.byType[t['id']];
            if (te == null) return const SizedBox.shrink();
            return Padding(
              padding: const EdgeInsets.only(bottom: 5),
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
            );
          }),
          const Divider(color: AppColors.border, height: 16),
          Row(
            children: [
              const Spacer(),
              Text(
                '${(s.collective.totalDKK + s.peter.totalDKK + s.friend.totalDKK).toStringAsFixed(0)} DKK total',
                style: AppTextStyles.mono12(color: AppColors.accent),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _PersonTotal extends StatelessWidget {
  final String name;
  final double amount;
  final bool approx;
  const _PersonTotal({required this.name, required this.amount, required this.approx});

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(name, style: AppTextStyles.mono11(color: AppColors.textTiny)),
      Text(
        '${amount.toStringAsFixed(0)} DKK${approx ? ' ~' : ''}',
        style: AppTextStyles.mono13(color: AppColors.text),
      ),
    ],
  );
}

// ── Grouped list ───────────────────────────────────────────────────────────────

class _GroupedList extends StatelessWidget {
  final List<Booking> bookings;
  const _GroupedList({required this.bookings});

  @override
  Widget build(BuildContext context) {
    final groups = <String, List<Booking>>{};
    for (final b in bookings) {
      final key = b.date ?? 'undated';
      groups.putIfAbsent(key, () => []).add(b);
    }
    final sortedKeys = groups.keys.toList()..sort();

    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 100),
      itemCount: sortedKeys.length,
      itemBuilder: (_, i) {
        final date = sortedKeys[i];
        final items = groups[date]!;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text(
                date == 'undated' ? 'UNDATED' : fmtDateFull(date).toUpperCase(),
                style: AppTextStyles.label(size: 9, color: AppColors.textTiny),
              ),
            ),
            ...items.map((b) => BookingCard(booking: b)),
          ],
        );
      },
    );
  }
}
