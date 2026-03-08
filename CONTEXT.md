# IQSport.ai — Intelligence Module: Full Context for Claude Code

## ВАЖНО: Работай ТОЛЬКО в этом репо. Не создавай и не трогай другие папки.

## Проект
IQSport.ai (ранее Piqle) — AI-powered revenue optimization для ракеточных клубов. Intelligence модуль — это Sprint 1 "Data → Insights Pipeline", который добавляет AI-аналитику поверх существующей турнирной платформы.

## Стек
- Next.js 15 App Router, TypeScript
- tRPC (protectedProcedure)
- Prisma 6.16.2 + PostgreSQL (Supabase)
- shadcn/ui, Radix UI, Tailwind CSS, Lucide icons
- Деплой: Vercel, ветка `Sol2` → stest.piqle.io

## Git
- Ветка: `Sol2`
- Remote: git@github.com:Xoxa2244/piqle_web_tournament.git
- Co-author: `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`

## Структура Intelligence модуля

### Страницы (app/clubs/[id]/intelligence/)
```
layout.tsx                    — общий layout с tab-навигацией
page.tsx                      — dashboard (метрики, quick actions, underfilled sessions)
slot-filler/page.tsx          — AI рекомендации для заполнения слотов
reactivation/page.tsx         — обнаружение неактивных игроков
revenue/page.tsx              — аналитика заполняемости по времени/дню/формату
```

### Компоненты (_components/)
```
skeleton.tsx                  — скелетоны загрузки
empty-state.tsx               — пустое состояние с иконкой и CTA
metric-card.tsx               — цветные карточки метрик
charts.tsx                    — HorizontalBarChart, VerticalBarChart, OccupancyBadge/Bar
```

### Демо-режим (_data/ + _hooks/)
```
_data/mock.ts                 — mock данные (127 членов, 6 кортов, сессии, рекомендации)
_hooks/use-intelligence.ts    — хуки: возвращают mock при ?demo=true, иначе tRPC
```
Все страницы используют хуки вместо прямых trpc.intelligence.* вызовов.
URL: stest.piqle.io/clubs/любой-id/intelligence?demo=true

### Бэкенд
```
server/routers/intelligence.ts    — tRPC роутер (getDashboard, getSlotFillerRecommendations, etc.)
server/routers/_app.ts            — включает intelligenceRouter
lib/ai/intelligence-service.ts    — сервисный слой с DB запросами + AI скоринг
lib/ai/slot-filler.ts             — алгоритм заполнения слотов
lib/ai/reactivation.ts            — алгоритм реактивации
lib/ai/weekly-planner.ts          — недельное планирование
lib/ai/scoring.ts                 — система скоринга
lib/ai/persona.ts                 — персоны игроков
lib/ai/index.ts                   — экспорты
types/intelligence.ts             — TypeScript интерфейсы
```

### База данных (prisma/schema.prisma)
Добавлены модели: ClubCourt, PlaySession, PlaySessionBooking, PlaySessionWaitlist, UserPlayPreference, AIRecommendationLog
Добавлены связи в User и Club.
**Миграция НЕ запущена** — нужен DATABASE_URL в .env (пароль от Supabase у Родиона).

## Текущий статус
- ✅ Все 4 страницы с нормальными компонентами
- ✅ Демо-режим (?demo=true) работает
- ✅ ?demo=true сохраняется при навигации (layout + dashboard ссылки)
- ⏳ Prisma миграция (ждём пароль от Supabase)
- ⏳ Seed скрипт для dev/staging

## Что нужно сделать дальше
1. Получить пароль DB от Родиона, создать .env, запустить `npx prisma migrate dev --name add-intelligence-models`
2. Создать seed скрипт (scripts/seed-intelligence.ts) для dev/staging данных
3. Тестирование с реальными данными
4. Будущие спринты: AI Advisor (RAG), CSV Import, Dynamic Pricing, Email notifications
