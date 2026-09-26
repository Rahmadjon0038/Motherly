"use client";

import { useEffect, useRef, useState } from "react";
import { api, errorMessage, fileUrl } from "@/lib/api";
import type { Clinic, ClinicPhoto, ExtraPhone, StaffMember, WorkDay } from "@/lib/types";
import { PageLoader } from "@/components/Spinner";
import { TimeInput } from "@/components/TimeInput";

interface FormState {
  name: string;
  address: string;
  about: string;
  services: string;
  mapUrl: string;
}

const empty: FormState = { name: "", address: "", about: "", services: "", mapUrl: "" };
const MAX_EXTRA_PHONES = 10;

/** "+998 97 212 00 99" -> "972120099" (9 ta raqam). O'zbekiston raqami bo'lmasa null. */
function mainDigits(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("998")) return d.slice(3);
  return d.length === 9 ? d : null;
}

const DAY_NAMES = ["Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba", "Yakshanba"];
const week = (open: string, close: string, workDays: number): WorkDay[] =>
  DAY_NAMES.map((_, i) => ({ day: i + 1, closed: i >= workDays, open: i < workDays ? open : null, close: i < workDays ? close : null }));
const closedWeek = () => week("", "", 0);
const MAX_PHOTO_MB = 5;
const MAX_PHOTOS = 10;

export default function ClinicInfoPage() {
  const [loaded, setLoaded] = useState(false);
  const [isNew, setIsNew] = useState(true);
  const [form, setForm] = useState<FormState>(empty);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [phoneDigits, setPhoneDigits] = useState("");
  const [extraPhones, setExtraPhones] = useState<ExtraPhone[]>([]);
  const [workHours, setWorkHours] = useState<WorkDay[]>(closedWeek);
  const [legacyHours, setLegacyHours] = useState(""); // jadvalgacha kiritilgan eski matnli ish vaqti
  // Rasmlar: saqlanganlar (photo) va hali yuklanmaganlar (file) bitta ro'yxatda, sudrab tartiblanadi.
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [savedMapUrl, setSavedMapUrl] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  // Oxirgi tekshirilgan havola va natija (havola o'zgarsa eski natija ko'rsatilmaydi).
  const [check, setCheck] = useState<{ url: string; ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  function apply(c: Clinic) {
    setForm({
      name: c.name,
      address: c.address,
      about: c.about,
      services: c.services,
      mapUrl: c.mapUrl ?? "",
    });
    // Eski formatdagi (o'zbek raqami bo'lmagan) asosiy raqam yo'qolmasin: qo'shimcha raqamga ko'chiriladi.
    const main = c.phone ? mainDigits(c.phone) : "";
    setPhoneDigits(main ?? "");
    setExtraPhones([...(main === null ? [{ label: "", number: c.phone }] : []), ...c.extraPhones]);
    setWorkHours(c.workHours ?? closedWeek());
    setLegacyHours(c.workHours ? "" : c.hours);
    setSavedMapUrl(c.mapUrl ?? "");
    setCoords(c.lat != null && c.lng != null ? { lat: c.lat, lng: c.lng } : null);
    setStaff(c.staff);
    // Hali yuklanmagan rasmlar bo'lsa (saqlash paytida), ularni yo'qotmaymiz.
    setGallery((old) => (old.some((i) => i.file) ? old : c.photos.map(savedItem)));
  }

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const c = await api<Clinic | null>("/clinic/me");
        if (!active) return;
        if (c) {
          apply(c);
          setIsNew(c.lat == null); // admin yaratgan, hali to'ldirilmagan klinika
        }
      } catch (e) {
        if (active) setMessage({ text: errorMessage(e), ok: false });
      } finally {
        if (active) setLoaded(true);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  // Tanlangan rasmlarning vaqtinchalik ko'rinishi sahifadan chiqqanda xotiradan bo'shatiladi.
  const galleryRef = useRef<GalleryItem[]>([]);
  useEffect(() => {
    galleryRef.current = gallery;
  }, [gallery]);
  useEffect(() => {
    return () => galleryRef.current.forEach((i) => i.preview && URL.revokeObjectURL(i.preview));
  }, []);

  // Havola joylashtirilgach (yoki o'zgargach) server koordinatani aniqlaydi va xaritada ko'rsatadi.
  const mapUrl = form.mapUrl.trim();
  useEffect(() => {
    if (!mapUrl || mapUrl === savedMapUrl) return;
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const c = await api<{ lat: number; lng: number }>("/clinic/resolve-location", {
          method: "POST",
          body: { url: mapUrl },
        });
        if (!active) return;
        setCoords(c);
        setCheck({ url: mapUrl, ok: true, text: "Joylashuv aniqlandi" });
      } catch (e) {
        if (active) setCheck({ url: mapUrl, ok: false, text: errorMessage(e) });
      }
    }, 600);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [mapUrl, savedMapUrl]);

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function pickPhotos(files: FileList | null) {
    if (!files?.length) return;
    const room = MAX_PHOTOS - gallery.length;
    const picked: File[] = [];
    for (const file of Array.from(files)) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return setMessage({ text: "Faqat JPG, PNG yoki WebP rasm", ok: false });
      if (file.size > MAX_PHOTO_MB * 1024 * 1024) {
        return setMessage({ text: `"${file.name}" ${MAX_PHOTO_MB} MB dan katta`, ok: false });
      }
      picked.push(file);
    }
    if (picked.length > room) {
      setMessage({ text: `Eng ko'pi bilan ${MAX_PHOTOS} ta rasm. Yana ${Math.max(room, 0)} ta qo'sha olasiz`, ok: false });
      if (room <= 0) return;
    } else {
      setMessage(null);
    }
    const items = picked.slice(0, Math.max(room, 0)).map(newItem);
    setGallery((list) => [...list, ...items]);
  }

  async function removeItem(item: GalleryItem) {
    if (item.file) {
      if (item.preview) URL.revokeObjectURL(item.preview);
      return setGallery((list) => list.filter((i) => i.key !== item.key));
    }
    try {
      await api(`/clinic/me/photos/${item.photo!.id}`, { method: "DELETE" });
      setGallery((list) => list.filter((i) => i.key !== item.key));
    } catch (e) {
      setMessage({ text: errorMessage(e), ok: false });
    }
  }

  // Rasmni boshqa joyga ko'chirish. Hammasi saqlangan bo'lsa tartib darhol saqlanadi, aks holda "Saqlash" bilan.
  async function moveItem(from: number, to: number) {
    if (from === to || to < 0 || to >= gallery.length) return;
    const next = [...gallery];
    next.splice(to, 0, next.splice(from, 1)[0]);
    setGallery(next);
    if (next.every((i) => i.photo)) {
      try {
        setGallery((await api<ClinicPhoto[]>("/clinic/me/photos/order", { method: "PUT", body: { ids: next.map((i) => i.photo!.id) } })).map(savedItem));
      } catch (e) {
        setGallery(gallery);
        setMessage({ text: errorMessage(e), ok: false });
      }
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (phoneDigits && phoneDigits.length !== 9) return setMessage({ text: "Asosiy telefon 9 ta raqamdan iborat bo'lsin", ok: false });
    setBusy(true);
    setMessage(null);
    try {
      const saved = await api<Clinic>("/clinic/me", { method: "PUT", body: { ...form, phone: phoneDigits ? `+998${phoneDigits}` : "", extraPhones, workHours, staff },
      });
      apply(saved);
      setIsNew(false);
      if (gallery.some((i) => i.file)) {
        try {
          const before = new Set(gallery.filter((i) => i.photo).map((i) => i.photo!.id));
          const fd = new FormData();
          gallery.filter((i) => i.file).forEach((i) => fd.append("photos", i.file!));
          const all = await api<ClinicPhoto[]>("/clinic/me/photos", { method: "POST", form: fd });
          // Yangi rasmlar yuklangan tartibda oxirida turadi. Ularni sudralgan joyiga qo'yamiz.
          const created = all.filter((p) => !before.has(p.id));
          let k = 0;
          const finalIds = gallery.map((i) => (i.photo ? i.photo.id : created[k++].id));
          gallery.forEach((i) => i.preview && URL.revokeObjectURL(i.preview));
          const ordered = await api<ClinicPhoto[]>("/clinic/me/photos/order", { method: "PUT", body: { ids: finalIds } });
          setGallery(ordered.map(savedItem));
        } catch (err) {
          return setMessage({ text: `Ma'lumotlar saqlandi, lekin rasmlar yuklanmadi: ${errorMessage(err)}`, ok: false });
        }
      }
      setMessage({ text: "Saqlandi", ok: true });
    } catch (err) {
      setMessage({ text: errorMessage(err), ok: false });
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return <PageLoader />;

  const changed = mapUrl !== "" && mapUrl !== savedMapUrl;
  const status = !changed ? null : check?.url === mapUrl ? check : { url: mapUrl, ok: true, text: "Tekshirilmoqda…", pending: true };
  const showMap = coords !== null && (!changed || (check?.url === mapUrl && check.ok));
  const d = 0.005;

  const steps = [
    { label: "Klinika nomi va manzil", done: !!form.name.trim() && !!form.address.trim() },
    { label: "Ish vaqti jadvali", done: workHours.some((d) => !d.closed) },
    { label: "Xarita joylashuvi", done: coords !== null },
    { label: "Kamida bitta rasm", done: gallery.length > 0 },
    { label: "Kamida bitta shifokor", done: staff.some((x) => x.name.trim()) },
  ];
  const doneCount = steps.filter((x) => x.done).length;

  return (
    <form onSubmit={save} className="space-y-5">
      <div className={`rounded-lg p-5 ${doneCount === steps.length ? "bg-emerald-50" : "bg-brand-light"}`}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-extrabold">
            {doneCount === steps.length ? "Hammasi tayyor" : "Klinikangizni to'ldiring"}
          </h2>
          <span className="text-sm font-bold text-muted">
            {doneCount}/{steps.length}
          </span>
        </div>
        <ul className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
          {steps.map((x) => (
            <li key={x.label} className={x.done ? "font-semibold text-emerald-700" : "text-muted"}>
              {x.done ? "✓" : "○"} {x.label}
            </li>
          ))}
        </ul>
        {isNew && (
          <p className="mt-3 text-sm">
            «Saqlash» bosilgach klinika ona va bolalar ilovasidagi &quot;Yaqin klinikalar&quot; bo&apos;limida
            ko&apos;rinadi, onalarning murojaatlari esa shu saytda keladi.
          </p>
        )}
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <div className="space-y-5">
      <Card title="Asosiy ma'lumotlar">
        <Field label="Klinika nomi *">
          <input value={form.name} onChange={set("name")} className="input" required />
        </Field>
        <Field label="Manzil *">
          <input value={form.address} onChange={set("address")} className="input" required />
        </Field>
        <Field label="Klinika haqida">
          <textarea value={form.about} onChange={set("about")} rows={3} className="input" />
        </Field>
        <Field label="Xizmatlar">
          <textarea
            value={form.services}
            onChange={set("services")}
            rows={3}
            placeholder="Masalan: pediatr ko'rigi, emlash, UZI, tahlillar"
            className="input"
          />
        </Field>
      </Card>

      <Card title="Telefon raqamlar">
        <p className="-mt-2 text-sm text-muted">Onalar ilovasida klinika sahifasida ko&apos;rinadi va bosib qo&apos;ng&apos;iroq qilinadi.</p>
        <Field label="Asosiy telefon">
          <div className="input flex items-center gap-2 py-0 focus-within:border-brand">
            <span className="font-semibold whitespace-nowrap">+998</span>
            <input
              value={phoneDigits}
              onChange={(e) => setPhoneDigits(e.target.value.replace(/\D/g, "").slice(0, 9))}
              inputMode="numeric"
              placeholder="90 123 45 67"
              aria-label="Asosiy telefon, +998 dan keyingi 9 ta raqam"
              className="w-full bg-transparent py-3 outline-none"
            />
          </div>
        </Field>
        {extraPhones.length > 0 && (
          <div className="space-y-2">
            <span className="block text-sm font-bold text-muted">Qo&apos;shimcha raqamlar</span>
            {extraPhones.map((p, i) => {
              const update = (patch: Partial<ExtraPhone>) =>
                setExtraPhones((list) => list.map((x, j) => (j === i ? { ...x, ...patch } : x)));
              return (
                <div key={i} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto]">
                  <input
                    value={p.label}
                    onChange={(e) => update({ label: e.target.value })}
                    maxLength={60}
                    placeholder="Izoh: Qabulxona, Shifokor, Ambulatoriya…"
                    aria-label="Izoh"
                    className="input"
                  />
                  <input
                    value={p.number}
                    onChange={(e) => update({ number: e.target.value })}
                    maxLength={40}
                    placeholder="+998 90 123 45 67"
                    aria-label="Telefon raqam"
                    className="input"
                  />
                  <button
                    type="button"
                    onClick={() => setExtraPhones((list) => list.filter((_, j) => j !== i))}
                    aria-label="Raqamni o'chirish"
                    className="rounded-md px-3 font-bold text-red-600 hover:bg-red-50"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {extraPhones.length < MAX_EXTRA_PHONES && (
          <button type="button" onClick={() => setExtraPhones((list) => [...list, { label: "", number: "" }])} className="btn-ghost">
            + Qo&apos;shimcha raqam
          </button>
        )}
      </Card>

      <Card title="Ish vaqti *">
        <p className="-mt-2 text-sm text-muted">
          Ish vaqti tugagach klinika onalar ilovasida kulrang bo&apos;lib, &quot;Hozir ish vaqti emas&quot; deb ko&apos;rinadi.
        </p>
        {legacyHours && (
          <p className="rounded-md bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
            Oldingi ish vaqtingiz: {legacyHours}. Uni jadval bilan almashtiring.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setWorkHours(week("09:00", "18:00", 5))} className="chip">
            Du–Ju 09:00–18:00
          </button>
          <button type="button" onClick={() => setWorkHours(week("09:00", "18:00", 6))} className="chip">
            Du–Sha 09:00–18:00
          </button>
          <button type="button" onClick={() => setWorkHours(week("08:00", "20:00", 7))} className="chip">
            Har kuni 08:00–20:00
          </button>
        </div>
        <div className="divide-y divide-line rounded-md border border-line">
          {workHours.map((d, i) => {
            const update = (patch: Partial<WorkDay>) =>
              setWorkHours((list) => list.map((x, j) => (j === i ? { ...x, ...patch } : x)));
            return (
              <div key={d.day} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <label className="flex w-40 cursor-pointer items-center gap-2 font-semibold">
                  <input
                    type="checkbox"
                    checked={!d.closed}
                    onChange={(e) =>
                      update(e.target.checked ? { closed: false, open: "09:00", close: "18:00" } : { closed: true, open: null, close: null })
                    }
                    className="size-4 accent-brand"
                  />
                  {DAY_NAMES[i]}
                </label>
                {d.closed ? (
                  <span className="text-sm text-muted">Dam olish kuni</span>
                ) : (
                  <div className="flex items-center gap-2">
                    <TimeInput
                      value={d.open ?? ""}
                      onChange={(v) => update({ open: v })}
                      label={`${DAY_NAMES[i]} ochilish vaqti`}
                    />
                    <span className="text-muted">–</span>
                    <TimeInput
                      value={d.close ?? ""}
                      onChange={(v) => update({ close: v })}
                      label={`${DAY_NAMES[i]} yopilish vaqti`}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="Joylashuv *">
        <Field label="Xarita havolasi">
          <input
            type="url"
            value={form.mapUrl}
            onChange={set("mapUrl")}
            placeholder="https://maps.app.goo.gl/…"
            className="input"
            required={isNew}
          />
        </Field>
        <p className="text-sm text-muted">
          Google Maps yoki Yandex Maps da klinikangizni toping → «Ulashish» → havolani nusxalab shu yerga
          joylashtiring. Koordinata avtomatik aniqlanadi.
        </p>
        {status && (
          <p
            role="status"
            className={`text-sm font-semibold ${"pending" in status ? "text-muted" : status.ok ? "text-emerald-600" : "text-red-600"}`}
          >
            {status.ok && !("pending" in status) ? "✓ " : ""}
            {status.text}
          </p>
        )}
        {showMap && coords && (
          <iframe
            title="Xarita"
            className="h-64 w-full rounded-md border border-line"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${coords.lng - d},${coords.lat - d},${coords.lng + d},${coords.lat + d}&layer=mapnik&marker=${coords.lat},${coords.lng}`}
          />
        )}
      </Card>

        </div>
        <div className="space-y-5">
      <Card title={`Klinika rasmlari (${gallery.length}/${MAX_PHOTOS})`}>
        <div role="list" aria-label="Klinika rasmlari" className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {gallery.map((item, i) => (
            <Thumb
              key={item.key}
              src={item.preview ?? fileUrl(item.photo!.url)}
              cover={i === 0}
              position={i + 1}
              dragging={dragFrom === i}
              over={dragFrom !== null && dragOver === i && dragFrom !== i}
              onRemove={() => removeItem(item)}
              onDragStart={(e) => {
                setDragFrom(i);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", String(i));
              }}
              onDragOver={(e) => {
                if (dragFrom === null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDragOver(i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFrom !== null) void moveItem(dragFrom, i);
                setDragFrom(null);
                setDragOver(null);
              }}
              onDragEnd={() => {
                setDragFrom(null);
                setDragOver(null);
              }}
              onKeyMove={(delta) => void moveItem(i, i + delta)}
            />
          ))}
          {gallery.length < MAX_PHOTOS && (
            <label className="grid aspect-[4/3] cursor-pointer place-items-center rounded-md border-[1.4px] border-dashed border-line bg-surface text-center text-sm font-bold text-brand hover:bg-brand-light">
              <span>
                <span className="block text-2xl leading-none">+</span>
                Rasm qo&apos;shish
              </span>
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  pickPhotos(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>
        <p className="text-sm text-muted">
          {MAX_PHOTOS} tagacha rasm, JPG, PNG yoki WebP, {MAX_PHOTO_MB} MB gacha. Rasmni sudrab joyini almashtirasiz,
          birinchisi asosiy bo&apos;ladi. {gallery.some((i) => i.file) && "Yangi rasmlar «Saqlash» bosilganda yuklanadi."}
        </p>
      </Card>

      <Card title="Shifokorlar">
        <p className="-mt-2 text-sm text-muted">
          Shu yerga yozilganlar ona ilovasida klinika sahifasida ko&apos;rinadi. Ona shifokorni tanlab qabulga
          yoziladi.
        </p>
        {staff.length === 0 && (
          <p className="rounded-md border border-dashed border-line py-6 text-center text-sm text-muted">
            Hali hech kim qo&apos;shilmagan
          </p>
        )}
        {staff.map((s, i) => {
          const update = (patch: Partial<StaffMember>) =>
            setStaff((list) => list.map((x, j) => (j === i ? { ...x, ...patch } : x)));
          return (
            <div key={s.id ?? `new-${i}`} className="space-y-3 rounded-md border border-line bg-surface p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-extrabold text-muted">#{i + 1}</span>
                <button
                  type="button"
                  onClick={() => setStaff((list) => list.filter((_, j) => j !== i))}
                  className="rounded-md px-3 py-1 text-sm font-bold text-red-600 hover:bg-red-50"
                >
                  O&apos;chirish
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Ism familiya *">
                  <input value={s.name} onChange={(e) => update({ name: e.target.value })} className="input" />
                </Field>
                <Field label="Mutaxassisligi *">
                  <input
                    value={s.position}
                    onChange={(e) => update({ position: e.target.value })}
                    placeholder="Pediatr, nevrolog, UZI shifokori…"
                    className="input"
                  />
                </Field>
                <Field label="Tajribasi (yil)">
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={s.experience ?? ""}
                    onChange={(e) => update({ experience: e.target.value === "" ? null : Number(e.target.value) })}
                    className="input"
                  />
                </Field>
                <Field label="Ish vaqti *">
                  <input
                    value={s.schedule}
                    onChange={(e) => update({ schedule: e.target.value })}
                    placeholder="Du–Ju 09:00–15:00"
                    className="input"
                  />
                </Field>
              </div>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => setStaff((list) => [...list, { name: "", position: "", schedule: "", experience: null }])}
          className="rounded-md border-[1.4px] border-line px-5 py-2.5 text-sm font-bold text-brand hover:bg-brand-light"
        >
          + Shifokor qo&apos;shish
        </button>
      </Card>

        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          disabled={busy}
          className="rounded-md bg-gradient-to-r from-[#4aa3ff] to-brand-dark px-8 py-3.5 text-lg font-bold text-white shadow-lg shadow-brand/30 hover:brightness-105 disabled:opacity-50"
        >
          {busy ? "Saqlanmoqda…" : "Saqlash"}
        </button>
        {message && (
          <span role="status" className={`font-semibold ${message.ok ? "text-emerald-600" : "text-red-600"}`}>
            {message.text}
          </span>
        )}
      </div>
    </form>
  );
}

interface GalleryItem {
  key: string;
  photo?: ClinicPhoto; // serverda saqlangan
  file?: File; // hali yuklanmagan
  preview?: string;
}

const savedItem = (photo: ClinicPhoto): GalleryItem => ({ key: `p${photo.id}`, photo });
let newKey = 0;
const newItem = (file: File): GalleryItem => ({ key: `n${newKey++}`, file, preview: URL.createObjectURL(file) });

function Thumb({
  src,
  cover,
  position,
  dragging,
  over,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onKeyMove,
}: {
  src: string;
  cover: boolean;
  position: number;
  dragging: boolean;
  over: boolean;
  onRemove: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onKeyMove: (delta: number) => void;
}) {
  return (
    <div
      draggable
      tabIndex={0}
      role="listitem"
      aria-label={`${position}-rasm. Joyini almashtirish uchun Alt bilan chap yoki o'ng strelka`}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onKeyDown={(e) => {
        if (!e.altKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
        e.preventDefault();
        onKeyMove(e.key === "ArrowLeft" ? -1 : 1);
      }}
      className={`group relative aspect-[4/3] cursor-grab overflow-hidden rounded-md border bg-surface outline-none transition active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-brand ${
        over ? "border-brand ring-2 ring-brand" : "border-line"
      } ${dragging ? "opacity-40" : ""}`}
    >
      {/* Backend'dagi rasm — next/image domenlarini sozlamaslik uchun oddiy <img>. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="Klinika rasmi" draggable={false} className="pointer-events-none size-full object-cover select-none" />
      {cover && (
        <span className="absolute top-2 left-2 rounded-md bg-brand px-2.5 py-0.5 text-xs font-extrabold text-white">
          Asosiy
        </span>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Rasmni o'chirish"
        className="absolute top-2 right-2 grid size-8 cursor-pointer place-items-center rounded-md bg-white/90 font-bold text-red-600 shadow hover:bg-white"
      >
        ✕
      </button>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-lg border border-line bg-white p-5">
      <h2 className="text-lg font-extrabold">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-bold text-muted">{label}</span>
      {children}
    </label>
  );
}
