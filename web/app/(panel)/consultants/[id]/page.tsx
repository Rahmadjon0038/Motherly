"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { NurseCredentialsDialog } from "@/components/NurseCredentialsDialog";
import { PageLoader } from "@/components/Spinner";
import { api, errorMessage, fileUrl } from "@/lib/api";

interface NurseProfile {
  name: string;
  phone: string;
  field: string;
  registered: boolean;
  specialty: string;
  experience: number | null;
  education: string;
  languages: string;
  about: string;
  skills: string;
  photoUrl: string | null;
}

export default function ConsultantPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [p, setP] = useState<NurseProfile | null>(null);
  const [error, setError] = useState("");
  const [creds, setCreds] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    api<NurseProfile>(`/clinic/consultants/${id}/profile`).then(
      (r) => active && setP(r),
      (e) => active && setError(errorMessage(e)),
    );
    return () => {
      active = false;
    };
  }, [id, reloadKey]);

  async function remove() {
    if (!p || !window.confirm(`${p.name || p.phone} mutaxassislar ro'yxatingizdan chiqarilsinmi?`)) return;
    try {
      await api(`/clinic/consultants/${id}`, { method: "DELETE" });
      router.push("/consultants");
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (!p) {
    return (
      <div className="space-y-3">
        <Link href="/consultants" className="text-sm font-bold text-brand hover:underline">← Mutaxassislar</Link>
        {error ? <p role="alert" className="font-semibold text-red-600">{error}</p> : <PageLoader />}
      </div>
    );
  }

  const specialty = p.specialty || p.field;
  const empty = !p.photoUrl && !p.experience && !p.education && !p.languages && !p.about && !p.skills;

  return (
    <div className="max-w-3xl space-y-4">
      <Link href="/consultants" className="text-sm font-bold text-brand hover:underline">← Mutaxassislar</Link>

      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-line bg-white p-5">
        <div className="flex size-24 flex-none items-center justify-center overflow-hidden rounded-full bg-brand-light text-3xl font-extrabold text-brand">
          {p.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fileUrl(p.photoUrl)} alt="" className="size-full object-cover" />
          ) : (
            (p.name || "?").trim().charAt(0).toUpperCase()
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold">{p.name || "Ismi kiritilmagan"}</h1>
          {specialty && <p className="font-semibold text-brand">{specialty}</p>}
          <p className="font-mono text-sm text-muted">{p.phone}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setCreds(true)} className="btn-ghost">Login va parol</button>
          <button onClick={remove} className="btn-ghost text-red-600 hover:bg-red-50">Chiqarish</button>
        </div>
      </div>

      {error && <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">{error}</p>}

      {empty && (
        <p className="rounded-lg border border-dashed border-line bg-white px-4 py-6 text-center text-muted">
          Mutaxassis hali profilini to&apos;ldirmagan. Ilovaga kirib &quot;Profilim&quot; bo&apos;limida o&apos;zi to&apos;ldiradi.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Info label="Tajriba" value={p.experience != null ? `${p.experience} yil` : ""} />
        <Info label="Tillar" value={p.languages} />
      </div>
      <Info label="Qila oladigan ishlari" value={p.skills} />
      <Info label="O'zi haqida" value={p.about} />
      <Info label="Ta'lim" value={p.education} />

      {creds && (
        <NurseCredentialsDialog
          nurse={{ id: Number(id), name: p.name }}
          onClose={() => setCreds(false)}
          onChanged={() => setReloadKey((k) => k + 1)}
        />
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <section className="rounded-lg border border-line bg-white p-4">
      <h2 className="text-xs font-bold text-muted uppercase">{label}</h2>
      <p className={`mt-1 whitespace-pre-line ${value ? "" : "text-muted"}`}>{value || "Kiritilmagan"}</p>
    </section>
  );
}
