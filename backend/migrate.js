const { sequelize } = require("./models");

// sequelize.sync() mavjud jadvalni o'zgartirmaydi, shuning uchun eski bazani yangi sxemaga
// shu yerda olib kelamiz. Hamma buyruq takroran ishlasa ham zarar qilmaydi.
async function migrate() {
  const run = (sql) => sequelize.query(sql);

  // Yangi rol va login-parol ustunlari.
  await run(`ALTER TYPE "enum_Users_role" ADD VALUE IF NOT EXISTS 'admin'`);
  await run(`ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "username" VARCHAR(255)`);
  await run(`ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "passwordHash" VARCHAR(255)`);
  await run(`ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "passwordEnc" TEXT`);
  await run(`ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMPTZ`);
  await run(`ALTER TABLE "Messages" ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMPTZ`);
  // Eski xabarlar o'qilgan hisoblanadi (aks holda hammasi "o'qilmagan" bo'lib chiqadi).
  await run(`UPDATE "Messages" SET "readAt" = "createdAt" WHERE "readAt" IS NULL AND "createdAt" < NOW() - INTERVAL '1 minute'`);
  await run(`ALTER TABLE "Users" ALTER COLUMN "phone" DROP NOT NULL`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS "users_username_unique" ON "Users" ("username")`);

  // Admin klinikani faqat nom bilan yaratadi.
  for (const col of ["address", "lat", "lng", "hours"]) {
    await run(`ALTER TABLE "Clinics" ALTER COLUMN "${col}" DROP NOT NULL`);
  }

  await run(`ALTER TABLE "Clinics" ADD COLUMN IF NOT EXISTS "workHours" JSON`);
  await run(`ALTER TABLE "Clinics" ADD COLUMN IF NOT EXISTS "extraPhones" JSON`);
  await run(`ALTER TABLE "ClinicNurses" ADD COLUMN IF NOT EXISTS "field" VARCHAR(255)`);
  await run(`ALTER TABLE "ClinicNurses" ADD COLUMN IF NOT EXISTS "createdAccount" BOOLEAN NOT NULL DEFAULT false`);
  await run(`ALTER TABLE "ClinicStaffs" ADD COLUMN IF NOT EXISTS "experience" INTEGER`);
  await run(`ALTER TABLE "Visits" ADD COLUMN IF NOT EXISTS "doctorName" VARCHAR(255)`);
  await run(`ALTER TABLE "Visits" ADD COLUMN IF NOT EXISTS "doctorPosition" VARCHAR(255)`);

  // Hamshira e'lonlari klinikaga bog'lanadi. Eski tasdiqlangan hamshiralar o'z klinikasiga avtomatik ko'chiriladi.
  await run(`ALTER TABLE "DoctorProfiles" ADD COLUMN IF NOT EXISTS "clinicId" INTEGER`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS "doctor_profiles_user_clinic" ON "DoctorProfiles" ("userId", "clinicId")`);
  await run(`
    INSERT INTO "ClinicNurses" ("clinicId", "phone", "name", "createdAt", "updatedAt")
    SELECT u."clinicId", u."phone", u."name", NOW(), NOW() FROM "Users" u
    WHERE u."role" = 'nurse' AND u."clinicId" IS NOT NULL AND u."verificationStatus" = 'approved' AND u."phone" IS NOT NULL
      AND EXISTS (SELECT 1 FROM "Clinics" c WHERE c."id" = u."clinicId")
    ON CONFLICT DO NOTHING
  `);
  await run(`
    UPDATE "DoctorProfiles" p SET "clinicId" = u."clinicId" FROM "Users" u
    WHERE u."id" = p."userId" AND p."clinicId" IS NULL AND u."clinicId" IS NOT NULL
      AND EXISTS (SELECT 1 FROM "Clinics" c WHERE c."id" = u."clinicId")
  `);

  await run(`ALTER TABLE "NurseProfiles" ADD COLUMN IF NOT EXISTS "skills" TEXT`);
  await run(`ALTER TABLE "NurseProfiles" ADD COLUMN IF NOT EXISTS "photoUrl" VARCHAR(255)`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS "nurse_profiles_user" ON "NurseProfiles" ("userId")`);

  await run(`ALTER TABLE "Videos" ADD COLUMN IF NOT EXISTS "durationSec" INTEGER DEFAULT 0`);
  await run(`UPDATE "Videos" SET "durationSec" = "durationMin" * 60 WHERE COALESCE("durationSec", 0) = 0 AND "durationMin" > 0`);

  await run(`ALTER TABLE "Videos" ADD COLUMN IF NOT EXISTS "playlistId" INTEGER`);
  await run(`ALTER TABLE "Videos" ADD COLUMN IF NOT EXISTS "position" INTEGER DEFAULT 0`);

  await run(`ALTER TABLE "Videos" ADD COLUMN IF NOT EXISTS "authorId" INTEGER`);
  // Endi pullik dars faqat mutaxassislardan: platforma (admin) darslari va pleylistlari bepul.
  await run(`UPDATE "Videos" SET "price" = 0 WHERE "authorId" IS NULL AND "price" > 0`);
  await run(`UPDATE "Playlists" SET "price" = 0 WHERE "price" > 0`);
  await run(`ALTER TABLE "Videos" ADD COLUMN IF NOT EXISTS "price" INTEGER NOT NULL DEFAULT 0`);
  await run(`ALTER TABLE "Playlists" ADD COLUMN IF NOT EXISTS "price" INTEGER NOT NULL DEFAULT 0`);

  // Rasm tartibi: eski rasmlarga id bo'yicha 1, 2, 3… beriladi (faqat hali tartibsiz, ya'ni 0 bo'lganlarga).
  await run(`ALTER TABLE "ClinicPhotos" ADD COLUMN IF NOT EXISTS "position" INTEGER NOT NULL DEFAULT 0`);
  await run(`
    UPDATE "ClinicPhotos" p SET "position" = r.rn
    FROM (SELECT "id", ROW_NUMBER() OVER (PARTITION BY "clinicId" ORDER BY "id") AS rn FROM "ClinicPhotos") r
    WHERE p."id" = r."id" AND p."position" = 0
  `);

  // Eski bitta rasmni galereyaga ko'chirish.
  await run(`
    INSERT INTO "ClinicPhotos" ("clinicId", "url", "createdAt", "updatedAt")
    SELECT c."id", c."photoUrl", NOW(), NOW() FROM "Clinics" c
    WHERE c."photoUrl" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "ClinicPhotos" p WHERE p."clinicId" = c."id")
  `);
}

module.exports = migrate;
