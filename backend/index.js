const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { Op, QueryTypes } = require("sequelize");

dotenv.config();

const {
  sequelize, User, DoctorProfile, NurseProfile, Hire, Clinic, ClinicStaff, ClinicPhoto, ClinicNurse, Visit,
  Conversation, Message, Child, Video, Playlist, Purchase, Favorite,
} = require("./models");
const seed = require("./seed");
const migrate = require("./migrate");
const { normalizeWorkHours, summarizeWorkHours, openStatus } = require("./hours");
const { askAssistant, describeChild } = require("./ai");
const {
  hashPassword, verifyPassword, generatePassword, cleanUsername, suggestUsername, USERNAME_RE, ensureAdmin,
  encryptSecret, decryptSecret,
} = require("./accounts");
const { resolveLocation } = require("./location");

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
// MVP: haqiqiy SMS yo'q, hamma uchun shu kod ishlaydi.
const DEV_SMS_CODE = process.env.DEV_SMS_CODE || "1111";

class HttpError extends Error {
  constructor(status, message, reason) {
    super(message);
    this.status = status;
    this.reason = reason; // mobil ilova shu bo'yicha maxsus oyna ko'rsatadi (masalan "registration_required")
  }
}

const UPLOAD_DIR = path.join(__dirname, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) =>
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Ba'zi mijozlar fayl turini (Content-Type) yubormaydi (application/octet-stream) — kengaytmadan aniqlaymiz.
const MIME_BY_EXT = { ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
function fixMime(file) {
  if (!file.mimetype || file.mimetype === "application/octet-stream") {
    file.mimetype = MIME_BY_EXT[path.extname(file.originalname).toLowerCase()] || file.mimetype;
  }
}

const uploadImage = multer({
  storage: upload.storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    fixMime(file);
    /^image\/(jpeg|png|webp)$/.test(file.mimetype) ? cb(null, true) : cb(new HttpError(400, "Faqat JPG, PNG yoki WebP rasm"));
  },
});

// Video darslar (admin yuklaydi): 500 MB gacha mp4/webm/mov.
const uploadVideo = multer({
  storage: upload.storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^video\/(mp4|webm|quicktime)$/.test(file.mimetype) || /\.(mp4|webm|mov)$/i.test(file.originalname);
    ok ? cb(null, true) : cb(new HttpError(400, "Faqat MP4, WebM yoki MOV video"));
  },
});

const app = express();
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(UPLOAD_DIR));

// ---------- yordamchilar ----------

async function auth(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new HttpError(401, "Token kerak");
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    throw new HttpError(401, "Token yaroqsiz");
  }
  const user = await User.findByPk(payload.id);
  if (!user) throw new HttpError(401, "Foydalanuvchi topilmadi");
  req.user = user;
  touchSeen(user);
  next();
}

// Oxirgi faollikni belgilaymiz (har foydalanuvchi uchun 30 soniyada bir martadan ko'p emas): chatda "onlayn" belgisi.
const seenAt = new Map();
function touchSeen(user) {
  const now = Date.now();
  if (now - (seenAt.get(user.id) || 0) < 30_000) return;
  seenAt.set(user.id, now);
  User.update({ lastSeenAt: new Date(now) }, { where: { id: user.id }, silent: true }).catch(() => {});
}

/** "online" (so'nggi 90 soniya), "away" (30 daqiqagacha), aks holda "offline". */
function presence(u) {
  const t = u?.lastSeenAt ? new Date(u.lastSeenAt).getTime() : 0;
  const age = Date.now() - t;
  if (t && age < 90_000) return "online";
  if (t && age < 30 * 60_000) return "away";
  return "offline";
}

const requireRole = (role) => (req, _res, next) => {
  if (req.user.role !== role) throw new HttpError(403, `Faqat ${role} roli uchun`);
  next();
};

// Mehmon — ro'yxatdan o'tmagan ona (telefoni yo'q). Ilovadan foydalanadi, telefonni faqat kerak bo'lganda tasdiqlaydi.
const isGuest = (u) => u.role === "user" && !u.phone;
const userJson = (u) => ({ id: u.id, phone: u.phone, role: u.role, name: u.name, username: u.username, guest: isGuest(u) });

const requireRegistered = (req, _res, next) => {
  if (isGuest(req.user)) {
    throw new HttpError(403, "Davom etish uchun telefon raqamingizni tasdiqlab, ro'yxatdan o'ting", "registration_required");
  }
  next();
};

function haversineKm(lat1, lng1, lat2, lng2) {
  const rad = (d) => (d * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

const messageJson = (m, me) => ({
  id: m.id,
  text: m.text,
  kind: m.kind,
  fileUrl: m.fileUrl,
  mine: m.senderId === me.id,
  createdAt: m.createdAt,
  read: !!m.readAt,
});

async function getConversationFor(user, id) {
  const c = await Conversation.findByPk(id);
  if (!c || (c.userId !== user.id && c.peerId !== user.id)) {
    throw new HttpError(404, "Suhbat topilmadi");
  }
  return c;
}

async function findOrCreateConversation(kind, userId, peerId) {
  const [c] = await Conversation.findOrCreate({
    where: { kind, userId, peerId: peerId ?? null },
    defaults: { kind, userId, peerId: peerId ?? null },
  });
  return c;
}

// Oddiy demo AI. Keyin haqiqiy modelga almashtiriladi.
function fakeAiReply(text) {
  const t = text.toLowerCase();
  const topics = [
    [/(isitma|harorat|temperatura)/, "Harorat 38.5°C dan oshsa yoki 3 kundan ortiq davom etsa, albatta doktorga murojaat qiling. Ko'proq suyuqlik bering. Bolangiz yoshi nechada?"],
    [/(yo'tal|yotal|shamollash)/, "Yo'tal qancha vaqtdan beri davom etyapti va nafas olishda qiyinchilik bormi? Nafas qisilsa, zudlik bilan shifokorga boring."],
    [/(tarbiya|xulq|injiq|aytganini qilmay)/, "Bola tarbiyasida asosiysi izchillik va sabr. Bolangiz necha yoshda va aynan nima sizni qiynayapti (injiqlik, aytganini qilmaslik, urishish)? Shunga qarab aniq maslahat beraman."],
    [/(ta'lim|talim|o'qish|oqish|maktab|bog'cha|bogcha)/, "Bolaning yoshiga qarab o'qishga tayyorlash usuli farq qiladi. U necha yoshda va nima qiyin bo'lyapti: harflarni o'rganish, e'tibor, maktabga tayyorgarlikmi?"],
    [/(psixolog|xavotir|qo'rq|qorq|stress|yig'lay|yiglay)/, "Bolaning his-tuyg'ulari muhim. U qachondan beri xavotirda yoki qo'rqmoqda va bunga nima sabab bo'lgani ehtimol? Vaziyat og'ir bo'lsa, bolalar psixologi bilan uchrashishni tavsiya qilaman."],
    [/(xavfsiz|internet|telefon|planshet|multfilm|ekran)/, "Bola ekran oldida o'tkazadigan vaqtni yoshiga qarab cheklang va kontentni birga tanlang. Bolangiz necha yoshda va kuniga taxminan necha soat ekranga qaraydi?"],
    [/(ovqat|emayapti|ishtaha)/, "Bolaning yoshi va oxirgi kunlardagi ovqatlanishi haqida yozing. Kerak bo'lsa 'Mutaxassis' bo'limidan nutritsiolog bilan maslahatlashing."],
    [/(uyqu|uxlay|uxla)/, "Uyqu rejimi bolaning yoshiga bog'liq. U necha yoshda, qachon yotadi va tunda necha marta uyg'onadi?"],
    [/(emlash|ukol|vaksin)/, "Emlash jadvali bolaning yoshiga qarab belgilanadi. Bolangiz necha oylik va qaysi emlash haqida savolingiz bor? Emlashdan keyin holati o'zgargan bo'lsa, ayting."],
    [/(rivojlan|o'yin|oyin|gapirmay|yurmay)/, "Har bir bola o'z tezligida rivojlanadi. U necha oylik yoki yoshda va qaysi ko'nikma (gapirish, yurish, o'yin) bo'yicha xavotirdasiz?"],
  ];
  const hit = topics.find(([re]) => re.test(t));
  if (hit) return hit[1];
  return "Tushundim. Bolangizning yoshi, vazni va alomatlari qachondan beri davom etayotganini yozib bering. Zarur bo'lsa 'Mutaxassis' bo'limidan mutaxassisni yollashingiz mumkin.";
}

// ---------- umumiy ----------

app.get("/", (_req, res) => res.json({ message: "Motherly API is running", status: "ok" }));

app.get("/api/health", async (_req, res) => {
  const [rows] = await sequelize.query("SELECT NOW() AS current_time");
  res.json({ status: "ok", message: "Database connected", current_time: rows[0].current_time });
});

// ---------- auth ----------

app.post("/api/auth/request-code", (req, res) => {
  const phone = String(req.body.phone || "").replace(/\s/g, "");
  if (!/^\+?\d{12}$/.test(phone)) throw new HttpError(400, "Telefon raqam noto'g'ri");
  // Haqiqiy SMS yuborilmaydi (MVP).
  res.json({ ok: true, devHint: `Demo: SMS kod ${DEV_SMS_CODE}` });
});

const ROLE_LABEL = { user: "ona", nurse: "mutaxassis", clinic: "klinika", admin: "admin" };

// Mehmon akkaunti: ilova birinchi ochilganda yaratiladi, ro'yxatdan o'tish shart emas.
// Ma'lumotlar (bolalar, suhbatlar) shu akkauntda saqlanadi va keyin telefon bog'langanda saqlanib qoladi.
const guestCreated = new Map();
app.post("/api/auth/guest", async (req, res) => {
  const now = Date.now();
  const recent = (guestCreated.get(req.ip) || []).filter((t) => now - t < 3_600_000);
  if (recent.length >= 20) throw new HttpError(429, "Juda ko'p urinish. Birozdan keyin qayta urinib ko'ring");
  recent.push(now);
  guestCreated.set(req.ip, recent);
  const user = await User.create({ role: "user" });
  // Mehmon qayta kira olmaydi (telefon yo'q), shuning uchun token uzoq muddatli.
  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "365d" });
  res.status(201).json({ token, user: userJson(user) });
});

/** Authorization berilgan bo'lsa shu foydalanuvchi (yaroqsiz bo'lsa null). */
async function optionalUser(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  try {
    return await User.findByPk(jwt.verify(header.slice(7), JWT_SECRET).id);
  } catch {
    return null;
  }
}

/** Mehmonning ma'lumotlarini mavjud akkauntga ko'chiradi va mehmonni o'chiradi. */
async function mergeGuestInto(guest, target) {
  await sequelize.transaction(async (t) => {
    const where = { userId: guest.id };
    await Child.update({ userId: target.id }, { where, transaction: t });
    await Visit.update({ userId: target.id }, { where, transaction: t });
    // Sevimlilar: takrorlanmaydiganlarini ko'chiramiz.
    await sequelize.query(
      `UPDATE "Favorites" SET "userId" = :to WHERE "userId" = :from AND "videoId" NOT IN (SELECT "videoId" FROM "Favorites" WHERE "userId" = :to)`,
      { replacements: { to: target.id, from: guest.id }, transaction: t },
    );
    await Favorite.destroy({ where, transaction: t });
    // Mehmonning AI suhbati o'chadi (mavjud akkauntning o'zining suhbati bor).
    const convs = await Conversation.findAll({ where, transaction: t });
    if (convs.length) {
      await Message.destroy({ where: { conversationId: { [Op.in]: convs.map((c) => c.id) } }, transaction: t });
      await Conversation.destroy({ where, transaction: t });
    }
    await guest.destroy({ transaction: t });
  });
}

// Telefon + SMS bilan ona ro'yxatdan o'tadi yoki kiradi. Hamshira (klinika bergan telefon+parol), klinika va admin login/parol bilan (/api/auth/login).
// Mehmon tokeni bilan chaqirilsa, mehmonning ma'lumotlari saqlanib qoladi: telefon shu akkauntga bog'lanadi
// yoki telefon allaqachon ro'yxatdan o'tgan bo'lsa ma'lumotlar o'sha akkauntga ko'chadi.
app.post("/api/auth/verify", async (req, res) => {
  let phone = String(req.body.phone || "").replace(/\s/g, "");
  if (!phone.startsWith("+")) phone = `+${phone}`;
  if (String(req.body.code) !== DEV_SMS_CODE) throw new HttpError(400, "SMS kod noto'g'ri");
  if (["clinic", "admin"].includes(req.body.role)) {
    throw new HttpError(403, "Klinika akkauntini faqat admin yaratadi. Admin bergan login va parol bilan kiring.");
  }
  if (req.body.role === "nurse") {
    throw new HttpError(403, "Mutaxassis klinika bergan telefon raqam va parol bilan kiradi.");
  }
  const current = await optionalUser(req);
  const guest = current && isGuest(current) ? current : null;

  let user = await User.findOne({ where: { phone } });
  if (user) {
    if (user.role !== "user") throw new HttpError(403, "Bu akkaunt parol bilan kiradi");
    if (guest) await mergeGuestInto(guest, user);
  } else if (guest) {
    user = await guest.update({ phone });
  } else {
    user = await User.create({ phone, role: "user" });
  }
  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "30d" });
  res.json({ token, user: userJson(user) });
});

// Admin va klinika login bilan, mutaxassis (hamshira) telefon raqami bilan kiradi (parol — klinika bergan).
app.post("/api/auth/login", async (req, res) => {
  const password = String(req.body.password || "");
  const byPhone = req.body.phone != null && req.body.username == null;
  const identity = byPhone ? String(req.body.phone).replace(/[\s\-()]/g, "") : cleanUsername(req.body.username);
  if (!identity || !password) throw new HttpError(400, byPhone ? "Telefon raqam va parolni kiriting" : "Login va parolni kiriting");
  let user = null;
  if (byPhone) {
    const phone = identity.startsWith("+") ? identity : `+${identity}`;
    user = await User.findOne({ where: { phone, role: "nurse" } });
  } else {
    user = await User.findOne({ where: { username: identity } });
  }
  // Login yoki parol xato bo'lsa bir xil xabar: akkaunt mavjudligini bildirmaymiz.
  const allowed = byPhone ? ["nurse"] : ["admin", "clinic"];
  const ok = user && allowed.includes(user.role) && (await verifyPassword(password, user.passwordHash));
  if (!ok) {
    throw new HttpError(401, byPhone ? "Telefon raqam yoki parol noto'g'ri" : "Login yoki parol noto'g'ri");
  }
  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "30d" });
  res.json({ token, user: userJson(user) });
});

app.get("/api/me", auth, (req, res) => res.json(userJson(req.user)));

app.put("/api/me", auth, async (req, res) => {
  if (typeof req.body.name === "string") await req.user.update({ name: req.body.name.trim() });
  res.json(userJson(req.user));
});

// ---------- mutaxassislar (ilovada maslahat beradigan hamshiralar) ----------
//
// Klinika hamshirani telefon raqami bilan o'z ro'yxatiga qo'shadi (ClinicNurse). Hamshira ilovada shu raqam bilan kirib,
// klinikalaridan birini tanlab e'lon (DoctorProfile) joylaydi. Hujjat yuborish va tasdiqlash yo'q: klinika qo'shgani
// uning shu yerda ishlashining tasdig'i.

const consultantJson = (d) => ({
  id: d.id, name: d.name, field: d.field, experience: d.experience, about: d.about, price: d.price,
  clinic: d.Clinic ? { id: d.Clinic.id, name: d.Clinic.name, address: d.Clinic.address || "" } : null,
});

// E'lon egasi hamon shu klinikaning hamshirasi ekanini tekshiradigan SQL sharti (DoctorProfile jadvali uchun).
const ACTIVE_LISTING = sequelize.literal(`EXISTS (
  SELECT 1 FROM "ClinicNurses" n JOIN "Users" u ON u."phone" = n."phone"
  WHERE n."clinicId" = "DoctorProfile"."clinicId" AND u."id" = "DoctorProfile"."userId")`);

/** Hamshira ishlaydigan klinikalar (uni qo'shgan klinikalar). */
async function nurseClinics(user) {
  if (!user.phone) return [];
  const rows = await ClinicNurse.findAll({ where: { phone: user.phone }, include: [{ model: Clinic }], order: [["id", "ASC"]] });
  // Klinika yozgan yo'nalish (field) e'lon formasini oldindan to'ldirish uchun qaytariladi.
  return rows.filter((r) => r.Clinic).map((r) => Object.assign(r.Clinic, { nurseField: r.field || "" }));
}

// Faqat klinikasi bor hamshiralarning e'lonlari onalarga ko'rinadi.
app.get("/api/consultants", auth, async (req, res) => {
  const list = await DoctorProfile.findAll({
    where: { [Op.and]: [{ clinicId: { [Op.ne]: null } }, ACTIVE_LISTING] },
    include: [{ model: Clinic }],
    order: [["id", "ASC"]],
  });
  const hires = await Hire.findAll({ where: { userId: req.user.id } });
  const hired = new Set(hires.map((h) => h.doctorProfileId));
  const convs = await Conversation.findAll({ where: { kind: "nurse", userId: req.user.id } });
  res.json(list.map((d) => ({
    ...consultantJson(d), hired: hired.has(d.id),
    conversationId: hired.has(d.id) ? convs.find((c) => c.peerId === d.userId)?.id ?? null : null,
  })));
});

// Hamshira: qaysi klinikalar qo'shgan va har biri uchun e'loni.
app.get("/api/consultants/me", auth, requireRole("nurse"), async (req, res) => {
  const clinics = await nurseClinics(req.user);
  const profiles = await DoctorProfile.findAll({ where: { userId: req.user.id } });
  const nurseProfile = await NurseProfile.findOne({ where: { userId: req.user.id } });
  res.json({
    profile: nurseProfileJson(req.user, nurseProfile),
    clinics: clinics.map((c) => {
      const p = profiles.find((x) => x.clinicId === c.id);
      return {
        id: c.id, name: c.name, address: c.address || "", photoUrl: c.photoUrl || null,
        field: c.nurseField || "",
        profile: p ? consultantJson(p) : null,
      };
    }),
  });
});

// E'lon joylash yoki yangilash: qaysi klinika nomidan ekani `clinicId` bilan tanlanadi.
app.put("/api/consultants/me", auth, requireRole("nurse"), async (req, res) => {
  const { name, field, experience, about, price } = req.body;
  const clinicId = parseInt(req.body.clinicId) || 0;
  const clinics = await nurseClinics(req.user);
  if (!clinics.some((c) => c.id === clinicId)) {
    throw new HttpError(403, "Bu klinika sizni o'z ro'yxatiga qo'shmagan. Klinika rahbaridan sizni qo'shishini so'rang");
  }
  if (!name || !field) throw new HttpError(400, "Ism va soha kerak");
  const data = {
    name: String(name).trim(), field: String(field).trim(), about: String(about || "").trim(),
    experience: Math.max(0, parseInt(experience) || 0),
    price: Math.max(0, parseInt(price) || 50000),
  };
  let p = await DoctorProfile.findOne({ where: { userId: req.user.id, clinicId } });
  if (p) await p.update(data);
  else p = await DoctorProfile.create({ ...data, userId: req.user.id, clinicId });
  await req.user.update({ name: data.name });
  res.json(consultantJson(await DoctorProfile.findByPk(p.id, { include: [{ model: Clinic }] })));
});

// E'lonni olib tashlash (hamshira klinikada qoladi, faqat onalarga ko'rinmaydi).
app.delete("/api/consultants/me/:clinicId", auth, requireRole("nurse"), async (req, res) => {
  await DoctorProfile.destroy({ where: { userId: req.user.id, clinicId: parseInt(req.params.clinicId) || 0 } });
  res.json({ ok: true });
});

// Soxta to'lov: summa va provayder qabul qilinadi, hech qanday haqiqiy pul o'tmaydi.
app.post("/api/consultants/:id/hire", auth, requireRole("user"), requireRegistered, async (req, res) => {
  const consultant = await DoctorProfile.findOne({
    where: { id: parseInt(req.params.id) || 0, clinicId: { [Op.ne]: null }, [Op.and]: [ACTIVE_LISTING] },
  });
  if (!consultant) throw new HttpError(404, "Mutaxassis topilmadi");
  const provider = req.body.provider;
  const amount = parseInt(req.body.amount);
  if (!["click", "payme"].includes(provider)) throw new HttpError(400, "To'lov turi noto'g'ri");
  if (!(amount >= consultant.price)) throw new HttpError(400, `Minimal summa ${consultant.price} so'm`);

  await Hire.findOrCreate({
    where: { userId: req.user.id, doctorProfileId: consultant.id },
    defaults: { userId: req.user.id, doctorProfileId: consultant.id, amount, provider },
  });
  const conv = await findOrCreateConversation("nurse", req.user.id, consultant.userId);
  if ((await Message.count({ where: { conversationId: conv.id } })) === 0) {
    await Message.create({
      conversationId: conv.id, senderId: consultant.userId, kind: "text",
      text: `Assalomu alaykum! Men ${consultant.name}. Savolingizni yozing.`,
    });
  }
  res.json({ ok: true, conversationId: conv.id });
});

// ---------- klinikalar va murojaatlar ----------
//
// Navbat tizimi yo'q: ona "Murojaat yuborish" bosadi, klinika uni murojaatlar ro'yxatida ko'radi va o'zi bog'lanadi.
// Visit.status: "en_route" — yangi murojaat, "done" — klinika ko'rib chiqdi.

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

const MAX_CLINIC_PHOTOS = 10;
const CLINIC_INCLUDE = [
  { model: ClinicStaff, as: "staff" },
  { model: ClinicPhoto, as: "photos" },
];
const CLINIC_ORDER = [[{ model: ClinicPhoto, as: "photos" }, "position", "ASC"], [{ model: ClinicPhoto, as: "photos" }, "id", "ASC"]];

// Klinika ma'lumotlari to'ldirilganmi (joylashuv bor)? To'ldirilmaganlar onalarga ko'rinmaydi.
const isClinicComplete = (c) => c.lat != null && c.lng != null && !!c.address && !!c.hours;

const clinicJson = (c) => ({
  id: c.id, name: c.name, address: c.address || "", lat: c.lat, lng: c.lng, hours: c.hours || "",
  phone: c.phone || "", extraPhones: c.extraPhones || [], about: c.about || "", services: c.services || "",
  // photoUrl — birinchi rasm (eski mobil versiyalar uchun), photos — to'liq galereya.
  photoUrl: c.photos?.[0]?.url || null,
  photos: (c.photos || []).map((p) => ({ id: p.id, url: p.url })),
  mapUrl: c.mapUrl || null,
  workHours: c.workHours || null,
  ...(({ openNow, note }) => ({ openNow, hoursNote: note }))(openStatus(c.workHours)),
  staff: (c.staff || [])
    .slice()
    .sort((a, b) => a.id - b.id)
    .map((s) => ({ id: s.id, name: s.name, position: s.position, schedule: s.schedule, experience: s.experience })),
});

app.get("/api/clinics", auth, async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const list = (await Clinic.findAll({ include: CLINIC_INCLUDE, order: CLINIC_ORDER })).filter(isClinicComplete);
  const out = [];
  for (const c of list) {
    out.push({
      ...clinicJson(c),
      distanceKm: Number.isFinite(lat) && Number.isFinite(lng)
        ? Math.round(haversineKm(lat, lng, c.lat, c.lng) * 10) / 10
        : null,
    });
  }
  out.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
  res.json(out);
});

// Ona klinikaga murojaat yuboradi. Bugun shu klinikaga yuborilgan ko'rilmagan murojaati bo'lsa, yangisi yaratilmaydi.
app.post("/api/clinics/:id/visit", auth, requireRole("user"), requireRegistered, async (req, res) => {
  const clinic = await Clinic.findByPk(req.params.id);
  if (!clinic) throw new HttpError(404, "Klinika topilmadi");
  const existing = await Visit.findOne({
    where: { clinicId: clinic.id, userId: req.user.id, status: "en_route", createdAt: { [Op.gte]: startOfToday() } },
  });
  if (!existing) await Visit.create({ clinicId: clinic.id, userId: req.user.id });
  res.status(existing ? 200 : 201).json({ ok: true, clinic: clinic.name, duplicate: !!existing });
});

// ---------- klinika sayti (doktorxona qabulxonasi) ----------

// Klinika joylashuvni xarita havolasi orqali beradi; koordinata undan olinadi.
app.post("/api/clinic/resolve-location", auth, requireRole("clinic"), async (req, res) => {
  res.json(await resolveLocation(req.body.url));
});

app.get("/api/clinic/me", auth, requireRole("clinic"), async (req, res) => {
  const c = await Clinic.findOne({ where: { ownerId: req.user.id }, include: CLINIC_INCLUDE, order: CLINIC_ORDER });
  res.json(c ? clinicJson(c) : null);
});

// Asosiy telefon: bo'sh yoki +998 va 9 ta raqam (probel, tire, qavslar olib tashlanadi).
function cleanMainPhone(v) {
  const raw = String(v || "").trim();
  if (!raw) return "";
  const phone = raw.replace(/[\s\-()]/g, "");
  if (!/^\+998\d{9}$/.test(phone)) throw new HttpError(400, "Asosiy telefon +998 bilan boshlanib, 9 ta raqamdan iborat bo'lsin");
  return phone;
}

// Qo'shimcha raqamlar: klinika xohlagancha yozadi (izoh + raqam). Bo'sh qatorlar tashlab yuboriladi.
const MAX_EXTRA_PHONES = 10;
function cleanExtraPhones(list) {
  const out = (Array.isArray(list) ? list : [])
    .map((p) => ({ label: String(p?.label || "").trim(), number: String(p?.number || "").trim() }))
    .filter((p) => p.label || p.number);
  if (out.length > MAX_EXTRA_PHONES) throw new HttpError(400, `Eng ko'pi bilan ${MAX_EXTRA_PHONES} ta qo'shimcha raqam`);
  for (const p of out) {
    if (p.label.length > 60) throw new HttpError(400, "Izoh 60 belgidan oshmasin");
    if (p.number.length < 3 || p.number.length > 40 || (p.number.match(/\d/g) || []).length < 3) {
      throw new HttpError(400, `"${p.label || p.number}" uchun telefon raqamni to'g'ri yozing`);
    }
  }
  return out;
}

// Ish vaqti: haftalik jadval (workHours) berilsa matn ko'rinishi undan yasaladi; bo'lmasa eski matnli hours qabul qilinadi.
function hoursFields(b, existing) {
  if (b.workHours != null) {
    const workHours = normalizeWorkHours(b.workHours);
    return { workHours, hours: summarizeWorkHours(workHours) };
  }
  const hours = String(b.hours || "").trim();
  if (!hours) throw new HttpError(400, "Ish vaqti kerak");
  return { hours, workHours: hours === existing?.hours ? existing.workHours : null };
}

app.put("/api/clinic/me", auth, requireRole("clinic"), async (req, res) => {
  const b = req.body;
  const str = (v, label) => {
    const t = String(v || "").trim();
    if (!t) throw new HttpError(400, `${label} kerak`);
    return t;
  };
  const existing = await Clinic.findOne({ where: { ownerId: req.user.id } });
  const mapUrl = String(b.mapUrl || "").trim();
  let coords;
  if (mapUrl && mapUrl !== existing?.mapUrl) coords = await resolveLocation(mapUrl);
  else if (existing?.lat != null) coords = { lat: existing.lat, lng: existing.lng }; // havola o'zgarmagan
  else throw new HttpError(400, "Joylashuv havolasini kiriting");

  const data = {
    ...coords,
    mapUrl: mapUrl || existing?.mapUrl || null,
    name: str(b.name, "Klinika nomi"),
    address: str(b.address, "Manzil"),
    ...hoursFields(b, existing),
    phone: cleanMainPhone(b.phone),
    extraPhones: cleanExtraPhones(b.extraPhones),
    about: String(b.about || "").trim(),
    services: String(b.services || "").trim(),
  };
  const staff = (Array.isArray(b.staff) ? b.staff : [])
    .map((s) => ({
      id: parseInt(s.id) || null,
      name: String(s.name || "").trim(),
      position: String(s.position || "").trim(),
      schedule: String(s.schedule || "").trim(),
      experience: s.experience === "" || s.experience == null ? null : Number(s.experience),
    }))
    .filter((s) => s.name);
  for (const s of staff) {
    if (!s.position || !s.schedule) throw new HttpError(400, `"${s.name}" uchun mutaxassislik va ish vaqti kerak`);
    if (s.experience !== null && !(Number.isInteger(s.experience) && s.experience >= 0 && s.experience <= 60)) {
      throw new HttpError(400, `"${s.name}" tajribasi 0–60 yil oralig'ida bo'lishi kerak`);
    }
  }

  const clinic = await sequelize.transaction(async (t) => {
    let c = await Clinic.findOne({ where: { ownerId: req.user.id }, transaction: t });
    if (c) await c.update(data, { transaction: t });
    else c = await Clinic.create({ ...data, ownerId: req.user.id }, { transaction: t });
    // Mavjud xodimlar id si saqlanadi (ona ilovasi shu id bilan shifokor tanlaydi): yangilanadi, yo'qlari o'chadi.
    const current = await ClinicStaff.findAll({ where: { clinicId: c.id }, transaction: t });
    const keep = new Set(staff.map((s) => s.id).filter((id) => current.some((x) => x.id === id)));
    await ClinicStaff.destroy({ where: { clinicId: c.id, id: { [Op.notIn]: [...keep, 0] } }, transaction: t });
    for (const { id, ...fields } of staff) {
      if (keep.has(id)) await ClinicStaff.update(fields, { where: { id, clinicId: c.id }, transaction: t });
      else await ClinicStaff.create({ ...fields, clinicId: c.id }, { transaction: t });
    }
    return c;
  });
  const full = await Clinic.findByPk(clinic.id, { include: CLINIC_INCLUDE, order: CLINIC_ORDER });
  res.json(clinicJson(full));
});

async function myClinic(user) {
  const c = await Clinic.findOne({ where: { ownerId: user.id } });
  if (!c) throw new HttpError(400, "Avval klinika ma'lumotlarini kiriting");
  return c;
}

// Klinika rasmlari (10 tagacha). O'chirilganda fayl ham diskdan o'chadi.
function removeUpload(url) {
  if (!url || !url.startsWith("/uploads/")) return;
  fs.unlink(path.join(UPLOAD_DIR, path.basename(url)), () => {});
}

// Birinchi rasm o'zgarsa Clinic.photoUrl ham yangilanadi (eski mobil versiyalar shuni o'qiydi).
async function syncCoverPhoto(clinic, transaction) {
  const first = await ClinicPhoto.findOne({ where: { clinicId: clinic.id }, order: [["position", "ASC"], ["id", "ASC"]], transaction });
  await clinic.update({ photoUrl: first?.url || null }, { transaction });
}

app.post("/api/clinic/me/photos", auth, requireRole("clinic"), uploadImage.array("photos", MAX_CLINIC_PHOTOS), async (req, res) => {
  const files = req.files || [];
  const discard = () => files.forEach((f) => removeUpload(`/uploads/${f.filename}`));
  try {
    const c = await myClinic(req.user);
    if (!files.length) throw new HttpError(400, "Rasm kerak");
    await sequelize.transaction(async (t) => {
      // Klinika qatorini qulflaymiz: ikki so'rov bir vaqtda 10 tadan oshirib yubormasin.
      await Clinic.findByPk(c.id, { transaction: t, lock: t.LOCK.UPDATE });
      const have = await ClinicPhoto.count({ where: { clinicId: c.id }, transaction: t });
      if (have + files.length > MAX_CLINIC_PHOTOS) {
        throw new HttpError(400, `Eng ko'pi bilan ${MAX_CLINIC_PHOTOS} ta rasm (hozir ${have} ta bor)`);
      }
      // Yangi rasmlar oxiriga qo'shiladi, yuklangan tartibi saqlanadi.
      const last = (await ClinicPhoto.max("position", { where: { clinicId: c.id }, transaction: t })) || 0;
      await ClinicPhoto.bulkCreate(
        files.map((f, i) => ({ clinicId: c.id, url: `/uploads/${f.filename}`, position: last + 1 + i })),
        { transaction: t },
      );
      await syncCoverPhoto(c, t);
    });
  } catch (e) {
    discard();
    throw e;
  }
  const full = await Clinic.findOne({ where: { ownerId: req.user.id }, include: CLINIC_INCLUDE, order: CLINIC_ORDER });
  res.status(201).json(clinicJson(full).photos);
});

// Rasmlar tartibini saqlash: ids — klinikaning barcha rasmlari id si, yangi tartibda. Birinchisi "asosiy".
app.put("/api/clinic/me/photos/order", auth, requireRole("clinic"), async (req, res) => {
  const c = await myClinic(req.user);
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map((x) => parseInt(x)) : [];
  await sequelize.transaction(async (t) => {
    const photos = await ClinicPhoto.findAll({ where: { clinicId: c.id }, transaction: t, lock: t.LOCK.UPDATE });
    const have = new Set(photos.map((p) => p.id));
    if (ids.length !== photos.length || new Set(ids).size !== ids.length || !ids.every((id) => have.has(id))) {
      throw new HttpError(400, "Rasmlar ro'yxati eskirgan. Sahifani yangilab qayta urinib ko'ring");
    }
    for (let i = 0; i < ids.length; i++) {
      await ClinicPhoto.update({ position: i + 1 }, { where: { id: ids[i], clinicId: c.id }, transaction: t });
    }
    await syncCoverPhoto(c, t);
  });
  const full = await Clinic.findOne({ where: { ownerId: req.user.id }, include: CLINIC_INCLUDE, order: CLINIC_ORDER });
  res.json(clinicJson(full).photos);
});

app.delete("/api/clinic/me/photos/:id", auth, requireRole("clinic"), async (req, res) => {
  const c = await myClinic(req.user);
  const photo = await ClinicPhoto.findOne({ where: { id: req.params.id, clinicId: c.id } });
  if (!photo) throw new HttpError(404, "Rasm topilmadi");
  await sequelize.transaction(async (t) => {
    await photo.destroy({ transaction: t });
    await syncCoverPhoto(c, t);
  });
  removeUpload(photo.url);
  res.json({ ok: true });
});

// Klinikaga kelgan murojaatlar: so'nggi 30 kun, yangilari birinchi.
app.get("/api/clinic/requests", auth, requireRole("clinic"), async (req, res) => {
  const c = await Clinic.findOne({ where: { ownerId: req.user.id } });
  if (!c) return res.json([]);
  const since = new Date(Date.now() - 30 * 86400000);
  const visits = await Visit.findAll({
    where: { clinicId: c.id, status: { [Op.in]: ["en_route", "done"] }, createdAt: { [Op.gte]: since } },
    include: [{ model: User }],
    order: [["id", "DESC"]],
  });
  const userIds = [...new Set(visits.map((v) => v.userId).filter(Boolean))];
  const kids = userIds.length ? await Child.findAll({ where: { userId: { [Op.in]: userIds } } }) : [];
  res.json(visits.map((v) => ({
    id: v.id, handled: v.status === "done", createdAt: v.createdAt,
    name: v.User?.name || v.User?.phone || "",
    phone: v.User?.phone || "",
    children: kids.filter((k) => k.userId === v.userId).map((k) => ({
      name: k.name, birthDate: k.birthDate, allergies: k.allergies, medicalNotes: k.medicalNotes,
    })),
  })));
});

// ---------- klinika: o'z mutaxassislarini (hamshiralarini) qo'shish ----------

function cleanPhone(v) {
  const phone = String(v || "").replace(/[\s\-()]/g, "");
  const full = phone.startsWith("+") ? phone : `+${phone}`;
  if (!/^\+998\d{9}$/.test(full)) throw new HttpError(400, "Telefon raqam +998 bilan boshlanib, 9 ta raqamdan iborat bo'lsin");
  return full;
}

app.get("/api/clinic/consultants", auth, requireRole("clinic"), async (req, res) => {
  const clinic = await Clinic.findOne({ where: { ownerId: req.user.id } });
  if (!clinic) return res.json([]);
  const rows = await ClinicNurse.findAll({ where: { clinicId: clinic.id }, order: [["id", "ASC"]] });
  const users = rows.length ? await User.findAll({ where: { phone: { [Op.in]: rows.map((r) => r.phone) } } }) : [];
  const profiles = users.length ? await DoctorProfile.findAll({ where: { clinicId: clinic.id, userId: { [Op.in]: users.map((u) => u.id) } } }) : [];
  res.json(rows.map((r) => {
    const u = users.find((x) => x.phone === r.phone);
    const p = u && profiles.find((x) => x.userId === u.id);
    return {
      id: r.id, phone: r.phone, name: r.name || u?.name || "", field: r.field || "",
      // canManage: parolni shu klinika bergan (yoki hamshirada parol hali yo'q), demak ko'rish va o'zgartirish mumkin
      canManage: r.createdAccount || (!!u && !u.passwordHash),
      listing: p ? { field: p.field, price: p.price } : null,
    };
  }));
});

// Hamshirani yaratadi: ism, telefon va parol. Hamshira ilovaga shu telefon va parol bilan kiradi.
// Raqam ilovada allaqachon bor bo'lsa (boshqa klinika yaratgan), hamshira faqat shu klinikaga bog'lanadi, paroli o'zgarmaydi.
app.post("/api/clinic/consultants", auth, requireRole("clinic"), async (req, res) => {
  const clinic = await myClinic(req.user);
  const phone = cleanPhone(req.body.phone);
  const name = String(req.body.name || "").trim().slice(0, 120);
  if (!name) throw new HttpError(400, "Ism familiyani yozing");
  const field = String(req.body.field || "").trim().slice(0, 80);
  if (!field) throw new HttpError(400, "Yo'nalishini yozing");
  const existing = await User.findOne({ where: { phone } });
  if (existing && existing.role !== "nurse") {
    throw new HttpError(409, `Bu raqam ${ROLE_LABEL[existing.role]} sifatida ro'yxatdan o'tgan. Boshqa raqam kiriting`);
  }
  if (await ClinicNurse.findOne({ where: { clinicId: clinic.id, phone } })) {
    throw new HttpError(409, "Bu raqam ro'yxatingizda allaqachon bor");
  }

  let createdAccount = false;
  if (!existing || !existing.passwordHash) {
    const password = validPassword(req.body.password);
    const fields = { passwordHash: await hashPassword(password), passwordEnc: encryptSecret(password), name };
    if (existing) await existing.update(fields);
    else await User.create({ phone, role: "nurse", ...fields });
    createdAccount = true;
  }
  const row = await ClinicNurse.create({ clinicId: clinic.id, phone, name, field, createdAccount });
  res.status(201).json({ id: row.id, linkedExisting: !createdAccount });
});

async function myNurseRow(user, id) {
  const clinic = await myClinic(user);
  const row = await ClinicNurse.findOne({ where: { id: parseInt(id) || 0, clinicId: clinic.id } });
  if (!row) throw new HttpError(404, "Mutaxassis topilmadi");
  const u = await User.findOne({ where: { phone: row.phone, role: "nurse" } });
  return { clinic, row, user: u };
}

// Mutaxassis ma'lumotlari. Parolni faqat akkauntni yaratgan klinika ko'radi (canManage).
app.get("/api/clinic/consultants/:id/credentials", auth, requireRole("clinic"), async (req, res) => {
  const { row, user } = await myNurseRow(req.user, req.params.id);
  const canManage = !!user && (row.createdAccount || !user.passwordHash);
  res.setHeader("Cache-Control", "no-store");
  res.json({
    phone: row.phone, field: row.field || "", canManage,
    password: canManage && user.passwordEnc ? decryptSecret(user.passwordEnc) : null,
  });
});

// Yo'nalishni har qanday klinika o'z ro'yxatidagi hamshira uchun o'zgartira oladi; ism va parolni faqat akkauntni yaratgan klinika.
app.put("/api/clinic/consultants/:id", auth, requireRole("clinic"), async (req, res) => {
  const { row, user } = await myNurseRow(req.user, req.params.id);
  const canManage = !!user && (row.createdAccount || !user.passwordHash);
  const userPatch = {};
  const rowPatch = {};

  if (req.body.field != null) {
    const field = String(req.body.field).trim().slice(0, 80);
    if (!field) throw new HttpError(400, "Yo'nalishini yozing");
    rowPatch.field = field;
  }
  const wantsName = req.body.name != null;
  const wantsPassword = !!req.body.password;
  if ((wantsName || wantsPassword) && !canManage) {
    throw new HttpError(403, "Bu mutaxassisning ism va parolini faqat uni yaratgan klinika o'zgartira oladi");
  }
  if (wantsName) {
    const name = String(req.body.name).trim().slice(0, 120);
    if (!name) throw new HttpError(400, "Ism familiyani yozing");
    userPatch.name = name;
    rowPatch.name = name;
  }
  if (wantsPassword) {
    const password = validPassword(req.body.password);
    userPatch.passwordHash = await hashPassword(password);
    userPatch.passwordEnc = encryptSecret(password);
  }
  await sequelize.transaction(async (t) => {
    if (Object.keys(userPatch).length) await user.update(userPatch, { transaction: t });
    if (Object.keys(userPatch).length) rowPatch.createdAccount = true;
    if (Object.keys(rowPatch).length) await row.update(rowPatch, { transaction: t });
  });
  res.json({ ok: true });
});

app.delete("/api/clinic/consultants/:id", auth, requireRole("clinic"), async (req, res) => {
  const { clinic, row, user } = await myNurseRow(req.user, req.params.id);
  await sequelize.transaction(async (t) => {
    // Klinikadan chiqarilgan hamshiraning shu klinika nomidan e'loni ham olib tashlanadi.
    if (user) await DoctorProfile.destroy({ where: { userId: user.id, clinicId: clinic.id }, transaction: t });
    await row.destroy({ transaction: t });
  });
  res.json({ ok: true });
});

// Murojaatni "ko'rildi" deb belgilash yoki yana "yangi" ga qaytarish.
app.put("/api/clinic/requests/:id", auth, requireRole("clinic"), async (req, res) => {
  const c = await myClinic(req.user);
  const v = await Visit.findOne({ where: { id: req.params.id, clinicId: c.id } });
  if (!v) throw new HttpError(404, "Murojaat topilmadi");
  await v.update({ status: req.body.handled ? "done" : "en_route" });
  res.json({ id: v.id, handled: v.status === "done" });
});

// ---------- suhbatlar ----------

// AI suhbatini olish (yo'q bo'lsa yaratadi).
app.get("/api/chat/ai", auth, requireRole("user"), async (req, res) => {
  const conv = await findOrCreateConversation("ai", req.user.id, null);
  if ((await Message.count({ where: { conversationId: conv.id } })) === 0) {
    await Message.create({
      conversationId: conv.id, senderId: null, kind: "text",
      text: "Assalomu alaykum! 👋 Men Motherly yordamchisiman. Bolangiz necha yoshda va sizni nima bezovta qilyapti?",
    });
  }
  res.json({ conversationId: conv.id });
});

// ---------- mutaxassisning shaxsiy profili ----------

const nurseProfileJson = (u, p) => ({
  name: u.name || "", phone: u.phone || "",
  specialty: p?.specialty || "", experience: p?.experience ?? null,
  education: p?.education || "", languages: p?.languages || "", about: p?.about || "",
  skills: p?.skills || "", photoUrl: p?.photoUrl || null,
});

app.get("/api/nurse/profile", auth, requireRole("nurse"), async (req, res) => {
  const json = nurseProfileJson(req.user, await NurseProfile.findOne({ where: { userId: req.user.id } }));
  // Profil hali to'ldirilmagan bo'lsa, klinika yozgan yo'nalish taklif sifatida oldindan qo'yiladi.
  if (!json.specialty && req.user.phone) {
    const row = await ClinicNurse.findOne({ where: { phone: req.user.phone, field: { [Op.ne]: null } }, order: [["id", "ASC"]] });
    json.specialty = row?.field || "";
  }
  res.json(json);
});

app.put("/api/nurse/profile", auth, requireRole("nurse"), async (req, res) => {
  const b = req.body;
  const name = String(b.name || "").trim().slice(0, 120);
  if (!name) throw new HttpError(400, "Ism familiyani yozing");
  const specialty = String(b.specialty || "").trim().slice(0, 100);
  if (!specialty) throw new HttpError(400, "Mutaxassisligini yozing");
  let experience = null;
  if (b.experience !== "" && b.experience != null) {
    experience = Number(b.experience);
    if (!(Number.isInteger(experience) && experience >= 0 && experience <= 60)) throw new HttpError(400, "Tajriba 0–60 yil oralig'ida bo'lsin");
  }
  const data = {
    specialty, experience,
    education: String(b.education || "").trim().slice(0, 1000),
    languages: String(b.languages || "").trim().slice(0, 200),
    about: String(b.about || "").trim().slice(0, 2000),
    skills: String(b.skills || "").trim().slice(0, 2000),
  };
  await sequelize.transaction(async (t) => {
    await req.user.update({ name }, { transaction: t });
    const existing = await NurseProfile.findOne({ where: { userId: req.user.id }, transaction: t });
    if (existing) await existing.update(data, { transaction: t });
    else await NurseProfile.create({ ...data, userId: req.user.id }, { transaction: t });
  });
  res.json(nurseProfileJson(req.user, await NurseProfile.findOne({ where: { userId: req.user.id } })));
});

// Profil rasmi (bitta): yangisi eskisini almashtiradi.
app.put("/api/nurse/photo", auth, requireRole("nurse"), uploadImage.single("file"), async (req, res) => {
  if (!req.file) throw new HttpError(400, "Rasm tanlang");
  const url = `/uploads/${req.file.filename}`;
  const existing = await NurseProfile.findOne({ where: { userId: req.user.id } });
  const old = existing?.photoUrl;
  if (existing) await existing.update({ photoUrl: url });
  else await NurseProfile.create({ userId: req.user.id, photoUrl: url });
  if (old) removeUpload(old);
  res.json({ photoUrl: url });
});

app.delete("/api/nurse/photo", auth, requireRole("nurse"), async (req, res) => {
  const existing = await NurseProfile.findOne({ where: { userId: req.user.id } });
  if (existing?.photoUrl) {
    const old = existing.photoUrl;
    await existing.update({ photoUrl: null });
    removeUpload(old);
  }
  res.json({ ok: true });
});

// Klinika o'z mutaxassisining profilini ko'radi (o'zgartira olmaydi: mutaxassis o'zi to'ldiradi).
app.get("/api/clinic/consultants/:id/profile", auth, requireRole("clinic"), async (req, res) => {
  const { row, user } = await myNurseRow(req.user, req.params.id);
  const p = user ? await NurseProfile.findOne({ where: { userId: user.id } }) : null;
  const json = nurseProfileJson({ name: user?.name || row.name || "", phone: row.phone }, p);
  res.json({ ...json, phone: row.phone, field: row.field || "", registered: !!user });
});

// Chatdagi mutaxassis haqida ma'lumot (faqat ona ko'radi). Telefon raqami ko'rsatilmaydi: to'lovni chetlab o'tishga yo'l qo'ymaslik uchun.
app.get("/api/conversations/:id/peer", auth, requireRole("user"), async (req, res) => {
  const conv = await getConversationFor(req.user, req.params.id);
  if (conv.kind !== "nurse" || conv.userId !== req.user.id) throw new HttpError(404, "Mutaxassis topilmadi");
  const nurse = await User.findByPk(conv.peerId);
  if (!nurse) throw new HttpError(404, "Mutaxassis topilmadi");
  const profile = await NurseProfile.findOne({ where: { userId: nurse.id } });
  const listings = await DoctorProfile.findAll({ where: { userId: nurse.id, clinicId: { [Op.ne]: null } }, include: [{ model: Clinic }], order: [["id", "ASC"]] });
  // Klinikaga bog'lanmagan eski e'lon ham ma'lumot manbai bo'la oladi (mutaxassislik, tajriba, tavsif).
  const first = listings[0] || (await DoctorProfile.findOne({ where: { userId: nurse.id }, order: [["id", "ASC"]] }));
  res.json({
    id: nurse.id,
    photoUrl: profile?.photoUrl || null, skills: profile?.skills || "",
    name: nurse.name || "",
    specialty: profile?.specialty || first?.field || "",
    experience: profile?.experience ?? first?.experience ?? null,
    education: profile?.education || "",
    languages: profile?.languages || "",
    about: profile?.about || first?.about || "",
    clinics: listings.filter((l) => l.Clinic).map((l) => ({
      id: l.Clinic.id, name: l.Clinic.name, address: l.Clinic.address || "", photoUrl: l.Clinic.photoUrl || null,
      field: l.field, price: l.price,
    })),
  });
});

// Ona uchun: mening mutaxassislarim. Hamshira uchun: mening bemorlarim.
app.get("/api/conversations", auth, async (req, res) => {
    const where = { kind: "nurse" };
  where[Op.or] = [{ userId: req.user.id }, { peerId: req.user.id }];
  const convs = await Conversation.findAll({
    where,
    include: [{ model: User, as: "owner" }, { model: User, as: "peer" }],
  });
  const out = [];
  for (const c of convs) {
    const last = await Message.findOne({ where: { conversationId: c.id }, order: [["id", "DESC"]] });
    const other = c.userId === req.user.id ? c.peer : c.owner;
    let subtitle = null;
    if (c.userId === req.user.id) {
      subtitle =
        (await NurseProfile.findOne({ where: { userId: c.peerId } }))?.specialty ||
        (await DoctorProfile.findOne({ where: { userId: c.peerId } }))?.field ||
        null;
    }
    out.push({
      id: c.id, kind: c.kind, peerRole: other?.role || null, peerStatus: presence(other),
      unread: await Message.count({ where: { conversationId: c.id, senderId: { [Op.ne]: req.user.id }, readAt: null } }),
      title: other?.name || other?.phone || "Foydalanuvchi",
      subtitle,
      lastMessage: last ? (last.kind === "text" ? last.text : `📎 ${last.text}`) : "",
      lastAt: last?.createdAt || c.createdAt,
    });
  }
  out.sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
  res.json(out);
});

app.get("/api/conversations/:id/messages", auth, async (req, res) => {
  const conv = await getConversationFor(req.user, req.params.id);
  const after = parseInt(req.query.after) || 0;
  const msgs = await Message.findAll({
    where: { conversationId: conv.id, id: { [Op.gt]: after } },
    order: [["id", "ASC"]],
  });
  // Boshqa tomon yozgan va hali o'qilmagan xabarlar endi o'qilgan.
  const unread = msgs.filter((m) => m.senderId !== req.user.id && !m.readAt).map((m) => m.id);
  if (unread.length) await Message.update({ readAt: new Date() }, { where: { id: { [Op.in]: unread } } });
  res.json(msgs.map((m) => messageJson(m, req.user)));
});

// Suhbat holati (chat ochiq turganda har 3 soniyada): sherik onlaynmi va mening qaysi xabarlarimgacha o'qigan.
app.get("/api/conversations/:id/status", auth, async (req, res) => {
  const conv = await getConversationFor(req.user, req.params.id);
  const peerId = conv.userId === req.user.id ? conv.peerId : conv.userId;
  const peer = peerId ? await User.findByPk(peerId, { attributes: ["id", "lastSeenAt"] }) : null;
  const lastRead = await Message.max("id", { where: { conversationId: conv.id, senderId: req.user.id, readAt: { [Op.ne]: null } } });
  res.json({ peerStatus: peer ? presence(peer) : "offline", peerReadUpTo: lastRead || 0 });
});

app.post("/api/conversations/:id/messages", auth, async (req, res) => {
  const conv = await getConversationFor(req.user, req.params.id);
  const text = String(req.body.text || "").trim().slice(0, 4000);
  if (!text) throw new HttpError(400, "Xabar bo'sh");
  if (conv.kind === "ai") checkAiLimit(req.user.id);
  const msg = await Message.create({ conversationId: conv.id, senderId: req.user.id, kind: "text", text });
  if (conv.kind === "ai") {
    // Gemini oxirgi xabarlarni kontekst sifatida oladi. Javob bermasa eski oddiy javob ishlatiladi.
    const recent = await Message.findAll({ where: { conversationId: conv.id, kind: "text" }, order: [["id", "DESC"]], limit: 12 });
    const history = recent.reverse().map((m) => ({ role: m.senderId === null ? "model" : "user", text: m.text.slice(0, 1500) }));
    const kids = await Child.findAll({ where: { userId: req.user.id }, order: [["id", "ASC"]], limit: 6 });
    const reply = (await askAssistant(history, kids.map((k) => describeChild(k)))) ?? fakeAiReply(text);
    await Message.create({ conversationId: conv.id, senderId: null, kind: "text", text: reply });
  }
  res.status(201).json(messageJson(msg, req.user));
});

// AI chat pulli xizmat: bitta foydalanuvchi soatiga ko'pi bilan 40 ta savol (kvotani suiiste'mol qilishdan himoya).
const AI_LIMIT_PER_HOUR = 40;
const aiCalls = new Map();
function checkAiLimit(userId) {
  const now = Date.now();
  const recent = (aiCalls.get(userId) || []).filter((t) => now - t < 3_600_000);
  if (recent.length >= AI_LIMIT_PER_HOUR) {
    throw new HttpError(429, "Siz bir soat ichida juda ko'p savol berdingiz. Birozdan keyin davom eting.");
  }
  recent.push(now);
  aiCalls.set(userId, recent);
}

app.post("/api/conversations/:id/attachments", auth, upload.single("file"), async (req, res) => {
  const conv = await getConversationFor(req.user, req.params.id);
  if (!req.file) throw new HttpError(400, "Fayl kerak");
  const isImage = /^image\//.test(req.file.mimetype);
  const msg = await Message.create({
    conversationId: conv.id, senderId: req.user.id,
    kind: isImage ? "image" : "file",
    text: req.file.originalname,
    fileUrl: `/uploads/${req.file.filename}`,
  });
  if (conv.kind === "ai") {
    await Message.create({
      conversationId: conv.id, senderId: null, kind: "text",
      text: "Faylni oldim, rahmat. Hozircha men faqat matnli savollarga javob bera olaman. Iltimos, savolingizni yozib yuboring. Rasm bo'yicha mutaxassisga ko'rsatmoqchi bo'lsangiz, 'Mutaxassis' bo'limidan tanlang.",
    });
  }
  res.status(201).json(messageJson(msg, req.user));
});

// ---------- ona profili va bolalar ----------

function parseDate(v, label, { allowFuture }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v || ""))) throw new HttpError(400, `${label} noto'g'ri`);
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new HttpError(400, `${label} noto'g'ri`);
  if (!allowFuture && d > new Date()) throw new HttpError(400, `${label} kelajakda bo'lishi mumkin emas`);
  return v;
}

function cleanChild(b) {
  const name = String(b?.name || "").trim();
  if (!name) throw new HttpError(400, "Bola ismi kerak");
  const num = (v, label, min, max) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    if (!(n >= min && n <= max)) throw new HttpError(400, `${label} ${min}–${max} oralig'ida bo'lishi kerak`);
    return n;
  };
  const vacc = Array.isArray(b.vaccinations) ? b.vaccinations.map(String).slice(0, 40) : [];
  return {
    name,
    birthDate: parseDate(b.birthDate, "Tug'ilgan sana", { allowFuture: false }),
    gender: ["male", "female"].includes(b.gender) ? b.gender : null,
    weightKg: num(b.weightKg, "Vazn (kg)", 0.5, 200),
    heightCm: num(b.heightCm, "Bo'y (sm)", 20, 220),
    vaccinations: vacc,
    allergies: String(b.allergies || "").trim(),
    medicalNotes: String(b.medicalNotes || "").trim(),
  };
}

const childJson = (c) => ({
  id: c.id, name: c.name, birthDate: c.birthDate, gender: c.gender,
  weightKg: c.weightKg, heightCm: c.heightCm, vaccinations: c.vaccinations,
  allergies: c.allergies, medicalNotes: c.medicalNotes,
});

app.get("/api/mother", auth, requireRole("user"), async (req, res) => {
  const children = await Child.findAll({ where: { userId: req.user.id }, order: [["id", "ASC"]] });
  res.json({ children: children.map(childJson) });
});

app.post("/api/children", auth, requireRole("user"), async (req, res) => {
  const c = await Child.create({ ...cleanChild(req.body), userId: req.user.id });
  res.status(201).json(childJson(c));
});

app.put("/api/children/:id", auth, requireRole("user"), async (req, res) => {
  const c = await Child.findOne({ where: { id: req.params.id, userId: req.user.id } });
  if (!c) throw new HttpError(404, "Bola topilmadi");
  await c.update(cleanChild(req.body));
  res.json(childJson(c));
});

app.delete("/api/children/:id", auth, requireRole("user"), async (req, res) => {
  const n = await Child.destroy({ where: { id: req.params.id, userId: req.user.id } });
  if (!n) throw new HttpError(404, "Bola topilmadi");
  res.json({ ok: true });
});

// ---------- video darslar va sevimlilar ----------

const videoJson = (v, favIds, { locked = false, authors } = {}) => ({
  authorId: v.authorId || null, authorName: (v.authorId && authors?.get(v.authorId)) || null,
  id: v.id, title: v.title, description: v.description, category: v.category,
  durationMin: v.durationMin, durationSec: v.durationSec || v.durationMin * 60,
  // Sotib olinmagan pullik darsning havolasi yuborilmaydi.
  videoUrl: locked ? "" : v.videoUrl, locked, favorite: favIds.has(v.id),
});
const favoriteIds = async (userId) => new Set((await Favorite.findAll({ where: { userId } })).map((f) => f.videoId));

/** Mutaxassis-mualliflar ismlari: userId -> name. */
async function authorNames(videos) {
  const ids = [...new Set(videos.map((v) => v.authorId).filter(Boolean))];
  if (!ids.length) return new Map();
  return new Map((await User.findAll({ where: { id: { [Op.in]: ids } }, attributes: ["id", "name"] })).map((u) => [u.id, u.name || ""]));
}

/** Foydalanuvchi sotib olgan yakka videolar va pleylistlar. */
async function purchasedSets(userId) {
  const rows = await Purchase.findAll({ where: { userId } });
  return { videos: new Set(rows.map((r) => r.videoId).filter(Boolean)), playlists: new Set(rows.map((r) => r.playlistId).filter(Boolean)) };
}

/** YouTube muqovasi (rasm) manzili; boshqa manbalarda null. Video havolasi o'zi yuborilmaydi. */
const thumbOf = (v) => {
  const m = String(v?.videoUrl || "").match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/))([\w-]{11})/);
  return m ? `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg` : null;
};

// "Darslar": bepul yakka darslar. Sevimlilar: pleylist ichidagi yoki sotib olingan sevimli darslar ham.
app.get("/api/videos", auth, async (req, res) => {
  const favIds = await favoriteIds(req.user.id);
  const [videos, bought] = await Promise.all([
    Video.findAll({ where: { [Op.or]: [{ playlistId: null, price: 0 }, { id: { [Op.in]: [...favIds] } }] }, order: [["id", "ASC"]] }),
    purchasedSets(req.user.id),
  ]);
  const authors = await authorNames(videos);
  const plPrice = new Map((await Playlist.findAll({ attributes: ["id", "price"] })).map((p) => [p.id, p.price]));
  res.json(
    videos
      .filter((v) => {
        const paid = v.playlistId ? plPrice.get(v.playlistId) > 0 && !bought.playlists.has(v.playlistId) : v.price > 0 && !bought.videos.has(v.id);
        return !paid; // sevimlilar ro'yxatiga sotib olinmagan pullik dars tushmaydi
      })
      .map((v) => ({ ...videoJson(v, favIds, { authors }), playlistId: v.playlistId })),
  );
});

app.get("/api/playlists", auth, async (_req, res) => {
  res.json((await allPlaylists()).filter((p) => p.count > 0 && !p.price).map(({ price, ...p }) => p));
});

app.get("/api/playlists/:id", auth, async (req, res) => {
  const p = await Playlist.findByPk(req.params.id);
  if (!p) throw new HttpError(404, "Pleylist topilmadi");
  const bought = await purchasedSets(req.user.id);
  const locked = p.price > 0 && !bought.playlists.has(p.id);
  const [vs, favIds] = await Promise.all([Video.findAll({ where: { playlistId: p.id }, order: inOrder }), favoriteIds(req.user.id)]);
  res.json({ ...playlistJson(p, vs), cover: undefined, price: p.price, locked, videos: vs.map((v) => videoJson(v, favIds, { locked })) });
});

// ---------- pullik darslar ----------

/** Pullik ro'yxat: pullik pleylistlar (kurs) va pullik yakka darslar. */
app.get("/api/paid", auth, async (req, res) => {
  const bought = await purchasedSets(req.user.id);
  const vs = await Video.findAll({ where: { playlistId: { [Op.ne]: null } }, order: inOrder });
  const items = [];
  for (const p of await Playlist.findAll({ where: { price: { [Op.gt]: 0 } }, order: [["id", "DESC"]] })) {
    const inside = vs.filter((v) => v.playlistId === p.id);
    if (!inside.length) continue;
    items.push({ type: "playlist", id: p.id, title: p.title, description: p.description || "", price: p.price, count: inside.length, durationSec: totalSec(inside), thumb: thumbOf(inside[0]), purchased: bought.playlists.has(p.id) });
  }
  const singles = await Video.findAll({ where: { playlistId: null, price: { [Op.gt]: 0 } }, order: [["id", "DESC"]] });
  const authors = await authorNames(singles);
  for (const v of singles) {
    items.push({ authorId: v.authorId || null, authorName: authors.get(v.authorId) || null, type: "video", id: v.id, title: v.title, description: v.description || "", price: v.price, count: 1, durationSec: v.durationSec || v.durationMin * 60, thumb: thumbOf(v), purchased: bought.videos.has(v.id) });
  }
  res.json(items);
});

async function paidTarget(type, id) {
  if (type === "playlist") {
    const p = await Playlist.findByPk(parseInt(id) || 0);
    if (!p || !(p.price > 0)) throw new HttpError(404, "Kurs topilmadi");
    return { kind: "playlist", row: p };
  }
  if (type === "video") {
    const v = await Video.findByPk(parseInt(id) || 0);
    if (!v || v.playlistId || !(v.price > 0)) throw new HttpError(404, "Dars topilmadi");
    return { kind: "video", row: v };
  }
  throw new HttpError(404, "Topilmadi");
}

// Bitta pullik element: sotib olinmagan bo'lsa darslar nomlari ko'rinadi, video havolalari yo'q.
app.get("/api/paid/:type/:id", auth, async (req, res) => {
  const { kind, row } = await paidTarget(req.params.type, req.params.id);
  const [bought, favIds] = await Promise.all([purchasedSets(req.user.id), favoriteIds(req.user.id)]);
  const purchased = kind === "playlist" ? bought.playlists.has(row.id) : bought.videos.has(row.id);
  const list = kind === "playlist" ? await Video.findAll({ where: { playlistId: row.id }, order: inOrder }) : [row];
  const authors = await authorNames(list);
  res.json({
    type: kind, id: row.id, title: row.title, description: row.description || "", price: row.price, purchased,
    durationSec: totalSec(list), thumb: thumbOf(list[0]),
    authorName: (kind === "video" && authors.get(row.authorId)) || null,
    videos: list.map((v) => videoJson(v, favIds, { locked: !purchased, authors })),
  });
});

// Soxta to'lov (mutaxassis yollashdagi kabi): summa va provayder qabul qilinadi, haqiqiy pul o'tmaydi.
app.post("/api/paid/:type/:id/buy", auth, requireRole("user"), requireRegistered, async (req, res) => {
  const { kind, row } = await paidTarget(req.params.type, req.params.id);
  const provider = req.body.provider;
  const amount = parseInt(req.body.amount);
  if (!["click", "payme"].includes(provider)) throw new HttpError(400, "To'lov turi noto'g'ri");
  if (!(amount >= row.price)) throw new HttpError(400, `Narxi ${row.price} so'm`);
  const where = kind === "playlist" ? { userId: req.user.id, playlistId: row.id } : { userId: req.user.id, videoId: row.id };
  await Purchase.findOrCreate({ where, defaults: { ...where, amount, provider } });
  res.json({ ok: true });
});

app.post("/api/videos/:id/favorite", auth, async (req, res) => {
  if (!(await Video.findByPk(req.params.id))) throw new HttpError(404, "Video topilmadi");
  await Favorite.findOrCreate({ where: { userId: req.user.id, videoId: req.params.id } });
  res.json({ favorite: true });
});

app.delete("/api/videos/:id/favorite", auth, async (req, res) => {
  await Favorite.destroy({ where: { userId: req.user.id, videoId: req.params.id } });
  res.json({ favorite: false });
});

// ---------- super admin: klinikalarni yaratish va login-parol berish ----------

const requireAdmin = [auth, requireRole("admin")];

const adminClinicJson = (c) => ({
  id: c.id,
  name: c.name,
  address: c.address || "",
  phone: c.phone || "",
  username: c.owner?.username || null,
  complete: isClinicComplete(c),
  photoCount: c.photos?.length ?? 0,
  photoUrl: c.photos?.[0]?.url || null,
  createdAt: c.createdAt,
});

function validPassword(v) {
  const p = String(v || "");
  if (!p.trim()) throw new HttpError(400, "Parol bo'sh bo'lmasin");
  if (p.length > 72) throw new HttpError(400, "Parol juda uzun");
  return p;
}

async function freeUsername(raw, exceptUserId = null) {
  const username = cleanUsername(raw);
  if (!USERNAME_RE.test(username)) {
    throw new HttpError(400, "Login 3–32 ta belgi: lotin harflari, raqam, nuqta, chiziq");
  }
  const taken = await User.findOne({ where: { username } });
  if (taken && taken.id !== exceptUserId) throw new HttpError(409, "Bu login band");
  return username;
}

const ADMIN_CLINIC_INCLUDE = [
  { model: User, as: "owner", attributes: ["id", "username"] },
  { model: ClinicPhoto, as: "photos", attributes: ["id", "url"] },
];
const ADMIN_CLINIC_ORDER = [[{ model: ClinicPhoto, as: "photos" }, "position", "ASC"], [{ model: ClinicPhoto, as: "photos" }, "id", "ASC"]];

app.get("/api/admin/clinics", ...requireAdmin, async (_req, res) => {
  const list = await Clinic.findAll({ include: ADMIN_CLINIC_INCLUDE, order: [["id", "DESC"], ...ADMIN_CLINIC_ORDER] });
  res.json(list.map(adminClinicJson));
});

// To'liq ma'lumot (rasmlar, joylashuv, ish vaqti). Xodimlar ataylab kiritilmagan.
app.get("/api/admin/clinics/:id", ...requireAdmin, async (req, res) => {
  const c = await Clinic.findByPk(req.params.id, { include: ADMIN_CLINIC_INCLUDE, order: ADMIN_CLINIC_ORDER });
  if (!c) throw new HttpError(404, "Klinika topilmadi");
  const [counts] = await sequelize.query(
    // Murojaatlar soni (bekor qilinganlardan tashqari).
    // "Bu oy" — Toshkent vaqti bo'yicha kalendar oyi.
    `SELECT count(*) FILTER (WHERE ("createdAt" AT TIME ZONE 'Asia/Tashkent') >= date_trunc('month', NOW() AT TIME ZONE 'Asia/Tashkent'))::int AS month,
            count(*) FILTER (WHERE "createdAt" >= NOW() - INTERVAL '30 days')::int AS last30
     FROM "Visits" WHERE "clinicId" = :id AND status <> 'cancelled'`,
    { replacements: { id: c.id }, type: QueryTypes.SELECT },
  );
  res.json({
    ...adminClinicJson(c),
    about: c.about || "",
    services: c.services || "",
    extraPhones: c.extraPhones || [],
    hours: c.hours || "",
    workHours: c.workHours || null,
    ...(({ openNow, note }) => ({ openNow, hoursNote: note }))(openStatus(c.workHours)),
    lat: c.lat,
    lng: c.lng,
    mapUrl: c.mapUrl || null,
    photos: (c.photos || []).map((p) => ({ id: p.id, url: p.url })),
    requestsThisMonth: counts.month,
    requestsLast30d: counts.last30,
  });
});

// Umumiy statistika. Sanalar Toshkent vaqti bo'yicha.
const TASHKENT_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }); // YYYY-MM-DD

// ---------- video darslar (admin) ----------

const MIN_PRICE = 1000;
const MAX_PRICE = 100_000_000;

/** Admin formasidan narx: bo'sh yoki 0 = bepul, aks holda MIN_PRICE dan MAX_PRICE gacha (so'm). */
function cleanPrice(v) {
  if (v === undefined || v === null || v === "" || Number(v) === 0) return 0;
  const n = Number(v);
  if (!Number.isInteger(n) || n < MIN_PRICE || n > MAX_PRICE) {
    throw new HttpError(400, `Narx ${MIN_PRICE.toLocaleString("en-US").replace(/,/g, " ")} dan ${MAX_PRICE.toLocaleString("en-US").replace(/,/g, " ")} so'mgacha bo'lsin`);
  }
  return n;
}

const adminVideoJson = (v) => ({
  id: v.id, title: v.title, description: v.description || "", category: v.category, playlistId: v.playlistId, position: v.position, price: v.price || 0,
  durationSec: v.durationSec || v.durationMin * 60, videoUrl: v.videoUrl || "", isFile: (v.videoUrl || "").startsWith("/uploads/"), createdAt: v.createdAt,
});

function cleanVideo(b, { needCategory = true } = {}) {
  const title = String(b.title || "").trim().slice(0, 150);
  const category = String(b.category || "").trim().slice(0, 60);
  if (!title) throw new HttpError(400, "Dars nomini yozing");
  if (needCategory && !category) throw new HttpError(400, "Kategoriyani yozing");
  return { title, category, description: String(b.description || "").trim().slice(0, 2000) };
}

const MAX_VIDEO_SEC = 12 * 3600;
const setDuration = (patch, sec) => {
  const n = Math.max(0, Math.min(MAX_VIDEO_SEC, Math.round(Number(sec) || 0)));
  patch.durationSec = n;
  patch.durationMin = Math.ceil(n / 60);
};

/** YouTube sahifasidan davomiylik (soniya). Aniqlanmasa 0: dars baribir saqlanadi. */
async function youtubeSeconds(url) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36", "Accept-Language": "en" },
    }).finally(() => clearTimeout(timer));
    const m = (await res.text()).match(/"lengthSeconds":"(\d+)"/);
    return m ? Number(m[1]) : 0;
  } catch {
    return 0;
  }
}

function checkVideoLink(v) {
  const url = String(v || "").trim();
  if (url && !/^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(url)) throw new HttpError(400, "Faqat YouTube havolasi qabul qilinadi (youtube.com yoki youtu.be)");
  return url;
}

app.get("/api/admin/videos", ...requireAdmin, async (_req, res) => {
  res.json((await Video.findAll({ where: { playlistId: null, authorId: null }, order: [["id", "DESC"]] })).map(adminVideoJson));
});

// Fayl yoki havola bilan yangi dars. `file` maydoni video fayl, `videoUrl` esa tashqi havola (YouTube va h.k.).
app.post("/api/admin/videos", ...requireAdmin, uploadVideo.single("file"), async (req, res) => {
  try {
    const data = cleanVideo(req.body, { needCategory: !req.body.playlistId });
    const link = checkVideoLink(req.body.videoUrl);
    // Pleylist ichidagi video: kategoriya pleylist nomi, tartib oxiriga qo'shiladi.
    let playlist = null;
    if (req.body.playlistId) {
      playlist = await Playlist.findByPk(parseInt(req.body.playlistId) || 0);
      if (!playlist) throw new HttpError(404, "Pleylist topilmadi");
      data.category = playlist.title;
    }
    if (!req.file && !link) throw new HttpError(400, "Video faylini yuklang yoki havola kiriting");
    const patch = { ...data, videoUrl: req.file ? `/uploads/${req.file.filename}` : link, price: 0 };
    if (playlist) {
      patch.playlistId = playlist.id;
      patch.position = ((await Video.max("position", { where: { playlistId: playlist.id } })) || 0) + 1;
    }
    // Fayl bo'lsa davomiylikni brauzer videodan o'qib yuboradi, YouTube havolasida server aniqlaydi.
    setDuration(patch, req.file ? req.body.durationSec : await youtubeSeconds(link));
    const v = await Video.create(patch);
    res.status(201).json(adminVideoJson(v));
  } catch (e) {
    if (req.file) removeUpload(`/uploads/${req.file.filename}`);
    throw e;
  }
});

app.put("/api/admin/videos/:id", ...requireAdmin, uploadVideo.single("file"), async (req, res) => {
  try {
    const v = await Video.findByPk(req.params.id);
    if (!v) throw new HttpError(404, "Dars topilmadi");
    const patch = cleanVideo({ ...v.toJSON(), ...req.body }, { needCategory: !v.playlistId });
    if (v.playlistId) delete patch.category; // pleylist videosining kategoriyasi pleylist nomi
    const old = v.videoUrl;
    if (req.file) {
      patch.videoUrl = `/uploads/${req.file.filename}`;
      setDuration(patch, req.body.durationSec);
    } else if (req.body.videoUrl != null && req.body.videoUrl !== old) {
      patch.videoUrl = checkVideoLink(req.body.videoUrl);
      setDuration(patch, patch.videoUrl ? await youtubeSeconds(patch.videoUrl) : 0);
    }
    await v.update(patch);
    if (patch.videoUrl && patch.videoUrl !== old) removeUpload(old);
    res.json(adminVideoJson(v));
  } catch (e) {
    if (req.file) removeUpload(`/uploads/${req.file.filename}`);
    throw e;
  }
});

app.delete("/api/admin/videos/:id", ...requireAdmin, async (req, res) => {
  const v = await Video.findByPk(req.params.id);
  if (!v) throw new HttpError(404, "Dars topilmadi");
  await sequelize.transaction(async (t) => {
    await Favorite.destroy({ where: { videoId: v.id }, transaction: t });
    await v.destroy({ transaction: t });
  });
  removeUpload(v.videoUrl);
  res.json({ ok: true });
});

// ---------- mutaxassisning o'z videolari ----------

const nurseVideoJson = async (v) => ({ ...adminVideoJson(v), purchases: await Purchase.count({ where: { videoId: v.id } }) });

app.get("/api/nurse/videos", auth, requireRole("nurse"), async (req, res) => {
  const vs = await Video.findAll({ where: { authorId: req.user.id }, order: [["id", "DESC"]] });
  res.json(await Promise.all(vs.map(nurseVideoJson)));
});

app.post("/api/nurse/videos", auth, requireRole("nurse"), uploadVideo.single("file"), async (req, res) => {
  try {
    const data = cleanVideo({ ...req.body, category: req.user.name || "Mutaxassis" });
    const link = checkVideoLink(req.body.videoUrl);
    if (!req.file && !link) throw new HttpError(400, "Video faylini tanlang yoki YouTube havolasini kiriting");
    const patch = { ...data, authorId: req.user.id, price: cleanPrice(req.body.price), videoUrl: req.file ? `/uploads/${req.file.filename}` : link };
    setDuration(patch, req.file ? req.body.durationSec : await youtubeSeconds(link));
    res.status(201).json(await nurseVideoJson(await Video.create(patch)));
  } catch (e) {
    if (req.file) removeUpload(`/uploads/${req.file.filename}`);
    throw e;
  }
});

app.put("/api/nurse/videos/:id", auth, requireRole("nurse"), async (req, res) => {
  const v = await Video.findOne({ where: { id: parseInt(req.params.id) || 0, authorId: req.user.id } });
  if (!v) throw new HttpError(404, "Video topilmadi");
  const patch = cleanVideo({ ...v.toJSON(), ...req.body, category: v.category });
  if (req.body.price !== undefined) patch.price = cleanPrice(req.body.price);
  await v.update(patch);
  res.json(await nurseVideoJson(v));
});

app.delete("/api/nurse/videos/:id", auth, requireRole("nurse"), async (req, res) => {
  const v = await Video.findOne({ where: { id: parseInt(req.params.id) || 0, authorId: req.user.id } });
  if (!v) throw new HttpError(404, "Video topilmadi");
  await sequelize.transaction(async (t) => {
    await Favorite.destroy({ where: { videoId: v.id }, transaction: t });
    await Purchase.destroy({ where: { videoId: v.id }, transaction: t });
    await v.destroy({ transaction: t });
  });
  removeUpload(v.videoUrl);
  res.json({ ok: true });
});

// Mutaxassisning videolari (ona ko'radi): pullik bo'lsa havolasi sotib olinmaguncha yuborilmaydi.
app.get("/api/nurses/:id/videos", auth, async (req, res) => {
  const id = parseInt(req.params.id) || 0;
  const [vs, bought, favIds, authors] = await Promise.all([
    Video.findAll({ where: { authorId: id }, order: [["id", "DESC"]] }), purchasedSets(req.user.id), favoriteIds(req.user.id), authorNames([{ authorId: id }]),
  ]);
  res.json(vs.map((v) => {
    const purchased = v.price > 0 && bought.videos.has(v.id);
    return { ...videoJson(v, favIds, { locked: v.price > 0 && !purchased, authors }), type: "video", price: v.price, thumb: thumbOf(v), purchased };
  }));
});

// ---------- pleylistlar ----------

const totalSec = (videos) => videos.reduce((a, v) => a + (v.durationSec || v.durationMin * 60 || 0), 0);
const playlistJson = (p, videos) => ({
  id: p.id, title: p.title, description: p.description || "", price: p.price || 0, createdAt: p.createdAt,
  count: videos.length, durationSec: totalSec(videos),
  // Muqova: birinchi videoning manbasi (yuklangan fayl yoki YouTube havolasi).
  cover: videos[0] ? { videoUrl: videos[0].videoUrl || "", isFile: (videos[0].videoUrl || "").startsWith("/uploads/") } : null,
});
const inOrder = [["position", "ASC"], ["id", "ASC"]];

async function allPlaylists() {
  const ps = await Playlist.findAll({ order: [["id", "DESC"]] });
  const vs = await Video.findAll({ where: { playlistId: { [Op.ne]: null } }, order: inOrder });
  return ps.map((p) => playlistJson(p, vs.filter((v) => v.playlistId === p.id)));
}

function cleanPlaylist(b) {
  const title = String(b.title || "").trim().slice(0, 150);
  if (!title) throw new HttpError(400, "Pleylist nomini yozing");
  return { title, description: String(b.description || "").trim().slice(0, 2000), price: 0 };
}

app.get("/api/admin/playlists", ...requireAdmin, async (_req, res) => res.json(await allPlaylists()));

app.post("/api/admin/playlists", ...requireAdmin, async (req, res) => {
  const p = await Playlist.create(cleanPlaylist(req.body));
  res.status(201).json(playlistJson(p, []));
});

app.get("/api/admin/playlists/:id", ...requireAdmin, async (req, res) => {
  const p = await Playlist.findByPk(req.params.id);
  if (!p) throw new HttpError(404, "Pleylist topilmadi");
  const vs = await Video.findAll({ where: { playlistId: p.id }, order: inOrder });
  res.json({ ...playlistJson(p, vs), videos: vs.map(adminVideoJson) });
});

app.put("/api/admin/playlists/:id", ...requireAdmin, async (req, res) => {
  const p = await Playlist.findByPk(req.params.id);
  if (!p) throw new HttpError(404, "Pleylist topilmadi");
  const data = cleanPlaylist({ ...p.toJSON(), ...req.body });
  await sequelize.transaction(async (t) => {
    await p.update(data, { transaction: t });
    await Video.update({ category: data.title }, { where: { playlistId: p.id }, transaction: t });
  });
  res.json({ ok: true });
});

// Videolar tartibi: ids — pleylistdagi barcha videolar, yangi tartibda.
app.put("/api/admin/playlists/:id/order", ...requireAdmin, async (req, res) => {
  const p = await Playlist.findByPk(req.params.id);
  if (!p) throw new HttpError(404, "Pleylist topilmadi");
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map((x) => parseInt(x)) : [];
  await sequelize.transaction(async (t) => {
    const vs = await Video.findAll({ where: { playlistId: p.id }, transaction: t, lock: t.LOCK.UPDATE });
    const have = new Set(vs.map((v) => v.id));
    if (ids.length !== vs.length || new Set(ids).size !== ids.length || !ids.every((id) => have.has(id))) {
      throw new HttpError(400, "Ro'yxat eskirgan. Sahifani yangilab qayta urinib ko'ring");
    }
    for (let i = 0; i < ids.length; i++) await Video.update({ position: i + 1 }, { where: { id: ids[i] }, transaction: t });
  });
  res.json({ ok: true });
});

app.delete("/api/admin/playlists/:id", ...requireAdmin, async (req, res) => {
  const p = await Playlist.findByPk(req.params.id);
  if (!p) throw new HttpError(404, "Pleylist topilmadi");
  const vs = await Video.findAll({ where: { playlistId: p.id } });
  await sequelize.transaction(async (t) => {
    await Favorite.destroy({ where: { videoId: { [Op.in]: vs.map((v) => v.id) } }, transaction: t });
    await Video.destroy({ where: { playlistId: p.id }, transaction: t });
    await p.destroy({ transaction: t });
  });
  vs.forEach((v) => removeUpload(v.videoUrl));
  res.json({ ok: true });
});

// Klinika statistikasi: platforma orqali murojaat qilganlar (so'nggi 30 kun, kunma-kun).
app.get("/api/clinic/stats", auth, requireRole("clinic"), async (req, res) => {
  const c = await Clinic.findOne({ where: { ownerId: req.user.id } });
  const rows = c
    ? await sequelize.query(
        `SELECT to_char(("createdAt" AT TIME ZONE 'Asia/Tashkent')::date, 'YYYY-MM-DD') AS day, count(*)::int AS count
         FROM "Visits" WHERE "clinicId" = :id AND status IN ('en_route','done') AND "createdAt" >= NOW() - INTERVAL '31 days' GROUP BY 1`,
        { type: QueryTypes.SELECT, replacements: { id: c.id } })
    : [];
  const byDay = new Map(rows.map((r) => [r.day, r.count]));
  const days = Array.from({ length: 30 }, (_, i) => {
    const day = TASHKENT_DAY.format(new Date(Date.now() - (29 - i) * 86400000));
    return { day, count: byDay.get(day) || 0 };
  });
  const sum = (arr) => arr.reduce((a, d) => a + d.count, 0);
  const [{ total }] = c
    ? await sequelize.query(`SELECT count(*)::int AS total FROM "Visits" WHERE "clinicId" = :id AND status IN ('en_route','done')`,
        { type: QueryTypes.SELECT, replacements: { id: c.id } })
    : [{ total: 0 }];
  res.json({ today: days[29].count, last7d: sum(days.slice(23)), last30d: sum(days), total, byDay: days });
});

app.get("/api/admin/stats", ...requireAdmin, async (_req, res) => {
  const q = (sql) => sequelize.query(sql, { type: QueryTypes.SELECT });
  const [totals] = await q(`
    SELECT
      (SELECT count(*)::int FROM "Clinics") AS clinics,
      (SELECT count(*)::int FROM "Clinics" WHERE lat IS NOT NULL AND address IS NOT NULL AND hours IS NOT NULL) AS "completeClinics",
      (SELECT count(*)::int FROM "Users" WHERE role = 'user' AND phone IS NOT NULL) AS mothers,
      (SELECT count(*)::int FROM "Users" WHERE role = 'user' AND phone IS NOT NULL AND "createdAt" >= NOW() - INTERVAL '30 days') AS "newMothers30d",
      (SELECT count(*)::int FROM "Users" WHERE role = 'user' AND phone IS NULL) AS guests,
      (SELECT count(DISTINCT p."userId")::int FROM "DoctorProfiles" p WHERE p."clinicId" IS NOT NULL AND EXISTS (
         SELECT 1 FROM "ClinicNurses" n JOIN "Users" u ON u."phone" = n."phone" WHERE n."clinicId" = p."clinicId" AND u."id" = p."userId")) AS consultants,
      (SELECT count(*)::int FROM "ClinicNurses") AS "clinicNurses",
      (SELECT count(*)::int FROM "Visits") AS "visitsTotal"
  `);
  const perDay = await q(`
    SELECT to_char(("createdAt" AT TIME ZONE 'Asia/Tashkent')::date, 'YYYY-MM-DD') AS day, count(*)::int AS count
    FROM "Visits" WHERE "createdAt" >= NOW() - INTERVAL '31 days' GROUP BY 1
  `);
  const byDay = new Map(perDay.map((r) => [r.day, r.count]));
  // Oxirgi 30 kun, bo'sh kunlar 0 bilan to'ldiriladi.
  const days = Array.from({ length: 30 }, (_, i) => {
    const day = TASHKENT_DAY.format(new Date(Date.now() - (29 - i) * 86400000));
    return { day, count: byDay.get(day) || 0 };
  });
  const sum = (arr) => arr.reduce((a, d) => a + d.count, 0);
  const topClinics = await q(`
    SELECT c.id, c.name, count(v.id)::int AS visits
    FROM "Clinics" c JOIN "Visits" v ON v."clinicId" = c.id AND v."createdAt" >= NOW() - INTERVAL '30 days'
    GROUP BY c.id ORDER BY visits DESC, c.name LIMIT 5
  `);
  const statuses = await q(`
    SELECT status, count(*)::int AS count FROM "Visits" WHERE "createdAt" >= NOW() - INTERVAL '30 days' GROUP BY status
  `);
  res.json({
    totals,
    visits: { today: days[29].count, last7d: sum(days.slice(23)), last30d: sum(days) },
    visitsByDay: days,
    topClinics,
    visitStatuses: statuses,
  });
});

// Klinika + uning akkauntini yaratadi. Parol faqat shu javobda ko'rsatiladi (bazada xesh saqlanadi).
app.post("/api/admin/clinics", ...requireAdmin, async (req, res) => {
  const name = String(req.body.name || "").trim();
  if (!name) throw new HttpError(400, "Klinika nomi kerak");
  const username = req.body.username ? await freeUsername(req.body.username) : await suggestUsername(name);
  const password = req.body.password ? validPassword(req.body.password) : generatePassword();
  const passwordHash = await hashPassword(password);

  const clinic = await sequelize.transaction(async (t) => {
    const owner = await User.create(
      { role: "clinic", name, username, passwordHash, passwordEnc: encryptSecret(password) },
      { transaction: t },
    );
    return Clinic.create({ name, phone: String(req.body.phone || "").trim() || null, ownerId: owner.id }, { transaction: t });
  });
  const full = await Clinic.findByPk(clinic.id, { include: ADMIN_CLINIC_INCLUDE });
  res.status(201).json({ clinic: adminClinicJson(full), credentials: { username, password } });
});

// Klinikaning hozirgi login va parolini ko'rsatadi. Parol saqlanishidan oldin yaratilgan akkauntlarda password null.
app.get("/api/admin/clinics/:id/credentials", ...requireAdmin, async (req, res) => {
  const clinic = await Clinic.findByPk(req.params.id, { include: ADMIN_CLINIC_INCLUDE });
  if (!clinic) throw new HttpError(404, "Klinika topilmadi");
  const owner = clinic.owner ? await User.findByPk(clinic.owner.id) : null;
  if (!owner?.username) return res.json({ username: null, password: null });
  res.setHeader("Cache-Control", "no-store");
  res.json({ username: owner.username, password: owner.passwordEnc ? decryptSecret(owner.passwordEnc) : null });
});

// Nom, login va (ixtiyoriy) yangi parolni o'zgartiradi. Parol berilsa javobda qaytariladi.
app.put("/api/admin/clinics/:id", ...requireAdmin, async (req, res) => {
  const clinic = await Clinic.findByPk(req.params.id, { include: ADMIN_CLINIC_INCLUDE, order: ADMIN_CLINIC_ORDER });
  if (!clinic) throw new HttpError(404, "Klinika topilmadi");
  const name = String(req.body.name ?? clinic.name).trim();
  if (!name) throw new HttpError(400, "Klinika nomi kerak");

  const owner = clinic.owner ? await User.findByPk(clinic.owner.id) : null;
  const patch = {};
  const wantsUsername = req.body.username != null && cleanUsername(req.body.username) !== (owner?.username || "");
  if (wantsUsername) patch.username = await freeUsername(req.body.username, owner?.id ?? null);
  const password = req.body.password ? validPassword(req.body.password) : null;
  if (password) {
    patch.passwordHash = await hashPassword(password);
    patch.passwordEnc = encryptSecret(password);
  }
  if ((wantsUsername || password) && !owner) {
    throw new HttpError(400, "Klinikada akkaunt yo'q. Avval \"Akkaunt yaratish\" tugmasini bosing");
  }

  await sequelize.transaction(async (t) => {
    await clinic.update({ name }, { transaction: t });
    if (owner) await owner.update({ ...patch, name }, { transaction: t });
  });
  const full = await Clinic.findByPk(clinic.id, { include: ADMIN_CLINIC_INCLUDE, order: ADMIN_CLINIC_ORDER });
  res.json({
    clinic: adminClinicJson(full),
    credentials: password ? { username: full.owner.username, password } : null,
  });
});

// Klinikani va unga bog'liq hamma narsani o'chiradi (qaytarib bo'lmaydi).
app.delete("/api/admin/clinics/:id", ...requireAdmin, async (req, res) => {
  const clinic = await Clinic.findByPk(req.params.id);
  if (!clinic) throw new HttpError(404, "Klinika topilmadi");
  const photos = await ClinicPhoto.findAll({ where: { clinicId: clinic.id } });

  await sequelize.transaction(async (t) => {
    const where = { clinicId: clinic.id };
    // Murojaat yozuvlari klinikasiz qolmasligi uchun ular ham o'chadi.
    await Visit.destroy({ where, transaction: t });
    await ClinicStaff.destroy({ where, transaction: t });
    await ClinicPhoto.destroy({ where, transaction: t });
    await DoctorProfile.destroy({ where, transaction: t });
    await ClinicNurse.destroy({ where, transaction: t });
    const ownerId = clinic.ownerId;
    await clinic.destroy({ transaction: t });
    if (ownerId) await User.destroy({ where: { id: ownerId, role: "clinic" }, transaction: t });
  });
  photos.forEach((p) => removeUpload(p.url));
  res.json({ ok: true });
});

// Yangi parol beradi (klinika parolni unutsa). Eski, egasiz klinikalarga esa birinchi marta akkaunt yaratadi.
app.post("/api/admin/clinics/:id/reset-password", ...requireAdmin, async (req, res) => {
  const clinic = await Clinic.findByPk(req.params.id, { include: ADMIN_CLINIC_INCLUDE });
  if (!clinic) throw new HttpError(404, "Klinika topilmadi");
  const password = req.body.password ? validPassword(req.body.password) : generatePassword();
  const passwordHash = await hashPassword(password);

  let owner = clinic.owner ? await User.findByPk(clinic.owner.id) : null;
  if (owner) {
    const patch = { passwordHash, passwordEnc: encryptSecret(password) };
    if (req.body.username) patch.username = await freeUsername(req.body.username, owner.id);
    else if (!owner.username) patch.username = await suggestUsername(clinic.name);
    await owner.update(patch);
  } else {
    const username = req.body.username ? await freeUsername(req.body.username) : await suggestUsername(clinic.name);
    owner = await User.create({ role: "clinic", name: clinic.name, username, passwordHash, passwordEnc: encryptSecret(password) });
    await clinic.update({ ownerId: owner.id });
  }
  res.json({ credentials: { username: owner.username, password } });
});

// ---------- xatolar ----------

app.use((err, req, res, _next) => {
  if (err.code === "LIMIT_FILE_SIZE") err.status = 400, err.message = req.path.startsWith("/api/admin/videos") ? "Video juda katta (500 MB gacha)" : "Fayl juda katta (5 MB gacha)";
  if (err.code === "LIMIT_UNEXPECTED_FILE") err.status = 400, err.message = `Bir vaqtda ${MAX_CLINIC_PHOTOS} tadan ko'p rasm yuklab bo'lmaydi`;
  if (err.type === "entity.parse.failed") err.status = 400, err.message = "So'rov noto'g'ri yuborildi";
  const status = err.status || 500;
  if (status === 500) console.error(err);
  // Kutilmagan xatoda ichki matn (SQL, fayl yo'li…) foydalanuvchiga yuborilmaydi.
  const message = status >= 500 ? "Hozir xizmat vaqtincha ishlamayapti. Birozdan keyin qayta urinib ko'ring." : err.message;
  res.status(status).json({ status: "error", message, ...(err.reason ? { reason: err.reason } : {}) });
});

async function startServer() {
  try {
    await sequelize.authenticate();
    await sequelize.sync();
    await migrate();
    await seed();
    const admin = await ensureAdmin();
    console.log("Connected to PostgreSQL successfully");
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log("\n=== SUPER ADMIN ===");
      console.log(`  login: ${admin.username}`);
      console.log(`  parol: ${admin.fromEnv ? "(ADMIN_PASSWORD, .env faylda)" : admin.password}`);
      console.log("===================\n");
    });
  } catch (error) {
    console.error("Failed to start:", error.message);
    process.exit(1);
  }
}

startServer();
