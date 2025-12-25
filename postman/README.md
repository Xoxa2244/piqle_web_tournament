# Postman Collection для тестирования Piqle Partner API

## Быстрый старт

1. **Импортируйте коллекцию в Postman:**
   - Откройте Postman
   - File → Import
   - Выберите файл `Piqle_Partner_API_Test_Collection.json`

2. **Обновите переменные:**
   - Откройте коллекцию → Variables
   - Обновите `key_id` и `secret` на ваши реальные credentials
   - При необходимости измените `base_url`

3. **Запустите все запросы последовательно:**
   - Запросы пронумерованы от 1 до 9
   - Выполняйте их по порядку
   - Или используйте "Run Collection" для автоматического выполнения

## Порядок выполнения

1. **Create Tournament** - создаёт турнир
2. **Create Divisions** - создаёт дивизионы
3. **Create Players** - создаёт игроков
4. **Create Teams** - создаёт команды
5. **Create Match Day** - создаёт день матчей
6. **Create Matchups** - создаёт матчапы
7. **Create Rosters** - создаёт ростеры
8. **Get Day Status** - проверяет статус дня
9. **Get Day Results** - получает результаты дня

## Переменные коллекции

- `base_url` - базовый URL API (по умолчанию: https://rtest.piqle.io)
- `key_id` - ваш API Key ID
- `secret` - ваш API Secret
- `external_tournament_id` - ID турнира для тестирования
- `external_division_id` - ID дивизиона
- `external_team_id_1`, `external_team_id_2` - ID команд
- `external_player_id_1`, `external_player_id_2` - ID игроков
- `external_day_id` - ID дня матчей
- `external_matchup_id` - ID матчапа

## Примечания

- Все запросы автоматически добавляют заголовки `Authorization` и `Idempotency-Key`
- Каждый запрос использует уникальный `Idempotency-Key` (UUID)
- Можно запускать коллекцию несколько раз - запросы идемпотентны
- Для повторного тестирования измените `external_tournament_id` на новое значение

