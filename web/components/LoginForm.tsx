"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { api, clearToken, errorMessage, getToken, setToken } from "@/lib/api";
import type { AuthResult } from "@/lib/types";

const homeFor = (role: string) => (role === "admin" ? "/admin" : "/");

/** Admin va klinika bir xil sahifadan login-parol bilan kiradi; rolga qarab tegishli panelga o'tadi. */
export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Token bor bo'lsa, u hali yaroqli ekanini tekshirib, to'g'ri panelga o'tkazamiz.
  useEffect(() => {
    if (!getToken()) return;
    api<{ role: string }>("/me")
      .then((me) => {
        if (me.role === "admin" || me.role === "clinic") router.replace(homeFor(me.role));
        else clearToken();
      })
      .catch(clearToken);
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api<AuthResult>("/auth/login", { method: "POST", body: { username, password } });
      setToken(res.token);
      router.replace(homeFor(res.user.role));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm text-center">
        <Logo className="text-6xl" />
        <p className="mt-1 text-muted">Klinika qabulxonasi</p>

        <div className="mt-8 space-y-3 text-left">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Login"
            aria-label="Login"
            className="input py-4 text-lg font-semibold"
          />
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="Parol"
              aria-label="Parol"
              className="input py-4 pr-14 text-lg font-semibold"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Parolni yashirish" : "Parolni ko'rsatish"}
              aria-pressed={showPassword}
              className="absolute top-1/2 right-2 grid size-10 -translate-y-1/2 place-items-center rounded-md text-muted hover:bg-brand-light hover:text-brand"
            >
              {showPassword ? (
                <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22" />
                </svg>
              ) : (
                <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <p className="mt-3 min-h-5 text-sm font-semibold text-red-600" role="alert">
          {error}
        </p>

        <button
          type="submit"
          disabled={!username.trim() || !password || busy}
          className="mt-2 w-full rounded-md bg-gradient-to-r from-[#4aa3ff] to-brand-dark py-4 text-lg font-bold text-white shadow-lg shadow-brand/30 transition hover:brightness-105 disabled:opacity-50"
        >
          {busy ? "Kuting…" : "Kirish"}
        </button>

        <p className="mt-4 text-sm text-muted">Login va parolni Motherly administratori beradi.</p>
      </form>
    </main>
  );
}
