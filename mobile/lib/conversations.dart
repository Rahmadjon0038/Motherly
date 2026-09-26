import 'package:flutter/material.dart';

import 'api.dart';
import 'avatars.dart';
import 'chat_view.dart';
import 'nurse_profile.dart';
import 'theme.dart';
import 'widgets.dart';

const _muted = Color(0xFF7A879C);
const _unreadBlue = Color(0xFF2F7DF6);

/// Suhbatlar ro'yxati: avatar, onlayn belgisi, oxirgi xabar, vaqt va o'qilmagan xabarlar soni.
/// Ona uchun "Mening mutaxassisim", mutaxassis uchun "Mening bemorlarim".
class ConversationList extends StatelessWidget {
  const ConversationList({super.key, required this.emptyText});
  final String emptyText;

  @override
  Widget build(BuildContext context) {
    return LoadView<List<Map<String, dynamic>>>(
      load: () async => (await Api.I.get('/conversations') as List).map((c) => Map<String, dynamic>.from(c as Map)).toList(),
      builder: (context, list, reload) => RefreshIndicator(
        onRefresh: () async => reload(),
        child: list.isEmpty
            ? ListView(children: [
                Padding(padding: const EdgeInsets.all(32), child: Text(emptyText, textAlign: TextAlign.center)),
              ])
            : ListView.separated(
                itemCount: list.length,
                separatorBuilder: (_, _) => const Divider(height: 1, indent: 88, endIndent: 16, color: Color(0xFFEDF1F7)),
                itemBuilder: (_, i) => _Row(list[i], onOpen: () async {
                  await Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => ChatPage(
                        title: list[i]['title'] as String,
                        subtitle: list[i]['subtitle'] as String?,
                        conversationId: list[i]['id'] as int,
                        status: list[i]['peerStatus'] as String?,
                      ),
                    ),
                  );
                  reload();
                }),
              ),
      ),
    );
  }
}

/// "13:19" bugun, "Kecha", aks holda "12.09".
String _listTime(String? iso) {
  final d = iso == null ? null : DateTime.tryParse(iso)?.toLocal();
  if (d == null) return '';
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final day = DateTime(d.year, d.month, d.day);
  if (day == today) return '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
  if (day == today.subtract(const Duration(days: 1))) return 'Kecha';
  return '${d.day.toString().padLeft(2, '0')}.${d.month.toString().padLeft(2, '0')}';
}

class _Row extends StatelessWidget {
  const _Row(this.c, {required this.onOpen});
  final Map<String, dynamic> c;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final title = c['title'] as String;
    final unread = c['unread'] as int? ?? 0;
    final sub = [if ((c['subtitle'] as String?)?.isNotEmpty ?? false) c['subtitle'], c['lastMessage']].join(' · ');
    return InkWell(
      onTap: onOpen,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 12, 12),
        child: Row(children: [
          PeerAvatar(name: title, status: c['peerStatus'] as String?, radius: 28),
          const SizedBox(width: 14),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: TextStyle(fontSize: 16, fontWeight: unread > 0 ? FontWeight.w800 : FontWeight.w700, color: ink)),
              const SizedBox(height: 3),
              Text(sub, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: _muted, fontSize: 14)),
            ]),
          ),
          const SizedBox(width: 8),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text(_listTime(c['lastAt'] as String?), style: const TextStyle(color: _muted, fontSize: 13)),
            const SizedBox(height: 6),
            if (unread > 0)
              Container(
                constraints: const BoxConstraints(minWidth: 22),
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                decoration: BoxDecoration(color: _unreadBlue, borderRadius: BorderRadius.circular(12)),
                child: Text('$unread', textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700)),
              )
            else
              const Icon(Icons.chevron_right, color: _muted, size: 20),
          ]),
        ]),
      ),
    );
  }
}

/// Mutaxassis (yoki bemor) bilan chat. Ona uchun sarlavhada mutaxassisning ismi, mutaxassisligi
/// va profil tugmasi bor. [status] — sherikning onlayn holati (chat ochiq turganda yangilanadi).
class ChatPage extends StatefulWidget {
  const ChatPage({super.key, required this.title, required this.conversationId, this.subtitle, this.status});
  final String title;
  final String? subtitle;
  final int conversationId;
  final String? status;

  @override
  State<ChatPage> createState() => _ChatPageState();
}

class _ChatPageState extends State<ChatPage> {
  late String? _status = widget.status;

  bool get _isMother => session.role == 'user';

  @override
  Widget build(BuildContext context) {
    final sub = widget.subtitle;
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        // Ona uchun avatar yoki ism bosilsa mutaxassisning profili ochiladi.
        title: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: _isMother
              ? () => Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => PeerProfilePage(conversationId: widget.conversationId)),
                  )
              : null,
          child: Row(children: [
            PeerAvatar(name: widget.title, status: _status, radius: 22),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(widget.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: ink)),
                if (sub != null && sub.isNotEmpty) Text(sub, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: _muted)),
              ]),
            ),
          ]),
        ),
      ),
      body: Column(children: [
        if (_isMother && sub != null && sub.isNotEmpty) _InfoCard(sub),
        Expanded(
          child: ChatView(
            conversationId: widget.conversationId,
            allowAttach: true,
            showEmoji: true,
            peerName: widget.title,
            onPeerStatus: (s) {
              if (s != _status && mounted) setState(() => _status = s);
            },
          ),
        ),
      ]),
    );
  }
}

class _InfoCard extends StatelessWidget {
  const _InfoCard(this.specialty);
  final String specialty;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 4, 16, 0),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFF6FAFF),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFFE3ECF8)),
      ),
      child: Row(children: [
        const CircleAvatar(radius: 24, backgroundColor: Color(0xFFDDF5EE), child: Icon(Icons.medical_services_outlined, color: Color(0xFF1B9A6C))),
        const SizedBox(width: 14),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(specialty, style: const TextStyle(fontWeight: FontWeight.w700, color: ink)),
            const SizedBox(height: 2),
            const Text('Savollaringizga ishonchli javob beradi', style: TextStyle(color: _muted, fontSize: 13)),
          ]),
        ),
      ]),
    );
  }
}
