# IPC × IQSport — полный roadmap

**Источник:** два feedback-документа от Chris Sears (IPC) — Platform Feedback Notes (что не так с iQSport) + Programming Operating System v1.0 (как IPC хочет программировать клуб).

**Дата:** 2026-05-07
**Автор:** sol + claude
**Статус документа:** working draft, итерируем перед встречей с Chris

---

## TL;DR

Базовая инфраструктура iQSport покрывает **~30%** того что Chris хочет. Большая часть его pain points — это **отсутствие 3-х крупных модулей** (Leagues / Programming Tiers / Multi-channel) + **кучи UX-разрывов** в существующих фичах.

Реалистичный план — 4 фазы по 1-2 недели каждая. Полный охват потребностей IPC за **6-8 недель** активной работы. Часть длинных вещей (autonomous agent, school partnerships, profitability) — на 2-3 квартала вперёд.

**Ключевая стратегическая мысль Chris'а:** «iQSport должен быть **A+ marketing OS поверх** CourtReserve и Patch». Сегодня iQSport ближе к "analytics + early campaigns", а не к "execute everything". Roadmap про этот gap.

---

## Phase 0 — Что УЖЕ работает (показать Chris'у)

Chris многого не нашёл, но это уже в продукте. Перед демо нужно явно показать:

| Фича | Где | Закрывает feedback |
|---|---|---|
| **Slot Filler** (event-level "suggested players") | `/intelligence/slot-filler` | §2-A "Event-Level Intelligence" |
| **AI cohort builder** (prompt-based) | `/intelligence/cohorts` (CohortsIQ) | §2-B AI direction |
| **Campaign Wizard** 4 step (manual + AI hybrid) | `/intelligence/campaigns` | §3-D, §4-#5 |
| **Real-time CR sync** (daily cron) | `lib/connectors/courtreserve-sync.ts` | §4-#4 |
| **Save filtered Members → Cohort → Campaign** | Members page bottom | §3-C, §4-#8 |
| **ENGAGE Tier 1 surveys** (Onboarding/Declining/Sleeping/Birthday) с per-member drilldown | Settings → Automation | §3-H closed-loop |
| **Real CR membership tiers в фильтре** *(только починили 2026-05-07)* | Members → Filter | §3-B membership type |
| **AI Advisor с полным списком тиров** *(только починили)* | AI chat | §3-G tier granularity |
| **White-label sending domain** (DNS verify, custom From) | `Club.sendingDomain*` | §3-I email infra |
| **DUPR rating tracking** | `User.duprRatingDoubles` | §3-G tags |
| **Programming IQ planner** + Ops Session Drafts | `/intelligence/programming-iq` | §4-#1 (частично) |

**Что важно:** на демо завтра нужно сначала пройтись по этим 11 пунктам — Chris думает что многого нет, а у нас есть. Часть его feedback'а — UX/discoverability, не отсутствие фичи.

---

## Roadmap по фазам

### Приоритеты

- **P0** — критично, без этого IPC не сможет нормально пользоваться
- **P1** — большой impact, но IPC переживёт ещё 1-2 недели без этого
- **P2** — nice-to-have, но Chris просил
- **Backlog** — в идеальном мире, не сейчас

---

## Phase 1 — Quick Wins (3-5 рабочих дней)

**Цель:** закрыть UX-разрывы и низко-висящие фичи перед глубокой работой. Покрывает 6 из 24 пунктов feedback'а.

### P1.1 — UX clarity на Members странице *(P0, ~3 часа)*

**Проблема:** Chris не понимает что значит "Active Members" — это booked? paid? played?

**Что делаем:**
- Переименовать "Active" → "Active Players (booked in last 30 days)" в KPI strip
- Добавить tooltip на каждую карточку с явным определением
- Глоссарий-страница `/intelligence/help/definitions` с 15 ключевыми терминами

**Источник:** Feedback §3-A
**Зависимости:** нет
**Риск:** нулевой (косметика)
**Acceptance:** при наведении на любой KPI всплывает definition; Chris в demo'е не задаёт вопросов "что это значит"

### P1.2 — Save as Cohort visibility *(P0, ~2 часа)*

**Проблема:** flow "Filter → Save as Cohort → Launch Campaign" есть, но Chris не нашёл (кнопка живёт внизу страницы под лонг-листом members).

**Что делаем:**
- Поднять кнопку Save-as-Cohort в **fixed bottom bar** который появляется как только применён первый фильтр
- Добавить onboarding-tooltip первый раз когда юзер применил filter
- На Cohorts странице явный CTA "Launch Campaign" на каждой саге

**Источник:** Feedback §3-C, §4-#8
**Зависимости:** нет
**Риск:** нулевой
**Acceptance:** время от open-Members до launch-Campaign < 60 сек на demo

### P1.3 — Pickleball 101 → Membership conversion funnel *(P0, ~1 день)*

**Проблема:** §4-#6 + Programming OS T1.3 — IPC хочет видеть конверсию newcomer'ов в членство.

**Что делаем:**
- Добавить `PlaySession.isIntroProgram` флаг (auto-set по name regex `/pickleball 101|intro|beginner basics/i`)
- tRPC `getIntroConversionFunnel({ clubId, weeks })` — для каждой intro-сессии:
  - кол-во attendees
  - сколько из них стало `membership_status='Active'` за следующие 30 дней
  - conversion rate
- Виджет на Dashboard "Pickleball 101 conversion" (4 числа: weekly intros / attendees / converted / rate)

**Источник:** Programming OS T1.3, Feedback §4-#6
**Зависимости:** нет
**Риск:** низкий
**Acceptance:** Chris видит цифры за последние 4 недели на demo

### P1.4 — Programming Tier auto-classification *(P0, ~1 день)*

**Проблема:** Chris думает в 7 tier'ах, у нас плоский `format` enum.

**Что делаем:**
- `prisma/schema.prisma` — добавить `programmingTier` enum (T1_CORE / T2_LEAGUE / T3_SIGNATURE / T4_SOCIAL / T5_TOURNAMENT / T6_PREMIUM / T7_YOUTH) на `PlaySession`
- `lib/ai/programming-tier-classifier.ts` — функция `classifyTier(session)`:
  - format='LEAGUE_PLAY' → T2
  - name regex /round robin|moneyball|king queen|dupr event/i → T3
  - name regex /cosmic|trivia|themed|charity/i → T4
  - format связан с Tournament → T5
  - name regex /pro clinic|specialty clinic|visiting/i → T6
  - name regex /youth|academy|kids|junior/i → T7
  - default → T1
- Backfill миграция для existing 50k+ sessions
- Per-club override таблица `ClubTierRule` чтобы admin мог перенастроить regex

**Источник:** Programming OS все tier'ы; Feedback §3-B
**Зависимости:** нет
**Риск:** средний (regex может промахнуться, нужен manual override UI после)
**Acceptance:** на IPC данных >85% sessions классифицированы правильно (sample audit)

### P1.5 — White-label sending domain в Settings UI *(P1, ~3 часа)*

**Проблема:** §3-I — Chris думает что у нас только shared sending. На самом деле white-label есть, но скрыт.

**Что делаем:**
- В `Settings → Email Sending` добавить блок "Sending Domain" с состоянием:
  - Shared (default) — простой текст про deliverability
  - Custom domain → DNS records → Verify → Enable button (это уже всё работает в backend)
- Tooltip про IP warming для крупных клубов

**Источник:** Feedback §3-I
**Зависимости:** нет (backend готов)
**Риск:** нулевой
**Acceptance:** Chris сам в Settings подключает свой домен

### P1.6 — "Active Players" tile alignment audit *(P1, ~2 часа)*

Проверить что **везде** в продукте "Active" значит одно и то же. Сейчас есть несколько определений:
- Members KPI: subscription `membership_status='Active'`
- Dashboard: bookings ≥1 in period
- Advisor: `getClubMetrics.activePlayers30d`

Согласовать на одно — **booking activity**, переименовать subscription-based в "Active Subscribers".

**Источник:** Feedback §3-A
**Acceptance:** одно слово = один смысл по всем экранам

---

**Итого Phase 1: ~5 дней.** Закрывает UX feedback + 1 базовая Programming OS фича.

---

## Phase 2 — Programming OS Core (8-12 рабочих дней)

**Цель:** реализовать сердце операционной модели IPC — Leagues + Weekly Scorecard.

### P2.1 — League как first-class entity *(P0, 4-5 дней)*

**Самый большой gap из Programming OS.** Chris хочет continuous leagues, gap detection, enrollment management.

**Что делаем:**

**Schema (~1 день):**
```prisma
model League {
  id           String     @id @default(uuid())
  clubId       String
  name         String
  type         LeagueType  // INTERNAL / CORPORATE / EXTERNAL_PARTNER / INTERCLUB
  status       LeagueStatus // DRAFT / OPEN_ENROLLMENT / ACTIVE / FINISHED
  startDate    DateTime
  endDate      DateTime
  capacity     Int?
  divisionLevel String?    // skill bracket
  // ... linkage
  enrollments  LeagueEnrollment[]
  sessions     PlaySession[] @relation("LeagueSessions")  // sessions belonging to this league
}

model LeagueEnrollment {
  id           String     @id @default(uuid())
  leagueId     String
  userId       String
  status       String     // confirmed / waitlist / withdrew
  enrolledAt   DateTime
  bracket      String?    // optional
}

enum LeagueType { INTERNAL CORPORATE EXTERNAL_PARTNER INTERCLUB }
enum LeagueStatus { DRAFT OPEN_ENROLLMENT ACTIVE FINISHED }
```

**Backend (~1.5 дня):**
- tRPC `intelligence.leagues.list({ clubId, status? })`
- `intelligence.leagues.create / update / archive`
- `intelligence.leagues.enroll / withdraw / promoteFromWaitlist`
- Auto-grouping job: для existing PlaySessions с format='LEAGUE_PLAY' и одинаковым `name` стрейкой даты — сгруппировать в `League`
- Gap detector cron: ежедневно проверяет "league type X закончилась 7+ дней назад, нет следующей" → push to `AgentDraft` queue

**UI (~1.5 дня):**
- `/intelligence/programming-iq/leagues` — list + filter (active/upcoming/ended)
- League detail drawer — enrollment list + waitlist + sessions
- Create-league wizard: name → type → schedule → enrollment open
- "Continuous availability" widget на Programming IQ dashboard (показывает gaps)

**Источник:** Programming OS T2 (полностью); Feedback §3-B Programs, §3-D campaigns-by-event
**Зависимости:** нет
**Риск:** **высокий** (новая большая модель, нужна миграция, нужна интеграция с существующими league sessions)
**Acceptance:** Chris видит 5 IPC лиг с правильными members и understanding gaps

### P2.2 — Weekly Programming Scorecard *(P0, 3 дня)*

**Точная копия документа Chris'а** — Weekly Programming Scorecard per location.

**Что делаем:**

**Backend (~1 день):**
- tRPC `intelligence.getWeeklyScorecard({ clubId, weekStart })` — собирает за неделю по каждому tier:
  - T1: # sessions / # players / avg / peak utilization / fill rate
  - T1.3 specifically: Pickleball 101 sessions run / new players / conversion %
  - T2: active leagues / participants / fill / waitlist / gaps Y/N
  - T3: events / participants / avg / revenue / top performer
  - T4: events / participants / non-member % / revenue / sponsor
  - T5: tournament Y/N / players / revenue / profitability
  - T6: specialty clinics / participants / revenue / pro clinic Y/N
  - T7: youth sessions / participants / partners
- `KPISummary`: weekly revenue / unique participants / new players / court utilization
- Execution check booleans (4 yes/no)

**UI (~1.5 дня):**
- `/intelligence/programming-iq/scorecard?week=YYYY-MM-DD` — рендерит точный формат Chris'а
- Week selector (prev/next/calendar)
- Per-tier sections с цветным badge (зелёный = goals met, жёлтый = warning, красный = miss)
- "Submit" кнопка → email Chris'у/admin pdf attachment

**Export (~0.5 дня):**
- Server-side PDF generation (puppeteer или jsPDF)
- Endpoint `/api/intelligence/scorecard/pdf?clubId&week=...`
- Email scheduling: каждый понедельник 06:00 рапорт на club admins

**Источник:** Programming OS Weekly Scorecard (целиком)
**Зависимости:** P1.4 (tier classification), P2.1 (League entity для T2 секции)
**Риск:** низкий (простой aggregation)
**Acceptance:** Chris открывает scorecard для прошлой недели и все цифры match его ручным подсчётам

### P2.3 — League gap detector → Agent draft *(P1, 1 день)*

**Что делаем:**
- Cron job (daily) проходит по `League`, ищет "type X закончился, следующего нет"
- Создаёт `AgentDraft` с suggested action "Open enrollment for next IPC league" + предзаполненный template
- Admin видит в очереди → approve → запускается workflow создания

**Источник:** Programming OS T2 "never between sessions"
**Зависимости:** P2.1
**Risk:** низкий
**Acceptance:** имитируем что league закончилась — на следующий день в Agent queue видим draft

### P2.4 — Tier-aware Cohort filter *(P1, ~1 день)*

**Расширить Cohort Builder** чтобы можно было фильтровать "members who attended T3 events 3+ times" — это даёт programs/leagues granularity §3-B.

**Что делаем:**
- В `CohortsIQ` filter drawer добавить группу "Programming participation"
- Фильтры: "attended any T3 event", "attended specific league", "attended Pickleball 101", "attended X+ T2 sessions"
- Backend cohort eval — JOIN на play_session_bookings + programmingTier filter

**Источник:** Feedback §3-B programs, §4-#2
**Зависимости:** P1.4 (tier classification)
**Acceptance:** Chris строит cohort "All who attended at least 2 Round Robins last month" за 30 секунд

---

**Итого Phase 2: ~10 дней.** Закрывает большую часть Programming OS + ключевые segmentation gaps.

---

## Phase 3 — Channels Expansion (10-15 рабочих дней)

**Цель:** Email + SMS + Push под одной крышей. Это §3-E + §4-#7 — единственный fundamental gap который Chris правильно подсветил.

### P3.1 — SMS pipeline через Twilio *(P0, 4-5 дней)*

**Что делаем:**

**Infrastructure (~1 день):**
- Twilio account + phone number (один на клуб?)
- `Club.smsFromNumber`, `Club.smsAccountSid` (encrypted)
- Migration: добавить SMS-related поля в существующую `Campaign.steps[].channel`

**Backend (~2 дня):**
- `lib/sms/twilio-send.ts` — обёртка с rate limiting, error handling, retry
- `lib/sms/sms-template.ts` — короткие версии email-template'ов (160 char limit)
- Compliance: STOP / HELP keywords + opt-out tracking
- Integration в Campaign send pipeline — каждый step имеет `channel: 'email' | 'sms'`
- `SmsSendLog` model для tracking deliverability

**UI (~1.5 дня):**
- В Campaign Wizard step 2 ("Channel") выбор email/sms/both
- Per-user preference UI на Member detail drawer (channel preference)
- SMS template editor (160 char counter, link shortening через bit.ly или own service)

**Compliance (~0.5 дня):**
- TCPA disclaimer на всех signup forms
- "Reply STOP to unsubscribe" в каждом message
- Audit log для opt-ins

**Источник:** Feedback §3-E, §4-#7
**Зависимости:** нет
**Риск:** **средний** (compliance важен, twilio costs ~$0.0079/sms — будем counting), нужен sign-off от user'ов
**Acceptance:** test send на 5 admin'ов из Campaign Wizard, оба канала работают

### P3.2 — Push notifications (Web Push для admin) *(P1, 2-3 дня)*

**Scope:** только web push для admin'ов (notify об agent drafts, лиды, low-fill events). Member-facing push (iOS/Android) — за rope, нужно мобильное приложение.

**Что делаем:**
- Service Worker registration (`/public/sw.js`)
- VAPID keys generation
- `web-push` npm lib
- `User.pushSubscription` field
- Notification triggers: agent draft created, cohort builder finished, big event under-filled
- UI: "Enable browser notifications" toggle в Settings

**Источник:** Feedback §3-E (push), §4-#7
**Зависимости:** нет
**Риск:** низкий
**Acceptance:** Chris получает push когда новый birthday gift готов to fulfill

### P3.3 — Channel preference matrix *(P1, ~1 день)*

**Что делаем:**
- На каждом member: `User.channelPreferences = { email: 'always' | 'transactional' | 'never', sms: ..., push: ... }`
- Engage detectors уважают preferences (если SMS opted out — не отправляем SMS даже если в template)
- UI: per-member toggle на Member detail drawer

**Источник:** Feedback §3-E "Channel preference logic"
**Зависимости:** P3.1
**Acceptance:** member выбирает SMS-only, follow-up campaign шлёт ему ровно SMS

### P3.4 — Send-time optimization *(P2, 2 дня)*

**Что делаем:**
- Учиться на каждом send: open/click → time-of-day distribution per member
- При следующем send: если есть individual data — отправить в личный peak slot, иначе fallback на club default

**Источник:** Feedback §2-B "Automated optimization"
**Зависимости:** P3.1
**Риск:** низкий
**Acceptance:** A/B test показывает CTR uplift > 5% vs broadcast

---

**Итого Phase 3: ~10 дней.** Закрывает multi-channel gap полностью.

---

## Phase 4 — Advanced Marketing OS (15-20 рабочих дней)

**Цель:** превратить iQSport в "marketing OS, не analytics + early campaigns" (Chris §1).

### P4.1 — Generic Event → Campaign builder *(P0, 3-4 дня)*

**Сейчас:** Slot Filler работает только для underfilled. Chris хочет: "select **any** event → auto-build audience → send".

**Что делаем:**
- На странице `/intelligence/events` (или Programming IQ) каждая session/event имеет кнопку "Promote this"
- Click → wizard:
  1. **Audience** — auto-suggest на базе:
     - bookings to similar past events
     - skill-level matching
     - geographic proximity
     - inactive members in target tier
  2. **Message** — AI-generated draft с placeholders события
  3. **Channel** — email/sms/push (после Phase 3)
  4. **Schedule** — send now / later / on-trigger
- Это переиспользует существующий Campaign Wizard backend, просто другая entry point

**Источник:** Feedback §3-F, §4-#1
**Зависимости:** ничего критичного
**Риск:** низкий
**Acceptance:** Chris для конкретного "Saturday Round Robin June 15" за минуту запускает кампанию

### P4.2 — Visual journey builder *(P1, 6-8 дней)*

**Что делаем:**
- React Flow или похожая lib
- Triggers (event attended, booked, didn't book, lifecycle stage entered)
- Actions (send email, send sms, wait N days, branch on opened/clicked)
- Save as template
- Pre-built templates (Onboarding, Reactivation, Birthday cycle) с возможностью кастома

**Источник:** Feedback §3-D, §4-#3 "Like Patch"
**Зависимости:** P3.1 (для SMS step)
**Риск:** **высокий** — это сложная UI задача, можно недооценить
**Acceptance:** Chris создаёт own journey "Pickleball 101 → 7 days → invite to Open Play → 14 days → if didn't come, trial offer"

### P4.3 — Custom Tags на members *(P1, 2 дня)*

**Что делаем:**
- `MemberTag` table (clubId, userId, tag, addedBy, addedAt)
- UI: на Member detail drawer add/remove tags (autocomplete)
- В Cohort Builder filter "has tag X"
- Bulk-tag из Cohort или Members list

**Источник:** Feedback §3-B, §3-G
**Зависимости:** нет
**Risk:** низкий
**Acceptance:** Chris тегает 50 "competitive players" и строит cohort за 30 секунд

### P4.4 — A/B test framework wired в Campaign Wizard *(P1, 3 дня)*

**Что делаем:**
- В Campaign Wizard step 3 ("Message") опция "Test 2 variants"
- Backend split A/B (50/50) или multi-armed bandit (variant optimizer уже есть как pattern, нужно подключить)
- Reporting: CTR / open rate / conversion per variant
- Auto-promote winner после N days

**Источник:** Feedback §2-B "automated optimization"
**Зависимости:** нет
**Риск:** средний (нужно правильно делать random assignment)
**Acceptance:** Campaign со 2 вариантами, после 100 sends auto-promote winner

### P4.5 — Closed-loop survey extension *(P2, 2 дня)*

**Что есть:** ENGAGE Tier 1 surveys (4 типа) пишут в `MicroSurveyResponse`.

**Что нужно:** разрешить admin'у создавать **custom surveys** (кроме 4 встроенных), и чтобы ответы приходили в общий dashboard.

**Что делаем:**
- `Survey` model + builder UI (name, questions, options)
- Generic `/survey/{id}/respond` endpoint
- Тенпан "send survey" в Campaign Wizard

**Источник:** Feedback §3-H closed-loop
**Зависимости:** нет
**Acceptance:** Chris делает survey "Why did you skip last week?", шлёт 30 declining members, видит ответы в дашборде

---

**Итого Phase 4: ~20 дней.** Закрывает Advanced Marketing блок полностью.

---

## Phase 5 — Big Vision (4-8 недель + ongoing)

Это "ideal end state" из feedback §6 — Chris хочет "Fill my league next week" → система всё делает сама. Это roadmap на 2-3 квартала.

### P5.1 — Autonomous Agent Campaign Layer *(P1 long-term, 3-4 недели)*
- Уже есть `AgentDraft` + draft queue + autonomy policy
- Сейчас safety-locked в Settings → Automation
- Постепенный rollout: per-segment autonomy unlock после X successful pilots
- Команды типа "Fill league" → agent сам строит cohort + campaign + sends

**Источник:** Feedback §6, §5

### P5.2 — Profitability per event *(P2, 2-3 недели)*
- Cost model: instructor cost + court hour cost + materials
- `EventCost` table
- Net profit per event/tournament
- Scorecard секция T5 наполнится

**Источник:** Programming OS Scorecard "Profitability"

### P5.3 — Youth Pipeline dedicated module *(P2, 2 недели)*
- `User.isYouth` + birth date validation
- Youth program tagging
- Parent-link tracking (для billing/permissions)
- School partnership entity + reporting

**Источник:** Programming OS T7, "School/community partnerships"

### P5.4 — Sponsor / Partnership tracking *(P2, 1 неделя)*
- `Sponsor` entity, link to event/tournament
- Sponsored sessions reporting
- Sponsor dashboard widget

**Источник:** Programming OS T4, T5

### P5.5 — Email Deliverability dashboard *(P2, 1 неделя)*
- IP reputation tracking
- Bounce / complaint rate per club / domain
- Suggested actions при degradation
- IP warming wizard для new white-label domains

**Источник:** Feedback §3-I

### P5.6 — Multi-location orchestration *(Backlog)*
- IPC = 3 locations. Сейчас они отдельные `Club` rows
- Mother-club concept: campaigns runable across locations
- Cross-location member view
- Combined scorecard

**Источник:** Programming OS "city-wide" сообщения

---

## Сводная таблица приоритетов

| ID | Item | P | Phase | Эстимейт | Источник |
|---|---|---|---|---|---|
| P1.1 | UX clarity + tooltips | P0 | 1 | 3h | F§3-A |
| P1.2 | Save-as-Cohort discoverability | P0 | 1 | 2h | F§3-C |
| P1.3 | Pickleball 101 funnel | P0 | 1 | 1d | F§4-#6 + POS T1.3 |
| P1.4 | Tier auto-classification | P0 | 1 | 1d | POS все tier'ы |
| P1.5 | Sending domain UI | P1 | 1 | 3h | F§3-I |
| P1.6 | "Active" alignment audit | P1 | 1 | 2h | F§3-A |
| **P2.1** | **League entity** | **P0** | **2** | **5d** | **POS T2** |
| **P2.2** | **Weekly Scorecard** | **P0** | **2** | **3d** | **POS Scorecard** |
| P2.3 | League gap detector | P1 | 2 | 1d | POS T2 |
| P2.4 | Tier-aware Cohort filter | P1 | 2 | 1d | F§3-B |
| **P3.1** | **SMS pipeline** | **P0** | **3** | **5d** | **F§3-E** |
| P3.2 | Web push (admin) | P1 | 3 | 3d | F§3-E |
| P3.3 | Channel preference matrix | P1 | 3 | 1d | F§3-E |
| P3.4 | Send-time optimization | P2 | 3 | 2d | F§2-B |
| **P4.1** | **Generic Event → Campaign** | **P0** | **4** | **4d** | **F§3-F** |
| P4.2 | Visual journey builder | P1 | 4 | 8d | F§3-D, §4-#3 |
| P4.3 | Custom tags | P1 | 4 | 2d | F§3-G |
| P4.4 | A/B test framework | P1 | 4 | 3d | F§2-B |
| P4.5 | Custom surveys | P2 | 4 | 2d | F§3-H |
| P5.1 | Autonomous Agent | P1-LT | 5 | 3-4w | F§6 |
| P5.2 | Profitability model | P2 | 5 | 2-3w | POS Scorecard |
| P5.3 | Youth pipeline | P2 | 5 | 2w | POS T7 |
| P5.4 | Sponsor tracking | P2 | 5 | 1w | POS T4/T5 |
| P5.5 | Deliverability dashboard | P2 | 5 | 1w | F§3-I |
| P5.6 | Multi-location | Backlog | 5 | 2w | POS implicit |

**Расшифровка:** F = Platform Feedback Notes, POS = Programming Operating System v1.0, P0/P1/P2 = priority, P1-LT = priority 1 long-term.

---

## Что показать Chris'у завтра

Не обещать всё. Показать **3 вещи**:

1. **Что уже работает** (Phase 0 list — 11 фич) — пройтись по каждой за 30 сек на demo
2. **Phase 1 quick wins** запускаем **на этой неделе** — 5 дней работы, всё P0:
   - UX/discoverability + Pickleball 101 funnel + Tier classification
3. **Phase 2 (Programming OS)** — 2 недели, выкатываем к концу мая:
   - League entity + Weekly Scorecard

Это даёт ему **рабочую модель его операционки в iQSport за 3 недели**. SMS / Push / Visual builder — Phase 3 (июнь). Autonomous + Youth + Profitability — Phase 5 (Q3).

---

## Risks & Open Questions

### Технические
- **Schema migrations large:** Phase 2 + 3 добавляют 5+ новых таблиц. Нужны careful prod migrations.
- **CR API limits:** при росте data sync может выйти за rate limit. Нужно proactive caching.
- **SMS cost:** $0.0079/sms × IPC traffic = надо считать unit economics. Возможно cap'ить в Settings.
- **Web Push browser support:** Safari iOS only since 16.4. iOS-mobile push требует native app.

### Стратегические
- **IPC vs other clubs:** многие фичи кажутся IPC-specific (Pickleball 101 funnel, T7 Youth). Нужно строить **configurable**, не hardcoded для IPC.
- **Patch / CourtReserve overlap:** где iQSport кончается, начинается Patch? Чёткая позиционная карта на будущий sales pitch.

### Open questions для Chris (на встрече)
- Сколько времени их operator готов потратить per week на iQSport vs CourtReserve?
- Готовы ли они делиться own SMS sender ID или используют наш default?
- Что для них **более ценно через 4 недели** — League/Scorecard модули (P2) или multi-channel (P3)?
- Кто внутри IPC будет owner'ом scorecard'а — head coach / operations / marketing?

---

## Tracking

Этот документ — living. Каждый item получит свой ticket / PR / commit. Статус обновляем в этой таблице приоритетов:

| Item | Status |
|---|---|
| P1.1 — P1.6 | Not started |
| P2.1 — P2.4 | Not started |
| P3.1 — P3.4 | Not started |
| P4.1 — P4.5 | Not started |
| P5.1 — P5.6 | Backlog |

При завершении: меняем `Not started` → `In progress` (PR-ID) → `Shipped` (commit + дата).
