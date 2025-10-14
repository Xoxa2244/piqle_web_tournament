# Применение миграции к продакшн базе данных

## Проблема
Ошибка: `The column 'isPaid' does not exist in the current database`

Это означает, что миграция для обновления модели Player не была применена к продакшн базе данных.

## Решение

### Вариант 1: Через Supabase Dashboard (Рекомендуется)

1. Откройте Supabase Dashboard
2. Перейдите в ваш проект
3. Откройте SQL Editor
4. Выполните следующий SQL:

```sql
-- Migration to update Player model with new fields
-- Add new fields to players table

ALTER TABLE players 
ADD COLUMN IF NOT EXISTS dupr_rating DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_waitlist BOOLEAN DEFAULT false;

-- Update existing dupr field from DECIMAL to VARCHAR
-- First, create a temporary column
ALTER TABLE players ADD COLUMN IF NOT EXISTS dupr_temp VARCHAR;

-- Copy data from old dupr column to new temp column
UPDATE players SET dupr_temp = dupr::text WHERE dupr IS NOT NULL;

-- Drop the old dupr column
ALTER TABLE players DROP COLUMN IF EXISTS dupr;

-- Rename the temp column to dupr
ALTER TABLE players RENAME COLUMN dupr_temp TO dupr;

-- Add comment to clarify the change
COMMENT ON COLUMN players.dupr IS 'DUPR ID as string identifier';
COMMENT ON COLUMN players.dupr_rating IS 'DUPR rating from 0.00 to 5.00';
COMMENT ON COLUMN players.is_paid IS 'Payment status of the player';
COMMENT ON COLUMN players.is_waitlist IS 'Whether player is on waitlist';
```

### Вариант 2: Через скрипт (если есть доступ к DATABASE_URL)

1. Установите pg: `npm install pg`
2. Установите переменную окружения DATABASE_URL с продакшн строкой подключения
3. Запустите: `node apply-production-migration.js`

## Проверка

После применения миграции проверьте, что:
1. Колонки `is_paid` и `is_waitlist` существуют в таблице `players`
2. Колонка `dupr` имеет тип VARCHAR
3. Колонка `dupr_rating` имеет тип DECIMAL(3,2)

## Альтернативное решение

Если миграция не работает, можно временно убрать новые поля из кода:

1. В `server/routers/player.ts` убрать `isPaid` и `isWaitlist` из create/update мутаций
2. В компонентах убрать эти поля из форм
3. Применить миграцию позже
