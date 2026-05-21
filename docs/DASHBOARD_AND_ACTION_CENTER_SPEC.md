# Dashboard & Action Center — Specification

**Status:** Draft v1.3
**Date:** 2026-05-20
**Scope:** Переработка раздела `Dashboard`, создание `Action Center`, переименование `Scorecard` → `Programming Health`, удаление `Leagues` из меню.
**Branch base:** `dsdev` (preview наблюдается на `rgdev.iqsport.ai`)

---

## Changelog v1.2 → v1.3

- **Поля без данных в Programming Health не показываем совсем.** Sponsor (T4), Profitability (T5), School/Partner Programs Active (T7) — НЕ отображать в UI ни как заглушки, ни как "Coming in Phase 2". Раздел просто не имеет этих полей до тех пор, пока данные не появятся
- **LeaguesIQ внутри Programming IQ = drawer.** При нажатии на режим "Leagues" в Programming IQ открывается выдвижная панель справа с содержимым `LeaguesIQ.tsx`. Не отдельная вкладка, не sub-route, не переписывание

---

## Changelog v1.1 → v1.2

- **Scorecard переименован в `Programming Health`.** Симметрия с `Customer Health` — здоровье программ vs здоровье клиентов. URL `/scorecard` остаётся для обратной совместимости (redirect).
- **На Dashboard добавляется блок `Programming Health Overview`** — агрегация по 7 тирам, симметрично с `Customer Health Overview`.
- **Leagues удаляется из sidebar.** Это форма программирования (Tier 2), а не отдельная сущность. Континюити-логика уже в Action Center как сигналы (v1.1).
- **`LeaguesIQ.tsx` остаётся как компонент**, переезжает внутрь Programming IQ как режим / фильтр "Type: League".
- **Customer Health Overview чистится** от inline-кнопок (`Reactivation >`, `Create Activation Cohort >`). Оставляем только метрики.
- **Action-логика по churned / dormant переезжает в Business Insights** через канон (analysis + insight + action). 2 новых типа инсайтов добавляются в Insights Engine.
- **Cross-links Programming Health ↔ Action Center.** В Programming Health на нарушенной строке — deeplink в Action Center. В Action Center на сигнале — deeplink в Programming Health для контекста.
- **Drawer прозрачность** — UI замечание из preview rgdev. Period Comparison drawer должен иметь непрозрачный background, чтобы не просвечивал основной контент.

---

## Changelog v1.0 → v1.1 (для контекста)

- Tier classification переиспользуется (existing `classifyProgrammingTier`), не строится с нуля
- Scorecard backend переиспользуется на 65-70%
- Sprint 9 частично в скоупе: revenue per tier + non-member % + waitlist
- vipMembersAtRisk — и агрегация, и per-member signals
- Action taxonomy унифицирована: `{ primary, secondary[] }`
- Dedup через TEXT key, snooze отдельный status, deeplinks через draft-id
- CR write-методы — work item
- Inactive Players: 30 дней без booking-ов

---

## 0. Context and Goals

### 0.1 Что есть сейчас (по состоянию на 2026-05-20)

- `app/clubs/[id]/intelligence/page.tsx` → `DashboardIQ`: KPI, occupancy heatmap, Pickleball 101 funnel, Lost Revenue, AI Insights cards, Customer Health Overview с inline-кнопками Reactivation/Activation
- AI Insights работают как **in-memory generation** + `localStorage` dismiss
- Sidebar (`_components/iq-layout/IQSidebar.tsx`) — на rgdev уже видны изменения v1.1: группа `OPERATIONS` (была AI TOOLS), пункт `Action Center` присутствует, `Inactive Players` карточка в Dashboard, `Customer Health Overview` переименован, Period Comparison drawer работает с trend line
- **Однако** Leagues пока остаётся в ANALYTICS, Scorecard ещё не переименован, Customer Health сохраняет inline-actions
- `WeeklyScorecardIQ` (`/scorecard`) реализован на ~65-70%
- `classifyProgrammingTier()` в `lib/ai/programming-tier-classifier.ts` — backend-only classifier

### 0.2 Что меняется этой спецификацией

1. `Dashboard` = стратегический слой (метрики + бизнес-инсайты + Programming Health Overview блок)
2. `Action Center` = операционный слой (лента сигналов + Tier Constructor)
3. `Scorecard` → переименование в **`Programming Health`** (страница, sidebar label)
4. **`Leagues` удаляется из sidebar.** Функционал переезжает в Programming IQ
5. **Customer Health Overview очищается от actions** — только метрики
6. **Reactivation / Activation actions** переезжают в Business Insights блок как канонические инсайты
7. Sidebar: `AI TOOLS` → `OPERATIONS`, `Action Center` первый пункт, без `Leagues` в ANALYTICS
8. Канон инсайта (§2)
9. Удаляются `Lost Revenue` и `Pickleball 101 funnel`
10. Tier Constructor — пресет + per-club overrides + custom rules (без auto-suggest, без compliance signals — Phase 2)
11. Sprint 9 частично: revenue per tier + non-member % + waitlist count

### 0.3 Что НЕ в скоупе

- Изменение содержания Members / Cohorts / Campaigns / Programming IQ / Schedule (кроме того, что Programming IQ получает Leagues-режим)
- Разделение ролей `manager` / `operator` (Phase 2)
- Tier Compliance signals в Action Center (Phase 2)
- Tier Auto-suggest (Phase 2)
- Auto-передача Dashboard → Action Center (Phase 2)
- Profitability (T5), event sponsor, school partnerships
- Зомби-страницы `/reactivation`, `/marketplace`, `/packages`
- `/tournament-ai/*`

---

## 1. Conceptual Model

### 1.1 Two-Level Architecture

```
DATA SOURCES (CourtReserve + наша БД)
  └─→ ENGINES (Insights / Member Health / classifyProgrammingTier / Programming Health backend)
        ├─→ DASHBOARD     (стратегический слой)
        │     ├─→ Programming / Engage / Business Advice
        │     └─→ deeplink в Programming Health для развёрнутого view
        │
        └─→ ACTION CENTER (операционный слой)
              ├─→ Лента сигналов
              ├─→ Tier Constructor
              ├─→ Programming / Engage / Direct CR write
              └─→ deeplink в Programming Health для контекста
        
PROGRAMMING HEALTH (страница, бывший Scorecard)
  ├─→ deeplink в Action Center на нарушения
  └─→ deeplink в Dashboard для общего overview
```

**Sidebar после v1.2:**

```
ANALYTICS
├─ Dashboard
├─ Schedule
└─ Programming Health   (был Scorecard, без Leagues)

OPERATIONS               (было AI TOOLS)
├─ Action Center
├─ Programming IQ        (теперь включает Leagues-режим)
└─ AI Advisor

ENGAGE
├─ Members
├─ Cohorts
└─ Campaigns

SYSTEM
├─ Launch
├─ Billing
├─ Integrations
├─ Email Domain
└─ Automation (admin only)
```

| Аспект | Dashboard | Action Center | Programming Health |
|---|---|---|---|
| Назначение | Тренды, бизнес-инсайты, обзор | Что не сделано сегодня | Развёрнутая недельная картина по тирам |
| Аудитория | Владелец / менеджер | Оператор локации | Оператор / менеджер для обзора |
| Горизонт | Период (неделя / месяц / квартал) | Сегодня / эта неделя | Неделя (с навигацией по неделям) |
| Контент | KPI + Customer Health + Programming Health Overview + Business Insights | Operational signals + Tier Constructor | Tier 1-7 + Execution Check + KPI Summary |
| Связь | Может вести в Programming Health за контекстом | Сигналы могут иметь deeplink в Programming Health | Нарушения имеют deeplink в Action Center |

### 1.2 Roles

В MVP — **одно лицо**. Phase 2 — разделение `manager` / `operator`.

### 1.3 Independence of Modules

Модули **не передают задачи друг другу автоматически**. Cross-links между Programming Health ↔ Action Center — это **навигация для пользователя**, а не авто-передача данных.

---

## 2. Insight Canon

```
INSIGHT = АНАЛИЗ ДАННЫХ + НЕ-ЯВНЫЙ ВЫВОД + КОНКРЕТНОЕ ДЕЙСТВИЕ
```

5 типов действий:

1. **create_cohort** — создание предзаполненной cohort
2. **create_campaign** — создание предзаполненной campaign
3. **programming** — создание / изменение сессии в Programming IQ
4. **cr_api_direct** — прямая запись в CR API (4 метода, §8.2)
5. **advice** — бизнес-совет без кнопки

**Правила:**

- Нет действия → метрика, не инсайт
- Не можем заполнить cohort через `cohortFilterSchema` (см. §5.4) → `advice` или вырезаем
- Композитные действия через `secondary[]`

**Action taxonomy (унифицированный):**

```typescript
type Action =
  | { type: 'create_cohort', label: string, cohortRules: CohortFilter[], draftId?: string }
  | { type: 'create_campaign', label: string, templateKey: string, cohortRef?: string, draftId?: string }
  | { type: 'programming', label: string, params: ProgrammingPrefill, draftId?: string }
  | { type: 'cr_api_direct', label: string, endpoint: CRWriteEndpoint, payload: Record<string, unknown>, requiresConfirmation: boolean }
  | { type: 'advice', label: string }

interface UnifiedAction {
  primary: Action
  secondary?: Action[]
}
```

---

## 3. Dashboard — Specification

### 3.1 Структура страницы

Блоки сверху вниз:

1. **General KPI** — Active Players / Inactive Players / Court Occupancy / Player Sessions
2. **Period Comparison** — карточки с динамикой + drawer drill-down
3. **Customer Health Overview** — здоровье клиентов (только метрики)
4. **Programming Health Overview** — здоровье программ (новый блок, симметрия с Customer Health)
5. **Occupancy Heatmap**
6. **Sessions by Format**
7. **Business Insights** — карточки через канон

**Удалены:** `Lost Revenue`, `Pickleball 101 funnel`.

### 3.2 General KPI

| Карточка | Статус | Источник | Формула |
|---|---|---|---|
| Active Players | R | `users` + `play_session_bookings` | Distinct users с booking за последние 30 дней |
| **Inactive Players** | **F** | `users` + `play_session_bookings` | Distinct users без booking 30+ дней при условии исторических booking-ов |
| Court Occupancy | R | `play_sessions` + `play_session_bookings` + `club_courts` | Booked / available court-hours за период |
| Player Sessions | R | `play_session_bookings` | Count за период |

**Inactive Players (зафиксировано):**
- Порог: 30 дней
- Источник: `play_session_bookings` (status = CONFIRMED)
- База: users у которых ≥1 исторический booking
- Формула: `COUNT(DISTINCT users.id) WHERE EXISTS(any booking) AND NOT EXISTS(booking in last 30d)`

### 3.3 Period Comparison

**Текущее (R):** 4 карточки, переключатель `Prev period / Last year / Pick dates`. На rgdev уже работает drawer с trend line.

**Что меняется (C):**

- Каждая карточка кликабельна, открывает drawer справа
- Drawer: bar chart + trend line + опциональный overlay со вторым периодом
- **UI fix:** drawer должен иметь непрозрачный background, не просвечивать сквозь. Сейчас на rgdev preview просвечивает — фон Dashboard видно через панель. Поправить opacity / добавить backdrop-blur

**Data contract endpoint:**

```typescript
intelligence.getMetricTimeSeries({
  clubId, metric, startDate, endDate, bucket: 'week' | 'month', overlay?
}) → { bars, trend: { slope, intercept }, overlay? }
```

**Defaults:** 1m / 3m / 6m пресеты, week (для 1m/3m) / month (для 6m) bars, simple linear regression.

### 3.4 Customer Health Overview

**Назначение:** только метрики, без actions. Чистая агрегация по сегментам клиентской базы.

**Что показывает (зачищенный список):**

```
Распределение по health-сегментам:
- Healthy
- Watch
- At-risk
- Critical

Lifecycle counts:
- Dormant (зарегистрированы, ни разу не играли)
- Churned (45+ дней inactive)

VIP at risk: N / Total VIP   (агрегация vipMembersAtRisk → variant C)

Тренд за период (показывает динамику сегментов)
```

**Что убирается:**

- ❌ Кнопка `Reactivation >` рядом с churned counts (переезжает в Business Insights)
- ❌ Кнопка `Create Activation Cohort >` рядом с dormant counts (переезжает в Business Insights)
- ❌ Любые inline-actions

Это блок **наблюдения**, не действия. Действия — в Business Insights через канон.

**Источник:** `lib/ai/member-health.ts` (8-компонентная модель). 8-компонентная агрегация по клубу + lifecycle counts через `play_session_bookings` + `users`.

### 3.5 Programming Health Overview (новый блок)

**Симметрично Customer Health Overview.**

**Что показывает:**

```
Распределение по 7 тирам (за неделю или период):
- T1 Core:        X sessions, Y participants
- T2 Leagues:     X sessions, Y participants
- T3 Signature:   X sessions, Y participants
- T4 Social:      X sessions, Y participants
- T5 Tournament:  X sessions, Y participants
- T6 Premium:     X sessions, Y participants
- T7 Youth:       X sessions, Y participants

Execution Check (4 Y/N indicators):
- Core daily?
- Leagues active?
- Signature this week?
- Monthly cadence?

Cross-link: "Открыть Programming Health →"
```

**Без inline-actions.** Только обзор + ссылка в развёрнутую страницу.

**Источник:** существующий `intelligence.getWeeklyScorecard` (переименовать endpoint в `getProgrammingHealth` или добавить алиас).

### 3.6 Occupancy Heatmap и Sessions by Format

R, без изменений.

### 3.7 Business Insights

Главный переработанный блок с карточками через канон.

```typescript
interface BusinessInsight {
  id: string
  dedupeKey: string
  category: 'retention' | 'growth' | 'optimization' | 'risk' | 'activation' | 'reactivation'
  severity: 'high' | 'medium' | 'low'

  analysis: string
  metrics: Record<string, number>
  insight: string

  action: UnifiedAction

  status: 'active' | 'snoozed' | 'resolved' | 'dismissed'
  createdAt: Date
  lastSeenAt: Date
  resolvedAt: Date | null
  snoozeUntil: Date | null
}
```

**Новые insight-функции от чистки Customer Health (v1.2):**

```
Function: highValueReactivation
analysis: "Из {N} churned (45+ days) — {M} имеют Premium/VIP membership с историей 12+ месяцев"
insight:  "High-value churn. Reactivation вероятность выше чем привлечь нового члена эквивалентной ценности"
action:   { primary: { type: 'create_campaign', label: 'Запустить targeted reactivation',
                       templateKey: 'high_value_winback', cohortRules: [...] } }
```

```
Function: dormantActivation
analysis: "{N} человек зарегистрировались, ни разу не пришли"
insight:  "Leak в воронке onboarding — registration без первого визита редко конвертируется без вмешательства"
action:   { primary: { type: 'create_cohort', label: 'Создать activation cohort',
                       cohortRules: [{field:'frequency',op:'eq',value:0}] },
            secondary: [{ type: 'create_campaign', label: 'Запустить activation campaign',
                          templateKey: 'first_visit_activation' }] }
```

**Cadence:** cron daily + ручной refresh.

**Persistence:** таблица `business_insight` (см. §7.1).

**Manual resolution:** `intelligence.resolveBusinessInsight()`.

---

## 4. Action Center — Specification

### 4.1 Назначение и место в навигации

Маршрут: `app/clubs/[id]/intelligence/action-center/page.tsx`.

В `IQSidebar.tsx` — первый пункт в группе **OPERATIONS** (переименование из `AI TOOLS`).

### 4.2 Структура страницы

1. **Лента операционных сигналов** (верх)
2. **Tier Constructor** (отдельная вкладка)

### 4.3 Лента операционных сигналов

**MVP источники:**

| Источник | Что генерирует | Откуда |
|---|---|---|
| Member Health дельты | Per-member алерты (drop ≥20 за 7 дней, риск-transition) | existing `member-health.ts` |
| Membership lifecycle | Suspended 14+ days, Failed payment, Renewal expiring 30d | CR data |
| Programming Health Execution Check | 4 Y/N сигнала | existing `getWeeklyScorecard` → переименовать в `getProgrammingHealth` |
| League gap detection | Per-league-family сигналы (gap 14-60d) | existing `gapCriticalCount` + `detectLeagueFamily` |
| vipMembersAtRisk per-member | Per-VIP сигналы | переработка из `insights-engine.ts` |

**Phase 2:**

- Tier Compliance на основе настроенного Tier Constructor
- Auto-suggest предложения

**Структура сигнала:**

```typescript
interface OperationalSignal {
  id: string
  clubId: string
  locationId: string | null
  dedupeKey: string

  source: 'member_health' | 'membership_lifecycle' | 'programming_health_execution' | 'league_gap' | 'vip_at_risk'
  ruleKey: string
  subjectEntityId: string | null
  severity: 'critical' | 'warning' | 'nudge'

  subject: string
  context: Record<string, unknown>

  action: UnifiedAction

  status: 'active' | 'snoozed' | 'resolved' | 'dismissed'
  createdAt: Date
  lastSeenAt: Date
  resolvedAt: Date | null
  snoozeUntil: Date | null
}
```

**Кнопки на карточке:**

- `Действовать` — выполняет `action.primary`
- `Отложить` — `status='snoozed', snoozeUntil = now + N days`
- `Скрыть` — `status='dismissed', resolvedAt = now`
- `Открыть в исходнике` — переход в источник без действия
- **`Посмотреть в Programming Health`** (для сигналов из programming_health_execution / league_gap) — deeplink в Programming Health страницу с подсветкой нарушения

**Auto-resolve:** на каждом cron-цикле перепроверяется условие. Если ложно → `status='resolved', resolvedAt=now`.

**Дедупликация:** через `dedupe_key` UNIQUE INDEX WHERE `status IN ('active', 'snoozed')`.

**Фильтры:** локация, severity, source.

### 4.4 Tier Constructor

**Назначение MVP:**
- Видеть как `classifyProgrammingTier` разложил сессии за период
- Включать / выключать тиры
- Менять cadence / successMetric per tier
- Добавлять custom rules
- **НЕ генерирует сигналы в ленту** (Phase 2)

**Schema:**

```typescript
interface TierConfig {
  clubId: string
  overrides: TierOverride[]
  customRules: ClassifierRule[]
  updatedAt: Date
}

type ProgrammingTier =
  | 'T1_CORE' | 'T2_LEAGUE' | 'T3_SIGNATURE'
  | 'T4_SOCIAL' | 'T5_TOURNAMENT' | 'T6_PREMIUM' | 'T7_YOUTH'

interface TierOverride {
  tierKey: ProgrammingTier
  isActive: boolean
  cadence?: TierCadence
  successMetric?: TierSuccessMetric
  scope?: 'global' | { locationIds: string[] }
}

type TierCadence =
  | { kind: 'daily', minSessions: number }
  | { kind: 'weekly', minSessions: number, dayOfWeek?: number }
  | { kind: 'monthly', minSessions: number }
  | { kind: 'gap_max_days', maxGapDays: number }

type TierSuccessMetric =
  | { kind: 'session_count', min: number }
  | { kind: 'avg_fill_rate', minPct: number }
  | { kind: 'peak_utilization', minPct: number }
  | { kind: 'avg_players_per_session', min: number }
  | { kind: 'p101_to_member_conversion', minPct: number }
  | { kind: 'continuity', maxGapDays: number }
  | { kind: 'revenue', minAmount: number }
  | { kind: 'non_member_share', minPct: number }
  | { kind: 'participant_count', min: number }
  | { kind: 'manual_y_n', label: string }

interface ClassifierRule {
  id: string
  match: 
    | { kind: 'name_pattern', regex: string }
    | { kind: 'cr_reservation_type_id', id: number }
    | { kind: 'cr_event_category_id', id: number }
  targetTier: ProgrammingTier
  priority: number
}
```

**UI:**

1. Default state — таблица 7 тиров с текущим распределением (за последние 30 дней)
2. Кнопки: `Apply Solomon Preset`, `Add custom rule`, `Reset to defaults`
3. Per-tier toggle

### 4.5 Auto-suggest — Phase 2, НЕ в MVP

Placeholder в UI с пометкой "Coming in Phase 2".

---

## 5. Programming Health Page (renamed from Scorecard)

### 5.1 Назначение

Развёрнутый недельный view tier-compliance по шаблону Соломона. То что раньше было `Scorecard`.

**Маршрут:** `app/clubs/[id]/intelligence/scorecard/page.tsx` (URL остаётся для обратной совместимости, можно добавить redirect с `/programming-health` → `/scorecard` или наоборот, решить при реализации)

**Sidebar label:** `Programming Health`.

**Title на странице:** `Programming Health` (вместо "Weekly Programming Scorecard").

### 5.2 Структура

Без структурных изменений — всё что есть в текущем `WeeklyScorecardIQ` остаётся:

- Tier 1: Open Play / Classes / P101 с метриками
- Tier 2: Leagues с continuity
- Tier 3-7 с соответствующими метриками
- KPI Summary
- Execution Check (4 Y/N)

### 5.3 Что добавляется в v1.2

**Sprint 9 частичное (зафиксировано):**
- Revenue per tier (T1-T7) — добавить агрегацию
- Non-member % для T4 — добавить вычисление
- Waitlist count для T2 — использовать новый CR client метод (см. §7.2 work item)

**Cross-links:**

- На каждой строке-нарушении (например "Leagues continuous? — NO") — кнопка/иконка `Открыть в Action Center` с deeplink на конкретный signal
- В шапке страницы — кнопка `Вернуться в Action Center` (если пользователь пришёл оттуда)

### 5.4 Что НЕ добавляется и НЕ показывается в UI

- Profitability T5 (нет cost data)
- Event sponsor T4 (нет в CR для events)
- School partnerships T7 (внешняя сущность)
- Manual entry workflow (отложено)

**Поля НЕ отображаются в UI вообще** — ни заглушки, ни "Coming in Phase 2" badges, ни прочерки. Раздел не имеет этих строк до того момента, пока не появится источник данных или явное продуктовое решение про manual entry.

При реализации (шаг 12 из Order of implementation):
- В `WeeklyScorecardIQ.tsx` удалить рендер этих полей
- Соответствующие места в layout убрать так, чтобы не оставалось пустого пространства
- В `intelligence.getProgrammingHealth` endpoint поля могут оставаться как `null`, но frontend их не рендерит

---

## 6. Data Sources

### 6.1 CourtReserve endpoints (все синкаются)

Через `lib/connectors/courtreserve-client.ts` (THROTTLE_MS=1000, MAX_RATE_LIMIT_RETRIES=3, MAX_DATE_RANGE_DAYS=31, MAX_PAGE_SIZE=100):

| Endpoint | Используется в |
|---|---|
| `/api/v1/member/get` | members |
| `/api/v1/family/get` | семьи |
| `/api/v1/familymembership/*` | lifecycle + CRUD |
| `/api/v1/membershiptype/get` | типы членств |
| `/api/v1/reservation/courts` | корты |
| `/api/v1/reservationreport/listactive` + `listcancelled` | сессии |
| `/api/v1/reservationreport/whoisheretoday` | check-ins |
| `/api/v1/eventcalendar/eventlist` | события |
| `/api/v1/eventregistrationreport/listactive` + `listcancelled` + **`listwaitlist`** | регистрации + waitlist (для Sprint 9 T2 waitlist count) |
| `/api/v1/attendancereport/*` | посещения |
| `/api/v1/transactions/list` | транзакции |
| `/api/v1/revenuerecognition/list` | выручка (для Sprint 9 revenue per tier) |
| `/api/v1/customrating/*` | рейтинги + CRUD |
| `/api/v1/websitesettings/locations` | локации |

### 6.2 Что выводим в нашу БД

- Существующие: `play_sessions`, `play_session_bookings`, `users`, `club_followers`, `club_courts`, `member_health_snapshots`
- **NEW:** `business_insight`, `operational_signal`, `tier_config`
- **NEW:** `cohort_draft`, `campaign_draft`, `programming_draft`

### 6.3 Что недоступно

- DUPR rating
- Cost / profitability data (Lost Revenue убран, Profitability T5 отложен)
- Sponsor для events (T4) — для лиг есть через `detectLeagueFamily`
- School partnerships (T7)
- Маркетинговые источники
- Real-time webhooks от CR

### 6.4 Cohort filter fields (что реально работает)

Из `server/routers/intelligence.ts:699-713` — `cohortFilterSchema`:

| Категория | Поля |
|---|---|
| Демография | `age`, `gender`, `zipCode`, `city` |
| Membership | `membershipType`, `membershipStatus`, `normalizedMembershipType`, `normalizedMembershipStatus`, `joinedDaysAgo`, `birthdayMonth` |
| Активность | `frequency`, `recency`, `activityLevel`, `engagementTrend`, `valueTier` |
| Здоровье | `healthScore`, `riskLevel` |
| Игра | `skillLevel`, `duprRating`, `sessionFormat`, `dayOfWeek` |
| Identity | `userId` |
| Programming-aware | `attendedLeagueFamily`, `attendedProgrammingTier`, `attendedIntroProgram` |

**Операторы:** `eq, ne, neq, gt, gte, lt, lte, contains, in`.

**Маппинги для типовых инсайтов:**

- "Новые члены < N дней" → `joinedDaysAgo` lt N
- "Активность ≤ N booking" → `frequency` lte N
- "Перестали приходить" → `engagementTrend` eq 'declining' / 'churning'
- "В риске" → `riskLevel` in ['watch', 'at_risk', 'critical']
- "Высокая ценность" → `valueTier` eq 'high'
- "Прошёл P101" → `attendedIntroProgram` eq true
- "Игрок Tier 1 Core" → `attendedProgrammingTier` eq 'T1_CORE'
- **"High-value churned"** → `riskLevel` eq 'critical' + `recency` gt 45 + `valueTier` eq 'high'
- **"Dormant never played"** → `frequency` eq 0 + `joinedDaysAgo` gte 1

---

## 7. Insights Engine — Rework

### 7.1 Новый контракт

Каждая функция возвращает `BusinessInsight | null`. Cron daily + ручной refresh. Persistence в `business_insight`. Upsert через `dedupe_key`.

### 7.2 VIP definition

VIP = `membershipType.name` содержит "VIP" / "Premium" / "Unlimited" (case-insensitive).

### 7.3 Member Health drop thresholds

Сигнал создаётся когда любое из:
- Переход между risk-сегментами: `healthy → watch`, `watch → at_risk`, `at_risk → critical`
- Абсолютный drop score ≥ 20 пунктов за 7 дней

### 7.4 Миграция всех insight-функций

| Текущий тип | Канон | Куда едет | Action |
|---|---|---|---|
| `underutilizedCourts` | ✓ | Dashboard Business Insights | `programming` |
| `peakHourOverflow` | ✓ | Dashboard Business Insights | `programming` |
| `emptyEveningSlots` | ✓ | Dashboard Business Insights | `programming` |
| `formatMismatch` | ✓ | Dashboard Business Insights | `programming` |
| `dayOfWeekGap` | ✓ | Dashboard Business Insights | `programming` |
| `vipMembersAtRisk` | mixed | Customer Health агрегация + Action Center per-member | агрегация: метрика; per-member: `cr_api_direct` + `create_campaign` |
| `newMemberOnboarding` | ✓ | Dashboard Business Insights | `create_cohort` + `create_campaign` |
| `skillProgression` | ✓ | Dashboard Business Insights | `engage` + `cr_api_direct` |
| `suspendedWinback` | ✓ | Action Center per-membership | `cr_api_direct` + `create_campaign` |
| `guestPassUpsell` | conditional | Dashboard Business Insights | `create_campaign` или вырезать |
| **`highValueReactivation`** (NEW) | ✓ | Dashboard Business Insights | `create_campaign` targeted winback |
| **`dormantActivation`** (NEW) | ✓ | Dashboard Business Insights | `create_cohort` + `create_campaign` |

---

## 8. Implementation Plan

### 8.1 Database changes

Миграция `docs/migrations/dashboard-and-action-center.sql` (одна миграция):

```sql
-- Business insights (Dashboard)
CREATE TABLE business_insight (
  id TEXT PRIMARY KEY,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  dedupe_key TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  analysis TEXT NOT NULL,
  metrics JSONB NOT NULL,
  insight TEXT NOT NULL,
  action JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  snooze_until TIMESTAMPTZ
);
CREATE UNIQUE INDEX business_insight_active_dedupe
  ON business_insight(club_id, dedupe_key)
  WHERE status IN ('active', 'snoozed');

-- Operational signals (Action Center)
CREATE TABLE operational_signal (
  id TEXT PRIMARY KEY,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  location_id UUID,
  dedupe_key TEXT NOT NULL,
  source TEXT NOT NULL,
  rule_key TEXT NOT NULL,
  subject_entity_id TEXT,
  severity TEXT NOT NULL,
  subject TEXT NOT NULL,
  context JSONB NOT NULL,
  action JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  snooze_until TIMESTAMPTZ
);
CREATE UNIQUE INDEX operational_signal_active_dedupe
  ON operational_signal(club_id, dedupe_key)
  WHERE status IN ('active', 'snoozed');

-- Tier configuration
CREATE TABLE tier_config (
  club_id UUID PRIMARY KEY REFERENCES clubs(id) ON DELETE CASCADE,
  overrides JSONB NOT NULL DEFAULT '[]'::jsonb,
  custom_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);

-- Deeplink drafts
CREATE TABLE cohort_draft (
  id TEXT PRIMARY KEY,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  filters JSONB NOT NULL,
  suggested_name TEXT,
  source_insight_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days')
);

CREATE TABLE campaign_draft (
  id TEXT PRIMARY KEY,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  template_key TEXT NOT NULL,
  cohort_ref TEXT,
  channel_mix JSONB,
  source_insight_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days')
);

CREATE TABLE programming_draft (
  id TEXT PRIMARY KEY,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  prefill JSONB NOT NULL,
  source_insight_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days')
);
```

**Важно:** `clubs.id` = UUID, FK на `users.id` = TEXT. Миграции **только через SQL**, не `prisma db push` (см. CLAUDE.md). После SQL — синхронизировать `prisma/schema.prisma`.

### 8.2 Backend

**Новые файлы:**

- `lib/ai/business-insights-engine.ts` — рефакторинг `insights-engine.ts` под канон + UnifiedAction. Включает 2 новых: `highValueReactivation`, `dormantActivation`
- `lib/ai/operational-signals-engine.ts` — генератор сигналов на базе:
  - Member Health дельты
  - Membership lifecycle (Suspended 14+, Failed payment, Renewal expiring)
  - Programming Health Execution Check (переиспользует `getWeeklyScorecard`)
  - League gap (через `gapCriticalCount` + `detectLeagueFamily`)
  - vipMembersAtRisk per-member
- `lib/ai/tier-classifier-extended.ts` — обёртка вокруг `classifyProgrammingTier` с `customRules` из `tier_config`
- `lib/ai/draft-store.ts` — CRUD + cleanup deeplink drafts
- `app/api/cron/business-insights/route.ts` — daily Vercel Cron
- `app/api/cron/operational-signals/route.ts` — hourly Vercel Cron
- `app/api/cron/draft-cleanup/route.ts` — daily cleanup expired drafts

**Обновления:**

- `server/routers/intelligence.ts`:

```typescript
// Business Insights (Dashboard)
intelligence.getBusinessInsights({ clubId })
intelligence.resolveBusinessInsight({ insightId, reason, snoozeUntil? })
intelligence.refreshBusinessInsights({ clubId })

// Operational Signals (Action Center)
intelligence.getOperationalSignals({ clubId, filters })
intelligence.resolveSignal({ signalId, reason, snoozeUntil? })

// Tier Config
intelligence.getTierConfig({ clubId })
intelligence.upsertTierConfig({ clubId, overrides, customRules })
intelligence.getTierDistribution({ clubId, startDate, endDate })

// Drafts
intelligence.createCohortDraft(...) → { draftId }
intelligence.getCohortDraft({ draftId })
intelligence.createCampaignDraft(...) → { draftId }
intelligence.createProgrammingDraft(...) → { draftId }

// Period Comparison drawer
intelligence.getMetricTimeSeries({ clubId, metric, startDate, endDate, bucket, overlay? })

// Programming Health (alias или переименование getWeeklyScorecard)
intelligence.getProgrammingHealth({ clubId, weekOf })
intelligence.getProgrammingHealthOverview({ clubId, period })  // для блока в Dashboard
```

- `lib/connectors/courtreserve-client.ts` — **work item**: добавить 5 методов:

```typescript
async reactivateFamilyMembership(familyId: number, membershipTypeId: number): Promise<void>
async suspendFamilyMembership(familyId: number, reason?: string): Promise<void>
async assignCustomRating(memberId: number, ratingCategoryId: number, value: number): Promise<void>
async createCourtBlock(params: { reservationTypeId, courtIds, start, end, notes? }): Promise<{ reservationId: number }>
async getWaitlist(params: { eventDateFrom, eventDateTo, registeredOnFrom?, registeredOnTo? }): Promise<WaitlistEntry[]>
```

### 8.3 Frontend

**Новые компоненты:**

- `app/clubs/[id]/intelligence/action-center/page.tsx`
- `_components/iq-pages/ActionCenterIQ.tsx`
- `_components/iq-pages/action-center/SignalFeed.tsx`
- `_components/iq-pages/action-center/SignalCard.tsx`
- `_components/iq-pages/action-center/TierConstructor.tsx`
- `_components/iq-pages/action-center/TierConstructorTable.tsx`
- `_components/iq-pages/action-center/ClassifierRuleForm.tsx`
- `_components/iq-pages/dashboard/BusinessInsightCard.tsx`
- `_components/iq-pages/dashboard/PeriodComparisonDrawer.tsx`
- `_components/iq-pages/dashboard/ProgrammingHealthOverview.tsx` (новый блок для Dashboard)

**Обновления существующих компонентов:**

- `_components/iq-layout/IQSidebar.tsx`:
  - **Удалить пункт `Leagues`** из ANALYTICS
  - **Переименовать пункт `Scorecard` → `Programming Health`**
  - Группа `AI TOOLS` → `OPERATIONS` (уже сделано в rgdev)
  - `Action Center` первым пунктом в OPERATIONS (уже сделано в rgdev)

- `_components/iq-pages/DashboardIQ.tsx`:
  - Удалить блок `Lost Revenue`
  - Удалить блок `Pickleball 101 funnel`
  - Заменить AI Insights cards на `BusinessInsightCard`
  - Period Comparison карточки кликабельны, открывают `PeriodComparisonDrawer`
  - **Drawer: непрозрачный background (UI fix из rgdev review)**
  - `Player Health Overview` → `Customer Health Overview` (на rgdev уже сделано)
  - **Очистить `Customer Health Overview` от inline-кнопок** (`Reactivation`, `Create Activation Cohort`)
  - **Добавить блок `Programming Health Overview`** после Customer Health
  - Добавить `Inactive Players` карточку в General KPI (на rgdev уже сделано)
  - `% VIP в риске` агрегация в Customer Health

- `_components/iq-pages/WeeklyScorecardIQ.tsx`:
  - **Переименовать title** в `Programming Health`
  - Описание: `IPC Programming Operating System weekly view` или подобное
  - Добавить cross-link "Открыть в Action Center" на нарушения
  - **Sprint 9 поля**: revenue per tier, non-member % T4, waitlist count T2

- `_components/iq-pages/LeaguesIQ.tsx`:
  - **Переезжает внутрь Programming IQ как drawer** (выдвижная панель справа)
  - Содержимое компонента **не переписывается** — оборачивается в drawer wrapper
  - Открывается из Programming IQ через кнопку / фильтр "Leagues view" в toolbar
  - Drawer должен быть с непрозрачным background (тот же UI fix, что и Period Comparison drawer)

- `app/clubs/[id]/intelligence/leagues/page.tsx`:
  - Удалить файл (или редирект на `/programming`, если есть старые ссылки на `/leagues`)
  - В sidebar пункт `Leagues` удаляется (см. изменения `IQSidebar.tsx` выше)

### 8.4 Order of implementation

1. **БД миграции** (§8.1)
2. **CR client write-методы** (§8.2 work item — 5 методов включая `getWaitlist`)
3. **Backend pilot insight через канон** + endpoint `getBusinessInsights`
4. **`BusinessInsightCard.tsx`** + интеграция в Dashboard (1 pilot insight)
5. **Удалить `Lost Revenue` и `Pickleball 101 funnel`** из Dashboard
6. **`Inactive Players` метрика** (если ещё не сделано)
7. **`% VIP в риске` агрегация в Customer Health** (если ещё не сделано)
8. **Чистка `Customer Health Overview` от inline-кнопок**
9. **2 новых insight-функции** (`highValueReactivation`, `dormantActivation`) + появление их карточек в Business Insights
10. **Period Comparison drawer** — endpoint + UI + **fix opacity**
11. **Programming Health Overview** блок в Dashboard
12. **Переименование `Scorecard` → `Programming Health`** (sidebar label, title страницы)
13. **Удалить `Leagues` из sidebar**, перенести `LeaguesIQ` в Programming IQ
14. **Cross-links Programming Health ↔ Action Center**
15. **Migration оставшихся insight-функций** через канон
16. **Cron-driven generation** для business insights
17. **Draft store** + интеграция в Cohorts / Campaigns / Programming pages
18. **Sprint 9: Revenue per tier** в Programming Health
19. **Sprint 9: Non-member % T4** в Programming Health
20. **Sprint 9: Waitlist count T2** в Programming Health
21. **Action Center skeleton** + sidebar реорг (уже частично сделано)
22. **Operational signals: Member Health дельты + Membership lifecycle**
23. **Operational signals: Programming Health Execution Check reuse**
24. **Operational signals: League gap reuse**
25. **Operational signals: vipMembersAtRisk per-member**
26. **Tier Constructor: пресет + per-tier overrides**
27. **Tier Constructor: custom rules**

Каждый шаг — push + manual test gate.

---

## 9. Integration с Programming IQ и Engage

### 9.1 Deeplinks через draft-id

**Паттерн:**

1. Backend создаёт запись в `*_draft` с TTL 7 дней
2. URL: `/intelligence/cohorts?draftId=xxx`
3. Целевая страница вызывает `getCohortDraft({ draftId })` → заполняет форму

### 9.2 Direct CR API write — детали

5 actions после добавления методов в `courtreserve-client.ts`:

| Action | Endpoint | Use case |
|---|---|---|
| Reactivate family membership | `PUT /api/v1/familymembership/reactivate` | "Suspended 14+ days" |
| Suspend family membership | `PUT /api/v1/familymembership/suspend` | админ |
| Assign custom rating | `POST /api/v1/customrating/assign` | "Skill progression", "No initial rating after P101" |
| Create court block | `POST /api/v1/reservation/createcourtblock` | "Underutilized court" |
| Get waitlist | `GET /api/v1/eventregistrationreport/listwaitlist` | Sprint 9 waitlist count |

**Требования к UI:**
- Confirmation modal перед выполнением (показать что изменится)
- Audit log с user/timestamp/payload
- Idempotency через `signal.id` как ключ
- Error states — signal остаётся active, error message в UI
- No rollback — где CR не поддерживает, явно сказать в confirmation
- Permissions: в MVP всё разрешено owner/admin

### 9.3 Programming Health ↔ Action Center cross-links

**Из Programming Health → Action Center:**

На странице Programming Health для каждой строки-нарушения (например, "Leagues continuous? — NO" с числом gap_critical=2) → иконка/кнопка `Открыть в Action Center` с deeplink `/action-center?ruleKey=league_gap&locationId=xxx`. Action Center при открытии фильтрует ленту по этим параметрам.

**Из Action Center → Programming Health:**

На каждом сигнале из source `programming_health_execution` или `league_gap` — кнопка `Посмотреть в Programming Health` с deeplink `/programming-health?weekOf=yyyy-mm-dd&focus=tier2` (опционально с подсветкой нужной строки).

---

## 10. MVP Scope vs Phase 2+

### 10.1 MVP (v1.2)

**Dashboard:**
- ✅ Удалить `Lost Revenue`, `Pickleball 101 funnel`
- ✅ `Inactive Players` карточка (30 дней)
- ✅ Period Comparison drawer + trend line + **непрозрачный background**
- ✅ `Player Health Overview` → `Customer Health Overview` (rgdev)
- ✅ **Очистить Customer Health Overview** от inline-actions
- ✅ `% VIP в риске` агрегация
- ✅ **`Programming Health Overview` блок** (новый)
- ✅ Замена AI Insights cards на `BusinessInsightCard`
- ✅ Минимум 7 insight-функций из 10 текущих + **2 новых** (`highValueReactivation`, `dormantActivation`)
- ✅ Cron + persistence + `resolveBusinessInsight` endpoint

**Action Center:**
- ✅ Страница + лента
- ✅ 5 источников сигналов
- ✅ Tier Constructor: пресет + overrides + custom rules
- ✅ Status enum + auto-resolve cron
- ✅ Sidebar реорг (на rgdev уже частично)
- ✅ Cross-links с Programming Health

**Programming Health (бывший Scorecard):**
- ✅ Переименование sidebar label
- ✅ Переименование title страницы
- ✅ Cross-links с Action Center на нарушениях
- ✅ Sprint 9: Revenue per tier
- ✅ Sprint 9: Non-member % T4
- ✅ Sprint 9: Waitlist count T2

**Sidebar:**
- ✅ Группа `AI TOOLS` → `OPERATIONS` (на rgdev уже)
- ✅ `Action Center` первым пунктом
- ✅ **Удалить пункт `Leagues`**
- ✅ **`Scorecard` → `Programming Health`**

**Leagues:**
- ✅ Удалить пункт из меню
- ✅ `LeaguesIQ` переехать в Programming IQ как режим

**CR Client:**
- ✅ 5 новых write/read методов

**Common:**
- ✅ Deeplinks через draft-id
- ✅ Direct CR API write actions (4 типа + waitlist read)

### 10.2 Phase 2

- 🔜 Tier Compliance signals в ленте на основе Tier Constructor
- 🔜 Tier Auto-suggest (LLM + ретро)
- 🔜 Auto-передача Dashboard → Action Center
- 🔜 Разделение ролей `manager` / `operator`
- 🔜 Inline-actions в Action Center без выхода
- 🔜 Advisory tab в Dashboard для накопленной истории `advice`
- 🔜 Sprint 9 оставшееся: Profitability T5, Event sponsor T4, School partnerships T7
- 🔜 Manual entry workflow в Programming Health для полей которые нельзя автоматизировать
- 🔜 Расширение Tier Constructor (breaks/holidays, приоритеты, дни недели)

### 10.3 Research items

- ML модели поверх rule-based (6+ месяцев данных)
- DUPR integration
- Стандартизация Solomon preset для других видов спорта

---

## 11. Open Questions

### 11.1 Inactive Players — методология ✅ Зафиксировано

30 дней без booking-ов из `play_session_bookings` (status=CONFIRMED), база — users у которых ≥1 исторический booking.

### 11.2 vipMembersAtRisk — куда ✅ Зафиксировано (variant C)

Агрегация в Customer Health Overview (% VIP в риске) + per-member сигналы в Action Center.

### 11.3 VIP definition ✅ Зафиксировано

`membershipType.name` содержит "VIP" / "Premium" / "Unlimited" (case-insensitive).

### 11.4 Sprint 9 финансы ✅ Зафиксировано

Частично в MVP: revenue per tier, non-member % T4, waitlist count T2. Profitability + event sponsor + school partners — Phase 2.

### 11.5 Customer Health inline-actions ✅ Зафиксировано

Убрать. Перенести в Business Insights как канонические инсайты (`highValueReactivation`, `dormantActivation`).

### 11.6 Leagues в sidebar ✅ Зафиксировано

Удалить из меню. Перенести в Programming IQ как режим.

### 11.7 Scorecard naming ✅ Зафиксировано

Переименовать в **Programming Health**. URL `/scorecard` оставить с redirect (или дать `/programming-health` alias).

### 11.8 Programming Health ↔ Action Center cross-links ✅ Зафиксировано

Deeplinks обоими направлениями.

### 11.9 Period Comparison drawer

- Trend line: simple linear regression
- Defaults: 1m / 3m / 6m + custom
- Атомарность: week (1m/3m), month (6m), переключаемая
- **Background drawer: непрозрачный, без просвечивания основной страницы**

### 11.10 Точность 10% classifier

В оставшихся 10% sessions classifier возвращает fallback `T1_CORE`. Нужно:
- Логировать unclassified для анализа
- ClassifierRule custom rules покрывает локальные пробелы
- Проверить точность на других клубах кроме IPC

### 11.11 LeaguesIQ overlap ✅ Зафиксировано

`LeaguesIQ` переезжает внутрь Programming IQ **как drawer** (выдвижная панель). Содержимое компонента не переписывается — оборачивается в drawer wrapper и открывается через кнопку / фильтр в Programming IQ toolbar.

Operational signal `league_gap` параллельно переиспользует ту же логику (`gapCriticalCount` + `detectLeagueFamily`) — никакого дублирования между drawer и сигналами.

### 11.12 Зомби-страницы

`/reactivation`, `/marketplace`, `/packages` — судьба не решена. Отдельная задача.

### 11.13 `/tournament-ai/*`

8 страниц, 3.7K строк, mock data. В MVP игнорируем.

### 11.14 Manual fields в Programming Health ✅ Зафиксировано

Sponsor / Profitability / School Partners в Programming Health **не отображаются в UI совсем** до тех пор, пока не появятся данные или продуктовое решение по manual entry. Без заглушек, без "Coming in Phase 2" badges.

Manual entry workflow в принципе отложен — может быть рассмотрен позже как отдельная задача, не в этой спеке.

---

## Appendix A: File Reference

| Файл | Что |
|---|---|
| `app/clubs/[id]/intelligence/page.tsx` | Dashboard route |
| `app/clubs/[id]/intelligence/_components/iq-layout/IQSidebar.tsx` | Sidebar — **удалить Leagues, переименовать Scorecard** |
| `app/clubs/[id]/intelligence/_components/iq-pages/DashboardIQ.tsx` | Dashboard — рефакторинг + Programming Health Overview блок + чистка Customer Health |
| `app/clubs/[id]/intelligence/scorecard/page.tsx` | Programming Health route (бывший Scorecard) |
| `app/clubs/[id]/intelligence/_components/iq-pages/WeeklyScorecardIQ.tsx` | Programming Health компонент — переименовать title + добавить Sprint 9 поля + cross-links |
| `app/clubs/[id]/intelligence/leagues/page.tsx` | **Удалить или превратить в redirect на /programming?type=league** |
| `app/clubs/[id]/intelligence/_components/iq-pages/LeaguesIQ.tsx` | Переезжает внутрь Programming IQ |
| `lib/ai/insights-engine.ts` | Мигрируется в `business-insights-engine.ts` |
| `lib/ai/member-health.ts` | 8-компонентная модель, не меняется |
| `lib/ai/programming-tier-classifier.ts` | Переиспользуется через `tier-classifier-extended.ts` |
| `lib/ai/campaign-engine.ts` | Без изменений |
| `lib/ai/sequence-runner.ts` | Без изменений |
| `lib/ai/llm/provider.ts` | Нужен для Phase 2 Auto-suggest |
| `lib/connectors/courtreserve-client.ts` | **Дополняется**: 5 методов (4 write + getWaitlist) |
| `lib/connectors/courtreserve-sync.ts` | Без изменений |
| `server/routers/intelligence.ts` | Дополняется новыми endpoints |
| `prisma/schema.prisma` | Синхронизация после SQL миграции |

---

## Appendix B: Insight Canon Examples

**Положительные:**

```
analysis: "54 новых члена за 30 дней, у 42 из них только 0-2 booking-а"
insight:  "Привычка не формируется в первый месяц — критическое окно для retention"
action.primary:   { type: 'create_cohort', label: 'Создать когорту "Cold onboarding"',
                    cohortRules: [
                      { field: 'joinedDaysAgo', op: 'lt', value: 30 },
                      { field: 'frequency', op: 'lte', value: 2 }
                    ] }
action.secondary: [{ type: 'create_campaign', label: 'Запустить onboarding chain',
                     templateKey: 'cold_onboarding' }]
```

```
analysis: "Peak hour Tuesday 18:00 — occupancy 92% четвёртую неделю"
insight:  "Спрос устойчивый, capacity не хватает, теряем clientele которая уходит"
action.primary: { type: 'programming', label: 'Открыть параллельный слот',
                  params: { date: 'next_tuesday', startHour: 18, hint: 'parallel_to_existing' } }
```

```
analysis: "Из 7 churned (45+ days) — 4 имеют Premium/VIP membership с историей 12+ месяцев"
insight:  "High-value churn. Reactivation вероятность выше чем привлечь нового члена эквивалентной ценности"
action.primary: { type: 'create_campaign', label: 'Запустить targeted reactivation для 4 high-value',
                  templateKey: 'high_value_winback',
                  cohortRules: [
                    { field: 'recency', op: 'gt', value: 45 },
                    { field: 'valueTier', op: 'eq', value: 'high' }
                  ] }
```

```
analysis: "8 человек зарегистрировались, ни разу не пришли"
insight:  "Leak в воронке onboarding — registration без первого визита редко конвертируется"
action.primary:   { type: 'create_cohort', label: 'Создать activation cohort',
                    cohortRules: [
                      { field: 'frequency', op: 'eq', value: 0 },
                      { field: 'joinedDaysAgo', op: 'gte', value: 1 }
                    ] }
action.secondary: [{ type: 'create_campaign', label: 'Запустить activation campaign',
                     templateKey: 'first_visit_activation' }]
```

**Отрицательные:**

```
"586 VIP members at risk"
→ Метрика, не вывод. Едет в Customer Health Overview как агрегация.
→ Каждый VIP с health drop → per-member сигнал в Action Center.
```

```
"5 guests ready for membership"
→ "Ready" — недоказанное допущение. Переформулировать через факты или вырезать.
```

---

## Appendix C: Status Marking

- **R** — работает, не меняем
- **C** — есть в коде, нужна доработка
- **F** — построить с нуля
- **X** — удаляем
- **✅** — решение зафиксировано
- **🔜** — Phase 2

---

## Appendix D: Solomon Preset (sealed JSON)

7 override-определений поверх existing `classifyProgrammingTier`. Применяется при "Apply Solomon Preset" в Tier Constructor.

```json
{
  "version": "1.0",
  "source": "Indianapolis Pickleball Club — Programming Operating System v1.0",
  "presets": [
    {
      "tierKey": "T1_CORE",
      "isActive": true,
      "scope": "per_location",
      "cadence": { "kind": "daily", "minSessions": 1 },
      "successMetric": { "kind": "peak_utilization", "minPct": 70 }
    },
    {
      "tierKey": "T2_LEAGUE",
      "isActive": true,
      "scope": "per_location",
      "cadence": { "kind": "gap_max_days", "maxGapDays": 7 },
      "successMetric": { "kind": "continuity", "maxGapDays": 7 }
    },
    {
      "tierKey": "T3_SIGNATURE",
      "isActive": true,
      "scope": "per_location",
      "cadence": { "kind": "weekly", "minSessions": 1 },
      "successMetric": { "kind": "avg_fill_rate", "minPct": 70 }
    },
    {
      "tierKey": "T4_SOCIAL",
      "isActive": true,
      "scope": "per_location",
      "cadence": { "kind": "monthly", "minSessions": 1 },
      "successMetric": { "kind": "non_member_share", "minPct": 25 }
    },
    {
      "tierKey": "T5_TOURNAMENT",
      "isActive": true,
      "scope": "global",
      "cadence": { "kind": "gap_max_days", "maxGapDays": 60 },
      "successMetric": { "kind": "participant_count", "min": 50 }
    },
    {
      "tierKey": "T6_PREMIUM",
      "isActive": true,
      "scope": "per_location",
      "cadence": { "kind": "monthly", "minSessions": 1 },
      "successMetric": { "kind": "session_count", "min": 1 }
    },
    {
      "tierKey": "T7_YOUTH",
      "isActive": true,
      "scope": "global",
      "cadence": { "kind": "weekly", "minSessions": 1 },
      "successMetric": { "kind": "participant_count", "min": 10 }
    }
  ]
}
```

---

## Appendix E: Solomon Original Documents

Полный текст Programming Operating System v1.0 + IPC Weekly Programming Scorecard от Solomon Shats (Indianapolis Pickleball Club) — основа этой спецификации. Programming Health страница (бывший Scorecard) — техническая реализация его шаблона.
