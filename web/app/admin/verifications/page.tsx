"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/Modal";
import { PageLoader } from "@/components/Spinner";
import { api, errorMessage, openProtectedFile } from "@/lib/api";
import { fullDate } from "@/lib/format";

interface Verification {
  id: number;
  name: string;
  phone: string;
  status: "pending" | "approved" | "rejected";
  documentName: string;
  uploadedAt: string | null;
  rejectionReason: string;
  clinics: string[];
}

const BADGE = {
  pending: ["Tekshirilmoqda", "bg-amber-100 text-amber-800"],
  approved: ["Tasdiqlangan", "bg-emerald-100 text-emerald-700"],
  rejected: ["Rad etilgan", "bg-red-100 text-red-700"],
} as const;

export default function VerificationsPage() {
  const [list, setList] = useState<Verification[] | null>(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [rejecting, setRejecting] = useState<Verification | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api<Verification[]>("/admin/verifications").then(
      (r) => active && setList(r),
      (e) => active && setError(errorMessage(e)),
    );
    return () => {
      active = false;
    };
  }, [reloadKey]);

  async function decide(v: Verification, status: "approved" | "rejected", why = "") {
    setBusy(true);
    setError("");
    try {
      await api(`/admin/verifications/${v.id}`, { method: "PUT", body: { status, reason: why } });
      setRejecting(null);
      setReason("");
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function open(v: Verification) {
    try {
      await openProtectedFile(`/admin/verifications/${v.id}/document`);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const pending = list?.filter((v) => v.status === "pending").length ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Hujjatlarni tekshirish</h1>
        <p className="text-sm text-muted">
          Mutaxassislar shifokor ekanini tasdiqlovchi hujjat yuklaydi. Tasdiqlangach ular xizmat va video joylay oladi.
          {list && pending > 0 && <b className="text-amber-700"> Kutilayotgan: {pending} ta.</b>}
        </p>
      </div>

      {error && <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">{error}</p>}
      {!list && !error && <PageLoader />}
      {list?.length === 0 && (
        <p className="rounded-lg border border-dashed border-line py-12 text-center text-muted">Hali hujjat yuborilmagan</p>
      )}

      {list && list.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line bg-white">
          {list.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-extrabold">{v.name || "Ismi kiritilmagan"}</span>
                  <span className={`rounded px-2 py-0.5 text-xs font-extrabold ${BADGE[v.status][1]}`}>{BADGE[v.status][0]}</span>
                </div>
                <p className="text-sm text-muted">
                  <span className="font-mono">{v.phone}</span>
                  {v.clinics.length > 0 && ` · ${v.clinics.join(", ")}`}
                  {v.uploadedAt && ` · yuborilgan ${fullDate(v.uploadedAt)}`}
                </p>
                {v.status === "rejected" && v.rejectionReason && (
                  <p className="mt-0.5 text-sm text-red-600">Sabab: {v.rejectionReason}</p>
                )}
              </div>
              <button onClick={() => open(v)} className="btn-ghost" title={v.documentName}>
                Hujjatni ko&apos;rish
              </button>
              {v.status !== "approved" && (
                <button disabled={busy} onClick={() => decide(v, "approved")} className="btn-primary">
                  Tasdiqlash
                </button>
              )}
              {v.status !== "rejected" && (
                <button onClick={() => setRejecting(v)} className="btn-ghost text-red-600 hover:bg-red-50">
                  {v.status === "approved" ? "Ruxsatni bekor qilish" : "Rad etish"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {rejecting && (
        <Modal label="Rad etish" onClose={() => setRejecting(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void decide(rejecting, "rejected", reason);
            }}
            className="space-y-3"
          >
            <h2 className="text-lg font-extrabold">{rejecting.name || rejecting.phone}: rad etish</h2>
            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-muted">Sababi (mutaxassisga ko&apos;rsatiladi) *</span>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} className="input" placeholder="Masalan: hujjat aniq ko'rinmayapti" required autoFocus />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setRejecting(null)} className="btn-ghost">Bekor qilish</button>
              <button disabled={busy || !reason.trim()} className="btn-primary">Rad etish</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
