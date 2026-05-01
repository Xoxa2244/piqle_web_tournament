# Передача контекста: Engage / Кампании

> Документ для человека. Без жаргона.
> Вся техника — в `docs/ENGAGE_PRIORITY1_SPEC.md` (для агента/Клода).
> Полный лог последней рабочей сессии — `docs/iqsport-session-summary-2026-04-30.md`.

---

## 1. Что мы делаем

Раздел **Engage** — инструмент для админа клуба, чтобы общаться с игроками: рассылать письма, втягивать обратно тех, кто перестал ходить, заполнять пустые слоты в расписании.

Состоит из четырёх страниц:
- **Members** — список всех игроков
- **Segments** (раньше Cohorts) — группы игроков по правилам
- **Campaigns** — рассылки писем по этим группам
- **Settings → Automation** — настройки автопилота: режим работы (Live / Shadow / Disabled), kill switch, правила запуска

Идея: **админ выбирает группу → выбирает цель → пишет письмо → отправляет**. ИИ помогает на каждом шагу — предлагает группы, генерирует тексты, подсказывает кому что отправить.

## 2. Что сделано до Priority 1

- Большой ремонт Engage (Phases 0–5 по `ENGAGE_REDESIGN_SPEC.md`) — закрыт. Members, Segments, Campaigns переработаны, Settings → Automation добавлен, страница Reactivation удалена.
- Critical bug на Sol2 проде: AI Insights показывали "All good!" для всех клубов с момента запуска (тихая ошибка `::uuid` cast против `text` колонок). Починено в коммитах `6ec06847` + `6a3c488e`. Теперь на IPC North (prod) AI находит **551 VIP at risk = $28,284/мес at risk**, 24 готовых конвертнуть guest passes, 229 новичков нуждаются в follow-up.
- Demo окружение `demo.iqsport.ai` пересобрано: 1500 mock members, 8 mock segments, AI-Attributed Revenue tile скрыт, новый DemoAdvisorIQ с 12 canned Q→A сценариями (без LLM).

## 3. Priority 1 — закрыт ✅

Цель: **мастер кампании реально шлёт письма** (раньше Launch был заглушкой).

| Шаг | Что делает | Коммит |
|-----|------------|--------|
| 1.1 | Кнопка Launch создаёт Campaign в БД с замороженным списком получателей | `7f57d3c4` |
| 1.2 | Фоновая задача (cron) каждую минуту берёт running кампании и шлёт письма через Mandrill, батчами по 50 | `34a6959f` |
| 1.3 | Webhook от Mandrill теперь обновляет per-Campaign счётчики (delivered / opened / clicked / failed) | `73197ee2` |
| 1.4 | Cron уважает Live Mode и killSwitch — если выключен, не шлёт. Проверено живым тоггл-тестом | (вошло в 1.2) |
| 1.5 | Таблица Active Campaigns обновляется каждые 30 секунд — счётчики идут в реальном времени | `f3ad821e` |
| 1.6 | Кнопка Test send — отправляет пробное письмо себе с префиксом `[TEST]`, не создаёт строки в БД | `2d39d67f` |

### Проверено вживую

Реально ушло **6 писем через Mandrill** на `ds@piqle.io` и `sol@piqle.io`. Получатели подтвердили доставку. Все 3 сценария Live Mode (shadow / live / killSwitch) проверены тоггл-тестом — cron шлёт только когда mode=live и killSwitch=false.

### Известные ограничения (задокументированы, не блокеры)

1. **Stuck-claim recovery не реализован.** Если cron упадёт между «отметил sent_at=NOW()» и «получил ID от Mandrill» — строка зависнет как "sent" без подтверждения. Если такое начнёт случаться — добавим sweeper (5-минутный таймаут).
2. **Multi-channel пока только primary.** Если в кампании выбрано email+SMS — берётся email. Полная поддержка дойдёт когда подключится SMS sender.
3. **Подстановки в письме — только `{{name}}`.** Никаких вариантов / per-row персонализации.
4. **Все письма идут с CTA "Book a Session" → ссылка на страницу клуба.** Это хардкод в шаблоне `sendOutreachEmail`. Для retention/win-back звучит ок, для upgrade или event flows читается странно. Лечится в P2 (см. §5).

## 4. Что НЕ закрыто на проде

**Priority 1 живёт пока только на preview** (`piqle-web-tournament-git-rgdev-rodion-gorins-projects.vercel.app`). Не на `app.iqsport.ai`.

Чтобы вышло на прод:
1. **Прогнать миграцию** `migrations/add-campaign-send-fanout.sql` против iqsport-prod Supabase (`mwdftgazlvpfyvqicovh`). Без этого новый код упадёт на отсутствующих колонках.
2. **Смержить `rgdev` → `main`.** Vercel автоматически зарегистрирует cron-расписание `* * * * *` для `/api/cron/campaign-sends` на проде.
3. **Установить `CRON_SECRET`** на прод-окружении в Vercel (если ещё нет).
4. **Включить Live Mode** в Settings → Automation для пилотного клуба, на котором будем тестить прод.

Перед merge в main стоит ещё раз протестить P1.1 → P1.6 в preview, чтобы убедиться что после P1.6 ничего не отвалилось.

## 5. Что планируется дальше

### Immediate (мелочи с большим UX impact)
1. **Custom CTA в письмах** — расширить Campaign модель полями `cta_label` + `cta_url`, добавить поля в Wizard Step 4. Уберёт нелепость с «Book a Session» в письмах про upgrade.
2. **AI Insights role-tagging** — не Engage, но рядом. По итогам persona research (Marketer / Ops / Owner) у каждого insight нужно тэг роли + фильтр UI. Сейчас owner видит «underutilized courts» (это не его проблема), а маркетёр — «VIP at risk» которое он не может решить без ops.

### Engage Priority 2
- **Campaign History страница с реальными данными + drilldown карточкой**. Сейчас раздел History — статичный плейсхолдер. P2 заполнит его из таблицы `Campaign WHERE status='completed'` с раскрывающейся карточкой по клику: метрики, список attributed members, sample message.

### Engage Priority 3+
- **Sequence engine** (админ строит цепочку из 3-5 писем «Welcome / День 3 / День 7»). Это **не то же самое**, что автоматические цепочки в `lib/ai/sequence-runner.ts` — там автопилот сам шлёт письма игрокам с падающим health score. Не путать.
- **Recurring campaigns** ("каждый понедельник в 9 утра"). Парсер cron-выражений + отдельный runner.
- **Dead-state cleanup** в `CampaignsIQ.tsx` (хвосты от удаления legacy блока).
- **Send Volume chart** обрезается в Insights drawer — починить размер.

### Бэклог 15 новых AI Insights (из persona research)

Топ-3 «если бы можно было ОДИН insight завтра»:
- Marketer: **Churn Risk Score для всех членов** (не только VIP) + dollar impact
- Ops: **No-show forecast на сегодня** к 7 утра
- Owner: **Cohort retention curve** с anomaly alerts

Полный список — в `docs/iqsport-session-summary-2026-04-30.md` §«Top 15».

## 6. Что контролировать и тестировать

### При следующей работе с P1 в preview
- Запустить кампанию на 1-2 тестовых получателей → письмо должно прийти в течение минуты
- Открыть письмо → через пару минут счётчик Opens в Active Campaigns увеличится (refetchInterval=30s)
- Проверить что `[TEST]` send не создаёт Campaign row в БД

### Перед merge в main
- Прогнать миграцию на проде (НЕ через `prisma db push`! Только SQL — см. CLAUDE.md)
- Проверить переменные окружения (`CRON_SECRET`, Mandrill keys)
- Включить Live Mode на пилотном клубе → запустить пробную кампанию на 1 получателя (себя) → письмо должно прийти

### Что мониторить
- **Vercel deploy** — автоматический на каждый push в `rgdev`. Логи в дашборде Vercel.
- **Rate limits Mandrill** — если кампания на 500+ получателей, могут пойти ошибки. План закладывает батчи по 50 за тик.
- **Заблокированные домены** — `lib/email.ts:34` не шлёт на `placeholder.iqsport.ai`, `demo.iqsport.ai`, `test.iqsport.ai`, `example.com`. В тестовых данных могут быть такие адреса — счётчик `failed_count` будет расти, это нормально.

## 7. Как работаем

- **Ветка только `rgdev`**, не пушить напрямую в `deviq`/`Sol2`/`main`.
- Договорились: **по одному шагу за раз**. Сделали → запушили → юзер протестил → если ОК, идём к следующему. Не накатывать 2-3 шага подряд без проверки.
- **Никогда не запускать `prisma db push`** — схема БД и Prisma расходятся по типам (UUID vs text). Все миграции SQL-файлами в `migrations/`.
- **Co-author** в коммитах: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`

## 8. Где что лежит

| Что | Где |
|-----|-----|
| Полная техническая спека Priority 1 | `docs/ENGAGE_PRIORITY1_SPEC.md` |
| Лог последней рабочей сессии (4 дня, все 4 направления) | `docs/iqsport-session-summary-2026-04-30.md` |
| Спека большого ремонта (Phases 0–5) | `docs/ENGAGE_REDESIGN_SPEC.md` |
| Высокоуровневое why/what | `docs/ENGAGE_REDESIGN_PLAN.md` |
| Конвенции репо (типы в БД, ветки, бренд) | `CLAUDE.md` |
| Мастер кампании | `app/clubs/[id]/intelligence/_components/CampaignWizard/` |
| Страница Campaigns | `app/clubs/[id]/intelligence/_components/iq-pages/CampaignsIQ.tsx` |
| Backend кампаний | `server/routers/intelligence.ts` (поиск по `launchCampaign`, `testSendCampaign`, `listActiveCampaigns`) |
| Cron отправки | `app/api/cron/campaign-sends/route.ts` |
| Webhook Mandrill | `app/api/webhooks/mandrill/route.ts` |
| Шаблон письма | `lib/email.ts` + `sendOutreachEmail` |

## 9. Как продолжить с Клодом

В новом чате достаточно сказать:

> Engage Priority 1 закрыт, на проде ещё нет. Открой `docs/ENGAGE_PRIORITY1_SPEC.md` §6 — там список immediate next. Что предлагаешь брать первым?

Клод подгрузит CLAUDE.md, спеку, memory и контекст. Дальше работаем по шагам.

---

**Кратко:** P1 закрыт, в preview работает (письма реально уходят), но на прод ещё не накатано. Следующая работа — либо merge на прод (тех. процедура), либо новый scope: custom CTA / AI Insights role-tagging / Campaign History (P2).
