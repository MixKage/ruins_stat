# Ruins Stats Dashboard

Панель статистики для игры про спуск в руины. Генерирует `public/data/stats.json` из SQLite‑базы и показывает метрики, графики и детальные карточки игроков.

## Структура
- `scripts/build_stats.py` — сбор статистики из БД
- `scripts/server.py` — локальный сервер, который пересобирает `stats.json` при запросе
- `public/` — статические страницы (`index.html`, `player.html`) и данные
- `Dockerfile`, `docker-compose.yml` — запуск в контейнере

## Локальный запуск
1) Укажите путь к базе и данным игры:
```
export DB_PATH=/Users/mixkage/files/ruins_secret_of_death/ruins.db
export GAME_DATA_DIR=/Users/mixkage/files/ruins_secret_of_death/data
```

2) Соберите статистику:
```
python3 scripts/build_stats.py
```

3) Запустите сервер:
```
python3 scripts/server.py
```

Откройте `http://localhost:8000`.

## Docker (рекомендуется)
1) Убедитесь, что `.env` содержит пути к базе и данным:
```
HOST_DB_PATH=/Users/mixkage/files/ruins_secret_of_death/ruins.db
HOST_GAME_DATA_DIR=/Users/mixkage/files/ruins_secret_of_death/data
```

2) Запуск:
```
docker compose up --build
```

Откройте `http://localhost:8000`.

## Обновление данных
При запросе `public/data/stats.json` сервер автоматически пересобирает статистику.

## Страницы
- `index.html` — общий дашборд
- `player.html?id=<id>` — карточка игрока

## Переменные окружения
- `DB_PATH` — путь к SQLite базе
- `GAME_DATA_DIR` — путь к папке данных игры (нужен для русских имён)

