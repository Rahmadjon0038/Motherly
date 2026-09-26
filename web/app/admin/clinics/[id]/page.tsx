"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DeleteClinicDialog, EditClinicDialog } from "@/components/ClinicDialogs";
import { CredentialsDialog } from "@/components/CredentialsDialog";
import { api, errorMessage, fileUrl } from "@/lib/api";
import { DAY_NAMES, fullDate, num } from "@/lib/format";
import type { AdminClinicDetail } from "@/lib/types";
import { PageLoader } from "@/components/Spinner";

export default function ClinicDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [dialog, setDialog] = useState<"edit" | "delete" | "credentials" | null>(null);
  const [clinic, setClinic] = useState<AdminClinicDetail | null>(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [lightbox, setLightbox] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const c = await api<AdminClinicDetail>(`/admin/clinics/${id}`);
        if (active) setClinic(c);
      } catch (e) {
        if (active) setError(errorMessage(e));
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [id, reloadKey]);

  if (!clinic) {
    return (
      <div className="space-y-3">
        <BackLink />
        {error ? (
          <p className="font-semibold text-red-600" role="alert">
            {error}
          </p>
        ) : (
          <PageLoader />
        )}
      </div>
    );
  }

  const hasCoords = clinic.lat != null && clinic.lng != null;

  return (
    <div className="space-y-4">
      <BackLink />

      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-extrabold">{clinic.name}</h1>
            <span
              className={`rounded px-2 py-0.5 text-xs font-extrabold ${
                clinic.complete ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
              }`}
            >
              {clinic.complete ? "To'ldirilgan" : "To'ldirilmagan"}
            </span>
            {clinic.openNow !== null && (
              <span
                className={`rounded px-2 py-0.5 text-xs font-extrabold ${
                  clinic.openNow ? "bg-blue-100 text-brand" : "bg-slate-100 text-muted"
                }`}
              >
                {clinic.openNow ? "Hozir ochiq" : "Hozir yopiq"}
              </span>
            )}
          </div>
          <p className="text-sm text-muted">Qo&apos;shilgan: {fullDate(clinic.createdAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setDialog("edit")} className="btn-ghost">
            Tahrirlash
          </button>
          <button onClick={() => setDialog("credentials")} className="btn-ghost">
            Login va parol
          </button>
          <button onClick={() => setDialog("delete")} className="btn-ghost text-red-600 hover:bg-red-50">
            O&apos;chirish
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
          {error}
        </p>
      )}

      {!clinic.complete && (
        <p className="rounded-md bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
          Klinika hali ma&apos;lumotlarini to&apos;ldirmagan, shuning uchun onalar ilovasida ko&apos;rinmaydi.
        </p>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card title={`Rasmlar (${clinic.photos.length})`}>
            {clinic.photos.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">Rasm yuklanmagan</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {clinic.photos.map((p, i) => (
                  <button
                    key={p.id}
                    onClick={() => setLightbox(i)}
                    aria-label={`${i + 1}-rasmni kattalashtirish`}
                    className={`overflow-hidden rounded-md border border-line bg-surface ${
                      i === 0 ? "col-span-2 row-span-2 sm:col-span-2" : ""
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={fileUrl(p.url)}
                      alt={`${clinic.name}, ${i + 1}-rasm`}
                      className={`size-full object-cover ${i === 0 ? "aspect-[4/3]" : "aspect-square"}`}
                    />
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card title="Ma'lumotlar">
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[9rem_minmax(0,1fr)]">
              <Row label="Manzil" value={clinic.address} />
              <Row label="Asosiy telefon" value={clinic.phone} />
              {clinic.extraPhones.map((p, i) => (
                <Row key={i} label={p.label || "Qo'shimcha"} value={p.number} />
              ))}
              <Row label="Login" value={clinic.username} mono />
              <Row label="Haqida" value={clinic.about} />
              <Row label="Xizmatlar" value={clinic.services} />
              <Row
                label="Murojaatlar"
                value={`Bu oyda platforma orqali jami ${num(clinic.requestsThisMonth)} ta, so'nggi 30 kunda ${num(clinic.requestsLast30d)} ta odam klinikaga murojaat qilgan`}
              />
            </dl>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Joylashuv">
            {hasCoords ? (
              <>
                <MapEmbed lat={clinic.lat!} lng={clinic.lng!} />
                <a
                  href={clinic.mapUrl && /^https?:\/\//i.test(clinic.mapUrl) ? clinic.mapUrl : `https://www.google.com/maps/search/?api=1&query=${clinic.lat},${clinic.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-ghost"
                >
                  Ochish
                </a>
              </>
            ) : (
              <p className="py-8 text-center text-sm text-muted">Joylashuv kiritilmagan</p>
            )}
          </Card>

          <Card title="Ish vaqti">
            {clinic.workHours ? (
              <ul className="divide-y divide-line text-sm">
                {clinic.workHours.map((d, i) => (
                  <li key={d.day} className="flex justify-between py-1.5">
                    <span>{DAY_NAMES[i]}</span>
                    <span className={d.closed ? "text-muted" : "font-semibold"}>
                      {d.closed ? "Dam olish" : `${d.open}–${d.close}`}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm">{clinic.hours || <span className="text-muted">Kiritilmagan</span>}</p>
            )}
          </Card>
        </div>
      </div>

      {dialog === "credentials" && (
        <CredentialsDialog
          clinic={clinic}
          onClose={() => setDialog(null)}
          onChanged={() => setReloadKey((k) => k + 1)}
        />
      )}
      {dialog === "edit" && (
        <EditClinicDialog clinic={clinic} onClose={() => setDialog(null)} onSaved={() => setReloadKey((k) => k + 1)} />
      )}
      {dialog === "delete" && (
        <DeleteClinicDialog clinic={clinic} onClose={() => setDialog(null)} onDeleted={() => router.replace("/admin")} />
      )}

      {lightbox !== null && (
        <Lightbox
          photos={clinic.photos.map((p) => fileUrl(p.url))}
          index={lightbox}
          onIndex={setLightbox}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/admin" className="inline-block text-sm font-bold text-brand hover:underline">
      ← Klinikalar
    </Link>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border border-line bg-white p-4">
      <h2 className="font-extrabold">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <>
      <dt className="font-bold text-muted">{label}</dt>
      <dd className={`min-w-0 break-words whitespace-pre-line ${mono ? "font-mono" : ""}`}>
        {value || <span className="text-muted">Kiritilmagan</span>}
      </dd>
    </>
  );
}

/** Haqiqiy xarita (OpenStreetMap) va klinika joylashgan nuqta. */
function MapEmbed({ lat, lng }: { lat: number; lng: number }) {
  const d = 0.004;
  return (
    <iframe
      title="Klinika joylashuvi xaritada"
      loading="lazy"
      className="h-80 w-full rounded-md border border-line"
      src={`https://www.openstreetmap.org/export/embed.html?bbox=${lng - d},${lat - d},${lng + d},${lat + d}&layer=mapnik&marker=${lat},${lng}`}
    />
  );
}

function Lightbox({
  photos,
  index,
  onIndex,
  onClose,
}: {
  photos: string[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const last = photos.length - 1;
  const go = (delta: number) => onIndex(index + delta < 0 ? last : index + delta > last ? 0 : index + delta);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onIndex(index >= last ? 0 : index + 1);
      if (e.key === "ArrowLeft") onIndex(index <= 0 ? last : index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, last, onIndex, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Rasm"
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/85 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photos[index]} alt="" className="max-h-[88vh] max-w-full rounded-md object-contain" />
      <button onClick={onClose} aria-label="Yopish" className="absolute top-4 right-4 rounded-md bg-white/90 px-3 py-1.5 font-bold">
        ✕
      </button>
      {photos.length > 1 && (
        <>
          <button onClick={() => go(-1)} aria-label="Oldingi rasm" className="absolute left-4 rounded-md bg-white/90 px-3 py-2 text-xl font-bold">
            ‹
          </button>
          <button onClick={() => go(1)} aria-label="Keyingi rasm" className="absolute right-4 rounded-md bg-white/90 px-3 py-2 text-xl font-bold">
            ›
          </button>
          <span className="absolute bottom-4 rounded-md bg-black/60 px-3 py-1 text-sm font-bold text-white">
            {index + 1} / {photos.length}
          </span>
        </>
      )}
    </div>
  );
}
