// Xarita havolasidan (Google Maps, Yandex Maps, 2GIS, OpenStreetMap) koordinata ajratib oladi.
// Qisqa havolalar (maps.app.goo.gl va h.k.) serverda ochiladi, shuning uchun faqat ishonchli
// xarita domenlariga ruxsat beriladi — aks holda server ixtiyoriy manzilga so'rov yuborib qo'yadi.

const ALLOWED_HOSTS = [
  /(^|\.)google\.(com|uz|ru)$/,
  /(^|\.)goo\.gl$/,
  /(^|\.)yandex\.(com|uz|ru)$/,
  /(^|\.)2gis\.(uz|ru|com)$/,
  /(^|\.)openstreetmap\.org$/,
  /^osm\.org$/,
];

const isAllowedHost = (host) => ALLOWED_HOSTS.some((re) => re.test(host));

const validCoords = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

const pair = (a, b, lngFirst = false) => {
  const x = parseFloat(a);
  const y = parseFloat(b);
  const [lat, lng] = lngFirst ? [y, x] : [x, y];
  return validCoords(lat, lng) ? { lat, lng } : null;
};

const N = "(-?\\d{1,3}\\.\\d+)";

/** Havola matnidan koordinata topadi (tarmoqsiz). Topilmasa null. */
function extractCoords(href) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const host = url.hostname;
  const text = decodeURIComponent(href.replace(/%(?![0-9a-f]{2})/gi, "%25"));

  // Yandex va 2GIS: parametrda "uzunlik,kenglik" (lng,lat) tartibida.
  if (/yandex\./.test(host)) {
    for (const key of ["ll", "pt", "whatshere[point]"]) {
      const v = url.searchParams.get(key);
      const m = v && v.match(new RegExp(`^${N},${N}`));
      if (m) return pair(m[1], m[2], true);
    }
    return null;
  }
  if (/2gis\./.test(host)) {
    const m = (url.searchParams.get("m") || "").match(new RegExp(`^${N},${N}`));
    return m ? pair(m[1], m[2], true) : null;
  }

  if (/openstreetmap\.org$|^osm\.org$/.test(host)) {
    const m = text.match(new RegExp(`#map=\\d+/${N}/${N}`));
    if (m) return pair(m[1], m[2]);
    const lat = url.searchParams.get("mlat");
    const lon = url.searchParams.get("mlon");
    return lat && lon ? pair(lat, lon) : null;
  }

  // Google: aniq joy (!3d..!4d..) ustun turadi, so'ng @lat,lng, so'ng q=/ll=/place/.
  for (const re of [
    new RegExp(`!3d${N}!4d${N}`),
    new RegExp(`@${N},${N}`),
    new RegExp(`[?&](?:q|ll|query|destination|center)=${N},\\s*${N}`),
    new RegExp(`/place/${N},${N}`),
  ]) {
    const m = text.match(re);
    if (m) return pair(m[1], m[2]);
  }
  return null;
}

/**
 * Havolani koordinataga aylantiradi. Qisqa havola bo'lsa, yo'naltirishlarni (redirect)
 * kuzatadi — har bir qadamda domen ruxsat etilgan ro'yxatda bo'lishi shart.
 * Xato bo'lsa, foydalanuvchiga tushunarli xabarli Error tashlaydi.
 */
async function resolveLocation(input) {
  const fail = (msg) => Object.assign(new Error(msg), { status: 400 });
  let url;
  try {
    url = new URL(String(input || "").trim());
  } catch {
    throw fail("Bu havolaga o'xshamaydi. Xarita ilovasidan «Ulashish» orqali havolani nusxalang.");
  }

  for (let hop = 0; hop < 6; hop++) {
    if (!/^https?:$/.test(url.protocol) || !isAllowedHost(url.hostname)) {
      throw fail("Faqat Google Maps, Yandex Maps yoki OpenStreetMap havolasi qabul qilinadi.");
    }
    const found = extractCoords(url.href);
    if (found) return found;

    let res;
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(6000),
        headers: { "user-agent": "Mozilla/5.0 (Motherly location resolver)" },
      });
    } catch {
      throw fail("Havolani ochib bo'lmadi. Internetni tekshirib, qayta urinib ko'ring.");
    }
    const next = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!next) break;
    url = new URL(next, url);
  }
  throw fail("Havoladan joylashuv topilmadi. Xaritada joyni tanlab, «Ulashish» orqali havolani nusxalang.");
}

module.exports = { resolveLocation, extractCoords };
