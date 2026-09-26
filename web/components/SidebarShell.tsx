"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { clearToken } from "@/lib/api";

export interface NavItem {
  href: string;
  label: string;
  match: (pathname: string) => boolean;
  icon: React.ReactNode;
}

const svg = "size-5 flex-none";

/** Sidebar ikonkalari (admin va klinika paneli uchun umumiy). */
export const icons = {
  clinics: (
    <svg className={svg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M12 8v4M10 10h4" />
    </svg>
  ),
  stats: (
    <svg className={svg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  ),
  queue: (
    <svg className={svg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  verify: (
    <svg className={svg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4" />
    </svg>
  ),
  video: (
    <svg className={svg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="m10 9 5 3-5 3z" />
    </svg>
  ),
  playlist: (
    <svg className={svg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h13M3 12h9M3 18h9M16 14l5 3-5 3z" />
    </svg>
  ),
  info: (
    <svg className={svg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5" />
    </svg>
  ),
};

/** Chapda menyu, o'ngda sahifa. Tor ekranda menyu tepaga o'tadi. */
export function SidebarShell({
  nav,
  subtitle,
  children,
}: {
  nav: NavItem[];
  subtitle?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="min-h-screen md:flex">
      <aside className="flex items-center gap-2 border-b border-line bg-white px-4 py-3 md:sticky md:top-0 md:h-screen md:w-56 md:flex-none md:flex-col md:items-stretch md:gap-1 md:border-r md:border-b-0 md:px-3 md:py-4">
        <div className="mr-auto min-w-0 md:mr-0 md:mb-4 md:px-2">
          <Logo className="text-2xl" />
          {subtitle && <p className="truncate text-xs font-semibold text-muted max-md:hidden" title={subtitle}>{subtitle}</p>}
        </div>
        <nav className="flex gap-1 max-md:overflow-x-auto md:flex-col" aria-label="Asosiy menyu">
          {nav.map((n) => {
            const active = n.match(pathname);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-bold whitespace-nowrap ${
                  active ? "bg-brand-light text-brand" : "text-muted hover:bg-surface hover:text-ink"
                }`}
              >
                {n.icon}
                <span>{n.label}</span>
              </Link>
            );
          })}
        </nav>
        <button
          onClick={() => {
            clearToken();
            router.replace("/login");
          }}
          className="ml-2 rounded-md px-3 py-2 text-left text-sm font-bold text-muted hover:bg-surface hover:text-ink md:mt-auto md:ml-0"
        >
          Chiqish
        </button>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-5 pb-16 md:px-6">{children}</main>
    </div>
  );
}
