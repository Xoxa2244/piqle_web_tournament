# Programming IQ — логика экрана

Обновлено: 2026-04-30

## Что это за экран

`Programming IQ` — экран недельного программирования клуба.
Он не публикует расписание сам, а собирает и показывает:

- `Published sessions` — уже живые сессии из календаря.
- `Suggested sessions` — publish-ready draft suggestions.
- `Audience saturation risk` — draft suggestions, которые можно поставить в календарь, но они перегружают один и тот же player pool.
- `Unplaced ideas` — сильные идеи, которые не удалось привязать ни к одному активному корту на этой неделе.

## Основные файлы

- `lib/ai/advisor-programming.ts` — считает спрос, формирует proposals и adaptive weights.
- `lib/ai/programming-iq-scheduler.ts` — выбирает weekly mix, раскладывает по кортам, ставит warnings.
- `lib/ai/programming-iq-regenerate.ts` — мягко перетасовывает ranking по admin prompt.
- `server/routers/intelligence.ts` — генерация, persistence draft rows, reset.
- `app/clubs/[id]/intelligence/_components/iq-pages/ProgrammingIQ.tsx` — сам экран.
- `app/clubs/[id]/intelligence/_components/iq-pages/programming/ProgrammingGrid.tsx` — календарь и легенда.

## Какие данные использует алгоритм

- активные корты клуба
- live sessions текущей недели
- historical sessions за последние 60 дней
- `userPlayPreference`
- `sessionInterestRequest`
- inferred preferences из подтверждённых бронирований
- member profile prior:
  - `skillLevel`
  - `dateOfBirth` → age buckets
  - `gender` не является общим драйвером weekly mix
- contact policy: `inviteCapPerMemberPerWeek`
- optional `regeneratePrompt`

## Алгоритм по шагам

1. Собираем сигналы спроса.
   Предпочтения, interest requests и member-profile prior переводятся в `slotDemand`, `formatDemand`, `skillDemand`.

2. Считаем `weight profile`.
   Один и тот же алгоритм используется для всех клубов, но веса адаптируются по качеству данных клуба.

3. Генерируем proposals двух типов:
   - `expand_peak` — усилить уже доказанный слот
   - `fill_gap` — аккуратно протестировать новое окно

4. Annotate conflicts.
   Для каждого proposal считаются риски:
   - overlap
   - cannibalization
   - court pressure

5. Собираем weekly mix жадным balanced-selection.
   Берётся не просто `top N`, а лучший следующий слот с учётом уже выбранных.

6. Раскладываем proposals по активным кортам.
   Планировщик:
   - избегает live overlap
   - избегает overlap с уже выбранными draft suggestions
   - предпочитает indoor для вечерних слотов
   - старается не кластеризовать одинаковый skill рядом
   - распределяет нагрузку по кортам

7. Ставим `audience saturation` warnings.
   Если один и тот же skill pool при текущем invite cap будет получать слишком много приглашений, suggestion маркируется как risk.

8. Persist drafts.
   Все suggestions и unplaced ideas сохраняются как `opsSessionDraft`, чтобы UI мог их показать, раскрыть и отредактировать.

## Adaptive weights

### 1. Надёжность сигналов

`advisor-programming.ts` считает reliability для каждого источника:

- `history`
- `preferences`
- `interest`
- `membershipFit`
- `skillProfile`
- `ageProfile`
- `momentum`
- `courtOps`
- `weekday`

Ключевая идея:

`effective weight = base weight * reliability`

Потом веса нормализуются.

### 2. Maturity

`maturity = historyReliability`

То есть новый клуб и зрелый клуб проходят один и тот же pipeline, но по-разному доверяют истории.

### 3. Base weights для `expand_peak`

До normalisation:

- `historical`: `0.18 → 0.34`
- `slotDemand`: `0.16 → 0.14`
- `interest`: `0.18 → 0.14`
- `membershipFit`: `0.12`
- `skillProfile`: `0.20 → 0.08`
- `ageTimeFit`: `0.05 → 0.02`
- `momentum`: `0.06 → 0.08`
- `courtHeadroom`: `0.03 → 0.05`
- `weekdayStrength`: `0.02 → 0.03`

Левое значение — ближе к low-history club, правое — к mature club.

### 4. Base weights для `fill_gap`

До normalisation:

- `historical`: `0.10 → 0.18`
- `slotDemand`: `0.22 → 0.20`
- `interest`: `0.20 → 0.18`
- `membershipFit`: `0.12`
- `skillProfile`: `0.21 → 0.08`
- `ageTimeFit`: `0.06 → 0.02`
- `momentum`: `0.04 → 0.08`
- `courtHeadroom`: `0.03 → 0.08`
- `weekdayStrength`: `0.02 → 0.06`

## Scoring по факту

### Expand / proven windows

Для `expand_peak` confidence собирается из:

- historical occupancy
- slot demand
- interest backlog
- membership fit
- skill profile fit
- age/time fit
- momentum
- court headroom
- weekday strength

### Gap-fill / new windows

Для `fill_gap` confidence собирается из:

- historical similarity score
- slot demand
- interest backlog
- membership fit
- skill profile fit
- age/time fit
- momentum
- court headroom
- weekday strength

Важно:

- `gap-fill` больше не берёт один глобальный `topFormat/topSkill` на весь клуб.
- format + skill выбираются под конкретное окно.

## Финальный weekly selection

В `programming-iq-scheduler.ts` используется такой greedy score:

```text
selectionScore =
  confidence * 1.0 +
  projectedOccupancy * 0.55 +
  interestPressure * 0.4 -
  conflictPenalty -
  portfolioPenalty
```

Где:

- `interestPressure = estimatedInterestedMembers / maxPlayers`, нормализованный в `0..100`
- `MIN_SELECTION_SCORE = 62`

### Conflict penalties

- overlap: `medium 8`, `high 20`
- cannibalization: `medium 12`, `high 28`
- court pressure: `medium 7`, `high 16`

### Portfolio penalties

- повтор одного и того же `format + skill`: `10`, затем `+14` за каждый следующий
- перекос в один и тот же `format`: `+6`
- duplicate того же slot: `+14`, а если rule не проходит — proposal блокируется
- prime-time `OPEN_PLAY`: `+12` за уже выбранные похожие слоты

### Duplicate rule

Один и тот же слот на второй корт разрешается только если:

- `projectedOccupancy >= 90`
- `cannibalizationRisk = low`
- `courtPressureRisk != high`

## Court assignment: что важно

- conflict-check идёт по всем активным кортам, не по одному
- учитываются live sessions и уже выбранные draft suggestions
- `dayOfWeek` вычисляется в timezone клуба, чтобы не было ложных конфликтов из-за UTC midnight
- если исторические `observed court hours` не покрывают окно, но активный корт реально свободен, включается `hours fallback`
- только если свободного активного корта нет вообще, идея уходит в `Unplaced ideas`

## Как работает Regenerate

`programming-iq-regenerate.ts` не строит расписание с нуля. Он только мягко reweight уже посчитанные proposals.

Текущие multipliers:

- `BOOST_MULTIPLIER = 1.12`
- `PENALTY_MULTIPLIER = 0.90`
- `MIN_TOTAL_MULTIPLIER = 0.86`
- `MAX_TOTAL_MULTIPLIER = 1.18`

Что ещё важно:

- если prompt пустой, regenerate старается не повторить exact same mix
- если prompt явный, requested idea пинится в shortlist
- есть heuristic fallback, даже если LLM hint не вернулся

## Что сделали сегодня

### Алгоритм

- Перевели экран на единый deterministic planner с adaptive weights.
- Убрали жёсткую зависимость от одного глобального `topFormat/topSkill` для gap-fill.
- Добавили `member profile prior` для клубов с малой историей.
- Interest requests без `preferredDays` больше не теряются.
- Regenerate теперь реально меняет ranking и умеет пинить явный admin request.
- Court assignment теперь делает fallback на свободный активный корт, даже если history по court-hours слабая.

### UI / поведение экрана

- Цвет карточки теперь означает статус, skill вынесен в badge.
- `Suggested with audience saturation risk` показываются прямо в календаре, если их можно поставить в слот.
- Ниже отдельно остаются только `Unplaced ideas`.
- В легенду добавлены пояснения по статусам.
- Добавлена кнопка `Clear suggestions` для удаления draft suggestions текущей недели.

### Guardrails

- Risk suggestions не участвуют в bulk publish.
- Suggestions с saturation warning всё ещё раскрываются и объясняются в popover.
- Unplaced ideas тоже сохраняются как draft и не исчезают из UI.
