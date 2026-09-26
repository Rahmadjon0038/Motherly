/** iOS uslubidagi yuklanish belgisi: 12 ta chiziq, ketma-ket so'nib yonadi. Rangi matn rangidan olinadi. */
export function Spinner({ className = "size-8" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      {Array.from({ length: 12 }, (_, i) => (
        <rect
          key={i}
          x="11"
          y="1.8"
          width="2.2"
          height="6"
          rx="1.1"
          transform={`rotate(${i * 30} 12 12)`}
          className="spinner-spoke"
          style={{ animationDelay: `${-(1 - i / 12)}s` }}
        />
      ))}
    </svg>
  );
}

/** Ma'lumot kelguncha sahifa o'rtasida ko'rinadigan belgi. */
export function PageLoader({ fullScreen = false, className = "" }: { fullScreen?: boolean; className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center justify-center text-muted ${fullScreen ? "min-h-screen" : "py-16"} ${className}`}
    >
      <Spinner className="size-8" />
      <span className="sr-only">Yuklanmoqda</span>
    </div>
  );
}
