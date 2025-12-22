-- ФИНАЛЬНОЕ ИСПРАВЛЕНИЕ: Создание RatingType enum
-- Выполните этот SQL в Supabase SQL Editor

-- Шаг 1: Удалить enum если он существует в неправильной схеме
DROP TYPE IF EXISTS "RatingType" CASCADE;
DROP TYPE IF EXISTS "public"."RatingType" CASCADE;

-- Шаг 2: Создать enum в правильной схеме (public)
CREATE TYPE "public"."RatingType" AS ENUM ('LIKE', 'DISLIKE');

-- Шаг 3: Проверка - должен вернуть результат
SELECT 
    n.nspname as schema_name,
    t.typname as type_name
FROM pg_type t
JOIN pg_namespace n ON t.typnamespace = n.oid
WHERE t.typname = 'RatingType';

-- Если таблица tournament_ratings существует, но использует неправильный тип rating:
-- (Раскомментируйте только если нужно)
/*
ALTER TABLE "tournament_ratings" 
ALTER COLUMN "rating" TYPE "public"."RatingType" 
USING "rating"::text::"public"."RatingType";
*/

