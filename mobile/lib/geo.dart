import 'package:geolocator/geolocator.dart';

// Joylashuv aniqlanmasa Toshkent markazi olinadi.
const fallbackLatLng = (41.3111, 69.2797);

typedef UserPosition = ({double lat, double lng, bool real});

enum LocationStatus { granted, denied, deniedForever, serviceOff }

/// Joylashuvdan foydalanish holati (hech narsa so'ramaydi).
Future<LocationStatus> locationStatus() async {
  if (!await Geolocator.isLocationServiceEnabled()) return LocationStatus.serviceOff;
  return switch (await Geolocator.checkPermission()) {
    LocationPermission.deniedForever => LocationStatus.deniedForever,
    LocationPermission.denied => LocationStatus.denied,
    _ => LocationStatus.granted,
  };
}

/// Joylashuvni yoqishga urinadi: ruxsat so'raydi; GPS o'chiq bo'lsa yoki ruxsat bloklangan bo'lsa tegishli
/// sozlamalarni ochadi. `true` — joylashuv hozir ishlaydi.
Future<bool> enableLocation() async {
  switch (await locationStatus()) {
    case LocationStatus.granted:
      return true;
    case LocationStatus.serviceOff:
      await Geolocator.openLocationSettings();
      return false;
    case LocationStatus.deniedForever:
      await Geolocator.openAppSettings();
      return false;
    case LocationStatus.denied:
      final p = await Geolocator.requestPermission();
      return p != LocationPermission.denied && p != LocationPermission.deniedForever;
  }
}

/// Foydalanuvchi joylashuvi. [ask] true bo'lsa ruxsat so'raladi (masalan yo'nalish chizishda);
/// false bo'lsa faqat allaqachon berilgan ruxsat ishlatiladi. Bo'lmasa `real: false` va Toshkent markazi.
Future<UserPosition> currentPosition({bool ask = true}) async {
  try {
    if (!await Geolocator.isLocationServiceEnabled()) throw Exception('off');
    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied && ask) perm = await Geolocator.requestPermission();
    if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) throw Exception('denied');
    final p = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(timeLimit: Duration(seconds: 8)));
    return (lat: p.latitude, lng: p.longitude, real: true);
  } catch (_) {
    return (lat: fallbackLatLng.$1, lng: fallbackLatLng.$2, real: false);
  }
}

/// Klinika hozir ish vaqtida emas. Jadval kiritilmagan (eski) klinikalarda `openNow` null — yopiq hisoblanmaydi.
bool isClosedNow(Map<String, dynamic> clinic) => clinic['openNow'] == false;

/// "Ochiq · 19:00 gacha" yoki "Hozir ish vaqti emas · ertaga 08:00 da ochiladi".
String hoursNote(Map<String, dynamic> clinic) => (clinic['hoursNote'] as String?) ?? '';
