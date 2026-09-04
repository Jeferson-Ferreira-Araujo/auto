"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { setUserBlocked, setUserSuperAdmin } from "./admin-actions";

export type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  blocked: boolean;
  isSuperAdmin: boolean;
  orgs: string[];
  isSelf: boolean;
};

export function AdminUserRow({ user }: { user: AdminUser }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();

  function toggleBlock() {
    const next = !user.blocked;
    if (next && !confirm(`Bloquear ${user.email}? A pessoa perde o acesso ao sistema.`)) return;
    start(async () => {
      const res = await setUserBlocked({ userId: user.id, blocked: next });
      if (!res.ok) return toast.push(res.error.message, "error");
      toast.push(next ? "Usuário bloqueado" : "Usuário desbloqueado", "success");
      router.refresh();
    });
  }

  function toggleAdmin() {
    const next = !user.isSuperAdmin;
    if (!confirm(next ? `Tornar ${user.email} administrador do sistema?` : `Remover admin de ${user.email}?`))
      return;
    start(async () => {
      const res = await setUserSuperAdmin({ userId: user.id, value: next });
      if (!res.ok) return toast.push(res.error.message, "error");
      toast.push("Permissão atualizada", "success");
      router.refresh();
    });
  }

  return (
    <tr className={`border-b last:border-0 ${user.blocked ? "bg-red-50/40" : ""}`}>
      <td className="p-3">
        <div className="font-medium">{user.name ?? user.email}</div>
        {user.name && <div className="text-xs text-[var(--color-muted)]">{user.email}</div>}
        {user.isSelf && <span className="text-[11px] text-[var(--color-muted)]">(você)</span>}
      </td>
      <td className="p-3 text-xs">{user.orgs.length ? user.orgs.join(", ") : "—"}</td>
      <td className="p-3 text-xs">{new Date(user.createdAt).toLocaleDateString("pt-BR")}</td>
      <td className="p-3">
        <div className="flex flex-wrap gap-1">
          {user.isSuperAdmin && (
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800">
              Admin
            </span>
          )}
          {user.blocked ? (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">Bloqueado</span>
          ) : (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Ativo</span>
          )}
        </div>
      </td>
      <td className="p-3">
        <div className="flex justify-end gap-1.5">
          {!user.isSelf && (
            <Button size="sm" variant="secondary" onClick={toggleAdmin} disabled={pending}>
              {user.isSuperAdmin ? "Remover admin" : "Tornar admin"}
            </Button>
          )}
          {!user.isSelf && (
            <Button
              size="sm"
              variant={user.blocked ? "secondary" : "danger"}
              onClick={toggleBlock}
              disabled={pending}
            >
              {user.blocked ? "Desbloquear" : "Bloquear"}
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
