# QA Checklist: IQSport Agent

Этот файл нужен для ручной QA-проверки текущего agent-first слоя в клубном intelligence интерфейсе.

## Что должно быть готово заранее

1. Применены agent migrations:
   - `agent_drafts`
   - `ops_session_drafts`
   - `agent_admin_todo_decisions`
   - `users.admin_reminder_*`
2. На окружении есть рабочие env:
   - `CRON_SECRET`
   - email env для transactional email
   - Twilio env для SMS
3. У тестового админа есть доступ к:
   - `/clubs/:id/intelligence/advisor`
   - `/clubs/:id/intelligence/agent`
   - `/clubs/:id/intelligence/sessions`
   - `/profile`
4. Для клуба желательно иметь:
   - расписание из API
   - несколько pending/blocked agent actions
   - хотя бы один programming draft или возможность быстро его создать через Advisor

## 1. Advisor Draft Workspace

### Что проверить

1. Открыть `AI Advisor`.
2. Убедиться, что слева есть `Agent Drafts`.
3. Создать через чат один outreach draft:
   - пример: `create a reactivation draft for inactive members`
4. Создать через чат один programming draft:
   - пример: `what session should we add on Thursday evening?`

### Ожидаемый результат

- Outreach draft появляется в обычном workspace.
- Programming draft появляется в отдельном programming блоке.
- Драфт переживает reload страницы.
- Если у драфта есть recommendation, карточка показывает `Your Request` и `Agent Recommendation`.

## 2. Sandbox Preview Flow

### Что проверить

1. Открыть sendable draft в Advisor.
2. Нажать `Run Sandbox` или `Schedule Sandbox`.
3. Проверить левый rail в Advisor.
4. Проверить `AgentIQ`.

### Ожидаемый результат

- Драфт не уходит живым пользователям.
- Появляется `Preview Inbox`.
- Видно:
  - тип драфта
  - eligible recipients
  - skipped recipients
  - routing summary
- Из `Preview Inbox` можно вернуться в нужный draft/conversation.

## 3. Sandbox Routing Policy

### Что проверить

1. В Advisor написать:
   - `set sandbox routing to preview only`
2. Approve policy card.
3. Потом написать:
   - `route sandbox reminders to test recipients`
   - указать email/SMS whitelist если агент их попросит
4. Снова approve.

### Ожидаемый результат

- Появляется отдельная `Sandbox Routing Draft` card.
- После approve настройки сохраняются.
- Новый sandbox preview использует новый routing summary.
- `Preview Inbox` и `AgentIQ` показывают актуальный routing mode.

## 4. Daily Admin To-Do

### Что проверить

1. Открыть `AI Agent`.
2. Найти `Daily Admin To-Do`.
3. Проверить бакеты:
   - `Today`
   - `Tomorrow`
   - `Waiting On You`
   - `Blocked`
   - `Recommended Next`
4. Для одной карточки нажать `Accept`.
5. Для другой карточки нажать `Decline`.
6. Для третьей карточки нажать `Not now`.

### Ожидаемый результат

- `Accept` открывает правильный flow.
- `Decline` убирает задачу из активного списка.
- `Handled today` показывает counters по `accepted / declined / not now`.
- Решения переживают reload.
- `Reset today` очищает решения за текущий день.

## 5. Not Now Reminder Channel Picker

### Что проверить

1. В `Daily Admin To-Do` нажать `Not now`.
2. Убедиться, что сначала можно выбрать канал:
   - `In app`
   - `Email`
   - `SMS`
   - `Both`
3. Потом выбрать время:
   - `1h`
   - `3h`
   - `After lunch`
   - `Before 6 PM`
   - `6 PM`
   - `Tomorrow`
4. Повторить сценарий для:
   - админа без reminder email/phone
   - админа только с reminder email
   - админа с email + phone

### Ожидаемый результат

- Без контактов внешние каналы серые и недоступные.
- Есть CTA:
  - `Open profile`
  - `ask Advisor`
- При сохранении `Handled today` показывает, через какой канал задача вернется.
- После reload сохраненный snooze не теряется.

## 6. Admin Reminder Contacts

### Что проверить

1. Открыть `/profile`.
2. Найти блок `Agent Reminder Contacts`.
3. Заполнить:
   - `Reminder delivery`
   - `Reminder email`
   - `Reminder phone`
4. Сохранить.
5. Обновить `AI Agent`.

### Ожидаемый результат

- Новые контакты сохраняются.
- В `Not now` UI внешние каналы становятся доступными согласно профилю.
- Если выбран `email`, но телефона нет:
  - `SMS` и `Both` остаются недоступны.

## 7. Advisor-Based Reminder Setup

### Что проверить

1. В Advisor написать:
   - `remind me by email when I snooze admin tasks`
2. Если email отсутствует, дать его в следующем сообщении.
3. Повторить для SMS.

### Ожидаемый результат

- Агент собирает `Admin Reminder Routing` card.
- Если контакта не хватает, агент спрашивает его.
- После approve профиль пользователя обновляется.
- Возврат в `/profile` показывает сохраненные значения.

## 8. In-App Reminder Delivery

### Что проверить

1. В `Daily Admin To-Do` выбрать `Not now`.
2. Выбрать `In app` и короткий срок, например `1h`.
3. Дождаться наступления `remindAt` или временно сместить время в БД для теста.
4. Проверить:
   - `Daily Admin To-Do`
   - bell/inbox в intelligence layout

### Ожидаемый результат

- Задача снова появляется в актуальном board.
- Появляется inbox notification типа admin reminder.
- Не должно быть дублей на каждый refresh.

## 9. External Reminder Delivery

### Что проверить

1. У админа должны быть заполнены `admin reminder contacts`.
2. В `Daily Admin To-Do` выбрать `Not now`.
3. Выбрать канал:
   - `Email`
   - потом отдельно `SMS`
   - потом `Both`
4. Выбрать близкий remind time.
5. После наступления времени дернуть cron:
   - `GET /api/agent/admin-reminders`
   - c `Authorization: Bearer CRON_SECRET`
6. Повторить cron второй раз.

### Ожидаемый результат

- Для `Email` уходит только email.
- Для `SMS` уходит только SMS.
- Для `Both` уходят оба канала.
- Второй прогон не должен отправлять duplicate reminder на тот же `remindAt`.
- Если выбран per-task override, он приоритетнее user-level default.

## 10. Programming Agent

### Что проверить

1. В Advisor написать:
   - `what session should we add on Thursday evening?`
2. Проверить `Programming Plan`.
3. Использовать refine controls:
   - `Make beginner`
   - `Switch to clinic`
   - `Show another option`
4. Нажать `Create Ops Drafts`.

### Ожидаемый результат

- Появляется programming draft с:
  - primary proposal
  - alternatives
  - confidence
  - projected fill
- После `Create Ops Drafts` появляются internal ops session drafts.
- Ничего не публикуется live в расписание.

## 11. Ops Draft Calendar / Internal Session Draft Queue

### Что проверить

1. Открыть `AI Agent`.
2. Найти:
   - `Programming Cockpit`
   - `Ops Draft Calendar`
   - `Internal Session Draft Queue`
3. Для одного ops session draft нажать `Convert to Session Draft`.

### Ожидаемый результат

- Ops-draft двигается в стадию `session_draft`.
- Это внутреннее состояние, не live publish.
- Карточка показывает readiness/ops status.

## 12. Schedule <> Agent Bridge

### Что проверить

1. Открыть `Schedule`.
2. Проверить `Agent Schedule Layer`:
   - underfilled pressure
   - programming ideas
   - internal session drafts
3. Кликнуть на programming idea.
4. Кликнуть на internal session draft.

### Ожидаемый результат

- Переход ведет в правильный раздел `AgentIQ`.
- Нужный draft/queue item подсвечивается и скроллится в viewport.
- Live schedule остается source of truth.

## 13. Negative / Safety Cases

### Что проверить

1. У programming flow не должно быть live publish без отдельного ops шага.
2. Membership lifecycle autopilot не должен отправлять live outreach без explicit unlock.
3. Sandbox send не должен уходить живым пользователям.
4. Если у reminder канала нет контакта, задача не должна silently уходить во внешний канал.

### Ожидаемый результат

- Система остается draft-first / sandbox-first.
- Любое внешнее действие либо заблокировано, либо идет через явную policy/routing настройку.

## Smoke Regression

После всех сценариев пройти коротко:

1. `Dashboard`
2. `AI Advisor`
3. `AI Agent`
4. `Schedule`
5. `Profile`
6. `Integrations`

Ожидание:

- страницы открываются без client crash
- drafts и decisions переживают reload
- в `AgentIQ` нет сломанных deep-links
- inbox bell продолжает работать
