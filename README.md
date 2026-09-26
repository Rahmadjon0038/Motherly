# Motherly

Motherly — bolasi bor onalar uchun ilova. Ona ilovani ochadi va darrov foydalana boshlaydi: ro'yxatdan o'tish shart emas. Bolasi haqida AI yordamchidan so'raydi, kerak bo'lsa haqiqiy mutaxassis (hamshira, laktatsiya maslahatchisi) bilan yozishadi, yaqin klinikani xaritadan topadi va video darslar ko'radi.

Klinikalar va platforma egasi uchun alohida veb-panel bor: klinika o'z ma'lumotlarini yuritadi, ilova orqali kelgan murojaatlarni ko'radi; admin esa klinikalarni qo'shadi va umumiy statistikani kuzatadi.

## Loyiha nimalardan iborat

Repo uchta mustaqil qismdan tashkil topgan:

```
pedAi/
├── backend/   API server (Node.js, Express, PostgreSQL)
├── web/       Veb-panel: admin va klinika uchun (Next.js)
└── mobile/    Mobil ilova: ona va mutaxassis uchun (Flutter)
```

Mobil ilova ham, veb-panel ham faqat backend bilan gaplashadi (JSON orqali), backend esa ma'lumotlarni PostgreSQL'da saqlaydi. Ya'ni ikkala ilova bir-birini bilmaydi, ikkalasi bitta API'dan foydalanadi.

## Kim nima qiladi

Tizimda to'rt xil foydalanuvchi bor:

- **Ona** mobil ilovadan foydalanadi. Ilovani ochganda unga avtomatik "mehmon" akkaunt ochiladi, shuning uchun hech narsa to'ldirmasdan chatga yozishi mumkin. Telefon raqamini faqat pul to'lamoqchi yoki klinikaga murojaat qoldirmoqchi bo'lganda tasdiqlaydi. O'shanda mehmon sifatida qilgan hamma narsasi (bolalari, suhbatlari) o'z akkauntiga o'tadi.
- **Mutaxassis** ham mobil ilovadan kiradi, telefon raqami va parol bilan. Akkauntni unga klinika ochib beradi. Mutaxassis o'z profilini (rasm, tajriba, nima ish qila olishi) o'zi to'ldiradi, onalar bilan yozishadi va xohlasa o'zi tayyorlagan video darslarni narxini qo'yib yuklaydi.
- **Klinika** veb-panelga login va parol bilan kiradi (ularni admin beradi). U yerda klinika o'z ma'lumotlarini to'ldiradi: rasmlar, ish vaqti, telefonlar, shifokorlar. Ilova orqali kelgan murojaatlarni ko'radi, mutaxassislar akkauntini yaratadi va nechta bemor kelganini statistikadan biladi.
- **Admin** — platforma egasi. Klinikalarni yaratadi, bepul video darslar va pleylistlarni boshqaradi, umumiy statistikani ko'radi.

## Qanday texnologiyalar ishlatilgan

**Backend**
- Node.js va Express 5: server va marshrutlar
- PostgreSQL va Sequelize: baza va ORM
- JWT: foydalanuvchi kirganini eslab qolish uchun token
- multer: rasm, video va fayllarni yuklash
- Parollar `scrypt` bilan xeshlanadi. Klinika va mutaxassis parolini admin (yoki klinika) keyin qayta ko'ra olishi uchun uning shifrlangan (AES-256-GCM) nusxasi ham saqlanadi
- Google Gemini: AI yordamchi. Kalit faqat serverda turadi, ilovaga hech qachon berilmaydi

**Veb-panel**
- Next.js 16 (App Router), React 19 va TypeScript
- Tailwind CSS 4
- Ma'lumotlarni olish uchun oddiy `fetch` ustiga yozilgan kichik `api()` funksiyasi va React'ning o'zining `useState` / `useEffect` lari. React Query kabi qo'shimcha kutubxona ishlatilmagan

**Mobil ilova**
- Flutter (Dart)
- Holat boshqaruvi uchun Flutter'ning o'zidagi `ChangeNotifier`, tashqi paket yo'q
- Asosiy paketlar: `http`, `shared_preferences`, `geolocator`, `flutter_map`, `url_launcher`, `file_picker`, `video_player`, `youtube_player_iframe`

## Backend qanday tuzilgan

Hamma marshrutlar bitta katta faylda, `backend/index.js` da. Qolgan fayllar aniq bir ishga javob beradi:

| Fayl | Nima qiladi |
|---|---|
| `index.js` | Server va barcha API marshrutlari |
| `models.js` | Baza jadvallari va ularning bir-biriga bog'lanishi |
| `migrate.js` | Eski bazani yangi tuzilishga keltiradi. Har ishga tushishda xavfsiz ishlaydi |
| `accounts.js` | Parolni xeshlash va shifrlash, super adminni yaratish |
| `ai.js` | Gemini bilan ishlash: ko'rsatma matni, model tanlash, xato bo'lsa zaxira javob |
| `hours.js` | Klinika ish vaqti va "hozir ochiq yoki yopiq" hisobi (Toshkent vaqti) |
| `location.js` | Masofa hisoblash |
| `seed.js` | Baza bo'sh bo'lsa, sinash uchun boshlang'ich ma'lumot qo'shadi |

Bazadagi asosiy jadvallar:

- `User`: hamma foydalanuvchilar, roli bilan
- `Clinic`, `ClinicPhoto`, `ClinicStaff`: klinika, uning rasmlari va shifokorlari
- `ClinicNurse`, `NurseProfile`, `DoctorProfile`: klinika qo'shgan mutaxassislar, ularning shaxsiy profili va klinika nomidan e'loni
- `Hire`: ona mutaxassisni yollagani
- `Visit`: ona klinikaga qoldirgan murojaat
- `Conversation`, `Message`: chatlar (AI bilan ham, mutaxassis bilan ham)
- `Child`: onaning bolalari, AI ularni hisobga olib javob beradi
- `Video`, `Playlist`, `Purchase`, `Favorite`: darslar, pleylistlar, sotib olinganlari va sevimlilar

API manzillari `/api/...` bilan boshlanadi va vazifasiga qarab guruhlangan: `auth` (kirish), `clinic` (klinika paneli), `admin`, `consultants` va `nurse` (mutaxassislar), `conversations` va `chat` (chatlar), `videos`, `playlists` va `paid` (darslar).

## Veb-panel qanday tuzilgan

```
web/
├── app/
│   ├── login/              kirish sahifasi
│   ├── admin/              admin paneli
│   │   ├── page.tsx          klinikalar ro'yxati
│   │   ├── clinics/[id]/     bitta klinika, uning login va paroli
│   │   ├── videos/           video darslar va pleylistlar
│   │   ├── playlists/[id]/   pleylist ichidagi darslar
│   │   └── stats/            umumiy statistika
│   └── (panel)/            klinika paneli
│       ├── page.tsx          murojaatlar
│       ├── stats/            klinikaga kelgan bemorlar grafigi
│       ├── consultants/      mutaxassislar va har birining profili
│       └── clinic/           klinika ma'lumotlari
├── components/             umumiy bo'laklar: yon menyu, oyna, yuklanish belgisi, vaqt kiritish va h.k.
└── lib/
    ├── api.ts              backend bilan gaplashish va tokenni saqlash
    ├── types.ts            TypeScript turlari
    └── format.ts           sana, vaqt va pulni chiroyli ko'rsatish
```

## Mobil ilova qanday tuzilgan

Hamma kod `mobile/lib/` ichida:

| Fayl | Nima qiladi |
|---|---|
| `main.dart` | Ilova shu yerdan boshlanadi. Foydalanuvchi roliga qarab kerakli bosh oynani ochadi |
| `api.dart` | Backend bilan aloqa va `session`: token, mehmon akkaunt, kirish va chiqish |
| `welcome.dart`, `auth.dart` | "Ona yoki mutaxassis sifatida kirish" oynasi va SMS orqali tasdiqlash |
| `user_home.dart` | Ona uchun pastki menyu: Chat, Mutaxassis, Klinikalar, Darslar |
| `home_chat.dart`, `chat_view.dart`, `conversations.dart` | AI chat, mutaxassislar bilan suhbatlar |
| `staff_home.dart` | Mutaxassis uchun: Bemorlar, E'lonlarim, Videolarim |
| `nurse_profile.dart` | Mutaxassis profili (o'zi ko'rgani va ona ko'radigani) |
| `my_videos.dart` | Mutaxassis o'z videolarini yuklaydi va boshqaradi |
| `videos.dart` | Darslar, pleylistlar, pullik darslar va video pleyer |
| `maps.dart`, `geo.dart` | Klinikalar xaritasi, joylashuv va masofa |
| `payment.dart` | To'lov oynasi |
| `profile.dart`, `onboarding.dart` | Ona profili va bolalari, boshlang'ich tanishuv |
| `theme.dart`, `avatars.dart`, `widgets.dart` | Ranglar, avatarlar va umumiy bo'laklar |

## Bir nechta muhim joylari

**Mehmon akkaunt.** Ilova birinchi ochilganda server ona uchun vaqtinchalik akkaunt yaratadi, token telefonda saqlanadi. Ona profildan chiqib ketsa, yangi mehmon akkaunt ochiladi va hamma narsa boshidan boshlanadi.

**AI chat.** Sodda savolga darhol javob beradi. Sog'liq haqida jiddiyroq savol bo'lsa, avval bolaning yoshi va ahvolini so'raydi, keyin maslahat beradi. Har foydalanuvchiga soatiga 40 ta savol berish mumkin.

**Murojaat.** Navbat tizimi yo'q. Ona klinikada "Murojaat" tugmasini bosadi, klinika buni panelida ko'radi va o'zi qo'ng'iroq qiladi.

**Video darslar.** Video fayl yoki YouTube havola ko'rinishida yuklanadi. Admin qo'ygan darslar hammaga bepul. Pullik darsni faqat mutaxassis qo'ya oladi va narxini o'zi belgilaydi. Ona sotib olmaguncha video havolasi ilovaga umuman yuborilmaydi.

## Ishga tushirish

Kerak bo'ladi: Node.js 24 yoki yangiroq, PostgreSQL, mobil uchun Flutter.

**1. Backend**

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

`.env` faylida `DATABASE_URL`, `JWT_SECRET` va AI ishlashi uchun `GEMINI_API_KEY` ni to'ldiring. Server `http://localhost:5100` da ishga tushadi. Birinchi ishga tushganda u admin login va parolini terminalga chiqaradi.

**2. Veb-panel**

```bash
cd web
cp .env.example .env.local
npm install
npm run dev
```

Panel `http://localhost:3000` da ochiladi. `.env.local` da backend manzili turadi (`NEXT_PUBLIC_API_URL`).

**3. Mobil ilova**

```bash
cd mobile
flutter pub get
flutter run
```

`.env`, `backend/private/` (admin paroli va shifrlash kaliti) va `backend/uploads/` (yuklangan fayllar) GitHub'ga yuklanmaydi, shuning uchun yangi kompyuterda `.env` ni o'zingiz yaratasiz.
