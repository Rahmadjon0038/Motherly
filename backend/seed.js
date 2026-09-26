const { User, DoctorProfile, Clinic, ClinicStaff, ClinicNurse } = require("./models");

// Bo'sh bazaga demo ma'lumotlar qo'shadi.
async function seedMain() {
  if ((await Clinic.count()) > 0) return;

  const clinics = await Clinic.bulkCreate([
    { name: "Mehr Bolalar Klinikasi", address: "Chilonzor, 9-kvartal", lat: 41.2757, lng: 69.2043, hours: "Du–Sha 08:00–19:00" },
    { name: "Shifo Med", address: "Yunusobod, 4-mavze", lat: 41.3646, lng: 69.2879, hours: "Du–Ya 09:00–21:00" },
    { name: "Oila Doktori", address: "Mirobod, Nukus ko'chasi", lat: 41.2995, lng: 69.2691, hours: "Du–Ju 08:00–17:00" },
  ]);
  await ClinicStaff.bulkCreate([
    { clinicId: clinics[0].id, name: "Dilnoza Karimova", position: "Pediatr", schedule: "09:00–15:00" },
    { clinicId: clinics[0].id, name: "Sardor Yusupov", position: "Nevrolog", schedule: "13:00–19:00" },
    { clinicId: clinics[1].id, name: "Malika Rasulova", position: "Nutritsiolog", schedule: "10:00–18:00" },
    { clinicId: clinics[1].id, name: "Ozoda Nazarova", position: "Hamshira", schedule: "09:00–21:00" },
    { clinicId: clinics[2].id, name: "Bahrom Tursunov", position: "Pediatr", schedule: "08:00–17:00" },
  ]);

  const consultants = [
    ["+998900000001", "Dilnoza Karimova", "Bolalar hamshirasi", 12, 50000, "Yangi tug'ilgan chaqaloqlar parvarishi, cho'miltirish va emlashdan keyingi kuzatuv bo'yicha maslahat."],
    ["+998900000002", "Sardor Yusupov", "Laktatsiya maslahatchisi", 8, 80000, "Emizish, sut yetishmasligi va qo'shimcha ovqatga o'tish bo'yicha maslahat."],
    ["+998900000003", "Malika Rasulova", "Bola ovqatlanishi maslahatchisi", 6, 40000, "Bolalar ovqatlanishi, allergiya va vazn ortishi bo'yicha maslahat."],
  ];
  for (const [phone, name, field, experience, price, about] of consultants) {
    const u = await User.create({ phone, role: "nurse", name });
    // Demo hamshiralar birinchi klinikaning ro'yxatiga qo'shilgan va shu klinika nomidan e'lon joylagan.
    await ClinicNurse.create({ clinicId: clinics[0].id, phone, name });
    await DoctorProfile.create({ userId: u.id, clinicId: clinics[0].id, name, field, experience, price, about });
  }
  console.log("Demo ma'lumotlar qo'shildi");
}

async function seed() {
  await seedMain();
}

module.exports = seed;
