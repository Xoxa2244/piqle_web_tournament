# IndyLeague Architecture

## Обзор

IndyLeague - новый тип турнира, полностью независимый от Single Elimination и MiLP. Не использует их логику стадий (elimination, bracket, playoff).

## Структура данных

### 1. Tournament (расширение)
- Добавить `INDY_LEAGUE` в enum `TournamentFormat`
- Добавить поля:
  - `seasonLabel` (String?) - опциональный лейбл сезона
  - `timezone` (String?) - таймзона турнира

### 2. MatchDay (новая сущность)
**Таблица:** `match_days`

Поля:
- `id` (UUID, PK)
- `tournamentId` (UUID, FK -> tournaments)
- `date` (DATE, NOT NULL) - дата дня (уникальна в рамках турнира)
- `status` (enum MatchDayStatus: DRAFT, IN_PROGRESS, FINALIZED)
- `createdAt`, `updatedAt`

Индексы:
- UNIQUE(tournamentId, date) - один день на дату в турнире

### 3. IndyMatchup (новая сущность)
**Таблица:** `indy_matchups`

Поля:
- `id` (UUID, PK)
- `matchDayId` (UUID, FK -> match_days)
- `divisionId` (UUID, FK -> divisions)
- `homeTeamId` (UUID, FK -> teams)
- `awayTeamId` (UUID, FK -> teams)
- `tieBreakWinnerTeamId` (UUID?, FK -> teams) - победитель tie-break при 6-6
- `gamesWonHome` (INT, default 0) - количество выигранных игр home
- `gamesWonAway` (INT, default 0) - количество выигранных игр away
- `status` (enum MatchupStatus: PENDING, READY, IN_PROGRESS, COMPLETED)
- `createdAt`, `updatedAt`

Индексы:
- INDEX(matchDayId, divisionId) - для быстрого поиска матчей дня по дивизиону

### 4. DayRoster (новая сущность)
**Таблица:** `day_rosters`

Поля:
- `id` (UUID, PK)
- `matchupId` (UUID, FK -> indy_matchups)
- `teamId` (UUID, FK -> teams)
- `playerId` (UUID, FK -> players)
- `isActive` (BOOLEAN, default false) - активен ли игрок на этот день
- `letter` (VARCHAR(1)?) - буква A/B/C/D (только для активных)
- `createdAt`, `updatedAt`

Индексы:
- UNIQUE(matchupId, teamId, playerId) - один ростер на игрока в матче
- INDEX(matchupId, teamId, isActive) - для быстрого поиска активных игроков

### 5. IndyGame (новая сущность)
**Таблица:** `indy_games`

Поля:
- `id` (UUID, PK)
- `matchupId` (UUID, FK -> indy_matchups)
- `order` (INT, NOT NULL) - порядок игры (1-12)
- `court` (INT, NOT NULL) - корт (1 или 2)
- `homePair` (VARCHAR(2), NOT NULL) - пара home (AB, CD, AC, BD, AD, BC)
- `awayPair` (VARCHAR(2), NOT NULL) - пара away (AB, CD, AC, BD, AD, BC)
- `homeScore` (INT?) - очки home (nullable до ввода)
- `awayScore` (INT?) - очки away (nullable до ввода)
- `createdAt`, `updatedAt`

Индексы:
- UNIQUE(matchupId, order) - одна игра на порядок в матче
- INDEX(matchupId, court) - для фильтрации по корту

## Схема 12 игр (фиксированная)

Для каждого матча создаются 12 игр:

1. AB vs AB (Court 1)
2. CD vs CD (Court 2)
3. AB vs CD (Court 1)
4. CD vs AB (Court 2)
5. AC vs AC (Court 1)
6. BD vs BD (Court 2)
7. AC vs BD (Court 1)
8. BD vs AC (Court 2)
9. AD vs AD (Court 1)
10. BC vs BC (Court 2)
11. AD vs BC (Court 1)
12. BC vs AD (Court 2)

## Enums

### MatchDayStatus
- `DRAFT` - настройка
- `IN_PROGRESS` - идёт ввод
- `FINALIZED` - закрыто, результаты финальные

### MatchupStatus
- `PENDING` - матч не готов (нет активных 4 или букв)
- `READY` - матч готов (есть активные 4 и буквы, игры не сгенерированы)
- `IN_PROGRESS` - игры сгенерированы, идёт ввод результатов
- `COMPLETED` - матч завершён (12 игр завершены, есть победитель)

## Связи

```
Tournament (1) -> (N) MatchDay
MatchDay (1) -> (N) IndyMatchup
IndyMatchup (1) -> (N) DayRoster (по teamId)
IndyMatchup (1) -> (N) IndyGame
Division (1) -> (N) IndyMatchup
Team (1) -> (N) IndyMatchup (как homeTeam или awayTeam)
Player (1) -> (N) DayRoster
```

## Бизнес-логика

### Валидации

1. **MatchDay:**
   - Дата должна быть уникальна в рамках турнира
   - Дата должна быть будущей (или сегодня)

2. **DayRoster:**
   - Для каждого матча и команды должно быть ровно 4 активных игрока
   - Буквы A/B/C/D должны быть уникальны для активных игроков в матче
   - Все активные игроки должны иметь букву

3. **IndyGame:**
   - homeScore и awayScore не могут быть равны (ничьи запрещены)
   - Игра не может быть завершена без обоих счётов

4. **IndyMatchup:**
   - При 6-6 требуется tieBreakWinnerTeamId
   - Матч не может быть завершён без победителя

### Расчёты

1. **gamesWonHome/gamesWonAway:**
   - Считаются по количеству игр, где homeScore > awayScore (или наоборот)

2. **PF/PA/DIFF:**
   - PF = сумма очков команды по всем 12 играм (homeScore для home, awayScore для away)
   - PA = сумма очков соперника
   - DIFF = PF - PA
   - Tie-break НЕ включается в PF/PA/DIFF

3. **Win/Loss:**
   - Определяется по gamesWonHome vs gamesWonAway
   - При 6-6 победитель определяется по tieBreakWinnerTeamId

## UI Компоненты

### Основные экраны

1. **Tournament Creation** (`app/admin/new/page.tsx`)
   - Добавить выбор формата `INDY_LEAGUE`
   - Показать поля: seasonLabel, timezone (если формат IndyLeague)

2. **Match Days Management** (`app/admin/[id]/match-days/page.tsx` - новый)
   - Список дней (календарный/табличный вид)
   - Кнопка "Add Day"
   - Валидация уникальности даты

3. **Day Selector Component** (`components/DaySelector.tsx` - новый)
   - Dropdown/календарь для выбора дня
   - Используется в Score Input и Dashboard
   - Сохраняет выбор при навигации

4. **Matchups Management** (`app/admin/[id]/match-days/[dayId]/page.tsx` - новый)
   - Список матчей по дивизионам
   - Home/Away swap кнопка
   - Назначение букв A/B/C/D
   - Генерация 12 игр

5. **Score Input** (`components/IndyScoreInputModal.tsx` - новый)
   - Вкладки: Divisions/Matches и Pairs
   - Ввод результатов по играм
   - Валидация (нет ничьих, оба счёта обязательны)

6. **Dashboard** (`app/admin/[id]/dashboard/page.tsx`)
   - Убрать elimination/bracket блоки для IndyLeague
   - Добавить Day selector
   - Режимы: "This day only" / "Season to date"

## API Endpoints (tRPC)

### Новые роутеры

1. **matchDayRouter:**
   - `create` - создать день
   - `list` - список дней турнира
   - `get` - получить день с матчами
   - `updateStatus` - изменить статус дня
   - `delete` - удалить день

2. **indyMatchupRouter:**
   - `create` - создать матч
   - `list` - список матчей дня
   - `swapHomeAway` - поменять Home/Away местами
   - `updateRoster` - обновить состав (активные игроки, буквы)
   - `generateGames` - сгенерировать 12 игр
   - `updateGameScore` - обновить счёт игры
   - `updateTieBreak` - установить победителя tie-break
   - `finalize` - завершить матч

3. **indyStandingsRouter:**
   - `get` - получить standings для дня или сезона
   - `calculate` - пересчитать standings

## Миграции

См. файл `add-indyleague-tables.sql`

