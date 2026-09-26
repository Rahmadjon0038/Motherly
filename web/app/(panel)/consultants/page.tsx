"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { NurseCredentialsDialog, randomPassword } from "@/components/NurseCredentialsDialog";
import { PageLoader } from "@/components/Spinner";
import { api, errorMessage } from "@/lib/api";
import { num } from "@/lib/format";
import type { ClinicConsultant } from "@/lib/types";

export default function ConsultantsPage() {
  const [list, setList] = useState<ClinicConsultant[] | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [name, setName] = useState("");
  const [field, setField] = useState("");
  const [digits, setDigits] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [creds, setCreds] = useState<ClinicConsultant | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const rows = await api<ClinicConsultant[]>("/clinic/consultants");
        if (active) setList(rows);
      } catch (e) {
        if (active) setError(errorMessage(e));
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const res = await api<{ linkedExisting: boolean }>("/clinic/consultants", {
        method: "POST",
        body: { name, phone: `+998${digits}`, field, password },
      });
      if (res.linkedExisting) setInfo("Bu hamshira ilovada avvaldan bor. U klinikangizga qo'shildi, paroli o'zgarmadi.");
      setName("");
      setField("");
      setDigits("");
      setPassword("");
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: ClinicConsultant) {
    if (!window.confirm(`${c.name || c.phone} mutaxassislar ro'yxatingizdan chiqarilsinmi? Uning shu klinika nomidan qo'ygan xizmati ham olib tashlanadi.`)) return;
    setError("");
    setInfo("");
    try {
      await api(`/clinic/consultants/${c.id}`, { method: "DELETE" });
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">Mutaxassislar</h1>
        <p className="text-sm text-muted">Ilovada onalarga maslahat beradigan hamshiralar. Ular shu telefon raqam va parol bilan kiradi.</p>
      </div>

      <form onSubmit={add} className="grid gap-3 rounded-lg border border-line bg-white p-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
        <Field label="Ism familiya *">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className="input" required />
        </Field>
        <Field label="Yo'nalishi *">
          <input
            value={field}
            onChange={(e) => setField(e.target.value)}
            maxLength={80}
            placeholder="Laktatsiya, ovqatlanish…"
            className="input"
            required
          />
        </Field>
        <Field label="Telefon *">
          <div className="input flex items-center gap-2 py-0 focus-within:border-brand">
            <span className="font-semibold whitespace-nowrap">+998</span>
            <input
              value={digits}
              onChange={(e) => setDigits(e.target.value.replace(/\D/g, "").slice(0, 9))}
              inputMode="numeric"
              placeholder="90 123 45 67"
              aria-label="Telefon raqam, +998 dan keyingi 9 ta raqam"
              className="w-full bg-transparent py-3 outline-none"
            />
          </div>
        </Field>
        <Field label="Parol *">
          <div className="flex gap-2">
            <input value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" className="input min-w-0 font-mono" />
            <button
              type="button"
              onClick={() => setPassword(randomPassword())}
              className="btn-ghost flex-none px-3"
              title="Tasodifiy parol yaratish"
              aria-label="Tasodifiy parol yaratish"
            >
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 12a9 9 0 1 1-2.64-6.36M21 4v5h-5" />
              </svg>
            </button>
          </div>
        </Field>
        <button disabled={busy || !name.trim() || !field.trim() || digits.length !== 9} className="btn-primary py-3">
          {busy ? "Qo'shilmoqda…" : "+ Qo'shish"}
        </button>
      </form>

      {info && <p role="status" className="rounded-md bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{info}</p>}
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
          {error}
        </p>
      )}

      {list === null && !error && <PageLoader />}
      {list?.length === 0 && (
        <p className="rounded-lg border border-dashed border-line py-12 text-center text-muted">Hali mutaxassis qo&apos;shilmagan</p>
      )}

      {list && list.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line bg-white">
          {list.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/consultants/${c.id}`} className="font-extrabold hover:text-brand hover:underline">{c.name || "Ismi kiritilmagan"}</Link>
                  {c.field && <span className="rounded bg-brand-light px-2 py-0.5 text-xs font-extrabold text-brand">{c.field}</span>}
                  {c.verification === "approved" && (
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-extrabold text-emerald-700">Tasdiqlangan</span>
                  )}
                  {c.verification === "pending" && (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-extrabold text-amber-800">Hujjati tekshirilmoqda</span>
                  )}
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-extrabold ${
                      c.listing ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-muted"
                    }`}
                  >
                    {c.listing ? "Xizmat joylangan" : "Xizmat yo'q"}
                  </span>
                </div>
                <p className="text-sm text-muted">
                  <span className="font-mono">{c.phone}</span>
                  {c.listing && ` · ${c.listing.field} · ${num(c.listing.price)} so'm`}
                </p>
              </div>
              <Link href={`/consultants/${c.id}`} className="btn-ghost">
                Profil
              </Link>
              <button onClick={() => setCreds(c)} className="btn-ghost">
                Login va parol
              </button>
              <button onClick={() => remove(c)} className="btn-ghost text-red-600 hover:bg-red-50">
                Chiqarish
              </button>
            </li>
          ))}
        </ul>
      )}

      {creds && (
        <NurseCredentialsDialog nurse={creds} onClose={() => setCreds(null)} onChanged={() => setReloadKey((k) => k + 1)} />
      )}
    </div>
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
