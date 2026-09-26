import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart' show CupertinoActivityIndicator;
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';

import 'geo.dart';
import 'theme.dart';
import 'widgets.dart';

const _tileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const _userAgent = 'uz.aurex.pedai';

/// OpenStreetMap plitalari uchun majburiy manba ko'rsatkichi.
Widget _attribution() => const RichAttributionWidget(
      attributions: [TextSourceAttribution('© OpenStreetMap contributors')],
    );

LatLng _clinicPoint(Map<String, dynamic> c) => LatLng((c['lat'] as num).toDouble(), (c['lng'] as num).toDouble());

String _duration(double seconds) {
  final min = (seconds / 60).round();
  if (min < 1) return '1 daqiqadan kam';
  if (min < 60) return '$min daq';
  final h = min ~/ 60;
  return min % 60 == 0 ? '$h soat' : '$h soat ${min % 60} daq';
}

String _distance(double meters) => meters < 1000 ? '${meters.round()} m' : '${(meters / 1000).toStringAsFixed(1)} km';

Future<void> _openExternalNav(BuildContext context, Map<String, dynamic> c) async {
  final url = 'https://www.google.com/maps/dir/?api=1&destination=${c['lat']},${c['lng']}&travelmode=driving';
  final ok = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication).catchError((_) => false);
  if (!ok && context.mounted) showError(context, 'Xaritani ochib bo\'lmadi');
}

const _dot = 26.0;

Widget _meMarker() => Container(
      decoration: BoxDecoration(
        color: const Color(0xFF1A73E8),
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: 3),
        boxShadow: const [BoxShadow(blurRadius: 6, color: Colors.black38)],
      ),
    );

// ---------- yo'nalish sahifasi ----------

/// Foydalanuvchi joylashuvidan klinikagacha yo'nalish. Joylashuv o'zgarganda marker yuradi,
/// yo'ldan ancha chetga chiqilsa yo'nalish qayta hisoblanadi.
class RouteMapPage extends StatefulWidget {
  const RouteMapPage(this.clinic, {super.key});
  final Map<String, dynamic> clinic;

  @override
  State<RouteMapPage> createState() => _RouteMapPageState();
}

class _RouteMapPageState extends State<RouteMapPage> {
  final _map = MapController();
  StreamSubscription<Position>? _sub;
  bool _mapReady = false;
  bool _loading = true;
  LatLng? _me;
  List<LatLng> _route = const [];
  double? _meters;
  double? _seconds;
  String? _error;
  LatLng? _routedFrom;
  DateTime _routedAt = DateTime.fromMillisecondsSinceEpoch(0);

  static const _rerouteMeters = 80.0;
  static const _rerouteEvery = Duration(seconds: 10);
  static const _arrivedMeters = 60.0;

  LatLng get _dest => _clinicPoint(widget.clinic);

  @override
  void initState() {
    super.initState();
    _start();
  }

  @override
  void dispose() {
    _sub?.cancel();
    _map.dispose();
    super.dispose();
  }

  Future<void> _start() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final pos = await currentPosition();
    if (!mounted) return;
    if (!pos.real) {
      setState(() {
        _loading = false;
        _error = 'Joylashuvingiz aniqlanmadi. Yo\'nalish ko\'rsatish uchun joylashuvga ruxsat bering va GPS ni yoqing.';
      });
      return;
    }
    _me = LatLng(pos.lat, pos.lng);
    await _fetchRoute(fit: true);
    if (!mounted) return;
    _sub = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: 15),
    ).listen(_onMove, onError: (_) {});
  }

  void _onMove(Position p) {
    final me = LatLng(p.latitude, p.longitude);
    setState(() => _me = me);
    final from = _routedFrom;
    final moved = from == null ? double.infinity : Geolocator.distanceBetween(from.latitude, from.longitude, me.latitude, me.longitude);
    if (moved > _rerouteMeters && DateTime.now().difference(_routedAt) > _rerouteEvery) _fetchRoute(fit: false);
  }

  Future<void> _fetchRoute({required bool fit}) async {
    final me = _me;
    if (me == null) return;
    _routedFrom = me;
    _routedAt = DateTime.now();
    final d = _dest;
    final uri = Uri.parse('https://router.project-osrm.org/route/v1/driving/'
        '${me.longitude},${me.latitude};${d.longitude},${d.latitude}?overview=full&geometries=geojson');
    try {
      final res = await http.get(uri, headers: {'User-Agent': _userAgent}).timeout(const Duration(seconds: 12));
      final body = jsonDecode(res.body) as Map<String, dynamic>;
      final routes = body['routes'] as List?;
      if (res.statusCode != 200 || routes == null || routes.isEmpty) throw Exception('no route');
      final r = routes.first as Map<String, dynamic>;
      final coords = ((r['geometry'] as Map)['coordinates'] as List)
          .map((c) => LatLng((c[1] as num).toDouble(), (c[0] as num).toDouble()))
          .toList();
      if (!mounted) return;
      setState(() {
        _route = coords;
        _meters = (r['distance'] as num).toDouble();
        _seconds = (r['duration'] as num).toDouble();
        _error = null;
        _loading = false;
      });
      if (fit) _fit();
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        if (_route.isEmpty) _error = 'Yo\'nalishni hisoblab bo\'lmadi. Internetni tekshirib, qayta urinib ko\'ring.';
      });
    }
  }

  void _fit() {
    if (!_mapReady) return;
    final points = [?_me, _dest, ..._route];
    _map.fitCamera(CameraFit.bounds(
      bounds: LatLngBounds.fromPoints(points),
      padding: const EdgeInsets.fromLTRB(40, 40, 40, 220),
      maxZoom: 17,
    ));
  }

  bool get _arrived {
    final me = _me;
    if (me == null) return false;
    final d = _dest;
    return Geolocator.distanceBetween(me.latitude, me.longitude, d.latitude, d.longitude) < _arrivedMeters;
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.clinic;
    final closed = isClosedNow(c);
    final me = _me;
    return Scaffold(
      appBar: AppBar(title: Text(c['name'] as String)),
      body: Stack(children: [
        FlutterMap(
          mapController: _map,
          options: MapOptions(
            initialCenter: _dest,
            initialZoom: 14,
            onMapReady: () {
              _mapReady = true;
              if (_route.isNotEmpty) _fit();
            },
          ),
          children: [
            TileLayer(urlTemplate: _tileUrl, userAgentPackageName: _userAgent),
            if (_route.isNotEmpty)
              PolylineLayer(polylines: [
                Polyline(points: _route, strokeWidth: 6, color: brand, borderStrokeWidth: 2, borderColor: Colors.white),
              ]),
            MarkerLayer(markers: [
              Marker(
                point: _dest,
                width: 44,
                height: 44,
                alignment: Alignment.topCenter,
                child: Icon(Icons.location_on, size: 44, color: closed ? Colors.grey : Colors.red),
              ),
              if (me != null) Marker(point: me, width: _dot, height: _dot, child: _meMarker()),
            ]),
            _attribution(),
          ],
        ),
        if (_loading)
          const Positioned(
            top: 12,
            left: 0,
            right: 0,
            child: Center(
              child: Card(
                shape: CircleBorder(),
                elevation: 3,
                child: Padding(padding: EdgeInsets.all(10), child: CupertinoActivityIndicator(radius: 12)),
              ),
            ),
          ),
        Positioned(
          right: 12,
          bottom: 210,
          child: FloatingActionButton.small(
            heroTag: 'recenter',
            onPressed: _fit,
            child: const Icon(Icons.my_location),
          ),
        ),
        Positioned(
          left: 12,
          right: 12,
          bottom: 12,
          child: SafeArea(child: _panel(context, closed)),
        ),
      ]),
    );
  }

  Widget _panel(BuildContext context, bool closed) {
    final c = widget.clinic;
    final theme = Theme.of(context);
    return Card(
      elevation: 6,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          if (_meters != null && _seconds != null) ...[
            Text('${_duration(_seconds!)} · ${_distance(_meters!)}', style: theme.textTheme.headlineSmall),
            const Text('Mashinada, hozirgi joylashuvingizdan'),
          ] else if (_error == null)
            Text('Yo\'nalish hisoblanmoqda…', style: theme.textTheme.titleMedium),
          if (_arrived)
            const Padding(
              padding: EdgeInsets.only(top: 6),
              child: Text('Siz klinikaga yetib keldingiz', style: TextStyle(color: Colors.green, fontWeight: FontWeight.w700)),
            ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
            ),
          if (hoursNote(c).isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                hoursNote(c),
                style: TextStyle(color: closed ? Colors.red.shade700 : Colors.green.shade700, fontWeight: FontWeight.w600),
              ),
            ),
          const SizedBox(height: 10),
          Row(children: [
            if (_error != null)
              Expanded(child: FilledButton(onPressed: _start, child: const Text('Qayta urinish')))
            else
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _openExternalNav(context, c),
                  icon: const Icon(Icons.open_in_new),
                  label: const Text('Google Maps da ochish'),
                ),
              ),
          ]),
        ]),
      ),
    );
  }
}
