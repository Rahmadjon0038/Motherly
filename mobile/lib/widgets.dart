import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart' show CupertinoActivityIndicator;

import 'api.dart';

// Suhbatlar ro'yxati va chat sahifasi conversations.dart da; eski import joylari ishlashi uchun shu yerdan qayta eksport qilinadi.
export 'conversations.dart';

void showError(BuildContext context, Object e) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(errorText(e))));
}

/// Ma'lumotni yuklaydi: spinner → natija yoki xato + "Qayta urinish".
class LoadView<T> extends StatefulWidget {
  const LoadView({super.key, required this.load, required this.builder});
  final Future<T> Function() load;
  final Widget Function(BuildContext context, T data, VoidCallback reload) builder;

  @override
  State<LoadView<T>> createState() => _LoadViewState<T>();
}

class _LoadViewState<T> extends State<LoadView<T>> {
  late Future<T> _future = widget.load();

  void _reload() {
    final next = widget.load();
    setState(() => _future = next);
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<T>(
      future: _future,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return const Center(child: CupertinoActivityIndicator(radius: 14));
        }
        if (snap.hasError) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Icon(isOffline(snap.error!) ? Icons.wifi_off_rounded : Icons.error_outline, size: 48),
                const SizedBox(height: 12),
                Text(errorText(snap.error!), textAlign: TextAlign.center),
                const SizedBox(height: 12),
                FilledButton(onPressed: _reload, child: const Text('Qayta urinish')),
              ]),
            ),
          );
        }
        return widget.builder(context, snap.data as T, _reload);
      },
    );
  }
}

