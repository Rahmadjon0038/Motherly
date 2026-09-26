import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/cupertino.dart' show CupertinoActivityIndicator;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:video_player/video_player.dart';

import 'api.dart';
import 'payment.dart' show som;
import 'theme.dart';
import 'videos.dart' show LessonPlayer, LessonThumb;
import 'widgets.dart';

const _muted = Color(0xFF7A879C);

/// Mutaxassisning o'z video darslari: YouTube havolasi yoki fayl bilan yuklaydi, narxini o'zi belgilaydi.
/// Onalar bu videolarni muallif (mutaxassis) nomi bilan ko'radi va pulliklarini sotib oladi.
class MyVideosView extends StatefulWidget {
  const MyVideosView({super.key});

  @override
  State<MyVideosView> createState() => _MyVideosViewState();
}

class _MyVideosViewState extends State<MyVideosView> {
  int _version = 0;

  Future<void> _edit([Map<String, dynamic>? video]) async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _VideoForm(video: video),
    );
    if (saved == true && mounted) setState(() => _version++);
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        LoadView<List<Map<String, dynamic>>>(
          key: ValueKey(_version),
          load: () async => (await Api.I.get('/nurse/videos') as List)
              .map((e) => Map<String, dynamic>.from(e as Map))
              .toList(),
          builder: (context, list, reload) {
            if (list.isEmpty) {
              return const Center(
                child: Padding(
                  padding: EdgeInsets.all(32),
                  child: Text(
                    'Hali video yo\'q.\nO\'zingiz tayyorlagan darsni yuklang, narxini o\'zingiz belgilaysiz.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: _muted),
                  ),
                ),
              );
            }
            return RefreshIndicator(
              onRefresh: () async => reload(),
              child: ListView.builder(
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 96),
                itemCount: list.length,
                itemBuilder: (_, i) {
                  final v = list[i];
                  final price = (v['price'] as num).toInt();
                  final mins = (((v['durationSec'] as num?) ?? 0) / 60).ceil();
                  return Card(
                    clipBehavior: Clip.antiAlias,
                    child: InkWell(
                      onTap: () async {
                        final changed = await Navigator.push<bool>(context, MaterialPageRoute(builder: (_) => MyVideoPage(video: v)));
                        if (changed == true && mounted) setState(() => _version++);
                      },
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Row(children: [
                          LessonThumb(url: (v['videoUrl'] as String?) ?? '', width: 96, height: 68),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text(v['title'] as String, maxLines: 2, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.titleSmall),
                              const SizedBox(height: 4),
                              Text('${mins > 0 ? '$mins daqiqa' : 'Video'}${price > 0 ? ' · ${v['purchases']} ta sotilgan' : ''}', style: Theme.of(context).textTheme.bodySmall),
                              const SizedBox(height: 6),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                decoration: BoxDecoration(
                                  color: price > 0 ? const Color(0xFFFFF1D6) : const Color(0xFFE2F6EA),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Text(price > 0 ? '${som(price)} so\'m' : 'Bepul',
                                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: price > 0 ? const Color(0xFF9A5B00) : const Color(0xFF1B7A4A))),
                              ),
                            ]),
                          ),
                        ]),
                      ),
                    ),
                  );
                },
              ),
            );
          },
        ),
        Positioned(
          right: 16,
          bottom: 16,
          child: FloatingActionButton.extended(
            onPressed: () => _edit(),
            icon: const Icon(Icons.add),
            label: const Text('Video qo\'shish'),
          ),
        ),
      ],
    );
  }
}

class _VideoForm extends StatefulWidget {
  const _VideoForm({this.video});
  final Map<String, dynamic>? video;

  @override
  State<_VideoForm> createState() => _VideoFormState();
}

class _VideoFormState extends State<_VideoForm> {
  late final _title = TextEditingController(
    text: widget.video?['title'] as String? ?? '',
  );
  late final _desc = TextEditingController(
    text: widget.video?['description'] as String? ?? '',
  );
  late final _link = TextEditingController(
    text: widget.video != null && widget.video!['isFile'] != true
        ? widget.video!['videoUrl'] as String? ?? ''
        : '',
  );
  late final _price = TextEditingController(
    text: ((widget.video?['price'] as num?) ?? 0) > 0
        ? '${widget.video!['price']}'
        : '',
  );
  late bool _paid = ((widget.video?['price'] as num?) ?? 0) > 0;
  bool _useFile = false;
  PlatformFile? _file;
  bool _busy = false;
  String? _error;

  bool get _editing => widget.video != null;

  @override
  void dispose() {
    _title.dispose();
    _desc.dispose();
    _link.dispose();
    _price.dispose();
    super.dispose();
  }

  Future<void> _pick() async {
    final f = await FilePicker.pickFile(type: FileType.video);
    if (f != null) setState(() => _file = f);
  }

  Future<int> _fileSeconds(String path) async {
    final c = VideoPlayerController.file(File(path));
    try {
      await c.initialize();
      return c.value.duration.inSeconds;
    } catch (_) {
      return 0;
    } finally {
      await c.dispose();
    }
  }

  Future<void> _save() async {
    final title = _title.text.trim();
    final price = _paid
        ? int.tryParse(_price.text.replaceAll(' ', '')) ?? 0
        : 0;
    String? err;
    if (title.isEmpty) {
      err = 'Dars nomini yozing';
    } else if (_paid && price < 1000) {
      err = 'Narx kamida 1 000 so\'m bo\'lsin';
    } else if (!_editing && _useFile && _file == null) {
      err = 'Video faylini tanlang';
    } else if (!_editing && !_useFile && _link.text.trim().isEmpty) {
      err = 'YouTube havolasini kiriting';
    }
    if (err != null) return setState(() => _error = err);

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final fields = {
        'title': title,
        'description': _desc.text.trim(),
        'price': '$price',
      };
      if (_editing) {
        await Api.I.put('/nurse/videos/${widget.video!['id']}', fields);
      } else if (_useFile) {
        final path = _file!.path;
        if (path == null) throw 'Faylni o\'qib bo\'lmadi';
        fields['durationSec'] = '${await _fileSeconds(path)}';
        await Api.I.upload(
          '/nurse/videos',
          await File(path).readAsBytes(),
          _file!.name,
          fields: fields,
        );
      } else {
        await Api.I.post('/nurse/videos', {
          ...fields,
          'videoUrl': _link.text.trim(),
        });
      }
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              _editing ? 'Videoni tahrirlash' : 'Yangi video',
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w800,
                color: ink,
              ),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: _title,
              maxLength: 150,
              decoration: const InputDecoration(
                labelText: 'Dars nomi *',
                counterText: '',
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _desc,
              maxLines: 3,
              maxLength: 2000,
              decoration: const InputDecoration(
                labelText: 'Tavsif',
                counterText: '',
              ),
            ),
            if (!_editing) ...[
              const SizedBox(height: 14),
              SegmentedButton<bool>(
                segments: const [
                  ButtonSegment(
                    value: false,
                    label: Text('YouTube havola'),
                    icon: Icon(Icons.link),
                  ),
                  ButtonSegment(
                    value: true,
                    label: Text('Fayl yuklash'),
                    icon: Icon(Icons.upload_file),
                  ),
                ],
                selected: {_useFile},
                onSelectionChanged: (s) => setState(() => _useFile = s.first),
              ),
              const SizedBox(height: 12),
              if (_useFile)
                OutlinedButton.icon(
                  onPressed: _busy ? null : _pick,
                  icon: const Icon(Icons.video_file_outlined),
                  label: Text(
                    _file?.name ?? 'Video tanlang (MP4, MOV, WebM)',
                    overflow: TextOverflow.ellipsis,
                  ),
                )
              else
                TextField(
                  controller: _link,
                  keyboardType: TextInputType.url,
                  decoration: const InputDecoration(
                    labelText: 'YouTube havolasi',
                    hintText: 'https://youtu.be/...',
                  ),
                ),
            ],
            const SizedBox(height: 14),
            SegmentedButton<bool>(
              segments: const [
                ButtonSegment(value: false, label: Text('Bepul')),
                ButtonSegment(value: true, label: Text('Pullik')),
              ],
              selected: {_paid},
              onSelectionChanged: (s) => setState(() => _paid = s.first),
            ),
            if (_paid) ...[
              const SizedBox(height: 12),
              TextField(
                controller: _price,
                keyboardType: TextInputType.number,
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(9),
                ],
                decoration: const InputDecoration(
                  labelText: 'Narxi',
                  suffixText: 'so\'m',
                  helperText: 'Kamida 1 000 so\'m',
                ),
              ),
            ],
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(
                  _error!,
                  style: const TextStyle(
                    color: Color(0xFFD64545),
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _busy ? null : _save,
              child: _busy
                  ? const Padding(
                      padding: EdgeInsets.all(2),
                      child: CupertinoActivityIndicator(color: Colors.white),
                    )
                  : Text(_editing ? 'Saqlash' : 'Yuklash'),
            ),
          ],
        ),
      ),
    );
  }
}

/// Mutaxassisning o'z videosi: ona ko'radigan ko'rinishda ijro etiladi, bu yerdan tahrirlash va o'chirish mumkin.
class MyVideoPage extends StatefulWidget {
  const MyVideoPage({super.key, required this.video});
  final Map<String, dynamic> video;

  @override
  State<MyVideoPage> createState() => _MyVideoPageState();
}

class _MyVideoPageState extends State<MyVideoPage> {
  Future<void> _edit() async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _VideoForm(video: widget.video),
    );
    if (saved == true && mounted) Navigator.pop(context, true);
  }

  Future<void> _delete() async {
    final v = widget.video;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Videoni o\'chirish'),
        content: Text('"${v['title']}" o\'chiriladi. Sotib olgan onalar ham uni ko\'ra olmaydi.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Bekor qilish')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('O\'chirish')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await Api.I.delete('/nurse/videos/${v['id']}');
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final v = widget.video;
    final price = (v['price'] as num).toInt();
    final mins = (((v['durationSec'] as num?) ?? 0) / 60).ceil();
    final desc = (v['description'] as String?) ?? '';
    return Scaffold(
      appBar: AppBar(
        title: const Text('Mening videom'),
        actions: [
          IconButton(icon: const Icon(Icons.edit_outlined), tooltip: 'Tahrirlash', onPressed: _edit),
          IconButton(icon: const Icon(Icons.delete_outline), tooltip: 'O\'chirish', onPressed: _delete),
        ],
      ),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        ClipRRect(borderRadius: BorderRadius.circular(16), child: LessonPlayer(url: (v['videoUrl'] as String?) ?? '')),
        const SizedBox(height: 16),
        Text(v['title'] as String, style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 8),
        Wrap(spacing: 8, children: [
          Chip(label: Text(price > 0 ? '${som(price)} so\'m' : 'Bepul')),
          if (mins > 0) Chip(avatar: const Icon(Icons.schedule, size: 16), label: Text('$mins daqiqa')),
          if (price > 0) Chip(avatar: const Icon(Icons.shopping_bag_outlined, size: 16), label: Text('${v['purchases']} ta sotilgan')),
        ]),
        if (desc.isNotEmpty) ...[const SizedBox(height: 12), Text(desc)],
      ]),
    );
  }
}
