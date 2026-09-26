"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { icons, type NavItem, SidebarShell } from "@/components/SidebarShell";
import { api, clearToken, getToken } from "@/lib/api";
import { PageLoader } from "@/components/Spinner";

const nav: NavItem[] = [
  { href: "/", label: "Murojaatlar", match: (p) => p === "/", icon: icons.queue },
  { href: "/stats", label: "Statistika", match: (p) => p.startsWith("/stats"), icon: icons.stats },
  { href: "/consultants", label: "Mutaxassislar", match: (p) => p.startsWith("/consultants"), icon: icons.verify },
  { href: "/clinic", label: "Klinika ma'lumotlari", match: (p) => p.startsWith("/clinic"), icon: icons.info },
];

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [clinicName, setClinicName] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function check() {
      if (!getToken()) return router.replace("/login");
      try {
        const me = await api<{ role: string; name: string | null }>("/me");
        if (me.role === "admin") return router.replace("/admin");
        if (me.role !== "clinic") throw new Error("not a clinic");
        if (active) setClinicName(me.name ?? "");
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

  if (clinicName === null) {
    return <PageLoader fullScreen />;
  }

  return (
    <SidebarShell nav={nav} subtitle={clinicName || undefined}>
      {children}
    </SidebarShell>
  );
}
