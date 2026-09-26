import { mediaUrl } from "@/lib/display";

type Variant = Parameters<typeof mediaUrl>[1];

/**
 * Miniatura de mídia. Para imagens usa <img> na variante pedida.
 * Vídeos não têm miniatura gerada (o processamento na Vercel só lê metadados, não
 * extrai frame), então renderiza um <video> mudo apontando para o 1º frame — o
 * navegador pinta o quadro em `#t=0.1` sem baixar o vídeo inteiro.
 */
export function MediaThumb({
  id,
  type,
  alt = "",
  className,
  variant = "thumb",
}: {
  id: string;
  type: "IMAGE" | "VIDEO";
  alt?: string;
  className?: string;
  variant?: Variant;
}) {
  if (type === "VIDEO") {
    return (
      <video
        src={`${mediaUrl(id, variant === "thumb" ? "preview" : variant)}#t=0.1`}
        muted
        playsInline
        preload="metadata"
        aria-label={alt || undefined}
        className={className}
        tabIndex={-1}
      />
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={mediaUrl(id, variant)} alt={alt} className={className} />;
}

/** Selo discreto de "isto é um vídeo" — um botão de play pequeno no canto, não algo que pareça
 *  fazer parte do conteúdo da miniatura. Posicione com `className` (ex.: "bottom-1 right-1"). */
export function VideoPlayBadge({ className = "bottom-1 right-1" }: { className?: string }) {
  return (
    <span
      className={`pointer-events-none absolute flex h-5 w-5 items-center justify-center rounded-full bg-black/45 text-white ${className}`}
    >
      <svg width="7" height="8" viewBox="0 0 7 8" fill="currentColor" className="ml-[1px]">
        <path d="M0 0L7 4L0 8Z" />
      </svg>
    </span>
  );
}
