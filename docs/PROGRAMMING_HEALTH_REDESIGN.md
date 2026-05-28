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
Автоматический алгоритм — отдельная задача.

**РЕШЕНО (2026-05-28): hardcode regex baseline + operator override.**
- Дефолтные families через regex — `programming-tier-classifier` переименовать
  (tier keys → family keys), работает из коробки для большинства клубов.
- Operator override — `tier-classifier-extended` custom rules → family overrides
  (инфраструктура `tier_config.customRules` уже есть).
- Suggestion engine `getFrequentUntaggedTitles` → «непогруппированные программы,
  добавь правило» (уже есть).

То есть почти весь код готов — переименование tier→family + новый dynamics слой,
не переписывание. Остаётся **title normalization (§7.1)** как реальный новый код.

---

## 8. Фазы

```
Phase 1 — Programming Health rebuild (numbers + full insights engine)
  1a. Title normalization layer (§7.1)
  1b. Family classifier (§7.2): hardcode regex + operator override
      → переименовать programming-tier-classifier exports (tier→family)
      → tier-classifier-extended custom rules → family overrides
  1c. Backend: families list + period dynamics + fill rate
  1d. UI: family list, inline expand (chevron), trend arrows ↗↘
  1e. Global period selector (7d/30d/90d/1y/custom)
  1f. Drill-down модалка с line-chart (3 metrics toggle)
  1g. ЧАСТЬ 2 — полный family-dynamics insights engine (см. §8b)
  1h. Hide tier UI (7 секций, execution check, Tier Constructor)
```

### 8b. Family-dynamics insights engine (Часть 2, полный)

Решено делать **полный** engine сразу, не minimal. Анализирует каждую
family и генерит treatment-инсайты:

| Детектор | Триггер | Treatment |
|---|---|---|
| **Declining family** | participants −N% за M недель подряд | → кампания этой аудитории |
| **Low fill** | fill rate < порога для organized программ | → slot-filler кампания |
| **Funnel leak** | вход (Beginner/Intro) падает, верх растёт | → intro-кампания / реклама новичкам |
| **League gap** | лига без upcoming session 14-60d (УЖЕ есть) | → open enrollment |
| **Dead family** | была активна, 0 sessions N недель | → перезапуск / снять с витрины |

- Reuse `bulkCreateCohortFromSignals` (написан сегодня) для treatment→cohort→campaign.
- Каждый инсайт привязан к family-карточке сверху (клик скроллит к ней).
- Fill-rate детектор — только organized families (не Pickup/Equipment, §9).
- History gating: declining/funnel детекторы молчат при < 6-8 недель данных.

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

## 10. Решения (зафиксировано 2026-05-28)

| # | Вопрос | Решение |
|---|---|---|
| 1 | Family definition | **Hardcode regex + operator override.** Reuse classifier + custom rules + suggestion engine (всё написано сегодня). См. §7.2 |
| 2 | Court Bookings | **Отдельная family «Pickup / Court Bookings»**, помечена self-serve. Не вливать в Open Play, не facility |
| 3 | Ball Machine | **MVP — скрыть** (`isEquipmentBooking` уже есть). Facility-блок отдельной задачей позже |
| 4 | Тиры в коде | **Dormant + репурпоуз**, не удалять. Убрать только UI (7 секций, Tier Constructor, execution check) |
| 5 | Часть 2 инсайты | **Полный family-dynamics engine сразу** в Phase 1. См. §8b (5 детекторов) |

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
