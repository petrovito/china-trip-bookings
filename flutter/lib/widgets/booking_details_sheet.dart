import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../models/booking.dart';
import '../config.dart';
import '../theme/app_theme.dart';

/// Opens a scrollable bottom sheet listing every non-null field of [booking]
/// with per-field copy buttons and a "copy all" header action.
void showBookingDetails(
  BuildContext context,
  Booking booking,
  void Function(String) showToast,
) {
  showModalBottomSheet(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (_) => _BookingDetailsSheet(booking: booking, showToast: showToast),
  );
}

class _BookingDetailsSheet extends StatelessWidget {
  final Booking booking;
  final void Function(String) showToast;
  const _BookingDetailsSheet({required this.booking, required this.showToast});

  @override
  Widget build(BuildContext context) {
    final b = booking;
    final fields = <(String, String)>[];

    void add(String label, String? value) {
      if (value != null && value.isNotEmpty) fields.add((label, value));
    }

    add('id', b.id);
    add('type', b.type);
    add('name', b.name);
    if (b.date != null) {
      add('date', b.dateEnd != null ? '${b.date} → ${b.dateEnd}' : b.date!);
    }
    if (b.time != null) {
      add('time', b.timeEnd != null ? '${b.time} → ${b.timeEnd}' : b.time!);
    }
    add('from', b.origin);
    add('to', b.location);
    if (b.price != null) add('price', fmtPrice(b.price, b.currency));
    add('platform', b.platform);
    add('ref', b.reference);
    add('notes', b.notes);
    add('who', b.travelers == 'both'
        ? 'Peter + $kFriendName'
        : b.travelers == 'friend'
            ? kFriendName
            : 'Peter');
    if (b.paidBy != null && b.paidBy!.isNotEmpty) {
      add('paid', b.paidBy == 'peter' ? 'Peter' : kFriendName);
    }
    if (b.settled) add('settled', 'yes');
    add('segment', b.segmentId);
    add('map', b.mapQuery);
    if (b.mapLat != null && b.mapLng != null) {
      add('coords', '${b.mapLat}, ${b.mapLng}');
    }
    if (b.details != null) {
      for (final e in b.details!.entries) {
        final key = e.key
            .replaceAll('_peter', ' (P)')
            .replaceAll('_friend', ' (K)')
            .replaceAll('_', ' ');
        add(key, e.value?.toString());
      }
    }
    for (final p in b.allPasses) {
      add('pass (${p.who == 'peter' ? 'P' : 'K'})', p.code);
    }

    return DraggableScrollableSheet(
      initialChildSize: 0.55,
      maxChildSize: 0.92,
      minChildSize: 0.25,
      builder: (_, controller) => Container(
        decoration: const BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.vertical(top: Radius.circular(12)),
          border: Border(
            top: BorderSide(color: AppColors.border),
            left: BorderSide(color: AppColors.border),
            right: BorderSide(color: AppColors.border),
          ),
        ),
        child: Column(
          children: [
            // Drag handle
            Center(
              child: Container(
                margin: const EdgeInsets.only(top: 10, bottom: 12),
                width: 36,
                height: 3,
                decoration: BoxDecoration(
                  color: AppColors.border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            // Header
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
              child: Row(
                children: [
                  Container(
                    width: 4,
                    height: 14,
                    margin: const EdgeInsets.only(right: 8),
                    color: AppColors.typeColor(b.type),
                  ),
                  Text(typeIcon(b.type), style: const TextStyle(fontSize: 14)),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      b.name ?? '',
                      style: AppTextStyles.body(size: 13),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: 8),
                  GestureDetector(
                    onTap: () async {
                      final text =
                          fields.map((f) => '${f.$1}: ${f.$2}').join('\n');
                      await Clipboard.setData(ClipboardData(text: text));
                      showToast('All copied');
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        border: Border.all(color: AppColors.border),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        'copy all',
                        style: AppTextStyles.mono11(color: AppColors.textFaint),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const Divider(height: 1, color: AppColors.border),
            // Field rows
            Expanded(
              child: ListView.separated(
                controller: controller,
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                itemCount: fields.length,
                separatorBuilder: (_, __) =>
                    const Divider(height: 1, color: AppColors.border),
                itemBuilder: (_, i) {
                  final label = fields[i].$1;
                  final value = fields[i].$2;
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 9),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SizedBox(
                          width: 72,
                          child: Text(
                            label.toUpperCase(),
                            style: AppTextStyles.label(
                                size: 9, color: AppColors.textTiny),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Expanded(
                          child: SelectableText(
                            value,
                            style: AppTextStyles.mono12(),
                          ),
                        ),
                        const SizedBox(width: 8),
                        GestureDetector(
                          onTap: () async {
                            await Clipboard.setData(
                                ClipboardData(text: value));
                            showToast('$label copied');
                          },
                          child: const Icon(
                            Icons.copy,
                            size: 14,
                            color: AppColors.textTiny,
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
