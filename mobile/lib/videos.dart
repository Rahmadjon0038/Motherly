import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart' show CupertinoActivityIndicator;
import 'package:url_launcher/url_launcher.dart';
import 'package:video_player/video_player.dart';
import 'package:youtube_player_iframe/youtube_player_iframe.dart';

import 'api.dart';
import 'auth.dart';
import 'payment.dart';
import 'theme.dart';
import 'widgets.dart';

/// Video darslar bo'limi. Pastda 2 ta tab: Darslar va Sevimlilar.
class VideoSection extends StatefulWidget {
  const VideoSection({super.key});

  @override
  State<VideoSection> createState() => _VideoSectionState();
}

class _VideoSectionState extends State<VideoSection> {
  int _tab = 0;
  List<Map<String, dynamic>>? _videos;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final list = await Api.I.get('/videos') as List;
      if (mounted) setState(() => _videos = list.cast<Map<String, dynamic>>());
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    }
  }

  /// Sevimlilarga qo'shish/olib tashlash. Avval ekranda o'zgaradi, xatoda qaytariladi.
  Future<void> _toggle(Map<String, dynamic> v) async {
    final was = v['favorite'] == true;
    setState(() => v['favorite'] = !was);
    try {
      if (was) {
        await Api.I.delete('/videos/${v['id']}/favorite');
      } else {
        await Api.I.post('/videos/${v['id']}/favorite');
      }
    } catch (e) {
      if (mounted) {
        setState(() => v['favorite'] = was);
        showError(context, e);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final favoritesTab = _tab == 3;
    return Scaffold(
      appBar: AppBar(
        title: Text(
          [
            'Video darslar',
            'Pleylistlar',
            'Pullik darslar',
            'Sevimlilar',
          ][_tab],
        ),
      ),
      body: _tab == 1
          ? const _PlaylistsTab()
          : _tab == 2
          ? const _PaidTab()
          : Builder(
              builder: (context) {
                if (_error != null) {
                  return Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(_error!),
                        const SizedBox(height: 12),
                        FilledButton(
                          onPressed: _load,
                          child: const Text('Qayta urinish'),
                        ),
                      ],
                    ),
                  );
                }
                if (_videos == null) {
                  return const Center(
                    child: CupertinoActivityIndicator(radius: 14),
                  );
                }
                final shown = favoritesTab
                    ? _videos!.where((v) => v['favorite'] == true).toList()
                    : _videos!;
                if (shown.isEmpty) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(32),
                      child: Text(
                        favoritesTab
                            ? 'Sevimli videolar yo\'q.\nDarslardagi ♡ tugmasini bosing.'
                            : 'Hozircha darslar yo\'q.',
                        textAlign: TextAlign.center,
                      ),
                    ),
                  );
                }
                return RefreshIndicator(
                  onRefresh: _load,
                  child: ListView.builder(
                    padding: const EdgeInsets.all(12),
                    itemCount: shown.length,
                    itemBuilder: (_, i) {
                      final v = shown[i];
                      return Card(
                        clipBehavior: Clip.antiAlias,
                        child: InkWell(
                          onTap: () async {
                            await Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => VideoDetailPage(
                                  video: v,
                                  onToggle: () => _toggle(v),
                                ),
                              ),
                            );
                            if (mounted) setState(() {});
                          },
                          child: Padding(
                            padding: const EdgeInsets.all(12),
                            child: Row(
                              children: [
                                LessonThumb(
                                  url: (v['videoUrl'] as String?) ?? '',
                                  width: 96,
                                  height: 68,
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        v['title'] as String,
                                        style: Theme.of(context)
                                            .textTheme
                                            .titleSmall,
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        '${v['category']} · ${_dur(v)}',
                                        style: Theme.of(context)
                                            .textTheme
                                            .bodySmall,
                                      ),
                                    ],
                                  ),
                                ),
                                IconButton(
                                  tooltip: v['favorite'] == true
                                      ? 'Sevimlilardan olib tashlash'
                                      : 'Sevimlilarga qo\'shish',
                                  icon: Icon(
                                    v['favorite'] == true
                                        ? Icons.favorite
                                        : Icons.favorite_border,
                                    color: v['favorite'] == true
                                        ? Colors.red
                                        : null,
                                  ),
                                  onPressed: () => _toggle(v),
                                ),
                              ],
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                );
              },
            ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.play_circle_outline),
            selectedIcon: Icon(Icons.play_circle),
            label: 'Darslar',
          ),
          NavigationDestination(
            icon: Icon(Icons.playlist_play_outlined),
            selectedIcon: Icon(Icons.playlist_play),
            label: 'Pleylistlar',
          ),
          NavigationDestination(
            icon: Icon(Icons.workspace_premium_outlined),
            selectedIcon: Icon(Icons.workspace_premium),
            label: 'Pullik',
          ),
          NavigationDestination(
            icon: Icon(Icons.favorite_border),
            selectedIcon: Icon(Icons.favorite),
            label: 'Sevimlilar',
          ),
        ],
      ),
    );
  }
}

class VideoDetailPage extends StatefulWidget {
  const VideoDetailPage({
    super.key,
    required this.video,
    required this.onToggle,
  });
  final Map<String, dynamic> video;
  final Future<void> Function() onToggle;

  @override
  State<VideoDetailPage> createState() => _VideoDetailPageState();
}

class _VideoDetailPageState extends State<VideoDetailPage> {
  Future<void> _openExternally(String url) async {
    final ok = await launchUrl(
      Uri.parse(url),
      mode: LaunchMode.externalApplication,
    ).catchError((_) => false);
    if (!ok && mounted) showError(context, 'Videoni ochib bo\'lmadi');
  }

  @override
  Widget build(BuildContext context) {
    final v = widget.video;
    final fav = v['favorite'] == true;
    final url = (v['videoUrl'] as String?) ?? '';
    return Scaffold(
      appBar: AppBar(
        title: const Text('Dars'),
        actions: [
          IconButton(
            icon: Icon(
              fav ? Icons.favorite : Icons.favorite_border,
              color: fav ? Colors.red : null,
            ),
            tooltip: fav
                ? 'Sevimlilardan olib tashlash'
                : 'Sevimlilarga qo\'shish',
            onPressed: () async {
              await widget.onToggle();
              if (mounted) setState(() {});
            },
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: LessonPlayer(url: url),
          ),
          const SizedBox(height: 16),
          Text(
            v['title'] as String,
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: [
              Chip(label: Text(v['category'] as String)),
              Chip(
                avatar: const Icon(Icons.schedule, size: 16),
                label: Text(_dur(v)),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(v['description'] as String),
          const SizedBox(height: 24),
          if (url.isNotEmpty && !url.startsWith('/'))
            OutlinedButton.icon(
              onPressed: () => _openExternally(url),
              icon: const Icon(Icons.open_in_new),
              label: const Padding(
                padding: EdgeInsets.all(12),
                child: Text('YouTube\'da ochish'),
              ),
            ),
          if (url.isEmpty)
            const Padding(
              padding: EdgeInsets.only(top: 8),
              child: Text(
                'Bu dars uchun video hali yuklanmagan.',
                textAlign: TextAlign.center,
              ),
            ),
        ],
      ),
    );
  }
}

/// "14 daqiqa" (aniq soniya bo'lsa yuqoriga yaxlitlanadi), davomiylik noma'lum bo'lsa bo'sh.
String _dur(Map<String, dynamic> v) {
  final sec =
      (v['durationSec'] as num?)?.toInt() ??
      ((v['durationMin'] as num?)?.toInt() ?? 0) * 60;
  return sec <= 0 ? 'Video' : '${(sec / 60).ceil()} daqiqa';
}

String? _youtubeThumb(String url) {
  final m = RegExp(
    r'(?:youtu\.be/|youtube\.com/(?:watch\?(?:.*&)?v=|embed/|shorts/))([\w-]{11})',
  ).firstMatch(url);
  return m == null
      ? null
      : 'https://img.youtube.com/vi/${m.group(1)}/hqdefault.jpg';
}

/// Pleylistlar ro'yxati: har biri muqova, nom va darslar soni bilan.
class _PlaylistsTab extends StatelessWidget {
  const _PlaylistsTab();

  @override
  Widget build(BuildContext context) {
    return LoadView<List<Map<String, dynamic>>>(
      load: () async => (await Api.I.get('/playlists') as List)
          .map((p) => Map<String, dynamic>.from(p as Map))
          .toList(),
      builder: (context, list, reload) => RefreshIndicator(
        onRefresh: () async => reload(),
        child: list.isEmpty
            ? ListView(
                children: const [
                  Padding(
                    padding: EdgeInsets.all(32),
                    child: Text(
                      'Hozircha pleylistlar yo\'q.',
                      textAlign: TextAlign.center,
                    ),
                  ),
                ],
              )
            : ListView.builder(
                padding: const EdgeInsets.all(12),
                itemCount: list.length,
                itemBuilder: (_, i) {
                  final p = list[i];
                  final cover = p['cover'] as Map<String, dynamic>?;
                  final thumb = cover == null || cover['isFile'] == true
                      ? null
                      : _youtubeThumb(cover['videoUrl'] as String? ?? '');
                  final mins = (((p['durationSec'] as num?) ?? 0) / 60).ceil();
                  return Card(
                    clipBehavior: Clip.antiAlias,
                    child: InkWell(
                      onTap: () => Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => PlaylistPage(id: p['id'] as int),
                        ),
                      ),
                      child: Row(
                        children: [
                          SizedBox(
                            width: 130,
                            height: 86,
                            child: Stack(
                              fit: StackFit.expand,
                              children: [
                                thumb == null
                                    ? const ColoredBox(
                                        color: brandLight,
                                        child: Icon(
                                          Icons.play_circle_fill,
                                          size: 34,
                                          color: brand,
                                        ),
                                      )
                                    : Image.network(
                                        thumb,
                                        fit: BoxFit.cover,
                                        errorBuilder: (_, _, _) =>
                                            const ColoredBox(color: brandLight),
                                      ),
                                Positioned(
                                  right: 0,
                                  top: 0,
                                  bottom: 0,
                                  width: 44,
                                  child: ColoredBox(
                                    color: Colors.black.withValues(alpha: 0.7),
                                    child: Column(
                                      mainAxisAlignment:
                                          MainAxisAlignment.center,
                                      children: [
                                        Text(
                                          '${p['count']}',
                                          style: const TextStyle(
                                            color: Colors.white,
                                            fontWeight: FontWeight.w800,
                                            fontSize: 18,
                                          ),
                                        ),
                                        const Icon(
                                          Icons.playlist_play,
                                          color: Colors.white,
                                          size: 20,
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Expanded(
                            child: Padding(
                              padding: const EdgeInsets.all(12),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    p['title'] as String,
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w800,
                                      fontSize: 15,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    '${p['count']} ta dars${mins > 0 ? ' · $mins daqiqa' : ''}',
                                    style: const TextStyle(
                                      color: Color(0xFF7A879C),
                                      fontSize: 13,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
      ),
    );
  }
}

/// Pleylist ichi: darslar tartib raqami bilan, birinchisidan boshlab o'rganiladi.
class PlaylistPage extends StatefulWidget {
  const PlaylistPage({super.key, required this.id});
  final int id;

  @override
  State<PlaylistPage> createState() => _PlaylistPageState();
}

class _PlaylistPageState extends State<PlaylistPage> {
  Future<void> _toggle(Map<String, dynamic> v) async {
    final was = v['favorite'] == true;
    setState(() => v['favorite'] = !was);
    try {
      was
          ? await Api.I.delete('/videos/${v['id']}/favorite')
          : await Api.I.post('/videos/${v['id']}/favorite');
    } catch (e) {
      if (mounted) {
        setState(() => v['favorite'] = was);
        showError(context, e);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Pleylist')),
      body: LoadView<Map<String, dynamic>>(
        load: () async => Map<String, dynamic>.from(
          await Api.I.get('/playlists/${widget.id}') as Map,
        ),
        builder: (context, p, reload) {
          final videos = (p['videos'] as List).cast<Map<String, dynamic>>();
          final desc = p['description'] as String? ?? '';
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(
                p['title'] as String,
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 4),
              Text(
                '${videos.length} ta dars · tartib bilan o\'rganing',
                style: const TextStyle(color: Color(0xFF7A879C)),
              ),
              if (desc.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 10),
                  child: Text(desc),
                ),
              const SizedBox(height: 12),
              for (var i = 0; i < videos.length; i++)
                Card(
                  clipBehavior: Clip.antiAlias,
                  child: InkWell(
                    onTap: () async {
                      await Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => VideoDetailPage(
                            video: videos[i],
                            onToggle: () => _toggle(videos[i]),
                          ),
                        ),
                      );
                      if (mounted) setState(() {});
                    },
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Row(
                        children: [
                          // Kichik muqova, chap tepasida tartib raqami.
                          Stack(
                            children: [
                              LessonThumb(
                                url: (videos[i]['videoUrl'] as String?) ?? '',
                                width: 96,
                                height: 68,
                              ),
                              Positioned(
                                left: 0,
                                top: 0,
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8,
                                    vertical: 2,
                                  ),
                                  decoration: const BoxDecoration(
                                    color: brand,
                                    borderRadius: BorderRadius.only(
                                      topLeft: Radius.circular(10),
                                      bottomRight: Radius.circular(10),
                                    ),
                                  ),
                                  child: Text(
                                    '${i + 1}',
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontWeight: FontWeight.w800,
                                      fontSize: 13,
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  videos[i]['title'] as String,
                                  style: Theme.of(context).textTheme.titleSmall,
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  _dur(videos[i]),
                                  style: Theme.of(context).textTheme.bodySmall,
                                ),
                              ],
                            ),
                          ),
                          IconButton(
                            icon: Icon(
                              videos[i]['favorite'] == true
                                  ? Icons.favorite
                                  : Icons.favorite_border,
                              color: videos[i]['favorite'] == true
                                  ? Colors.red
                                  : null,
                            ),
                            onPressed: () => _toggle(videos[i]),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

/// Dars muqovasi: YouTube rasmi; yuklangan video yoki havolasiz dars uchun belgi.
class LessonThumb extends StatelessWidget {
  const LessonThumb({
    super.key,
    required this.url,
    required this.width,
    required this.height,
  });
  final String url;
  final double width, height;

  @override
  Widget build(BuildContext context) {
    final thumb = _youtubeThumb(url);
    const fallback = ColoredBox(
      color: brandLight,
      child: Center(
        child: Icon(Icons.play_circle_fill, size: 32, color: brand),
      ),
    );
    return ClipRRect(
      borderRadius: BorderRadius.circular(10),
      child: SizedBox(
        width: width,
        height: height,
        child: thumb == null
            ? fallback
            : Stack(
                fit: StackFit.expand,
                children: [
                  Image.network(
                    thumb,
                    fit: BoxFit.cover,
                    errorBuilder: (_, _, _) => fallback,
                  ),
                  const Center(
                    child: Icon(
                      Icons.play_circle_fill,
                      size: 30,
                      color: Colors.white70,
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}

/// Ilova ichida o'ynaydigan pleyer: YouTube havolasi yoki serverga yuklangan video.
class LessonPlayer extends StatelessWidget {
  const LessonPlayer({super.key, required this.url});
  final String url;

  @override
  Widget build(BuildContext context) {
    if (url.isEmpty) {
      return const AspectRatio(
        aspectRatio: 16 / 9,
        child: ColoredBox(
          color: brandLight,
          child: Center(
            child: Icon(Icons.videocam_off_outlined, size: 48, color: brand),
          ),
        ),
      );
    }
    final yt = _youtubeId(url);
    if (yt != null) return _YoutubePlayer(videoId: yt);
    return _FilePlayer(url: url.startsWith('/') ? Api.fileUrl(url) : url);
  }
}

String? _youtubeId(String url) => RegExp(
  r'(?:youtu\.be/|youtube\.com/(?:watch\?(?:.*&)?v=|embed/|shorts/))([\w-]{11})',
).firstMatch(url)?.group(1);

class _YoutubePlayer extends StatefulWidget {
  const _YoutubePlayer({required this.videoId});
  final String videoId;

  @override
  State<_YoutubePlayer> createState() => _YoutubePlayerState();
}

class _YoutubePlayerState extends State<_YoutubePlayer> {
  late final YoutubePlayerController _c = YoutubePlayerController.fromVideoId(
    videoId: widget.videoId,
    autoPlay: false,
    params: const YoutubePlayerParams(
      showFullscreenButton: true,
      strictRelatedVideos: true,
    ),
  );

  @override
  void dispose() {
    _c.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      YoutubePlayer(controller: _c, aspectRatio: 16 / 9);
}

class _FilePlayer extends StatefulWidget {
  const _FilePlayer({required this.url});
  final String url;

  @override
  State<_FilePlayer> createState() => _FilePlayerState();
}

class _FilePlayerState extends State<_FilePlayer> {
  late final VideoPlayerController _c = VideoPlayerController.networkUrl(
    Uri.parse(widget.url),
  );
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _c
        .initialize()
        .then((_) {
          if (mounted) setState(() {});
        })
        .catchError((_) {
          if (mounted) setState(() => _failed = true);
        });
    _c.addListener(() {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_failed) {
      return const AspectRatio(
        aspectRatio: 16 / 9,
        child: ColoredBox(
          color: brandLight,
          child: Center(child: Text('Videoni yuklab bo\'lmadi')),
        ),
      );
    }
    if (!_c.value.isInitialized) {
      return const AspectRatio(
        aspectRatio: 16 / 9,
        child: ColoredBox(
          color: Colors.black12,
          child: Center(child: CupertinoActivityIndicator(radius: 14)),
        ),
      );
    }
    final playing = _c.value.isPlaying;
    return AspectRatio(
      aspectRatio: _c.value.aspectRatio,
      child: Stack(
        alignment: Alignment.bottomCenter,
        children: [
          GestureDetector(
            onTap: () => playing ? _c.pause() : _c.play(),
            child: VideoPlayer(_c),
          ),
          if (!playing)
            IgnorePointer(
              child: Center(
                child: Icon(
                  Icons.play_circle_fill,
                  size: 64,
                  color: Colors.white.withValues(alpha: 0.9),
                ),
              ),
            ),
          VideoProgressIndicator(
            _c,
            allowScrubbing: true,
            colors: const VideoProgressColors(playedColor: brand),
          ),
        ],
      ),
    );
  }
}

// ---------- pullik darslar ----------

/// Pullik darslar ro'yxati: kurslar (pleylist) va yakka darslar. Sotib olinganlarida "Sotib olingan" belgisi.
class _PaidTab extends StatefulWidget {
  const _PaidTab();

  @override
  State<_PaidTab> createState() => _PaidTabState();
}

class _PaidTabState extends State<_PaidTab> {
  int _version = 0;

  @override
  Widget build(BuildContext context) {
    return LoadView<List<Map<String, dynamic>>>(
      key: ValueKey(_version),
      load: () async => (await Api.I.get('/paid') as List)
          .map((p) => Map<String, dynamic>.from(p as Map))
          .toList(),
      builder: (context, list, reload) => RefreshIndicator(
        onRefresh: () async => reload(),
        child: list.isEmpty
            ? ListView(
                children: const [
                  Padding(
                    padding: EdgeInsets.all(32),
                    child: Text(
                      'Hozircha pullik darslar yo\'q.',
                      textAlign: TextAlign.center,
                    ),
                  ),
                ],
              )
            : ListView.builder(
                padding: const EdgeInsets.all(12),
                itemCount: list.length,
                itemBuilder: (_, i) {
                  final p = list[i];
                  final bought = p['purchased'] == true;
                  final mins = (((p['durationSec'] as num?) ?? 0) / 60).ceil();
                  final count = p['count'] as int;
                  return Card(
                    clipBehavior: Clip.antiAlias,
                    child: InkWell(
                      onTap: () async {
                        await Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => PaidPage(
                              type: p['type'] as String,
                              id: p['id'] as int,
                            ),
                          ),
                        );
                        if (mounted) setState(() => _version++);
                      },
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Row(
                          children: [
                            _PaidThumb(
                              thumb: p['thumb'] as String?,
                              locked: !bought,
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    p['title'] as String,
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: Theme.of(context)
                                        .textTheme
                                        .titleSmall,
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    '${p['authorName'] != null ? '${p['authorName']} · ' : ''}${p['type'] == 'playlist' ? '$count ta dars · ' : ''}${mins > 0 ? '$mins daqiqa' : 'Video'}',
                                    style: Theme.of(context)
                                        .textTheme
                                        .bodySmall,
                                  ),
                                  const SizedBox(height: 6),
                                  bought
                                      ? const _Tag(
                                          'Sotib olingan',
                                          Color(0xFFE2F6EA),
                                          Color(0xFF1B7A4A),
                                        )
                                      : _Tag(
                                          '${som(p['price'] as int)} so\'m',
                                          const Color(0xFFFFF1D6),
                                          const Color(0xFF9A5B00),
                                        ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
      ),
    );
  }
}

class _Tag extends StatelessWidget {
  const _Tag(this.text, this.bg, this.fg);
  final String text;
  final Color bg, fg;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
    decoration: BoxDecoration(
      color: bg,
      borderRadius: BorderRadius.circular(10),
    ),
    child: Text(
      text,
      style: TextStyle(color: fg, fontWeight: FontWeight.w800, fontSize: 13),
    ),
  );
}

/// Pullik dars muqovasi: sotib olinmagan bo'lsa qulf belgisi bilan.
class _PaidThumb extends StatelessWidget {
  const _PaidThumb({required this.thumb, required this.locked});
  final String? thumb;
  final bool locked;

  @override
  Widget build(BuildContext context) {
    const fallback = ColoredBox(
      color: brandLight,
      child: Center(
        child: Icon(Icons.workspace_premium, size: 32, color: brand),
      ),
    );
    return ClipRRect(
      borderRadius: BorderRadius.circular(10),
      child: SizedBox(
        width: 96,
        height: 68,
        child: Stack(
          fit: StackFit.expand,
          children: [
            thumb == null
                ? fallback
                : Image.network(
                    thumb!,
                    fit: BoxFit.cover,
                    errorBuilder: (_, _, _) => fallback,
                  ),
            if (locked)
              Container(
                color: Colors.black38,
                child: const Center(
                  child: Icon(Icons.lock, color: Colors.white, size: 26),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Pullik kurs yoki dars: sotib olinmagan bo'lsa darslar nomlari qulf bilan, "Sotib olish" tugmasi.
/// Sotib olingach darslar ochiladi.
class PaidPage extends StatefulWidget {
  const PaidPage({super.key, required this.type, required this.id});
  final String type;
  final int id;

  @override
  State<PaidPage> createState() => _PaidPageState();
}

class _PaidPageState extends State<PaidPage> {
  int _version = 0;

  Future<void> _buy(Map<String, dynamic> p) async {
    if (!await ensureRegistered(
      context,
      why: 'Pullik darsni sotib olish uchun',
    )) {
      return;
    }
    if (!mounted) return;
    final ok = await showPayment(
      context,
      title: p['title'] as String,
      price: p['price'] as int,
      path: '/paid/${widget.type}/${widget.id}/buy',
    );
    if (ok && mounted) setState(() => _version++);
  }

  Future<void> _toggle(Map<String, dynamic> v) async {
    final was = v['favorite'] == true;
    setState(() => v['favorite'] = !was);
    try {
      was
          ? await Api.I.delete('/videos/${v['id']}/favorite')
          : await Api.I.post('/videos/${v['id']}/favorite');
    } catch (e) {
      if (mounted) {
        setState(() => v['favorite'] = was);
        showError(context, e);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Pullik dars')),
      body: LoadView<Map<String, dynamic>>(
        key: ValueKey(_version),
        load: () async => Map<String, dynamic>.from(
          await Api.I.get('/paid/${widget.type}/${widget.id}') as Map,
        ),
        builder: (context, p, reload) {
          final bought = p['purchased'] == true;
          final videos = (p['videos'] as List).cast<Map<String, dynamic>>();
          final desc = p['description'] as String? ?? '';
          final isCourse = p['type'] == 'playlist';
          return Stack(
            children: [
              ListView(
                padding: EdgeInsets.fromLTRB(16, 16, 16, bought ? 16 : 110),
                children: [
                  // Yakka pullik dars sotib olingach pleyerning o'zi ochiladi.
                  if (!isCourse && bought)
                    ClipRRect(
                      borderRadius: BorderRadius.circular(16),
                      child: LessonPlayer(
                        url: (videos.first['videoUrl'] as String?) ?? '',
                      ),
                    )
                  else
                    ClipRRect(
                      borderRadius: BorderRadius.circular(16),
                      child: AspectRatio(
                        aspectRatio: 16 / 9,
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            (p['thumb'] as String?) == null
                                ? const ColoredBox(
                                    color: brandLight,
                                    child: Icon(
                                      Icons.workspace_premium,
                                      size: 56,
                                      color: brand,
                                    ),
                                  )
                                : Image.network(
                                    p['thumb'] as String,
                                    fit: BoxFit.cover,
                                  ),
                            if (!bought)
                              Container(
                                color: Colors.black38,
                                child: const Center(
                                  child: Icon(
                                    Icons.lock,
                                    color: Colors.white,
                                    size: 48,
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                  const SizedBox(height: 14),
                  Text(
                    p['title'] as String,
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  const SizedBox(height: 6),
                  Text(
                    isCourse
                        ? '${videos.length} ta dars · tartib bilan o\'rganing'
                        : 'Pullik dars',
                    style: const TextStyle(color: Color(0xFF7A879C)),
                  ),
                  if (desc.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 10),
                      child: Text(desc),
                    ),
                  if (isCourse) ...[
                    const SizedBox(height: 14),
                    for (var i = 0; i < videos.length; i++)
                      Card(
                        child: ListTile(
                          leading: CircleAvatar(
                            backgroundColor: brandLight,
                            child: bought
                                ? Text(
                                    '${i + 1}',
                                    style: const TextStyle(
                                      color: brand,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  )
                                : const Icon(
                                    Icons.lock,
                                    size: 18,
                                    color: brand,
                                  ),
                          ),
                          title: Text(
                            videos[i]['title'] as String,
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                          subtitle: Text(_dur(videos[i])),
                          trailing: bought
                              ? const Icon(Icons.play_circle_outline)
                              : null,
                          onTap: bought
                              ? () async {
                                  await Navigator.push(
                                    context,
                                    MaterialPageRoute(
                                      builder: (_) => VideoDetailPage(
                                        video: videos[i],
                                        onToggle: () => _toggle(videos[i]),
                                      ),
                                    ),
                                  );
                                }
                              : () => _buy(p),
                        ),
                      ),
                  ],
                ],
              ),
              if (!bought)
                Positioned(
                  left: 16,
                  right: 16,
                  bottom: 16,
                  child: SafeArea(
                    child: GradientButton(
                      label: 'Sotib olish · ${som(p['price'] as int)} so\'m',
                      icon: Icons.lock_open,
                      onPressed: () => _buy(p),
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}
