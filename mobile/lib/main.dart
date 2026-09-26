import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart' show CupertinoActivityIndicator;

import 'api.dart';
import 'staff_home.dart';
import 'theme.dart';
import 'user_home.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  session.init();
  runApp(const MotherlyApp());
}

class MotherlyApp extends StatelessWidget {
  const MotherlyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Motherly',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      home: ListenableBuilder(
        listenable: session,
        builder: (_, _) {
          if (!session.ready) return const Scaffold(body: Center(child: CupertinoActivityIndicator(radius: 14)));
          if (session.connectError || session.role == null) return const _ConnectView();
          return switch (session.role) {
            'nurse' => NurseHome(key: ValueKey('n${session.epoch}')),
            'clinic' => const _ClinicAccountNotice(),
            _ => UserHome(key: ValueKey('u${session.epoch}')),
          };
        },
      ),
    );
  }
}

/// Internet yo'q yoki xizmat javob bermasa: ilova ochilmay qolmasin, qayta urinish taklif qilinadi.
class _ConnectView extends StatelessWidget {
  const _ConnectView();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.wifi_off_rounded, size: 56),
            const SizedBox(height: 16),
            const Text('Internetga ulanib bo\'lmadi. Aloqani tekshirib, qayta urinib ko\'ring.', textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton(onPressed: session.retry, child: const Text('Qayta urinish')),
          ]),
        ),
      ),
    );
  }
}

/// Klinika akkaunti mobil ilovada ishlamaydi — u alohida saytda ishlatiladi.
class _ClinicAccountNotice extends StatelessWidget {
  const _ClinicAccountNotice();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.local_hospital_outlined, size: 56),
            const SizedBox(height: 16),
            const Text(
              'Bu raqam klinika akkauntiga tegishli.\nKlinika qabulxonasi alohida saytda ishlaydi.',
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            FilledButton(onPressed: session.logout, child: const Text('Chiqish')),
          ]),
        ),
      ),
    );
  }
}
