import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/app_provider.dart';
import '../tabs/trip_tab.dart';
import '../tabs/expenses_tab.dart';
import '../tabs/todos_tab.dart';
import '../theme/app_theme.dart';
import '../widgets/unlock_dialog.dart';
import '../widgets/identity_picker.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _tabIndex = 0;
  bool _pickerShown = false; // guard: only auto-show picker once

  static const _tabs = [
    (label: 'trip',     icon: Icons.map_outlined,       activeIcon: Icons.map),
    (label: 'expenses', icon: Icons.receipt_outlined,   activeIcon: Icons.receipt),
    (label: 'todos',    icon: Icons.check_box_outlined, activeIcon: Icons.check_box),
  ];

  void _showIdentityPicker(AppProvider prov) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      // isDismissible: false on first launch forces a choice;
      // subsequent taps (from the header button) are dismissible
      isDismissible: prov.identity != null,
      builder: (_) => IdentityPickerSheet(onPick: prov.setIdentity),
    );
  }

  @override
  Widget build(BuildContext context) {
    final prov = context.watch<AppProvider>();

    // After init completes, if no identity was saved, auto-show the picker once
    if (prov.initDone && prov.identity == null && !_pickerShown) {
      _pickerShown = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _showIdentityPicker(prov);
      });
    }

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: PreferredSize(
        preferredSize: const Size.fromHeight(36),
        child: AppBar(
          backgroundColor: AppColors.bg,
          toolbarHeight: 36,
          titleSpacing: 12,
          elevation: 0,
          // Title slot: offline badge only (no "china trip" label — wastes space)
          title: prov.isOffline
              ? Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: AppColors.surface2,
                    borderRadius: BorderRadius.circular(3),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Text('offline', style: AppTextStyles.label(size: 9, color: AppColors.textTiny)),
                )
              : null,
          actions: [
            // Refresh spinner / button
            if (prov.loading)
              const Center(
                child: Padding(
                  padding: EdgeInsets.only(right: 10),
                  child: SizedBox(
                    width: 14, height: 14,
                    child: CircularProgressIndicator(
                      strokeWidth: 1.5,
                      valueColor: AlwaysStoppedAnimation(AppColors.accent),
                    ),
                  ),
                ),
              )
            else
              IconButton(
                icon: const Icon(Icons.refresh, size: 16, color: AppColors.textFaint),
                onPressed: prov.refreshAll,
                tooltip: 'Refresh',
                padding: const EdgeInsets.symmetric(horizontal: 6),
                constraints: const BoxConstraints(),
              ),
            // Identity initial — tap to switch
            GestureDetector(
              onTap: () => _showIdentityPicker(prov),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                child: Text(
                  prov.identity == null
                      ? '?'
                      : prov.identity == 'peter'
                          ? 'P'
                          : 'A',
                  style: AppTextStyles.mono11(
                    color: prov.identity != null ? AppColors.accent : AppColors.textTiny,
                  ),
                ),
              ),
            ),
            // Lock / unlock
            IconButton(
              icon: Icon(
                prov.canWrite ? Icons.lock_open_outlined : Icons.lock_outline,
                size: 16,
                color: prov.canWrite ? AppColors.accent : AppColors.textFaint,
              ),
              onPressed: () {
                if (prov.canWrite) {
                  prov.lock();
                } else {
                  showDialog(context: context, builder: (_) => const UnlockDialog());
                }
              },
              tooltip: prov.canWrite ? 'Lock' : 'Unlock',
              padding: const EdgeInsets.symmetric(horizontal: 6),
              constraints: const BoxConstraints(),
            ),
            const SizedBox(width: 4),
          ],
        ),
      ),
      body: Stack(
        children: [
          IndexedStack(
            index: _tabIndex,
            children: const [
              TripTab(),
              ExpensesTab(),
              TodosTab(),
            ],
          ),
          // Toast overlay
          if (prov.toast != null)
            Positioned(
              bottom: 24,
              left: 24,
              right: 24,
              child: _Toast(prov.toast!),
            ),
        ],
      ),
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          border: Border(top: BorderSide(color: AppColors.border, width: 1)),
        ),
        child: BottomNavigationBar(
          currentIndex: _tabIndex,
          onTap: (i) => setState(() => _tabIndex = i),
          items: _tabs.map((t) => BottomNavigationBarItem(
            icon: Icon(t.icon, size: 20),
            activeIcon: Icon(t.activeIcon, size: 20),
            label: t.label,
          )).toList(),
        ),
      ),
    );
  }
}

class _Toast extends StatelessWidget {
  final ToastMessage msg;
  const _Toast(this.msg);

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          color: msg.ok ? const Color(0xFF1a3a2a) : const Color(0xFF3a1a1a),
          border: Border.all(
            color: msg.ok ? AppColors.green.withOpacity(0.5) : AppColors.red.withOpacity(0.5),
          ),
          borderRadius: BorderRadius.circular(8),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.4), blurRadius: 12)],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              msg.ok ? Icons.check_circle_outline : Icons.error_outline,
              size: 14,
              color: msg.ok ? AppColors.green : AppColors.red,
            ),
            const SizedBox(width: 8),
            Flexible(
              child: Text(
                msg.text,
                style: AppTextStyles.mono12(color: msg.ok ? AppColors.green : AppColors.red),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
