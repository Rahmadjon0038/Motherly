const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { promisify } = require("util");
const { User } = require("./models");

const scrypt = promisify(crypto.scrypt);

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

async function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored || "").split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(String(password), Buffer.from(saltHex, "hex"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// O'qish qiyin belgilar (0/O, 1/l/I) chiqarib tashlangan.
const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generatePassword(length = 12) {
  return Array.from(crypto.randomBytes(length), (b) => ALPHABET[b % ALPHABET.length]).join("");
}

const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;
const cleanUsername = (v) => String(v || "").trim().toLowerCase();

// Klinika nomidan login taklif qiladi: "Mehr Bolalar Klinikasi" -> "mehr-bolalar-klinikasi".
async function suggestUsername(name) {
  const base =
    String(name || "")
      .toLowerCase()
      .replace(/[ʻʼ'’`]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "klinika";
  let candidate = base.length >= 3 ? base : `${base}-klinika`;
  for (let i = 2; await User.findOne({ where: { username: candidate } }); i++) candidate = `${base}-${i}`;
  return candidate;
}

// ---------- klinika parolini qayta ko'rish uchun shifrlash ----------
// Klinika parolini admin keyin ham ko'ra olishi kerak (unutib qo'ysa qayta bermaslik uchun), shuning uchun
// xeshdan tashqari AES-256-GCM bilan shifrlangan nusxasi saqlanadi. Kalit: CREDENTIALS_KEY (.env) yoki
// private/credentials.key (birinchi ishga tushishda tasodifiy yaratiladi).
const KEY_FILE = path.join(__dirname, "private", "credentials.key");
let cachedKey = null;

function secretKey() {
  if (cachedKey) return cachedKey;
  if (process.env.CREDENTIALS_KEY) {
    cachedKey = crypto.createHash("sha256").update(process.env.CREDENTIALS_KEY).digest();
    return cachedKey;
  }
  try {
    const hex = fs.readFileSync(KEY_FILE, "utf8").trim();
    if (/^[0-9a-f]{64}$/.test(hex)) return (cachedKey = Buffer.from(hex, "hex"));
  } catch {
    // fayl yo'q — yangi kalit yaratamiz
  }
  const key = crypto.randomBytes(32);
  fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
  fs.writeFileSync(KEY_FILE, key.toString("hex"), { mode: 0o600 });
  return (cachedKey = key);
}

function encryptSecret(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", secretKey(), iv);
  const data = Buffer.concat([cipher.update(String(text), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(".");
}

/** Ochilmasa (kalit almashgan yoki yozuv buzilgan) null qaytaradi. */
function decryptSecret(blob) {
  try {
    const [v, iv, tag, data] = String(blob || "").split(".");
    if (v !== "v1") return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// ---------- super admin ----------

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const CREDENTIALS_FILE = path.join(__dirname, "private", "admin-credentials.json");

// Super adminni tayyorlaydi va login-parolini qaytaradi (server logida ko'rsatish uchun).
// ADMIN_PASSWORD berilsa shu ishlatiladi. Aks holda tasodifiy parol yaratiladi va
// private/admin-credentials.json da saqlanadi, shunda keyingi ishga tushirishda ham o'sha parol qoladi.
async function ensureAdmin() {
  let admin = await User.findOne({ where: { role: "admin" } });
  let password = process.env.ADMIN_PASSWORD;
  let source = ".env";

  if (!password) {
    source = "fayl";
    try {
      const saved = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, "utf8"));
      if (saved.username === ADMIN_USERNAME && saved.password) password = saved.password;
    } catch {
      // fayl yo'q yoki buzilgan — yangi parol yaratamiz
    }
  }
  const generated = !password;
  if (generated) password = generatePassword(14);

  if (!admin) {
    admin = await User.create({
      role: "admin", name: "Super admin", username: ADMIN_USERNAME, passwordHash: await hashPassword(password),
    });
  } else if (admin.username !== ADMIN_USERNAME || !(await verifyPassword(password, admin.passwordHash))) {
    await admin.update({ username: ADMIN_USERNAME, passwordHash: await hashPassword(password) });
  }

  if (source === "fayl" && generated) {
    fs.mkdirSync(path.dirname(CREDENTIALS_FILE), { recursive: true });
    fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify({ username: ADMIN_USERNAME, password }), { mode: 0o600 });
  }
  return { username: ADMIN_USERNAME, password, fromEnv: source === ".env" };
}

module.exports = {
  hashPassword, verifyPassword, generatePassword, cleanUsername, suggestUsername, USERNAME_RE, ensureAdmin,
  encryptSecret, decryptSecret,
};
