/**
 * Presets de melhoria de vídeo para Reels.
 * Dados PUROS (sem Prisma/Next) — compartilhado entre a app e o worker do GitHub Actions.
 * Vão do mais leve (Natural, Elegante) ao mais agressivo (Promoção).
 */

export type PresetName = "NATURAL" | "DINAMICO" | "PROMOCAO" | "ELEGANTE";
export const PRESET_NAMES: PresetName[] = ["NATURAL", "ELEGANTE", "DINAMICO", "PROMOCAO"];

export type ZoomStyle = "ramp" | "pulse" | "punch";

export type PresetSpec = {
  label: string;
  description: string;
  intensity: "leve" | "média" | "forte";
  fadeSec: number;
  zoomFrom: number;
  zoomTo: number;
  zoomStyle: ZoomStyle;
  /** fator de velocidade (1.0 = normal). Aplicado a vídeo e áudio. */
  speed: number;
  /** apara N segundos do início e do fim */
  trimSec: number;
  eq: { saturation: number; contrast: number; brightness: number; gamma: number };
  /** nitidez (unsharp). 0 = desligado */
  sharpen: number;
  /** tom quente (colorbalance) */
  warmTint: boolean;
  vignette: number; // 0 = off; 0.10..0.35 = ângulo PI/x mais fechado
  /** loudnorm target integrated loudness (LUFS) */
  loudnessI: number;
  title: { position: "top" | "bottom" | "center"; fontSize: number; box: boolean };
};

export const PRESETS: Record<PresetName, PresetSpec> = {
  NATURAL: {
    label: "Natural",
    description: "Leve: cor levemente realçada, nitidez sutil, quase sem zoom. Para vídeo que já está bom.",
    intensity: "leve",
    fadeSec: 0.3,
    zoomFrom: 1.0,
    zoomTo: 1.03,
    zoomStyle: "ramp",
    speed: 1.0,
    trimSec: 0,
    eq: { saturation: 1.07, contrast: 1.03, brightness: 0.0, gamma: 1.0 },
    sharpen: 0.4,
    warmTint: false,
    vignette: 0,
    loudnessI: -16,
    title: { position: "top", fontSize: 54, box: true },
  },
  ELEGANTE: {
    label: "Elegante",
    description: "Leve e cinematográfico: fade longo, tom quente, leve vinheta, zoom mínimo.",
    intensity: "leve",
    fadeSec: 0.7,
    zoomFrom: 1.0,
    zoomTo: 1.05,
    zoomStyle: "ramp",
    speed: 1.0,
    trimSec: 0,
    eq: { saturation: 0.93, contrast: 1.06, brightness: 0.0, gamma: 1.05 },
    sharpen: 0.3,
    warmTint: true,
    vignette: 0.16,
    loudnessI: -17,
    title: { position: "bottom", fontSize: 52, box: false },
  },
  DINAMICO: {
    label: "Dinâmico",
    description: "Forte: cor viva, zoom com pulso, ritmo acelerado. Para o dia a dia nas redes.",
    intensity: "forte",
    fadeSec: 0.15,
    zoomFrom: 1.0,
    zoomTo: 1.14,
    zoomStyle: "pulse",
    speed: 1.08,
    trimSec: 0,
    eq: { saturation: 1.32, contrast: 1.14, brightness: 0.02, gamma: 1.0 },
    sharpen: 1.0,
    warmTint: false,
    vignette: 0,
    loudnessI: -14,
    title: { position: "top", fontSize: 60, box: true },
  },
  PROMOCAO: {
    label: "Promoção",
    description: "Máximo impacto: cor saturada, zoom marcante (punch), corte seco, áudio alto. Estilo anúncio.",
    intensity: "forte",
    fadeSec: 0.1,
    zoomFrom: 1.06,
    zoomTo: 1.26,
    zoomStyle: "punch",
    speed: 1.12,
    trimSec: 0.3,
    eq: { saturation: 1.55, contrast: 1.22, brightness: 0.04, gamma: 0.96 },
    sharpen: 1.6,
    warmTint: false,
    vignette: 0.22,
    loudnessI: -13,
    title: { position: "top", fontSize: 68, box: true },
  },
};

export type VideoProbe = {
  durationSec: number;
  width: number;
  height: number;
  hasAudio: boolean;
};

/** Escolhe um preset automaticamente ("Melhorar automaticamente"). */
export function autoPickPreset(probe: VideoProbe): PresetName {
  if (probe.durationSec > 0 && probe.durationSec < 6) return "PROMOCAO";
  if (!probe.hasAudio) return "NATURAL";
  return "DINAMICO";
}
