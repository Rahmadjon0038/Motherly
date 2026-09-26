export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5100";

const TOKEN_KEY = "pedai_clinic_token";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export const getToken = () => (typeof window === "undefined" ? null : localStorage.getItem(TOKEN_KEY));
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

/** Serverdagi fayl (masalan klinika rasmi) uchun to'liq manzil. */
export const fileUrl = (path: string) => `${API_URL}${path}`;

interface Options {
  method?: string;
  body?: unknown;
  form?: FormData;
}

export async function api<T>(path: string, { method = "GET", body, form }: Options = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method,
      headers,
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError("Internetga ulanib bo'lmadi. Aloqani tekshirib, qayta urinib ko'ring.", 0);
  }

  const data = await res.json().catch(() => null);
  if (res.status >= 500) throw new ApiError("Hozir xizmat vaqtincha ishlamayapti. Birozdan keyin qayta urinib ko'ring.", res.status);
  if (!res.ok) throw new ApiError(data?.message ?? "Nimadir xato ketdi. Qayta urinib ko'ring.", res.status);
  return data as T;
}

/** Katta fayl yuborish: yuklanish foizini ko'rsatish uchun fetch o'rniga XMLHttpRequest. */
export function uploadWithProgress<T>(path: string, method: "POST" | "PUT", form: FormData, onProgress: (pct: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, `${API_URL}/api${path}`);
    const token = getToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onerror = () => reject(new ApiError("Internetga ulanib bo'lmadi. Aloqani tekshirib, qayta urinib ko'ring.", 0));
    xhr.onload = () => {
      let data: { message?: string } | null = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as T);
      else reject(new ApiError(xhr.status >= 500 ? "Hozir xizmat vaqtincha ishlamayapti. Birozdan keyin qayta urinib ko'ring." : (data?.message ?? "Nimadir xato ketdi. Qayta urinib ko'ring."), xhr.status));
    };
    xhr.send(form);
  });
}

export const errorMessage = (e: unknown) => (e instanceof ApiError ? e.message : "Nimadir xato ketdi. Qayta urinib ko'ring.");

/** Himoyalangan faylni (masalan hujjatni) token bilan olib, brauzerda yangi oynada ochadi. */
export async function openProtectedFile(path: string) {
  const token = getToken();
  const res = await fetch(`${API_URL}/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new ApiError("Faylni ochib bo'lmadi", res.status);
  const url = URL.createObjectURL(await res.blob());
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
