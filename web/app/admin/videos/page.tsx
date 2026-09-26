"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Modal } from "@/components/Modal";
import { PlaylistsPanel } from "@/components/PlaylistsPanel";
import { VideoDialog, VideoThumb } from "@/components/VideoParts";
import { PageLoader } from "@/components/Spinner";
import { api, errorMessage } from "@/lib/api";
import { fullDate } from "@/lib/format";
import type { AdminVideo } from "@/lib/types";

export default function VideosPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <VideosTabs />
    </Suspense>
  );
}

function VideosTabs() {
  // ?tab=playlists bilan kelinsa (masalan pleylistdan orqaga) shu tab ochiladi.
  const [tab, setTab] = useState<"lessons" | "playlists">(useSearchParams().get("tab") === "playlists" ? "playlists" : "lessons");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Video darslar</h1>
        <p className="text-sm text-muted">Shu yerga yuklanganlar mobil ilovadagi &quot;Darslar&quot; bo&apos;limida ko&apos;rinadi.</p>
      </div>
      <div role="tablist" aria-label="Bo'lim" className="inline-flex overflow-hidden rounded-md border border-line bg-white text-sm font-bold">
        {(
          [
            ["lessons", "Darslar"],
            ["playlists", "Pleylistlar"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`px-5 py-2 ${tab === key ? "bg-brand-light text-brand" : "text-muted hover:text-ink"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "lessons" ? <LessonsPanel /> : <PlaylistsPanel />}
    </div>
  );
}

function LessonsPanel() {
  const [videos, setVideos] = useState<AdminVideo[] | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<AdminVideo | "new" | null>(null);
  const [deleting, setDeleting] = useState<AdminVideo | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const list = await api<AdminVideo[]>("/admin/videos");
        if (active) setVideos(list);
      } catch (e) {
        if (active) setError(errorMessage(e));
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setEditing("new")} className="btn-primary">
          + Yangi dars
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
          {error}
        </p>
      )}
      {videos === null && !error && <PageLoader />}
      {videos?.length === 0 && <p className="rounded-lg border border-dashed border-line py-12 text-center text-muted">Hali dars yo&apos;q</p>}

      {videos && videos.length > 0 && (
        <ul className="grid gap-x-4 gap-y-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {videos.map((v) => (
            <li key={v.id} className="group min-w-0">
              <VideoThumb video={v} />
              <div className="mt-2.5 flex gap-2">
                <div className="min-w-0 flex-1">
                  <h2 className="line-clamp-2 font-extrabold leading-snug" title={v.title}>
                    {v.title}
                  </h2>
                  <p className="mt-0.5 text-sm text-muted">
                    <span className="font-semibold text-brand">{v.category}</span> · {fullDate(v.createdAt)}
                  </p>
                  <p className="text-xs text-muted">
                    {v.videoUrl ? (v.isFile ? "Yuklangan video" : "YouTube") : "Video yuklanmagan"}
                  </p>
                </div>
                <div className="flex flex-none flex-col gap-1">
                  <button onClick={() => setEditing(v)} className="rounded-md px-2.5 py-1 text-xs font-bold text-muted hover:bg-brand-light hover:text-brand">
                    Tahrirlash
                  </button>
                  <button onClick={() => setDeleting(v)} className="rounded-md px-2.5 py-1 text-xs font-bold text-muted hover:bg-red-50 hover:text-red-600">
                    O&apos;chirish
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <VideoDialog
          video={editing === "new" ? null : editing}
          categories={[...new Set((videos ?? []).map((v) => v.category))]}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
      {deleting && (
        <Modal label="Darsni o'chirish" onClose={() => setDeleting(null)}>
          <div className="space-y-4">
            <h2 className="text-lg font-extrabold">&quot;{deleting.title}&quot; o&apos;chirilsinmi?</h2>
            <p className="text-sm">
              Dars ilovadan va onalarning sevimlilaridan olib tashlanadi, yuklangan video fayl ham o&apos;chadi.{" "}
              <b className="text-red-600">Buni qaytarib bo&apos;lmaydi.</b>
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleting(null)} className="btn-ghost" autoFocus>
                Bekor qilish
              </button>
              <button
                onClick={async () => {
                  try {
                    await api(`/admin/videos/${deleting.id}`, { method: "DELETE" });
                    setDeleting(null);
                    reload();
                  } catch (e) {
                    setError(errorMessage(e));
                    setDeleting(null);
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
