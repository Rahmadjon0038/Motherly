import 'package:flutter/material.dart';

import 'api.dart';
import 'my_videos.dart';
import 'nurse_profile.dart';
import 'payment.dart';
import 'theme.dart';
import 'widgets.dart';

/// Mutaxassis (hamshira): "Mening bemorlarim" (Telegram uslubidagi chatlar) va klinikalari nomidan e'lonlari.
///
/// Hamshirani klinikaning o'zi qo'shadi (telefon raqami bo'yicha), hujjat yuborish yoki tasdiqlash yo'q.
/// Bir nechta klinikada ishlasa, har bir klinika nomidan alohida e'lon joylay oladi.
class NurseHome extends StatefulWidget {
  const NurseHome({super.key});

  @override
  State<NurseHome> createState() => _NurseHomeState();
}

class _NurseHomeState extends State<NurseHome> {
  int _tab = 0;
  bool _picked = false; // foydalanuvchi o'zi tab tanlaganmi
  int _version = 0;

  @override
  Widget build(BuildContext context) {
    return LoadView<Map<String, dynamic>>(
      key: ValueKey(_version),
      load: () async =>
          Map<String, dynamic>.from(await Api.I.get('/consultants/me') as Map),
      builder: (context, data, _) {
        void reload() => setState(() => _version++);
        final clinics = (data['clinics'] as List)
            .map((c) => Map<String, dynamic>.from(c as Map))
            .toList();
        final profile = Map<String, dynamic>.from(data['profile'] as Map);
        Widget profileButton() => IconButton(
          tooltip: 'Profilim',
          icon: const Icon(Icons.person_outline),
          onPressed: () async {
            final saved = await Navigator.push<bool>(
              context,
              MaterialPageRoute(builder: (_) => const MyProfilePage()),
            );
            if (saved == true) reload();
          },
        );

        if (clinics.isEmpty) {
          return Scaffold(
            appBar: AppBar(
              title: const Text('Motherly'),
              actions: [profileButton(), _logout()],
            ),
            body: _NoClinicView(onRefresh: reload),
          );
        }

        // Hali birorta e'lon yo'q bo'lsa, avval e'lon joylash bo'limi ochiladi.
        final noListings = clinics.every((c) => c['profile'] == null);
        final tab = !_picked && noListings ? 1 : _tab;
        return Scaffold(
          appBar: AppBar(
            title: Text(
              const [
                'Mening bemorlarim',
                'Mening e\'lonlarim',
                'Mening videolarim',
              ][tab],
            ),
            actions: [profileButton(), _logout()],
          ),
          body: tab == 0
              ? const ConversationList(
                  emptyText: 'Hali bemorlar yo\'q.\nOna sizni yollaganda suhbat shu yerda paydo bo\'ladi.',
                )
              : tab == 1
              ? _ClinicsView(
                  clinics: clinics,
                  profile: profile,
                  onChanged: reload,
                )
              : const MyVideosView(),
          bottomNavigationBar: NavigationBar(
            selectedIndex: tab,
            onDestinationSelected: (i) => setState(() {
              _tab = i;
              _picked = true;
            }),
            destinations: const [
              NavigationDestination(
                icon: Icon(Icons.people_outline),
                selectedIcon: Icon(Icons.people),
                label: 'Bemorlar',
              ),
              NavigationDestination(
                icon: Icon(Icons.badge_outlined),
                selectedIcon: Icon(Icons.badge),
                label: 'E\'lonlarim',
              ),
              NavigationDestination(
                icon: Icon(Icons.video_library_outlined),
                selectedIcon: Icon(Icons.video_library),
                label: 'Videolarim',
              ),
            ],
          ),
        );
      },
    );
  }
}

Widget _logout() => IconButton(
  onPressed: session.logout,
  icon: const Icon(Icons.logout),
  tooltip: 'Chiqish',
);

/// Hech bir klinika ro'yxatida emas (masalan klinika chiqarib yuborgan).
class _NoClinicView extends StatelessWidget {
  const _NoClinicView({required this.onRefresh});
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: () async => onRefresh(),
      child: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const SizedBox(height: 16),
          const Icon(Icons.local_hospital_outlined, size: 64, color: brand),
          const SizedBox(height: 12),
          Text(
            'Siz hozir hech bir klinikada emassiz',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 8),
          const Text(
            'Klinika rahbaridan sizni ro\'yxatga qo\'shishini so\'rang.',
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 20),
          GradientButton(
            label: 'Yangilash',
            icon: Icons.refresh,
            onPressed: onRefresh,
          ),
        ],
      ),
    );
  }
}

/// Hamshira ishlaydigan klinikalar va har birining e'loni.
class _ClinicsView extends StatelessWidget {
  const _ClinicsView({
    required this.clinics,
    required this.profile,
    required this.onChanged,
  });
  final List<Map<String, dynamic>> clinics;
  final Map<String, dynamic>
  profile; // hamshiraning shaxsiy profili (e'lon formasini oldindan to'ldiradi)
  final VoidCallback onChanged;

  Future<void> _open(BuildContext context, Map<String, dynamic> clinic) async {
    final changed = await Navigator.push<bool>(
      context,
      MaterialPageRoute(
        builder: (_) => _ListingPage(clinic: clinic, profile: profile),
      ),
    );
    if (changed == true) onChanged();
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: () async => onChanged(),
      child: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          if ((profile['specialty'] as String? ?? '').isEmpty)
            Card(
              color: brandLight,
              child: ListTile(
                leading: const Icon(Icons.badge_outlined, color: brand),
                title: const Text(
                  'Profilingizni to\'ldiring',
                  style: TextStyle(fontWeight: FontWeight.w700),
                ),
                subtitle: const Text(
                  'Mutaxassisligi, tajribasi va ta\'limingizni yozing: onalar chatda ko\'radi.',
                ),
                trailing: const Icon(Icons.chevron_right),
                onTap: () async {
                  final saved = await Navigator.push<bool>(
                    context,
                    MaterialPageRoute(builder: (_) => const MyProfilePage()),
                  );
                  if (saved == true) onChanged();
                },
              ),
            ),
          const SizedBox(height: 8),
          for (final c in clinics)
            Builder(
              builder: (context) {
                final profile = c['profile'] as Map<String, dynamic>?;
                return Card(
                  child: ListTile(
                    contentPadding: const EdgeInsets.fromLTRB(16, 8, 8, 8),
                    leading: _ClinicAvatar(c['photoUrl'] as String?),
                    title: Text(
                      c['name'] as String,
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    subtitle: Text(
                      profile == null
                          ? 'E\'lon joylanmagan'
                          : '${profile['field']} · ${som(profile['price'] as int)} so\'m',
                      style: TextStyle(
                        color: profile == null
                            ? Colors.orange.shade800
                            : Colors.green.shade700,
                      ),
                    ),
                    trailing: FilledButton.tonal(
                      onPressed: () => _open(context, c),
                      child: Text(
                        profile == null ? 'E\'lon joylash' : 'Tahrirlash',
                      ),
                    ),
                    onTap: () => _open(context, c),
                  ),
                );
              },
            ),
        ],
      ),
    );
  }
}

class _ClinicAvatar extends StatelessWidget {
  const _ClinicAvatar(this.photoUrl);
  final String? photoUrl;

  @override
  Widget build(BuildContext context) {
    const fallback = ColoredBox(
      color: brandLight,
      child: Icon(Icons.local_hospital, color: brand),
    );
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: SizedBox(
        width: 48,
        height: 48,
        child: photoUrl == null
            ? fallback
            : Image.network(
                Api.fileUrl(photoUrl!),
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) => fallback,
              ),
      ),
    );
  }
}

/// Bitta klinika nomidan e'lon: joylash, tahrirlash yoki olib tashlash.
class _ListingPage extends StatefulWidget {
  const _ListingPage({required this.clinic, required this.profile});
  final Map<String, dynamic> clinic;
  final Map<String, dynamic> profile;

  @override
  State<_ListingPage> createState() => _ListingPageState();
}

String? _nonEmpty(Object? v) => (v is String && v.trim().isNotEmpty) ? v : null;

class _ListingPageState extends State<_ListingPage> {
  late final Map<String, dynamic>? _profile =
      widget.clinic['profile'] as Map<String, dynamic>?;
  // Avval e'lon joylangan bo'lsa o'sha, aks holda klinika yozgan yo'nalish va shaxsiy profildagi ma'lumotlar.
  late final _name = TextEditingController(
    text:
        (_profile?['name'] ??
                widget.profile['name'] ??
                session.user?['name'] ??
                '')
            as String,
  );
  late final _field = TextEditingController(
    text:
        (_profile?['field'] ??
                _nonEmpty(widget.clinic['field']) ??
                _nonEmpty(widget.profile['specialty']) ??
                '')
            as String,
  );
  late final _exp = TextEditingController(
    text: (_profile?['experience'] ?? widget.profile['experience'])?.toString(),
  );
  late final _price = TextEditingController(
    text: (_profile?['price'] ?? 50000).toString(),
  );
  late final _about = TextEditingController(
    text:
        (_profile?['about'] ?? _nonEmpty(widget.profile['about']) ?? '')
            as String,
  );
  bool _busy = false;

  @override
  void dispose() {
    for (final c in [_name, _field, _exp, _price, _about]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _busy = true);
    try {
      await Api.I.put('/consultants/me', {
        'clinicId': widget.clinic['id'],
        'name': _name.text.trim(),
        'field': _field.text.trim(),
        'experience': _exp.text,
        'price': _price.text,
        'about': _about.text.trim(),
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('E\'lon saqlandi')));
      Navigator.pop(context, true);
    } catch (e) {
      if (mounted) showError(context, e);
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _remove() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('E\'lonni olib tashlaysizmi?'),
        content: Text(
          'Onalar sizni "${widget.clinic['name']}" nomidan endi ko\'rmaydi. Klinikada qolasiz, keyin qayta joylay olasiz.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Bekor qilish'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Olib tashlash'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _busy = true);
    try {
      await Api.I.delete('/consultants/me/${widget.clinic['id']}');
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) showError(context, e);
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final clinicName = widget.clinic['name'] as String;
    return Scaffold(
      appBar: AppBar(
        title: Text(
          _profile == null ? 'E\'lon joylash' : 'E\'lonni tahrirlash',
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            color: brandLight,
            child: ListTile(
              leading: const Icon(Icons.local_hospital, color: brand),
              title: Text(
                clinicName,
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
              subtitle: const Text('Shu klinika nomidan e\'lon qilinadi'),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _name,
            decoration: const InputDecoration(labelText: 'Ism familiya'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _field,
            decoration: const InputDecoration(
              labelText: 'Yo\'nalish (masalan: Laktatsiya)',
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _exp,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Tajriba (yil)'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: TextField(
                  controller: _price,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Narx (so\'m)'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _about,
            maxLines: 4,
            decoration: const InputDecoration(labelText: 'Nimalar qila olasiz'),
          ),
          const SizedBox(height: 20),
          GradientButton(
            label: _profile == null ? 'E\'lon joylash' : 'Saqlash',
            icon: null,
            busy: _busy,
            onPressed: _save,
          ),
          if (_profile != null) ...[
            const SizedBox(height: 8),
            TextButton(
              onPressed: _busy ? null : _remove,
              child: Text(
                'E\'lonni olib tashlash',
                style: TextStyle(color: Colors.red.shade700),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
