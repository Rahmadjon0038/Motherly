"use client";

import { useEffect } from "react";

/** Markazdagi oyna: Escape yoki fon bosilsa yopiladi. */
export function Modal({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-30 grid place-items-center overflow-y-auto bg-black/40 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div role="dialog" aria-modal="true" aria-label={label} className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
        {children}
      </div>
    </div>
  );
}
