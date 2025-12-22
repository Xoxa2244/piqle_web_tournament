-- Проверка существования RatingType enum
-- Выполните этот запрос в Supabase SQL Editor

-- 1. Проверка enum типа
SELECT 
    typname as enum_name,
    typtype as type_type,
    oid
FROM pg_type 
WHERE typname = 'RatingType';

-- 2. Проверка значений enum
SELECT 
    e.enumlabel as enum_value
FROM pg_enum e
JOIN pg_type t ON e.enumtypid = t.oid
WHERE t.typname = 'RatingType'
ORDER BY e.enumsortorder;

-- 3. Проверка схемы enum
SELECT 
    n.nspname as schema_name,
    t.typname as type_name
FROM pg_type t
JOIN pg_namespace n ON t.typnamespace = n.oid
WHERE t.typname = 'RatingType';

