import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/cupertino.dart' show CupertinoActivityIndicator;
import 'package:flutter/material.dart';

import 'api.dart';
import 'theme.dart';
import 'widgets.dart';

const _muted = Color(0xFF7A879C);

/// Shifokorligini tasdiqlamagan mutaxassisga xizmat va video bo'limlari o'rniga ko'rsatiladi.
/// Hujjat yuklanadi, admin tekshirib tasdiqlagach bo'limlar ochiladi.
class VerificationView extends StatefulWidget {
  const VerificationView({
    super.key,
    required this.verification,
    required this.onChanged,
  });
  final Map<String, dynamic> verification;
  final VoidCallback onChanged;

  @override
  State<VerificationView> createState() => _VerificationViewState();
}

class _VerificationViewState extends State<VerificationView> {
  Timer? _poll;
  bool _busy = false;

  String get _status => widget.verification['status'] as String? ?? 'none';

  @override
  void initState() {
    super.initState();
    // Tekshirilayotgan paytda holat o'zgarganini tez bilish uchun.
    _poll = Timer.periodic(const Duration(seconds: 15), (_) async {
      if (_status != 'pending') return;
      try {
        final now = await Api.I.get('/nurse/verification') as Map;
        if (mounted && now['status'] != _status) widget.onChanged();
      } catch (_) {}
    });
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  Future<void> _upload() async {
    final f = await FilePicker.pickFile(
      type: FileType.custom,
      allowedExtensions: const ['pdf', 'jpg', 'jpeg', 'png'],
    );
    if (f == null) return;
    setState(() => _busy = true);
    try {
      await Api.I.upload(
        '/nurse/verification',
        await f.xFile.readAsBytes(),
        f.name,
      );
      if (mounted) widget.onChanged();
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final v = widget.verification;
    final (icon, color, title, text, button) = switch (_status) {
      'pending' => (
        Icons.hourglass_top_rounded,
        const Color(0xFFE59A0B),
        'Hujjatingiz tekshirilmoqda',
        'Administrator hujjatni ko\'rib chiqadi. Tasdiqlangach xizmat va video joylay olasiz. Yuborilgan hujjat: ${v['documentName']}',
        'Boshqa hujjat yuklash',
      ),
      'rejected' => (
        Icons.error_outline_rounded,
        const Color(0xFFD64545),
        'Hujjat qabul qilinmadi',
        'Sabab: ${v['rejectionReason']}\n\nIltimos, to\'g\'ri va aniq hujjatni qayta yuklang.',
        'Qayta yuklash',
      ),
      _ => (
        Icons.verified_user_outlined,
        brand,
        'Shifokor ekaningizni tasdiqlang',
        'Diplom yoki sertifikatingizni rasm yoki PDF ko\'rinishida yuklang. Administrator tekshirib tasdiqlagach, xizmat va video joylay olasiz.',
        'Hujjat yuklash',
      ),
    };
    return RefreshIndicator(
      onRefresh: () async => widget.onChanged(),
      child: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const SizedBox(height: 40),
          Icon(icon, size: 72, color: color),
          const SizedBox(height: 16),
          Text(
            title,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w800,
              color: ink,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            text,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 15, height: 1.4, color: _muted),
          ),
          const SizedBox(height: 24),
          _status == 'pending'
              ? OutlinedButton(
                  onPressed: _busy ? null : _upload,
                  child: Text(button),
                )
              : GradientButton(
                  label: button,
                  icon: Icons.upload_file,
                  busy: _busy,
                  onPressed: _upload,
                ),
          if (_busy)
            const Padding(
              padding: EdgeInsets.only(top: 16),
              child: Center(child: CupertinoActivityIndicator()),
            ),
        ],
      ),
    );
  }
}
