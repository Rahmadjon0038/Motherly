import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'api.dart';
import 'theme.dart';
import 'widgets.dart';

/// Ona: telefon raqam + SMS kod (MVP: haqiqiy SMS yo'q, demo kod).
/// Mutaxassis (hamshira): klinika bergan telefon raqam + parol.
class AuthPage extends StatefulWidget {
  const AuthPage({super.key, required this.role, this.upgrade = false});

  /// 'user' (ona) yoki 'nurse' (mutaxassis).
  final String role;

  /// Mehmon akkauntini ro'yxatdan o'tkazish: muvaffaqiyatli bo'lsa avvalgi sahifaga `true` bilan qaytadi
  /// (aks holda hamma sahifalar yopilib, asosiy oyna ochiladi).
  final bool upgrade;

  @override
  State<AuthPage> createState() => _AuthPageState();
}

class _AuthPageState extends State<AuthPage> {
  final _phone = TextEditingController();
  final _code = TextEditingController();
  final _password = TextEditingController();
  bool _obscure = true;
  bool _codeSent = false;
  bool _busy = false;
  String? _hint;

  String get _fullPhone => '+998${_phone.text}';

  @override
  void dispose() {
    _phone.dispose();
    _code.dispose();
    _password.dispose();
    super.dispose();
  }

  bool get _isNurse => widget.role == 'nurse';

  Future<void> _submit() async {
    setState(() => _busy = true);
    try {
      if (_isNurse) {
        final res = await Api.I.post('/auth/login', {'phone': _fullPhone, 'password': _password.text});
        await session.login(res['token'] as String, Map<String, dynamic>.from(res['user'] as Map));
        if (!mounted) return;
        if (widget.upgrade) {
          Navigator.of(context).pop(true);
        } else {
          Navigator.of(context).popUntil((r) => r.isFirst);
        }
      } else if (!_codeSent) {
        final res = await Api.I.post('/auth/request-code', {'phone': _fullPhone});
        setState(() {
          _codeSent = true;
          _hint = res['devHint'] as String?;
        });
      } else {
        final res = await Api.I.post('/auth/verify', {'phone': _fullPhone, 'code': _code.text, 'role': widget.role});
        await session.login(res['token'] as String, Map<String, dynamic>.from(res['user'] as Map));
        // Welcome sahifasini yopib, asosiy oynaga o'tamiz.
        if (!mounted) return;
        if (widget.upgrade) {
          Navigator.of(context).pop(true);
        } else {
          Navigator.of(context).popUntil((r) => r.isFirst);
        }
      }
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final canSubmit = _isNurse
        ? _phone.text.length == 9 && _password.text.isNotEmpty
        : _codeSent
            ? _code.text.length == 4
            : _phone.text.length == 9;
    return Scaffold(
      appBar: Navigator.of(context).canPop() ? AppBar() : null,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Center(child: HeroImage(height: (MediaQuery.of(context).size.height * 0.32).clamp(160, 300))),
                const MotherlyLogo(),
                const SizedBox(height: 28),
                if (_isNurse) ...[
                  _phoneField(),
                  const SizedBox(height: 12),
                  _passwordField(),
                ] else
                  _codeSent ? _codeField() : _phoneField(),
                if (!_isNurse && _codeSent && _hint != null)
                  Padding(padding: const EdgeInsets.only(top: 8, left: 8), child: Text(_hint!)),
                const SizedBox(height: 24),
                GradientButton(
                  label: _isNurse || _codeSent ? 'Kirish' : 'SMS kod olish',
                  
                  busy: _busy,
                  onPressed: canSubmit ? _submit : null,
                ),
                if (_isNurse)
                  const Padding(
                    padding: EdgeInsets.only(top: 12),
                    child: Text('Telefon raqam va parolni klinikangiz beradi.', textAlign: TextAlign.center),
                  ),
                if (!_isNurse && _codeSent)
                  TextButton(
                    onPressed: _busy ? null : () => setState(() => _codeSent = false),
                    child: const Text('Raqamni o\'zgartirish'),
                  ),
              ]),
            ),
          ),
        ),
      ),
    );
  }

  Widget _phoneField() {
    return Container(
      height: 64,
      padding: const EdgeInsets.only(left: 16, right: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFFDCE6F5), width: 1.4),
      ),
      child: Row(children: [
        const Text('🇺🇿', style: TextStyle(fontSize: 26)),
        Container(width: 1, height: 30, margin: const EdgeInsets.symmetric(horizontal: 12), color: const Color(0xFFDCE6F5)),
        const Text('+998', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: ink)),
        const SizedBox(width: 8),
        Expanded(
          child: TextField(
            controller: _phone,
            keyboardType: TextInputType.phone,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(9)],
            onChanged: (_) => setState(() {}),
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: ink),
            decoration: const InputDecoration(
              hintText: '90 123 45 67',
              hintStyle: TextStyle(color: Color(0xFFB4BFCE), fontWeight: FontWeight.w500),
              border: InputBorder.none,
              enabledBorder: InputBorder.none,
              focusedBorder: InputBorder.none,
              filled: false,
              contentPadding: EdgeInsets.zero,
            ),
          ),
        ),
        const CircleAvatar(
          radius: 22,
          backgroundColor: Color(0xFFEFF2F6),
          child: Icon(Icons.phone, color: ink),
        ),
      ]),
    );
  }

  Widget _passwordField() {
    return Container(
      height: 64,
      padding: const EdgeInsets.only(left: 20, right: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFFDCE6F5), width: 1.4),
      ),
      child: Row(children: [
        Expanded(
          child: TextField(
            controller: _password,
            obscureText: _obscure,
            autocorrect: false,
            enableSuggestions: false,
            onChanged: (_) => setState(() {}),
            onSubmitted: (_) => _phone.text.length == 9 && _password.text.isNotEmpty ? _submit() : null,
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: ink),
            decoration: const InputDecoration(
              hintText: 'Parol',
              hintStyle: TextStyle(color: Color(0xFFB4BFCE), fontWeight: FontWeight.w500),
              border: InputBorder.none,
              enabledBorder: InputBorder.none,
              focusedBorder: InputBorder.none,
              filled: false,
              contentPadding: EdgeInsets.zero,
            ),
          ),
        ),
        IconButton(
          onPressed: () => setState(() => _obscure = !_obscure),
          tooltip: _obscure ? 'Parolni ko\'rsatish' : 'Parolni yashirish',
          icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined, color: ink),
        ),
      ]),
    );
  }

  Widget _codeField() {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Padding(
        padding: const EdgeInsets.only(left: 8, bottom: 8),
        child: Text('$_fullPhone raqamiga SMS kod yuborildi'),
      ),
      TextField(
        controller: _code,
        keyboardType: TextInputType.number,
        autofocus: true,
        inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(4)],
        onChanged: (_) => setState(() {}),
        onSubmitted: (_) => _code.text.length == 4 ? _submit() : null,
        textAlign: TextAlign.center,
        style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800, letterSpacing: 12, color: ink),
        decoration: const InputDecoration(hintText: '••••', contentPadding: EdgeInsets.symmetric(vertical: 18)),
      ),
    ]);
  }
}

/// Mehmon uchun "ro'yxatdan o'ting" oynasi. Ro'yxatdan o'tgan bo'lsa darhol `true`.
/// [why] — nima uchun telefon kerakligi (masalan "To'lov uchun").
Future<bool> ensureRegistered(BuildContext context, {required String why}) async {
  if (!session.isGuest) return true;
  final go = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      icon: const Icon(Icons.verified_user_outlined, size: 44, color: brand),
      title: const Text('Ro\'yxatdan o\'ting', textAlign: TextAlign.center),
      content: Text(
        '$why telefon raqamingizni tasdiqlash kerak.\n\nHozirgi ma\'lumotlaringiz (bolalar, suhbatlar) saqlanib qoladi.',
        textAlign: TextAlign.center,
      ),
      actionsAlignment: MainAxisAlignment.center,
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Hozir emas')),
        FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Davom etish')),
      ],
    ),
  );
  if (go != true || !context.mounted) return false;
  final ok = await Navigator.push<bool>(
    context,
    MaterialPageRoute(builder: (_) => const AuthPage(role: 'user', upgrade: true)),
  );
  return ok == true && !session.isGuest;
}
