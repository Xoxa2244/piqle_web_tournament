# Решение проблемы с RatingType

## Проблема
Ошибка: `type "public.RatingType" does not exist`
Но таблица `tournament_ratings` существует и показывает тип `RatingType` в колонке `rating`.

## Возможные причины:

1. **Enum создан не в схеме `public`**
2. **Prisma Client не видит enum** (кэш)
3. **Сервер не перезапущен** после создания enum

## Решение (пошагово):

### Шаг 1: Проверьте существование enum

Выполните в Supabase SQL Editor:

```sql
SELECT 
    n.nspname as schema_name,
    t.typname as type_name
FROM pg_type t
JOIN pg_namespace n ON t.typnamespace = n.oid
WHERE t.typname = 'RatingType';
```

**Если результат пустой** → enum не существует, переходите к Шагу 2.

**Если результат есть, но `schema_name` не `public`** → переходите к Шагу 3.

### Шаг 2: Создайте enum явно

```sql
-- Удалить старый (если есть)
DROP TYPE IF EXISTS "RatingType" CASCADE;
DROP TYPE IF EXISTS "public"."RatingType" CASCADE;

-- Создать в правильной схеме
CREATE TYPE "public"."RatingType" AS ENUM ('LIKE', 'DISLIKE');
```

### Шаг 3: Перегенерируйте Prisma Client

В терминале проекта:

```bash
npx prisma generate
```

### Шаг 4: Перезапустите сервер

**ОБЯЗАТЕЛЬНО** перезапустите сервер разработки или перезапустите production сервер.

### Шаг 5: Проверьте работу

Попробуйте поставить лайк/дизлайк.

## Если все еще не работает:

1. Проверьте логи сервера - там должна быть более подробная ошибка
2. Убедитесь, что `DATABASE_URL` указывает на правильную базу данных
3. Попробуйте выполнить `FINAL_FIX_RATING_TYPE.sql`

