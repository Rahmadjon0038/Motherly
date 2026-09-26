"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/Modal";
import { PageLoader } from "@/components/Spinner";
import { api, errorMessage } from "@/lib/api";

const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const randomPassword = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => ALPHABET[b % ALPHABET.length]).join("");

interface Details {
  phone: string;
  field: string;
  /** Ism va parolni shu klinika boshqaradimi (akkauntni u yaratgan). */
  canManage: boolean;
  password: string | null;
}

/** Mutaxassisning ma'lumotlari: yo'nalish, telefon, parol. Ko'rish, nusxalash va o'zgartirish. */
export function NurseCredentialsDialog({
  nurse,
  onClose,
  onChanged,
}: {
  nurse: { id: number; name: string };
  onClose: () => void;
  onChanged: () => void;
}) {
  const [d, setD] = useState<Details | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [field, setField] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await api<Details>(`/clinic/consultants/${nurse.id}/credentials`);
        if (active) setD(res);
      } catch (e) {
        if (active) setError(errorMessage(e));
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [nurse.id, reloadKey]);

  async function copy() {
    if (!d) return;
    try {
      await navigator.clipboard.writeText(`Telefon: ${d.phone}\nParol: ${d.password ?? ""}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard ruxsati yo'q — matn belgilab olinadi
    }
  }

  function startEdit() {
    if (!d) return;
    setName(nurse.name);
    setField(d.field);
    setPassword(d.password ?? "");
    setError("");
    setEditing(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!d) return;
    setBusy(true);
    setError("");
    try {
      await api(`/clinic/consultants/${nurse.id}`, {
        method: "PUT",
        body: { field, ...(d.canManage ? { name, ...(password ? { password } : {}) } : {}) },
      });
      setEditing(false);
      setReloadKey((k) => k + 1);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal label="Mutaxassis ma'lumotlari" onClose={onClose}>
      <div className="space-y-4">
        <h2 className="text-lg font-extrabold">{nurse.name || "Mutaxassis"}</h2>

        {!d && !error && <PageLoader className="!py-6" />}

        {d && !editing && (
          <>
            <div className="divide-y divide-line rounded-md border border-line">
              <Row label="Yo'nalishi" value={d.field || "Kiritilmagan"} />
              <Row label="Telefon" value={d.phone} mono />
              {d.canManage && (
                <Row label="Parol" value={d.password ?? "Saqlanmagan, yangi parol belgilang"} mono={d.password !== null} muted={d.password === null} />
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {d.canManage && d.password !== null && (
                <button onClick={copy} className="btn-ghost">
                  {copied ? "Nusxalandi ✓" : "Telefon va parolni nusxalash"}
                </button>
              )}
              <button onClick={startEdit} className="btn-primary">
                O&apos;zgartirish
              </button>
            </div>
          </>
        )}

        {d && editing && (
          <form onSubmit={save} className="space-y-3">
            {d.canManage && (
              <Field label="Ism familiya">
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className="input" required />
              </Field>
            )}
            <Field label="Yo'nalishi">
              <input value={field} onChange={(e) => setField(e.target.value)} maxLength={80} className="input" required autoFocus />
            </Field>
            {d.canManage && (
              <Field label="Parol">
                <div className="flex gap-2">
                  <input value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" className="input min-w-0 font-mono" />
                  <button type="button" onClick={() => setPassword(randomPassword())} className="btn-ghost whitespace-nowrap">
                    Tasodifiy
                  </button>
                </div>
              </Field>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(false)} className="btn-ghost">
                Bekor qilish
              </button>
              <button disabled={busy || !field.trim()} className="btn-primary">
                {busy ? "Saqlanmoqda…" : "Saqlash"}
              </button>
            </div>
          </form>
        )}

        {error && (
          <p role="alert" className="text-sm font-semibold text-red-600">
            {error}
          </p>
        )}

        {!editing && (
          <div className="flex justify-end border-t border-line pt-3">
            <button onClick={onClose} className="btn-ghost">
              Yopish
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Row({ label, value, mono, muted }: { label: string; value: string; mono?: boolean; muted?: boolean }) {
  return (
    <div className="px-4 py-3">
      <span className="block text-xs font-bold text-muted">{label}</span>
      <b className={`select-all break-all ${mono ? "font-mono text-lg" : ""} ${muted ? "font-normal text-muted" : ""}`}>{value}</b>
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
