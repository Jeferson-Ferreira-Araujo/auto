"use client";

import { PASSWORD_RULES } from "@/lib/auth/password";

/** Lista de requisitos da senha, com marcação ao vivo conforme o usuário digita. */
export function PasswordChecklist({ password }: { password: string }) {
  return (
    <ul className="mb-3 space-y-0.5 text-xs">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(password);
        return (
          <li
            key={rule.key}
            className={ok ? "text-[var(--color-success)]" : "text-[var(--color-muted)]"}
          >
            {ok ? "✓" : "○"} {rule.label}
          </li>
        );
      })}
    </ul>
  );
}
