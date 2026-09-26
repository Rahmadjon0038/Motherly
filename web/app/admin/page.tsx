"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DeleteClinicDialog, EditClinicDialog } from "@/components/ClinicDialogs";
import { CredentialsCard } from "@/components/CredentialsCard";
import { CredentialsDialog } from "@/components/CredentialsDialog";
import { Modal } from "@/components/Modal";
import { api, errorMessage, fileUrl } from "@/lib/api";
import { fullDate } from "@/lib/format";
import type { AdminClinic, Credentials } from "@/lib/types";
import { PageLoader } from "@/components/Spinner";

const ROW = "md:grid-cols-[minmax(0,2.4fr)_minmax(0,1.4fr)_9rem_5rem_7rem]";

type Action = { kind: "edit" | "delete" | "credentials"; clinic: AdminClinic };

export default function ClinicsPage() {
  const [clinics, setClinics] = useState<AdminClinic[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [menuId, setMenuId] = useState<number | null>(null);
  const [action, setAction] = useState<Action | null>(null);

  // reloadKey o'zgarganda ro'yxat qayta yuklanadi (klinika yaratilgach).
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    async function fetchClinics() {
      try {
        const list = await api<AdminClinic[]>("/admin/clinics");
        if (active) setClinics(list);
      } catch (e) {
        if (active) setError(errorMessage(e));
      }
    }
    void fetchClinics();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  // Menyu tashqarisi bosilsa yoki Escape bosilsa yopiladi.
  useEffect(() => {
    if (menuId === null) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-row-menu]")) setMenuId(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenuId(null);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [menuId]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !clinics) return clinics;
    return clinics.filter((c) => [c.name, c.address, c.username ?? ""].some((v) => v.toLowerCase().includes(q)));
  }, [clinics, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-extrabold">Klinikalar</h1>
          <p className="text-sm text-muted">{clinics ? `Jami ${clinics.length} ta` : "\u00a0"}</p>
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nom, manzil yoki login bo'yicha qidirish"
          aria-label="Qidirish"
          className="input w-full sm:w-80"
        />
        <button onClick={() => setCreating(true)} className="btn-primary">
          + Yangi klinika
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
          {error}
        </p>
      )}

      {clinics === null && !error && <PageLoader />}

      {shown && shown.length === 0 && (
        <p className="rounded-lg border border-dashed border-line py-12 text-center text-muted">
          {clinics?.length ? "Hech narsa topilmadi" : "Hali klinika yo'q"}
        </p>
      )}

      {shown && shown.length > 0 && (
        <div className="rounded-lg border border-line bg-white">
          <div className={`hidden gap-4 rounded-t-lg border-b border-line bg-surface py-2.5 pr-14 pl-4 text-xs font-bold text-muted uppercase md:grid ${ROW}`}>
            <span>Klinika</span>
            <span>Login</span>
            <span>Holat</span>
            <span>Rasm</span>
            <span>Qo&apos;shilgan</span>
          </div>
          <ul className="divide-y divide-line">
            {shown.map((c) => (
              <li
                key={c.id}
                className={`relative last:rounded-b-lg hover:bg-surface ${menuId === c.id ? "z-20" : ""}`}
              >
                <div className={`grid items-center gap-x-4 gap-y-2 py-3 pr-14 pl-4 ${ROW}`}>
                  {/* Cho'zilgan havola: qatorning istalgan joyi bosilsa klinika sahifasi ochiladi. Tugmalar z-10 bilan ustida. */}
                  <Link
                    href={`/admin/clinics/${c.id}`}
                    className="flex min-w-0 items-center gap-3 after:absolute after:inset-0 after:content-['']"
                  >
                    <span className="grid size-12 flex-none place-items-center overflow-hidden rounded-md bg-brand-light text-brand">
                      {c.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={fileUrl(c.photoUrl)} alt="" className="size-full object-cover" />
                      ) : (
                        <span className="text-lg font-black">{c.name.slice(0, 1).toUpperCase()}</span>
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-extrabold">{c.name}</span>
                      <span className="block truncate text-sm text-muted">{c.address || "Manzil kiritilmagan"}</span>
                    </span>
                  </Link>
                  <div className="relative z-10 min-w-0">
                    <button
                      onClick={() => setAction({ kind: "credentials", clinic: c })}
                      title={c.username ? "Login va parolni ko'rish" : "Akkaunt yaratish"}
                      className={`inline-flex max-w-full items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm font-semibold ${
                        c.username
                          ? "border-line bg-white font-mono text-ink hover:border-brand hover:text-brand"
                          : "border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-400"
                      }`}
                    >
                      <svg className="size-4 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <circle cx="8" cy="15" r="4" />
                        <path d="M10.85 12.15 19 4M18 5l2 2M15 8l2 2" />
                      </svg>
                      <span className="truncate">{c.username ?? "+ Akkaunt"}</span>
                    </button>
                  </div>
                  <span>
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-xs font-extrabold ${
                        c.complete ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {c.complete ? "To'ldirilgan" : "To'ldirilmagan"}
                    </span>
                  </span>
                  <span className="text-sm text-muted max-md:hidden">{c.photoCount} ta</span>
                  <span className="text-sm text-muted max-md:hidden">{fullDate(c.createdAt)}</span>
                </div>
                <div data-row-menu className="absolute top-1/2 right-3 z-10 -translate-y-1/2">
                  <button
                    onClick={() => setMenuId(menuId === c.id ? null : c.id)}
                    aria-label={`${c.name}: amallar`}
                    aria-haspopup="menu"
                    aria-expanded={menuId === c.id}
                    className="grid size-9 place-items-center rounded-md text-muted hover:bg-brand-light hover:text-brand"
                  >
                    <svg className="size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <circle cx="5" cy="12" r="1.8" />
                      <circle cx="12" cy="12" r="1.8" />
                      <circle cx="19" cy="12" r="1.8" />
                    </svg>
                  </button>
                  {menuId === c.id && (
                    <div role="menu" className="absolute top-full right-0 z-20 mt-1 w-44 overflow-hidden rounded-md border border-line bg-white py-1 shadow-lg">
                      <button
                        role="menuitem"
                        onClick={() => {
                          setMenuId(null);
                          setAction({ kind: "edit", clinic: c });
                        }}
                        className="block w-full px-4 py-2 text-left text-sm font-semibold hover:bg-surface"
                      >
                        Tahrirlash
                      </button>
                      <button
                        role="menuitem"
                        onClick={() => {
                          setMenuId(null);
                          setAction({ kind: "delete", clinic: c });
                        }}
                        className="block w-full px-4 py-2 text-left text-sm font-semibold text-red-600 hover:bg-red-50"
                      >
                        O&apos;chirish
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {action?.kind === "edit" && (
        <EditClinicDialog
          clinic={action.clinic}
          onClose={() => setAction(null)}
          onSaved={() => setReloadKey((k) => k + 1)}
        />
      )}
      {action?.kind === "credentials" && (
        <CredentialsDialog
          clinic={action.clinic}
          onClose={() => setAction(null)}
          onChanged={() => setReloadKey((k) => k + 1)}
        />
      )}
      {action?.kind === "delete" && (
        <DeleteClinicDialog
          clinic={action.clinic}
          onClose={() => setAction(null)}
          onDeleted={() => {
            setAction(null);
            setReloadKey((k) => k + 1);
          }}
        />
      )}

      {creating && (
        <CreateDialog
          onClose={() => setCreating(false)}
          onCreated={() => setReloadKey((k) => k + 1)}
        />
      )}
    </div>
  );
}

function CreateDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ clinic: AdminClinic; credentials: Credentials } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api<{ clinic: AdminClinic; credentials: Credentials }>("/admin/clinics", {
        method: "POST",
        body: { name, username: username.trim() || undefined, password: password || undefined },
      });
      setCreated(res);
      onCreated();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal label="Yangi klinika" onClose={onClose}>
        {created ? (
          <CredentialsCard clinicName={created.clinic.name} credentials={created.credentials} onClose={onClose}>
            <Link href={`/admin/clinics/${created.clinic.id}`} className="btn-ghost">
              Klinikani ochish
            </Link>
          </CredentialsCard>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <h2 className="text-lg font-extrabold">Yangi klinika</h2>
            <p className="-mt-2 text-sm text-muted">
              Faqat nom kifoya. Telefon raqamlar, manzil, xarita, rasm va ish vaqtini klinikaning o&apos;zi to&apos;ldiradi.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Klinika nomi *" className="sm:col-span-2">
                <input value={name} onChange={(e) => setName(e.target.value)} className="input" autoFocus required />
              </Field>
              <Field label="Login">
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="nomdan olinadi"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="input"
                />
              </Field>
              <Field label="Parol">
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="tasodifiy yaratiladi"
                  autoComplete="off"
                  className="input"
                />
              </Field>
            </div>
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
                {busy ? "Yaratilmoqda…" : "Yaratish"}
              </button>
            </div>
          </form>
        )}
    </Modal>
  );
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-sm font-bold text-muted">{label}</span>
      {children}
    </label>
  );
}
