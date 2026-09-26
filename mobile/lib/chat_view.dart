import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import 'api.dart';
import 'avatars.dart';
import 'theme.dart';
import 'widgets.dart';

const _bubbleGrey = Color(0xFFEEF2F9);
const _fieldGrey = Color(0xFFF1F4FA);
const _muted = Color(0xFF7A879C);

const _emojis = [
  '😀', '😊', '😍', '🥰', '😉', '🙂', '😅', '😂', '🤗', '🤔', '😔', '😢', '😭', '😴', '🤒', '🤧',
  '👍', '👏', '🙏', '💪', '👋', '❤️', '⭐', '✅', '🍼', '👶', '🧸', '💊', '💉', '🌡️', '🎉', '🌸',
];

/// Chat: xabarlar va suhbat holati har 3 soniyada so'raladi.
/// [ai] bo'lsa yordamchi xabarlari robot avatari bilan chiqadi; aks holda [peerName] bosh harfi bilan.
/// [footerBuilder] hali birorta xabar yozilmagan suhbatda ro'yxat oxirida ko'rsatiladi (masalan tezkor savollar)
/// va `send` bilan xabar yubora oladi. [onPeerStatus] sherikning onlayn holati o'zgarganda chaqiriladi.
class ChatView extends StatefulWidget {
  const ChatView({
    super.key,
    required this.conversationId,
    this.allowAttach = false,
    this.hint = 'Xabar yozing…',
    this.ai = false,
    this.peerName,
    this.showEmoji = false,
    this.footerBuilder,
    this.onPeerStatus,
    this.onMissing,
  });

  final int conversationId;
  final bool allowAttach;
  final String hint;
  final bool ai;
  final String? peerName;
  final bool showEmoji;
  final Widget Function(BuildContext context, Future<void> Function(String text) send)? footerBuilder;
  final void Function(String status)? onPeerStatus;

  /// Suhbat serverda topilmasa (akkaunt almashgan) chaqiriladi: yangi suhbat ochiladi, xato ko'rsatilmaydi.
  final VoidCallback? onMissing;

  @override
  State<ChatView> createState() => _ChatViewState();
}

class _ChatViewState extends State<ChatView> {
  final _ctrl = TextEditingController();
  final _scroll = ScrollController();
  final List<Map<String, dynamic>> _msgs = [];
  Timer? _poll;
  bool _busy = false;
  String? _error;
  int _readUpTo = 0;

  @override
  void initState() {
    super.initState();
    _tick();
    _poll = Timer.periodic(const Duration(seconds: 3), (_) => _tick());
  }

  @override
  void dispose() {
    _poll?.cancel();
    _ctrl.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _tick() async {
    await _load();
    if (!widget.ai) await _loadStatus();
  }

  Future<void> _loadStatus() async {
    try {
      final s = Map<String, dynamic>.from(await Api.I.get('/conversations/${widget.conversationId}/status') as Map);
      if (!mounted) return;
      final read = (s['peerReadUpTo'] as num?)?.toInt() ?? 0;
      if (read != _readUpTo) setState(() => _readUpTo = read);
      widget.onPeerStatus?.call(s['peerStatus'] as String? ?? 'offline');
    } catch (_) {
      // holat ikkinchi darajali: xato bo'lsa jim o'tamiz
    }
  }

  Future<void> _load() async {
    final after = _msgs.isEmpty ? 0 : _msgs.last['id'] as int;
    try {
      final list = await Api.I.get('/conversations/${widget.conversationId}/messages?after=$after') as List;
      if (!mounted) return;
      setState(() => _error = null);
      if (list.isEmpty) return;
      setState(() => _msgs.addAll(list.cast<Map<String, dynamic>>()));
      _scrollDown();
    } catch (e) {
      if (!mounted) return;
      if (e is ApiException && e.status == 404 && widget.onMissing != null) {
        _poll?.cancel();
        widget.onMissing!();
        return;
      }
      setState(() => _error = errorText(e));
    }
  }

  void _scrollDown() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(_scroll.position.maxScrollExtent,
            duration: const Duration(milliseconds: 200), curve: Curves.easeOut);
      }
    });
  }

  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
      await _tick();
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _send(String text) async {
    final t = text.trim();
    if (t.isEmpty) return;
    await _run(() => Api.I.post('/conversations/${widget.conversationId}/messages', {'text': t}));
  }

  Future<void> _sendField() async {
    final text = _ctrl.text;
    _ctrl.clear();
    await _send(text);
  }

  Future<void> _attach() async {
    final file = await FilePicker.pickFile();
    if (file == null) return;
    final bytes = await file.xFile.readAsBytes();
    await _run(() => Api.I.upload('/conversations/${widget.conversationId}/attachments', bytes, file.name));
  }

  Future<void> _pickEmoji() async {
    final e = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Wrap(spacing: 4, runSpacing: 4, children: [
            for (final e in _emojis)
              InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: () => Navigator.pop(ctx, e),
                child: SizedBox(width: 44, height: 44, child: Center(child: Text(e, style: const TextStyle(fontSize: 26)))),
              ),
          ]),
        ),
      ),
    );
    if (e == null) return;
    final sel = _ctrl.selection;
    final at = sel.isValid ? sel.start : _ctrl.text.length;
    _ctrl.value = TextEditingValue(
      text: _ctrl.text.replaceRange(at, sel.isValid ? sel.end : at, e),
      selection: TextSelection.collapsed(offset: at + e.length),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final showFooter = widget.footerBuilder != null && _msgs.isNotEmpty && !_msgs.any((m) => m['mine'] == true);
    return Column(children: [
      if (_error != null)
        Container(
          width: double.infinity,
          color: cs.errorContainer,
          padding: const EdgeInsets.all(8),
          child: Text(_error!, style: TextStyle(color: cs.onErrorContainer), textAlign: TextAlign.center),
        ),
      Expanded(
        child: ListView.builder(
          controller: _scroll,
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          itemCount: _msgs.length + (showFooter ? 1 : 0),
          itemBuilder: (context, i) {
            if (i == _msgs.length) return widget.footerBuilder!(context, _send);
            final m = _msgs[i];
            final day = _dayOf(m['createdAt'] as String?);
            final newDay = i == 0 || day != _dayOf(_msgs[i - 1]['createdAt'] as String?);
            return Column(children: [
              if (newDay && day != null) _DayChip(day),
              _Bubble(
                m,
                ai: widget.ai,
                peerName: widget.peerName,
                read: (m['id'] as int) <= _readUpTo || m['read'] == true,
              ),
            ]);
          },
        ),
      ),
      SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 6, 12, 10),
          child: Row(children: [
            if (widget.allowAttach)
              IconButton(
                onPressed: _busy ? null : _attach,
                icon: const Icon(Icons.attach_file, color: _muted),
                tooltip: 'Rasm yoki hujjat',
              ),
            Expanded(
              child: TextField(
                controller: _ctrl,
                minLines: 1,
                maxLines: 4,
                textInputAction: TextInputAction.send,
                onSubmitted: (_) => _sendField(),
                decoration: InputDecoration(
                  hintText: widget.hint,
                  hintStyle: const TextStyle(color: _muted),
                  filled: true,
                  fillColor: _fieldGrey,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
                  suffixIcon: widget.showEmoji
                      ? IconButton(
                          onPressed: _pickEmoji,
                          icon: const Icon(Icons.sentiment_satisfied_alt_outlined, color: _muted),
                          tooltip: 'Emoji',
                        )
                      : null,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(28), borderSide: BorderSide.none),
                  enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(28), borderSide: BorderSide.none),
                  focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(28), borderSide: BorderSide.none),
                ),
              ),
            ),
            const SizedBox(width: 8),
            SizedBox(
              width: 52,
              height: 52,
              child: IconButton.filled(
                onPressed: _busy ? null : _sendField,
                icon: const Icon(Icons.send_rounded, size: 22),
                tooltip: 'Yuborish',
                style: IconButton.styleFrom(backgroundColor: brand, foregroundColor: Colors.white),
              ),
            ),
          ]),
        ),
      ),
    ]);
  }
}

DateTime? _local(String? iso) => iso == null ? null : DateTime.tryParse(iso)?.toLocal();

String? _dayOf(String? iso) {
  final d = _local(iso);
  return d == null ? null : '${d.year}-${d.month}-${d.day}';
}

const _months = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avg', 'sen', 'okt', 'noy', 'dek'];

/// "Bugun", "Kecha" yoki "26 sen".
class _DayChip extends StatelessWidget {
  const _DayChip(this.day);
  final String day;

  @override
  Widget build(BuildContext context) {
    final p = day.split('-').map(int.parse).toList();
    final d = DateTime(p[0], p[1], p[2]);
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final label = d == today
        ? 'Bugun'
        : d == today.subtract(const Duration(days: 1))
            ? 'Kecha'
            : '${d.day} ${_months[d.month - 1]}';
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Center(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 5),
          decoration: BoxDecoration(color: _bubbleGrey, borderRadius: BorderRadius.circular(14)),
          child: Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: _muted)),
        ),
      ),
    );
  }
}

/// "18:05" (24 soatli, telefon vaqti bo'yicha).
String _clock(String? iso) {
  final d = _local(iso);
  if (d == null) return '';
  return '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
}

class _Bubble extends StatelessWidget {
  const _Bubble(this.m, {required this.ai, required this.peerName, required this.read});
  final Map<String, dynamic> m;
  final bool ai;
  final String? peerName;
  final bool read;

  @override
  Widget build(BuildContext context) {
    final mine = m['mine'] == true;
    final fg = mine ? Colors.white : ink;
    final kind = m['kind'] as String;
    final url = m['fileUrl'] as String?;

    Widget content;
    if (kind == 'image' && url != null) {
      content = ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: Image.network(
          Api.fileUrl(url),
          width: 220,
          fit: BoxFit.cover,
          errorBuilder: (_, _, _) => Text('🖼 ${m['text']}', style: TextStyle(color: fg)),
        ),
      );
    } else if (kind == 'file') {
      content = Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(Icons.insert_drive_file, size: 20, color: fg),
        const SizedBox(width: 8),
        Flexible(child: Text(m['text'] as String, style: TextStyle(color: fg))),
      ]);
    } else {
      content = Text(m['text'] as String, style: TextStyle(color: fg, fontSize: 16, height: 1.35));
    }

    final bubble = Container(
      padding: kind == 'image' ? const EdgeInsets.all(4) : const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: mine ? brand : _bubbleGrey,
        borderRadius: BorderRadius.only(
          topLeft: const Radius.circular(22),
          topRight: const Radius.circular(22),
          bottomLeft: Radius.circular(mine ? 22 : 6),
          bottomRight: Radius.circular(mine ? 6 : 22),
        ),
      ),
      child: content,
    );
    final time = Padding(
      padding: EdgeInsets.only(top: 4, left: mine ? 0 : 4, right: mine ? 4 : 0),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Text(_clock(m['createdAt'] as String?), style: const TextStyle(fontSize: 12, color: _muted)),
        // O'qilgan xabar: ko'k qo'sh belgi, yuborilgan: kulrang bitta belgi.
        if (mine) ...[
          const SizedBox(width: 4),
          Icon(read ? Icons.done_all : Icons.done, size: 16, color: read ? brand : _muted),
        ],
      ]),
    );
    final column = Column(
      crossAxisAlignment: mine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
      children: [bubble, time],
    );

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisAlignment: mine ? MainAxisAlignment.end : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (!mine) ...[
            if (ai)
              const CircleAvatar(radius: 20, backgroundColor: brandLight, child: Icon(Icons.smart_toy_outlined, color: brand, size: 22))
            else if (peerName != null)
              PeerAvatar(name: peerName!, radius: 20),
            const SizedBox(width: 10),
          ],
          Flexible(
            child: ConstrainedBox(
              constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.72),
              child: column,
            ),
          ),
        ],
      ),
    );
  }
}
