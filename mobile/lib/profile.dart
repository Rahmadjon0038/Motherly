import 'package:flutter/material.dart';

import 'api.dart';
import 'welcome.dart';
import 'onboarding.dart';
import 'theme.dart';
import 'widgets.dart';

/// Ona profili: telefon raqami va bolalar (qo'shish, tahrirlash, o'chirish).
class ProfilePage extends StatefulWidget {
  const ProfilePage({super.key});

  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  int _version = 0;

  void _refresh() => setState(() => _version++);

  Future<void> _guard(Future<void> Function() action) async {
    try {
      await action();
      _refresh();
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  Future<void> _editChild([Map<String, dynamic>? child]) async {
    final result = await Navigator.push<Map<String, dynamic>>(
      context,
      MaterialPageRoute(builder: (_) => ChildFlow(initial: child)),
    );
    if (result == null) return;
    await _guard(() => child == null ? Api.I.post('/children', result) : Api.I.put('/children/${child['id']}', result));
  }

  Future<void> _delete(Map<String, dynamic> child) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('${child['name']} o\'chirilsinmi?'),
        content: const Text('Bolaning barcha ma\'lumotlari o\'chadi.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Bekor')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('O\'chirish')),
        ],
      ),
    );
    if (ok == true) await _guard(() => Api.I.delete('/children/${child['id']}'));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Mening profilim')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _editChild,
        icon: const Icon(Icons.add),
        label: const Text('Bola qo\'shish'),
      ),
      body: LoadView<Map<String, dynamic>>(
        key: ValueKey(_version),
        load: () async => Map<String, dynamic>.from(await Api.I.get('/mother') as Map),
        builder: (context, data, _) {
          final children = (data['children'] as List).cast<Map<String, dynamic>>();
          return ListView(padding: const EdgeInsets.fromLTRB(12, 12, 12, 96), children: [
            ListenableBuilder(
              listenable: session,
              builder: (context, _) => session.isGuest
                  ? Card(
                      color: brandLight,
                      child: ListTile(
                        leading: const Icon(Icons.person_outline, color: brand),
                        title: const Text('Ro\'yxatdan o\'tmagansiz', style: TextStyle(fontWeight: FontWeight.w700)),
                        subtitle: const Text('Telefon raqamingizni tasdiqlang: ma\'lumotlaringiz saqlanadi va boshqa telefonda ham kirasiz.'),
                        isThreeLine: true,
                        trailing: FilledButton.tonal(
                          onPressed: () async {
                            final ok = await Navigator.push<bool>(
                              context,
                              MaterialPageRoute(builder: (_) => const WelcomePage()),
                            );
                            if (ok == true && mounted) _refresh();
                          },
                          child: const Text('Kirish'),
                        ),
                      ),
                    )
                  : Card(
                      child: ListTile(
                        leading: const Icon(Icons.person_outline),
                        title: Text(session.user?['phone'] as String? ?? ''),
                        subtitle: const Text('Sizning raqamingiz'),
                      ),
                    ),
            ),
            const Padding(
              padding: EdgeInsets.fromLTRB(4, 16, 4, 8),
              child: Text('Bolalarim', style: TextStyle(fontWeight: FontWeight.bold)),
            ),
            if (children.isEmpty) const Padding(padding: EdgeInsets.all(16), child: Text('Hali bola qo\'shilmagan.')),
            for (final c in children) _ChildCard(c, onEdit: () => _editChild(c), onDelete: () => _delete(c)),
          ]);
        },
      ),
    );
  }
}

class _ChildCard extends StatelessWidget {
  const _ChildCard(this.c, {required this.onEdit, required this.onDelete});
  final Map<String, dynamic> c;
  final VoidCallback onEdit, onDelete;

  @override
  Widget build(BuildContext context) {
    final vacc = (c['vaccinations'] as List).cast<String>();
    final allergies = c['allergies'] as String? ?? '';
    final notes = c['medicalNotes'] as String? ?? '';
    final line = [
      ageText(c['birthDate'] as String),
      if (c['weightKg'] != null) '${c['weightKg']} kg',
      if (c['heightCm'] != null) '${c['heightCm']} sm',
    ].join(' · ');
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            CircleAvatar(child: Icon(c['gender'] == 'female' ? Icons.girl : Icons.boy)),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(c['name'] as String, style: Theme.of(context).textTheme.titleMedium),
                Text(line),
              ]),
            ),
            IconButton(onPressed: onEdit, icon: const Icon(Icons.edit_outlined), tooltip: 'Tahrirlash'),
            IconButton(onPressed: onDelete, icon: const Icon(Icons.delete_outline), tooltip: 'O\'chirish'),
          ]),
          if (vacc.isNotEmpty) ...[
            const SizedBox(height: 10),
            Wrap(spacing: 6, runSpacing: 6, children: [for (final v in vacc) Chip(label: Text(v.split(' (').first))]),
          ],
          if (allergies.isNotEmpty) ...[const SizedBox(height: 8), Text('Allergiya: $allergies')],
          if (notes.isNotEmpty) ...[const SizedBox(height: 4), Text('Muhim: $notes')],
        ]),
      ),
    );
  }
}

/// Profil belgisi bosilganda: mehmon bo'lsa to'g'ridan-to'g'ri kirish tanlash oynasi, aks holda profil.
Future<void> openProfile(BuildContext context) {
  final page = session.isGuest ? const WelcomePage() : const ProfilePage();
  return Navigator.push(context, MaterialPageRoute(builder: (_) => page));
}
