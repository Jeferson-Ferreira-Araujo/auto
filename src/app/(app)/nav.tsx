"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/dashboard", label: "Painel", icon: "▦" },
  { href: "/biblioteca", label: "Biblioteca", icon: "▣" },
  { href: "/categorias", label: "Categorias", icon: "☷" },
  { href: "/calendario", label: "Calendário", icon: "▤" },
  { href: "/automacoes", label: "Automações", icon: "↻" },
  { href: "/instagram", label: "Instagram", icon: "◎" },
  { href: "/historico", label: "Histórico", icon: "≣" },
  { href: "/configuracoes", label: "Configurações", icon: "⚙" },
];

export function Sidebar({ orgName, paused }: { orgName: string; paused: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="flex flex-col gap-0.5">
      {ITEMS.map((it) => {
        const active = pathname === it.href || pathname.startsWith(`${it.href}/`);
        return (
          <Link
            key={it.href}
            href={it.href}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-[var(--radius)] px-3 py-2 text-sm",
              active
                ? "bg-[var(--color-primary)]/10 font-medium text-[var(--color-primary)]"
                : "text-[var(--color-text)] hover:bg-black/5",
            )}
          >
            <span className="w-4 text-center opacity-70">{it.icon}</span>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* topo mobile */}
      <div className="flex items-center justify-between border-b bg-[var(--color-surface)] px-4 py-3 md:hidden">
        <span className="font-bold text-[var(--color-primary)]">InstaPub</span>
        <button onClick={() => setOpen((o) => !o)} className="rounded p-1 hover:bg-black/5" aria-label="Menu">
          ☰
        </button>
      </div>
      {open && (
        <div className="border-b bg-[var(--color-surface)] p-3 md:hidden">
          {nav}
          <form action="/auth/signout" method="post" className="mt-2">
            <button className="w-full rounded-[var(--radius)] px-3 py-2 text-left text-sm text-[var(--color-muted)] hover:bg-black/5">
              Sair
            </button>
          </form>
        </div>
      )}

      {/* sidebar desktop */}
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-[var(--color-surface)] p-3 md:flex">
        <div className="px-2 py-2">
          <div className="font-bold text-[var(--color-primary)]">InstaPub</div>
          <div className="truncate text-xs text-[var(--color-muted)]">{orgName}</div>
        </div>
        {paused && (
          <div className="mx-1 mb-2 rounded-md bg-amber-100 px-2 py-1.5 text-xs font-medium text-amber-800">
            Publicação automática pausada
          </div>
        )}
        <div className="mt-1 flex-1">{nav}</div>
        <form action="/auth/signout" method="post">
          <button className="w-full rounded-[var(--radius)] px-3 py-2 text-left text-sm text-[var(--color-muted)] hover:bg-black/5">
            Sair
          </button>
        </form>
      </aside>
    </>
  );
}
