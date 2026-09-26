"use client";

import { useState } from "react";
import type { Credentials } from "@/lib/types";

/** Yangi yaratilgan login-parol (keyinroq ham login tugmasi orqali ko'rish mumkin). */
export function CredentialsCard({
  clinicName,
  credentials,
  onClose,
  children,
}: {
  clinicName: string;
  credentials: Credentials;
  onClose?: () => void;
  children?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const { username, password } = credentials;

  async function copy() {
    try {
      await navigator.clipboard.writeText(`Login: ${username}\nParol: ${password}`);
      setCopied(true);
    } catch {
      // clipboard ruxsati yo'q — foydalanuvchi qo'lda nusxalaydi
    }
  }

  return (
    <div role="status" className="space-y-3 rounded-lg border-2 border-brand bg-brand-light p-4">
      <h2 className="text-lg font-extrabold">&quot;{clinicName}&quot; uchun kirish ma&apos;lumotlari</h2>
      <div className="grid gap-3 rounded-md bg-white p-4 font-mono text-lg">
        <div>
          <span className="block font-sans text-xs font-bold text-muted">Login</span>
          <b className="select-all break-all">{username}</b>
        </div>
        <div>
          <span className="block font-sans text-xs font-bold text-muted">Parol</span>
          <b className="select-all break-all">{password}</b>
        </div>
      </div>
      <p className="text-sm text-muted">
        Klinikaga shuni bering. Keyin ham ro&apos;yxatdagi login tugmasini bossangiz, login va parol shu yerda ko&apos;rinadi.
      </p>
      <div className="flex flex-wrap gap-2">
        <button onClick={copy} className="btn-primary">
          {copied ? "Nusxalandi ✓" : "Nusxalash"}
        </button>
        {children}
        {onClose && (
          <button onClick={onClose} className="btn-ghost">
            Yopish
          </button>
        )}
      </div>
    </div>
  );
}
