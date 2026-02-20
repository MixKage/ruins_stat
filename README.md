# Ruins Stats Dashboard

Панель статистики для игры про спуск в руины. Генерирует `public/data/stats.json` из PostgreSQL‑базы и показывает метрики, графики и детальные карточки игроков.

## Структура
- `scripts/build_stats.py` — сбор статистики из БД
- `scripts/server.py` — локальный сервер, который пересобирает `stats.json` при запросе
- `public/` — статические страницы (`index.html`, `player.html`) и данные
- `Dockerfile`, `docker-compose.yml` — запуск в контейнере

## Локальный запуск
1) Укажите подключение к базе:
```
export DATABASE_URL="postgresql://ruins_app:***@host:port/ruins"
```

2) Установите зависимости:
```
pip install psycopg2-binary
```

3) Соберите статистику:
```
python3 scripts/build_stats.py
```

4) Запустите сервер:
```
python3 scripts/server.py
```

Откройте `http://localhost:8000`.

## Docker (рекомендуется)
1) Убедитесь, что `.env` содержит `DATABASE_URL`:
```
DATABASE_URL=postgresql://ruins_app:***@host:port/ruins
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
- `feedback.html` — отдельная страница отзывов с фильтрацией и сортировкой по типам

## Переменные окружения
- `DATABASE_URL` — строка подключения PostgreSQL
- `GAME_DATA_DIR` — путь к папке данных игры (по умолчанию `./data`)
