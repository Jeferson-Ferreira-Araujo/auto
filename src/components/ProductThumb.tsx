import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

/**
 * Miniatura da foto do produto (bucket privado, servida via /api/media?product=).
 * Sem foto → um quadro neutro com ícone de caixa.
 */
export function ProductThumb({
  productId,
  hasImage,
  size = 44,
  className,
}: {
  productId: string;
  hasImage: boolean;
  size?: number;
  className?: string;
}) {
  const base = "shrink-0 overflow-hidden rounded-md border bg-[var(--color-bg)]";
  if (!hasImage) {
    return (
      <div
        className={cn(base, "flex items-center justify-center text-[var(--color-muted)]", className)}
        style={{ width: size, height: size }}
      >
        <Icon.box width={size * 0.5} height={size * 0.5} />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/media?product=${productId}`}
      alt=""
      loading="lazy"
      width={size}
      height={size}
      className={cn(base, "object-cover", className)}
      style={{ width: size, height: size }}
    />
  );
}
