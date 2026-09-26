import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart' show CupertinoActivityIndicator;

import 'widgets.dart';

// ---------- yordamchilar ----------

String apiDate(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

String showDate(String apiDate) {
  final p = apiDate.split('-');
  return p.length == 3 ? '${p[2]}.${p[1]}.${p[0]}' : apiDate;
}

/// "2 yosh 3 oy" / "5 oy" / "1 oydan kichik".
String ageText(String birthDate) {
  final b = DateTime.tryParse(birthDate);
  if (b == null) return '';
  final now = DateTime.now();
  var months = (now.year - b.year) * 12 + now.month - b.month;
  if (now.day < b.day) months--;
  if (months < 1) return '1 oydan kichik';
  if (months < 24) return '$months oy';
  final years = months ~/ 12;
  final rest = months % 12;
  return rest == 0 ? '$years yosh' : '$years yosh $rest oy';
}


const vaccineOptions = [
  'BCG (sil)',
  'Gepatit B',
  'OPV (polio)',
  'AKDS (difteriya, ko\'kyo\'tal, qoqshol)',
  'Pnevmokokk',
  'Rotavirus',
  'KPK (qizamiq, qizilcha, parotit)',
  'Boshqa',
];

double? parseNum(String s) => double.tryParse(s.trim().replaceAll(',', '.'));

// ---------- bosqichma-bosqich oyna ----------

class FlowStep {
  const FlowStep({required this.title, this.subtitle, required this.child, this.valid = true});
  final String title;
  final String? subtitle;
  final Widget child;
  final bool valid;
}

class StepFlow extends StatefulWidget {
  const StepFlow({
    super.key,
    required this.heading,
    required this.steps,
    required this.onFinish,
    this.finishLabel = 'Tayyor',
  });

  final String heading;
  final List<FlowStep> steps;
  final Future<void> Function() onFinish;
  final String finishLabel;

  @override
  State<StepFlow> createState() => _StepFlowState();
}

class _StepFlowState extends State<StepFlow> {
  int _i = 0;
  bool _busy = false;

  Future<void> _next() async {
    if (_i < widget.steps.length - 1) {
      setState(() => _i++);
      return;
    }
    setState(() => _busy = true);
    try {
      await widget.onFinish();
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final step = widget.steps[_i];
    final last = _i == widget.steps.length - 1;
    final canPop = Navigator.of(context).canPop();
    return PopScope(
      canPop: _i == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) setState(() => _i--);
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text('${widget.heading} · ${_i + 1}/${widget.steps.length}'),
          leading: _i > 0
              ? IconButton(icon: const Icon(Icons.arrow_back), onPressed: () => setState(() => _i--))
              : (canPop ? const BackButton() : null),
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(4),
            child: LinearProgressIndicator(value: (_i + 1) / widget.steps.length),
          ),
        ),
        body: SafeArea(
          child: Column(children: [
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(20),
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 520),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(step.title, style: Theme.of(context).textTheme.headlineSmall),
                      if (step.subtitle != null) ...[
                        const SizedBox(height: 6),
                        Text(step.subtitle!, style: Theme.of(context).textTheme.bodyMedium),
                      ],
                      const SizedBox(height: 20),
                      step.child,
                    ]),
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: step.valid && !_busy ? _next : null,
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: _busy
                        ? const CupertinoActivityIndicator(radius: 10, color: Colors.white)
                        : Text(last ? widget.finishLabel : 'Davom etish'),
                  ),
                ),
              ),
            ),
          ]),
        ),
      ),
    );
  }
}

// ---------- bola anketasi (4 bosqich) ----------

class ChildFlow extends StatefulWidget {
  const ChildFlow({super.key, this.initial});
  final Map<String, dynamic>? initial;

  @override
  State<ChildFlow> createState() => _ChildFlowState();
}

class _ChildFlowState extends State<ChildFlow> {
  late final _name = TextEditingController(text: widget.initial?['name'] as String?);
  late final _weight = TextEditingController(text: widget.initial?['weightKg']?.toString());
  late final _height = TextEditingController(text: widget.initial?['heightCm']?.toString());
  late final _allergies = TextEditingController(text: widget.initial?['allergies'] as String?);
  late final _notes = TextEditingController(text: widget.initial?['medicalNotes'] as String?);
  late String? _birth = widget.initial?['birthDate'] as String?;
  late String? _gender = widget.initial?['gender'] as String?;
  late final Set<String> _vaccines = {...((widget.initial?['vaccinations'] as List?)?.cast<String>() ?? [])};

  @override
  void dispose() {
    for (final c in [_name, _weight, _height, _allergies, _notes]) {
      c.dispose();
    }
    super.dispose();
  }

  bool get _weightOk {
    final w = parseNum(_weight.text);
    return w != null && w >= 0.5 && w <= 200;
  }

  bool get _heightOk {
    final h = parseNum(_height.text);
    return h != null && h >= 20 && h <= 220;
  }

  @override
  Widget build(BuildContext context) {
    return StepFlow(
      heading: widget.initial == null ? 'Yangi bola' : 'Bolani tahrirlash',
      finishLabel: 'Saqlash',
      onFinish: () async => Navigator.pop<Map<String, dynamic>>(context, {
        'name': _name.text.trim(),
        'birthDate': _birth,
        'gender': _gender,
        'weightKg': parseNum(_weight.text),
        'heightCm': parseNum(_height.text),
        'vaccinations': _vaccines.toList(),
        'allergies': _allergies.text.trim(),
        'medicalNotes': _notes.text.trim(),
      }),
      steps: [
        FlowStep(
          title: 'Bola haqida',
          valid: _name.text.trim().isNotEmpty && _birth != null,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            TextField(
              controller: _name,
              textCapitalization: TextCapitalization.words,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(labelText: 'Ismi', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              icon: const Icon(Icons.cake),
              label: Text(_birth == null ? 'Tug\'ilgan sanasi' : '${showDate(_birth!)} · ${ageText(_birth!)}'),
              onPressed: () async {
                final now = DateTime.now();
                final d = await showDatePicker(
                  context: context,
                  initialDate: _birth != null ? DateTime.parse(_birth!) : now,
                  firstDate: DateTime(now.year - 18),
                  lastDate: now,
                  helpText: 'Bolaning tug\'ilgan sanasi',
                );
                if (d != null) setState(() => _birth = apiDate(d));
              },
            ),
            const SizedBox(height: 16),
            SegmentedButton<String>(
              emptySelectionAllowed: true,
              segments: const [
                ButtonSegment(value: 'male', label: Text('O\'g\'il'), icon: Icon(Icons.boy)),
                ButtonSegment(value: 'female', label: Text('Qiz'), icon: Icon(Icons.girl)),
              ],
              selected: {?_gender},
              onSelectionChanged: (s) => setState(() => _gender = s.isEmpty ? null : s.first),
            ),
          ]),
        ),
        FlowStep(
          title: 'Vazni va bo\'yi',
          subtitle: 'Oxirgi o\'lchovlar. Keyinroq profilda yangilashingiz mumkin.',
          valid: _weightOk && _heightOk,
          child: Column(children: [
            TextField(
              controller: _weight,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                labelText: 'Vazni (kg)',
                errorText: _weight.text.isNotEmpty && !_weightOk ? '0.5 dan 200 gacha' : null,
                border: const OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _height,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                labelText: 'Bo\'yi (sm)',
                errorText: _height.text.isNotEmpty && !_heightOk ? '20 dan 220 gacha' : null,
                border: const OutlineInputBorder(),
              ),
            ),
          ]),
        ),
        FlowStep(
          title: 'Emlashlar',
          subtitle: 'Bolaga qilingan emlashlarni belgilang.',
          child: Wrap(spacing: 8, runSpacing: 8, children: [
            for (final v in vaccineOptions)
              FilterChip(
                label: Text(v),
                selected: _vaccines.contains(v),
                onSelected: (on) => setState(() => on ? _vaccines.add(v) : _vaccines.remove(v)),
              ),
          ]),
        ),
        FlowStep(
          title: 'Allergiya va muhim ma\'lumotlar',
          subtitle: 'Bo\'lmasa bo\'sh qoldiring.',
          child: Column(children: [
            TextField(
              controller: _allergies,
              maxLines: 3,
              decoration: const InputDecoration(
                  labelText: 'Allergiyalar', hintText: 'Masalan: sut, tuxum, changlar', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _notes,
              maxLines: 4,
              decoration: const InputDecoration(
                  labelText: 'Muhim tibbiy ma\'lumotlar',
                  hintText: 'Surunkali kasalliklar, operatsiyalar, doimiy dorilar…',
                  border: OutlineInputBorder()),
            ),
          ]),
        ),
      ],
    );
  }
}
