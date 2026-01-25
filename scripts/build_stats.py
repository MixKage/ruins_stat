#!/usr/bin/env python3
import json
import os
import sqlite3
from collections import Counter, defaultdict
from datetime import datetime, timedelta, date


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DB_PATH = os.path.join(BASE_DIR, "ruins.db")
DEFAULT_GAME_DATA_DIR = "/Users/mixkage/files/ruins_secret_of_death/data"
OUT_DIR = os.path.join(BASE_DIR, "public", "data")
OUT_PATH = os.path.join(OUT_DIR, "stats.json")


def parse_json(text, default):
    if not text:
        return default
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return default


def load_json_file(path):
    if not path or not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def parse_dt(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
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


def main():
    db_path = os.environ.get("DB_PATH", DEFAULT_DB_PATH)
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

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA query_only = ON")
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    users = cur.execute("select * from users").fetchall()
    runs = cur.execute("select * from runs").fetchall()
    user_stats = cur.execute("select * from user_stats").fetchall()
    user_badges = cur.execute("select * from user_badges").fetchall()
    user_broadcasts = cur.execute("select * from user_broadcasts").fetchall()
    seasons = cur.execute("select * from seasons").fetchall()
    user_season_stats = cur.execute("select * from user_season_stats").fetchall()
    season_history = cur.execute("select * from season_history").fetchall()
    star_purchases = cur.execute("select * from star_purchases").fetchall()
    star_actions = cur.execute("select * from star_actions").fetchall()

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

    run_max_floor = Counter()
    runs_per_day = Counter()
    run_durations = []
    today = date.today()
    week_start = today - timedelta(days=6)
    runs_today = 0
    runs_last_7_days = 0
    today_floor_sum = 0
    week_floor_sum = 0

    for row in runs:
        floor = row["max_floor"] or 0
        run_max_floor[str(floor)] += 1
        started = parse_dt(row["started_at"])
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

    avg_run_minutes = safe_round(
        sum(run_durations) / len(run_durations), 2
    ) if run_durations else 0

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
    current_stats_rows = [
        row
        for row in user_season_stats
        if row["season_id"] == current_season_id
    ] if current_season_id is not None else []
    total_users_season = len(current_stats_rows)
    total_runs_season = sum(int(row["total_runs"] or 0) for row in current_stats_rows)
    total_xp_season = sum(int(row["xp_gained"] or 0) for row in current_stats_rows)
    avg_max_floor_season = safe_round(
        sum(int(row["max_floor"] or 0) for row in current_stats_rows) / total_users_season,
        2,
    ) if total_users_season else 0
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

    user_map = {u["id"]: u for u in users}
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

    stats = {
        "generated_at": datetime.utcnow().isoformat(timespec="minutes") + "Z",
        "summary": {
            "total_users_all": total_users,
            "total_users_season": total_users_season,
            "total_runs_season": total_runs_season,
            "active_runs": active_runs,
            "avg_max_floor_season": avg_max_floor_season,
            "total_xp_season": total_xp_season,
            "current_season_key": current_season_key,
            "tutorial_completion_rate": round(
                (tutorial_done / total_users) * 100, 2
            ) if total_users else 0,
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
        },
        "distributions": {
            "deaths_by_floor": deaths_by_floor.most_common(),
            "kills_by_type": kills_by_type.most_common(),
            "hero_runs": hero_runs.most_common(),
            "unlocked_heroes": unlocked_heroes.most_common(),
            "run_max_floor": sorted(
                run_max_floor.items(),
                key=lambda item: (-item[1], -int(item[0])),
            ),
        },
        "timeseries": {
            "runs_per_day": [
                {"date": date, "count": count}
                for date, count in sorted(runs_per_day.items())
            ],
        },
        "monetization": {
            "purchase_count": purchase_count,
            "stars_bought": stars_bought,
            "levels_bought": levels_bought,
            "xp_from_purchases": xp_from_purchases,
            "stars_spent": stars_spent,
            "actions_by_type": actions_by_type.most_common(),
        },
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
        json.dump(stats, handle, ensure_ascii=True, indent=2)


if __name__ == "__main__":
    main()
