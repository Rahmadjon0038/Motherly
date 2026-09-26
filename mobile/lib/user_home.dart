import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import 'api.dart';
import 'auth.dart';
import 'geo.dart';
import 'home_chat.dart';
import 'maps.dart';
import 'payment.dart';
import 'profile.dart';
import 'theme.dart';
import 'videos.dart';
import 'widgets.dart';

class UserHome extends StatefulWidget {
  const UserHome({super.key});

  @override
  State<UserHome> createState() => _UserHomeState();
}

class _UserHomeState extends State<UserHome> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) => ListenableBuilder(listenable: session, builder: (context, _) => _build(context));

  Widget _build(BuildContext context) {
    const titles = ['Chat', 'Mutaxassislar', 'Yaqin klinikalar'];
    // Har bir tab almashganda ma'lumot qayta yuklanadi.
    final pages = [const ChatHome(), const _ConsultantsTab(), const _ClinicsTab()];
    return Scaffold(
      // Chat sahifasi o'z sarlavhasiga ega (home_chat.dart), boshqa tablarda oddiy AppBar.
      appBar: _tab == 0 ? null : AppBar(
        title: Text(titles[_tab]),
        actions: [
          ListenableBuilder(
            listenable: session,
            builder: (_, _) => session.isGuest
                ? TextButton.icon(onPressed: () => openProfile(context), icon: const Icon(Icons.login_rounded), label: const Text('Kirish'))
                : IconButton(onPressed: () => openProfile(context), icon: const Icon(Icons.person_outline), tooltip: 'Profil'),
          ),
          if (!session.isGuest) IconButton(onPressed: session.logout, icon: const Icon(Icons.logout), tooltip: 'Chiqish'),
        ],
      ),
      body: pages[_tab],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) {
          // "Darslar" alohida ekran: ichida o'zining 2 ta pastki tabi bor.
          if (i == 3) {
            Navigator.push(context, MaterialPageRoute(builder: (_) => const VideoSection()));
          } else {
            setState(() => _tab = i);
          }
        },
        destinations: const [
          NavigationDestination(icon: Icon(Icons.chat_bubble_outline), selectedIcon: Icon(Icons.chat_bubble), label: 'Chat'),
          NavigationDestination(icon: Icon(Icons.support_agent_outlined), selectedIcon: Icon(Icons.support_agent), label: 'Mutaxassis'),
          NavigationDestination(icon: Icon(Icons.location_on_outlined), selectedIcon: Icon(Icons.location_on), label: 'Klinikalar'),
          NavigationDestination(icon: Icon(Icons.play_circle_outline), selectedIcon: Icon(Icons.play_circle), label: 'Darslar'),
        ],
      ),
    );
  }
}

// ---------- 2-sahifa: mutaxassislar + to'lov ----------

class _ConsultantsTab extends StatelessWidget {
  const _ConsultantsTab();

  @override
  Widget build(BuildContext context) {
    return LoadView<List<dynamic>>(
      load: () async => await Api.I.get('/consultants') as List,
      builder: (context, list, reload) => RefreshIndicator(
        onRefresh: () async => reload(),
        child: ListView.builder(
          padding: const EdgeInsets.all(12),
          itemCount: list.length,
          itemBuilder: (_, i) {
            final d = list[i] as Map<String, dynamic>;
            final hired = d['hired'] == true;
            return Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    CircleAvatar(radius: 26, child: Text((d['name'] as String)[0], style: const TextStyle(fontSize: 22))),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(d['name'] as String, style: Theme.of(context).textTheme.titleMedium),
                        Text('${d['field']} · ${d['experience']} yil tajriba'),
                        if (d['clinic'] != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 2),
                            child: Row(children: [
                              const Icon(Icons.local_hospital_outlined, size: 15, color: brand),
                              const SizedBox(width: 4),
                              Expanded(
                                child: Text(
                                  (d['clinic'] as Map)['name'] as String,
                                  style: const TextStyle(color: brand, fontWeight: FontWeight.w600),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ]),
                          ),
                      ]),
                    ),
                  ]),
                  if ((d['about'] as String).isNotEmpty) ...[const SizedBox(height: 10), Text(d['about'] as String)],
                  const SizedBox(height: 12),
                  GradientButton(
                    label: hired ? 'Yollangan' : 'Maslahat olish · ${som(d['price'] as int)} so\'m',
                    icon: hired ? Icons.check : null,
                    onPressed: hired
                        ? null
                        : () async {
                            if (!await ensureRegistered(context, why: 'To\'lov qilish uchun')) return;
                            if (!context.mounted) return;
                            final ok = await showPayment(
                              context,
                              title: '${d['name']} bilan konsultatsiya',
                              price: d['price'] as int,
                              path: '/consultants/${d['id']}/hire',
                            );
                            if (ok) {
                              reload();
                              if (context.mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                                    content: Text('To\'lov qabul qilindi. "Chat → Mening mutaxassisim" bo\'limiga o\'ting.')));
                              }
                            }
                          },
                  ),
                ]),
              ),
            );
          },
        ),
      ),
    );
  }
}

// ---------- 3-sahifa: Yaqin klinikalar ----------

/// Ro'yxatda dastlab shuncha eng yaqin klinika ko'rinadi.
const _nearestCount = 5;

class _ClinicsTab extends StatefulWidget {
  const _ClinicsTab();

  @override
  State<_ClinicsTab> createState() => _ClinicsTabState();
}

class _ClinicsTabState extends State<_ClinicsTab> with WidgetsBindingObserver {
  bool _showAll = false;
  int _version = 0; // o'zgarganda ro'yxat qayta yuklanadi (joylashuv yoqilgach)
  bool _real = false; // oxirgi natija haqiqiy joylashuv asosidami

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Sahifaga kirilganda joylashuv yoqilmagan bo'lsa, nega kerakligini tushuntirib, yoqishni taklif qilamiz.
    WidgetsBinding.instance.addPostFrameCallback((_) => _explainIfNeeded());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  // Foydalanuvchi sozlamalarda joylashuvni yoqib qaytsa, ro'yxat yangilanadi.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && !_real && mounted) setState(() => _version++);
  }

  Future<void> _explainIfNeeded() async {
    if (await locationStatus() == LocationStatus.granted || !mounted) return;
    final go = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        icon: const Icon(Icons.location_on, size: 44, color: brand),
        title: const Text('Joylashuvni yoqing', textAlign: TextAlign.center),
        content: const Text(
          'Sizga eng yaqin klinikalarni ko\'rsatish, masofani hisoblash va klinikagacha yo\'nalish chizish '
          'uchun joylashuvingiz kerak.\n\nJoylashuvingiz saqlanmaydi va boshqalarga ko\'rsatilmaydi.',
          textAlign: TextAlign.center,
        ),
        actionsAlignment: MainAxisAlignment.center,
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Hozir emas')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Joylashuvni yoqish')),
        ],
      ),
    );
    if (go == true) await _enable();
  }

  Future<void> _enable() async {
    await enableLocation();
    if (mounted) setState(() => _version++);
  }

  @override
  Widget build(BuildContext context) {
    return LoadView<({List<dynamic> clinics, UserPosition pos})>(
      key: ValueKey(_version),
      load: () async {
        // Ruxsatni bu yerda so'ramaymiz: buning uchun yuqoridagi tushuntirish oynasi bor.
        final pos = await currentPosition(ask: false);
        final clinics = await Api.I.get('/clinics?lat=${pos.lat}&lng=${pos.lng}') as List;
        return (clinics: clinics, pos: pos);
      },
      builder: (context, data, reload) {
        // Server masofa bo'yicha tartiblab beradi: dastlab eng yaqinlari, qolganlari tugma bilan.
        _real = data.pos.real;
        final all = data.clinics.cast<Map<String, dynamic>>();
        final shown = _showAll ? all : all.take(_nearestCount).toList();
        Future<void> openClinic(Map<String, dynamic> c) async {
          await Navigator.push(context, MaterialPageRoute(builder: (_) => ClinicPage(c)));
          reload();
        }

        return RefreshIndicator(
          onRefresh: () async => reload(),
          child: ListView(padding: const EdgeInsets.all(12), children: [
            if (!data.pos.real)
              Card(
                color: const Color(0xFFFFF4E0),
                child: ListTile(
                  leading: const Icon(Icons.location_off_outlined, color: Color(0xFFB7791F)),
                  title: const Text('Joylashuv o\'chiq', style: TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: const Text('Eng yaqin klinikalarni ko\'rsatish uchun yoqing. Hozir masofalar Toshkent markaziga nisbatan.'),
                  isThreeLine: true,
                  trailing: FilledButton.tonal(onPressed: _enable, child: const Text('Yoqish')),
                ),
              ),
            for (final c in shown) _ClinicCard(c, onTap: () => openClinic(c)),
            if (!_showAll && all.length > shown.length)
              TextButton(
                onPressed: () => setState(() => _showAll = true),
                child: Text('Yana ${all.length - shown.length} ta klinikani ko\'rsatish'),
              ),
          ]),
        );
      },
    );
  }
}

/// Klinika kartochkasi. Ish vaqti tugagan klinika kulrang va "Hozir ish vaqti emas" bilan ko'rinadi.
class _ClinicCard extends StatelessWidget {
  const _ClinicCard(this.c, {required this.onTap});
  final Map<String, dynamic> c;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final closed = isClosedNow(c);
    final note = hoursNote(c);
    final grey = Theme.of(context).disabledColor;
    return Opacity(
      opacity: closed ? 0.6 : 1,
      child: Card(
        color: closed ? Colors.grey.shade200 : null,
        child: ListTile(
          leading: ColorFiltered(
            colorFilter: closed
                ? const ColorFilter.matrix([
                    0.2126, 0.7152, 0.0722, 0, 0, //
                    0.2126, 0.7152, 0.0722, 0, 0,
                    0.2126, 0.7152, 0.0722, 0, 0,
                    0, 0, 0, 1, 0,
                  ])
                : const ColorFilter.mode(Colors.transparent, BlendMode.dst),
            child: _ClinicThumb(c['photoUrl'] as String?),
          ),
          title: Text(c['name'] as String),
          subtitle: Text(
            [
              '${c['address']} · ${c['distanceKm']} km',
              if (note.isNotEmpty) note,
            ].join('\n'),
            style: closed ? TextStyle(color: grey) : null,
          ),
          isThreeLine: true,
          trailing: const Icon(Icons.chevron_right),
          onTap: onTap,
        ),
      ),
    );
  }
}

class ClinicPage extends StatefulWidget {
  const ClinicPage(this.clinic, {super.key});
  final Map<String, dynamic> clinic;

  @override
  State<ClinicPage> createState() => _ClinicPageState();
}

class _ClinicPageState extends State<ClinicPage> {
  bool _busy = false;

  /// Klinikaning xarita havolasi, bo'lmasa koordinata bo'yicha qidiruv.
  Future<void> _openMap(Map<String, dynamic> c) async {
    final link = c['mapUrl'] as String?;
    final url = link != null && link.isNotEmpty
        ? link
        : 'https://www.google.com/maps/search/?api=1&query=${c['lat']},${c['lng']}';
    final ok = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication).catchError((_) => false);
    if (!ok && mounted) showError(context, 'Xaritani ochib bo\'lmadi');
  }

  /// Klinikaga murojaat yuboradi (navbat yo'q: klinika o'zi bog'lanadi).
  Future<void> _go() async {
    if (!await ensureRegistered(context, why: 'Murojaat yuborish uchun klinika sizga bog\'lana olishi kerak, shuning uchun')) {
      return;
    }
    if (!mounted) return;
    setState(() => _busy = true);
    try {
      final v = await Api.I.post('/clinics/${widget.clinic['id']}/visit') as Map<String, dynamic>;
      if (!mounted) return;
      final again = v['duplicate'] == true;
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          icon: const Icon(Icons.mark_email_read_outlined, size: 40, color: brand),
          title: Text(again ? 'Murojaatingiz allaqachon yuborilgan' : 'Murojaatingiz yuborildi'),
          content: Text(
            '${v['clinic']} murojaatingizni ko\'rib, siz bilan bog\'lanadi.',
            textAlign: TextAlign.center,
          ),
          actions: [FilledButton(onPressed: () => Navigator.pop(ctx), child: const Text('Tushunarli'))],
        ),
      );
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        showError(context, e);
        setState(() => _busy = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.clinic;
    final staff = (c['staff'] as List).cast<Map<String, dynamic>>();
    final about = c['about'] as String? ?? '';
    final services = c['services'] as String? ?? '';
    final closed = isClosedNow(c);
    return Scaffold(
      appBar: AppBar(title: Text(c['name'] as String)),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        if (_photoUrls(c).isNotEmpty) _ClinicGallery(_photoUrls(c)),
        ListTile(leading: const Icon(Icons.place), title: Text(c['address'] as String)),
        ListTile(
          leading: const Icon(Icons.map_outlined, color: brand),
          title: const Text('Xaritada ochish', style: TextStyle(color: brand, fontWeight: FontWeight.w600)),
          trailing: const Icon(Icons.open_in_new, color: brand),
          onTap: () => _openMap(c),
        ),
        if (closed)
          Card(
            color: Colors.grey.shade200,
            child: ListTile(
              leading: const Icon(Icons.schedule, color: Colors.grey),
              title: Text(hoursNote(c), style: const TextStyle(fontWeight: FontWeight.w600)),
              subtitle: const Text('Murojaatingizni baribir yuborishingiz mumkin, klinika ish vaqtida javob beradi'),
            ),
          ),
        _HoursTile(c),
        ..._phoneTiles(context, c),
        if (about.isNotEmpty) ...[const Divider(), Padding(padding: const EdgeInsets.symmetric(vertical: 8), child: Text(about))],
        if (services.isNotEmpty) ...[
          const Divider(),
          Text('Xizmatlar', style: Theme.of(context).textTheme.titleMedium),
          Padding(padding: const EdgeInsets.symmetric(vertical: 8), child: Text(services)),
        ],
        if (staff.isNotEmpty) ...[
          const Divider(),
          Text('Shifokorlar', style: Theme.of(context).textTheme.titleMedium),
          for (final s in staff)
            ListTile(
              leading: const Icon(Icons.person),
              title: Text(s['name'] as String),
              subtitle: Text('${_staffLine(s)}\nIsh vaqti: ${s['schedule']}'),
              isThreeLine: true,
            ),
        ],
      ]),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(children: [
            Expanded(
              flex: 5,
              child: SizedBox(
                height: 56,
                child: OutlinedButton.icon(
                  onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => RouteMapPage(c))),
                  icon: const Icon(Icons.directions),
                  label: const Text('Yo\'nalish'),
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              flex: 6,
              child: GradientButton(
                label: 'Murojaat yuborish',
                icon: null,
                busy: _busy,
                onPressed: _go,
              ),
            ),
          ]),
        ),
      ),
    );
  }
}

/// Klinikaning asosiy va qo'shimcha raqamlari. Bosilsa qo'ng'iroq oynasi ochiladi.
List<Widget> _phoneTiles(BuildContext context, Map<String, dynamic> c) {
  final entries = <({String label, String number})>[
    if ((c['phone'] as String? ?? '').isNotEmpty) (label: 'Asosiy telefon', number: c['phone'] as String),
    for (final p in (c['extraPhones'] as List? ?? const []).cast<Map<String, dynamic>>())
      (label: (p['label'] as String?)?.trim() ?? '', number: p['number'] as String),
  ];
  return [
    for (final e in entries)
      ListTile(
        leading: const Icon(Icons.phone),
        title: Text(e.number),
        subtitle: e.label.isEmpty ? null : Text(e.label),
        onTap: () async {
          // Raqamdan faqat + va raqamlar olinadi: "+998 90 123-45-67" -> "+998901234567".
          final dial = e.number.replaceAll(RegExp(r'[^\d+]'), '');
          final ok = dial.length < 5
              ? false
              : await launchUrl(Uri(scheme: 'tel', path: dial)).catchError((_) => false);
          if (!ok && context.mounted) showError(context, 'Qo\'ng\'iroq qilib bo\'lmadi');
        },
      ),
  ];
}

/// Ish vaqti: qisqa matn, bosilsa haftalik jadval ochiladi (jadval bo'lsa).
class _HoursTile extends StatelessWidget {
  const _HoursTile(this.c);
  final Map<String, dynamic> c;

  static const _days = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba'];

  @override
  Widget build(BuildContext context) {
    final week = (c['workHours'] as List?)?.cast<Map<String, dynamic>>();
    final icon = const Icon(Icons.schedule);
    if (week == null || week.length != 7) {
      return ListTile(leading: icon, title: const Text('Ish vaqti'), subtitle: Text(c['hours'] as String));
    }
    return ExpansionTile(
      leading: icon,
      title: const Text('Ish vaqti'),
      subtitle: Text(c['hours'] as String),
      shape: const Border(),
      collapsedShape: const Border(),
      children: [
        for (var i = 0; i < 7; i++)
          ListTile(
            dense: true,
            title: Text(_days[i]),
            trailing: Text(week[i]['closed'] == true ? 'Dam olish' : '${week[i]['open']}–${week[i]['close']}'),
          ),
      ],
    );
  }
}

/// "Pediatr · 12 yil tajriba" ko'rinishidagi qisqa satr.
String _staffLine(Map<String, dynamic> s) {
  final exp = s['experience'] as int?;
  return [s['position'] as String, if (exp != null && exp > 0) '$exp yil tajriba'].join(' · ');
}

/// Klinikaning rasm havolalari: galereya (photos), bo'lmasa bitta asosiy rasm (photoUrl).
List<String> _photoUrls(Map<String, dynamic> c) {
  final photos = (c['photos'] as List?)?.map((p) => (p as Map)['url'] as String).toList() ?? const <String>[];
  if (photos.isNotEmpty) return photos;
  final cover = c['photoUrl'] as String?;
  return cover == null ? const [] : [cover];
}

/// Klinika rasmlari: bir nechta bo'lsa suriladi va pastida nuqtalar ko'rinadi.
class _ClinicGallery extends StatefulWidget {
  const _ClinicGallery(this.urls);
  final List<String> urls;

  @override
  State<_ClinicGallery> createState() => _ClinicGalleryState();
}

class _ClinicGalleryState extends State<_ClinicGallery> {
  int _page = 0;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(20),
        child: AspectRatio(
          aspectRatio: 16 / 9,
          child: Stack(children: [
            PageView.builder(
              itemCount: widget.urls.length,
              onPageChanged: (i) => setState(() => _page = i),
              itemBuilder: (_, i) => Image.network(
                Api.fileUrl(widget.urls[i]),
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) => Container(
                  color: brandLight,
                  child: const Icon(Icons.local_hospital, size: 48, color: brand),
                ),
              ),
            ),
            if (widget.urls.length > 1)
              Positioned(
                bottom: 8,
                left: 0,
                right: 0,
                child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                  for (var i = 0; i < widget.urls.length; i++)
                    Container(
                      width: 7,
                      height: 7,
                      margin: const EdgeInsets.symmetric(horizontal: 3),
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: i == _page ? Colors.white : Colors.white54,
                      ),
                    ),
                ]),
              ),
          ]),
        ),
      ),
    );
  }
}

class _ClinicThumb extends StatelessWidget {
  const _ClinicThumb(this.photoUrl);
  final String? photoUrl;

  @override
  Widget build(BuildContext context) {
    const size = 56.0;
    final fallback = Container(
      width: size,
      height: size,
      color: brandLight,
      child: const Icon(Icons.local_hospital, color: brand),
    );
    return ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: photoUrl == null
          ? fallback
          : Image.network(
              Api.fileUrl(photoUrl!),
              width: size,
              height: size,
              fit: BoxFit.cover,
              errorBuilder: (_, _, _) => fallback,
            ),
    );
  }
}
