import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/app_provider.dart';
import '../tabs/trip_tab.dart';
import '../tabs/expenses_tab.dart';
import '../tabs/todos_tab.dart';
import '../theme/app_theme.dart';
import '../widgets/unlock_dialog.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _tabIndex = 0;

  static const _tabs = [
    (label: 'trip',     icon: Icons.map_outlined,       activeIcon: Icons.map),
    (label: 'expenses', icon: Icons.receipt_outlined,   activeIcon: Icons.receipt),
    (label: 'todos',    icon: Icons.check_box_outlined, activeIcon: Icons.check_box),
  ];

  @override
  Widget build(BuildContext context) {
    final prov = context.watch<AppProvider>();

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        title: Row(
          children: [
            Text(
              'china trip',
              style: TextStyle(
                fontFamily: 'monospace',
                fontSize: 12,
                color: AppColors.textFaint,
                letterSpacing: 0.15,
              ),
            ),
            if (prov.isOffline) ...[
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: AppColors.surface2,
                  borderRadius: BorderRadius.circular(3),
                  border: Border.all(color: AppColors.border),
                ),
                child: Text('offline', style: AppTextStyles.label(size: 9, color: AppColors.textTiny)),
              ),
            ],
          ],
        ),
        actions: [
          // Refresh
          if (prov.loading)
            const Padding(
              padding: EdgeInsets.only(right: 8),
              child: SizedBox(
                width: 16, height: 16,
                child: CircularProgressIndicator(
                  strokeWidth: 1.5,
                  valueColor: AlwaysStoppedAnimation(AppColors.accent),
                ),
              ),
            )
          else
            IconButton(
              icon: const Icon(Icons.refresh, size: 18, color: AppColors.textFaint),
              onPressed: () => prov.refreshAll(),
              tooltip: 'Refresh',
            ),
          // Lock / unlock
          IconButton(
            icon: Icon(
              prov.canWrite ? Icons.lock_open_outlined : Icons.lock_outline,
              size: 18,
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
          ),
          const SizedBox(width: 4),
        ],
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
