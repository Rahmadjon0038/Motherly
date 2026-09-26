import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart' show CupertinoActivityIndicator;

const brand = Color(0xFF2F7DF6);
const brandLight = Color(0xFFE6F0FF);
const ink = Color(0xFF14213D);
const _border = Color(0xFFDCE6F5);
const _bg = Color(0xFFFEFEFE);

ThemeData buildTheme() {
  final scheme = ColorScheme.fromSeed(seedColor: brand).copyWith(
    primary: brand,
    onPrimary: Colors.white,
    primaryContainer: brandLight,
    onPrimaryContainer: ink,
  );
  OutlineInputBorder outline(Color c, [double w = 1]) =>
      OutlineInputBorder(borderRadius: BorderRadius.circular(20), borderSide: BorderSide(color: c, width: w));
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: _bg,
    appBarTheme: const AppBarTheme(
      backgroundColor: _bg,
      foregroundColor: ink,
      elevation: 0,
      scrolledUnderElevation: 0,
      titleTextStyle: TextStyle(color: ink, fontSize: 20, fontWeight: FontWeight.w800),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      border: outline(_border),
      enabledBorder: outline(_border),
      focusedBorder: outline(brand, 1.6),
      contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        shape: const StadiumBorder(),
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        shape: const StadiumBorder(),
        foregroundColor: brand,
        side: const BorderSide(color: _border, width: 1.4),
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
      ),
    ),
    cardTheme: CardThemeData(
      color: Colors.white,
      elevation: 0,
      margin: const EdgeInsets.symmetric(vertical: 5),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: const BorderSide(color: Color(0xFFE3ECF8)),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white,
      elevation: 8,
      shadowColor: const Color(0x2614213D),
      surfaceTintColor: Colors.transparent,
      indicatorColor: brandLight,
      indicatorShape: const StadiumBorder(),
      iconTheme: WidgetStateProperty.resolveWith(
        (s) => IconThemeData(size: s.contains(WidgetState.selected) ? 26 : 24, color: s.contains(WidgetState.selected) ? brand : const Color(0xFF7A879C)),
      ),
      labelTextStyle: WidgetStateProperty.resolveWith(
        (s) => TextStyle(
          fontSize: 12,
          fontWeight: s.contains(WidgetState.selected) ? FontWeight.w800 : FontWeight.w600,
          color: s.contains(WidgetState.selected) ? brand : const Color(0xFF7A879C),
        ),
      ),
    ),
    tabBarTheme: const TabBarThemeData(
      labelColor: brand,
      unselectedLabelColor: Color(0xFF7A879C),
      indicatorColor: brand,
      dividerColor: Color(0xFFE3ECF8),
      labelStyle: TextStyle(fontWeight: FontWeight.w700),
    ),
    segmentedButtonTheme: SegmentedButtonThemeData(
      style: SegmentedButton.styleFrom(
        selectedBackgroundColor: brandLight,
        selectedForegroundColor: brand,
        side: const BorderSide(color: _border),
      ),
    ),
    chipTheme: ChipThemeData(
      side: const BorderSide(color: _border),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      selectedColor: brandLight,
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(color: brand),
  );
}

/// "Motherly" yozuvi: Mother — to'q, ly — ko'k.
class MotherlyLogo extends StatelessWidget {
  const MotherlyLogo({super.key, this.size = 46});
  final double size;

  @override
  Widget build(BuildContext context) {
    final style = TextStyle(fontSize: size, fontWeight: FontWeight.w900, letterSpacing: -1, height: 1.1);
    return Text.rich(
      TextSpan(children: [
        TextSpan(text: 'Mother', style: style.copyWith(color: ink)),
        TextSpan(text: 'ly', style: style.copyWith(color: brand)),
      ]),
      textAlign: TextAlign.center,
    );
  }
}

/// Robot va bola tasviri.
class HeroImage extends StatelessWidget {
  const HeroImage({super.key, this.height = 280});
  final double height;

  @override
  Widget build(BuildContext context) {
    return Image.asset('assets/hero.png', height: height, fit: BoxFit.contain, semanticLabel: 'Motherly yordamchisi');
  }
}

/// Katta gradient tugma (mockupdagi "SMS kod olish →").
class GradientButton extends StatelessWidget {
  const GradientButton({super.key, required this.label, required this.onPressed, this.busy = false, this.icon = Icons.arrow_forward});
  final String label;
  final VoidCallback? onPressed;
  final bool busy;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null && !busy;
    return Opacity(
      opacity: onPressed == null ? 0.5 : 1,
      child: Container(
        height: 60,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(30),
          gradient: const LinearGradient(colors: [Color(0xFF4AA3FF), Color(0xFF2B78F0)]),
          boxShadow: [BoxShadow(color: brand.withValues(alpha: 0.30), blurRadius: 18, offset: const Offset(0, 8))],
        ),
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            borderRadius: BorderRadius.circular(30),
            onTap: enabled ? onPressed : null,
            child: Center(
              child: busy
                  ? const CupertinoActivityIndicator(radius: 12, color: Colors.white)
                  : Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        Flexible(
                          child: Text(label,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w700)),
                        ),
                        if (icon != null) ...[const SizedBox(width: 10), Icon(icon, color: Colors.white)],
                      ]),
                    ),
            ),
          ),
        ),
      ),
    );
  }
}
