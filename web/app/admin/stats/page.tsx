"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { num, shortDate } from "@/lib/format";
import type { Stats } from "@/lib/types";
import { PageLoader } from "@/components/Spinner";

export default function StatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const s = await api<Stats>("/admin/stats");
        if (active) setStats(s);
      } catch (e) {
        if (active) setError(errorMessage(e));
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  if (!stats) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-extrabold">Statistika</h1>
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

  const { totals, visits } = stats;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Statistika</h1>
        <p className="text-sm text-muted">Sanalar Toshkent vaqti bo&apos;yicha</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Tile label="Klinikalar" value={totals.clinics} note={`${totals.completeClinics} tasi to'ldirilgan`} />
        <Tile label="Onalar" value={totals.mothers} note={`so'nggi 30 kunda +${totals.newMothers30d} · mehmon ${num(totals.guests)}`} />
        <Tile
          label="Mutaxassislar"
          value={totals.consultants}
          note={`e'lon joylaganlar · klinikalar ro'yxatida ${totals.clinicNurses} ta`}
        />
        <Tile label="Bugungi murojaatlar" value={visits.today} note={`jami ${num(totals.visitsTotal)} ta`} />
        <Tile label="So'nggi 7 kun" value={visits.last7d} note="murojaat" />
        <Tile label="So'nggi 30 kun" value={visits.last30d} note="murojaat" />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <DailyChart data={stats.visitsByDay} />
        <TopClinics rows={stats.topClinics} />
      </div>
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-1 text-3xl font-semibold">{num(value)}</div>
      <div className="mt-0.5 text-xs text-muted">{note}</div>
    </div>
  );
}

/** Eng yaqin "yumaloq" chegara: 4, 10, 20, 50, 100 … (o'q yorliqlari toza raqam bo'lsin). */
function niceMax(max: number) {
  if (max <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 4, 5, 10]) if (m * pow >= max) return m * pow;
  return 10 * pow;
}

const LABELED = new Set([0, 6, 12, 18, 24, 29]);

function DailyChart({ data }: { data: Stats["visitsByDay"] }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const max = Math.max(...data.map((d) => d.count));
  const top = niceMax(max);
  const total = data.reduce((a, d) => a + d.count, 0);
  const peak = data.findIndex((d) => d.count === max);

  return (
    <section className="rounded-lg border border-line bg-white p-4">
      <div className="flex items-start gap-3">
        <div className="mr-auto">
          <h2 className="font-extrabold">Murojaatlar</h2>
          <p className="text-sm text-muted">So&apos;nggi 30 kun, har kun uchun · jami {num(total)} ta</p>
        </div>
        <div role="group" aria-label="Ko'rinish" className="flex overflow-hidden rounded-md border border-line text-sm font-bold">
          {(["chart", "table"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={`px-3 py-1.5 ${view === v ? "bg-brand-light text-brand" : "text-muted hover:text-ink"}`}
            >
              {v === "chart" ? "Grafik" : "Jadval"}
            </button>
          ))}
        </div>
      </div>

      {view === "table" ? (
        <div className="mt-3 max-h-80 overflow-auto rounded-md border border-line">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface text-left text-xs text-muted uppercase">
              <tr>
                <th className="px-3 py-2">Sana</th>
                <th className="px-3 py-2 text-right">Yozilishlar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[...data].reverse().map((d) => (
                <tr key={d.day}>
                  <td className="px-3 py-1.5">{shortDate(d.day)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{d.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-6 flex gap-2 pb-6">
          <div className="relative h-56 w-8 flex-none text-right text-xs text-muted tabular-nums" aria-hidden>
            {[top, top / 2, 0].map((t, i) => (
              <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${i * 50}%` }}>
                {Number.isInteger(t) ? t : ""}
              </span>
            ))}
          </div>
          <div className="relative h-56 min-w-0 flex-1">
            {[0, 50, 100].map((p) => (
              <div key={p} className="absolute inset-x-0 border-t border-line" style={{ top: `${p}%` }} />
            ))}
            <div className="absolute inset-0 flex gap-1">
              {data.map((d, i) => {
                const h = d.count === 0 ? 0 : Math.max((d.count / top) * 100, 1.5);
                const edge = i < 3 ? "left-0" : i > data.length - 4 ? "right-0" : "left-1/2 -translate-x-1/2";
                return (
                  <div
                    key={d.day}
                    tabIndex={0}
                    role="img"
                    aria-label={`${shortDate(d.day)}: ${d.count} ta yozilish`}
                    className="group relative flex h-full flex-1 items-end justify-center outline-none"
                  >
                    <div
                      className="w-full max-w-6 rounded-t-[4px] bg-brand group-hover:bg-brand-dark group-focus-visible:bg-brand-dark"
                      style={{ height: `${h}%` }}
                    />
                    {i === peak && max > 0 && (
                      <span
                        className="absolute -translate-y-1 text-xs font-bold tabular-nums"
                        style={{ bottom: `${h}%` }}
                      >
                        {max}
                      </span>
                    )}
                    <div
                      className={`pointer-events-none absolute bottom-full z-10 mb-2 hidden rounded-md bg-ink px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-lg group-hover:block group-focus-visible:block ${edge}`}
                    >
                      <b>{shortDate(d.day)}</b> · {d.count} ta
                    </div>
                    {LABELED.has(i) && (
                      <span className="absolute top-full mt-1.5 -translate-x-1/2 text-xs whitespace-nowrap text-muted" style={{ left: "50%" }} aria-hidden>
                        {shortDate(d.day)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function TopClinics({ rows }: { rows: Stats["topClinics"] }) {
  const max = Math.max(1, ...rows.map((r) => r.visits));
  return (
    <section className="rounded-lg border border-line bg-white p-4">
      <h2 className="font-extrabold">Eng faol klinikalar</h2>
      <p className="text-sm text-muted">So&apos;nggi 30 kundagi yozilishlar soni bo&apos;yicha</p>
      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">Hali yozilish bo&apos;lmagan</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3 text-sm sm:grid-cols-[minmax(0,12rem)_1fr]">
              <Link href={`/admin/clinics/${r.id}`} className="truncate font-semibold hover:text-brand" title={r.name}>
                {r.name}
              </Link>
              <div className="flex items-center gap-2">
                <div
                  className="h-5 rounded-r-[4px] bg-brand"
                  style={{ width: `${(r.visits / max) * 100}%`, minWidth: 4 }}
                  role="img"
                  aria-label={`${r.name}: ${r.visits} ta`}
                />
                <span className="font-bold tabular-nums">{r.visits}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
