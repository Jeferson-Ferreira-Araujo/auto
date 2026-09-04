"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icons";
import { signOut } from "@/app/session-actions";

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function Topbar({ userName, userRole }: { userName: string; userRole: string }) {
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-end gap-2 border-b bg-[var(--color-surface)]/90 px-4 backdrop-blur sm:px-6 lg:px-8">
      <Link
        href="/calendario"
        className="inline-flex h-10 items-center gap-1.5 rounded-[var(--radius)] bg-[var(--color-primary)] px-3.5 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]"
      >
        <Icon.plus width={18} height={18} /> Nova publicação
      </Link>

      <Link
        href="/calendario?view=lista"
        aria-label="Notificações"
        className="flex h-10 w-10 items-center justify-center rounded-[var(--radius)] text-[var(--color-muted)] hover:bg-black/5"
      >
        <Icon.bell />
      </Link>

      <div ref={ref} className="relative">
        <button
          onClick={() => setMenu((m) => !m)}
          className="flex items-center gap-2 rounded-[var(--radius)] py-1.5 pl-1.5 pr-2 hover:bg-black/5"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-xs font-bold text-[var(--color-primary)]">
            {initials(userName) || "U"}
          </span>
          <span className="hidden text-left leading-tight sm:block">
            <span className="block text-sm font-semibold">{userName}</span>
            <span className="block text-xs text-[var(--color-muted)]">{userRole}</span>
          </span>
          <Icon.chevronDown className="text-[var(--color-muted)]" width={16} height={16} />
        </button>

        {menu && (
          <div className="absolute right-0 mt-1 w-48 overflow-hidden rounded-[var(--radius)] border bg-[var(--color-surface)] py-1 shadow-lg">
            <Link
              href="/configuracoes"
              onClick={() => setMenu(false)}
              className="block px-3 py-2 text-sm hover:bg-black/5"
            >
              Configurações
            </Link>
            <form action={signOut}>
              <button className="block w-full px-3 py-2 text-left text-sm text-[var(--color-danger)] hover:bg-black/5">
                Sair
              </button>
            </form>
          </div>
        )}
      </div>
    </header>
  );
}
