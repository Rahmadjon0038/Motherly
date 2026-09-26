export function Logo({ className = "text-3xl" }: { className?: string }) {
  return (
    <span className={`font-black tracking-tighter ${className}`}>
      Mother<span className="text-brand">ly</span>
    </span>
  );
}
