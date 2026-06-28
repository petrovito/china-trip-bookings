import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/booking.dart';
import '../providers/app_provider.dart';
import '../config.dart';
import '../theme/app_theme.dart';
import 'pass_viewer.dart';
import 'identity_picker.dart';
import 'booking_details_sheet.dart';

class TransitCard extends StatelessWidget {
  final Booking booking;
  const TransitCard({super.key, required this.booking});

  @override
  Widget build(BuildContext context) {
    final prov = context.watch<AppProvider>();
    final b = booking;
    final color = AppColors.typeColor(b.type);
    final icon = typeIcon(b.type);
    final isExpanded = prov.isCardExpanded(b.id);
    final isPast = (b.date ?? '').compareTo(prov.trip?.today ?? '') < 0;
    final allPasses = b.allPasses;
    final myPasses = b.passesFor(prov.identity);
    final showPassBtn = kPassTypes.contains(b.type) &&
        (prov.canWrite || (prov.identity != null && myPasses.isNotEmpty) || allPasses.isNotEmpty);

    final hasDetails = b.reference != null || b.platform != null ||
        b.notes != null || b.price != null || b.time != null ||
        b.origin != null || (b.details?.isNotEmpty ?? false);

    return Opacity(
      opacity: isPast ? 0.45 : 1,
      child: Column(
        children: [
          GestureDetector(
            onTap: hasDetails ? () => prov.toggleCard(b.id) : null,
            child: Container(
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(7),
                border: Border(left: BorderSide(color: color, width: 3)),
              ),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(icon, style: const TextStyle(fontSize: 14)),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(b.name ?? '', style: AppTextStyles.body()),
                      ),
                      if (b.date != null)
                        Text(fmtDateShort(b.date), style: AppTextStyles.mono11(color: AppColors.textTiny)),
                      if (showPassBtn) ...[
                        const SizedBox(width: 6),
                        GestureDetector(
                          onTap: () => _handlePassOpen(context, prov, b),
                          child: Opacity(
                            opacity: myPasses.isNotEmpty ? 1.0 : (allPasses.isNotEmpty ? 0.4 : 0.25),
                            child: const Text('🎫', style: TextStyle(fontSize: 14)),
                          ),
                        ),
                      ],
                      if (hasDetails) ...[
                        const SizedBox(width: 6),
                        Icon(
                          isExpanded ? Icons.keyboard_arrow_up : Icons.keyboard_arrow_down,
                          size: 14, color: AppColors.textTiny,
                        ),
                      ],
                    ],
                  ),
                  if (isExpanded) _ExpandedDetails(booking: b, prov: prov),
                ],
              ),
            ),
          ),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 10),
            child: Icon(Icons.keyboard_arrow_down, size: 12, color: AppColors.border),
          ),
        ],
      ),
    );
  }

  void _handlePassOpen(BuildContext context, AppProvider prov, Booking b) {
    if (prov.identity == null) {
      showModalBottomSheet(
        context: context,
        backgroundColor: Colors.transparent,
        builder: (_) => IdentityPickerSheet(
          onPick: (who) async {
            await prov.setIdentity(who);
            if (!context.mounted) return;
            _openPassViewer(context, prov, b, who);
          },
        ),
      );
      return;
    }
    _openPassViewer(context, prov, b, prov.identity!);
  }

  void _openPassViewer(BuildContext context, AppProvider prov, Booking b, String who) {
    final passes = b.passesFor(who);
    if (passes.isNotEmpty) {
      prov.openPassViewer(b, who);
      showDialog(
        context: context,
        builder: (_) => const PassViewerDialog(),
      );
    } else if (prov.canWrite) {
      prov.showToast('No pass for $who yet — add via MCP', ok: false);
    }
  }
}

class _ExpandedDetails extends StatelessWidget {
  final Booking booking;
  final AppProvider prov;
  const _ExpandedDetails({required this.booking, required this.prov});

  @override
  Widget build(BuildContext context) {
    final b = booking;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Divider(height: 20, color: AppColors.border),
        if (b.time != null)
          _MetaRow(label: 'dep', value: b.timeEnd != null ? '${b.time} → ${b.timeEnd}' : b.time!),
        if (b.origin != null)
          _MetaRow(label: 'from', value: b.origin!),
        if (b.price != null)
          _MetaRow(label: 'cost', value: fmtPrice(b.price, b.currency), highlight: true),
        if (b.reference != null)
          _MetaRow(label: 'ref', value: b.reference!),
        if (b.platform != null)
          _MetaRow(label: 'via', value: b.platform!),
        if (b.notes != null && b.notes!.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(b.notes!, style: AppTextStyles.body(size: 12, color: AppColors.textFaint)),
          ),
        // Details jsonb
        if (b.details != null && b.details!.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Wrap(
              spacing: 6, runSpacing: 6,
              children: b.details!.entries.map((e) => _DetailPill(label: e.key, value: e.value?.toString() ?? '')).toList(),
            ),
          ),
        const SizedBox(height: 8),
        // Action row
        Row(
          children: [
            if (b.details != null && b.details!.isNotEmpty)
              _LinkButton(
                label: 'details',
                onTap: () => showBookingDetails(context, b, prov.showToast),
              ),
            if (b.hasMap) ...[
              const SizedBox(width: 6),
              _LinkButton(
                label: '📍 maps',
                onTap: () async {
                  // Try Amap intent first on Android, fall back to web
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
            ],
            if (b.mapQuery != null) ...[
              const SizedBox(width: 6),
              _LinkButton(
                label: '⎘ copy',
                onTap: () async {
                  await Clipboard.setData(ClipboardData(text: b.mapQuery!));
                  prov.showToast('Address copied');
                },
              ),
            ],
            if (prov.canWrite) ...[
              const Spacer(),
              _ActionButton(
                label: b.settled ? '✓ settled' : 'settle',
                active: b.settled,
                onTap: () => prov.settleBooking(b.id, b.settled),
              ),
              const SizedBox(width: 6),
              _ActionButton(
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
        title: Text('Delete?', style: AppTextStyles.mono12()),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('cancel')),
          TextButton(onPressed: () => Navigator.pop(context, true),
              child: const Text('delete', style: TextStyle(color: AppColors.red))),
        ],
      ),
    );
    if (ok == true) prov.deleteBooking(id);
  }
}

class _MetaRow extends StatelessWidget {
  final String label;
  final String value;
  final bool highlight;
  const _MetaRow({required this.label, required this.value, this.highlight = false});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 36,
            child: Text(label.toUpperCase(), style: AppTextStyles.label(size: 9, color: AppColors.textTiny)),
          ),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              value,
              style: AppTextStyles.mono12(color: highlight ? AppColors.green : AppColors.textMuted),
            ),
          ),
        ],
      ),
    );
  }
}

class _DetailPill extends StatelessWidget {
  final String label;
  final String value;
  const _DetailPill({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final displayLabel = label
        .replaceAll('_peter', ' (P)')
        .replaceAll('_friend', ' (K)')
        .replaceAll('_', ' ');
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: AppColors.surface2,
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(displayLabel, style: AppTextStyles.label(size: 9, color: AppColors.textTiny)),
          const SizedBox(width: 5),
          Text(value, style: AppTextStyles.mono11()),
        ],
      ),
    );
  }
}

class _LinkButton extends StatelessWidget {
  final String label;
  final VoidCallback onTap;
  const _LinkButton({required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          border: Border.all(color: AppColors.border),
          borderRadius: BorderRadius.circular(4),
        ),
        child: Text(label, style: AppTextStyles.mono11(color: AppColors.textFaint)),
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  final String label;
  final VoidCallback onTap;
  final bool active;
  const _ActionButton({required this.label, required this.onTap, this.active = false});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          border: Border.all(color: active ? AppColors.accent.withOpacity(0.5) : AppColors.border),
          borderRadius: BorderRadius.circular(4),
          color: active ? AppColors.accent.withOpacity(0.1) : Colors.transparent,
        ),
        child: Text(
          label,
          style: AppTextStyles.mono11(color: active ? AppColors.accent : AppColors.textFaint),
        ),
      ),
    );
  }
}
