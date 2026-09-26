"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import { errorMessage, fileUrl, uploadWithProgress } from "@/lib/api";
import { clock } from "@/lib/format";
import type { AdminVideo } from "@/lib/types";

const MAX_MB = 500;

/** YouTube havolasidan video identifikatori (bo'lmasa null). */
export function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/))([\w-]{11})/);
  return m ? m[1] : null;
}

/** Platforma ichida o'ynatadigan oyna: YouTube havolasi (embed) yoki yuklangan video. */
export function VideoPlayerModal({ video, onClose }: { video: Pick<AdminVideo, "title" | "videoUrl" | "isFile">; onClose: () => void }) {
  const yt = !video.isFile ? youtubeId(video.videoUrl) : null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={video.title}
      className="fixed inset-0 z-30 grid place-items-center bg-black/80 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div className="w-full max-w-4xl">
        <div className="mb-2 flex items-center gap-3 text-white">
          <h2 className="mr-auto min-w-0 truncate text-lg font-extrabold">{video.title}</h2>
          <button onClick={onClose} autoFocus aria-label="Yopish" className="rounded-md bg-white/15 px-3 py-1.5 font-bold hover:bg-white/25">
            ✕
          </button>
        </div>
        <div className="aspect-video overflow-hidden rounded-lg bg-black">
          {video.isFile ? (
            <video src={fileUrl(video.videoUrl)} controls autoPlay playsInline className="size-full" />
          ) : yt ? (
            <iframe
              src={`https://www.youtube.com/embed/${yt}?autoplay=1&rel=0`}
              title={video.title}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              className="size-full border-0"
            />
          ) : (
            <p className="grid size-full place-items-center px-6 text-center text-white">Bu havolani platforma ichida ko&apos;rsatib bo&apos;lmaydi.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** 16:9 rasm: yuklangan videoning birinchi kadri, YouTube muqovasi yoki bo'sh joy belgisi. Bosilsa video platformada o'ynaydi. */
export function VideoThumb({ video: v }: { video: Pick<AdminVideo, "title" | "videoUrl" | "isFile" | "durationSec"> }) {
  const [open, setOpen] = useState(false);
  const cls = "relative block aspect-video w-full overflow-hidden rounded-lg border border-line bg-surface";
  const inner = <ThumbImage cover={v} seconds={v.durationSec} noVideo={!v.videoUrl} />;
  return (
    <>
      {v.videoUrl ? (
        <button type="button" onClick={() => setOpen(true)} aria-label={`${v.title}: videoni ko'rish`} className={`${cls} transition group-hover:shadow-md`}>
          {inner}
        </button>
      ) : (
        <div className={cls}>{inner}</div>
      )}
      {open && <VideoPlayerModal video={v} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Rasm ichi: muqova, davomiylik belgisi va "Video yo'q" belgisi. */
export function ThumbImage({ cover, seconds, noVideo }: { cover: { videoUrl: string; isFile: boolean } | null; seconds: number; noVideo?: boolean }) {
  const yt = cover?.videoUrl && !cover.isFile ? youtubeId(cover.videoUrl) : null;
  return (
    <>
      {cover?.isFile ? (
        // #t=0.5: brauzer videoning yarim soniyadagi kadrini muqova sifatida ko'rsatadi.
        <video src={`${fileUrl(cover.videoUrl)}#t=0.5`} preload="metadata" muted playsInline className="pointer-events-none size-full object-cover" />
      ) : yt ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`https://img.youtube.com/vi/${yt}/hqdefault.jpg`} alt="" className="size-full object-cover" />
      ) : (
        <span className="grid size-full place-items-center bg-brand-light text-brand">
          <svg className="size-10" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
      )}
      {seconds > 0 && (
        <span className="absolute right-2 bottom-2 rounded bg-black/80 px-1.5 py-0.5 text-xs font-bold text-white tabular-nums">{clock(seconds)}</span>
      )}
      {noVideo && <span className="absolute top-2 left-2 rounded bg-amber-100 px-2 py-0.5 text-xs font-extrabold text-amber-700">Video yo&apos;q</span>}
    </>
  );
}

export function VideoDialog({
  video,
  categories = [],
  playlistId,
  onClose,
  onSaved,
}: {
  video: AdminVideo | null;
  categories?: string[];
  /** Berilsa dars shu pleylistga qo'shiladi (kategoriya so'ralmaydi: u pleylist nomi). */
  playlistId?: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(video?.title ?? "");
  const [category, setCategory] = useState(video?.category ?? "");
  // Fayl tanlanganda brauzer videodan davomiylikni (soniya) o'qiydi; YouTube havolasida server aniqlaydi.
  const [fileSeconds, setFileSeconds] = useState(0);
  const [description, setDescription] = useState(video?.description ?? "");
  const [mode, setMode] = useState<"file" | "link">(video && !video.isFile && video.videoUrl ? "link" : "file");
  const [file, setFile] = useState<File | null>(null);
  const [link, setLink] = useState(video && !video.isFile ? video.videoUrl : "");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  function pick(f: File | undefined) {
    if (!f) return;
    if (f.size > MAX_MB * 1024 * 1024) return setError(`Video ${MAX_MB} MB dan katta`);
    setError("");
    setFile(f);
    setFileSeconds(0);
    const el = document.createElement("video");
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      if (Number.isFinite(el.duration)) setFileSeconds(Math.round(el.duration));
      URL.revokeObjectURL(el.src);
    };
    el.onerror = () => URL.revokeObjectURL(el.src);
    el.src = URL.createObjectURL(f);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!video && mode === "file" && !file) return setError("Video faylini tanlang");
    if (!video && mode === "link" && !link.trim()) return setError("Havolani kiriting");
    setBusy(true);
    setError("");
    setProgress(0);
    try {
      const fd = new FormData();
      fd.append("title", title);
      fd.append("category", category);
      if (playlistId) fd.append("playlistId", String(playlistId));
      if (mode === "file" && file) fd.append("durationSec", String(fileSeconds));
      fd.append("description", description);
      if (mode === "file" && file) fd.append("file", file);
      if (mode === "link") fd.append("videoUrl", link.trim());
      await uploadWithProgress(video ? `/admin/videos/${video.id}` : "/admin/videos", video ? "PUT" : "POST", fd, setProgress);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Modal label={video ? "Darsni tahrirlash" : "Yangi dars"} onClose={busy ? () => {} : onClose}>
      <form onSubmit={submit} className="space-y-3">
        <h2 className="text-lg font-extrabold">{video ? "Darsni tahrirlash" : "Yangi dars"}</h2>
        <Field label="Nomi *">
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} className="input" required autoFocus />
        </Field>
        {!playlistId && !video?.playlistId && (
          <Field label="Kategoriya *">
            <input value={category} onChange={(e) => setCategory(e.target.value)} list="video-cats" maxLength={60} placeholder="Ovqatlanish, Uyqu…" className="input" required />
            <datalist id="video-cats">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
        )}
        <Field label="Tavsif">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={2000} className="input" />
        </Field>

        <div className="space-y-2">
          <div role="group" aria-label="Video manbasi" className="flex overflow-hidden rounded-md border border-line text-sm font-bold">
            {(["file", "link"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={`flex-1 px-3 py-2 ${mode === m ? "bg-brand-light text-brand" : "text-muted hover:text-ink"}`}
              >
                {m === "file" ? "Video yuklash" : "YouTube havolasi"}
              </button>
            ))}
          </div>
          {mode === "file" ? (
            <label className="block cursor-pointer rounded-md border-[1.4px] border-dashed border-line bg-surface px-4 py-5 text-center text-sm hover:bg-brand-light">
              <span className="font-bold text-brand">{file ? file.name : "Video tanlash"}</span>
              <span className="mt-1 block text-muted">
                {file ? `${(file.size / 1024 / 1024).toFixed(1)} MB${fileSeconds ? ` · ${clock(fileSeconds)}` : ""}` : `MP4, WebM yoki MOV, ${MAX_MB} MB gacha`}
                {video?.isFile && !file ? " · hozirgi fayl saqlanadi" : ""}
              </span>
              <input type="file" accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
            </label>
          ) : (
            <input value={link} onChange={(e) => setLink(e.target.value)} type="url" placeholder="https://www.youtube.com/watch?v=…" className="input" />
          )}
        </div>

        {busy && mode === "file" && file && (
          <div role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-2 overflow-hidden rounded-full bg-brand-light">
              <div className="h-full bg-brand transition-[width]" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted">{progress < 100 ? `Yuklanmoqda… ${progress}%` : "Saqlanmoqda…"}</p>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm font-semibold text-red-600">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="btn-ghost">
            Bekor qilish
          </button>
          <button disabled={busy || !title.trim() || (!playlistId && !video?.playlistId && !category.trim())} className="btn-primary">
            {busy ? "Kuting…" : "Saqlash"}
          </button>
        </div>
      </form>
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
