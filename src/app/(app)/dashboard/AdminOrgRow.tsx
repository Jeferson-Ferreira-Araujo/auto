"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { setOrgBlocked, setOrgLimits } from "./admin-actions";

export type AdminOrg = {
  id: string;
  name: string;
  createdAt: string;
  blocked: boolean;
  members: number;
  mediaCount: number;
  mediaLimit: number;
  uploadLimitMb: number;
  storageLimitMb: number;
  usedLabel: string;
  pct: number;
  needsPlan: boolean;
  scheduled: number;
  published: number;
  igStatus: string | null;
  igUsername: string | null;
};

export function AdminOrgRow({ org }: { org: AdminOrg }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);

  function toggleBlock() {
    const next = !org.blocked;
    if (next && !confirm(`Bloquear a empresa "${org.name}"? As publicações param imediatamente.`)) return;
    start(async () => {
      const res = await setOrgBlocked({ orgId: org.id, blocked: next });
      if (!res.ok) return toast.push(res.error.message, "error");
      toast.push(next ? "Empresa bloqueada" : "Empresa desbloqueada", "success");
      router.refresh();
    });
  }

  return (
    <tr className={`border-b last:border-0 ${org.blocked ? "bg-red-50/40" : ""}`}>
      <td className="p-3">
        <div className="font-medium">{org.name}</div>
        <div className="text-xs text-[var(--color-muted)]">
          desde {new Date(org.createdAt).toLocaleDateString("pt-BR")}
        </div>
      </td>
      <td className="p-3">{org.members}</td>
      <td className="p-3">
        {org.mediaCount}
        <span className="text-xs text-[var(--color-muted)]"> / {org.mediaLimit}</span>
      </td>
      <td className="p-3">
        <div>
          {org.usedLabel}
          <span className="text-xs text-[var(--color-muted)]"> / {org.storageLimitMb} MB</span>
        </div>
        <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-black/10">
          <div
            className={`h-full ${org.pct >= 80 ? "bg-red-500" : "bg-[var(--color-primary)]"}`}
            style={{ width: `${Math.min(100, org.pct)}%` }}
          />
        </div>
        {org.needsPlan && (
          <span className="mt-1 inline-block rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
            Precisa de plano
          </span>
        )}
      </td>
      <td className="p-3 text-xs">
        {org.scheduled} / {org.published}
      </td>
      <td className="p-3 text-xs">
        {org.igStatus === "CONNECTED" ? (
          <span className="text-green-700">@{org.igUsername}</span>
        ) : org.igStatus ? (
          <span className="text-amber-700">reconectar</span>
        ) : (
          <span className="text-[var(--color-muted)]">—</span>
        )}
      </td>
      <td className="p-3">
        {org.blocked ? (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">Bloqueada</span>
        ) : (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Ativa</span>
        )}
      </td>
      <td className="p-3">
        <div className="flex justify-end gap-1.5">
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)} disabled={pending}>
            Limites
          </Button>
          <Button
            size="sm"
            variant={org.blocked ? "secondary" : "danger"}
            onClick={toggleBlock}
            disabled={pending}
          >
            {org.blocked ? "Desbloquear" : "Bloquear"}
          </Button>
        </div>
        {editing && (
          <LimitsModal org={org} onClose={() => setEditing(false)} onSaved={() => router.refresh()} />
        )}
      </td>
    </tr>
  );
}

function LimitsModal({
  org,
  onClose,
  onSaved,
}: {
  org: AdminOrg;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [mediaLimit, setMediaLimit] = useState(String(org.mediaLimit));
  const [uploadLimitMb, setUploadLimitMb] = useState(String(org.uploadLimitMb));
  const [storageLimitMb, setStorageLimitMb] = useState(String(org.storageLimitMb));

  function save() {
    start(async () => {
      const res = await setOrgLimits({
        orgId: org.id,
        mediaLimit: Number(mediaLimit),
        uploadLimitMb: Number(uploadLimitMb),
        storageLimitMb: Number(storageLimitMb),
      });
      if (!res.ok) return toast.push(res.error.message, "error");
      toast.push("Limites atualizados", "success");
      onClose();
      onSaved();
    });
  }

  return (
    <Modal open onClose={onClose} title={`Limites — ${org.name}`}>
      <Field label="Máximo de mídias">
        <Input type="number" value={mediaLimit} onChange={(e) => setMediaLimit(e.target.value)} />
      </Field>
      <Field label="Tamanho máximo por arquivo (MB)">
        <Input type="number" value={uploadLimitMb} onChange={(e) => setUploadLimitMb(e.target.value)} />
      </Field>
      <Field label="Armazenamento total (MB)" hint="Referência para o alerta 'Precisa de plano'.">
        <Input type="number" value={storageLimitMb} onChange={(e) => setStorageLimitMb(e.target.value)} />
      </Field>
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={pending}>
          Cancelar
        </Button>
        <Button onClick={save} disabled={pending}>
          Salvar
        </Button>
      </div>
    </Modal>
  );
}
