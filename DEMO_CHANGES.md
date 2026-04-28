# Что сделано для демо

## Members

- Переделан экран `Members` под IQ-стиль из ветки `deviq`.
- Убраны лишние демо-блоки:
  - `Guest / Trial Booking`
  - `Smart First Session`
  - `Win-Back бывших`
  - `Referral Engine`
- Убраны связанные карточки в `Agent Actions`, которые вели в эти секции.

## Cohorts / Segments

- Починены demo-карточки `Segments`: теперь по клику не открывается пустой экран.
- Добавлены моковые участники внутри каждого demo-сегмента.
- Добавлен demo fallback для campaign/detail-состояния сегментов.
- Исправлена `Campaign` modal у сегментов: теперь она с плотным фоном, без прозрачности.

## Campaigns

- Убраны большие демо-секции со страницы `Campaigns`:
  - `Agent quick starts`
  - `Guest / Trial Booking`
  - `Smart First Session Campaigns`
  - `Win-Back Campaigns`
  - `Referral Campaigns`

## Integrations

- Добавлены предзагруженные моковые файлы для:
  - `CourtReserve`
  - `PodPlay`
- По нажатию `Import` для этих demo-файлов теперь показывается успешный импорт с результатами и статистикой.
- При этом ручная замена файлов и обычный импорт остались доступны.

## Sidebar

- Исправлено поведение `Collapse` в IQ sidebar.
- Теперь sidebar нормально сворачивается до состояния только с иконками.
- Убрано автоматическое раскрытие по наведению.
