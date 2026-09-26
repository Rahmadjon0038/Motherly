"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import { api, errorMessage } from "@/lib/api";

interface ClinicRef {
  id: number;
  name: string;
  username: string | null;
}

/** Klinika nomini o'zgartirish. Login va parol alohida oynada (CredentialsDialog). */
export function EditClinicDialog({
  clinic,
  onClose,
  onSaved,
}: {
  clinic: ClinicRef;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(clinic.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/admin/clinics/${clinic.id}`, { method: "PUT", body: { name } });
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Modal label="Klinikani tahrirlash" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <h2 className="text-lg font-extrabold">Klinikani tahrirlash</h2>
        <Field label="Klinika nomi *">
          <input value={name} onChange={(e) => setName(e.target.value)} className="input" autoFocus required />
        </Field>
        <p className="text-sm text-muted">
          Login va parolni o&apos;zgartirish uchun ro&apos;yxatdagi login tugmasini bosing. Manzil, telefon, rasm va ish
          vaqtini klinikaning o&apos;zi o&apos;z kabinetida o&apos;zgartiradi.
        </p>
        {error && (
          <p role="alert" className="text-sm font-semibold text-red-600">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">
            Bekor qilish
          </button>
          <button disabled={busy || !name.trim()} className="btn-primary">
            {busy ? "Saqlanmoqda…" : "Saqlash"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** O'chirishni tasdiqlash. Qaytarib bo'lmasligi aniq yozilgan. */
export function DeleteClinicDialog({
  clinic,
  onClose,
  onDeleted,
}: {
  clinic: Pick<ClinicRef, "id" | "name">;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setBusy(true);
    setError("");
    try {
      await api(`/admin/clinics/${clinic.id}`, { method: "DELETE" });
      onDeleted();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Modal label="Klinikani o'chirish" onClose={onClose}>
      <div className="space-y-4">
        <h2 className="text-lg font-extrabold">&quot;{clinic.name}&quot; o&apos;chirilsinmi?</h2>
        <p className="text-sm">
          Klinika, uning rasmlari, shifokorlari, murojaatlari va kirish akkaunti butunlay o&apos;chadi.{" "}
          <b className="text-red-600">Buni qaytarib bo&apos;lmaydi.</b>
        </p>
        {error && (
          <p role="alert" className="text-sm font-semibold text-red-600">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost" autoFocus>
            Bekor qilish
          </button>
          <button
            onClick={remove}
            disabled={busy}
            className="inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? "O'chirilmoqda…" : "Ha, o'chirish"}
          </button>
        </div>
      </div>
    </Modal>
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
