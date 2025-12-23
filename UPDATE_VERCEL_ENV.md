# Обновление переменных окружения в Vercel после миграции БД

## 📋 Шаг 1: Получение новых значений из нового проекта Supabase

1. Откройте ваш **новый проект** в [Supabase Dashboard](https://supabase.com/dashboard)
2. Перейдите в **Settings** → **API**
3. Скопируйте следующие значения:
   - **Project URL** → это будет `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** ключ → это будет `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** ключ → это будет `SUPABASE_SERVICE_ROLE_KEY` (⚠️ **НЕ ПОКАЗЫВАЙТЕ ЕГО НИКОМУ!**)

4. Перейдите в **Settings** → **Database**
5. Найдите секцию **"Connection string"**
6. Выберите **"Transaction mode"** (рекомендуется для Vercel) или **"Session mode"**
7. Скопируйте строку подключения → это будет `DATABASE_URL`

---

## 🔄 Шаг 2: Обновление переменных в Vercel Dashboard

1. Откройте [Vercel Dashboard](https://vercel.com/dashboard)
2. Найдите ваш проект `piqle-web-tournament` и откройте его
3. Перейдите в **Settings** → **Environment Variables**
4. Для каждой из следующих переменных:
   - Найдите переменную в списке
   - Нажмите на неё для редактирования
   - Вставьте новое значение из нового проекта Supabase
   - Убедитесь, что выбраны все окружения: **Production**, **Preview**, **Development**
   - Нажмите **Save**

### Переменные для обновления:

#### 1. DATABASE_URL
- **Старое значение**: замените на новую строку подключения из нового проекта
- **Формат**: `postgresql://postgres.xxxxx:ПАРОЛЬ@aws-1-us-east-2.pooler.supabase.com:6543/postgres?pgbouncer=true&prepared_statements=false`
- Или для Session mode: `postgresql://postgres.xxxxx:ПАРОЛЬ@aws-1-us-east-2.pooler.supabase.com:5432/postgres`

#### 2. NEXT_PUBLIC_SUPABASE_URL
- **Старое значение**: замените на новый Project URL
- **Формат**: `https://xxxxx.supabase.co`

#### 3. NEXT_PUBLIC_SUPABASE_ANON_KEY
- **Старое значение**: замените на новый anon public ключ

#### 4. SUPABASE_SERVICE_ROLE_KEY
- **Старое значение**: замените на новый service_role ключ

---

## 🚀 Шаг 3: Перезапуск деплоя

После обновления всех переменных:

1. Перейдите в раздел **Deployments**
2. Найдите последний деплой
3. Нажмите на три точки (⋮) рядом с деплоем
4. Выберите **Redeploy**
5. Или создайте новый деплой через **Deployments** → **Create Deployment**

---

## 💻 Шаг 4: Обновление локальных файлов (опционально)

### Обновление `.env.local` (для локальной разработки)

1. Откройте файл `.env.local` в корне проекта (или создайте его, если нет)
2. Обновите значения на новые из нового проекта:

```env
# Postgres / Prisma
DATABASE_URL="postgresql://postgres:[ВАШ_ПАРОЛЬ]@db.xxxxx.supabase.co:5432/postgres"

# Supabase (client)
NEXT_PUBLIC_SUPABASE_URL="https://xxxxx.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="ваш_новый_anon_ключ"

# Supabase (server-only)
SUPABASE_SERVICE_ROLE_KEY="ваш_новый_service_role_ключ"
```

⚠️ **Замените `[ВАШ_ПАРОЛЬ]` и `xxxxx` на реальные значения из нового проекта!**

### Обновление `vercel.env` (для справки)

Файл `vercel.env` можно обновить для справки, но **главное** - это обновить переменные в Vercel Dashboard!

---

## ✅ Проверка

После обновления переменных и перезапуска деплоя:

1. Откройте ваш сайт на Vercel
2. Проверьте, что приложение работает корректно
3. Попробуйте создать тестовый турнир или проверить существующие данные
4. Проверьте логи в Vercel Dashboard → **Deployments** → выберите деплой → **Functions** → посмотрите логи

---

## 🆘 Если что-то не работает

1. **Проверьте логи в Vercel**: Deployments → выберите деплой → Functions → Logs
2. **Убедитесь, что все переменные обновлены** в Vercel Dashboard
3. **Проверьте, что выбраны все окружения** (Production, Preview, Development) для каждой переменной
4. **Убедитесь, что строка подключения правильная** - проверьте пароль и URL
5. **Проверьте, что пароль в DATABASE_URL правильно URL-encoded** (например, `@` → `%40`, `!` → `%21`)

---

## 📝 Чек-лист

- [ ] Получены новые значения из нового проекта Supabase
- [ ] Обновлена переменная `DATABASE_URL` в Vercel Dashboard
- [ ] Обновлена переменная `NEXT_PUBLIC_SUPABASE_URL` в Vercel Dashboard
- [ ] Обновлена переменная `NEXT_PUBLIC_SUPABASE_ANON_KEY` в Vercel Dashboard
- [ ] Обновлена переменная `SUPABASE_SERVICE_ROLE_KEY` в Vercel Dashboard
- [ ] Все переменные выбраны для всех окружений (Production, Preview, Development)
- [ ] Выполнен Redeploy в Vercel
- [ ] Проверена работа приложения
- [ ] Обновлен файл `.env.local` (опционально, для локальной разработки)

---

**Готово! 🎉** Ваше приложение теперь подключено к новой базе данных.

