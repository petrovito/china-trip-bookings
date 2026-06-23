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

    return Column(
      children: [
        _FilterBar(),
        // Stats + clear row
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
        // ── Expenses summary (per-person + breakdown) ──
        _ExpensesToggle(),
        // ── Settlement (who owes what) — separate ──
        _SettlementToggle(),
        // ── Booking list ──
        Expanded(
          child: bookings.isEmpty
              ? const Center(
                  child: Text('no bookings',
                      style: TextStyle(
                          fontFamily: 'monospace',
                          fontSize: 12,
                          color: AppColors.textTiny)),
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
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Type chips — horizontal scroll
          SizedBox(
            height: 28,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: EdgeInsets.zero,
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
                      color: selected ? AppColors.typeColor(t['id']!).withOpacity(0.15) : AppColors.surface2,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: selected ? AppColors.typeColor(t['id']!).withOpacity(0.5) : AppColors.border,
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
          const SizedBox(height: 5),
          // Status / traveler / paid-by chips — also use SizedBox+ListView to
          // prevent overflow on small screens
          SizedBox(
            height: 24,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: EdgeInsets.zero,
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
                const _VSep(),
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
                const _VSep(),
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
        color: selected ? AppColors.accent.withOpacity(0.12) : Colors.transparent,
        borderRadius: BorderRadius.circular(4),
        border: Border.all(
          color: selected ? AppColors.accent.withOpacity(0.4) : AppColors.border,
        ),
      ),
      child: Text(label, style: AppTextStyles.mono11(color: selected ? AppColors.accent : AppColors.textFaint)),
    ),
  );
}

class _VSep extends StatelessWidget {
  const _VSep();
  @override
  Widget build(BuildContext context) => Container(
    width: 1,
    height: 14,
    margin: const EdgeInsets.only(left: 4, right: 10),
    color: AppColors.border,
  );
}

// ── Expenses toggle + panel ────────────────────────────────────────────────────

class _ExpensesToggle extends StatefulWidget {
  @override
  State<_ExpensesToggle> createState() => _ExpensesToggleState();
}

class _ExpensesToggleState extends State<_ExpensesToggle> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final prov = context.watch<AppProvider>();
    final summary = prov.summary;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        GestureDetector(
          onTap: () => setState(() => _open = !_open),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            color: AppColors.surface2,
            child: Row(
              children: [
                Text('expenses', style: AppTextStyles.label(size: 10, color: AppColors.textTiny)),
                const Spacer(),
                if (summary != null) ...[
                  Text(
                    'P ${summary.perPerson.peter.totalDKK.toStringAsFixed(0)}'
                    '  •  '
                    '${kFriendName[0]} ${summary.perPerson.friend.totalDKK.toStringAsFixed(0)} DKK',
                    style: AppTextStyles.mono11(color: AppColors.textFaint),
                  ),
                  const SizedBox(width: 6),
                ],
                Icon(_open ? Icons.expand_less : Icons.expand_more,
                    size: 14, color: AppColors.textTiny),
              ],
            ),
          ),
        ),
        if (_open && summary != null) _ExpensesPanel(summary: summary),
      ],
    );
  }
}

class _ExpensesPanel extends StatelessWidget {
  final SummaryData summary;
  const _ExpensesPanel({required this.summary});

  @override
  Widget build(BuildContext context) {
    final s = summary;
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

// ── Settlement toggle + panel ──────────────────────────────────────────────────

class _SettlementToggle extends StatefulWidget {
  @override
  State<_SettlementToggle> createState() => _SettlementToggleState();
}

class _SettlementToggleState extends State<_SettlementToggle> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final prov = context.watch<AppProvider>();
    final summary = prov.summary;
    if (summary == null) return const SizedBox.shrink();

    final settlement = summary.settlement;
    final hasDebt = settlement.netOutstandingDKK.abs() > 0.5;
    final debtLabel = hasDebt
        ? '${settlement.peterOwes ? 'Peter' : kFriendName} owes '
          '${settlement.netOutstandingDKK.abs().toStringAsFixed(0)} DKK'
          '${settlement.approx ? ' ~' : ''}'
        : 'all settled ✓';

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        GestureDetector(
          onTap: () => setState(() => _open = !_open),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            decoration: const BoxDecoration(
              color: AppColors.surface2,
              border: Border(top: BorderSide(color: AppColors.border, width: 0.5)),
            ),
            child: Row(
              children: [
                Text('settlement', style: AppTextStyles.label(size: 10, color: AppColors.textTiny)),
                const Spacer(),
                Text(
                  debtLabel,
                  style: AppTextStyles.mono11(color: hasDebt ? AppColors.accent : AppColors.green),
                ),
                const SizedBox(width: 6),
                Icon(_open ? Icons.expand_less : Icons.expand_more,
                    size: 14, color: AppColors.textTiny),
              ],
            ),
          ),
        ),
        if (_open) _SettlementPanel(summary: summary),
      ],
    );
  }
}

class _SettlementPanel extends StatelessWidget {
  final SummaryData summary;
  const _SettlementPanel({required this.summary});

  @override
  Widget build(BuildContext context) {
    final s = summary.settlement;
    final settled = s.netSettledDKK.abs();
    final outstanding = s.netOutstandingDKK.abs();

    return Container(
      color: AppColors.surface2,
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Divider(color: AppColors.border),
          if (settled > 0.5)
            Padding(
              padding: const EdgeInsets.only(bottom: 5),
              child: Row(
                children: [
                  Text('settled', style: AppTextStyles.mono11(color: AppColors.textMuted)),
                  const Spacer(),
                  Text('${settled.toStringAsFixed(0)} DKK',
                      style: AppTextStyles.mono11(color: AppColors.green)),
                ],
              ),
            ),
          if (outstanding > 0.5)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Row(
                children: [
                  Text('outstanding', style: AppTextStyles.mono11(color: AppColors.textMuted)),
                  const Spacer(),
                  Text(
                    '${outstanding.toStringAsFixed(0)} DKK${s.approx ? ' ~' : ''}',
                    style: AppTextStyles.mono11(color: AppColors.accent),
                  ),
                ],
              ),
            ),
          if (s.byType.isNotEmpty) ...[
            Text('by type', style: AppTextStyles.label(size: 9, color: AppColors.textTiny)),
            const SizedBox(height: 6),
            ...kTypes.where((t) => s.byType.containsKey(t['id'])).map((t) {
              final ts = s.byType[t['id']]!;
              if (ts.outstandingDKK.abs() < 0.5) return const SizedBox.shrink();
              final arrow = ts.peterOwes ? 'P→${kFriendName[0]}' : '${kFriendName[0]}→P';
              return Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Row(
                  children: [
                    Text('${t['icon']} ${t['label']}',
                        style: AppTextStyles.mono11(color: AppColors.textMuted)),
                    const Spacer(),
                    Text(arrow, style: AppTextStyles.label(size: 9, color: AppColors.textTiny)),
                    const SizedBox(width: 6),
                    Text(
                      '${ts.outstandingDKK.abs().toStringAsFixed(0)} DKK${ts.approx ? ' ~' : ''}',
                      style: AppTextStyles.mono11(color: AppColors.textFaint),
                    ),
                  ],
                ),
              );
            }),
          ],
        ],
      ),
    );
  }
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
