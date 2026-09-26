"use client";

import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { num, shortDate } from "@/lib/format";
import { PageLoader } from "@/components/Spinner";

type ClinicStats = { today: number; last7d: number; last30d: number; total: number; byDay: { day: string; count: number }[] };

export default function ClinicStatsPage() {
  const [stats, setStats] = useState<ClinicStats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<ClinicStats>("/clinic/stats").then(setStats, (e) => setError(errorMessage(e)));
  }, []);

  if (!stats) {
    return error ? (
      <p className="font-semibold text-red-600" role="alert">
        {error}
      </p>
    ) : (
      <PageLoader />
    );
  }

  const max = Math.max(1, ...stats.byDay.map((d) => d.count));
  const tiles: [string, number][] = [
    ["Bugun", stats.today],
    ["So'nggi 7 kun", stats.last7d],
    ["So'nggi 30 kun", stats.last30d],
    ["Jami", stats.total],
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Statistika</h1>
        <p className="text-sm text-muted">Platforma orqali klinikangizga murojaat qilgan bemorlar soni</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-line bg-white p-4">
            <div className="text-sm text-muted">{label}</div>
            <div className="mt-1 text-3xl font-semibold">{num(value)}</div>
          </div>
        ))}
      </div>

      <section className="rounded-lg border border-line bg-white p-4">
        <h2 className="font-extrabold">Kunlik murojaatlar</h2>
        <p className="text-sm text-muted">So&apos;nggi 30 kun (Toshkent vaqti)</p>
        <div className="mt-6 pb-6">
          <div className="relative flex h-56 gap-1 border-b border-line">
            {stats.byDay.map((d, i) => {
              const h = d.count === 0 ? 0 : Math.max((d.count / max) * 100, 2);
              return (
                <div key={d.day} tabIndex={0} role="img" aria-label={`${shortDate(d.day)}: ${d.count} ta`} className="group relative flex h-full flex-1 items-end justify-center outline-none">
                  <div className="w-full max-w-6 rounded-t-[4px] bg-brand group-hover:bg-brand-dark" style={{ height: `${h}%` }} />
                  <div className="pointer-events-none absolute bottom-full z-10 mb-2 hidden rounded-md bg-ink px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-lg group-hover:block group-focus-visible:block">
                    <b>{shortDate(d.day)}</b> · {d.count} ta
                  </div>
                  {i % 6 === 0 && (
                    <span className="absolute top-full mt-1.5 text-xs whitespace-nowrap text-muted" aria-hidden>
                      {shortDate(d.day)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
