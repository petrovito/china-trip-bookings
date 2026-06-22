import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../providers/app_provider.dart';
import '../models/booking.dart';
import '../theme/app_theme.dart';

class PassViewerDialog extends StatelessWidget {
  const PassViewerDialog({super.key});

  @override
  Widget build(BuildContext context) {
    final prov = context.watch<AppProvider>();
    final v = prov.passViewer;
    if (v == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => Navigator.of(context).pop());
      return const SizedBox.shrink();
    }
    final pass = v.passes[v.idx];

    return Dialog(
      backgroundColor: AppColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: const BorderSide(color: AppColors.border),
      ),
      insetPadding: const EdgeInsets.all(24),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Header
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(v.name, style: AppTextStyles.body(size: 14)),
                      Text(pass.who, style: AppTextStyles.mono11(color: AppColors.textTiny)),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close, size: 18, color: AppColors.textFaint),
                  onPressed: () { prov.closePassViewer(); Navigator.of(context).pop(); },
                ),
              ],
            ),
            const SizedBox(height: 16),
            // QR / barcode
            Container(
              color: Colors.white,
              padding: const EdgeInsets.all(12),
              child: _PassImage(pass: pass),
            ),
            const SizedBox(height: 12),
            // Code text
            Text(
              pass.code,
              style: AppTextStyles.mono11(color: AppColors.textMuted),
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            if (v.passes.length > 1) ...[
              const SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  IconButton(
                    icon: const Icon(Icons.chevron_left, color: AppColors.textMuted),
                    onPressed: prov.passViewerPrev,
                  ),
                  Text('${v.idx + 1} / ${v.passes.length}',
                      style: AppTextStyles.mono11(color: AppColors.textTiny)),
                  IconButton(
                    icon: const Icon(Icons.chevron_right, color: AppColors.textMuted),
                    onPressed: prov.passViewerNext,
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _PassImage extends StatelessWidget {
  final PassEntry pass;
  const _PassImage({required this.pass});

  @override
  Widget build(BuildContext context) {
    // Use QR for QR_CODE format or when format is unknown
    final format = pass.format?.toUpperCase() ?? '';
    final isQr = format == 'QR_CODE' || format == 'AZTEC' || format.isEmpty;

    if (isQr) {
      return QrImageView(
        data: pass.code,
        version: QrVersions.auto,
        size: 240,
        backgroundColor: Colors.white,
        eyeStyle: const QrEyeStyle(eyeShape: QrEyeShape.square, color: Colors.black),
        dataModuleStyle: const QrDataModuleStyle(dataModuleShape: QrDataModuleShape.square, color: Colors.black),
      );
    }

    // Linear barcode formats — show as text with a note
    // Full barcode rendering would need a native plugin; QR is the common case
    return Column(
      children: [
        const Icon(Icons.barcode_reader, size: 48, color: Colors.black54),
        const SizedBox(height: 8),
        Text(
          pass.code,
          style: const TextStyle(fontFamily: 'monospace', fontSize: 11, color: Colors.black87),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 4),
        Text(
          format,
          style: const TextStyle(fontFamily: 'monospace', fontSize: 9, color: Colors.black54),
        ),
      ],
    );
  }
}
