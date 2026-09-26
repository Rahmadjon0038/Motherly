"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageLoader } from "@/components/Spinner";
import { api, errorMessage } from "@/lib/api";
import { fullDate } from "@/lib/format";
import type { Clinic, ClinicRequest } from "@/lib/types";

function ageText(birthDate: string) {
  const b = new Date(birthDate);
  const now = new Date();
  let months = (now.getFullYear() - b.getFullYear()) * 12 + now.getMonth() - b.getMonth();
  if (now.getDate() < b.getDate()) months--;
  if (months < 1) return "1 oydan kichik";
  if (months < 24) return `${months} oy`;
  const rest = months % 12;
  return `${Math.floor(months / 12)} yosh${rest ? ` ${rest} oy` : ""}`;
}

/** "26 sen, 14:05" (24 soatli). */
function whenText(iso: string) {
  const d = new Date(iso);
  const t = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${fullDate(iso).replace(/ \d{4}$/, "")}, ${t}`;
}

export default function RequestsPage() {
  const [clinic, setClinic] = useState<Clinic | null | undefined>(undefined);
  const [items, setItems] = useState<ClinicRequest[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function fetchAll() {
      try {
        const [c, r] = await Promise.all([api<Clinic | null>("/clinic/me"), api<ClinicRequest[]>("/clinic/requests")]);
        if (!active) return;
        setClinic(c);
        setItems(r);
        setError("");
      } catch (e) {
        if (active) setError(errorMessage(e));
      }
    }
    void fetchAll();
    const timer = setInterval(fetchAll, 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  if (clinic === undefined) {
    return error ? (
      <p className="font-semibold text-red-600" role="alert">
        {error}
      </p>
    ) : (
      <PageLoader />
    );
  }

  if (clinic === null || clinic.lat == null) {
    return (
      <div className="rounded-lg bg-brand-light p-6">
        <h1 className="text-xl font-extrabold">Avval klinikangizni tanishtiring</h1>
        <p className="mt-2 text-muted">
          Klinika ma&apos;lumotlarini to&apos;ldirsangiz, u ona va bolalar ilovasidagi &quot;Klinikalar&quot; bo&apos;limida ko&apos;rinadi va onalarning
          murojaatlari shu yerda keladi.
        </p>
        <Link href="/clinic" className="btn-primary mt-4">
          Ma&apos;lumotlarni kiritish
        </Link>
      </div>
    );
  }

  const shown = items;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Murojaatlar</h1>
        <p className="text-sm text-muted">Ilova orqali klinikangizga murojaat qilgan onalar. Ular bilan telefon orqali bog&apos;laning. So&apos;nggi 30 kun.</p>
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
          {error}
        </p>
      )}

      {shown.length === 0 && (
        <p className="rounded-lg border border-dashed border-line py-12 text-center text-muted">
          Hozircha murojaat yo&apos;q
        </p>
      )}

      <ul className="space-y-3">
        {shown.map((r) => (
          <li key={r.id} className="flex flex-wrap items-start gap-3 rounded-lg border border-line bg-white p-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-extrabold">{r.name}</span>
              </div>
              <p className="text-sm text-muted">{whenText(r.createdAt)}</p>
              {r.phone && (
                <a href={`tel:${r.phone}`} className="mt-1 inline-block font-mono text-lg font-bold text-brand hover:underline">
                  {r.phone}
                </a>
              )}
              {r.children.length > 0 && (
                <div className="mt-2 rounded-md bg-surface px-3 py-2 text-sm">
                  {r.children.map((k) => (
                    <p key={k.name + k.birthDate}>
                      <b>{k.name}</b> · {ageText(k.birthDate)}
                      {k.allergies ? ` · allergiya: ${k.allergies}` : ""}
                      {k.medicalNotes ? ` · ${k.medicalNotes}` : ""}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
