/**
 * Layouts de montagem (grade) de fotos, no estilo comum do Instagram. Puro (sem `next/*`,
 * sem Prisma) — usado tanto no preview do formulário (client) quanto na composição real
 * com `sharp` no servidor (`collage-actions.ts`), então os dois lados desenham exatamente
 * a mesma coisa.
 *
 * `slots` são frações (0..1) do canvas quadrado, na ORDEM em que o usuário escolhe as fotos.
 */
export type CollageSlot = { x: number; y: number; w: number; h: number };
export type CollageLayout = { key: string; label: string; count: number; slots: CollageSlot[] };

export const COLLAGE_LAYOUTS: CollageLayout[] = [
  {
    key: "side2",
    label: "2 fotos — lado a lado",
    count: 2,
    slots: [
      { x: 0, y: 0, w: 0.5, h: 1 },
      { x: 0.5, y: 0, w: 0.5, h: 1 },
    ],
  },
  {
    key: "stack2",
    label: "2 fotos — empilhadas",
    count: 2,
    slots: [
      { x: 0, y: 0, w: 1, h: 0.5 },
      { x: 0, y: 0.5, w: 1, h: 0.5 },
    ],
  },
  {
    key: "big-left3",
    label: "3 fotos — grande + 2",
    count: 3,
    slots: [
      { x: 0, y: 0, w: 2 / 3, h: 1 },
      { x: 2 / 3, y: 0, w: 1 / 3, h: 0.5 },
      { x: 2 / 3, y: 0.5, w: 1 / 3, h: 0.5 },
    ],
  },
  {
    key: "big-top3",
    label: "3 fotos — grande em cima + 2",
    count: 3,
    slots: [
      { x: 0, y: 0, w: 1, h: 0.6 },
      { x: 0, y: 0.6, w: 0.5, h: 0.4 },
      { x: 0.5, y: 0.6, w: 0.5, h: 0.4 },
    ],
  },
  {
    key: "col3",
    label: "3 fotos — em coluna",
    count: 3,
    slots: [
      { x: 0, y: 0, w: 1, h: 1 / 3 },
      { x: 0, y: 1 / 3, w: 1, h: 1 / 3 },
      { x: 0, y: 2 / 3, w: 1, h: 1 / 3 },
    ],
  },
  {
    key: "grid4",
    label: "4 fotos — grade 2×2",
    count: 4,
    slots: [
      { x: 0, y: 0, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0, w: 0.5, h: 0.5 },
      { x: 0, y: 0.5, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
    ],
  },
];

export function findCollageLayout(key: string): CollageLayout | undefined {
  return COLLAGE_LAYOUTS.find((l) => l.key === key);
}
