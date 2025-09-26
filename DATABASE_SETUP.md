# Database Setup Instructions

## Проблема
База данных Supabase не создана, поэтому при попытке создать турнир возникает ошибка 404.

## Решение

### Вариант 1: Создать новый проект Supabase
1. Перейдите на [supabase.com](https://supabase.com)
2. Создайте новый проект
3. Получите новые учетные данные:
   - Database URL
   - Supabase URL
   - Anon Key
   - Service Role Key
4. Обновите переменные окружения в Vercel

### Вариант 2: Использовать существующий проект
Если у вас уже есть проект Supabase:
1. Перейдите в панель управления Supabase
2. Откройте раздел "SQL Editor"
3. Выполните SQL скрипт из файла `prisma/migrations/20250101000000_init/migration.sql`
4. Убедитесь, что переменные окружения настроены правильно

### Вариант 3: Локальная настройка
1. Создайте файл `.env.local` в корне проекта:
```env
DATABASE_URL="postgresql://postgres:Kwpc75md8!!!@db.angwdmyswzztmlrdzgxm.supabase.co:5432/postgres"
NEXT_PUBLIC_SUPABASE_URL="https://angwdmyswzztmlrdzgxm.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFuZ3dkbXlzd3p6dG1scmR6Z3htIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4NzA3MjgsImV4cCI6MjA3NDQ0NjcyOH0.tCL0LVOPyGYID9_4XftCwXwLqSDiwM9YvtlmTWdrTBo"
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFuZ3dkbXlzd3p6dG1scmR6Z3htIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1ODg3MDcyOCwiZXhwIjoyMDc0NDQ2NzI4fQ.o88piotALs9_JHN5KRzZffrFku6fgueLw6Wuu4kBtF8"
```

2. Выполните команду:
```bash
npx prisma db push
```

## Проверка
После настройки базы данных:
1. Перезапустите приложение
2. Попробуйте создать турнир
3. Проверьте, что данные сохраняются в Supabase

## SQL для создания таблиц
Если нужно создать таблицы вручную, используйте SQL из файла `prisma/migrations/20250101000000_init/migration.sql`
