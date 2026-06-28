import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/booking.dart';
import '../providers/app_provider.dart';
import '../config.dart';
import '../theme/app_theme.dart';
import 'booking_details_sheet.dart';

class BookingCard extends StatelessWidget {
  final Booking booking;
  const BookingCard({super.key, required this.booking});

  @override
  Widget build(BuildContext context) {
    final prov = context.watch<AppProvider>();
    final b = booking;
    final color = AppColors.typeColor(b.type);
    final isExpanded = prov.isCardExpanded(b.id);
    final dimmed = !b.isPaid;

    return Opacity(
      opacity: dimmed ? 0.55 : 1.0,
      child: Container(
        margin: const EdgeInsets.only(bottom: 6),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(7),
          border: Border(left: BorderSide(color: color, width: 3)),
          boxShadow: b.settled
              ? [BoxShadow(color: AppColors.green.withOpacity(0.08), blurRadius: 8)]
              : null,
        ),
        child: GestureDetector(
          onTap: () => prov.toggleCard(b.id),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // ── Main row ───────────────────────────────────────────
                Row(
                  children: [
                    Text(typeIcon(b.type), style: const TextStyle(fontSize: 14)),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(b.name ?? '', style: AppTextStyles.body(size: 13)),
                          if (b.date != null)
                            Text(fmtDateFull(b.date), style: AppTextStyles.mono11(color: AppColors.textTiny)),
                        ],
                      ),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        if (b.price != null)
                          Text(
                            fmtPrice(b.price, b.currency),
                            style: AppTextStyles.mono11(color: b.settled ? AppColors.green : AppColors.textMuted),
                          ),
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (b.settled)
                              const Text('✓ ', style: TextStyle(fontSize: 10, color: AppColors.green)),
                            if (!b.isPaid)
                              Text('⏳', style: TextStyle(fontSize: 10, color: AppColors.textTiny)),
                            if (b.paidBy != null)
                              Text(
                                b.paidBy == 'peter' ? 'P' : 'K',
                                style: AppTextStyles.mono11(color: AppColors.textTiny),
                              ),
                          ],
                        ),
                      ],
                    ),
                    const SizedBox(width: 6),
                    Icon(
                      isExpanded ? Icons.keyboard_arrow_up : Icons.keyboard_arrow_down,
                      size: 14, color: AppColors.textTiny,
                    ),
                  ],
                ),

                // ── Expanded details ───────────────────────────────────
                if (isExpanded) _ExpandedSection(booking: b, prov: prov),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ExpandedSection extends StatelessWidget {
  final Booking booking;
  final AppProvider prov;
  const _ExpandedSection({required this.booking, required this.prov});

  Future<void> _copyInfo() async {
    final b = booking;
    final lines = <String>[if (b.name != null) b.name!];
    if (b.date != null) lines.add(fmtDateFull(b.date));
    if (b.time != null) lines.add(b.timeEnd != null ? '${b.time} → ${b.timeEnd}' : b.time!);
    if (b.origin != null) lines.add('from: ${b.origin!}');
    if (b.location != null) lines.add('to: ${b.location!}');
    if (b.mapQuery != null) lines.add('📍 ${b.mapQuery!}');
    if (b.reference != null) lines.add('ref: ${b.reference!}');
    if (b.notes != null && b.notes!.isNotEmpty) lines.add(b.notes!);
    await Clipboard.setData(ClipboardData(text: lines.join('\n')));
    prov.showToast('Info copied');
  }

  @override
  Widget build(BuildContext context) {
    final b = booking;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Divider(height: 16, color: AppColors.border),
        if (b.time != null)
          _Row(label: 'time', value: b.timeEnd != null ? '${b.time} → ${b.timeEnd}' : b.time!),
        if (b.origin != null)
          _Row(label: 'from', value: b.origin!),
        if (b.location != null)
          _Row(label: 'to', value: b.location!),
        if (b.travelers != null)
          _Row(label: 'who', value: b.travelers == 'both' ? 'Peter + $kFriendName' : b.travelers!),
        if (b.paidBy != null)
          _Row(label: 'paid', value: b.paidBy == 'peter' ? 'Peter' : kFriendName),
        if (b.platform != null)
          _Row(label: 'via', value: b.platform!),
        if (b.reference != null)
          _Row(label: 'ref', value: b.reference!),
        if (b.notes != null && b.notes!.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 4, bottom: 4),
            child: Text(b.notes!, style: AppTextStyles.body(size: 12, color: AppColors.textFaint)),
          ),
        if (b.details != null && b.details!.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Wrap(
              spacing: 6, runSpacing: 6,
              children: b.details!.entries.map((e) {
                final key = e.key
                    .replaceAll('_peter', ' (P)')
                    .replaceAll('_friend', ' (K)')
                    .replaceAll('_', ' ');
                return _Pill(label: key, value: e.value?.toString() ?? '');
              }).toList(),
            ),
          ),
        const SizedBox(height: 8),
        // Action row — Wrap prevents overflow on narrow screens
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            if (b.details != null && b.details!.isNotEmpty)
              _SmBtn(
                label: 'details',
                onTap: () => showBookingDetails(context, b, prov.showToast),
              ),
            // Copy full booking info (name, date, time, ref, address, notes)
            _SmBtn(
              label: '📋 info',
              onTap: _copyInfo,
            ),
            // Open in maps app
            if (b.hasMap)
              _SmBtn(
                label: '📍 maps',
                onTap: () async {
                  final amap = amapLink(b.toJson());
                  final web = webMapsLink(b.toJson());
                  bool launched = false;
                  if (amap.isNotEmpty) {
                    try {
                      launched = await launchUrl(Uri.parse(amap), mode: LaunchMode.externalApplication);
                    } catch (_) {}
                  }
                  if (!launched && web.isNotEmpty) {
                    await launchUrl(Uri.parse(web), mode: LaunchMode.externalApplication);
                  }
                },
              ),
            // Copy Chinese address for taxi / navigation
            if (b.mapQuery != null)
              _SmBtn(
                label: '⎘ location',
                onTap: () async {
                  await Clipboard.setData(ClipboardData(text: b.mapQuery!));
                  prov.showToast('Address copied');
                },
              ),
            if (prov.canWrite) ...[
              _SmBtn(
                label: b.settled ? '✓ settled' : 'settle',
                accent: b.settled,
                onTap: () => prov.settleBooking(b.id, b.settled),
              ),
              _SmBtn(
                label: 'del',
                onTap: () => _confirmDelete(context, prov, b.id),
              ),
            ],
          ],
        ),
      ],
    );
  }

  Future<void> _confirmDelete(BuildContext context, AppProvider prov, String id) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: AppColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10), side: const BorderSide(color: AppColors.border)),
        title: Text('Delete booking?', style: AppTextStyles.mono12()),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text('cancel', style: AppTextStyles.mono11())),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('delete', style: TextStyle(fontFamily: 'monospace', fontSize: 11, color: AppColors.red)),
          ),
        ],
      ),
    );
    if (ok == true) prov.deleteBooking(id);
  }
}

class _Row extends StatelessWidget {
  final String label;
  final String value;
  const _Row({required this.label, required this.value});

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 4),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 36,
          child: Text(label.toUpperCase(), style: AppTextStyles.label(size: 9, color: AppColors.textTiny)),
        ),
        const SizedBox(width: 6),
        Expanded(child: Text(value, style: AppTextStyles.mono12())),
      ],
    ),
  );
}

class _Pill extends StatelessWidget {
  final String label;
  final String value;
  const _Pill({required this.label, required this.value});

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
    decoration: BoxDecoration(
      color: AppColors.surface2,
      borderRadius: BorderRadius.circular(4),
      border: Border.all(color: AppColors.border),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(label, style: AppTextStyles.label(size: 9, color: AppColors.textTiny)),
        const SizedBox(width: 5),
        Text(value, style: AppTextStyles.mono11()),
      ],
    ),
  );
}

class _SmBtn extends StatelessWidget {
  final String label;
  final VoidCallback onTap;
  final bool accent;
  const _SmBtn({required this.label, required this.onTap, this.accent = false});

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        border: Border.all(color: accent ? AppColors.accent.withOpacity(0.5) : AppColors.border),
        borderRadius: BorderRadius.circular(4),
        color: accent ? AppColors.accent.withOpacity(0.1) : Colors.transparent,
      ),
      child: Text(label, style: AppTextStyles.mono11(color: accent ? AppColors.accent : AppColors.textFaint)),
    ),
  );
}
