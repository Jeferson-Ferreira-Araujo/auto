-- ALTER TYPE ... ADD VALUE não pode rodar dentro da mesma transação das colunas —
-- foi aplicado separado via MCP (execute_sql) antes deste arquivo.
ALTER TYPE "VideoJobKind" ADD VALUE IF NOT EXISTS 'COLLAGE';

ALTER TABLE "video_jobs" ADD COLUMN "collageSlotKinds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "video_jobs" ADD COLUMN "collageLayoutKey" TEXT;
