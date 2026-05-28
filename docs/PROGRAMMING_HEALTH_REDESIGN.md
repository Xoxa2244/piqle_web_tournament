# Programming Health — Redesign Plan

> Документ для человека + агента. Спланировано в сессии 2026-05-28.
> Статус: **план, код не начат.**
> Парный раздел `Membership Health` уже сделан Соломоном (см. §4) — этот
> редизайн зеркалит его паттерн.

---

## 1. TL;DR

Programming Health сейчас построен вокруг **7 тиров (T1-T7)** — абстрактного
фреймворка, который оператор должен выучить. Убираем тиры как сущность,
строим страницу вокруг **реальных программ клуба** и их **динамики**, с
подсказками что делать.

Две части на одной странице:
1. **Цифры** — программы клуба, рост/падение, заполняемость
2. **Что делать** — инсайты под цифрами, привязанные к этим программам

Плюс **drill-down модалка с графиком** по клику на программу.

---

## 2. Зачем (проблема с текущим состоянием)

- **Тиры непонятны.** «Что такое T3 Signature?» — оператор не думает в этих
  терминах. Он думает «у меня есть Open Play, Уроки, Лиги».
- **Нет базовой информации.** Programming Health показывает tier-фреймворк,
  но НЕ отвечает на простейший вопрос: «какие мои программы растут, какие
  загибаются?». Это фундаментальный gap.
- **Tier execution check** («не было signature event на этой неделе») —
  prescriptive, но завязан на framework который оператор не принял.

---

## 3. Концепция

### Единица = «программа» (program family)

Не тир, а **семья программ** — умная группировка реальных сессий клуба.
Для IPC East из ~44 уникальных `title` получается ~7 families:

| Family | ~sessions/30d | Примеры titles |
|---|---|---|
| 🟢 Open Play | ~348 | Verified Open Play - Competitive/Casual/Advanced/Intermediate |
| 🔵 Court Bookings | ~262 | Singles/Doubles — Court #N (pickup) |
| 🟣 Private Lessons | ~65 | Private Lesson for 1/2/3+ |
| 🟡 Clinics & Training | ~71 | VamosPickle Intensive, Drills & Skills, IQ & Strategy |
| 🟠 Leagues | ~48 | Intermediate/Senior/Casual/Mixed/DUPR League, IPL Team Practice |
| ⚫ Ball Machine / Equipment | ~93 | Single Person - Ball Machine (facility, НЕ programming) |
| 🟤 Youth | ~9 | IPC Youth Summer Clinics |

**Важно честно:** families — это по сути **переименованные тиры** (группировка
программ с человеческими именами, derived from data вместо fixed T1-T7,
descriptive вместо prescriptive). Группировку убрать нельзя — иначе 44
строки кашей. Мы делаем её понятнее, а не выкидываем.

### Две части страницы

```
┌─ Programming Health ──────── Period: [7d][30d✓][90d][1y][custom] ─┐
│                                                                    │
│  ЧАСТЬ 1 — ЦИФРЫ                                                   │
│  [Total sessions]  [Participants]  [Avg fill %]                   │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ 🟢 Open Play       ↗ +12%   fill 71%   348 sess   [▶]    │    │
│  │ 🔵 Court Bookings  ↘ −8%    fill 48%   262 sess   [▼]    │    │
│  │     • Doubles — Court #N    90 · 52% · →    (клик → 📊)   │    │
│  │     • Singles — Court #N   124 · 44% · ↘    (клик → 📊)   │    │
│  │ 🟣 Private Lessons ↗ +5%    fill 95%    65 sess   [▶]    │    │
│  │ 🟠 Leagues         ↘ −15%   fill 56%    48 sess   [▶]    │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                    │
│  ЧАСТЬ 2 — ЧТО ДЕЛАТЬ (инсайты, привязанные к программам выше)     │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ ⚠️ Open Play для новичков упал на 30% за 3 недели         │    │
│  │    → [Запустить intro-кампанию]                            │    │
│  │ ⚠️ Лиги теряют участников                                 │    │
│  │    → [Открыть набор в следующую лигу]                      │    │
│  └──────────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────────┘
```

**Сценарий оператора:** вижу цифры наверху («что-то падает») → спускаюсь к
инсайтам («вот что делать») → понимаю причину (цифры прямо над инсайтами).
Связка «вижу проблему → вижу решение → понимаю откуда» в одном экране.

---

## 4. Симметрия с Membership Health (паттерн Соломона)

Соломон уже сделал `Membership Health` (`MembershipHealthIQ.tsx` +
`/membership-health` route + `lib/ai/membership-economics.ts`). Он устроен
ровно как мы хотим Programming Health:

```
Membership Health:
  [Est. MRR] [MRR at risk] [Upsell potential]     ← цифры сверху
  Карточки по типам членства (VIP PASS, Open Play Pass):
    verdict (critical/at_risk/watch/healthy) + zombies + power users
    Treatments → кнопки → Campaigns с goal+tier+bucket prefilled  ← что делать
```

**Programming Health зеркалит этот стиль.** Разница только в данных:
- Membership Health = типы членства (подписки) → здоровье → что делать
- Programming Health = программы (families) → динамика → что делать

Обе: «единицы → оценка → что делать → кнопка кампании».

**Моя добавка к паттерну** — drill-down модалка с графиком динамики
(у Membership Health её нет, там только verdict).

### Где живёт что (финальная навигация)

| Раздел | Содержит | Статус |
|---|---|---|
| Programming Health | программы + динамика + действия | **rebuild (этот док)** |
| Membership Health | типы членства + здоровье + действия. VIP at risk здесь | done (Соломон) |
| Action Center | ПУСТОЙ placeholder, новые идеи позже. Из навигации НЕ убирать | reserved |

Разделение: программа болит → Programming Health; человек/членство болит →
Membership Health.

---

## 5. Drill-down модалка

Клик на «поинт» (family или конкретную программу) → модалка:

```
┌─ Open Play — dynamics ──────────── [7d][30d✓][90d][1y] ── ✕ ─┐
│  [Participants✓] [Fill%] [Sessions]    ← toggle метрики        │
│   line chart за выбранный период                               │
│   Summary: 348 sess · 1850 ppl · fill 71% · ↗+12% vs prev     │
└────────────────────────────────────────────────────────────────┘
```

- **Метрики (toggle):** Participants · Fill% · Sessions (revenue — нет)
- **Период:** глобальный на странице (7d/30d/90d/1y/custom), модалка наследует
- **Bucket гранулярность:** авто (дни для 7d, недели для 30-90d, месяцы для 1y)

Два жеста:
- `▶`/`▼` chevron — раскрыть/свернуть family inline (быстрый обзор)
- Клик на карточку/программу — модалка с графиком (глубокое изучение)

---

## 6. Что переиспользуем (≈60% уже есть)

| Кусок | Откуда |
|---|---|
| Двухчастный layout (цифры + treatments) | паттерн Соломона (MembershipHealthIQ) |
| Treatment → campaign кнопки | паттерн Соломона (goal+tier+bucket в URL) |
| Collapsible groups (chevron) | A1 (SignalFeed.tsx) |
| Classifier (title → family) | сегодняшний tier-classifier (репурпоуз) |
| Fill rate calc | есть в getWeeklyScorecard |
| `play_sessions (clubId, date)` index | Соломон добавил (perf fix) |

---

## 7. ⚠️ Два скрытых слоя (НЕ free repurpose)

Из critical review — это **не** учтено в наивном «переиспользуем classifier»:

### 7.1 Title normalization
`Singles — Court #2`, `Singles — Court #3` ... `Court #9` — это ОДНА программа
на разных кортах, а выглядит как 8. До группировки нужен слой нормализации:
срезать `Court #N`, `(IPC East)`, `Session N`, даты, лишние пробелы.
Иначе drill-down = свалка из дублей.

### 7.2 Family definition algorithm
Группировку 44 titles → 7 families я сделал **руками**, глядя на данные.
Автоматический алгоритм — отдельная задача. Варианты:
- **Hardcode regex families** (как tier regexes) — families fixed, не per-club.
- **Per-club derived** — генерировать families из реальных titles клуба
  (сложнее, но честнее к «реальным программам клуба»).
- **Operator-defined** — ручная настройка (как Tier Constructor custom rules).

Определение family — **та же проблема** что определение тиров. Не решена,
переименована. Это самый большой риск по объёму.

---

## 8. Фазы

```
Phase 1 — Programming Health rebuild (descriptive base + actions)
  1a. Title normalization layer (§7.1)
  1b. Family classifier (§7.2) — решить hardcode vs per-club vs operator
  1c. Backend: families list + period dynamics + fill rate
  1d. UI: family list, inline expand (chevron), trend arrows ↗↘
  1e. Global period selector (7d/30d/90d/1y/custom)
  1f. Drill-down модалка с line-chart (3 metrics toggle)
  1g. Часть 2 — treatments под цифрами (зеркало Соломона)
  1h. Hide tier UI (7 секций, execution check, Tier Constructor)

Phase 2 — (опционально) program-level signals
  • Новый тип инсайта «family declining N% за M недель»
  • Заменяет tier-based scorecard_execution signals
```

---

## 9. Риски и как решены

| Риск | Статус |
|---|---|
| **Vanity metrics** (графики без действий) | ✅ решён — Часть 2 (treatments) под цифрами, паттерн Соломона |
| Натянутая симметрия Prog/Membership | ✅ решён — обе используют один паттерн (units→verdict→treatment) |
| История короткая (CR sync молодой) | ⚠️ trend arrows показывать только при ≥6-8 недель данных, иначе "insufficient history" |
| Fill rate бессмыслен для court bookings | ⚠️ применять только к организованным программам, не к pickup/rental |
| Family classifier сложность | ⚠️ §7.2 — главный объём, решить подход до кода |

---

## 10. Открытые вопросы (решить до Phase 1)

1. **Family definition** (§7.2): hardcode regex / per-club derived / operator-defined?
2. **Court Bookings**: отдельная family / влить в Open Play / facility-блок?
   (drill-down покажет детали — оператор сам увидит, но как группировать?)
3. **Ball Machine**: facility-блок отдельно от programming, или просто скрыть?
4. **Тиры в коде**: dormant (feature flag) или удалить? Рекомендация — dormant,
   репурпоуз под families (classifier тот же).
5. **Часть 2 инсайты**: откуда брать? Tier-based scorecard signals исчезают.
   Нужен новый «family dynamics» engine (Phase 2) или MVP без Части 2?

---

## 11. Acceptance criteria (Phase 1)

- [ ] Programming Health показывает ~7 families IPC East (не T1-T7)
- [ ] Каждая family: sessions, participants, fill%, trend arrow
- [ ] Chevron раскрывает family → программы внутри (нормализованные titles)
- [ ] Клик на программу → модалка с line-chart, 3 metric toggle, period
- [ ] Global period selector работает (7d/30d/90d/1y/custom)
- [ ] Trend arrows скрыты/«insufficient data» при короткой истории
- [ ] Старый tier UI (7 секций) убран
- [ ] Стиль consistent с Membership Health Соломона

---

## 12. Что НЕ делаем (scope boundaries)

- НЕ трогаем Membership Health (готов, Соломон)
- НЕ убираем Action Center из навигации (оставляем пустым placeholder)
- НЕ удаляем classifier код (репурпоуз, не выброс)
- НЕ строим Часть 2 инсайты в Phase 1, если решим MVP без них
- Revenue метрика на графике — НЕ в этой итерации
