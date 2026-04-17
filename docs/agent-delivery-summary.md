# IQSport Agent Delivery Summary

Короткий файл для команды: что уже построено в agent layer, как это работает сейчас и что пока остается intentionally safe/manual.

## 1. Что уже есть

### Advisor как draft-first слой

- Agent умеет собирать first-class outreach drafts, а не только отвечать текстом в чате.
- Есть `requested plan` и `agent recommendation`.
- Draft можно:
  - refine
  - save
  - sandbox run
  - schedule
  - approve

### Persistent agent drafts

- Появился `AgentDraft` как отдельная сущность.
- Драфты переживают reload.
- Есть workspace в `AI Advisor`.

### Sandbox-first delivery

- Sendable flows по умолчанию можно гонять безопасно через sandbox.
- Есть `Preview Inbox`.
- Есть sandbox routing:
  - `preview_only`
  - `test_recipients`

### Contact / autonomy / reminder policy

- Agent умеет менять:
  - contact policy
  - autonomy policy
  - sandbox routing
  - admin reminder routing

### Agent cockpit

- В `AI Agent` уже есть:
  - autopilot summary
  - blockers
  - proactive opportunities
  - membership lifecycle block
  - policy simulator
  - daily admin to-do
  - programming cockpit
  - ops draft calendar
  - internal session draft queue

### Programming agent

- Agent анализирует schedule/data и предлагает programming drafts.
- Есть:
  - primary slot
  - alternatives
  - projected fill
  - likely demand
  - confidence
  - refine controls
- После approve создаются internal `ops session drafts`, а не live sessions.

### Schedule bridge

- `Schedule` остается source of truth.
- Agent добавлен как мягкий layer поверх расписания:
  - underfilled pressure
  - programming ideas
  - ops/internal session drafts
- Из `Schedule` можно перейти в точный контекст `AI Agent`/`Advisor`.

## 2. Admin reminder system

### Что уже работает

- `Accept / Decline / Not now` для daily admin tasks.
- Решения хранятся server-side.
- `Not now` умеет:
  - спросить, когда напомнить
  - спросить, как напомнить

### Каналы reminder

На уровне конкретной задачи доступны:

- `in-app`
- `email`
- `sms`
- `both`

Если email/phone не настроены, UI не дает выбрать недоступный внешний канал и ведет:

- в `/profile`
- или в `Advisor`, чтобы агент сам сохранил контакты

### Контакты админа

У пользователя в профиле есть отдельные поля:

- `adminReminderChannel`
- `adminReminderEmail`
- `adminReminderPhone`

Они не завязаны жестко на обычные user contacts.

### Реальные напоминания

Сейчас reminders работают в двух слоях:

1. `In-app`
   - задача возвращается в daily board
   - появляется notification в bell/inbox
2. `External`
   - email
   - SMS

Cron для external reminders:

- смотрит на due `not_now`
- берет `metadata.reminderChannel` как per-task override
- если override нет, использует user-level default
- шлет один раз на конкретный `remindAt`

## 3. Что intentionally еще не live

### Outreach autopilot

- Membership lifecycle flows пока safety-locked.
- Даже если policy говорит `auto-ready`, это не означает безусловный live-send.

### Programming publish

- Programming flow не публикует live sessions.
- Он создает только:
  - programming drafts
  - ops session drafts
  - internal session drafts

### Почему это важно

Мы держим `draft-first / sandbox-first / review-first` путь, чтобы:

- не слать случайно живым пользователям
- не ломать реальное расписание
- постепенно наращивать доверие к агенту

## 4. Что уже особенно сильное

### UX

- Agent не только исполняет, но и рекомендует лучший план.
- Есть inline controls, decision cards, accept/decline/not now.
- Есть deep-links между `Schedule`, `Agent`, `Advisor`.

### Safety

- Sandbox routing
- reminder routing
- policy layer
- membership-aware autonomy
- explicit manual ops stage для programming

### Memory

- Persistent drafts
- outcomes
- daily admin decisions
- reminder scheduling

## 5. Ближайшие логичные шаги

### Near-term

1. day-specific ops brief
2. richer reminder presets
3. more proactive admin pings
4. stronger programming impact/conflict checks

### Later

1. controlled live rollout for selected agent actions
2. controlled publish for session creation
3. billing/usage model for AI agent

## 6. Продуктовая модель в одной фразе

`Schedule` = truth layer  
`Advisor` = planning + drafts  
`Agent` = operational cockpit + follow-through  
`Sandbox / Ops Drafts` = safe execution bridge before anything becomes live
