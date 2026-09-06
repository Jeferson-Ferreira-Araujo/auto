import { cn } from "@/lib/utils";

/**
 * Marca da AUTORA. Dois arquivos em `public/`:
 *  - `autora-mark.png`  — só o símbolo (quadrado), usado no menu/favicon.
 *  - `autora-logo.png`  — lockup completo (símbolo + wordmark + slogan), usado no login.
 * Para trocar a marca, substitua esses arquivos (mesmo path), sem mexer aqui.
 */
export function Logo({
  lockup = false,
  withWordmark = true,
  size = 32,
  className,
  wordmarkClassName,
}: {
  lockup?: boolean;
  withWordmark?: boolean;
  size?: number;
  className?: string;
  wordmarkClassName?: string;
}) {
  if (lockup) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src="/autora-logo.png" alt="AUTORA — seu negócio no automático" className={cn("h-auto w-full max-w-[220px]", className)} />
    );
  }
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/autora-mark.png"
        alt="AUTORA"
        width={size}
        height={size}
        className="shrink-0"
      />
      {withWordmark && (
        <span className={cn("font-extrabold tracking-tight text-[var(--color-heading)]", wordmarkClassName)}>
          AUTORA
        </span>
      )}
    </span>
  );
}
