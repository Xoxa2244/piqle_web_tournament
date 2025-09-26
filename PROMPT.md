# PROMPT FOR CURSOR — COMPLETE TECH SPEC (v2 with "Merged RR → Split Back on Elimination")

## 0) Goal

Построить веб-консоль турнирного директора для проведения турниров по pickleball с командами 1v1, 2v2 и 4v4. Консоль решает:

1. настройку турнира (инфо-карточка, правила, призы),
2. создание дивизионов с ограничениями по возрасту/DU⁠PR/гендеру и режимом `FIXED`/`MIX_AND_MATCH`, опциональными пулами,
3. импорт игроков/команд из CSV (PickleballTournaments) и ручной ввод/редактирование,
4. drag-and-drop перемещения игроков/команд между командами/пулами/дивизионами,
5. генерацию round-robin (RR), учёт результатов матчей/геймов, таблицы и тай-брейки,
6. автоматическую генерацию стадии элиминации с play-in (добор до 4/8/16),
7. ролевой доступ (TD и ассистенты с привязкой к дивизионам) и журнал правок,
8. публичную страницу «табло» (RR standings + плей-офф + призы) с live-обновлениями,
9. **новое:** возможность **сливать два и более дивизионов** в **единый RR-пул** при малом количестве команд с **авто-разворотом обратно** по исходным дивизионам при старте плей-офф.

## 1) Tech stack & scaffolding

* Next.js 15 (App Router) + TypeScript; deploy на Vercel.
* Supabase: Postgres + Auth (magic link, invite-only) + Realtime + RLS.
* Prisma (ORM) + Prisma Migrate.
* tRPC (server routes) + Zod.
* TanStack Query (client data).
* TailwindCSS + shadcn/ui (UI).
* DnD: `@dnd-kit/core` (+ sortable).
* CSV: `papaparse`.
* Brackets: `react-brackets` (или собственный легкий компонент).
* Tests: Vitest + Testing Library; Playwright e2e.
* Repo layout:

  ```
  /app/(public) /t/[slug]    // public scoreboard
  /app/admin                  // TD console
  /app/api/trpc               // tRPC
  /components /lib /server /prisma /tests /scripts
  PROMPT.md
  ```

## 2) Environment (ожидаемые переменные)

```
DATABASE_URL="postgresql://postgres:<PASSWORD>@db.<PROJECT_ID>.supabase.co:5432/postgres"
NEXT_PUBLIC_SUPABASE_URL="https://<PROJECT_ID>.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="..."
SUPABASE_SERVICE_ROLE_KEY="..."  // на серверной стороне
```

## 3) Data model (Prisma)

Все сущности с `id uuid`, `createdAt`, `updatedAt`.

* **User**: email, name, role ('TD', 'ASSISTANT'), isActive.
* **Tournament**: title, description, rulesUrl, venueName, venueAddress, startDate, endDate, entryFee (Decimal?), isPublicBoardEnabled (Bool), publicSlug (String @unique).
* **Prize**: tournamentId, divisionId (nullable), place (Int), label (String), amount (Decimal?), kind ('cash' | 'other').
* **Division**: tournamentId, name, teamKind ('SINGLES\_1v1' | 'DOUBLES\_2v2' | 'SQUAD\_4v4'), pairingMode ('FIXED' | 'MIX\_AND\_MATCH'), constraintsId (FK), poolsEnabled (Bool), maxTeams (Int?).
* **DivisionConstraints**: divisionId, minDupr (Decimal?), maxDupr (Decimal?), minAge (Int?), maxAge (Int?), genders ('ANY' | 'MEN' | 'WOMEN' | 'MIXED').
* **AssistantAssignment**: userId, divisionId.
* **Pool**: divisionId, name, order.
* **Team**: divisionId, poolId (nullable), name, seed (Int?), note.
* **Player**: firstName, lastName, email (String?), gender ('M' | 'F' | 'X' | null), dupr (Decimal?), birthDate (DateTime?) или age (Int?), externalId (String?).
* **TeamPlayer**: teamId, playerId, role ('CAPTAIN' | 'PLAYER' | 'SUB').
* **RoundRobinGroup**: tournamentId, name (e.g., "Merged RR #1"); rrSettingsId (FK).
* **RRSettings**: targetPoints (Int, default 11), winBy (Int, default 2), gamesPerMatch (Int, default 1), bestOfMode ('FIXED\_GAMES' | 'BEST\_OF').
* **DivisionRRBinding**: divisionId, rrGroupId, status ('BOUND' | 'UNBOUND'). // для слитых RR
* **Match**: rrGroupId (nullable), divisionId (nullable), poolId (nullable), roundIndex (Int), stage ('ROUND\_ROBIN' | 'ELIMINATION' | 'PLAY\_IN'), teamAId, teamBId, bestOfMode, gamesCount, targetPoints, winBy, winnerTeamId (uuid?), locked (Bool).
* **Game**: matchId, index, scoreA, scoreB, winner ('A' | 'B' | null).
* **Standing**: rrGroupId? divisionId? poolId? teamId, wins, losses, pointsFor, pointsAgainst, pointDiff.

  * Для RR в слитом режиме — `rrGroupId` заполнен, `divisionId` null.
  * Для RR без слияния — `divisionId` заполнен, `rrGroupId` null.
* **ImportJob**: tournamentId, source ('PBT\_CSV'), status, mappingJson, rawFileUrl.
* **AuditLog**: actorUserId, action, entityType, entityId, payload JSON.

RLS: чтение/запись только TD и назначенные ассистенты; публичная доска — read-only по `publicSlug`.

## 4) Auth & Roles

* TD: полный доступ; приглашает ассистентов и привязывает их к division.
* ASSISTANT: доступ только к назначенным division и к матчу/таблицам внутри.
* Все мутации пишутся в AuditLog.

## 5) Tournament setup — Wizard

**Step 1 — Info:** название, даты, место, правила (markdown/url), entry fee, опционально общие призы.
**Step 2 — Divisions:** создаём один или несколько division:

* teamKind, pairingMode;
* constraints: включаем/выключаем возраст/DU⁠PR, min/max, genders;
* poolsEnabled (для слияния требуется один пул);
* призы на уровне division.
  **Step 3 — Teams & Players:** команды вручную или импорт CSV; назначение игроков в команды; валидации constraints; force-override с предупреждением.
  **Step 4 — Pools:** если включены — разложение по пулам (DnD). Для слияния — должен быть одиночный пул.
  **Step 5 — RR Settings:** targetPoints=11, winBy=2, gamesPerMatch=1 (или BEST\_OF).
  **Step 6 — Public Board:** включить/выключить, slug.

Навигация: левый сайдбар (Tournament → Divisions → Pools → Teams → Matches). Верхние табы: `Setup | Teams | Scheduling | Results | Prizes | Audit`.

## 6) CSV Import

* Drag-&-drop .csv; превью 100 строк.
* Маппинг столбцов на `Player`/`Team`/`Division`/`Pool`. Поддержать concat/split/regex/trim, парсинг возраста из DoB.
* Дедупликация: по email или fuzzy (name+DoB) с подтверждением.
* Автосоздание division по eventName (опционально).
* ImportJob с undo (транзакционно удалить созданные сущности).

## 7) Drag-and-drop

* Players ↔ Teams (в division), валидировать constraints.
* Teams ↔ Pools (в division).
* Teams ↔ Divisions (только TD; если RR ещё не начат).
* Контекстные меню: Move/Edit/Remove; подсветка проблем.

## 8) Round-Robin (RR)

### 8.1 Генерация

* Для обычного RR без слияния:

  * чётное K — circle method; нечётное — добавляем BYE.
  * создаём **Match** (stage=ROUND\_ROBIN) и нужные **Game**.
  * standings по division (или по pool, если есть пулы).

* **Merged RR (новое):**

  * TD может **сливать** два и более division в **единый RR-пул** при условиях:

    1. одинаковые `teamKind`, `pairingMode`, `RRSettings` (targetPoints/winBy/gamesPerMatch/bestOf),
    2. у каждого division **один пул** (или пулов нет),
    3. операция выполняется **до начала RR** либо **после генерации RR, но пока ни один матч не сыгран** (при слиянии существующее несостоявшееся расписание удаляется и перегенерируется в рамках общего RR).
  * При слиянии создаём **RoundRobinGroup** и записи **DivisionRRBinding** для входящих division.
  * Расписание RR и standings считаются **по rrGroupId** (единая таблица).
  * UI: в админке и на публичной странице доступен переключатель
    «Combined Table (All) / Filter by Division».
  * Разделение (unmerge) доступно **только до первого сыгранного матча**; при unmerge RR пересоздаётся отдельно для каждого division.

### 8.2 Ввод счёта и standings

* Ввод очков на уровне Game; автоматическое определение победителя матча.
* **Standing** обновляется после каждого сохранения: wins, losses, PF, PA, Diff.
* Тай-брейки (см. 8.3) применяются к текущему контексту (rrGroupId или divisionId).

### 8.3 Тай-брейки (в порядке приоритета)

1. Matches Won,
2. Point Differential — Head-to-Head,
3. Point Differential — Within Entry Pool/Group,
4. Point Differential — vs Next Highest-Ranked Team.
   UI показывает breakdown «почему так».

## 9) Переход к плей-офф (Elimination)

* Кнопка **Start Elimination** доступна TD на уровне турнира: **запускает плей-офф одновременно для всех дивизионов** (включая участвующие в merged RR).
* Нажатие фиксирует snapshot standings **в текущий момент** (RR замораживается).
* Для merged RR: посев внутри **каждого** division строим из **общей таблицы rrGroup** с **фильтрацией по исходному division**. То есть учитываются все результаты против всех соперников из объединённого RR, затем формируется сортировка по тай-брейкам и берутся только команды данного division.
* Далее создаётся сетка плей-офф **внутри каждого division** независимо от того, что RR был общий.

### 9.1 Play-in и сетка

* Базовые цели сетки: target ∈ {4, 8, 16, 24, …}
* Примеры:

  * N=4 → полуфиналы: 1–4, 2–3.
  * N=5 → play-in 4–5 за слот #4; далее 1 vs winner, 2 vs 3.
  * N=9 → play-in 8–9 за #8; далее сетка на 8.
  * N=10 → play-in 7–10 и 8–9; далее 8.
  * N=11 → play-in 6–11, 7–10, 8–9; далее 8.
  * N=17 → play-in 16–17; далее 16.
  * N=20 → play-in 13–20, 14–19, 15–18, 16–17; далее 16.
* Пары плей-офф: 1 vs last, 2 vs last-1 … до середины; BYE-слоты для топ-сидов если N < target.
* Формат матчей плей-офф — из настроек division (по умолчанию bestOf=3, до 11, winBy=2).
* Матчи помечаются stage: `PLAY_IN` → затем `ELIMINATION`.

## 10) Публичная страница «табло» `/t/[publicSlug]`

* Селектор Division; для merged RR — переключатель **Combined / By Division**.
* Разделы: **Round-Robin Standings**, **Brackets**, **Prizes**.
* Live-обновления через Supabase Realtime (Game/Match/Standing).
* Read-only, без логина, адаптивно для планшетов/ТВ.

## 11) Scoring UX (директоры/ассистенты)

* Список матчей текущего раунда RR или стадии плей-офф, поиск по командам.
* Карточка матча: список геймов, ввод очков, автопобедитель, lock/unlock.
* Правки после lock — только TD, фиксируются в AuditLog.

## 12) Prizes

* На уровне Tournament (общие) и на уровне Division (место/сумма/описание).
* Публичная доска показывает призы и победителей.

## 13) Validations & constraints

* Соответствие игрока ограничениям division; предупреждение и force-override TD.
* teamKind vs состав команды.
* MIX\_AND\_MATCH — предупреждение при некратном количестве игроков.
* 1v1: команда = игрок (при импорте создаём команду с именем игрока).
* Перемещение команды между division после начала RR запрещено (если матчи сыграны).
* Для merge: проверка идентичности настроек и «единственного пула».
* Merge/unmerge запрещён после сыгранных матчей общего RR.

## 14) Admin tools

* Приглашение ассистентов (magic link), привязка к division.
* Включение/отключение публичной доски.
* Экспорт CSV (матчи, standings, сетка).
* AuditLog с фильтрами.

## 15) Non-functional

* До 500 игроков / 40+ команд в division, live-обновления < 1.5s.
* Supabase RLS; tRPC процедуры проверяют роль и ассайнменты.
* Доступность: фокус-стили, ARIA для DnD.
* UI desktop-first, минимум горизонтального/вертикального скролла, виртуализация списков.

## 16) API/tRPC (минимум)

* `tournament.create/update/get`
* `division.create/update/delete/list`
* `division.setConstraints`
* `division.merge.start({divisionIds[], rrSettingsId?})`  // проверка условий, создание RoundRobinGroup, привязка DivisionRRBinding, реген RR
* `division.merge.unmerge({rrGroupId})`                   // разрешено пока игр нет
* `division.generateRoundRobin({divisionId})`             // обычный режим
* `division.generateElimination({divisionId})`            // используется внутри старт-кнопки
* `tournament.startElimination()`                         // общая кнопка: freeze standings и сгенерировать плей-офф всем division (в т.ч. из rrGroup)
* `pool.create/update/delete/reorder`
* `team.create/update/delete/move`
* `player.create/update/delete/move`
* `import.createJob/uploadCsv/mapFields/commit/undo`
* `match.listByDivision|RRGroup|Round`
* `match.updateGameScore`, `match.lock`, `match.unlock`
* `standing.recalculate`
* `assistant.invite`, `assistant.assign`, `assistant.revoke`
* `public.getBoard(slug)`

## 17) Алгоритмы (детали)

### 17.1 RR генератор (circle method)

* Если K нечётное — добавить BYE, пара с BYE пропускается.
* Для `MIX_AND_MATCH`: внутри раунда строим пары/четвёрки с минимизацией повторов партнёров (жадный алгоритм с локальными свапами); гарантируем корректность до 24 игроков.

### 17.2 Тай-брейки — реализация

* Детализированная сортировка:

  1. wins desc,
  2. head-to-head diff среди связанных,
  3. overall diff в пуле/rrGroup,
  4. diff vs next highest-ranked team (итеративно).
* Возвращать «explain» для UI.

### 17.3 Плей-офф — выбор target

```
N = teams count in division
if N <= 5: target = 4
elif N <= 16: target = 8
else:
  target = 16 + 8 * floor((N-1)/16)
```

* Если N == target → классическая сетка.
* Если N > target → создать PLAY\_IN для «хвоста» за последние слоты.
* Если N < target → BYE для top seeds.

## 18) UI детали

* **Teams board:** три панели (Unassigned | Teams | Pools). DnD со валидацией.
* **RR Standings:** `Seed | Team | W-L | PF | PA | Diff | i` (иконка «почему»).
* **Merged RR:** шапка «Combined RR: \[Div A + Div B + …]», переключатель Combined/By Division.
* **Brackets:** дерево; плей-ин помечен отдельно; BYE слоты скрыты как матчи.
* **Audit:** таблица изменений с фильтрами (actor, division, action).

## 19) Edge cases

* <4 команд — предупреждение: формировать финал вручную или через упрощённую сетку.
* Удаление команды после сыгранных матчей — запрещено; только archive.
* Смена pairingMode после генерации RR — требует регенерации (confirm).
* Merge возможен: до RR или после генерации, но пока игр нет; unmerge — только пока игр нет.
* При merge все несостоявшиеся матчи предыдущих отдельных RR удаляются (логируется в AuditLog).

## 20) Acceptance Criteria

1. TD создаёт турнир, дивизионы, constraints, призы.
2. Импорт CSV маппится в игроков/команды/дивизионы, есть превью и undo.
3. DnD: player↔team, team↔pool, team↔division (до старта RR).
4. RR генерируется; счёт вводится; standings пересчитываются; тай-брейки применяются.
5. **Merged RR:** возможен при совпадающих настройках и одном пуле; общий RR и общая таблица; public-board умеет Combined/By Division.
6. Кнопка **Start Elimination** фиксирует результаты и строит плей-офф **для каждого division отдельно**, используя посев из общей таблицы rrGroup, отфильтрованной по division.
7. Play-in/сетку генерируем по правилам; e2e тесты проходят кейсы N=4,5,6,7,8,9,10,11,16,17,20.
8. Роли и RLS соблюдены; ассистент видит только свои дивизионы.
9. Публичная доска красивая, live, без логина.
10. AuditLog фиксирует каждую правку.

## 21) Milestones

* **M1 — Scaffolding & DB:** проект, Prisma schema, миграции, базовые админ-страницы, auth (invite-only), RLS.
* **M2 — CSV & Teams Board:** импортёр, превью/маппинг/undo, DnD панели, constraints-валидации.
* **M3 — RR & Scoring:** генератор RR (even/odd, BYE, MIX\_AND\_MATCH), формы ввода счёта, standings+тай-брейки.
* **M4 — Merged RR:** RoundRobinGroup, DivisionRRBinding, объединённая таблица, Combined/By Division в UI, merge/unmerge правила.
* **M5 — Elimination & Public Board:** play-in и сетка, старт одной кнопкой, публичная доска с live-обновлениями, призы.
* **M6 — Roles & Audit & e2e:** ассистенты, AuditLog, экспорт CSV, e2e сценарий «импорт → RR (в т.ч. merged) → счёт → плей-офф → паблик».
