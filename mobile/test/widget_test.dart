import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pedai/api.dart';
import 'package:pedai/main.dart';
import 'package:pedai/onboarding.dart';

void main() {
  testWidgets('signed-out user sees both login entries', (tester) async {
    session.ready = true;
    await tester.pumpWidget(const MotherlyApp());
    expect(find.text('Ona sifatida kirish'), findsOneWidget);
    expect(find.text('Maslahatchi hamshira sifatida kirish'), findsOneWidget);
  });

  testWidgets('mother login asks only for a phone number first', (tester) async {
    session.ready = true;
    await tester.pumpWidget(const MotherlyApp());
    await tester.tap(find.text('Ona sifatida kirish'));
    await tester.pumpAndSettle();
    expect(find.byType(TextField), findsOneWidget);
    expect(find.text('SMS kod olish'), findsOneWidget);
    // Telefon 9 raqam bo'lmaguncha tugma o'chiq.
    expect(tester.widget<Opacity>(find.ancestor(of: find.text('SMS kod olish'), matching: find.byType(Opacity))).opacity, 0.5);
    await tester.enterText(find.byType(TextField), '901234567');
    await tester.pump();
    expect(tester.widget<Opacity>(find.ancestor(of: find.text('SMS kod olish'), matching: find.byType(Opacity))).opacity, 1);
  });

  test('ageText', () {
    final now = DateTime.now();
    expect(ageText(apiDate(DateTime(now.year - 3, now.month, 1))), startsWith('3 yosh'));
    expect(ageText(apiDate(now)), '1 oydan kichik');
  });
}
