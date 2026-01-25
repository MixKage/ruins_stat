const numberFormat = new Intl.NumberFormat("en-US");
const decimalFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

const parseDate = (value) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (value) => {
  const parsed = parseDate(value);
  if (!parsed) return "-";
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const year = parsed.getUTCFullYear();
  const hours = String(parsed.getUTCHours()).padStart(2, "0");
  const minutes = String(parsed.getUTCMinutes()).padStart(2, "0");
  return `${day}.${month}.${year} ${hours}:${minutes}`;
};

const getParam = (key) => {
  const params = new URLSearchParams(window.location.search);
  return params.get(key);
};

const setText = (id, value) => {
  const node = document.getElementById(id);
  if (node) {
    node.textContent = value;
  }
};

const renderList = (id, items, emptyLabel) => {
  const list = document.getElementById(id);
  if (!list) return;
  list.innerHTML = "";
  if (!items.length) {
    const item = document.createElement("li");
    item.textContent = emptyLabel;
    list.appendChild(item);
    return;
  }
  items.forEach((text) => {
    const item = document.createElement("li");
    item.innerHTML = text;
    list.appendChild(item);
  });
};

const buildSummary = (container, entries) => {
  container.innerHTML = "";
  entries.forEach((entry) => {
    const card = document.createElement("div");
    card.className = "summary-card summary-card--muted";
    card.innerHTML = `
      <h3>${entry.label}</h3>
      <p>${entry.value}</p>
    `;
    container.appendChild(card);
  });
};

const buildCard = (container, html) => {
  container.innerHTML = "";
  container.appendChild(html);
};

const revealSections = () => {
  const items = document.querySelectorAll(".reveal");
  if (!items.length) return;
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.2 }
  );
  items.forEach((item) => observer.observe(item));
};

const sumBy = (items, key) =>
  items.reduce((total, item) => total + (Number(item[key]) || 0), 0);

const init = async () => {
  let playerId = getParam("id");
  let data;
  try {
    const response = await fetch("data/stats.json");
    data = await response.json();
  } catch (error) {
    setText("playerName", "Данные недоступны");
    setText("playerMeta", "Не удалось загрузить статистику.");
    return;
  }
  if (!playerId) {
    playerId = data.users_list?.[0]?.id?.toString() || null;
  }
  const details = playerId ? data.user_details?.[playerId] : null;
  if (!details) {
    setText("playerName", "Игрок не найден");
    setText(
      "playerMeta",
      playerId
        ? `ID ${playerId} отсутствует в базе.`
        : "Укажите id в строке запроса."
    );
    return;
  }

  setText("playerName", details.username);
  setText(
    "playerMeta",
    `ID ${details.id} · XP ${numberFormat.format(
      details.xp
    )} · Максимальный этаж ${numberFormat.format(details.max_floor)}`
  );

  const summary = document.getElementById("playerSummary");
  const purchases = details.purchases || [];
  const actions = details.actions || [];
  const broadcasts = details.broadcasts || [];
  const runs = details.runs || [];
  const endedRuns = runs.filter((run) => run.ended_at);
  const runDurations = endedRuns
    .map((run) => {
      const started = parseDate(run.started_at);
      const ended = parseDate(run.ended_at);
      if (!started || !ended) return null;
      const minutes = (ended - started) / 60000;
      return minutes >= 0 ? minutes : null;
    })
    .filter((value) => value !== null);
  const totalStarsBought = sumBy(purchases, "stars");
  const totalLevelsBought = sumBy(purchases, "levels");
  const totalXpBought = sumBy(purchases, "xp_added");
  const totalStarsSpent = sumBy(actions, "stars");

  buildSummary(summary, [
    {
      label: "Забегов",
      value: numberFormat.format(details.stats.total_runs),
    },
    {
      label: "Смертей",
      value: numberFormat.format(details.stats.deaths),
    },
    {
      label: "Побед",
      value: numberFormat.format(details.stats.total_kills),
    },
    {
      label: "Сокровищ",
      value: numberFormat.format(details.stats.treasures_found),
    },
    {
      label: "Сундуков",
      value: numberFormat.format(details.stats.chests_opened),
    },
    {
      label: "Открытые герои",
      value: numberFormat.format(details.unlocked_heroes.length),
    },
    {
      label: "Покупок звёзд",
      value: numberFormat.format(purchases.length),
    },
    {
      label: "Потрачено звёзд",
      value: numberFormat.format(totalStarsSpent),
    },
  ]);

  renderList(
    "playerProfile",
    [
      `<span>ID</span> <strong>${details.id}</strong>`,
      `<span>Дата регистрации</span> <strong>${formatDate(details.created_at)}</strong>`,
      `<span>Обучение</span> <strong>${details.tutorial_done ? "пройдено" : "нет"}</strong>`,
      `<span>Макс этаж</span> <strong>${numberFormat.format(details.max_floor)}</strong>`,
      `<span>XP</span> <strong>${numberFormat.format(details.xp)}</strong>`,
    ],
    "Нет данных."
  );

  renderList(
    "playerUnlockedHeroes",
    details.unlocked_heroes.length
      ? details.unlocked_heroes.map((hero) => `<span>${hero}</span> <strong>открыт</strong>`)
      : [],
    "Герои не открыты."
  );

  renderList(
    "playerBroadcasts",
    broadcasts.map(
      (item) =>
        `<span>${item.broadcast_key}</span> <strong>${formatDate(item.sent_at)}</strong>`
    ),
    "Рассылок нет."
  );

  const activeRun = document.getElementById("activeRunCard");
  if (details.active_run) {
    const card = document.createElement("div");
    card.className = "run-card";
    const run = details.active_run;
    const enemies = run.enemies || [];
    card.innerHTML = `
      <h3>Забег #${run.run_id}</h3>
      <div class="run-meta">
        <span>Этаж: ${run.floor ?? "-"}</span>
        <span>Фаза: ${run.phase || "неизвестно"}</span>
        <span>Старт: ${formatDate(run.started_at)}</span>
      </div>
      <div class="run-section">
        <strong>Характеристики героя</strong>
        <ul>
          <li><span>HP</span> <strong>${run.player.hp ?? "?"}/${run.player.hp_max ?? "?"}</strong></li>
          <li><span>ОД</span> <strong>${run.player.ap ?? "?"}/${run.player.ap_max ?? "?"}</strong></li>
          <li><span>Броня</span> <strong>${run.player.armor ?? "?"}</strong></li>
          <li><span>Точность</span> <strong>${run.player.accuracy ?? "?"}</strong></li>
          <li><span>Уклонение</span> <strong>${run.player.evasion ?? "?"}</strong></li>
          <li><span>Сила</span> <strong>${run.player.power ?? "?"}</strong></li>
          <li><span>Удача</span> <strong>${run.player.luck ?? "?"}</strong></li>
          <li><span>Оружие</span> <strong>${run.player.weapon || "неизвестно"}</strong></li>
        </ul>
      </div>
      <div class="run-section">
        <strong>Противники</strong>
        <ul>
          ${
            enemies.length
              ? enemies
                  .map(
                    (enemy) => `
                  <li>
                    <span>${enemy.name || "Неизвестный враг"}</span>
                    <strong>${enemy.hp ?? "?"}/${enemy.max_hp ?? "?"} HP</strong>
                  </li>
                `
                  )
                  .join("")
              : "<li><span>Враги отсутствуют</span> <strong>-</strong></li>"
          }
        </ul>
      </div>
    `;
    buildCard(activeRun, card);
  } else {
    activeRun.textContent = "Нет активного забега.";
  }

  const seasons = details.seasons || [];
  const seasonCards = seasons.length
    ? seasons.map(
        (season) => `
      <div class="run-card">
        <h3>Сезон ${season.season_key}</h3>
        <div class="run-meta">
          <span>Забегов: ${numberFormat.format(season.total_runs)}</span>
          <span>Макс этаж: ${numberFormat.format(season.max_floor)}</span>
          <span>XP: ${numberFormat.format(season.xp_gained)}</span>
        </div>
        <div class="run-section">
          <ul>
            <li><span>Смертей</span> <strong>${numberFormat.format(season.deaths)}</strong></li>
            <li><span>Сокровищ</span> <strong>${numberFormat.format(season.treasures_found)}</strong></li>
            <li><span>Сундуков</span> <strong>${numberFormat.format(season.chests_opened)}</strong></li>
            <li><span>Герой вершины</span> <strong>${season.max_floor_character || "неизвестно"}</strong></li>
          </ul>
        </div>
      </div>
    `
      )
    : ["<div class=\"run-card\">Нет данных по сезонам.</div>"];
  document.getElementById("playerSeasons").innerHTML = seasonCards.join("");

  renderList(
    "playerDeaths",
    Object.entries(details.stats.deaths_by_floor || {}).map(
      ([floor, count]) =>
        `<span>Этаж ${floor}</span> <strong>${numberFormat.format(count)}</strong>`
    ),
    "Нет данных."
  );

  renderList(
    "playerKills",
    Object.entries(details.stats.kills_by_type || {}).map(
      ([enemy, count]) =>
        `<span>${enemy}</span> <strong>${numberFormat.format(count)}</strong>`
    ),
    "Нет данных."
  );

  renderList(
    "playerHeroes",
    Object.entries(details.stats.hero_runs || {}).map(
      ([hero, count]) =>
        `<span>${hero}</span> <strong>${numberFormat.format(count)}</strong>`
    ),
    "Нет данных."
  );

  renderList(
    "playerRuns",
    runs.map(
      (run) =>
        `<span>#${run.id} · Этаж ${run.max_floor} · ${
          run.is_active ? "активен" : "завершен"
        }</span> <strong>${formatDate(run.started_at)}</strong>`
    ),
    "Нет забегов."
  );

  renderList(
    "playerPurchases",
    purchases.map(
      (purchase) =>
        `<span>${formatDate(purchase.created_at)}</span> <strong>${numberFormat.format(
          purchase.stars
        )}★ / ${numberFormat.format(purchase.levels)} lvl</strong>`
    ),
    "Нет покупок."
  );

  renderList(
    "playerActions",
    actions.map(
      (action) =>
        `<span>${action.action || "действие"} · ${
          formatDate(action.created_at)
        }</span> <strong>${numberFormat.format(action.stars)}★</strong>`
    ),
    "Нет действий."
  );

  renderList(
    "playerBadges",
    (details.badges || []).map(
      (badge) =>
        `<span>${badge.badge_id}</span> <strong>${numberFormat.format(
          badge.count
        )} шт.</strong>`
    ),
    "Нет наград."
  );

  const runSummary = document.getElementById("playerRunSummary");
  const maxRunFloor = runs.reduce(
    (max, run) => Math.max(max, run.max_floor),
    0
  );
  const avgRunFloor =
    runs.length > 0
      ? runs.reduce((sum, run) => sum + run.max_floor, 0) / runs.length
      : 0;
  const avgRunDuration =
    runDurations.length > 0
      ? runDurations.reduce((sum, value) => sum + value, 0) /
        runDurations.length
      : 0;
  const maxRunDuration =
    runDurations.length > 0 ? Math.max(...runDurations) : 0;
  const minRunDuration =
    runDurations.length > 0 ? Math.min(...runDurations) : 0;

  buildSummary(runSummary, [
    {
      label: "Активных забегов",
      value: numberFormat.format(runs.filter((run) => run.is_active).length),
    },
    {
      label: "Завершённых забегов",
      value: numberFormat.format(runs.filter((run) => !run.is_active).length),
    },
    {
      label: "Средний этаж",
      value: decimalFormat.format(avgRunFloor),
    },
    {
      label: "Лучший этаж",
      value: numberFormat.format(maxRunFloor),
    },
    {
      label: "Средняя длительность (мин)",
      value: decimalFormat.format(avgRunDuration),
    },
    {
      label: "Самый короткий забег (мин)",
      value: decimalFormat.format(minRunDuration),
    },
    {
      label: "Самый длинный забег (мин)",
      value: decimalFormat.format(maxRunDuration),
    },
    {
      label: "Всего звёзд куплено",
      value: numberFormat.format(totalStarsBought),
    },
    {
      label: "Всего уровней куплено",
      value: numberFormat.format(totalLevelsBought),
    },
    {
      label: "XP с покупок",
      value: numberFormat.format(totalXpBought),
    },
  ]);

  revealSections();
};

init().catch((error) => {
  console.error("Failed to load player stats", error);
});
