-- Foto do produto (chave R2, bucket privado). Servida via /api/media?product=<id>.
ALTER TABLE "products" ADD COLUMN "imageKey" TEXT;
