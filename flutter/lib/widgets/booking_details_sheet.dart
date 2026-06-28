import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../models/booking.dart';
import '../config.dart';
import '../theme/app_theme.dart';

void showBookingDetails(
  BuildContext context,
  Booking booking,
  void Function(String) showToast,
) {
  final details = booking.details;
  if (details == null || details.isEmpty) return;
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

  static String _label(String key) => key
      .replaceAll('_peter', ' (P)')
      .replaceAll('_friend', ' (K)')
      .replaceAll('_', ' ');

  @override
  Widget build(BuildContext context) {
    final b = booking;
    final entries = b.details!.entries.toList();

    return DraggableScrollableSheet(
      initialChildSize: 0.45,
      maxChildSize: 0.85,
      minChildSize: 0.2,
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
            Center(
              child: Container(
                margin: const EdgeInsets.only(top: 10, bottom: 12),
                width: 36, height: 3,
                decoration: BoxDecoration(
                  color: AppColors.border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
              child: Row(
                children: [
                  Container(
                    width: 4, height: 14,
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
                      final text = entries
                          .map((e) => '${_label(e.key)}: ${e.value}')
                          .join('\n');
                      await Clipboard.setData(ClipboardData(text: text));
                      showToast('All copied');
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        border: Border.all(color: AppColors.border),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text('copy all', style: AppTextStyles.mono11(color: AppColors.textFaint)),
                    ),
                  ),
                ],
              ),
            ),
            const Divider(height: 1, color: AppColors.border),
            Expanded(
              child: ListView.separated(
                controller: controller,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                itemCount: entries.length,
                separatorBuilder: (_, __) => const Divider(height: 1, color: AppColors.border),
                itemBuilder: (_, i) {
                  final label = _label(entries[i].key);
                  final value = entries[i].value?.toString() ?? '';
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 9),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SizedBox(
                          width: 80,
                          child: Text(
                            label.toUpperCase(),
                            style: AppTextStyles.label(size: 9, color: AppColors.textTiny),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Expanded(
                          child: SelectableText(value, style: AppTextStyles.mono12()),
                        ),
                        const SizedBox(width: 8),
                        GestureDetector(
                          onTap: () async {
                            await Clipboard.setData(ClipboardData(text: value));
                            showToast('$label copied');
                          },
                          child: const Icon(Icons.copy, size: 14, color: AppColors.textTiny),
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
