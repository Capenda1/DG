-- Rename enum DesignTemplateCategory to replace old values with new ones
-- Since PostgreSQL doesn't support removing enum values directly,
-- we recreate the enum.

-- 1. Remove the default so we can alter the column
ALTER TABLE "design_templates" ALTER COLUMN "category" DROP DEFAULT;

-- 2. Change column type to text temporarily
ALTER TABLE "design_templates" ALTER COLUMN "category" TYPE TEXT;

-- 3. Drop the old enum
DROP TYPE "DesignTemplateCategory";

-- 4. Create the new enum
CREATE TYPE "DesignTemplateCategory" AS ENUM (
  'ANIVERSARIOS',
  'MARCO_MULHER',
  'FIM_DE_ANO',
  'FINALISTAS',
  'GRUPOS',
  'IGREJAS',
  'OUTROS'
);

-- 5. Migrate existing data (map old values → OUTROS as fallback)
UPDATE "design_templates"
SET "category" = 'OUTROS'
WHERE "category" NOT IN (
  'ANIVERSARIOS', 'MARCO_MULHER', 'FIM_DE_ANO',
  'FINALISTAS', 'GRUPOS', 'IGREJAS', 'OUTROS'
);

-- 6. Restore column type with new enum
ALTER TABLE "design_templates"
  ALTER COLUMN "category" TYPE "DesignTemplateCategory"
  USING "category"::"DesignTemplateCategory";

-- 7. Restore default
ALTER TABLE "design_templates" ALTER COLUMN "category" SET DEFAULT 'OUTROS'::"DesignTemplateCategory";
