import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Foydalanuvchiga ko'rsatiladigan xato. Matn oddiy tilda: "server", "backend" kabi so'zlarsiz.
class ApiException implements Exception {
  ApiException(this.message, {this.offline = false, this.status, this.reason});
  final String message;

  /// HTTP holati (401 — token yaroqsiz).
  final int? status;

  /// Server bergan sabab kodi, masalan "registration_required".
  final String? reason;

  /// Internet yo'qligi yoki aloqa uzilishi (ekranda boshqa belgi ko'rsatiladi).
  final bool offline;
  @override
  String toString() => message;
}

const _msgOffline = 'Internetga ulanib bo\'lmadi. Aloqani tekshirib, qayta urinib ko\'ring.';
const _msgSlow = 'Aloqa juda sekin. Birozdan keyin qayta urinib ko\'ring.';
const _msgDown = 'Hozir xizmat vaqtincha ishlamayapti. Birozdan keyin qayta urinib ko\'ring.';
const _msgGeneric = 'Nimadir xato ketdi. Qayta urinib ko\'ring.';

/// Istalgan xatoni foydalanuvchi tushunadigan matnga aylantiradi (xom "Exception: ..." hech qachon ko'rsatilmaydi).
String errorText(Object e) {
  if (e is ApiException) return e.message;
  if (e is String) return e; // allaqachon tayyor matn
  if (e is SocketException || e is http.ClientException || e is HandshakeException) return _msgOffline;
  if (e is TimeoutException) return _msgSlow;
  return _msgGeneric;
}

bool isOffline(Object e) => (e is ApiException && e.offline) || e is SocketException || e is http.ClientException;

class Api {
  Api._();
  static final Api I = Api._();

  String? token;

  /// `--dart-define=API_URL=http://192.168.x.x:5100` bilan almashtirish mumkin
  /// (haqiqiy telefon uchun kerak). Android emulyator hostga 10.0.2.2 orqali chiqadi.
  static String get baseUrl {
    const fromEnv = String.fromEnvironment('API_URL');
    if (fromEnv.isNotEmpty) return fromEnv;
    final host = Platform.isAndroid ? '10.0.2.2' : 'localhost';
    return 'http://$host:5100';
  }

  Map<String, String> get _headers => {
        if (token != null) 'Authorization': 'Bearer $token',
      };

  /// Token yaroqsiz bo'lib qolsa (akkaunt o'chirilgan, token eskirgan) chaqiriladi: yangi mehmon akkaunti ochadi.
  Future<void> Function()? onUnauthorized;
  bool _recovering = false;

  Future<dynamic> _run(Future<http.Response> Function() request, {bool retried = false}) async {
    final http.Response res;
    try {
      res = await request().timeout(const Duration(seconds: 15));
    } on TimeoutException {
      throw ApiException(_msgSlow, offline: true);
    } on SocketException {
      throw ApiException(_msgOffline, offline: true);
    } on HandshakeException {
      throw ApiException(_msgOffline, offline: true);
    } on http.ClientException {
      throw ApiException(_msgOffline, offline: true);
    }
    dynamic body;
    try {
      body = res.body.isEmpty ? null : jsonDecode(utf8.decode(res.bodyBytes));
    } catch (_) {
      body = null;
    }
    if (res.statusCode >= 500) throw ApiException(_msgDown);
    // /auth/* dagi 401 — bu login xatosi (parol noto'g'ri), token muddati emas: backend xabari ko'rsatiladi.
    final isAuthCall = res.request?.url.path.contains('/auth/') ?? false;
    if (res.statusCode == 401 && token != null && !isAuthCall) {
      // Foydalanuvchiga xato ko'rsatmaymiz: yangi mehmon ochib, so'rovni bir marta qayta yuboramiz.
      if (!retried && !_recovering && onUnauthorized != null) {
        _recovering = true;
        try {
          await onUnauthorized!();
        } finally {
          _recovering = false;
        }
        if (token != null) return _run(request, retried: true);
      }
      throw ApiException('Iltimos, hisobingizga qaytadan kiring.', status: 401);
    }
    if (res.statusCode >= 400) {
      // 4xx xabarlarini backend foydalanuvchi uchun yozgan (masalan "SMS kod noto'g'ri").
      final msg = body is Map ? body['message'] : null;
      throw ApiException(msg?.toString() ?? _msgGeneric, status: res.statusCode, reason: body is Map ? body['reason'] as String? : null);
    }
    return body;
  }

  Uri _uri(String path) => Uri.parse('$baseUrl/api$path');

  Future<dynamic> get(String path) => _run(() => http.get(_uri(path), headers: _headers));

  Future<dynamic> post(String path, [Map<String, dynamic>? body]) => _run(() => http.post(
        _uri(path),
        headers: {..._headers, 'Content-Type': 'application/json'},
        body: jsonEncode(body ?? {}),
      ));

  Future<dynamic> put(String path, Map<String, dynamic> body) => _run(() => http.put(
        _uri(path),
        headers: {..._headers, 'Content-Type': 'application/json'},
        body: jsonEncode(body),
      ));

  Future<dynamic> delete(String path) => _run(() => http.delete(_uri(path), headers: _headers));

  Future<dynamic> upload(String path, Uint8List bytes, String filename, {Map<String, String>? fields, String method = 'POST'}) => _run(() async {
        final req = http.MultipartRequest(method, _uri(path))
          ..headers.addAll(_headers)
          ..fields.addAll(fields ?? {})
          ..files.add(http.MultipartFile.fromBytes('file', bytes, filename: filename, contentType: _mediaType(filename)));
        return http.Response.fromStream(await req.send());
      });

  /// Fayl turini kengaytmadan aniqlaydi (aks holda server uni "octet-stream" deb rad etadi).
  static MediaType _mediaType(String filename) {
    final ext = filename.contains('.') ? filename.split('.').last.toLowerCase() : '';
    return switch (ext) {
      'pdf' => MediaType('application', 'pdf'),
      'jpg' || 'jpeg' => MediaType('image', 'jpeg'),
      'png' => MediaType('image', 'png'),
      'webp' => MediaType('image', 'webp'),
      'mp4' => MediaType('video', 'mp4'),
      'mov' => MediaType('video', 'quicktime'),
      'webm' => MediaType('video', 'webm'),
      _ => MediaType('application', 'octet-stream'),
    };
  }

  static String fileUrl(String path) => '$baseUrl$path';
}

/// Foydalanuvchi holati (token telefon xotirasida saqlanadi).
/// Ro'yxatdan o'tmagan ona "mehmon" akkaunti bilan ishlaydi: ilova ochilishi bilan yaratiladi,
/// telefon raqamni faqat kerak bo'lganda (to'lov, qabulga yozilish) tasdiqlaydi.
class Session extends ChangeNotifier {
  Map<String, dynamic>? user;
  bool ready = false;

  /// Server bilan bog'lanib bo'lmadi (internet yo'q): ilova "qayta urinish" ekranini ko'rsatadi.
  bool connectError = false;

  String? get role => user?['role'] as String?;
  bool get isGuest => user?['guest'] == true;

  /// Token yaroqsiz bo'lganda yangi mehmon akkaunti ochadi (ilova "qaytadan kiring" deb qolib ketmasin).
  Future<void> _recover() async {
    await _forget();
    try {
      final res = await Api.I.post('/auth/guest');
      _set(res['token'] as String, Map<String, dynamic>.from(res['user'] as Map));
      notifyListeners();
    } catch (_) {}
  }

  Future<void> init() async {
    Api.I.onUnauthorized = _recover;
    try {
      Api.I.token = (await SharedPreferences.getInstance()).getString('token');
    } catch (_) {}
    await _start();
  }

  Future<void> _start() async {
    connectError = false;
    try {
      if (Api.I.token != null) {
        try {
          user = Map<String, dynamic>.from(await Api.I.get('/me'));
        } on ApiException catch (e) {
          // Faqat token haqiqatan yaroqsiz bo'lsa unutamiz; internet yo'qligi tokenni o'chirmasin.
          if (e.status != 401) rethrow;
          await _forget();
        }
      }
      if (Api.I.token == null) {
        final res = await Api.I.post('/auth/guest');
        _set(res['token'] as String, Map<String, dynamic>.from(res['user'] as Map));
      }
    } catch (_) {
      connectError = true;
    }
    ready = true;
    notifyListeners();
  }

  Future<void> retry() async {
    ready = false;
    notifyListeners();
    await _start();
  }

  void _set(String token, Map<String, dynamic> u) {
    Api.I.token = token;
    user = u;
    SharedPreferences.getInstance().then((p) => p.setString('token', token)).catchError((_) => false);
  }

  Future<void> _forget() async {
    Api.I.token = null;
    user = null;
    try {
      (await SharedPreferences.getInstance()).remove('token');
    } catch (_) {}
  }

  /// Har kirish/chiqishda oshadi: ekranlar eski akkaunt ma'lumoti (suhbat, ro'yxatlar) bilan qolib ketmasin.
  int epoch = 0;

  Future<void> login(String token, Map<String, dynamic> u) async {
    epoch++;
    _set(token, u);
    notifyListeners();
  }

  /// Chiqilganda yangi mehmon akkaunti ochiladi (ilova doim ochiq qoladi).
  Future<void> logout() async {
    epoch++;
    await _forget();
    ready = false;
    notifyListeners();
    await _start();
  }
}

final session = Session();
