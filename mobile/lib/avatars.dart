import 'package:flutter/material.dart';

/// Ism bo'yicha doim bir xil pastel rang.
const _palette = [
  (Color(0xFFDCE8FF), Color(0xFF2A4C9A)),
  (Color(0xFFFCE4EC), Color(0xFF9C2A55)),
  (Color(0xFFDDF5EE), Color(0xFF1B7A5C)),
  (Color(0xFFEDE5FA), Color(0xFF5B3BA3)),
  (Color(0xFFFFEBDD), Color(0xFFB15A18)),
];

(Color, Color) avatarColors(String name) => _palette[name.codeUnits.fold(0, (a, c) => a + c) % _palette.length];

String initialOf(String name) {
  final t = name.replaceAll('+', '').trim();
  return t.isEmpty ? '?' : t.characters.first.toUpperCase();
}

Color statusColor(String? status) => switch (status) {
      'online' => const Color(0xFF2EB85C),
      'away' => const Color(0xFFF5A623),
      _ => const Color(0xFF9AA5B4),
    };

/// Ism boshi harfi bilan doira. [status] berilsa burchagida onlayn belgisi (yashil, sariq yoki kulrang) chiqadi.
class PeerAvatar extends StatelessWidget {
  const PeerAvatar({super.key, required this.name, this.status, this.radius = 26});
  final String name;
  final String? status;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = avatarColors(name);
    final dot = radius * 0.42;
    return SizedBox(
      width: radius * 2,
      height: radius * 2,
      child: Stack(clipBehavior: Clip.none, children: [
        CircleAvatar(
          radius: radius,
          backgroundColor: bg,
          child: Text(initialOf(name), style: TextStyle(color: fg, fontWeight: FontWeight.w800, fontSize: radius * 0.8)),
        ),
        if (status != null)
          Positioned(
            right: 0,
            bottom: 0,
            child: Container(
              width: dot,
              height: dot,
              decoration: BoxDecoration(
                color: statusColor(status),
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 2),
              ),
            ),
          ),
      ]),
    );
  }
}
