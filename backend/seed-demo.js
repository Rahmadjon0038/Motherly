// Demo ma'lumotlar: platforma haqiqiy ishlayotgandek ko'rinishi uchun (taqdimot va sinov).
//
//   node seed-demo.js          (Docker'da: docker compose exec backend node seed-demo.js)
//
// Nima qo'shadi:
//   - 2 ta yangi klinika (jami 4 ta), har biriga rasm, ish vaqti, xarita joylashuvi, shifokorlar
//   - har klinikaga 2 tadan mutaxassis-shifokor (profil rasmi, tajriba, ta'lim, tasdiqlangan hujjat)
//   - 36 ta ona (mijoz) va ularning bolalari
//   - so'nggi 30 kunlik murojaatlar (klinika statistikasi chiroyli ko'rinishi uchun)
//   - mutaxassislar bilan yozishmalar
//
// Qayta ishga tushirsa ham ikki barobar qo'shmaydi. Mavjud ma'lumotlarga tegmaydi (faqat bo'sh joylarini to'ldiradi).
//
// KIRISH MA'LUMOTLARI (faqat sinov uchun):
//   Yangi klinikalar (veb-panel):  sihat / clinic123   va   bolajon / clinic123
//   Mutaxassis-shifokorlar (ilova): telefon + parol "doctor123"  (telefonlar DOCTORS ro'yxatida)
//
// RASMLAR: Wikimedia Commons (CC BY / CC BY-SA) va randomuser.me (namuna portretlar).
// Ular internetdan yuklab olinib backend/uploads/ ga saqlanadi.

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Op } = require("sequelize");
const {
  sequelize, User, Clinic, ClinicPhoto, ClinicStaff, ClinicNurse, NurseProfile, DoctorProfile, Hire, Visit, Child, Conversation, Message,
} = require("./models");
const { hashPassword, encryptSecret } = require("./accounts");
const { normalizeWorkHours, summarizeWorkHours } = require("./hours");
const migrate = require("./migrate");

const UPLOAD_DIR = path.join(__dirname, "uploads");
const UA = { "User-Agent": "MotherlyDemoSeed/1.0 (student project; demo images)" };
const wiki = (p) => `https://thumb.wikimedia.org/wikipedia/commons/thumb/${p}`;
const person = (g, n) => `https://randomuser.me/api/portraits/${g}/${n}.jpg`;

// ---------- rasmlar ----------

async function download(url, name) {
  const file = `demo-${name}.jpg`;
  const full = path.join(UPLOAD_DIR, file);
  if (!fs.existsSync(full) || fs.statSync(full).size < 1000) {
    const res = await fetch(url, { headers: UA });
    if (!res.ok) throw new Error(`Rasm yuklanmadi (${res.status}): ${url}`);
    fs.writeFileSync(full, Buffer.from(await res.arrayBuffer()));
  }
  return `/uploads/${file}`;
}

// ---------- klinikalar ----------

const week = (weekdays, sat, sun) => [
  ...Array.from({ length: 5 }, (_, i) => ({ day: i + 1, closed: false, open: weekdays[0], close: weekdays[1] })),
  sat ? { day: 6, closed: false, open: sat[0], close: sat[1] } : { day: 6, closed: true },
  sun ? { day: 7, closed: false, open: sun[0], close: sun[1] } : { day: 7, closed: true },
];

const NEW_CLINICS = [
  {
    key: "sihat", username: "sihat", name: "Sihat Ona va Bola Markazi",
    address: "Namangan sh., Uychi ko'chasi, 112-uy", lat: 40.9962, lng: 71.6798,
    phone: "+998912003001",
    extraPhones: [{ label: "Qabulxona", number: "+998 91 200 30 02" }, { label: "Laktatsiya maslahatchisi", number: "+998 91 200 30 03" }],
    about: "Homiladorlik davridan boshlab bola tug'ilgandan keyingi parvarishgacha bir joyda xizmat ko'rsatadigan markaz. Emizish bo'yicha maslahat va bolalar massaji ham bor. Onalar uchun alohida kutish zali.",
    services: "Ginekolog qabuli, homiladorlikni kuzatish, UZI, laktatsiya maslahati, bolalar massaji, pediatr ko'rigi, emlash, tahlillar",
    workHours: week(["09:00", "18:00"], ["09:00", "14:00"], null),
    photos: [
      ["sihat-1", wiki("d/dc/Hong_Kong_Children%27s_Hospital_Block_B_Lobby_201812.jpg/1280px-Hong_Kong_Children%27s_Hospital_Block_B_Lobby_201812.jpg")],
      ["sihat-2", wiki("3/3f/Modern_reception_area_with_sleek_design.jpg/1280px-Modern_reception_area_with_sleek_design.jpg")],
      ["sihat-3", wiki("e/eb/New_childrens_hospital_helsinki_-_reception_with_info_desk.jpg/1280px-New_childrens_hospital_helsinki_-_reception_with_info_desk.jpg")],
      ["sihat-4", wiki("5/50/A_typical_examination_room_and_exam_table_in_a_doctor%27s_office._02.jpg/1280px-A_typical_examination_room_and_exam_table_in_a_doctor%27s_office._02.jpg")],
    ],
    staff: [
      ["Nigora Karimova", "Akusher-ginekolog", "Du–Ju 09:00–15:00", 16],
      ["Zilola Ergasheva", "Pediatr", "Du–Sh 10:00–17:00", 11],
      ["Barno Tursunova", "Laktatsiya maslahatchisi", "Du, Sesh, Pay 10:00–16:00", 6],
    ],
  },
  {
    key: "bolajon", username: "bolajon", name: "Bolajon Tibbiyot Markazi",
    address: "Namangan sh., Kosonsoy ko'chasi, 8-uy", lat: 41.0104, lng: 71.6531,
    phone: "+998933004001",
    extraPhones: [{ label: "Qabulxona", number: "+998 93 300 40 02" }, { label: "Shoshilinch yordam", number: "+998 93 300 40 03" }],
    about: "Kunduzi ham kechqurun ham qabul qiladigan bolalar shifoxonasi. Ishdan keyin kelishga ulgurmaydigan ota-onalar uchun ish vaqti 21:00 gacha. Shoshilinch holatlarda telefon qilib oldindan aytib qo'ysangiz, bola kutmasdan ko'riladi.",
    services: "Pediatr ko'rigi, shoshilinch yordam, bolalar LOR shifokori, allergolog, ingalyatsiya, emlash, kengaytirilgan tahlillar",
    workHours: week(["09:00", "21:00"], ["09:00", "21:00"], ["09:00", "21:00"]),
    photos: [
      ["bolajon-1", wiki("3/39/University_Medical_Center_entrance%2C_New_Orleans%2C_24_August_2021.jpg/1280px-University_Medical_Center_entrance%2C_New_Orleans%2C_24_August_2021.jpg")],
      ["bolajon-2", wiki("7/76/The_reception_desk_of_the_Physiotherapy_Department_in_the_North_Devon_District_Hospital_-_geograph.org.uk_-_6217516.jpg/1280px-The_reception_desk_of_the_Physiotherapy_Department_in_the_North_Devon_District_Hospital_-_geograph.org.uk_-_6217516.jpg")],
      ["bolajon-3", wiki("0/05/Hospital_in_North_Korea_07_indoor_%28crooped_version%29.jpg/1280px-Hospital_in_North_Korea_07_indoor_%28crooped_version%29.jpg")],
      ["bolajon-4", wiki("3/33/Reception_Desk%2C_Arrowe_Park_Hospital.jpg/1280px-Reception_Desk%2C_Arrowe_Park_Hospital.jpg")],
    ],
    staff: [
      ["Otabek Nazarov", "Pediatr", "Du–Ju 09:00–17:00", 18],
      ["Gulnora Abdullayeva", "Bolalar LOR shifokori", "Sesh, Pay, Sh 12:00–20:00", 12],
      ["Jasur Mirzayev", "Allergolog", "Du, Chor 14:00–20:00", 8],
    ],
  },
];

// ---------- mutaxassis-shifokorlar (har klinikaga 2 tadan) ----------

const DOCTORS = [
  {
    clinic: "Aurex", phone: "+998902311203", name: "Nigora Rustamova", field: "Laktatsiya maslahatchisi", experience: 12, price: 50000,
    photo: person("women", 63),
    education: "Namangan davlat tibbiyot kolleji, hamshiralik ishi (2010). Laktatsiya bo'yicha xalqaro kurs sertifikati (2018).",
    languages: "O'zbek, rus",
    about: "12 yildan beri onalarga emizish va chaqaloq parvarishi bo'yicha yordam beraman. Har bir onaga sokin va tushunarli tilda maslahat beraman.",
    skills: "Emizishni o'rgatish, sut kamligi yoki ko'pligida yordam, ko'krak og'rig'i, chaqaloq uyqusi va parvarishi, qo'shimcha ovqatga o'tish",
  },
  {
    clinic: "Aurex", phone: "+998907000001", name: "Maftuna Karimova", field: "Pediatr", experience: 12, price: 80000,
    photo: person("women", 12),
    education: "Andijon davlat tibbiyot instituti, pediatriya (2011). Bolalar kasalliklari bo'yicha ordinatura (2013).",
    languages: "O'zbek, rus, ingliz",
    about: "Chaqaloqlardan maktab yoshigacha bo'lgan bolalarni ko'raman. Shamollash, ovqat hazm qilish va rivojlanish masalalarida maslahat beraman.",
    skills: "Bolalarni umumiy ko'rikdan o'tkazish, emlash jadvali, isitma va yo'talda birinchi yordam, ovqatlanish rejasi, o'sish va vazn nazorati",
  },
  {
    clinic: "Mehrigiyo Bolalar Klinikasi", phone: "+998901002003", name: "Malika Yusupova", field: "UZI shifokori", experience: 13, price: 150000,
    photo: person("women", 51),
    education: "Toshkent tibbiyot akademiyasi, davolash ishi (2011). Ultratovush diagnostikasi bo'yicha ixtisoslashuv (2014).",
    languages: "O'zbek, rus",
    about: "Homilador ayollar va bolalar uchun ultratovush tekshiruvlarini o'tkazaman. Natijani tushunarli qilib tushuntirib beraman.",
    skills: "Homiladorlikni UZI bilan kuzatish, chaqaloq va bolalar ichki a'zolari UZI, bosh miya (neyrosonografiya), bo'g'imlar tekshiruvi",
  },
  {
    clinic: "Mehrigiyo Bolalar Klinikasi", phone: "+998907000002", name: "Dilfuza Rahimova", field: "Pediatr", experience: 14, price: 100000,
    photo: person("women", 17),
    education: "Samarqand davlat tibbiyot instituti, pediatriya (2010). Neonatologiya bo'yicha malaka oshirish (2016).",
    languages: "O'zbek, rus",
    about: "Yangi tug'ilgan chaqaloqlarni uyda ham ko'raman. Ota-onalar bilan bola sog'lig'i haqida ochiq va sabr bilan gaplashaman.",
    skills: "Chaqaloqlarni ko'rish, sariqlik va kolika, emlashdan keyingi kuzatuv, bola rivojlanishi bo'yicha maslahat",
  },
  {
    clinic: "Sihat Ona va Bola Markazi", phone: "+998907000003", name: "Zilola Ergasheva", field: "Pediatr", experience: 11, price: 90000,
    photo: person("women", 56),
    education: "Toshkent pediatriya tibbiyot instituti (2013). Bolalar allergologiyasi bo'yicha kurs (2019).",
    languages: "O'zbek, rus",
    about: "Bolalar salomatligi bo'yicha oilaviy shifokorman. Har bir bolaga alohida yondashaman va ota-onaga tushunarli reja tuzib beraman.",
    skills: "Bolalar umumiy ko'riki, ovqat allergiyasi, tez-tez kasal bo'ladigan bolalar, qo'shimcha ovqat va vazn nazorati",
  },
  {
    clinic: "Sihat Ona va Bola Markazi", phone: "+998907000004", name: "Barno Tursunova", field: "Laktatsiya maslahatchisi", experience: 6, price: 60000,
    photo: person("women", 44),
    education: "Farg'ona jamoat salomatligi tibbiyot kolleji (2016). Emizish bo'yicha xalqaro sertifikat (2020).",
    languages: "O'zbek, rus",
    about: "Emizayotgan onalarga yordam beraman. O'zim ham uch farzandning onasiman, shuning uchun onalarning qiyinchiliklarini yaxshi tushunaman.",
    skills: "Emizish vaziyatlari, sut sog'ib olish va saqlash, chaqaloq massaji, tug'ruqdan keyingi tiklanish maslahatlari",
  },
  {
    clinic: "Bolajon Tibbiyot Markazi", phone: "+998907000005", name: "Otabek Nazarov", field: "Pediatr", experience: 18, price: 120000,
    photo: person("men", 45),
    education: "Toshkent tibbiyot akademiyasi, pediatriya (2008). Oliy toifali shifokor (2019).",
    languages: "O'zbek, rus, ingliz",
    about: "18 yillik tajribaga ega pediatrman. Murakkab holatlarda ham ota-onaga sokin yo'l-yo'riq ko'rsataman va kerak bo'lsa boshqa mutaxassisga yo'llayman.",
    skills: "Bolalar kasalliklarini davolash, shoshilinch holatlarda maslahat, emlash, surunkali kasalliklarni kuzatish",
  },
  {
    clinic: "Bolajon Tibbiyot Markazi", phone: "+998907000006", name: "Gulnora Abdullayeva", field: "Bolalar LOR shifokori", experience: 12, price: 100000,
    photo: person("women", 68),
    education: "Andijon davlat tibbiyot instituti (2012). Otorinolaringologiya bo'yicha ordinatura (2015).",
    languages: "O'zbek, rus",
    about: "Bolalarda quloq, tomoq va burun kasalliklarini davolayman. Bola qo'rqmasligi uchun tekshiruvni o'yin tarzida o'tkazaman.",
    skills: "Tez-tez tomoq og'rishi, adenoid, otit, burun bitishi, ingalyatsiya va yuvish muolajalari",
  },
];

const EXTRA_STAFF = { Aurex: [["Ravshan Olimov", "Bolalar nevrologi", "Du, Chor, Ju 10:00–16:00", 8]] };

// ---------- suhbat namunalari ----------

const SCRIPTS = {
  pediatr: [
    ["m", "Assalomu alaykum, shifokor. Bolam 2 yoshda, kechadan beri 38 daraja isitma bor."],
    ["d", "Vaalaykum assalom. Yo'talish yoki burun oqishi bormi? Ishtahasi qanday?"],
    ["m", "Ozgina burni bitgan, ishtahasi past. Suyuqlik ichyapti."],
    ["d", "Tushunarli. Iliq suyuqlikni ko'proq bering va xonani shamollatib turing. Harorat 38.5 dan oshsa, vazniga qarab parasetamol sirop berish mumkin. Bolaning vazni necha kilo?"],
    ["m", "12 kilo. Rahmat, kuzataman."],
  ],
  laktatsiya: [
    ["m", "Assalomu alaykum. Chaqaloqim 3 haftalik, emizganda ko'krak og'riyapti."],
    ["d", "Assalomu alaykum! Emizayotganda bola ko'krakni qanday ushlayapti? Faqat so'rg'ichnimi yoki atrofini ham og'ziga oladimi?"],
    ["m", "Faqat so'rg'ichni oladi shekilli."],
    ["d", "Aynan shu og'riq sababi. Bolani ko'krakka yaqin tortib, og'zini keng ochtirib ushlang, so'rg'ich bilan birga atrofini ham olishi kerak. Kerak bo'lsa uchrashib ko'rsatib beraman."],
    ["m", "Juda yaxshi bo'ladi, rahmat!"],
  ],
  uzi: [
    ["m", "Salom, homiladorligim 20 hafta, UZI uchun qachon kelsam bo'ladi?"],
    ["d", "Assalomu alaykum. Payshanba va shanba kunlari 08:00 dan 14:00 gacha qabul qilamiz. Oldindan yozilib keling."],
    ["m", "Shanba kuni soat 10 ga yozib qo'ying."],
    ["d", "Yozib qo'ydim. Tekshiruvdan oldin ko'proq suv ichib keling."],
  ],
  lor: [
    ["m", "Bolam 4 yoshda, tez-tez tomog'i og'riydi."],
    ["d", "Necha kundan beri? Isitma bormi?"],
    ["m", "3 kun. Isitma yo'q, yutganda og'riyapti."],
    ["d", "Bolani ko'rish kerak bo'ladi. Ertaga soat 15:00 da kela olasizmi?"],
    ["m", "Ha, boraman."],
  ],
};
const scriptFor = (field) => (/laktatsiya/i.test(field) ? SCRIPTS.laktatsiya : /uzi/i.test(field) ? SCRIPTS.uzi : /lor/i.test(field) ? SCRIPTS.lor : SCRIPTS.pediatr);

// ---------- ona va bolalar ----------

const MOTHER_NAMES = ["Madina", "Dilnoza", "Zarina", "Shahnoza", "Nodira", "Feruza", "Gulnora", "Sevara", "Munisa", "Kamola", "Malika", "Nargiza",
  "Ozoda", "Rayhona", "Sitora", "Umida", "Lola", "Mohira", "Shirin", "Zulfiya", "Barchinoy", "Durdona", "Iroda", "Laylo", "Mashhura", "Nasiba",
  "Robiya", "Saodat", "Tahmina", "Yulduz", "Dildora", "Gavhar", "Hilola", "Komila", "Nigina", "Oydin"];
const SURNAMES = ["Abdullayeva", "Karimova", "Yusupova", "Rahimova", "Tursunova", "Nazarova", "Ismoilova", "Aliyeva", "Sobirova", "Hasanova",
  "Mirzayeva", "Qodirova", "Olimova", "Ergasheva", "Rasulova", "Xolmatova", "Umarova", "Saidova", "Normatova", "Ahmedova"];
const BOYS = ["Muhammad", "Abdulloh", "Ali", "Islom", "Aziz", "Sardor", "Bekzod", "Jasur", "Omar", "Yusuf", "Amir", "Ibrohim"];
const GIRLS = ["Malika", "Zilola", "Amina", "Madina", "Sitora", "Ruqiya", "Aisha", "Zuhra", "Hadicha", "Mohira", "Asal", "Ziyoda"];
const ALLERGIES = ["", "", "", "", "Sitrus mevalarga allergiya", "Sut mahsulotlariga sezuvchanlik", "Changga allergiya", "Asalga allergiya"];

// Doimiy natija uchun oddiy tasodifiy son generatori (har safar bir xil ma'lumot chiqadi).
function rng(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260926);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (a, b) => a + Math.floor(rand() * (b - a + 1));

const DAY = 86400000;
const TASHKENT = 5 * 3600000;
/** Toshkent vaqti bo'yicha "daysAgo kun oldin, soat h:m" ni UTC Date sifatida qaytaradi. */
function tashkentTime(daysAgo, hour, minute) {
  const nowT = new Date(Date.now() + TASHKENT);
  const d = Date.UTC(nowT.getUTCFullYear(), nowT.getUTCMonth(), nowT.getUTCDate() - daysAgo, hour, minute);
  return new Date(d - TASHKENT);
}

// ---------- asosiy ish ----------

async function ensureClinic(spec) {
  let clinic = await Clinic.findOne({ where: { name: spec.name } });
  if (clinic) return clinic;
  const password = "clinic123";
  const owner = await User.create({
    role: "clinic", name: spec.name, username: spec.username, passwordHash: await hashPassword(password), passwordEnc: encryptSecret(password),
  });
  const days = normalizeWorkHours(spec.workHours);
  const urls = [];
  for (const [name, url] of spec.photos) urls.push(await download(url, name));
  clinic = await Clinic.create({
    ownerId: owner.id, name: spec.name, address: spec.address, lat: spec.lat, lng: spec.lng, phone: spec.phone, extraPhones: spec.extraPhones,
    about: spec.about, services: spec.services, workHours: days, hours: summarizeWorkHours(days), photoUrl: urls[0],
    mapUrl: `https://www.google.com/maps?q=${spec.lat},${spec.lng}`,
  });
  for (let i = 0; i < urls.length; i++) await ClinicPhoto.create({ clinicId: clinic.id, url: urls[i], position: i + 1 });
  console.log(`  klinika: ${spec.name}`);
  return clinic;
}

async function ensureStaff(clinic, list) {
  for (const [name, position, schedule, experience] of list) {
    const has = await ClinicStaff.findOne({ where: { clinicId: clinic.id, name } });
    if (!has) await ClinicStaff.create({ clinicId: clinic.id, name, position, schedule, experience });
  }
}

async function ensureDoctor(d, clinic) {
  let user = await User.findOne({ where: { phone: d.phone } });
  const password = "doctor123";
  if (!user) {
    user = await User.create({ phone: d.phone, role: "nurse", name: d.name, passwordHash: await hashPassword(password), passwordEnc: encryptSecret(password) });
    await ClinicNurse.findOrCreate({ where: { clinicId: clinic.id, phone: d.phone }, defaults: { name: d.name, field: d.field, createdAccount: true } });
  } else {
    await ClinicNurse.findOrCreate({ where: { clinicId: clinic.id, phone: d.phone }, defaults: { name: d.name, field: d.field, createdAccount: false } });
  }
  // Shifokorlik hujjati tasdiqlangan deb belgilanadi: xizmat va video joylashga ruxsat bor.
  await user.update({ name: user.name || d.name, verificationStatus: "approved", verifiedAt: new Date() });
  const photoUrl = await download(d.photo, `doctor-${d.phone.slice(-4)}`);
  const data = { specialty: d.field, experience: d.experience, education: d.education, languages: d.languages, about: d.about, skills: d.skills, photoUrl };
  const existing = await NurseProfile.findOne({ where: { userId: user.id } });
  if (existing) await existing.update(data);
  else await NurseProfile.create({ ...data, userId: user.id });
  let profile = await DoctorProfile.findOne({ where: { userId: user.id, clinicId: clinic.id } });
  const listing = { name: d.name, field: d.field, experience: d.experience, about: d.about, price: d.price };
  if (profile) await profile.update(listing);
  else profile = await DoctorProfile.create({ ...listing, userId: user.id, clinicId: clinic.id });
  console.log(`  shifokor: ${d.name} (${d.clinic})`);
  return { user, profile };
}

function childFor(mother) {
  const boy = rand() < 0.5;
  const ageMonths = between(1, 60);
  const birth = new Date(Date.now() - ageMonths * 30.4 * DAY);
  const years = ageMonths / 12;
  return {
    userId: mother.id, name: pick(boy ? BOYS : GIRLS), gender: boy ? "male" : "female",
    birthDate: birth.toISOString().slice(0, 10),
    weightKg: Math.round((3.4 + years * 2.6 + rand()) * 10) / 10,
    heightCm: Math.round(50 + Math.min(years, 5) * 11 + rand() * 3),
    vaccinations: [], allergies: pick(ALLERGIES), medicalNotes: "",
  };
}

async function seedMothers() {
  const marker = await User.findOne({ where: { phone: "+998935000001" } });
  if (marker) {
    console.log("  onalar allaqachon qo'shilgan, o'tkazib yuborildi");
    return null;
  }
  const mothers = [];
  for (let i = 0; i < MOTHER_NAMES.length; i++) {
    const name = `${MOTHER_NAMES[i]} ${SURNAMES[i % SURNAMES.length]}`;
    const u = await User.create({ phone: `+99893500${String(i + 1).padStart(4, "0")}`, role: "user", name });
    const kids = rand() < 0.35 ? 2 : 1;
    for (let k = 0; k < kids; k++) await Child.create(childFor(u));
    mothers.push(u);
  }
  console.log(`  ${mothers.length} ta ona va ularning bolalari`);
  return mothers;
}

/** So'nggi 30 kun: hafta kunlariga qarab, oxiriga tomon o'sib boruvchi murojaatlar. */
async function seedVisits(mothers, clinics) {
  const share = { "Bolajon Tibbiyot Markazi": 0.34, "Sihat Ona va Bola Markazi": 0.28, "Mehrigiyo Bolalar Klinikasi": 0.2, Aurex: 0.18 };
  const rows = [];
  for (let ago = 29; ago >= 0; ago--) {
    const dow = new Date(Date.now() + TASHKENT - ago * DAY).getUTCDay(); // 0 = yakshanba
    const dayFactor = dow === 0 ? 0.35 : dow === 6 ? 0.8 : dow === 1 || dow === 2 ? 1.15 : 1;
    const growth = 0.65 + ((29 - ago) / 29) * 0.6;
    for (const clinic of clinics) {
      const base = 8 * (share[clinic.name] || 0.2) * dayFactor * growth;
      const count = Math.max(0, Math.round(base + (rand() - 0.5) * 1.6));
      for (let n = 0; n < count; n++) {
        const t = tashkentTime(ago, between(9, 19), between(0, 59));
        if (ago === 0 && t.getTime() > Date.now()) continue; // kelajakdagi soat bo'lmasin
        rows.push({
          userId: pick(mothers).id, clinicId: clinic.id, status: ago === 0 ? "en_route" : "done",
          createdAt: t, updatedAt: t,
        });
      }
    }
  }
  await Visit.bulkCreate(rows);
  await sequelize.query(`UPDATE "Visits" SET "updatedAt" = "createdAt" WHERE "createdAt" > NOW() - INTERVAL '31 days'`);
  console.log(`  ${rows.length} ta murojaat (so'nggi 30 kun)`);
}

async function seedConversations(mothers, doctors) {
  let made = 0;
  for (let i = 0; i < 18; i++) {
    const mother = mothers[i % mothers.length];
    const doc = doctors[(i * 3) % doctors.length];
    const [conv, created] = await Conversation.findOrCreate({
      where: { kind: "nurse", userId: mother.id, peerId: doc.user.id }, defaults: { kind: "nurse", userId: mother.id, peerId: doc.user.id },
    });
    if (!created) continue;
    await Hire.findOrCreate({
      where: { userId: mother.id, doctorProfileId: doc.profile.id },
      defaults: { userId: mother.id, doctorProfileId: doc.profile.id, amount: doc.profile.price, provider: rand() < 0.5 ? "click" : "payme" },
    });
    let t = tashkentTime(between(0, 9), between(9, 19), between(0, 59)).getTime();
    const script = [["d", `Assalomu alaykum! Men ${doc.user.name}. Savolingizni yozing.`], ...scriptFor(doc.profile.field)];
    const unreadLast = i % 4 === 1; // ba'zi suhbatlarda oxirgi xabar o'qilmagan (ilovada belgi ko'rinadi)
    for (let k = 0; k < script.length; k++) {
      const [who, text] = script[k];
      const at = new Date(t);
      const isLast = k === script.length - 1;
      await Message.create({
        conversationId: conv.id, senderId: who === "m" ? mother.id : doc.user.id, kind: "text", text,
        readAt: unreadLast && isLast ? null : new Date(at.getTime() + between(1, 6) * 60000), createdAt: at, updatedAt: at,
      });
      t += between(2, 25) * 60000;
    }
    made++;
  }
  console.log(`  ${made} ta suhbat (mutaxassislar bilan)`);
}

async function main() {
  await sequelize.authenticate();
  await migrate();
  console.log("Demo ma'lumotlar qo'shilmoqda…");

  const clinics = [];
  clinics.push(await Clinic.findOne({ where: { name: "Aurex" } }), await Clinic.findOne({ where: { name: "Mehrigiyo Bolalar Klinikasi" } }));
  for (const spec of NEW_CLINICS) {
    const c = await ensureClinic(spec);
    await ensureStaff(c, spec.staff);
    clinics.push(c);
  }
  for (const [name, list] of Object.entries(EXTRA_STAFF)) {
    const c = clinics.find((x) => x?.name === name);
    if (c) await ensureStaff(c, list);
  }
  const live = clinics.filter(Boolean);

  const doctors = [];
  for (const d of DOCTORS) {
    const clinic = live.find((c) => c.name === d.clinic);
    if (clinic) doctors.push(await ensureDoctor(d, clinic));
  }

  const mothers = await seedMothers();
  if (mothers) {
    await seedVisits(mothers, live);
    await seedConversations(mothers, doctors);
  }
  console.log("Tayyor.");
  await sequelize.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
