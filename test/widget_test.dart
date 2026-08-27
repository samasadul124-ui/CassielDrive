import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:cassiel_drive/main.dart';

void main() {
  testWidgets('App boots without throwing', (WidgetTester tester) async {
    await tester.pumpWidget(const CassielDriveApp());

    // The app has continuously repeating background animations, so
    // pumpAndSettle would never complete — pump a few frames instead.
    await tester.pump(const Duration(milliseconds: 100));

    expect(tester.takeException(), isNull);
    expect(find.byType(MaterialApp), findsOneWidget);
  });
}
