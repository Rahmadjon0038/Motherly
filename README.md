# Motherly

Onalar va bolalar uchun ilova. Ona **ro'yxatdan o'tmasdan** foydalanadi: AI yordamchi bilan yozishadi, mutaxassis (hamshira, laktatsiya maslahatchisi) bilan suhbatlashadi, yaqin klinikalarni xaritada ko'radi va video darslar ko'radi. Klinikalar va platforma egasi uchun alohida veb-panel bor.

## Loyiha uch qismdan iborat

```
pedAi/
├── backend/   Node.js API (Express + PostgreSQL)
├── web/       Veb-panel: super admin va klinika (Next.js)
└── mobile/    Mobil ilova: ona va mutaxassis (Flutter)
```

Uchalasi bitta backend bilan gaplashadi: `mobile` va `web` → HTTP (JSON) → `backend` → PostgreSQL.

## Foydalanuvchi turlari (rollar)

| Rol | Qayerda ishlaydi | Qanday kiradi | Nima qiladi |
|---|---|---|---|
| **Ona** (`user`) | Mobil ilova | Kirish shart emas: avtomatik **mehmon** akkaunt ochiladi. Pul to'lash yoki murojaat uchun telefon raqam + SMS kodi bilan tasdiqlaydi | AI chat, mutaxassis yollash, klinikalar, video darslar, pullik dars sotib olish |
| **Mutaxassis** (`nurse`) | Mobil ilova | Telefon raqam + parol (klinika beradi) | Onalar bilan chat, o'z profili (rasm, tajriba, nima qila olishi), e'lonlar, o'z video darslarini narxi bilan yuklash |
| **Klinika** (`clinic`) | Veb-panel | Login + parol (admin beradi) | O'z ma'lumotlarini to'ldirish, murojaatlarni ko'rish, mutaxassis qo'shish, statistika |
| **Super admin** (`admin`) | Veb-panel | Login + parol | Klinikalar yaratish/boshqarish, bepul videolar va pleylistlar, umumiy statistika |

## Texnologiyalar

### Backend (`backend/`)
- **Node.js 24**, **Express 5**: HTTP server va marshrutlar
- **PostgreSQL** + **Sequelize 6** (ORM): ma'lumotlar bazasi
- **jsonwebtoken**: kirish tokeni (JWT, 30 kun)
- **multer**: rasm, video va PDF yuklash (`uploads/` papkasiga)
- **crypto** (Node ichida): parollar `scrypt` bilan xeshlanadi; klinika/mutaxassis parolini admin qayta ko'ra olishi uchun **AES-256-GCM** bilan shifrlangan nusxasi ham saqlanadi
- **Google Gemini API**: AI yordamchi (kalit faqat serverda, ilovaga berilmaydi)
- **nodemon**: rivojlanishda avtomatik qayta ishga tushish
- Xarita/yo'l uchun tashqi servislar: OpenStreetMap (OSM), OSRM

### Veb-panel (`web/`)
- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS 4**: dizayn
- Ma'lumot olish: oddiy `fetch` ustiga yozilgan `api()` yordamchisi (`web/lib/api.ts`), holat `useState` / `useEffect` bilan. **React Query (TanStack Query) ishlatilmagan.**

### Mobil ilova (`mobile/`)
- **Flutter** (Dart), iOS uchun sinalgan
- Holat boshqaruvi: `ChangeNotifier` (`session`), tashqi paketsiz
- Asosiy paketlar: `http` (so'rovlar), `shared_preferences` (token saqlash), `geolocator` (joylashuv), `flutter_map` + `latlong2` (xarita), `url_launcher`, `file_picker`, `video_player` va `youtube_player_iframe` (video), `http_parser`

## Backend tuzilishi (`backend/`)

| Fayl | Vazifasi |
|---|---|
| `index.js` | Serverning o'zi va **barcha API marshrutlari** (~76 ta) |
| `models.js` | Baza jadvallari (Sequelize modellari) va ular orasidagi bog'lanishlar |
| `migrate.js` | Eski bazani yangi tuzilishga o'tkazadi (`ALTER TABLE ... IF NOT EXISTS`), har ishga tushganda xavfsiz ishlaydi |
| `accounts.js` | Parol xeshlash/shifrlash, login tayyorlash, super adminni yaratish |
| `ai.js` | Gemini bilan ishlash: ko'rsatma matni, modellar ketma-ketligi, xatoda zaxira javob |
| `hours.js` | Klinika ish vaqti va "hozir ochiq/yopiq" (Toshkent vaqti, UTC+5) |
| `location.js` | Joylashuv yordamchilari (masofa hisobi) |
| `seed.js` | Baza bo'sh bo'lsa sinov uchun boshlang'ich ma'lumot |
| `uploads/` | Yuklangan fayllar (repoga kirmaydi) |
| `private/` | Admin paroli va shifrlash kaliti (repoga kirmaydi) |

### Asosiy jadvallar
- `User`: hamma foydalanuvchilar (rol bo'yicha ajratiladi)
- `Clinic`, `ClinicPhoto`, `ClinicStaff`: klinika, uning rasmlari (10 tagacha), shifokorlari
- `ClinicNurse`: klinika ro'yxatidagi mutaxassislar; `NurseProfile`: mutaxassisning shaxsiy profili
- `DoctorProfile`: mutaxassisning klinika nomidan e'loni (yo'nalish, narx); `Hire`: onaning mutaxassisni yollashi
- `Visit`: onaning klinikaga **murojaati**
- `Conversation`, `Message`: chatlar (AI va mutaxassis bilan), o'qilgan/o'qilmagan holati
- `Child`: onaning bolalari (AI shundan foydalanadi)
- `Video`, `Playlist`, `Purchase`, `Favorite`: video darslar, pleylistlar, sotib olishlar, sevimlilar

### API guruhlari (`/api/...`)
- `auth/*`: mehmon kirish, SMS bilan tasdiqlash, login
- `clinics`, `clinics/:id/visit`: onaga klinikalar va murojaat
- `clinic/*`: klinika paneli (ma'lumot, rasm, murojaatlar, mutaxassislar, statistika)
- `admin/*`: super admin (klinikalar, videolar, pleylistlar, statistika)
- `consultants`, `nurse/*`, `nurses/:id/videos`: mutaxassislar, profil, o'z videolari
- `conversations/*`, `chat/ai`: chatlar
- `videos`, `paid/*`, `playlists/*`: darslar va pullik darslar
- To'lov hozircha **soxta** (Click/Payme haqiqiy ulanmagan)

## Veb-panel tuzilishi (`web/`)

```
web/
├── app/
│   ├── login/            Kirish sahifasi
│   ├── admin/            SUPER ADMIN
│   │   ├── page.tsx        Klinikalar ro'yxati
│   │   ├── clinics/[id]/   Klinika tafsiloti, login/parol
│   │   ├── videos/         Video darslar (Darslar / Pleylistlar)
│   │   ├── playlists/[id]/ Pleylist ichi
│   │   └── stats/          Umumiy statistika
│   └── (panel)/          KLINIKA
│       ├── page.tsx        Murojaatlar
│       ├── stats/          Klinika statistikasi (chart)
│       ├── consultants/    Mutaxassislar va [id] profili
│       └── clinic/         Klinika ma'lumotlari
├── components/           Umumiy bo'laklar: SidebarShell, Modal, Spinner, TimeInput,
│                         VideoParts, PlaylistsPanel, kirish ma'lumotlari oynalari
└── lib/
    ├── api.ts            Backend bilan aloqa, token saqlash, xato matnlari
    ├── types.ts          TypeScript turlari
    └── format.ts         Sana, vaqt, pul formatlash
```

## Mobil ilova tuzilishi (`mobile/lib/`)

| Fayl | Vazifasi |
|---|---|
| `main.dart` | Ilova kirish nuqtasi; rolga qarab bosh oynani tanlaydi |
| `api.dart` | Backend bilan aloqa va `session` (token, mehmon akkaunt, kirish/chiqish) |
| `auth.dart`, `welcome.dart` | Kirish: Ona yoki Mutaxassis sifatida, SMS tasdiqlash |
| `user_home.dart` | Ona uchun pastki menyu: Chat, Mutaxassis, Klinikalar, Darslar |
| `home_chat.dart`, `chat_view.dart`, `conversations.dart` | AI chat, mutaxassis chatlari, xabarlar ro'yxati |
| `staff_home.dart` | Mutaxassis uchun: Bemorlar, E'lonlarim, Videolarim |
| `nurse_profile.dart` | Mutaxassis profili (o'zining va onaga ko'rinadigan) |
| `my_videos.dart` | Mutaxassisning o'z videolarini yuklashi va boshqarishi |
| `videos.dart` | Darslar, pleylistlar, pullik darslar, video pleyer |
| `maps.dart`, `geo.dart` | Klinikalar xaritasi, joylashuv va masofa |
| `payment.dart` | To'lov oynasi (hozircha soxta) |
| `profile.dart`, `onboarding.dart` | Ona profili, bolalar; boshlang'ich tanishuv |
| `theme.dart`, `avatars.dart`, `widgets.dart` | Ranglar, avatarlar, umumiy bo'laklar |

## Asosiy oqimlar

- **Mehmon.** Ilovani ochgan ona uchun server avtomatik mehmon akkaunt ochadi. Ro'yxatdan o'tish faqat to'lov yoki murojaat uchun kerak. Telefon tasdiqlansa, mehmon ma'lumotlari shu akkauntga o'tadi. Chiqilsa, yangi mehmon ochiladi.
- **AI chat.** Oddiy savolga darhol javob beradi, jiddiy sog'liq savolida avval bolaning yoshi va ahvolini so'raydi. Bolalar ma'lumoti profildan olinadi. Har foydalanuvchiga soatiga 40 savol limiti.
- **Murojaat.** Ona klinikada "Murojaat" bosadi, klinika paneli uni ko'radi va telefon qiladi. Navbat tizimi yo'q.
- **Mutaxassis.** Klinika ism, telefon, parol bilan akkaunt ochadi. Mutaxassis ilovaga kirib profilini to'ldiradi. Klinika uning profilini panelda ko'radi.
- **Video darslar.** Admin va mutaxassis video yuklaydi (fayl yoki YouTube havola). Admin darslari faqat **bepul**. **Pullik** dars faqat mutaxassisdan: narxni u belgilaydi, ona sotib oladi. Sotib olinmaguncha video havolasi ilovaga yuborilmaydi.

## Ishga tushirish

Kerak: Node.js 24+, PostgreSQL, Flutter (mobil uchun).

```bash
# 1. Backend
cd backend
cp .env.example .env        # DATABASE_URL, JWT_SECRET, GEMINI_API_KEY ni to'ldiring
npm install
npm run dev                 # http://localhost:5100

# 2. Veb-panel
cd web
cp .env.example .env.local  # NEXT_PUBLIC_API_URL=http://localhost:5100
npm install
npm run dev                 # http://localhost:3000

# 3. Mobil ilova
cd mobile
flutter pub get
flutter run
```

Birinchi ishga tushishda backend super admin login va parolini serverning logida ko'rsatadi (`backend/private/` ga saqlaydi). Sinov SMS kodi `.env` dagi `DEV_SMS_CODE` (`1111`).

### Muhit o'zgaruvchilari (`backend/.env`)
`PORT`, `DATABASE_URL`, `JWT_SECRET`, `DEV_SMS_CODE`, `GEMINI_API_KEY`, `GEMINI_MODELS`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `CREDENTIALS_KEY` (namuna: `backend/.env.example`).

## Repoga kirmaydigan narsalar
`.env`, `backend/private/` (parol va kalitlar), `backend/uploads/`, `node_modules`, `mobile/build`, `web/.next`.

## Hozirgi holat va keyingi qadamlar
- To'lov (Click/Payme) soxta: haqiqiy pul o'tmaydi.
- SMS kodi sinov rejimida (`1111`), haqiqiy SMS servis ulanmagan.
- Avtomatik testlar yo'q.
- Login urinishlari cheklovi olib tashlangan; ishga tushirishdan oldin qaytarish tavsiya etiladi.
