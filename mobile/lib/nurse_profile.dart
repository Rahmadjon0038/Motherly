import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart' show CupertinoActivityIndicator;

import 'api.dart';
import 'avatars.dart';
import 'theme.dart';
import 'videos.dart';
import 'widgets.dart';

const _muted = Color(0xFF7A879C);

/// 50000 → "50 000".
String _som(int n) =>
    n.toString().replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ' ');

/// Ona chatda profil tugmasini bossa: mutaxassisning tizimdagi ma'lumotlari.
/// Telefon raqami ko'rsatilmaydi (to'lovni chetlab o'tishga yo'l qo'ymaslik uchun).
class PeerProfilePage extends StatelessWidget {
  const PeerProfilePage({super.key, this.conversationId, this.nurseId})
    : assert(conversationId != null || nurseId != null);

  /// Chatdan ochilsa suhbat raqami, mutaxassislar ro'yxatidan ochilsa mutaxassisning o'zi.
  final int? conversationId;
  final int? nurseId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Mutaxassis profili')),
      body: LoadView<Map<String, dynamic>>(
        load: () async => Map<String, dynamic>.from(
          await Api.I.get('/conversations/$conversationId/peer') as Map,
        ),
        builder: (context, p, _) {
          final name = p['name'] as String;
          final specialty = p['specialty'] as String? ?? '';
          final exp = (p['experience'] as num?)?.toInt();
          final clinics = (p['clinics'] as List).cast<Map<String, dynamic>>();
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Center(
                child: (p['photoUrl'] as String?) != null
                    ? CircleAvatar(
                        radius: 44,
                        backgroundImage: NetworkImage(
                          Api.fileUrl(p['photoUrl'] as String),
                        ),
                      )
                    : PeerAvatar(name: name, radius: 44),
              ),
              const SizedBox(height: 12),
              Text(
                name,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                  color: ink,
                ),
              ),
              if (specialty.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    specialty,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 16,
                      color: _muted,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              const SizedBox(height: 12),
              Wrap(
                alignment: WrapAlignment.center,
                spacing: 8,
                runSpacing: 8,
                children: [
                  if (exp != null)
                    _Chip(Icons.workspace_premium_outlined, '$exp yil tajriba'),
                  if ((p['languages'] as String? ?? '').isNotEmpty)
                    _Chip(Icons.translate, p['languages'] as String),
                ],
              ),
              const SizedBox(height: 16),
              _Section('Qila oladigan ishlari', p['skills'] as String? ?? ''),
              _Section('O\'zi haqida', p['about'] as String? ?? ''),
              _Section('Ta\'lim', p['education'] as String? ?? ''),
              if (specialty.isEmpty &&
                  exp == null &&
                  (p['about'] as String? ?? '').isEmpty &&
                  (p['skills'] as String? ?? '').isEmpty &&
                  (p['education'] as String? ?? '').isEmpty &&
                  clinics.isEmpty)
                const Padding(
                  padding: EdgeInsets.all(24),
                  child: Text(
                    'Mutaxassis hali profilini to\'ldirmagan.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: _muted),
                  ),
                ),
              _NurseVideos(nurseId: p['id'] as int),
              if (clinics.isNotEmpty) ...[
                const Padding(
                  padding: EdgeInsets.fromLTRB(4, 8, 4, 8),
                  child: Text(
                    'Ishlaydigan klinikalari',
                    style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
                  ),
                ),
                for (final c in clinics)
                  Card(
                    child: ListTile(
                      leading: const CircleAvatar(
                        backgroundColor: brandLight,
                        child: Icon(Icons.local_hospital, color: brand),
                      ),
                      title: Text(
                        c['name'] as String,
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      subtitle: Text(
                        [
                          if ((c['address'] as String).isNotEmpty) c['address'],
                          '${c['field']} · ${_som(c['price'] as int)} so\'m',
                        ].join('\n'),
                      ),
                      isThreeLine: (c['address'] as String).isNotEmpty,
                    ),
                  ),
              ],
            ],
          );
        },
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip(this.icon, this.text);
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: brandLight,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 18, color: brand),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              text,
              style: const TextStyle(color: brand, fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section(this.title, this.text);
  final String title;
  final String text;

  @override
  Widget build(BuildContext context) {
    if (text.trim().isEmpty) return const SizedBox.shrink();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
            ),
            const SizedBox(height: 6),
            Text(text, style: const TextStyle(height: 1.4)),
          ],
        ),
      ),
    );
  }
}

/// Mutaxassisning o'z profili: ism, telefon (o'zgarmaydi), mutaxassislik, tajriba, ta'lim, tillar, o'zi haqida.
/// Onalar chatda profil tugmasini bossa shu ma'lumot ko'rinadi.
class MyProfilePage extends StatefulWidget {
  const MyProfilePage({super.key});

  @override
  State<MyProfilePage> createState() => _MyProfilePageState();
}

class _MyProfilePageState extends State<MyProfilePage> {
  final _name = TextEditingController();
  final _specialty = TextEditingController();
  final _exp = TextEditingController();
  final _education = TextEditingController();
  final _languages = TextEditingController();
  final _about = TextEditingController();
  final _skills = TextEditingController();
  String? _photo;
  String _phone = '';
  bool _loaded = false;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final c in [
      _name,
      _specialty,
      _exp,
      _education,
      _languages,
      _about,
      _skills,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final p = Map<String, dynamic>.from(
        await Api.I.get('/nurse/profile') as Map,
      );
      if (!mounted) return;
      setState(() {
        _name.text = p['name'] as String? ?? '';
        _specialty.text = p['specialty'] as String? ?? '';
        _exp.text = p['experience']?.toString() ?? '';
        _education.text = p['education'] as String? ?? '';
        _languages.text = p['languages'] as String? ?? '';
        _about.text = p['about'] as String? ?? '';
        _skills.text = p['skills'] as String? ?? '';
        _photo = p['photoUrl'] as String?;
        _phone = p['phone'] as String? ?? '';
        _loaded = true;
      });
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    }
  }

  Future<void> _pickPhoto() async {
    final f = await FilePicker.pickFile(type: FileType.image);
    if (f == null) return;
    try {
      final r = await Api.I.upload(
        '/nurse/photo',
        await f.xFile.readAsBytes(),
        f.name,
        method: 'PUT',
      ) as Map;
      if (mounted) setState(() => _photo = r['photoUrl'] as String?);
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  Future<void> _save() async {
    setState(() => _busy = true);
    try {
      await Api.I.put('/nurse/profile', {
        'name': _name.text.trim(),
        'specialty': _specialty.text.trim(),
        'experience': _exp.text.trim(),
        'education': _education.text.trim(),
        'languages': _languages.text.trim(),
        'about': _about.text.trim(),
        'skills': _skills.text.trim(),
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Profil saqlandi')));
      Navigator.pop(context, true);
    } catch (e) {
      if (mounted) showError(context, e);
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Mening profilim')),
      body: !_loaded
          ? Center(
              child: _error == null
                  ? const CupertinoActivityIndicator(radius: 14)
                  : Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(_error!, textAlign: TextAlign.center),
                    ),
            )
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Center(
                  child: GestureDetector(
                    onTap: _pickPhoto,
                    child: Stack(
                      children: [
                        CircleAvatar(
                          radius: 48,
                          backgroundColor: brandLight,
                          backgroundImage: _photo != null
                              ? NetworkImage(Api.fileUrl(_photo!))
                              : null,
                          child: _photo == null
                              ? const Icon(Icons.person, size: 48, color: brand)
                              : null,
                        ),
                        const Positioned(
                          right: 0,
                          bottom: 0,
                          child: CircleAvatar(
                            radius: 16,
                            backgroundColor: brand,
                            child: Icon(
                              Icons.camera_alt,
                              size: 16,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                const Padding(
                  padding: EdgeInsets.only(bottom: 12),
                  child: Text(
                    'Onalar chatda sizning profilingizni ko\'radi.',
                    style: TextStyle(color: _muted),
                  ),
                ),
                TextField(
                  controller: _name,
                  decoration: const InputDecoration(
                    labelText: 'Ism familiya *',
                  ),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  initialValue: _phone,
                  enabled: false,
                  decoration: const InputDecoration(
                    labelText: 'Telefon raqam',
                    helperText: 'Klinika bergan raqam, o\'zgartirib bo\'lmaydi',
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _specialty,
                  decoration: const InputDecoration(
                    labelText: 'Mutaxassisligi *',
                    helperText: 'Masalan: Laktatsiya maslahatchisi',
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _exp,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Tajriba (yil)'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _education,
                  maxLines: 3,
                  decoration: const InputDecoration(
                    labelText: 'Ta\'lim (o\'qigan joyi, yili)',
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _languages,
                  decoration: const InputDecoration(
                    labelText: 'Tillar (masalan: O\'zbek, rus)',
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _skills,
                  maxLines: 4,
                  decoration: const InputDecoration(
                    labelText: 'Qila oladigan ishlarim',
                    helperText: 'Masalan: emizishni o\'rgatish, chaqaloq massaji, ovqatlantirish rejasi',
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _about,
                  maxLines: 5,
                  decoration: const InputDecoration(
                    labelText: 'O\'zim haqimda',
                  ),
                ),
                const SizedBox(height: 20),
                GradientButton(
                  label: 'Saqlash',
                  icon: null,
                  busy: _busy,
                  onPressed: _save,
                ),
              ],
            ),
    );
  }
}

/// Mutaxassisning o'zi yuklagan video darslari (muallifi shu mutaxassis). Pullik bo'lsa sotib olinadi.
class _NurseVideos extends StatelessWidget {
  const _NurseVideos({required this.nurseId});
  final int nurseId;

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Map<String, dynamic>>>(
      future: Api.I
          .get('/nurses/$nurseId/videos')
          .then(
            (r) => (r as List)
                .map((e) => Map<String, dynamic>.from(e as Map))
                .toList(),
          ),
      builder: (context, snap) {
        final list = snap.data;
        if (list == null || list.isEmpty) return const SizedBox.shrink();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(4, 8, 4, 8),
              child: Text(
                'Video darslari',
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
              ),
            ),
            for (final v in list)
              Card(
                child: ListTile(
                  leading: const CircleAvatar(
                    backgroundColor: brandLight,
                    child: Icon(Icons.play_arrow_rounded, color: brand),
                  ),
                  title: Text(
                    v['title'] as String,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  subtitle: Text(
                    (v['price'] as int) == 0
                        ? 'Bepul'
                        : v['purchased'] == true
                        ? 'Sotib olingan'
                        : '${_som(v['price'] as int)} so\'m',
                  ),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () {
                    final paid = (v['price'] as int) > 0;
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => paid
                            ? PaidPage(type: 'video', id: v['id'] as int)
                            : VideoDetailPage(
                                video: v,
                                onToggle: () async {
                                  final was = v['favorite'] == true;
                                  v['favorite'] = !was;
                                  was
                                      ? await Api.I.delete(
                                          '/videos/${v['id']}/favorite',
                                        )
                                      : await Api.I.post(
                                          '/videos/${v['id']}/favorite',
                                        );
                                },
                              ),
                      ),
                    );
                  },
                ),
              ),
          ],
        );
      },
    );
  }
}
