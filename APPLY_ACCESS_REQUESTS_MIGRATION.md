# Apply Tournament Access Requests Migration

## Проблема
Ошибка: `The table \`public.tournament_access_requests\` does not exist in the current database.`

Это означает, что миграция для создания таблицы `tournament_access_requests` не была применена к продакшен базе данных.

## Решение

### Вариант 1: Через Supabase Dashboard (Рекомендуется)

1. Откройте [Supabase Dashboard](https://app.supabase.com/)
2. Выберите ваш проект
3. Перейдите в **SQL Editor**
4. Скопируйте и выполните SQL из файла `apply-tournament-access-requests-migration.sql`

Или скопируйте код ниже:

```sql
-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "AccessRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "tournament_access_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "status" "AccessRequestStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournament_access_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "tournament_access_requests_userId_tournamentId_key" 
    ON "tournament_access_requests"("userId", "tournamentId");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "tournament_access_requests" 
        ADD CONSTRAINT "tournament_access_requests_userId_fkey" 
        FOREIGN KEY ("userId") REFERENCES "users"("id") 
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "tournament_access_requests" 
        ADD CONSTRAINT "tournament_access_requests_tournamentId_fkey" 
        FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") 
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
```

### Вариант 2: Через Prisma Migrate (если есть доступ к DATABASE_URL)

Если у вас есть доступ к продакшен DATABASE_URL и возможность запустить миграции:

```bash
# Убедитесь, что DATABASE_URL указывает на продакшен
export DATABASE_URL="your-production-database-url"

# Примените миграцию
npx prisma migrate deploy
```

## Проверка

После применения миграции убедитесь, что:

1. Таблица `tournament_access_requests` существует
2. Enum `AccessRequestStatus` существует со значениями: 'PENDING', 'APPROVED', 'REJECTED'
3. Индекс на `userId` и `tournamentId` создан
4. Foreign key constraints установлены

Вы можете проверить это в Supabase Dashboard → Table Editor → `tournament_access_requests`

