// Klinika ish vaqti: haftalik jadval [{ day: 1..7 (Du..Yak), closed, open: "HH:MM", close: "HH:MM" }].
// Ochiq/yopiqni server Toshkent vaqti (UTC+5, yozgi vaqt yo'q) bo'yicha hisoblaydi, shunda telefon
// soati yoki mintaqasi noto'g'ri bo'lsa ham natija bir xil chiqadi.

const DAY_SHORT = ["Du", "Se", "Chor", "Pay", "Ju", "Sha", "Yak"];
const DAY_WORD = ["dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba", "yakshanba"];
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const fail = (message) => Object.assign(new Error(message), { status: 400 });
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

/** Kelgan jadvalni tekshirib, 7 kunlik tartibli ko'rinishga keltiradi. */
function normalizeWorkHours(input) {
  if (!Array.isArray(input) || input.length !== 7) throw fail("Ish vaqti jadvali 7 kundan iborat bo'lsin");
  const days = input.map((d, i) => {
    if (Number(d?.day) !== i + 1) throw fail("Ish vaqti jadvali noto'g'ri tartibda");
    if (d.closed) return { day: i + 1, closed: true, open: null, close: null };
    if (!TIME_RE.test(d.open) || !TIME_RE.test(d.close)) throw fail(`${DAY_WORD[i]} uchun vaqtni SS:DD ko'rinishida kiriting`);
    if (toMin(d.open) >= toMin(d.close)) throw fail(`${DAY_WORD[i]}: yopilish vaqti ochilishdan keyin bo'lishi kerak`);
    return { day: i + 1, closed: false, open: d.open, close: d.close };
  });
  if (days.every((d) => d.closed)) throw fail("Kamida bitta ish kunini belgilang");
  return days;
}

/** "Du–Ju 09:00–18:00, Sha 09:00–14:00, Yak dam" — ketma-ket bir xil kunlar birlashtiriladi. */
function summarizeWorkHours(days) {
  const parts = [];
  for (let i = 0; i < 7; ) {
    const key = (d) => (d.closed ? "dam" : `${d.open}–${d.close}`);
    let j = i;
    while (j + 1 < 7 && key(days[j + 1]) === key(days[i])) j++;
    const label = i === j ? DAY_SHORT[i] : `${DAY_SHORT[i]}–${DAY_SHORT[j]}`;
    parts.push(days[i].closed ? `${label} dam` : `${label} ${key(days[i])}`);
    i = j + 1;
  }
  return parts.join(", ");
}

const TZ = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Tashkent", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const WEEKDAY_INDEX = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

/** { openNow: true|false|null, note } — jadval yo'q (eski matnli ish vaqti) bo'lsa openNow null. */
function openStatus(days, now = new Date()) {
  if (!Array.isArray(days) || days.length !== 7) return { openNow: null, note: "" };
  const p = Object.fromEntries(TZ.formatToParts(now).map((x) => [x.type, x.value]));
  const dayIdx = WEEKDAY_INDEX[p.weekday];
  const minutes = Number(p.hour) * 60 + Number(p.minute);

  const today = days[dayIdx];
  if (!today.closed && minutes >= toMin(today.open) && minutes < toMin(today.close)) {
    return { openNow: true, note: `Ochiq · ${today.close} gacha` };
  }
  if (!today.closed && minutes < toMin(today.open)) {
    return { openNow: false, note: `Hozir ish vaqti emas · bugun ${today.open} da ochiladi` };
  }
  for (let step = 1; step <= 7; step++) {
    const d = days[(dayIdx + step) % 7];
    if (d.closed) continue;
    const when = step === 1 ? "ertaga" : DAY_WORD[(dayIdx + step) % 7];
    return { openNow: false, note: `Hozir ish vaqti emas · ${when} ${d.open} da ochiladi` };
  }
  return { openNow: false, note: "Hozir ish vaqti emas" };
}

module.exports = { normalizeWorkHours, summarizeWorkHours, openStatus };
