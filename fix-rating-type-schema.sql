-- Исправление: Убедиться что RatingType в схеме public
-- Выполните если enum существует, но в другой схеме

-- Проверка текущей схемы enum
SELECT 
    n.nspname as schema_name,
    t.typname as type_name
FROM pg_type t
JOIN pg_namespace n ON t.typnamespace = n.oid
WHERE t.typname = 'RatingType';

-- Если enum не в схеме public, пересоздайте его:
-- Сначала удалите старый (если нужно)
-- DROP TYPE IF EXISTS "RatingType" CASCADE;

-- Создайте в правильной схеме
DO $$ BEGIN
    CREATE TYPE "public"."RatingType" AS ENUM ('LIKE', 'DISLIKE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

