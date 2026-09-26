"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/Modal";
import { api, errorMessage } from "@/lib/api";
import { PageLoader } from "@/components/Spinner";

interface Props {
  clinic: { id: number; name: string; username: string | null };
  onClose: () => void;
  onChanged: () => void;
}

interface Creds {
  username: string | null;
  password: string | null;
}

const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const randomPassword = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => ALPHABET[b % ALPHABET.length]).join("");

/** Klinikaning login va paroli: ko'rish, nusxalash va o'zgartirish. */
export function CredentialsDialog({ clinic, onClose, onChanged }: Props) {
  const [creds, setCreds] = useState<Creds | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<"login" | "password" | "all" | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const c = await api<Creds>(`/admin/clinics/${clinic.id}/credentials`);
        if (active) setCreds(c);
      } catch (e) {
        if (active) setError(errorMessage(e));
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [clinic.id, reloadKey]);

  async function copy(what: "login" | "password" | "all") {
    if (!creds?.username) return;
    const text =
      what === "login" ? creds.username : what === "password" ? (creds.password ?? "") : `Login: ${creds.username}\nParol: ${creds.password ?? ""}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied((c) => (c === what ? null : c)), 1500);
    } catch {
      // clipboard ruxsati yo'q — matn belgilab olinadi (select-all)
    }
  }

  function startEdit() {
    setUsername(creds?.username ?? "");
    setPassword(creds?.password ?? "");
    setError("");
    setEditing(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/admin/clinics/${clinic.id}`, { method: "PUT", body: { username, password } });
      setEditing(false);
      setReloadKey((k) => k + 1);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function createAccount() {
    setBusy(true);
    setError("");
    try {
      await api(`/admin/clinics/${clinic.id}/reset-password`, { method: "POST", body: {} });
      setReloadKey((k) => k + 1);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal label="Login va parol" onClose={onClose}>
      <div className="space-y-4">
        <h2 className="text-lg font-extrabold">&quot;{clinic.name}&quot; · login va parol</h2>

        {!creds && !error && <PageLoader className="!py-6" />}

        {creds && creds.username === null && (
          <>
            <p className="text-sm text-muted">Bu klinikada hali akkaunt yo&apos;q.</p>
            <button onClick={createAccount} disabled={busy} className="btn-primary">
              {busy ? "Yaratilmoqda…" : "Akkaunt yaratish"}
            </button>
          </>
        )}

        {creds && creds.username !== null && !editing && (
          <>
            <div className="divide-y divide-line rounded-md border border-line">
              <CopyRow label="Login" value={creds.username} done={copied === "login"} onCopy={() => copy("login")} />
              <CopyRow
                label="Parol"
                value={creds.password}
                done={copied === "password"}
                onCopy={() => copy("password")}
                missing="Saqlanmagan"
              />
            </div>
            {creds.password === null && (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
                Bu akkaunt parol saqlanishidan oldin yaratilgan, shuning uchun parolni ko&apos;rib bo&apos;lmaydi. Yangi parol
                belgilang, keyin u doim shu yerda ko&apos;rinadi.
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              {creds.password !== null && (
                <button onClick={() => copy("all")} className="btn-ghost">
                  {copied === "all" ? "Nusxalandi ✓" : "Ikkalasini nusxalash"}
                </button>
              )}
              <button onClick={startEdit} className="btn-primary">
                {creds.password === null ? "Yangi parol belgilash" : "O'zgartirish"}
              </button>
            </div>
          </>
        )}

        {creds && creds.username !== null && editing && (
          <form onSubmit={save} className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-muted">Login</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoCapitalize="none"
                spellCheck={false}
                className="input font-mono"
                required
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-muted">Parol</span>
              <div className="flex gap-2">
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="off"
                  className="input font-mono"
                  required
                />
                <button type="button" onClick={() => setPassword(randomPassword())} className="btn-ghost whitespace-nowrap">
                  Tasodifiy
                </button>
              </div>
            </label>
            <p className="text-sm text-muted">Saqlangach klinika eski parol bilan kira olmaydi.</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(false)} className="btn-ghost">
                Bekor qilish
              </button>
              <button disabled={busy} className="btn-primary">
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

function CopyRow({
  label,
  value,
  done,
  onCopy,
  missing,
}: {
  label: string;
  value: string | null;
  done: boolean;
  onCopy: () => void;
  missing?: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <span className="block text-xs font-bold text-muted">{label}</span>
        {value === null ? (
          <span className="text-muted">{missing}</span>
        ) : (
          <b className="block select-all font-mono text-lg break-all">{value}</b>
        )}
      </div>
      {value !== null && (
        <button onClick={onCopy} className="btn-ghost px-3 py-1.5" aria-label={`${label}ni nusxalash`}>
          {done ? "✓" : "Nusxalash"}
        </button>
      )}
    </div>
  );
}
