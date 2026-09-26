const { Sequelize, DataTypes } = require("sequelize");

const DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://postgres@localhost:5432/qrcode_db";

const sequelize = new Sequelize(DATABASE_URL, { dialect: "postgres", logging: false });

const User = sequelize.define("User", {
  // phone — ona va hamshira uchun (SMS bilan kirish). Admin va klinika login-parol bilan kiradi, ularda phone yo'q.
  phone: { type: DataTypes.STRING, unique: true },
  role: { type: DataTypes.ENUM("user", "nurse", "clinic", "admin"), allowNull: false, defaultValue: "user" },
  name: { type: DataTypes.STRING },
  // Faqat admin va klinika akkauntlari uchun. Yagona indeks migrate.js da yaratiladi.
  username: { type: DataTypes.STRING },
  lastSeenAt: { type: DataTypes.DATE }, // oxirgi faollik: chatda "onlayn" belgisi uchun
  passwordHash: { type: DataTypes.STRING },
  // Faqat klinika akkauntlari: admin qayta ko'ra olishi uchun shifrlangan parol (accounts.js).
  passwordEnc: { type: DataTypes.TEXT },
  // Maslahatchi (nurse) kasbiy hujjati: none | pending | approved | rejected.
  // Hujjat fayli yopiq papkada saqlanadi (ochiq /uploads da emas).
  verificationStatus: { type: DataTypes.STRING, allowNull: false, defaultValue: "none" },
  documentFile: { type: DataTypes.STRING },
  documentName: { type: DataTypes.STRING },
  documentMime: { type: DataTypes.STRING },
  documentUploadedAt: { type: DataTypes.DATE },
  rejectionReason: { type: DataTypes.TEXT },
  verifiedAt: { type: DataTypes.DATE },
  clinicId: { type: DataTypes.INTEGER }, // hujjatni tasdiqlaydigan klinika
});

// Maslahatchi hamshiraning konsultatsiya kartasi (onalar ko'radigan e'lon).
const DoctorProfile = sequelize.define("DoctorProfile", {
  name: { type: DataTypes.STRING, allowNull: false },
  field: { type: DataTypes.STRING, allowNull: false },
  experience: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  about: { type: DataTypes.TEXT, defaultValue: "" },
  price: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 50000 },
  // Qaysi klinika nomidan e'lon qilingan. Hamshira bir nechta klinikada ishlasa, har biri uchun alohida e'lon bo'ladi.
  clinicId: { type: DataTypes.INTEGER },
});

// Klinika o'z hamshirasini telefon raqami bilan qo'shadi. Klinika qo'shgani — u shu yerda ishlashining tasdig'i
// (hujjat yuborish va tasdiqlash yo'q). Hamshira ilovaga shu raqam bilan kirsa, shu klinikani ko'radi.
const ClinicNurse = sequelize.define("ClinicNurse", {
  phone: { type: DataTypes.STRING, allowNull: false },
  name: { type: DataTypes.STRING }, // klinika o'z ro'yxati uchun yozadigan ism
  field: { type: DataTypes.STRING }, // yo'nalishi (masalan "Laktatsiya"); hamshira e'lon joylaganda oldindan to'ldiriladi
  // Hamshira akkauntini shu klinikaning o'zi yaratganmi. Faqat shunday klinika parolni ko'ra va o'zgartira oladi.
  createdAccount: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
}, {
  indexes: [{ unique: true, fields: ["clinicId", "phone"] }],
});

// Mutaxassisning (hamshiraning) o'zi to'ldiradigan shaxsiy profili. Ism va telefon User da turadi.
// Onalar chatda profil ikonkasini bossa shu ma'lumot ko'rinadi (telefon ko'rsatilmaydi).
const NurseProfile = sequelize.define("NurseProfile", {
  specialty: { type: DataTypes.STRING }, // mutaxassisligi
  experience: { type: DataTypes.INTEGER }, // tajriba, yil
  education: { type: DataTypes.TEXT }, // ta'lim (o'qigan joyi, yili)
  languages: { type: DataTypes.STRING }, // tillar
  about: { type: DataTypes.TEXT }, // o'zi haqida
  skills: { type: DataTypes.TEXT }, // qila oladigan ishlari
  photoUrl: { type: DataTypes.STRING }, // profil rasmi
});

const Hire = sequelize.define("Hire", {
  amount: { type: DataTypes.INTEGER, allowNull: false },
  provider: { type: DataTypes.ENUM("click", "payme"), allowNull: false },
  status: { type: DataTypes.STRING, defaultValue: "paid" }, // MVP: soxta to'lov
});

const Clinic = sequelize.define("Clinic", {
  name: { type: DataTypes.STRING, allowNull: false },
  // Admin klinikani faqat nom bilan yaratadi; manzil, joylashuv va ish vaqtini klinikaning o'zi to'ldiradi.
  address: { type: DataTypes.STRING },
  lat: { type: DataTypes.DOUBLE },
  lng: { type: DataTypes.DOUBLE },
  hours: { type: DataTypes.STRING }, // matn ko'rinishi; workHours dan avtomatik yasaladi
  workHours: { type: DataTypes.JSON }, // haftalik jadval, hours.js ga qarang
  phone: { type: DataTypes.STRING }, // asosiy telefon (+998XXXXXXXXX)
  // Qo'shimcha raqamlar: [{ label: "Qabulxona", number: "+998 …" }] — klinika qo'lda yozadi, onalarga ko'rinadi.
  extraPhones: { type: DataTypes.JSON },
  about: { type: DataTypes.TEXT },
  services: { type: DataTypes.TEXT },
  photoUrl: { type: DataTypes.STRING }, // birinchi rasm (eski mobil versiyalar bilan moslik uchun)
  mapUrl: { type: DataTypes.STRING(1000) }, // klinika kiritgan xarita havolasi (lat/lng undan olinadi)
});

// Klinika galereyasi (10 tagacha rasm). Tartib id bo'yicha.
const ClinicPhoto = sequelize.define("ClinicPhoto", {
  url: { type: DataTypes.STRING, allowNull: false },
  position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }, // 1 dan boshlanadi; klinika sudrab o'zgartiradi
});

const ClinicStaff = sequelize.define("ClinicStaff", {
  name: { type: DataTypes.STRING, allowNull: false },
  position: { type: DataTypes.STRING, allowNull: false },
  schedule: { type: DataTypes.STRING, allowNull: false },
  experience: { type: DataTypes.INTEGER }, // tajriba, yil
});

// Klinikadagi navbat yozuvi. userId yo'q bo'lsa — qabulxonada qo'lda qo'shilgan mijoz.
const Visit = sequelize.define("Visit", {
  guestName: { type: DataTypes.STRING },
  guestPhone: { type: DataTypes.STRING },
  // Ona qaysi shifokorga yozilgani. Ism nusxa sifatida saqlanadi: xodim keyin o'chirilsa ham yozuv tushunarli qoladi.
  doctorName: { type: DataTypes.STRING },
  doctorPosition: { type: DataTypes.STRING },
  status: { type: DataTypes.ENUM("en_route", "accepted", "arrived", "in_service", "done", "cancelled"), defaultValue: "en_route" },
});

// kind: ai (ona ↔ AI) yoki nurse (ona ↔ maslahatchi hamshira). peerId — hamshira User id.
const Conversation = sequelize.define("Conversation", {
  kind: { type: DataTypes.ENUM("ai", "nurse"), allowNull: false },
});

const Message = sequelize.define("Message", {
  senderId: { type: DataTypes.INTEGER }, // null = AI
  kind: { type: DataTypes.ENUM("text", "image", "file"), defaultValue: "text" },
  text: { type: DataTypes.TEXT, allowNull: false, defaultValue: "" },
  fileUrl: { type: DataTypes.STRING },
  readAt: { type: DataTypes.DATE }, // qabul qiluvchi o'qigan vaqt
});

const Child = sequelize.define("Child", {
  name: { type: DataTypes.STRING, allowNull: false },
  birthDate: { type: DataTypes.DATEONLY, allowNull: false },
  gender: { type: DataTypes.STRING }, // male | female
  weightKg: { type: DataTypes.DOUBLE },
  heightCm: { type: DataTypes.DOUBLE },
  vaccinations: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  allergies: { type: DataTypes.TEXT, defaultValue: "" },
  medicalNotes: { type: DataTypes.TEXT, defaultValue: "" },
});

const Video = sequelize.define("Video", {
  title: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT, defaultValue: "" },
  category: { type: DataTypes.STRING, allowNull: false },
  durationMin: { type: DataTypes.INTEGER, defaultValue: 0 }, // yuqoriga yaxlitlangan daqiqa (mobil ilova shuni ko'rsatadi)
  durationSec: { type: DataTypes.INTEGER, defaultValue: 0 }, // aniq davomiylik, videodan aniqlanadi
  playlistId: { type: DataTypes.INTEGER }, // bo'sh bo'lsa yakka dars
  authorId: { type: DataTypes.INTEGER }, // videoni yuklagan mutaxassis (User.id); bo'sh bo'lsa platformaniki (admin)
  price: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }, // so'm; 0 = bepul (pleylist ichidagi darslarda pleylist narxi amal qiladi)
  position: { type: DataTypes.INTEGER, defaultValue: 0 }, // pleylist ichidagi tartib (1 dan)
  videoUrl: { type: DataTypes.STRING, defaultValue: "" }, // bo'sh bo'lsa video hali yuklanmagan
});

// Pleylist: tartib bilan o'rganiladigan video darslar to'plami. Videolar faqat pleylist ichida yuklanadi (Video.playlistId).
const Playlist = sequelize.define("Playlist", {
  title: { type: DataTypes.STRING, allowNull: false },
  price: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }, // so'm; 0 = bepul
  description: { type: DataTypes.TEXT, defaultValue: "" },
});

// Pullik darsni (yakka video yoki butun pleylist) sotib olish. Bittasi to'ldiriladi: videoId yoki playlistId.
const Purchase = sequelize.define("Purchase", {
  amount: { type: DataTypes.INTEGER, allowNull: false },
  provider: { type: DataTypes.ENUM("click", "payme"), allowNull: false },
  videoId: { type: DataTypes.INTEGER },
  playlistId: { type: DataTypes.INTEGER },
}, { indexes: [{ unique: true, fields: ["userId", "videoId"] }, { unique: true, fields: ["userId", "playlistId"] }] });
Purchase.belongsTo(User, { foreignKey: "userId" });

const Favorite = sequelize.define("Favorite", {}, {
  indexes: [{ unique: true, fields: ["userId", "videoId"] }],
});

User.hasMany(Child, { foreignKey: "userId" });
Child.belongsTo(User, { foreignKey: "userId" });
Favorite.belongsTo(User, { foreignKey: "userId" });
Favorite.belongsTo(Video, { foreignKey: "videoId" });
Video.hasMany(Favorite, { foreignKey: "videoId" });

User.hasOne(NurseProfile, { foreignKey: "userId" });
NurseProfile.belongsTo(User, { foreignKey: "userId" });
User.hasMany(DoctorProfile, { foreignKey: "userId" });
DoctorProfile.belongsTo(User, { foreignKey: "userId" });
DoctorProfile.belongsTo(Clinic, { foreignKey: "clinicId" });
Clinic.hasMany(ClinicNurse, { foreignKey: "clinicId", as: "nurses" });
ClinicNurse.belongsTo(Clinic, { foreignKey: "clinicId" });
Clinic.belongsTo(User, { foreignKey: "ownerId", as: "owner" });
User.belongsTo(Clinic, { foreignKey: "clinicId", as: "verifierClinic" });

Hire.belongsTo(User, { foreignKey: "userId" });
Hire.belongsTo(DoctorProfile, { foreignKey: "doctorProfileId" });

Clinic.hasMany(ClinicStaff, { foreignKey: "clinicId", as: "staff" });
ClinicStaff.belongsTo(Clinic, { foreignKey: "clinicId" });
Clinic.hasMany(ClinicPhoto, { foreignKey: "clinicId", as: "photos" });
ClinicPhoto.belongsTo(Clinic, { foreignKey: "clinicId" });

Visit.belongsTo(Clinic, { foreignKey: "clinicId" });
Visit.belongsTo(User, { foreignKey: "userId" });

Conversation.belongsTo(User, { foreignKey: "userId", as: "owner" });
Conversation.belongsTo(User, { foreignKey: "peerId", as: "peer" });
Conversation.hasMany(Message, { foreignKey: "conversationId", as: "messages" });
Message.belongsTo(Conversation, { foreignKey: "conversationId" });

module.exports = {
  sequelize, User, DoctorProfile, NurseProfile, Hire, Clinic, ClinicStaff, ClinicPhoto, ClinicNurse, Visit,
  Conversation, Message, Child, Video, Playlist, Purchase, Favorite,
};
