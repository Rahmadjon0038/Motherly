"use client";

/** "0930", "9", "9:3" kabi kiritilgan matnni "09:30" ko'rinishiga keltiradi (24 soatli, AM/PM yo'q). */
function format(raw: string): string {
  let digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length === 1 && digits > "2") digits = `0${digits}`; // "9" -> "09"
  if (digits.length >= 2) {
    const hour = Math.min(23, parseInt(digits.slice(0, 2), 10));
    digits = String(hour).padStart(2, "0") + digits.slice(2);
  }
  if (digits.length === 4) {
    const min = Math.min(59, parseInt(digits.slice(2), 10));
    digits = digits.slice(0, 2) + String(min).padStart(2, "0");
  }
  return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
}

/**
 * 24 soatli vaqt maydoni. Brauzerning `type="time"` maydoni AM/PM ni tizim tiliga qarab ko'rsatadi,
 * o'zbek foydalanuvchilar uchun esa "09:00", "18:30" ko'rinishi kerak.
 */
export function TimeInput({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(format(e.target.value))}
      inputMode="numeric"
      autoComplete="off"
      placeholder="09:00"
      maxLength={5}
      pattern="([01]\d|2[0-3]):[0-5]\d"
      title="24 soatli vaqt, masalan 09:00 yoki 18:30"
      aria-label={label}
      required
      className="input w-24 py-2 text-center font-mono tabular-nums"
    />
  );
}
