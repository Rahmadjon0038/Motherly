"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Modal } from "@/components/Modal";
import { PageLoader } from "@/components/Spinner";
import { ThumbImage, VideoDialog, VideoPlayerModal } from "@/components/VideoParts";
import { api, errorMessage } from "@/lib/api";
import { clock } from "@/lib/format";
import type { AdminPlaylistDetail, AdminVideo } from "@/lib/types";

export default function PlaylistDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [pl, setPl] = useState<AdminPlaylistDetail | null>(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [dialog, setDialog] = useState<AdminVideo | "new" | null>(null);
  const [playing, setPlaying] = useState<AdminVideo | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [deleting, setDeleting] = useState<"playlist" | AdminVideo | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const p = await api<AdminPlaylistDetail>(`/admin/playlists/${id}`);
        if (active) setPl(p);
      } catch (e) {
        if (active) setError(errorMessage(e));
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [id, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  async function move(from: number, to: number) {
    if (!pl || from === to || to < 0 || to >= pl.videos.length) return;
    const videos = [...pl.videos];
    videos.splice(to, 0, videos.splice(from, 1)[0]);
    setPl({ ...pl, videos });
    try {
      await api(`/admin/playlists/${id}/order`, { method: "PUT", body: { ids: videos.map((v) => v.id) } });
    } catch (e) {
      setError(errorMessage(e));
      reload();
    }
  }

  if (!pl) {
    return (
      <div className="space-y-3">
        <Link href="/admin/videos?tab=playlists" className="text-sm font-bold text-brand hover:underline">
          ← Video darslar
        </Link>
        {error ? <p className="font-semibold text-red-600" role="alert">{error}</p> : <PageLoader />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link href="/admin/videos?tab=playlists" className="inline-block text-sm font-bold text-brand hover:underline">
        ← Video darslar
      </Link>
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto min-w-0">
          <h1 className="text-2xl font-extrabold">{pl.title}</h1>
          {pl.description && <p className="max-w-3xl text-sm whitespace-pre-line text-muted">{pl.description}</p>}
          <p className="mt-1 text-sm text-muted">
            {pl.count} ta dars{pl.durationSec ? ` · ${clock(pl.durationSec)}` : ""}
          </p>
        </div>
        <button
          onClick={() => {
            setName(pl.title);
            setDesc(pl.description);
            setRenaming(true);
          }}
          className="btn-ghost"
        >
          Tahrirlash
        </button>
        <button onClick={() => setDeleting("playlist")} className="btn-ghost text-red-600 hover:bg-red-50">
          O&apos;chirish
        </button>
        <button onClick={() => setDialog("new")} className="btn-primary">
          + Dars qo&apos;shish
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
          {error}
        </p>
      )}
      {pl.videos.length === 0 && <p className="rounded-lg border border-dashed border-line py-12 text-center text-muted">Pleylist bo&apos;sh. Birinchi darsni qo&apos;shing.</p>}

      {pl.videos.length > 0 && (
        <>
          <p className="text-sm text-muted">Darslarni sudrab tartibini o&apos;zgartiring: ilovada shu tartibda ko&apos;rinadi.</p>
          <ol className="divide-y divide-line rounded-lg border border-line bg-white">
            {pl.videos.map((v, i) => (
              <li
                key={v.id}
                draggable
                onDragStart={(e) => {
                  setDragFrom(i);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", String(i));
                }}
                onDragOver={(e) => {
                  if (dragFrom === null) return;
                  e.preventDefault();
                  setDragOver(i);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragFrom !== null) void move(dragFrom, i);
                  setDragFrom(null);
                  setDragOver(null);
                }}
                onDragEnd={() => {
                  setDragFrom(null);
                  setDragOver(null);
                }}
                className={`flex cursor-grab items-center gap-3 px-3 py-2.5 active:cursor-grabbing ${dragFrom === i ? "opacity-40" : ""} ${
                  dragOver === i && dragFrom !== null && dragFrom !== i ? "bg-brand-light" : ""
                }`}
              >
                <span className="grid size-7 flex-none place-items-center rounded-md bg-surface text-sm font-extrabold text-muted">{i + 1}</span>
                <button
                  type="button"
                  disabled={!v.videoUrl}
                  onClick={() => setPlaying(v)}
                  draggable={false}
                  aria-label={`${v.title}: videoni ko'rish`}
                  className="relative block aspect-video w-32 flex-none overflow-hidden rounded-md border border-line bg-surface"
                >
                  <ThumbImage cover={{ videoUrl: v.videoUrl, isFile: v.isFile }} seconds={v.durationSec} noVideo={!v.videoUrl} />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-extrabold">{v.title}</p>
                  <p className="text-sm text-muted">{v.isFile ? "Yuklangan video" : v.videoUrl ? "YouTube" : "Video yo'q"}</p>
                </div>
                <div className="flex flex-none gap-1">
                  <button onClick={() => move(i, i - 1)} disabled={i === 0} aria-label="Yuqoriga" className="rounded-md px-2 py-1 font-bold text-muted hover:bg-brand-light hover:text-brand disabled:opacity-30">
                    ↑
                  </button>
                  <button onClick={() => move(i, i + 1)} disabled={i === pl.videos.length - 1} aria-label="Pastga" className="rounded-md px-2 py-1 font-bold text-muted hover:bg-brand-light hover:text-brand disabled:opacity-30">
                    ↓
                  </button>
                  <button onClick={() => setDialog(v)} className="rounded-md px-2.5 py-1 text-sm font-bold text-muted hover:bg-brand-light hover:text-brand">
                    Tahrirlash
                  </button>
                  <button onClick={() => setDeleting(v)} className="rounded-md px-2.5 py-1 text-sm font-bold text-muted hover:bg-red-50 hover:text-red-600">
                    O&apos;chirish
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}

      {playing && <VideoPlayerModal video={playing} onClose={() => setPlaying(null)} />}

      {dialog && (
        <VideoDialog
          video={dialog === "new" ? null : dialog}
          playlistId={pl.id}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            reload();
          }}
        />
      )}

      {renaming && (
        <Modal label="Pleylistni tahrirlash" onClose={() => setRenaming(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api(`/admin/playlists/${id}`, { method: "PUT", body: { title: name, description: desc } });
                setRenaming(false);
                reload();
              } catch (err) {
                setError(errorMessage(err));
                setRenaming(false);
              }
            }}
            className="space-y-3"
          >
            <h2 className="text-lg font-extrabold">Pleylistni tahrirlash</h2>
            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-muted">Nomi *</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={150} className="input" required autoFocus />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-muted">Tavsif</span>
              <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} maxLength={2000} className="input" />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setRenaming(false)} className="btn-ghost">
                Bekor qilish
              </button>
              <button disabled={!name.trim()} className="btn-primary">
                Saqlash
              </button>
            </div>
          </form>
        </Modal>
      )}

      {deleting && (
        <Modal label="O'chirish" onClose={() => setDeleting(null)}>
          <div className="space-y-4">
            <h2 className="text-lg font-extrabold">
              {deleting === "playlist" ? `"${pl.title}" pleylisti o'chirilsinmi?` : `"${deleting.title}" o'chirilsinmi?`}
            </h2>
            <p className="text-sm">
              {deleting === "playlist" ? `Pleylist va ichidagi ${pl.count} ta dars, yuklangan videolar bilan birga o'chadi.` : "Dars pleylistdan va sevimlilardan olib tashlanadi."}{" "}
              <b className="text-red-600">Buni qaytarib bo&apos;lmaydi.</b>
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleting(null)} className="btn-ghost" autoFocus>
                Bekor qilish
              </button>
              <button
                onClick={async () => {
                  const target = deleting;
                  setDeleting(null);
                  try {
                    if (target === "playlist") {
                      await api(`/admin/playlists/${id}`, { method: "DELETE" });
                      router.replace("/admin/videos?tab=playlists");
                    } else {
                      await api(`/admin/videos/${target.id}`, { method: "DELETE" });
                      reload();
                    }
                  } catch (e) {
                    setError(errorMessage(e));
                  }
                }}
                className="inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700"
              >
                Ha, o&apos;chirish
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
