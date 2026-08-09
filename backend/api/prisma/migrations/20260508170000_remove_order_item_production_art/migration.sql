-- Reverte tabelas de «arte de produção por linha» (se existirem).
DROP TABLE IF EXISTS "order_item_art_variant_face_overrides" CASCADE;
DROP TABLE IF EXISTS "order_item_art_variants" CASCADE;
DROP TABLE IF EXISTS "order_item_art_default_faces" CASCADE;
DROP TABLE IF EXISTS "order_item_arts" CASCADE;
DROP TYPE IF EXISTS "OrderItemProductionArtStatus";
DROP TYPE IF EXISTS "PrintFaceSide";
