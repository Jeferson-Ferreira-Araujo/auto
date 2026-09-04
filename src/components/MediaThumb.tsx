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
