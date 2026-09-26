# Motherly

Onalar va bolalar uchun ilova: AI chat, mutaxassislar bilan suhbat, yaqin klinikalar, video darslar.

- `backend/`: Node.js + Express + PostgreSQL (Sequelize). `.env.example` dan `.env` yarating.
- `web/`: Next.js admin va klinika paneli.
- `mobile/`: Flutter ilova.

## Ishga tushirish

```bash
# backend
cd backend && cp .env.example .env && npm install && npm run dev
# web
cd web && npm install && npm run dev
# mobile
cd mobile && flutter pub get && flutter run
```

`.env`, `backend/private/` (admin paroli, shifrlash kaliti) va `backend/uploads/` repozitoriyga kiritilmagan.
