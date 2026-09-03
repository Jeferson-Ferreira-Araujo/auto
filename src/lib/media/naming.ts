import { MediaType } from "@prisma/client";

/** Padrões de nome de arquivo que não dizem nada ao usuário. */
const JUNK = [
  /^chatgpt[\s_-]*image/i,
  /^img[\s_-]*\d+/i,
  /^dsc[\s_-]*\d+/i,
  /^dcim/i,
  /^screenshot/i,
  /^captura[\s_-]*de[\s_-]*tela/i,
  /^whatsapp[\s_-]*(image|video|audio)/i,
  /^(photo|image|video|foto|imagem|video)[\s_-]*\d+/i,
  /^\d{8}[\s_-]?\d{6}/, // 20260903_143512
  /^(download|unnamed|untitled|sem[\s_-]?t[íi]tulo|copy|c[óo]pia)\b/i,
  /^[0-9a-f]{8,}$/i, // hash puro
  /^[\d\s._-]+$/, // só números/símbolos
];

function cleanLabel(raw: string): string {
  return raw
    .replace(/\.[^.]+$/, "") // extensão
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shortDate(d: Date, timeZone = "America/Sao_Paulo"): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(d)
    .replace(",", "");
}

/**
 * Nome amigável para exibir na biblioteca.
 * - Se o nome do arquivo parecer útil (ex.: "promo-natal.jpg"), usa ele limpo.
 * - Se for lixo (ChatGPT Image..., IMG_1234, Screenshot..., etc.), gera um nome com data.
 * O usuário pode renomear depois de qualquer forma.
 */
export function friendlyMediaName(
  originalFileName: string,
  type: MediaType,
  now = new Date(),
  timeZone?: string,
): string {
  const label = cleanLabel(originalFileName);
  const prefix = type === MediaType.IMAGE ? "Imagem" : "Vídeo";

  const looksJunk = label.length < 2 || JUNK.some((re) => re.test(label));
  if (looksJunk) return `${prefix} — ${shortDate(now, timeZone)}`;

  // Capitaliza a primeira letra e limita o tamanho.
  const nice = label.charAt(0).toUpperCase() + label.slice(1);
  return nice.slice(0, 80);
}
