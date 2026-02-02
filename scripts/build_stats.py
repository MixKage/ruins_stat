#!/usr/bin/env python3
import json
import os
import psycopg2
import psycopg2.extras
from collections import Counter, defaultdict
from datetime import datetime, timedelta, date, timezone


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_GAME_DATA_DIR = os.path.join(BASE_DIR, "data")
OUT_DIR = os.path.join(BASE_DIR, "public", "data")
OUT_PATH = os.path.join(OUT_DIR, "stats.json")


def parse_json(text, default):
    if not text:
        return default
    if isinstance(text, (dict, list)):
        return text
    try:
        return json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return default


def load_json_file(path):
    if not path or not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def query_all(cur, sql, params=None):
    cur.execute(sql, params or ())
    return cur.fetchall()


def parse_dt(value):
    if not value:
        return None
    if isinstance(value, datetime):
        if value.tzinfo:
            return value.astimezone(timezone.utc).replace(tzinfo=None)
        return value
    try:
        parsed = datetime.fromisoformat(value)
        if parsed.tzinfo:
            return parsed.astimezone(timezone.utc).replace(tzinfo=None)
        return parsed
    except ValueError:
        return None


def safe_round(value, digits=2):
    try:
        return round(value, digits)
    except TypeError:
        return 0


def add_counter_from_json(counter, payload):
    for key, value in payload.items():
        try:
            counter[str(key)] += int(value)
        except (TypeError, ValueError):
            continue


def remap_counter(counter, name_map):
    remapped = Counter()
    for key, value in counter.items():
        remapped[name_map.get(str(key), str(key))] += value
    return remapped


def remap_dict_keys(payload, name_map):
    remapped = {}
    for key, value in payload.items():
        remapped[name_map.get(str(key), str(key))] = value
    return remapped


def json_default(value):
    if isinstance(value, datetime):
        return value.isoformat(timespec="minutes")
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


def extract_hero_id(state):
    if not isinstance(state, dict):
        return None
    for key in ("character_id", "hero_id", "hero", "class_id"):
        value = state.get(key)
        if value:
            return value
    player = state.get("player")
    if isinstance(player, dict):
        for key in ("character_id", "hero_id", "hero", "class_id"):
            value = player.get(key)
            if value:
                return value
    return None


def is_in_season(dt_value, start, end):
    if not dt_value:
        return False
    if start and dt_value < start:
        return False
    if end and dt_value > end:
        return False
    return True


def compute_season_stats(
    *,
    season_id,
    season_key,
    season_start,
    season_end,
    users,
    user_map,
    runs,
    user_season_stats,
    enemy_name_map,
    hero_name_map,
):
    stats_rows = [row for row in user_season_stats if row["season_id"] == season_id]
    season_user_ids = {row["user_id"] for row in stats_rows}

    deaths_by_floor = Counter()
    kills_by_type = Counter()
    total_deaths = 0
    total_treasures = 0
    total_chests = 0

    for row in stats_rows:
        total_deaths += int(row["deaths"] or 0)
        total_treasures += int(row["treasures_found"] or 0)
        total_chests += int(row["chests_opened"] or 0)
        add_counter_from_json(
            deaths_by_floor, parse_json(row["deaths_by_floor"], {})
        )
        add_counter_from_json(
            kills_by_type, parse_json(row["kills_json"], {})
        )

    kills_by_type = remap_counter(kills_by_type, enemy_name_map)

    unlocked_heroes = Counter()
    for row in users:
        if row["id"] not in season_user_ids:
            continue
        unlocked = parse_json(row["unlocked_heroes_json"], [])
        if isinstance(unlocked, list):
            for hero in unlocked:
                unlocked_heroes[str(hero)] += 1
    unlocked_heroes = remap_counter(unlocked_heroes, hero_name_map)

    run_max_floor = Counter()
    runs_per_day = Counter()
    run_durations = []
    season_hero_runs = Counter()
    active_runs = 0
    today = date.today()
    week_start = today - timedelta(days=6)
    runs_today = 0
    runs_last_7_days = 0
    today_floor_sum = 0
    week_floor_sum = 0

    for row in runs:
        started = parse_dt(row["started_at"])
        if not is_in_season(started, season_start, season_end):
            continue
        floor = row["max_floor"] or 0
        run_max_floor[str(floor)] += 1
        if started:
            runs_per_day[started.date().isoformat()] += 1
            if started.date() == today:
                runs_today += 1
                today_floor_sum += floor
            if week_start <= started.date() <= today:
                runs_last_7_days += 1
                week_floor_sum += floor
        ended = parse_dt(row["ended_at"])
        if started and ended:
            duration = (ended - started).total_seconds() / 60.0
            if duration >= 0:
                run_durations.append(duration)
        if row["is_active"]:
            active_runs += 1
        state = parse_json(row["state_json"], {})
        hero_id = extract_hero_id(state)
        if hero_id:
            season_hero_runs[str(hero_id)] += 1

    season_hero_runs = remap_counter(season_hero_runs, hero_name_map)
    avg_run_minutes = safe_round(
        sum(run_durations) / len(run_durations), 2
    ) if run_durations else 0

    total_users_season = len(stats_rows)
    total_runs_season = sum(int(row["total_runs"] or 0) for row in stats_rows)
    total_xp_season = sum(int(row["xp_gained"] or 0) for row in stats_rows)
    avg_max_floor_season = safe_round(
        sum(int(row["max_floor"] or 0) for row in stats_rows) / total_users_season,
        2,
    ) if total_users_season else 0

    summary = {
        "season_key": season_key,
        "total_users_season": total_users_season,
        "total_runs_season": total_runs_season,
        "active_runs": active_runs,
        "avg_max_floor_season": avg_max_floor_season,
        "total_xp_season": total_xp_season,
        "total_deaths": total_deaths,
        "total_kills": sum(kills_by_type.values()),
        "total_treasures": total_treasures,
        "total_chests": total_chests,
        "avg_run_minutes": avg_run_minutes,
        "runs_today": runs_today,
        "runs_last_7_days": runs_last_7_days,
        "avg_floor_today": safe_round(
            (today_floor_sum / runs_today), 2
        ) if runs_today else 0,
        "avg_floor_last_7_days": safe_round(
            (week_floor_sum / runs_last_7_days), 2
        ) if runs_last_7_days else 0,
    }

    distributions = {
        "deaths_by_floor": deaths_by_floor.most_common(),
        "kills_by_type": kills_by_type.most_common(),
        "hero_runs": season_hero_runs.most_common(),
        "unlocked_heroes": unlocked_heroes.most_common(),
        "run_max_floor": sorted(
            run_max_floor.items(), key=lambda item: (-item[1], -int(item[0]))
        ),
    }

    timeseries = {
        "runs_per_day": [
            {"date": date_value, "count": count}
            for date_value, count in sorted(runs_per_day.items())
        ]
    }

    leaderboard = sorted(
        [
            {
                "id": row["user_id"],
                "username": user_map.get(row["user_id"], {}).get("username")
                or f"user_{row['user_id']}",
                "max_floor": int(row["max_floor"] or 0),
                "xp": int(row["xp_gained"] or 0),
                "max_floor_character": hero_name_map.get(
                    row.get("max_floor_character"), row.get("max_floor_character")
                ) if row.get("max_floor_character") else "-",
            }
            for row in stats_rows
        ],
        key=lambda item: (item["max_floor"], item["xp"]),
        reverse=True,
    )[:10]

    return {
        "summary": summary,
        "distributions": distributions,
        "timeseries": timeseries,
        "leaderboard": leaderboard,
    }


def main():
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL is not set")
    data_dir = os.environ.get("GAME_DATA_DIR", DEFAULT_GAME_DATA_DIR)
    if not os.path.isdir(data_dir):
        data_dir = None

    enemy_name_map = {}
    hero_name_map = {
        "wanderer": "Рыцарь",
        "rune_guard": "Страж рун",
        "berserk": "Берсерк",
        "assassin": "Ассасин",
        "hunter": "Охотник",
        "executioner": "Палач",
        "duelist": "Дуэлянт",
    }

    if data_dir:
        enemies_data = load_json_file(os.path.join(data_dir, "enemies.json")) or []
        for enemy in enemies_data:
            enemy_id = enemy.get("id")
            enemy_name = enemy.get("name")
            if enemy_id and enemy_name:
                enemy_name_map[str(enemy_id)] = enemy_name

        heroes_data = load_json_file(os.path.join(data_dir, "heroes.json")) or []
        for hero in heroes_data:
            hero_id = hero.get("id")
            hero_name = hero.get("name")
            if hero_id and hero_name:
                hero_name_map[str(hero_id)] = hero_name

    conn = psycopg2.connect(db_url)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    users = query_all(cur, "select * from users")
    runs = query_all(cur, "select * from runs")
    user_stats = query_all(cur, "select * from user_stats")
    user_badges = query_all(cur, "select * from user_badges")
    user_broadcasts = query_all(cur, "select * from user_broadcasts")
    seasons = query_all(cur, "select * from seasons")
    user_season_stats = query_all(cur, "select * from user_season_stats")
    season_history = query_all(cur, "select * from season_history")
    star_purchases = query_all(cur, "select * from star_purchases")
    star_actions = query_all(cur, "select * from star_actions")

    total_users = len(users)
    total_runs = len(runs)
    active_runs = sum(1 for r in runs if r["is_active"])
    total_xp = sum(int(u["xp"] or 0) for u in users)
    total_max_floor = sum(int(u["max_floor"] or 0) for u in users) or 0
    avg_max_floor = round(total_max_floor / total_users, 2) if total_users else 0
    tutorial_done = sum(1 for u in users if u["tutorial_done"])

    deaths_by_floor = Counter()
    kills_by_type = Counter()
    hero_runs = Counter()
    unlocked_heroes = Counter()
    total_deaths = 0
    total_treasures = 0
    total_chests = 0

    for row in user_stats:
        total_deaths += int(row["deaths"] or 0)
        total_treasures += int(row["treasures_found"] or 0)
        total_chests += int(row["chests_opened"] or 0)
        add_counter_from_json(
            deaths_by_floor, parse_json(row["deaths_by_floor"], {})
        )
        add_counter_from_json(
            kills_by_type, parse_json(row["kills_json"], {})
        )
        add_counter_from_json(
            hero_runs, parse_json(row["hero_runs_json"], {})
        )

    for row in users:
        unlocked = parse_json(row["unlocked_heroes_json"], [])
        if isinstance(unlocked, list):
            for hero in unlocked:
                unlocked_heroes[str(hero)] += 1

    kills_by_type = remap_counter(kills_by_type, enemy_name_map)
    hero_runs = remap_counter(hero_runs, hero_name_map)
    unlocked_heroes = remap_counter(unlocked_heroes, hero_name_map)

    # Season specific stats are computed below via compute_season_stats.

    purchase_count = len(star_purchases)
    stars_bought = sum(int(p["stars"] or 0) for p in star_purchases)
    levels_bought = sum(int(p["levels"] or 0) for p in star_purchases)
    xp_from_purchases = sum(int(p["xp_added"] or 0) for p in star_purchases)

    actions_by_type = Counter()
    stars_spent = 0
    for row in star_actions:
        action = row["action"] or "unknown"
        actions_by_type[action] += 1
        stars_spent += int(row["stars"] or 0)

    season_map = {s["id"]: s for s in seasons}
    current_season = None
    if seasons:
        active_seasons = [s for s in seasons if not s["ended_at"]]
        candidates = active_seasons or seasons
        current_season = max(
            candidates,
            key=lambda s: parse_dt(s["started_at"]) or datetime.min,
        )
    current_season_id = current_season["id"] if current_season else None
    current_season_key = current_season["season_key"] if current_season else None
    current_season_start = (
        parse_dt(current_season["started_at"]) if current_season else None
    )
    current_season_end = (
        parse_dt(current_season["ended_at"])
        if current_season and current_season.get("ended_at")
        else None
    )
    current_stats_rows = [
        row
        for row in user_season_stats
        if row["season_id"] == current_season_id
    ] if current_season_id is not None else []
    user_map = {u["id"]: u for u in users}

    seasons_index = sorted(
        [
            {
                "id": s["id"],
                "season_key": s["season_key"],
                "started_at": s["started_at"],
                "ended_at": s["ended_at"],
            }
            for s in seasons
        ],
        key=lambda s: parse_dt(s["started_at"]) or datetime.min,
    )

    seasons_stats = {}
    for season in seasons_index:
        season_id = season["id"]
        season_key = season["season_key"]
        season_start = parse_dt(season["started_at"])
        season_end = parse_dt(season["ended_at"]) if season["ended_at"] else None
        season_stat = compute_season_stats(
            season_id=season_id,
            season_key=season_key,
            season_start=season_start,
            season_end=season_end,
            users=users,
            user_map=user_map,
            runs=runs,
            user_season_stats=user_season_stats,
            enemy_name_map=enemy_name_map,
            hero_name_map=hero_name_map,
        )
        monetization = {
            "purchase_count": 0,
            "stars_bought": 0,
            "levels_bought": 0,
            "xp_from_purchases": 0,
            "stars_spent": 0,
            "actions_by_type": [],
        }
        if season_start or season_end:
            season_actions_by_type = Counter()
            for row in star_purchases:
                created_at = parse_dt(row["created_at"])
                if not is_in_season(created_at, season_start, season_end):
                    continue
                monetization["purchase_count"] += 1
                monetization["stars_bought"] += int(row["stars"] or 0)
                monetization["levels_bought"] += int(row["levels"] or 0)
                monetization["xp_from_purchases"] += int(row["xp_added"] or 0)

            for row in star_actions:
                created_at = parse_dt(row["created_at"])
                if not is_in_season(created_at, season_start, season_end):
                    continue
                action = row["action"] or "unknown"
                season_actions_by_type[action] += 1
                monetization["stars_spent"] += int(row["stars"] or 0)

            monetization["actions_by_type"] = season_actions_by_type.most_common()

        season_stat["monetization"] = monetization
        seasons_stats[season_key] = season_stat

    current_stats = (
        seasons_stats.get(current_season_key)
        if current_season_key
        else None
    )

    previous_season_key = None
    for idx, season in enumerate(seasons_index):
        if season["season_key"] == current_season_key and idx > 0:
            previous_season_key = seasons_index[idx - 1]["season_key"]
            break
    season_summaries = []
    for row in user_season_stats:
        season_id = row["season_id"]
        season = season_map.get(season_id)
        if not season:
            continue
        season_summaries.append(
            {
                "season_key": season["season_key"],
                "started_at": season["started_at"],
                "ended_at": season["ended_at"],
                "user_id": row["user_id"],
                "max_floor": int(row["max_floor"] or 0),
                "total_runs": int(row["total_runs"] or 0),
                "deaths": int(row["deaths"] or 0),
                "treasures_found": int(row["treasures_found"] or 0),
                "chests_opened": int(row["chests_opened"] or 0),
                "xp_gained": int(row["xp_gained"] or 0),
                "max_floor_character": hero_name_map.get(
                    row["max_floor_character"], row["max_floor_character"]
                ),
            }
        )

    season_history_map = {}
    for row in season_history:
        season_history_map[row["season_key"]] = {
            "season_number": row["season_number"],
            "winners": parse_json(row["winners_json"], {}),
            "summary": parse_json(row["summary_json"], {}),
        }

    user_stats_map = {row["user_id"]: row for row in user_stats}
    badge_map = defaultdict(list)
    for row in user_badges:
        badge_map[row["user_id"]].append(
            {
                "badge_id": row["badge_id"],
                "count": int(row["count"] or 0),
                "last_awarded_season": row["last_awarded_season"],
                "last_awarded_at": row["last_awarded_at"],
            }
        )

    broadcasts_map = defaultdict(list)
    for row in user_broadcasts:
        broadcasts_map[row["user_id"]].append(
            {
                "broadcast_key": row["broadcast_key"],
                "sent_at": row["sent_at"],
            }
        )

    runs_by_user = defaultdict(list)
    for row in runs:
        runs_by_user[row["user_id"]].append(
            {
                "id": row["id"],
                "started_at": row["started_at"],
                "ended_at": row["ended_at"],
                "max_floor": int(row["max_floor"] or 0),
                "is_active": int(row["is_active"] or 0),
                "is_tutorial": int(row["is_tutorial"] or 0),
            }
        )
    for user_id in runs_by_user:
        runs_by_user[user_id].sort(
            key=lambda item: item["started_at"] or "", reverse=True
        )

    season_max_floor_by_user = defaultdict(dict)
    season_participation_by_user = defaultdict(set)
    for row in user_season_stats:
        season = season_map.get(row["season_id"])
        if not season:
            continue
        season_key = season["season_key"]
        season_max_floor_by_user[row["user_id"]][season_key] = int(
            row["max_floor"] or 0
        )
        season_participation_by_user.setdefault(row["user_id"], set()).add(
            season_key
        )

    purchases_by_user = defaultdict(list)
    for row in star_purchases:
        purchases_by_user[row["user_id"]].append(
            {
                "created_at": row["created_at"],
                "stars": int(row["stars"] or 0),
                "levels": int(row["levels"] or 0),
                "xp_added": int(row["xp_added"] or 0),
            }
        )

    actions_by_user = defaultdict(list)
    for row in star_actions:
        actions_by_user[row["user_id"]].append(
            {
                "created_at": row["created_at"],
                "action": row["action"],
                "stars": int(row["stars"] or 0),
            }
        )
    active_runs_details = []
    for row in runs:
        if not row["is_active"]:
            continue
        state = parse_json(row["state_json"], {})
        player = state.get("player", {}) if isinstance(state, dict) else {}
        weapon = player.get("weapon", {}) if isinstance(player, dict) else {}
        enemies = state.get("enemies", []) if isinstance(state, dict) else []
        user = user_map.get(row["user_id"])
        active_runs_details.append(
            {
                "run_id": row["id"],
                "user_id": row["user_id"],
                "username": user["username"] if user else None,
                "started_at": row["started_at"],
                "floor": state.get("floor"),
                "phase": state.get("phase"),
                "tutorial": state.get("tutorial"),
                "player": {
                    "hp": player.get("hp"),
                    "hp_max": player.get("hp_max"),
                    "ap": player.get("ap"),
                    "ap_max": player.get("ap_max"),
                    "armor": player.get("armor"),
                    "accuracy": player.get("accuracy"),
                    "evasion": player.get("evasion"),
                    "power": player.get("power"),
                    "luck": player.get("luck"),
                    "weapon": weapon.get("name"),
                    "potions": len(player.get("potions", []) or []),
                    "scrolls": len(player.get("scrolls", []) or []),
                },
                "enemies": [
                    {
                        "name": enemy.get("name"),
                        "hp": enemy.get("hp"),
                        "max_hp": enemy.get("max_hp"),
                        "attack": enemy.get("attack"),
                        "armor": enemy.get("armor"),
                        "danger": enemy.get("danger"),
                    }
                    for enemy in enemies
                    if isinstance(enemy, dict)
                ],
            }
        )

    leaderboard = sorted(
        [
            {
                "id": u["id"],
                "username": u["username"] or f"user_{u['id']}",
                "max_floor": int(u["max_floor"] or 0),
                "xp": int(u["xp"] or 0),
            }
            for u in users
        ],
        key=lambda item: (item["max_floor"], item["xp"]),
        reverse=True,
    )[:10]

    if not current_stats:
        current_stats = {
            "summary": {
                "total_users_season": 0,
                "total_runs_season": 0,
                "active_runs": 0,
                "avg_max_floor_season": 0,
                "total_xp_season": 0,
                "total_deaths": 0,
                "total_kills": 0,
                "total_treasures": 0,
                "total_chests": 0,
                "avg_run_minutes": 0,
                "runs_today": 0,
                "runs_last_7_days": 0,
                "avg_floor_today": 0,
                "avg_floor_last_7_days": 0,
            },
            "distributions": {
                "deaths_by_floor": [],
                "kills_by_type": [],
                "hero_runs": [],
                "unlocked_heroes": [],
                "run_max_floor": [],
            },
            "timeseries": {"runs_per_day": []},
        }

    current_monetization = {}
    if current_season_start or current_season_end:
        season_purchase_count = 0
        season_stars_bought = 0
        season_levels_bought = 0
        season_xp_from_purchases = 0
        season_stars_spent = 0
        season_actions_by_type = Counter()

        for row in star_purchases:
            created_at = parse_dt(row["created_at"])
            if not is_in_season(created_at, current_season_start, current_season_end):
                continue
            season_purchase_count += 1
            season_stars_bought += int(row["stars"] or 0)
            season_levels_bought += int(row["levels"] or 0)
            season_xp_from_purchases += int(row["xp_added"] or 0)

        for row in star_actions:
            created_at = parse_dt(row["created_at"])
            if not is_in_season(created_at, current_season_start, current_season_end):
                continue
            action = row["action"] or "unknown"
            season_actions_by_type[action] += 1
            season_stars_spent += int(row["stars"] or 0)

        current_monetization = {
            "purchase_count": season_purchase_count,
            "stars_bought": season_stars_bought,
            "levels_bought": season_levels_bought,
            "xp_from_purchases": season_xp_from_purchases,
            "stars_spent": season_stars_spent,
            "actions_by_type": season_actions_by_type.most_common(),
        }
    else:
        current_monetization = {
            "purchase_count": purchase_count,
            "stars_bought": stars_bought,
            "levels_bought": levels_bought,
            "xp_from_purchases": xp_from_purchases,
            "stars_spent": stars_spent,
            "actions_by_type": actions_by_type.most_common(),
        }

    stats = {
        "generated_at": datetime.utcnow().isoformat(timespec="minutes") + "Z",
        "summary": {
            "total_users_all": total_users,
            "current_season_key": current_season_key,
            "previous_season_key": previous_season_key,
            "tutorial_completion_rate": round(
                (tutorial_done / total_users) * 100, 2
            ) if total_users else 0,
            **current_stats["summary"],
        },
        "distributions": current_stats["distributions"],
        "timeseries": current_stats["timeseries"],
        "monetization": current_monetization,
        "seasons_index": seasons_index,
        "seasons_stats": seasons_stats,
        "seasons": season_summaries,
        "season_history": season_history_map,
        "leaderboard": leaderboard,
        "active_runs": active_runs_details,
        "users_list": [
            {
                "id": u["id"],
                "username": u["username"] or f"user_{u['id']}",
                "max_floor": int(u["max_floor"] or 0),
                "xp": int(u["xp"] or 0),
                "created_at": u["created_at"],
                "in_current_season": bool(
                    any(
                        row["user_id"] == u["id"]
                        and row["season_id"] == current_season_id
                        for row in user_season_stats
                    )
                ),
                "season_max_floor": season_max_floor_by_user.get(u["id"], {}),
                "season_participation": sorted(
                    list(season_participation_by_user.get(u["id"], set()))
                ),
            }
            for u in users
        ],
        "user_details": {},
    }

    user_details = {}
    for u in users:
        stats_row = user_stats_map.get(u["id"])
        deaths_by_floor_user = parse_json(
            stats_row["deaths_by_floor"], {}
        ) if stats_row else {}
        kills_by_type_user = parse_json(
            stats_row["kills_json"], {}
        ) if stats_row else {}
        hero_runs_user = parse_json(
            stats_row["hero_runs_json"], {}
        ) if stats_row else {}
        unlocked = parse_json(u["unlocked_heroes_json"], [])
        active_run_state = None
        for row in runs:
            if row["user_id"] == u["id"] and row["is_active"]:
                state = parse_json(row["state_json"], {})
                if isinstance(state, dict):
                    player = state.get("player", {}) or {}
                    weapon = player.get("weapon", {}) or {}
                    enemies = state.get("enemies", []) or []
                    active_run_state = {
                        "run_id": row["id"],
                        "started_at": row["started_at"],
                        "floor": state.get("floor"),
                        "phase": state.get("phase"),
                        "player": {
                            "hp": player.get("hp"),
                            "hp_max": player.get("hp_max"),
                            "ap": player.get("ap"),
                            "ap_max": player.get("ap_max"),
                            "armor": player.get("armor"),
                            "accuracy": player.get("accuracy"),
                            "evasion": player.get("evasion"),
                            "power": player.get("power"),
                            "luck": player.get("luck"),
                            "weapon": weapon.get("name"),
                        },
                        "enemies": [
                            {
                                "name": enemy.get("name"),
                                "hp": enemy.get("hp"),
                                "max_hp": enemy.get("max_hp"),
                                "attack": enemy.get("attack"),
                                "armor": enemy.get("armor"),
                                "danger": enemy.get("danger"),
                            }
                            for enemy in enemies
                            if isinstance(enemy, dict)
                        ],
                    }
                break

        unlocked_mapped = (
            [hero_name_map.get(str(hero), str(hero)) for hero in unlocked]
            if isinstance(unlocked, list)
            else []
        )
        user_details[str(u["id"])] = {
            "id": u["id"],
            "username": u["username"] or f"user_{u['id']}",
            "created_at": u["created_at"],
            "max_floor": int(u["max_floor"] or 0),
            "xp": int(u["xp"] or 0),
            "tutorial_done": int(u["tutorial_done"] or 0),
            "unlocked_heroes": unlocked_mapped,
            "stats": {
                "total_runs": int(stats_row["total_runs"] or 0) if stats_row else 0,
                "deaths": int(stats_row["deaths"] or 0) if stats_row else 0,
                "treasures_found": int(stats_row["treasures_found"] or 0) if stats_row else 0,
                "chests_opened": int(stats_row["chests_opened"] or 0) if stats_row else 0,
                "deaths_by_floor": deaths_by_floor_user,
                "kills_by_type": remap_dict_keys(kills_by_type_user, enemy_name_map),
                "hero_runs": remap_dict_keys(hero_runs_user, hero_name_map),
                "total_kills": sum(
                    int(value or 0) for value in kills_by_type_user.values()
                ),
            },
            "runs": runs_by_user.get(u["id"], []),
            "seasons": [
                {
                    "season_key": season_map[row["season_id"]]["season_key"],
                    "max_floor": int(row["max_floor"] or 0),
                    "total_runs": int(row["total_runs"] or 0),
                    "deaths": int(row["deaths"] or 0),
                    "treasures_found": int(row["treasures_found"] or 0),
                    "chests_opened": int(row["chests_opened"] or 0),
                    "xp_gained": int(row["xp_gained"] or 0),
                    "max_floor_character": hero_name_map.get(
                        row["max_floor_character"], row["max_floor_character"]
                    ),
                }
                for row in user_season_stats
                if row["user_id"] == u["id"] and row["season_id"] in season_map
            ],
            "purchases": purchases_by_user.get(u["id"], []),
            "actions": actions_by_user.get(u["id"], []),
            "badges": badge_map.get(u["id"], []),
            "broadcasts": broadcasts_map.get(u["id"], []),
            "active_run": active_run_state,
        }

    stats["user_details"] = user_details

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as handle:
        json.dump(stats, handle, ensure_ascii=True, indent=2, default=json_default)


if __name__ == "__main__":
    main()
