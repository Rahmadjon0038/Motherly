import 'package:flutter/material.dart';

import 'auth.dart';
import 'theme.dart';

/// Tizimga kirish oynasi: ona yoki mutaxassis sifatida kirish tanlanadi.
/// Ona muvaffaqiyatli kirsa `true` bilan yopiladi.
class WelcomePage extends StatelessWidget {
  const WelcomePage({super.key});

  Future<void> _open(BuildContext context, String role) async {
    final ok = await Navigator.push<bool>(
      context,
      MaterialPageRoute(builder: (_) => AuthPage(role: role, upgrade: role == 'user')),
    );
    // Mutaxassis kirsa ilova asosiy oynaga o'tadi (AuthPage hamma sahifalarni yopadi).
    if (ok == true && context.mounted) Navigator.pop(context, true);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Center(child: HeroImage(height: (MediaQuery.of(context).size.height * 0.34).clamp(180, 320))),
                const MotherlyLogo(),
                const SizedBox(height: 8),
                const Text('Ona va bola salomatligi yordamchisi', textAlign: TextAlign.center),
                const SizedBox(height: 32),
                GradientButton(label: 'Ona sifatida kirish', onPressed: () => _open(context, 'user')),
                const SizedBox(height: 14),
                SizedBox(
                  height: 56,
                  child: OutlinedButton(
                    onPressed: () => _open(context, 'nurse'),
                    child: const Text('Mutaxassis sifatida kirish'),
                  ),
                ),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}
