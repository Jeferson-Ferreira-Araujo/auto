/**
 * Definição dos presets de melhoria de vídeo para Reels.
 * Dados PUROS (sem dependência de Prisma/Next) — compartilhado entre a app e o worker
 * do GitHub Actions. Os valores da enum batem com `VideoPreset` do schema.
 */

export type PresetName = "NATURAL" | "DINAMICO" | "PROMOCAO" | "ELEGANTE";
export const PRESET_NAMES: PresetName[] = ["NATURAL", "DINAMICO", "PROMOCAO", "ELEGANTE"];

export type PresetSpec = {
  label: string;
  description: string;
  fadeSec: number;
  /** zoom no início e no fim do movimento (1.0 = sem zoom) */
  zoomFrom: number;
  zoomTo: number;
  /** pulso de zoom no meio do vídeo */
  zoomPulse: boolean;
  /** fator de velocidade (1.0 = normal). Aplicado a vídeo e áudio. */
  speed: number;
  /** apara N segundos do início e do fim */
  trimSec: number;
  eq: { saturation: number; contrast: number; brightness: number; gamma: number };
  vignette: boolean;
  /** loudnorm target integrated loudness (LUFS) */
  loudnessI: number;
  title: {
    position: "top" | "bottom" | "center";
    fontSize: number;
    box: boolean;
  };
};

export const PRESETS: Record<PresetName, PresetSpec> = {
  NATURAL: {
    label: "Natural",
    description: "Ajuste sutil: leve zoom, fade suave e cor equilibrada.",
    fadeSec: 0.4,
    zoomFrom: 1.0,
    zoomTo: 1.04,
    zoomPulse: false,
    speed: 1.0,
    trimSec: 0,
    eq: { saturation: 1.05, contrast: 1.0, brightness: 0.0, gamma: 1.0 },
    vignette: false,
    loudnessI: -16,
    title: { position: "top", fontSize: 54, box: true },
  },
  DINAMICO: {
    label: "Dinâmico",
    description: "Mais movimento e cor viva. Bom para o dia a dia.",
    fadeSec: 0.2,
    zoomFrom: 1.0,
    zoomTo: 1.08,
    zoomPulse: true,
    speed: 1.05,
    trimSec: 0,
    eq: { saturation: 1.15, contrast: 1.06, brightness: 0.0, gamma: 1.0 },
    vignette: false,
    loudnessI: -15,
    title: { position: "top", fontSize: 58, box: true },
  },
  PROMOCAO: {
    label: "Promoção",
    description: "Chama atenção: corte seco, punch de zoom e cor forte.",
    fadeSec: 0.15,
    zoomFrom: 1.0,
    zoomTo: 1.1,
    zoomPulse: true,
    speed: 1.06,
    trimSec: 0.25,
    eq: { saturation: 1.2, contrast: 1.08, brightness: 0.02, gamma: 1.0 },
    vignette: false,
    loudnessI: -14,
    title: { position: "top", fontSize: 64, box: true },
  },
  ELEGANTE: {
    label: "Elegante",
    description: "Visual clean: fade longo, zoom mínimo e tom quente.",
    fadeSec: 0.6,
    zoomFrom: 1.0,
    zoomTo: 1.03,
    zoomPulse: false,
    speed: 1.0,
    trimSec: 0,
    eq: { saturation: 0.95, contrast: 1.0, brightness: 0.0, gamma: 1.03 },
    vignette: true,
    loudnessI: -17,
    title: { position: "bottom", fontSize: 52, box: false },
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
  if (!probe.hasAudio) return "NATURAL";
  if (probe.durationSec > 0 && probe.durationSec < 6) return "DINAMICO";
  return "DINAMICO";
}
