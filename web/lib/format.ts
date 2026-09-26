export const DAY_NAMES = ["Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba", "Yakshanba"];

const MONTHS = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avg", "sen", "okt", "noy", "dek"];

/** "2026-09-25" yoki ISO sana -> "25 sen". */
export function shortDate(value: string) {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return y ? `${d} ${MONTHS[m - 1]}` : value;
}

/** "2026-09-25T10:56Z" -> "25 sen 2026". */
export function fullDate(value: string) {
  return `${shortDate(value)} ${value.slice(0, 4)}`;
}

/** 213 -> "3:33", 3700 -> "1:01:40". */
export function clock(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** 150000 -> "150 000 so'm". */
export const soum = (n: number) => `${Math.round(n).toLocaleString("en-US").replace(/,/g, " ")} so'm`;

export const num = (n: number) => n.toLocaleString("en-US");
