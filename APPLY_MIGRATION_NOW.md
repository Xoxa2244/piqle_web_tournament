# ⚠️ СРОЧНО: Применить миграцию для лайков/дизлайков

## Проблема
Ошибка: `type "public.RatingType" does not exist`

Это означает, что миграция **НЕ ПРИМЕНЕНА** к базе данных.

## Решение (выполните СЕЙЧАС):

### 1. Откройте Supabase Dashboard
- Перейдите на https://supabase.com/dashboard
- Выберите ваш проект
- Откройте **SQL Editor** (в левом меню)

### 2. Скопируйте и выполните этот SQL:

```sql
-- Create RatingType enum
DO $$ BEGIN
    CREATE TYPE "RatingType" AS ENUM ('LIKE', 'DISLIKE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Drop table if exists (safe if empty)
DROP TABLE IF EXISTS "tournament_ratings" CASCADE;

-- Create tournament_ratings table
CREATE TABLE "tournament_ratings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tournamentId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "rating" "RatingType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tournament_ratings_pkey" PRIMARY KEY ("id")
);

-- Create unique constraint
CREATE UNIQUE INDEX "tournament_ratings_userId_tournamentId_key" 
ON "tournament_ratings"("userId", "tournamentId");

-- Create foreign keys
ALTER TABLE "tournament_ratings" 
ADD CONSTRAINT "tournament_ratings_tournamentId_fkey" 
FOREIGN KEY ("tournamentId") 
REFERENCES "tournaments"("id") 
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tournament_ratings" 
ADD CONSTRAINT "tournament_ratings_userId_fkey" 
FOREIGN KEY ("userId") 
REFERENCES "users"("id") 
ON DELETE CASCADE ON UPDATE CASCADE;

-- Create indexes
CREATE INDEX "tournament_ratings_tournamentId_idx" ON "tournament_ratings"("tournamentId");
CREATE INDEX "tournament_ratings_userId_idx" ON "tournament_ratings"("userId");
```

### 3. Нажмите "Run" или Ctrl+Enter

### 4. Проверьте результат
Должно появиться сообщение об успешном выполнении.

### 5. Проверьте, что все создано:

Выполните этот запрос для проверки:

```sql
-- Проверка enum
SELECT typname FROM pg_type WHERE typname = 'RatingType';

-- Проверка таблицы
SELECT column_name, data_type, udt_name
FROM information_schema.columns 
WHERE table_name = 'tournament_ratings';
```

Должны увидеть:
- `RatingType` в списке типов
- Таблицу `tournament_ratings` с колонками `id`, `tournamentId`, `userId`, `rating`, `createdAt`, `updatedAt`

## После применения миграции:

1. Перезагрузите страницу приложения
2. Попробуйте поставить лайк/дизлайк
3. Должно работать!

---

**Важно:** Если вы видите ошибку при выполнении SQL, скопируйте текст ошибки и сообщите мне.

