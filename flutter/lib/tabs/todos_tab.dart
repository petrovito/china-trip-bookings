import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/todo.dart';
import '../providers/app_provider.dart';
import '../config.dart';
import '../theme/app_theme.dart';

class TodosTab extends StatefulWidget {
  const TodosTab({super.key});

  @override
  State<TodosTab> createState() => _TodosTabState();
}

class _TodosTabState extends State<TodosTab> {
  String _catFilter      = 'all';
  String _assigneeFilter = 'all';
  bool   _showDone       = true;
  bool   _showForm       = false;

  // Form state
  final _titleCtrl = TextEditingController();
  String _formCat      = 'pack';
  String _formAssignee = 'both';

  @override
  void dispose() {
    _titleCtrl.dispose();
    super.dispose();
  }

  List<Todo> _filtered(List<Todo> todos) {
    return todos.where((t) {
      if (!_showDone && t.done) return false;
      if (_catFilter != 'all' && t.category != _catFilter) return false;
      if (_assigneeFilter != 'all') {
        if (_assigneeFilter == 'both' && t.assignee != 'both') return false;
        if (_assigneeFilter == 'peter' && t.assignee != 'peter') return false;
        if (_assigneeFilter == 'friend' && t.assignee != 'friend') return false;
      }
      return true;
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final prov = context.watch<AppProvider>();
    final todos = _filtered(prov.todos);

    // Group by category
    final groups = <String, List<Todo>>{};
    for (final t in todos) {
      groups.putIfAbsent(t.category, () => []).add(t);
    }

    return Column(
      children: [
        _FiltersRow(
          catFilter: _catFilter,
          assigneeFilter: _assigneeFilter,
          showDone: _showDone,
          onCatFilter: (c) => setState(() => _catFilter = c),
          onAssigneeFilter: (a) => setState(() => _assigneeFilter = a),
          onToggleDone: () => setState(() => _showDone = !_showDone),
        ),
        // Add button (only when unlocked)
        if (prov.canWrite)
          _AddBar(
            isOpen: _showForm,
            onToggle: () => setState(() => _showForm = !_showForm),
          ),
        if (_showForm && prov.canWrite)
          _AddForm(
            titleCtrl: _titleCtrl,
            cat: _formCat,
            assignee: _formAssignee,
            onCat: (c) => setState(() => _formCat = c),
            onAssignee: (a) => setState(() => _formAssignee = a),
            onSubmit: () async {
              final title = _titleCtrl.text.trim();
              if (title.isEmpty) return;
              await prov.createTodo({'title': title, 'category': _formCat, 'assignee': _formAssignee});
              _titleCtrl.clear();
              setState(() => _showForm = false);
            },
            onCancel: () {
              _titleCtrl.clear();
              setState(() => _showForm = false);
            },
          ),
        Expanded(
          child: todos.isEmpty
              ? const Center(
                  child: Text('no todos', style: TextStyle(fontFamily: 'monospace', fontSize: 12, color: AppColors.textTiny)),
                )
              : RefreshIndicator(
                  color: AppColors.accent,
                  backgroundColor: AppColors.surface,
                  onRefresh: prov.refreshAll,
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(12, 8, 12, 100),
                    children: [
                      for (final cat in kTodoCats)
                        if (groups.containsKey(cat['id']))
                          _CatGroup(cat: cat, todos: groups[cat['id']]!),
                    ],
                  ),
                ),
        ),
      ],
    );
  }
}

// ── Filter row ─────────────────────────────────────────────────────────────────

class _FiltersRow extends StatelessWidget {
  final String catFilter;
  final String assigneeFilter;
  final bool showDone;
  final void Function(String) onCatFilter;
  final void Function(String) onAssigneeFilter;
  final VoidCallback onToggleDone;

  const _FiltersRow({
    required this.catFilter, required this.assigneeFilter, required this.showDone,
    required this.onCatFilter, required this.onAssigneeFilter, required this.onToggleDone,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppColors.surface,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _Chip(label: 'all', selected: catFilter == 'all', onTap: () => onCatFilter('all')),
                ...kTodoCats.map((c) => _Chip(
                  label: '${c['icon']} ${c['label']!.toLowerCase()}',
                  selected: catFilter == c['id'],
                  onTap: () => onCatFilter(c['id']!),
                )),
              ],
            ),
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              _Chip(label: 'all', selected: assigneeFilter == 'all', onTap: () => onAssigneeFilter('all')),
              _Chip(label: 'peter', selected: assigneeFilter == 'peter', onTap: () => onAssigneeFilter('peter')),
              _Chip(label: kFriendName.toLowerCase(), selected: assigneeFilter == 'friend', onTap: () => onAssigneeFilter('friend')),
              _Chip(label: 'both', selected: assigneeFilter == 'both', onTap: () => onAssigneeFilter('both')),
              const Spacer(),
              GestureDetector(
                onTap: onToggleDone,
                child: Text(
                  showDone ? 'hide done' : 'show done',
                  style: AppTextStyles.mono11(color: AppColors.textTiny),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _Chip({required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Container(
      margin: const EdgeInsets.only(right: 6),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: selected ? AppColors.accent.withValues(alpha: 0.12) : Colors.transparent,
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: selected ? AppColors.accent.withValues(alpha: 0.4) : AppColors.border),
      ),
      child: Text(label, style: AppTextStyles.mono11(color: selected ? AppColors.accent : AppColors.textFaint)),
    ),
  );
}

// ── Add bar + form ─────────────────────────────────────────────────────────────

class _AddBar extends StatelessWidget {
  final bool isOpen;
  final VoidCallback onToggle;
  const _AddBar({required this.isOpen, required this.onToggle});

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onToggle,
    child: Container(
      color: AppColors.surface2,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          Icon(isOpen ? Icons.remove : Icons.add, size: 14, color: AppColors.accent),
          const SizedBox(width: 8),
          Text('add todo', style: AppTextStyles.mono11(color: AppColors.accent)),
        ],
      ),
    ),
  );
}

class _AddForm extends StatelessWidget {
  final TextEditingController titleCtrl;
  final String cat;
  final String assignee;
  final void Function(String) onCat;
  final void Function(String) onAssignee;
  final VoidCallback onSubmit;
  final VoidCallback onCancel;

  const _AddForm({
    required this.titleCtrl, required this.cat, required this.assignee,
    required this.onCat, required this.onAssignee, required this.onSubmit, required this.onCancel,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppColors.surface2,
      padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: titleCtrl,
            autofocus: true,
            style: AppTextStyles.mono13(),
            decoration: const InputDecoration(hintText: 'todo title'),
            onSubmitted: (_) => onSubmit(),
          ),
          const SizedBox(height: 8),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: kTodoCats.map((c) => GestureDetector(
                onTap: () => onCat(c['id']!),
                child: Container(
                  margin: const EdgeInsets.only(right: 6),
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: cat == c['id'] ? AppColors.accent.withValues(alpha: 0.12) : Colors.transparent,
                    borderRadius: BorderRadius.circular(4),
                    border: Border.all(
                      color: cat == c['id'] ? AppColors.accent.withValues(alpha: 0.4) : AppColors.border,
                    ),
                  ),
                  child: Text('${c['icon']} ${c['label']!.toLowerCase()}',
                      style: AppTextStyles.mono11(color: cat == c['id'] ? AppColors.accent : AppColors.textFaint)),
                ),
              )).toList(),
            ),
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              for (final a in ['peter', 'friend', 'both'])
                GestureDetector(
                  onTap: () => onAssignee(a),
                  child: Container(
                    margin: const EdgeInsets.only(right: 6),
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: assignee == a ? AppColors.accent.withValues(alpha: 0.12) : Colors.transparent,
                      borderRadius: BorderRadius.circular(4),
                      border: Border.all(
                        color: assignee == a ? AppColors.accent.withValues(alpha: 0.4) : AppColors.border,
                      ),
                    ),
                    child: Text(
                      a == 'friend' ? kFriendName.toLowerCase() : a,
                      style: AppTextStyles.mono11(color: assignee == a ? AppColors.accent : AppColors.textFaint),
                    ),
                  ),
                ),
              const Spacer(),
              GestureDetector(
                onTap: onCancel,
                child: Text('cancel', style: AppTextStyles.mono11(color: AppColors.textTiny)),
              ),
              const SizedBox(width: 12),
              ElevatedButton(onPressed: onSubmit, child: const Text('add')),
            ],
          ),
        ],
      ),
    );
  }
}

// ── Category group ─────────────────────────────────────────────────────────────

class _CatGroup extends StatelessWidget {
  final Map<String, String> cat;
  final List<Todo> todos;
  const _CatGroup({required this.cat, required this.todos});

  @override
  Widget build(BuildContext context) {
    final pending = todos.where((t) => !t.done).length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Row(
            children: [
              Text('${cat['icon']} ${cat['label']!.toUpperCase()}',
                  style: AppTextStyles.label(size: 9, color: AppColors.textTiny)),
              const SizedBox(width: 8),
              if (pending > 0)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                  decoration: BoxDecoration(
                    color: AppColors.accent.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text('$pending', style: AppTextStyles.label(size: 9, color: AppColors.accent)),
                ),
            ],
          ),
        ),
        ...todos.map((t) => _TodoRow(todo: t)),
        const SizedBox(height: 4),
      ],
    );
  }
}

// ── Todo row ───────────────────────────────────────────────────────────────────

class _TodoRow extends StatelessWidget {
  final Todo todo;
  const _TodoRow({super.key, required this.todo});

  @override
  Widget build(BuildContext context) {
    final prov = context.read<AppProvider>();
    final t = todo;

    return GestureDetector(
      onTap: prov.canWrite ? () => prov.toggleTodo(t) : null,
      onLongPress: prov.canWrite ? () => _confirmDelete(context, prov, t.id) : null,
      child: Container(
        margin: const EdgeInsets.only(bottom: 4),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(6),
          border: Border.all(color: AppColors.border),
        ),
        child: Row(
          children: [
            Icon(
              t.done ? Icons.check_box : Icons.check_box_outline_blank,
              size: 16,
              color: t.done ? AppColors.accent : AppColors.border,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                t.title,
                style: AppTextStyles.body(
                  size: 13,
                  color: t.done ? AppColors.textFaint : AppColors.text,
                ).copyWith(decoration: t.done ? TextDecoration.lineThrough : null),
              ),
            ),
            const SizedBox(width: 8),
            _AssigneeBadge(assignee: t.assignee),
            if (t.deadline != null) ...[
              const SizedBox(width: 6),
              Text(fmtDateShort(t.deadline), style: AppTextStyles.mono11(color: AppColors.textTiny)),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _confirmDelete(BuildContext context, AppProvider prov, String id) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: AppColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10), side: const BorderSide(color: AppColors.border)),
        title: Text('Delete todo?', style: AppTextStyles.mono12()),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text('cancel', style: AppTextStyles.mono11())),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('delete', style: TextStyle(fontFamily: 'monospace', fontSize: 11, color: AppColors.red)),
          ),
        ],
      ),
    );
    if (ok == true) prov.deleteTodo(id);
  }
}

class _AssigneeBadge extends StatelessWidget {
  final String assignee;
  const _AssigneeBadge({required this.assignee});

  @override
  Widget build(BuildContext context) {
    final label = assignee == 'both' ? 'P+K'
        : assignee == 'peter' ? 'P'
        : 'K';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
      decoration: BoxDecoration(
        color: AppColors.surface2,
        borderRadius: BorderRadius.circular(3),
        border: Border.all(color: AppColors.border),
      ),
      child: Text(label, style: AppTextStyles.label(size: 9, color: AppColors.textTiny)),
    );
  }
}
