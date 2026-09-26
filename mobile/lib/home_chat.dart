import 'package:flutter/material.dart';

import 'api.dart';
import 'chat_view.dart';
import 'profile.dart';
import 'theme.dart';
import 'widgets.dart';

const _muted = Color(0xFF7A879C);

/// Onaning bosh sahifasi: "Chat" (AI yordamchi, tezkor savollar) va "Mening mutaxassisim" (haqiqiy odam bilan suhbatlar).
class ChatHome extends StatefulWidget {
  const ChatHome({super.key});

  @override
  State<ChatHome> createState() => _ChatHomeState();
}

class _ChatHomeState extends State<ChatHome> {
  int _seg = 0;
  int _listVersion = 0; // "Mening mutaxassisim" ochilganda ro'yxat (o'qilmagan xabarlar) yangilanadi

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFFE6F0FF), Color(0xFFFEFEFE)],
          stops: [0, 0.4],
        ),
      ),
      child: SafeArea(
        bottom: false,
        child: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 16, 0),
            child: Row(children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('Chat', style: TextStyle(fontSize: 32, fontWeight: FontWeight.w800, color: ink)),
                  if (_seg == 0) const Text('Savollaringizga har doim tayyor', style: TextStyle(color: _muted, fontSize: 15)),
                ]),
              ),
              ListenableBuilder(
                listenable: session,
                builder: (_, _) => session.isGuest
                    ? Material(
                        color: Colors.white,
                        elevation: 2,
                        shadowColor: const Color(0x2214213D),
                        shape: const StadiumBorder(),
                        child: InkWell(
                          customBorder: const StadiumBorder(),
                          onTap: () => openProfile(context),
                          child: const Padding(
                            padding: EdgeInsets.symmetric(horizontal: 16, vertical: 13),
                            child: Row(mainAxisSize: MainAxisSize.min, children: [
                              Icon(Icons.login_rounded, size: 20, color: brand),
                              SizedBox(width: 6),
                              Text('Kirish', style: TextStyle(fontWeight: FontWeight.w800, color: brand, fontSize: 15)),
                            ]),
                          ),
                        ),
                      )
                    : _CircleButton(icon: Icons.person_outline, tooltip: 'Profil', onTap: () => openProfile(context)),
              ),
              // Mehmon chiqib ketolmaydi (ma'lumotlari yo'qolmasin): chiqish tugmasi faqat ro'yxatdan o'tganlarda.
              ListenableBuilder(
                listenable: session,
                builder: (_, _) => session.isGuest
                    ? const SizedBox.shrink()
                    : Padding(
                        padding: const EdgeInsets.only(left: 12),
                        child: _CircleButton(icon: Icons.logout, tooltip: 'Chiqish', onTap: session.logout),
                      ),
              ),
            ]),
          ),
          const SizedBox(height: 16),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: _Segmented(
              index: _seg,
              onChanged: (i) => setState(() {
                _seg = i;
                if (i == 1) _listVersion++;
              }),
            ),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: IndexedStack(index: _seg, children: [
              LoadView<int>(
                load: () async => (await Api.I.get('/chat/ai'))['conversationId'] as int,
                builder: (_, id, _) => ChatView(
                  conversationId: id,
                  ai: true,
                  allowAttach: true,
                  hint: 'Bolangiz haqida yozing…',
                ),
              ),
              KeyedSubtree(
                key: ValueKey(_listVersion),
                child: const ConversationList(
                  emptyText: 'Hali mutaxassis yollamagansiz.\n"Mutaxassis" bo\'limidan konsultatsiya oling.',
                ),
              ),
            ]),
          ),
        ]),
      ),
    );
  }
}

class _CircleButton extends StatelessWidget {
  const _CircleButton({required this.icon, required this.onTap, required this.tooltip});
  final IconData icon;
  final VoidCallback onTap;
  final String tooltip;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      shape: const CircleBorder(),
      elevation: 2,
      shadowColor: const Color(0x2214213D),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: Tooltip(
          message: tooltip,
          child: SizedBox(width: 48, height: 48, child: Icon(icon, color: ink)),
        ),
      ),
    );
  }
}

class _Segmented extends StatelessWidget {
  const _Segmented({required this.index, required this.onChanged});
  final int index;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    Widget seg(int i, IconData icon, String label) {
      final selected = index == i;
      return Expanded(
        child: GestureDetector(
          onTap: () => onChanged(i),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            height: 46,
            decoration: BoxDecoration(
              color: selected ? Colors.white : Colors.transparent,
              borderRadius: BorderRadius.circular(24),
              boxShadow: selected ? const [BoxShadow(color: Color(0x1A14213D), blurRadius: 8, offset: Offset(0, 2))] : null,
            ),
            // Tor ekranda yozuv kesilmasin: kerak bo'lsa biroz kichrayadi.
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 10),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(icon, size: 20, color: selected ? brand : _muted),
                  const SizedBox(width: 8),
                  Text(label, maxLines: 1, style: TextStyle(fontWeight: FontWeight.w700, color: selected ? brand : _muted)),
                ]),
              ),
            ),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: const Color(0xFFE9EFF8), borderRadius: BorderRadius.circular(28)),
      child: Row(children: [
        seg(0, Icons.chat_bubble_outline, 'Chat'),
        seg(1, Icons.person_outline, 'Mening mutaxassisim'),
      ]),
    );
  }
}
