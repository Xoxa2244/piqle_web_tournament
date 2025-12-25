# Исправление ошибки формата DATABASE_URL

## ❌ Проблема

Ошибка: `the URL must start with the protocol postgresql:// or postgres://`

**Причина**: В переменной `DATABASE_URL` в Vercel либо:
1. Пустое значение
2. Неправильный формат (не начинается с `postgresql://` или `postgres://`)
3. Есть пробелы или другие символы в начале/конце

---

## ✅ Решение

### Шаг 1: Проверьте значение в Vercel

1. Откройте Vercel Dashboard → **Settings** → **Environment Variables**
2. Найдите `DATABASE_URL`
3. Нажмите на неё, чтобы увидеть значение
4. Проверьте:
   - Не пустое ли значение?
   - Начинается ли с `postgresql://` или `postgres://`?
   - Нет ли пробелов в начале или конце?

### Шаг 2: Получите правильную строку подключения

1. Откройте **новый проект** в Supabase Dashboard
2. Перейдите в **Settings** → **Database**
3. Найдите секцию **"Connection string"**
4. Выберите **"Transaction mode"** (рекомендуется для Vercel)
5. Скопируйте строку подключения

**Она должна выглядеть так:**
```
postgresql://postgres.rawzuybnovpvmjwnsfxm:[YOUR-PASSWORD]@aws-1-us-east-2.pooler.supabase.com:6543/postgres?pgbouncer=true&prepared_statements=false
```

6. Замените `[YOUR-PASSWORD]` на ваш пароль от БД
7. Если в пароле есть специальные символы - закодируйте их:
   - `@` → `%40`
   - `!` → `%21`
   - `#` → `%23`
   - `%` → `%25`
   - пробел → `%20`

### Шаг 3: Обновите в Vercel

1. В Vercel Dashboard → **Settings** → **Environment Variables**
2. Найдите `DATABASE_URL`
3. Нажмите на неё для редактирования
4. **Полностью удалите** старое значение
5. **Вставьте** новую правильную строку подключения
6. **Убедитесь, что нет пробелов** в начале или конце
7. Проверьте, что строка начинается с `postgresql://`
8. Выберите нужные окружения (Preview, Development)
9. Сохраните

### Шаг 4: Проверка формата

Правильная строка должна выглядеть так:

**Для Transaction pooler (рекомендуется):**
```
postgresql://postgres.rawzuybnovpvmjwnsfxm:password@aws-1-us-east-2.pooler.supabase.com:6543/postgres?pgbouncer=true&prepared_statements=false
```

**Для Session pooler:**
```
postgresql://postgres.rawzuybnovpvmjwnsfxm:password@aws-1-us-east-2.pooler.supabase.com:5432/postgres
```

**Для прямого подключения:**
```
postgresql://postgres:password@db.rawzuybnovpvmjwnsfxm.supabase.co:5432/postgres
```

**Важно:**
- ✅ Должно начинаться с `postgresql://` или `postgres://`
- ✅ Не должно быть пробелов в начале или конце
- ✅ Не должно быть кавычек вокруг значения

---

## 🔍 Частые ошибки

### ❌ Ошибка 1: Пустое значение
```
DATABASE_URL = (пусто)
```
**Решение**: Вставьте правильную строку подключения

### ❌ Ошибка 2: Пробелы
```
DATABASE_URL = " postgresql://..." (пробел в начале)
```
**Решение**: Удалите пробелы

### ❌ Ошибка 3: Кавычки
```
DATABASE_URL = "postgresql://..." (кавычки не нужны в Vercel)
```
**Решение**: Удалите кавычки, Vercel добавляет их автоматически

### ❌ Ошибка 4: Неправильный протокол
```
DATABASE_URL = https://... (неправильный протокол)
```
**Решение**: Используйте `postgresql://` или `postgres://`

---

## ✅ После исправления

1. Сохраните переменную в Vercel
2. Сделайте **Redeploy**
3. Попробуйте войти через Google снова
4. Ошибка должна исчезнуть

---

## 🆘 Если все еще не работает

### Проверьте через логи Vercel

1. Vercel Dashboard → **Deployments** → выберите деплой → **Functions** → **Logs**
2. Найдите логи, связанные с Prisma
3. Проверьте, какое значение используется для `DATABASE_URL`

### Попробуйте другой формат

Если Transaction pooler не работает, попробуйте:
- Session pooler (порт 5432)
- Прямое подключение (порт 5432)

---

**После исправления формата строки подключения ошибка должна исчезнуть! 🎉**

