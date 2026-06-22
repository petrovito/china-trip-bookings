import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/app_provider.dart';
import '../theme/app_theme.dart';

class UnlockDialog extends StatefulWidget {
  const UnlockDialog({super.key});

  @override
  State<UnlockDialog> createState() => _UnlockDialogState();
}

class _UnlockDialogState extends State<UnlockDialog> {
  final _ctrl = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final token = _ctrl.text.trim();
    if (token.isEmpty) return;
    setState(() { _loading = true; _error = null; });
    final ok = await context.read<AppProvider>().unlock(token);
    if (!mounted) return;
    if (ok) {
      Navigator.of(context).pop();
    } else {
      setState(() { _loading = false; _error = 'Wrong password'; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: AppColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(10),
        side: const BorderSide(color: AppColors.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('unlock', style: AppTextStyles.label(size: 10, color: AppColors.textTiny)),
            const SizedBox(height: 12),
            TextField(
              controller: _ctrl,
              obscureText: true,
              autofocus: true,
              style: AppTextStyles.mono13(),
              decoration: InputDecoration(
                hintText: 'password',
                hintStyle: AppTextStyles.mono12(color: AppColors.textTiny),
                errorText: _error,
              ),
              onSubmitted: (_) => _submit(),
            ),
            const SizedBox(height: 12),
            ElevatedButton(
              onPressed: _loading ? null : _submit,
              child: _loading
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('unlock'),
            ),
          ],
        ),
      ),
    );
  }
}
