"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { icons, type NavItem, SidebarShell } from "@/components/SidebarShell";
import { api, clearToken, getToken } from "@/lib/api";
import { PageLoader } from "@/components/Spinner";

const nav: NavItem[] = [
  { href: "/admin", label: "Klinikalar", match: (p) => p === "/admin" || p.startsWith("/admin/clinics"), icon: icons.clinics },
  { href: "/admin/videos", label: "Video darslar", match: (p) => p.startsWith("/admin/videos") || p.startsWith("/admin/playlists"), icon: icons.video },
  { href: "/admin/stats", label: "Statistika", match: (p) => p.startsWith("/admin/stats"), icon: icons.stats },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    async function check() {
      if (!getToken()) return router.replace("/login");
      try {
        const me = await api<{ role: string }>("/me");
        if (me.role === "clinic") return router.replace("/");
        if (me.role !== "admin") throw new Error("not an admin");
        if (active) setReady(true);
      } catch {
        clearToken();
        router.replace("/login");
      }
    }
    void check();
    return () => {
      active = false;
    };
  }, [router]);

  if (!ready) {
    return <PageLoader fullScreen />;
  }

  return <SidebarShell nav={nav}>{children}</SidebarShell>;
}
