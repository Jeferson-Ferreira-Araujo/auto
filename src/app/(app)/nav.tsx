"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/ui/icons";
import { Logo } from "@/components/Logo";
import { signOut } from "@/app/session-actions";

type NavItem = { href: string; label: string; icon: IconName; match?: (path: string, view: string | null) => boolean };

const ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Painel", icon: "home", match: (p, v) => p === "/dashboard" && v !== "desempenho" },
  { href: "/calendario", label: "Calendário", icon: "calendar", match: (p, v) => p.startsWith("/calendario") && v !== "lista" },
  { href: "/calendario?view=lista", label: "Publicações", icon: "posts", match: (p, v) => p.startsWith("/calendario") && v === "lista" },
  { href: "/biblioteca", label: "Mídia", icon: "media" },
  { href: "/categorias", label: "Categorias", icon: "tag" },
  { href: "/automacoes", label: "Automações", icon: "automation" },
  { href: "/instagram", label: "Instagram", icon: "instagram" },
  { href: "/dashboard?view=desempenho", label: "Desempenho", icon: "chart", match: (p, v) => p === "/dashboard" && v === "desempenho" },
  { href: "/configuracoes", label: "Configurações", icon: "settings" },
];

const ADMIN_ITEM: NavItem = {
  href: "/dashboard?view=admin",
  label: "Administração",
  icon: "shield",
  match: (p, v) => p === "/dashboard" && v === "admin",
};

const COLLAPSE_KEY = "autora_sidebar_collapsed";

export function Sidebar({
  orgName,
  orgHandle,
  paused,
  isSuperAdmin = false,
}: {
  orgName: string;
  orgHandle?: string | null;
  paused: boolean;
  isSuperAdmin?: boolean;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const view = params.get("view");
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(COLLAPSE_KEY) === "1") {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCollapsed(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  function toggleCollapse() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const brand = (
    <div className="flex items-center px-2">
      <Logo withWordmark={!collapsed} size={30} wordmarkClassName="text-[15px]" />
    </div>
  );

  const orgCard = !collapsed && (
    <Link
      href="/configuracoes"
      onClick={() => setOpen(false)}
      className="mx-1 flex items-center gap-2.5 rounded-[var(--radius)] border bg-[var(--color-surface)] p-2 hover:border-[var(--color-primary)]"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-xs font-bold text-[var(--color-primary)]">
        {orgName.slice(0, 1).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold leading-tight">{orgName}</span>
        {orgHandle && (
          <span className="block truncate text-xs text-[var(--color-muted)]">@{orgHandle}</span>
        )}
      </span>
      <Icon.chevronDown className="shrink-0 text-[var(--color-muted)]" width={16} height={16} />
    </Link>
  );

  const items = isSuperAdmin ? [...ITEMS, ADMIN_ITEM] : ITEMS;

  const nav = (
    <nav className="flex flex-col gap-0.5">
      {items.map((it) => {
        const active = it.match
          ? it.match(pathname, view)
          : pathname === it.href || pathname.startsWith(`${it.href}/`);
        const Ico = Icon[it.icon];
        return (
          <Link
            key={it.href}
            href={it.href}
            prefetch={false}
            onClick={() => setOpen(false)}
            title={collapsed ? it.label : undefined}
            className={cn(
              "flex items-center gap-3 rounded-[var(--radius)] px-3 py-2 text-sm transition-colors",
              collapsed && "justify-center px-2",
              active
                ? "bg-[var(--color-primary-soft)] font-semibold text-[var(--color-primary)]"
                : "text-[var(--color-text)] hover:bg-black/[0.04]",
            )}
          >
            <Ico className={active ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]"} />
            {!collapsed && it.label}
          </Link>
        );
      })}
    </nav>
  );

  const promo = !collapsed && (
    <div className="bg-gradient-brand mx-1 rounded-[var(--radius)] p-3.5 text-white">
      <div className="flex items-center gap-1.5 text-sm font-semibold">
        <Icon.rocket width={16} height={16} /> Publique mais, cresça mais!
      </div>
      <p className="mt-1 text-xs text-white/85">
        Mantenha uma frequência consistente e alcance mais pessoas todos os dias.
      </p>
      <Link
        href="/calendario"
        onClick={() => setOpen(false)}
        className="mt-2.5 block rounded-[calc(var(--radius)-2px)] bg-white/15 py-1.5 text-center text-xs font-semibold hover:bg-white/25"
      >
        Criar publicação
      </Link>
    </div>
  );

  const width = collapsed ? "md:w-[68px]" : "md:w-60";

  return (
    <>
      {/* topo mobile */}
      <div className="flex items-center justify-between border-b bg-[var(--color-surface)] px-4 py-3 md:hidden">
        {brand}
        <button onClick={() => setOpen((o) => !o)} className="rounded p-1 hover:bg-black/5" aria-label="Menu">
          ☰
        </button>
      </div>
      {open && (
        <div className="space-y-3 border-b bg-[var(--color-surface)] p-3 md:hidden">
          {orgCard}
          {nav}
          {promo}
          <form action={signOut}>
            <button className="w-full rounded-[var(--radius)] px-3 py-2 text-left text-sm text-[var(--color-muted)] hover:bg-black/5">
              Sair
            </button>
          </form>
        </div>
      )}

      {/* sidebar desktop */}
      <aside
        className={cn(
          "hidden shrink-0 flex-col gap-3 border-r bg-[var(--color-surface)] py-4 md:flex",
          width,
        )}
      >
        <div className="px-2">{brand}</div>
        {orgCard}
        {paused && !collapsed && (
          <div className="mx-1 rounded-md bg-amber-100 px-2 py-1.5 text-xs font-medium text-amber-800">
            Publicação automática pausada
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-2">{nav}</div>
        <div className="space-y-2 px-1">
          {promo}
          <button
            onClick={toggleCollapse}
            className={cn(
              "flex w-full items-center gap-2 rounded-[var(--radius)] px-3 py-2 text-sm text-[var(--color-muted)] hover:bg-black/5",
              collapsed && "justify-center px-2",
            )}
          >
            <Icon.chevronLeft className={cn("transition-transform", collapsed && "rotate-180")} width={16} height={16} />
            {!collapsed && "Recolher menu"}
          </button>
          <form action={signOut}>
            <button
              className={cn(
                "w-full rounded-[var(--radius)] px-3 py-2 text-left text-sm text-[var(--color-muted)] hover:bg-black/5",
                collapsed && "text-center",
              )}
            >
              {collapsed ? "⎋" : "Sair"}
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
