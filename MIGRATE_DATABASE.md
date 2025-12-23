# Инструкция по переносу базы данных Supabase

## 📋 Обзор
Эта инструкция поможет вам перенести базу данных из одного проекта Supabase (продакшн) в другой проект (тестовая среда).

> 💡 **Важно**: Все команды в этой инструкции нужно выполнять в **корне проекта** (папка `piqle_web_tournament`), где находится папка `scripts`. Чтобы открыть терминал в нужной папке:
> - Откройте проводник Windows
> - Перейдите в `C:\Users\MSI\Documents\GitHub\piqle_web_tournament`
> - Нажмите правой кнопкой мыши → "Открыть в терминале"
> - Или в PowerShell выполните: `cd C:\Users\MSI\Documents\GitHub\piqle_web_tournament`

---

## 🎯 Шаг 1: Создание нового проекта Supabase (тестового)

1. Откройте [supabase.com](https://supabase.com) и войдите в свой аккаунт
2. Нажмите кнопку **"New Project"** (Новый проект)
3. Заполните форму:
   - **Name**: например, `piqle-tournament-test` (или любое другое имя)
   - **Database Password**: придумайте надежный пароль (⚠️ **ОБЯЗАТЕЛЬНО СОХРАНИТЕ ЕГО!**)
   - **Region**: выберите ближайший регион
4. Нажмите **"Create new project"**
5. Подождите 2-3 минуты, пока проект создается

---

## 🔑 Шаг 2: Получение данных для подключения к новому проекту

1. В новом проекте перейдите в **Settings** (Настройки) → **API**
2. Найдите секцию **"Project API keys"**
3. Скопируйте следующие значения (они понадобятся позже):
   - **Project URL** (например: `https://xxxxx.supabase.co`)
   - **anon public** ключ
   - **service_role** ключ (⚠️ **НЕ ПОКАЗЫВАЙТЕ ЕГО НИКОМУ!**)

4. Перейдите в **Settings** → **Database**
5. Найдите секцию **"Connection string"**
6. Выберите **"Session mode"** (не Transaction mode)
7. Скопируйте строку подключения (она начинается с `postgresql://...`)

---

## 📤 Шаг 3: Экспорт данных из старого проекта (продакшн)

### Вариант A: Экспорт через Supabase Dashboard (простой способ)

1. Откройте **старый проект** (продакшн) в Supabase Dashboard
2. Перейдите в **SQL Editor** (SQL редактор)
3. Создайте новый запрос и выполните следующий SQL для экспорта всех таблиц:

```sql
-- Экспорт всех данных (выполните этот запрос)
-- ВАЖНО: Этот способ экспортирует только данные, не структуру таблиц!
```

**⚠️ ВАЖНО**: Supabase Dashboard не имеет встроенной функции экспорта. Используйте Вариант B или C.

### Вариант B: Экспорт через pg_dump (рекомендуемый способ)

#### Способ 1: Использование готового скрипта (проще всего!)

1. Убедитесь, что у вас установлен PostgreSQL (или используйте WSL)
2. Получите строку подключения к **старому проекту**:
   - Откройте старый проект в Supabase Dashboard
   - Settings → Database → Connection string
   - Выберите **"Session mode"**
   - Скопируйте строку подключения

3. **Откройте PowerShell в корне проекта** (папка `piqle_web_tournament`)
   - Откройте проводник Windows
   - Перейдите в папку проекта: `C:\Users\MSI\Documents\GitHub\piqle_web_tournament`
   - Нажмите правой кнопкой мыши в пустом месте папки
   - Выберите "Открыть в терминале" или "Open in Terminal"
   - Или откройте PowerShell и выполните: `cd C:\Users\MSI\Documents\GitHub\piqle_web_tournament`

4. Выполните команду экспорта:

```powershell
.\scripts\migrate-db.ps1 -Action export -ConnectionString "YOUR_OLD_CONNECTION_STRING" -OutputFile "backup.sql"
```

💡 **Важно**: Убедитесь, что вы находитесь в корне проекта (там, где есть папка `scripts`). Проверить можно командой:
```powershell
ls scripts
```
Если вы видите файл `migrate-db.ps1` - вы в правильной папке! ✅

**Пример строки подключения:**
```
postgresql://postgres:[PASSWORD]@db.xxxxx.supabase.co:5432/postgres
```

⚠️ **Замените `[PASSWORD]` на ваш пароль базы данных!**

#### Способ 2: Ручной экспорт через pg_dump

1. Установите PostgreSQL клиент, если его нет:
   - Windows: скачайте [PostgreSQL](https://www.postgresql.org/download/windows/) или используйте [pgAdmin](https://www.pgadmin.org/download/)
   - Или используйте WSL (Windows Subsystem for Linux)

2. Получите строку подключения к **старому проекту** (см. выше)

3. Откройте терминал (PowerShell или Command Prompt)

4. Выполните команду экспорта:

```bash
# Для Windows (PowerShell)
pg_dump "YOUR_OLD_CONNECTION_STRING" --no-owner --no-acl -f backup.sql

# Если pg_dump не найден, используйте полный путь:
# "C:\Program Files\PostgreSQL\15\bin\pg_dump.exe" "YOUR_OLD_CONNECTION_STRING" --no-owner --no-acl -f backup.sql
```

### Вариант C: Экспорт через Supabase CLI (альтернативный способ)

1. Установите Supabase CLI:
   ```bash
   npm install -g supabase
   ```

2. Войдите в Supabase:
   ```bash
   supabase login
   ```

3. Свяжите проект:
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   ```

4. Экспортируйте данные:
   ```bash
   supabase db dump -f backup.sql
   ```

---

## 📥 Шаг 4: Создание структуры таблиц в новом проекте

1. Откройте **новый проект** (тестовый) в Supabase Dashboard
2. Перейдите в **SQL Editor**
3. Создайте новый запрос

4. **ВАЖНО**: Сначала нужно создать структуру таблиц. У вас есть два варианта:

### Вариант A: Использовать Prisma (рекомендуется)

1. Откройте терминал в корне проекта
2. Создайте файл `.env.local` (если его нет) и добавьте строку подключения к **новому проекту**:

```env
DATABASE_URL="postgresql://postgres:[ВАШ_ПАРОЛЬ]@db.xxxxx.supabase.co:5432/postgres"
```

⚠️ **Замените `[ВАШ_ПАРОЛЬ]` и `xxxxx` на реальные значения!**

3. Выполните команду для создания всех таблиц:

```bash
npx prisma db push
```

Эта команда создаст все таблицы согласно вашей схеме Prisma.

### Вариант B: Использовать SQL из миграций

1. Откройте файлы в папке `prisma/migrations/`:
   - `add_indy_league_enum.sql`
   - `add_indy_league_tables.sql`
   - `add_total_weeks_to_tournament.sql`

2. Скопируйте содержимое каждого файла
3. Вставьте в SQL Editor нового проекта и выполните по очереди

---

## 📥 Шаг 5: Импорт данных в новый проект

### Если вы использовали pg_dump (Вариант B из Шага 3):

#### Способ 1: Использование готового скрипта (проще всего!)

1. Убедитесь, что файл `backup.sql` находится в корне проекта
2. Получите строку подключения к **новому проекту**:
   - Откройте новый проект в Supabase Dashboard
   - Settings → Database → Connection string
   - Выберите **"Session mode"**
   - Скопируйте строку подключения

3. **Откройте PowerShell в корне проекта** (папка `piqle_web_tournament`)
   - Откройте проводник Windows
   - Перейдите в папку проекта: `C:\Users\MSI\Documents\GitHub\piqle_web_tournament`
   - Нажмите правой кнопкой мыши в пустом месте папки
   - Выберите "Открыть в терминале" или "Open in Terminal"
   - Или откройте PowerShell и выполните: `cd C:\Users\MSI\Documents\GitHub\piqle_web_tournament`

4. Выполните команду импорта:

```powershell
.\scripts\migrate-db.ps1 -Action import -ConnectionString "YOUR_NEW_CONNECTION_STRING" -OutputFile "backup.sql"
```

⚠️ **ВНИМАНИЕ**: Скрипт спросит подтверждение перед импортом!

💡 **Важно**: Убедитесь, что вы находитесь в корне проекта (там, где есть папка `scripts`). Проверить можно командой:
```powershell
ls scripts
```
Если вы видите файл `migrate-db.ps1` - вы в правильной папке! ✅

#### Способ 2: Ручной импорт через psql

1. Откройте терминал
2. Выполните команду импорта (замените `YOUR_NEW_CONNECTION_STRING` на строку подключения к **новому проекту**):

```bash
# Для Windows (PowerShell)
psql "YOUR_NEW_CONNECTION_STRING" -f backup.sql

# Если psql не найден, используйте полный путь:
# "C:\Program Files\PostgreSQL\15\bin\psql.exe" "YOUR_NEW_CONNECTION_STRING" -f backup.sql
```

### Если у вас нет pg_dump/psql:

1. Откройте файл `backup.sql` (если вы его создали)
2. Скопируйте команды `INSERT INTO ...` из файла
3. Вставьте их в SQL Editor нового проекта
4. Выполните по частям (не все сразу, если данных много)

---

## 🔄 Шаг 6: Обновление переменных окружения в Vercel

1. Откройте [vercel.com](https://vercel.com) и войдите в аккаунт
2. Найдите ваш проект и откройте его
3. Перейдите в **Settings** → **Environment Variables**
4. Обновите следующие переменные (используйте значения из **нового проекта**):

   - `DATABASE_URL` - строка подключения к новой БД
   - `NEXT_PUBLIC_SUPABASE_URL` - URL нового проекта
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` - anon ключ нового проекта
   - `SUPABASE_SERVICE_ROLE_KEY` - service_role ключ нового проекта

5. После обновления всех переменных:
   - Нажмите **"Save"**
   - Перейдите в **Deployments**
   - Найдите последний деплой и нажмите **"Redeploy"** (или создайте новый деплой)

---

## 💻 Шаг 7: Обновление локальных переменных окружения

1. Откройте файл `.env.local` в корне проекта (или создайте его, если нет)
2. Обновите переменные на значения из **нового проекта**:

```env
# Postgres / Prisma
DATABASE_URL="postgresql://postgres:[ВАШ_ПАРОЛЬ]@db.xxxxx.supabase.co:5432/postgres"

# Supabase (client)
NEXT_PUBLIC_SUPABASE_URL="https://xxxxx.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="ваш_anon_ключ"

# Supabase (server-only)
SUPABASE_SERVICE_ROLE_KEY="ваш_service_role_ключ"
```

3. Сохраните файл

---

## ✅ Шаг 8: Проверка

1. Запустите проект локально:
   ```bash
   npm run dev
   ```

2. Проверьте, что приложение подключается к новой базе данных
3. Попробуйте создать тестовый турнир или проверить существующие данные

4. Проверьте деплой на Vercel:
   - Откройте ваш сайт на Vercel
   - Убедитесь, что все работает корректно

---

## 🆘 Решение проблем

### Проблема: "Connection refused" или ошибки подключения

**Решение:**
- Проверьте, что строка подключения правильная
- Убедитесь, что пароль в строке подключения URL-encoded (например, `@` → `%40`, `!` → `%21`)
- Проверьте, что используете **Session mode**, а не Transaction mode

### Проблема: "Table does not exist"

**Решение:**
- Убедитесь, что вы выполнили `npx prisma db push` или SQL миграции
- Проверьте, что все таблицы созданы в новом проекте (Settings → Database → Tables)

### Проблема: "Permission denied"

**Решение:**
- Убедитесь, что используете правильные ключи (anon key для клиента, service_role для сервера)
- Проверьте настройки Row Level Security (RLS) в Supabase, если используете

### Проблема: pg_dump не найден

**Решение:**
- Установите PostgreSQL: https://www.postgresql.org/download/
- Или используйте онлайн инструменты для экспорта/импорта
- Или используйте Supabase Dashboard → SQL Editor для ручного копирования данных

---

## 📝 Чек-лист

- [ ] Создан новый проект Supabase
- [ ] Скопированы все ключи и строки подключения
- [ ] Экспортированы данные из старого проекта
- [ ] Создана структура таблиц в новом проекте
- [ ] Импортированы данные в новый проект
- [ ] Обновлены переменные окружения в Vercel
- [ ] Обновлен файл `.env.local`
- [ ] Проверена работа приложения локально
- [ ] Проверена работа приложения на Vercel

---

## 💡 Полезные ссылки

- [Документация Supabase](https://supabase.com/docs)
- [Документация Prisma](https://www.prisma.io/docs)
- [Документация Vercel](https://vercel.com/docs)

---

**Удачи с миграцией! 🚀**

