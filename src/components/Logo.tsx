import { cn } from "@/lib/utils";

/**
 * Marca da AUTORA. O símbolo vem de `public/autora-logo.svg` — para trocar pelo
 * logo definitivo, basta substituir esse arquivo (mesmo path), sem mexer aqui.
 */
export function Logo({
  withWordmark = true,
  size = 32,
  className,
  wordmarkClassName,
}: {
  withWordmark?: boolean;
  size?: number;
  className?: string;
  wordmarkClassName?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/autora-logo.svg"
        alt="AUTORA"
        width={size}
        height={size}
        className="shrink-0 rounded-[calc(var(--radius)-4px)]"
      />
      {withWordmark && (
        <span className={cn("font-extrabold tracking-tight text-[var(--color-heading)]", wordmarkClassName)}>
          AUTORA
        </span>
      )}
    </span>
  );
}
