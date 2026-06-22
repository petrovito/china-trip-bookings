import 'package:flutter/material.dart';
import '../config.dart';
import '../theme/app_theme.dart';

class IdentityPickerSheet extends StatelessWidget {
  final void Function(String who) onPick;
  const IdentityPickerSheet({super.key, required this.onPick});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('who are you?', style: AppTextStyles.label(size: 10, color: AppColors.textTiny)),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(child: _PickBtn(who: 'peter', label: 'Peter', onPick: onPick, context: context)),
              const SizedBox(width: 12),
              Expanded(child: _PickBtn(who: 'friend', label: kFriendName, onPick: onPick, context: context)),
            ],
          ),
        ],
      ),
    );
  }
}

class _PickBtn extends StatelessWidget {
  final String who;
  final String label;
  final void Function(String) onPick;
  final BuildContext context;
  const _PickBtn({required this.who, required this.label, required this.onPick, required this.context});

  @override
  Widget build(BuildContext ctx) {
    return GestureDetector(
      onTap: () {
        Navigator.of(context).pop();
        onPick(who);
      },
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: AppColors.surface2,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: AppColors.accent.withOpacity(0.3)),
        ),
        alignment: Alignment.center,
        child: Text(label, style: AppTextStyles.mono13(color: AppColors.accent)),
      ),
    );
  }
}
