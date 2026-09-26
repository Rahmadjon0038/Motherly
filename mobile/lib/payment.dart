import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart' show CupertinoActivityIndicator;

import 'api.dart';
import 'theme.dart';
import 'widgets.dart';

/// 50000 → "50 000".
String som(int n) => n.toString().replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ' ');

/// To'lov oynasini ochadi. To'lov o'tsa `true`.
Future<bool> showPayment(BuildContext context, {required String title, required int price, required String path}) async {
  final ok = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    isDismissible: false,
    builder: (_) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: PaymentSheet(title: title, price: price, path: path),
    ),
  );
  return ok == true;
}

enum PayPhase { form, processing, success }

class PaymentSheet extends StatefulWidget {
  const PaymentSheet({super.key, required this.title, required this.price, required this.path});

  /// Oyna sarlavhasi (masalan "Dilnoza bilan konsultatsiya").
  final String title;

  /// Narxi, so'mda.
  final int price;

  /// Tasdiqlash uchun POST qilinadigan yo'l ({provider, amount} yuboriladi).
  final String path;

  @override
  State<PaymentSheet> createState() => _PaymentSheetState();
}

class _PaymentSheetState extends State<PaymentSheet> {
  final _amount = TextEditingController();
  String? _provider;
  PayPhase _phase = PayPhase.form;

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  /// Demo to'lov: haqiqiy pul yechilmaydi, lekin real tizimdek qisqa kutish ko'rsatiladi.
  Future<void> _pay() async {
    setState(() => _phase = PayPhase.processing);
    try {
      await Future.wait([
        Api.I.post(widget.path, {
          'provider': _provider,
          'amount': int.tryParse(_amount.text) ?? 0,
        }),
        Future<void>.delayed(const Duration(milliseconds: 2500)),
      ]);
      if (!mounted) return;
      setState(() => _phase = PayPhase.success);
      await Future<void>.delayed(const Duration(milliseconds: 1100));
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _phase = PayPhase.form);
      showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_phase != PayPhase.form) {
      final done = _phase == PayPhase.success;
      return SafeArea(
        child: SizedBox(
          height: 240,
          child: Center(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              done
                  ? const Icon(Icons.check_circle, size: 64, color: Colors.green)
                  : const CupertinoActivityIndicator(radius: 28),
              const SizedBox(height: 20),
              Text(done ? 'To\'lov muvaffaqiyatli!' : 'To\'lov amalga oshirilmoqda…',
                  style: Theme.of(context).textTheme.titleMedium),
              if (!done) const Padding(padding: EdgeInsets.only(top: 6), child: Text('Iltimos, kuting')),
            ]),
          ),
        ),
      );
    }
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Expanded(child: Text(widget.title, style: Theme.of(context).textTheme.titleLarge)),
            IconButton(onPressed: () => Navigator.pop(context, false), icon: const Icon(Icons.close)),
          ]),
          const SizedBox(height: 12),
          const Text('To\'lov turi'),
          const SizedBox(height: 8),
          Row(children: [
            for (final p in ['click', 'payme'])
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: SizedBox(
                        width: double.infinity,
                        child: Text(p == 'click' ? 'Click' : 'Payme', textAlign: TextAlign.center)),
                    selected: _provider == p,
                    onSelected: (_) => setState(() {
                      _provider = p;
                      _amount.text = widget.price.toString(); // summa avtomatik yoziladi
                    }),
                  ),
                ),
              ),
          ]),
          const SizedBox(height: 16),
          TextField(
            controller: _amount,
            keyboardType: TextInputType.number,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(labelText: 'Summa (so\'m)', helperText: 'Narxi: ${som(widget.price)} so\'m · Demo: haqiqiy pul yechilmaydi'),
          ),
          const SizedBox(height: 16),
          GradientButton(
            label: 'To\'lash',
            icon: null,
            onPressed: _provider == null || _amount.text.isEmpty ? null : _pay,
          ),
        ]),
      ),
    );
  }
}

