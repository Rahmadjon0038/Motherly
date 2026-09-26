"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Modal } from "@/components/Modal";
import { PageLoader } from "@/components/Spinner";
import { ThumbImage } from "@/components/VideoParts";
import { api, errorMessage } from "@/lib/api";
import { clock } from "@/lib/format";
import type { AdminPlaylist } from "@/lib/types";

export function PlaylistsPanel() {
  const [list, setList] = useState<AdminPlaylist[] | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const l = await api<AdminPlaylist[]>("/admin/playlists");
        if (active) setList(l);
      } catch (e) {
        if (active) setError(errorMessage(e));
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/admin/playlists", { method: "POST", body: { title, description } });
      setCreating(false);
      setTitle("");
      setDescription("");
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="mr-auto text-sm text-muted">Tartib bilan o&apos;rganiladigan darslar to&apos;plami. Mobil ilovada &quot;Pleylistlar&quot; bo&apos;limida ko&apos;rinadi.</p>
        <button onClick={() => setCreating(true)} className="btn-primary">
          + Yangi pleylist
        </button>
      </div>
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
          {error}
        </p>
      )}
      {list === null && !error && <PageLoader />}
      {list?.length === 0 && <p className="rounded-lg border border-dashed border-line py-12 text-center text-muted">Hali pleylist yo&apos;q</p>}

      {list && list.length > 0 && (
        <ul className="grid gap-x-4 gap-y-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {list.map((p) => (
            <li key={p.id} className="min-w-0">
              <Link href={`/admin/playlists/${p.id}`} className="group block">
                {/* Ustma-ust qatlam: pleylist ekanini bildiruvchi "stopka" ko'rinishi */}
                <div className="mx-3 h-1.5 rounded-t-lg bg-line" />
                <div className="mx-1.5 h-1.5 rounded-t-lg bg-brand-light" />
                <div className="relative aspect-video overflow-hidden rounded-lg border border-line bg-surface transition group-hover:shadow-md">
                  <ThumbImage cover={p.cover} seconds={0} />
                  <span className="absolute inset-y-0 right-0 flex w-1/3 flex-col items-center justify-center bg-black/70 text-white">
                    <span className="text-xl font-extrabold">{p.count}</span>
                    <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                      <path d="M3 6h13M3 12h9M3 18h9M16 14l5 3-5 3z" />
                    </svg>
                  </span>
                </div>
                <h2 className="mt-2.5 line-clamp-2 font-extrabold leading-snug group-hover:text-brand">{p.title}</h2>
                <p className="text-sm text-muted">
                  {p.count} ta dars{p.durationSec ? ` · ${clock(p.durationSec)}` : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {creating && (
        <Modal label="Yangi pleylist" onClose={() => setCreating(false)}>
          <form onSubmit={create} className="space-y-3">
            <h2 className="text-lg font-extrabold">Yangi pleylist</h2>
            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-muted">Nomi *</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} className="input" required autoFocus />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-muted">Tavsif</span>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={2000} className="input" />
            </label>
            <p className="text-sm text-muted">Yaratgach ichiga darslarni qo&apos;shasiz.</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setCreating(false)} className="btn-ghost">
                Bekor qilish
              </button>
              <button disabled={busy || !title.trim()} className="btn-primary">
                {busy ? "Yaratilmoqda…" : "Yaratish"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
