const numberFormat = new Intl.NumberFormat("en-US");
const decimalFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

const palette = {
  ember: "#8b5e3c",
  moss: "#3d5b4a",
  sun: "#7f6746",
  ink: "#0f1210",
  clay: "#2a2f33",
};

Chart.defaults.color = "#b3a999";
Chart.defaults.borderColor = "rgba(70, 76, 82, 0.5)";
Chart.defaults.font.family = "\"Source Sans 3\", \"Segoe UI\", sans-serif";

const baseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
  animation: { duration: 900 },
};

const toPairs = (source) => {
  if (!source) return [];
  const pairs = Array.isArray(source)
    ? source
    : typeof source === "object"
      ? Object.entries(source)
      : [];
  return pairs
    .filter((item) => Array.isArray(item) && item.length >= 2)
    .map(([label, value]) => ({
      label: String(label),
      value: Number(value) || 0,
    }));
};

const setText = (id, value, formatter = numberFormat) => {
  const node = document.getElementById(id);
  if (node) {
    node.textContent = formatter.format(value);
  }
};

const setRaw = (id, value) => {
  const node = document.getElementById(id);
  if (node) {
    node.textContent = value;
  }
};

const formatValue = (value) => {
  if (value === null || value === undefined || value === "") return "?";
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? numberFormat.format(value)
      : decimalFormat.format(Math.round(value * 100) / 100);
  }
  return value;
};

const getLevelInfo = (xp) => {
  let level = 1;
  let remaining = Math.max(0, Math.floor(Number(xp) || 0));
  let need = 100;
  while (remaining >= need) {
    remaining -= need;
    level += 1;
    need = 100 + 25 * (level - 1);
    if (level > 10000) break;
  }
  return { level, remaining, need };
};

const formatUtcPlus3 = (isoString) => {
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) {
    return isoString;
  }
  const shifted = new Date(parsed.getTime() + 3 * 60 * 60 * 1000);
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const year = shifted.getUTCFullYear();
  const hours = String(shifted.getUTCHours()).padStart(2, "0");
  const minutes = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${day}.${month}.${year} ${hours}:${minutes} GMT+3`;
};

const formatDateTime = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value || "-";
  }
  const shifted = new Date(parsed.getTime() + 3 * 60 * 60 * 1000);
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const year = shifted.getUTCFullYear();
  const hours = String(shifted.getUTCHours()).padStart(2, "0");
  const minutes = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${day}.${month}.${year} ${hours}:${minutes} GMT+3`;
};

const formatDateOnly = (value) => {
  if (!value) return "-";
  const parts = String(value).split("-");
  if (parts.length >= 3) {
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }
  return value;
};

const parseDateValue = (value) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const buildDailyTimeline = (seriesList) => {
  const dateSet = new Set();
  (seriesList || []).forEach((list) => {
    (list || []).forEach((item) => {
      if (item && item.date) {
        dateSet.add(item.date);
      }
    });
  });
  const dates = Array.from(dateSet).sort();
  const labels = dates.map(formatDateOnly);
  const valuesFor = (list) => {
    const map = new Map(
      (list || []).map((item) => [item.date, item.count])
    );
    return dates.map((date) => map.get(date) ?? 0);
  };
  return { dates, labels, valuesFor };
};

const buildMonthlySeries = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    return { labels: [], values: [] };
  }
  const map = new Map(items.map((item) => [item.date, item.count]));
  const parsedDates = items
    .map((item) => parseDateValue(item.date))
    .filter((value) => value);
  if (!parsedDates.length) {
    return { labels: [], values: [] };
  }
  const anchor = parsedDates.reduce((max, value) => (value > max ? value : max));
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 0));
  const labels = [];
  const values = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    labels.push(formatDateOnly(iso));
    values.push(map.get(iso) ?? 0);
  }
  return { labels, values };
};

const isInSeason = (value, season) => {
  if (!season) return true;
  const dateValue = parseDateValue(value);
  if (!dateValue) return false;
  const start = season.started_at ? parseDateValue(season.started_at) : null;
  const end = season.ended_at ? parseDateValue(season.ended_at) : null;
  if (start && dateValue < start) return false;
  if (end && dateValue > end) return false;
  return true;
};

const formatPercentDelta = (value) => {
  if (value === null || Number.isNaN(value)) {
    return "0%";
  }
  const rounded = Math.round(value);
  if (rounded === 0) return "0%";
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
};

const asNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const charts = [];
const buildChart = (ctx, config) => {
  const chart = new Chart(ctx, config);
  charts.push(chart);
  return chart;
};

const destroyCharts = () => {
  charts.forEach((chart) => chart.destroy());
  charts.length = 0;
};

let chartObserver = null;
const observeCharts = (builders) => {
  if (chartObserver) {
    chartObserver.disconnect();
  }
  const built = new Set();
  const builderMap = new Map(builders.map((item) => [item.id, item.build]));
  chartObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const canvas = entry.target;
        const id = canvas.getAttribute("id");
        const build = builderMap.get(id);
        if (!build || built.has(id)) return;
        build(canvas);
        built.add(id);
        chartObserver.unobserve(canvas);
      });
    },
    { threshold: 0.25 }
  );

  builders.forEach(({ id }) => {
    const canvas = document.getElementById(id);
    if (canvas) {
      chartObserver.observe(canvas);
      const rect = canvas.getBoundingClientRect();
      const inView = rect.top < window.innerHeight * 0.9 && rect.bottom > 0;
      if (inView) {
        const build = builderMap.get(id);
        if (build && !built.has(id)) {
          build(canvas);
          built.add(id);
          chartObserver.unobserve(canvas);
        }
      }
    }
  });
};

const staggerReveal = () => {
  const items = document.querySelectorAll(".reveal");
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

const buildLeaderboard = (leaderboard) => {
  const list = document.getElementById("leaderboardList");
  if (!list) return;
  list.innerHTML = "";
  if (!leaderboard.length) {
    const item = document.createElement("tr");
    item.innerHTML = "<td colspan=\"4\">Нет данных по выбранному сезону</td>";
    list.appendChild(item);
    return;
  }
  leaderboard.forEach((entry, index) => {
    const item = document.createElement("tr");
    const hero = entry.hero || entry.max_floor_character || "-";
    const floor = Number(entry.max_floor || 0);
    const playerName = entry.username || `ID ${entry.id}`;
    const playerCell = entry.id
      ? `<a class="nickname-link" href="player.html?id=${entry.id}">${playerName}</a>`
      : playerName;
    item.innerHTML = `
      <td>#${index + 1}</td>
      <td>${playerCell}</td>
      <td>${hero}</td>
      <td>${numberFormat.format(floor)}</td>
    `;
    list.appendChild(item);
  });
};

const buildStarsSpentTable = (rows) => {
  const body = document.getElementById("starsSpentBody");
  if (!body) return;
  body.innerHTML = "";
  if (!Array.isArray(rows) || rows.length === 0) {
    const item = document.createElement("tr");
    item.innerHTML = "<td colspan=\"2\">Нет данных по выбранному сезону</td>";
    body.appendChild(item);
    return;
  }
  rows.forEach((entry) => {
    const row = document.createElement("tr");
    const playerName = entry.username || `ID ${entry.user_id}`;
    const playerCell = entry.user_id
      ? `<a class="nickname-link" href="player.html?id=${entry.user_id}">${playerName}</a>`
      : playerName;
    row.innerHTML = `
      <td>${playerCell}</td>
      <td>${numberFormat.format(entry.stars_spent || 0)}</td>
    `;
    body.appendChild(row);
  });
};

const buildTodayPlayersTable = (rows) => {
  const body = document.getElementById("todayPlayersBody");
  if (!body) return;
  body.innerHTML = "";
  if (!Array.isArray(rows) || rows.length === 0) {
    const item = document.createElement("tr");
    item.innerHTML = "<td colspan=\"2\">Сегодня запусков не было</td>";
    body.appendChild(item);
    return;
  }
  rows.forEach((entry) => {
    const row = document.createElement("tr");
    const userId = entry.user_id ?? entry.id ?? null;
    const playerName = entry.username || (userId ? `ID ${userId}` : "Неизвестный");
    const playerCell = userId
      ? `<a class="nickname-link" href="player.html?id=${userId}">${playerName}</a>`
      : playerName;
    const runsToday = Number(entry.runs_today);
    row.innerHTML = `
      <td>${playerCell}</td>
      <td>${numberFormat.format(Number.isFinite(runsToday) ? runsToday : 0)}</td>
    `;
    body.appendChild(row);
  });
};

let activeRunsExpanded = false;

const updateActiveRunsToggle = (visibleCount, totalCount, expanded) => {
  const controls = document.getElementById("activeRunsControls");
  const toggle = document.getElementById("activeRunsToggle");
  if (!controls || !toggle) return;
  if (totalCount <= visibleCount) {
    controls.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    return;
  }
  controls.hidden = false;
  toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
  toggle.textContent = expanded
    ? "Свернуть"
    : `Показать все (${totalCount - visibleCount})`;
};

const applyActiveRunsCollapse = (expanded, visibleCount) => {
  const container = document.getElementById("activeRunsList");
  if (!container) return;
  const cards = Array.from(container.querySelectorAll(".run-card"));
  cards.forEach((card, index) => {
    const shouldHide = !expanded && index >= visibleCount;
    card.classList.toggle("run-card--hidden", shouldHide);
  });
  updateActiveRunsToggle(visibleCount, cards.length, expanded);
};

const setupActiveRunsCollapse = () => {
  const container = document.getElementById("activeRunsList");
  const toggle = document.getElementById("activeRunsToggle");
  const controls = document.getElementById("activeRunsControls");
  if (!container || !toggle || !controls) return;

  const cards = Array.from(container.querySelectorAll(".run-card"));
  if (!cards.length || cards[0].textContent === "Нет активных забегов.") {
    activeRunsExpanded = false;
    controls.hidden = true;
    return;
  }

  cards.forEach((card) => card.classList.remove("run-card--hidden"));
  const firstRowTop = cards[0].offsetTop;
  const visibleCount =
    cards.filter((card) => card.offsetTop === firstRowTop).length || 1;
  if (cards.length <= visibleCount) {
    activeRunsExpanded = false;
  }

  applyActiveRunsCollapse(activeRunsExpanded, visibleCount);
  toggle.onclick = () => {
    activeRunsExpanded = !activeRunsExpanded;
    applyActiveRunsCollapse(activeRunsExpanded, visibleCount);
  };
};

const buildActiveRuns = (runs) => {
  const container = document.getElementById("activeRunsList");
  const controls = document.getElementById("activeRunsControls");
  if (!container) return;
  activeRunsExpanded = false;
  container.innerHTML = "";
  if (!runs.length) {
    container.innerHTML = "<div class=\"run-card\">Нет активных забегов.</div>";
    if (controls) controls.hidden = true;
    return;
  }
  runs.forEach((run) => {
    const card = document.createElement("div");
    card.className = "run-card";
    const player = run.player || {};
    const enemies = run.enemies || [];
    const enemiesHtml = enemies.length
      ? enemies
        .map(
          (enemy) => `
          <li>
            <span>${enemy.name || "Неизвестный враг"}</span>
            <strong>${formatValue(enemy.hp)}/${formatValue(enemy.max_hp)} HP</strong>
          </li>
        `
        )
        .join("")
      : "<li><span>Враги отсутствуют</span><strong>-</strong></li>";

    card.innerHTML = `
      <h3>Забег #${run.run_id}</h3>
      <div class="run-meta">
        <span>Игрок: ${run.username || `ID ${run.user_id}`}</span>
        <span>Герой: ${run.hero || "неизвестно"}</span>
        <span>Этаж: ${run.floor ?? "-"}</span>
        <span>Фаза: ${run.phase || "неизвестно"}</span>
        <span>Старт: ${formatDateTime(run.started_at)}</span>
      </div>
      <div class="run-section">
        <strong>Характеристики героя</strong>
        <ul>
          <li><span>HP</span><strong>${formatValue(player.hp)}/${formatValue(player.hp_max)}</strong></li>
          <li><span>ОД</span><strong>${formatValue(player.ap)}/${formatValue(player.ap_max)}</strong></li>
          <li><span>Броня</span><strong>${formatValue(player.armor)}</strong></li>
          <li><span>Точность</span><strong>${formatValue(player.accuracy)}</strong></li>
          <li><span>Уклонение</span><strong>${formatValue(player.evasion)}</strong></li>
          <li><span>Сила</span><strong>${formatValue(player.power)}</strong></li>
          <li><span>Удача</span><strong>${formatValue(player.luck)}</strong></li>
          <li><span>Оружие</span><strong>${player.weapon || "неизвестно"}</strong></li>
          <li><span>Зелья</span><strong>${formatValue(player.potions ?? 0)}</strong></li>
          <li><span>Свитки</span><strong>${formatValue(player.scrolls ?? 0)}</strong></li>
        </ul>
      </div>
      <div class="run-section">
        <strong>Противники</strong>
        <ul>${enemiesHtml}</ul>
      </div>
    `;
    container.appendChild(card);
  });
  setupActiveRunsCollapse();
};

const buildAllPlayers = (players, seasonKey, query = "") => {
  const body = document.getElementById("allPlayersBody");
  if (!body) return;
  body.innerHTML = "";
  const lowered = query.trim().toLowerCase();
  const filtered = lowered
    ? players.filter((player) =>
        (player.username || "").toLowerCase().includes(lowered)
      )
    : players;
  const sorted = [...filtered].sort((a, b) => {
    const floorA = seasonKey
      ? a.season_max_floor?.[seasonKey] ?? 0
      : a.max_floor;
    const floorB = seasonKey
      ? b.season_max_floor?.[seasonKey] ?? 0
      : b.max_floor;
    if (floorB !== floorA) {
      return floorB - floorA;
    }
    return (a.username || "").localeCompare(b.username || "");
  });
  sorted.forEach((player) => {
    const seasonFloor = seasonKey
      ? player.season_max_floor?.[seasonKey] ?? player.max_floor
      : player.max_floor;
    const isActive =
      seasonKey && (player.season_participation || []).includes(seasonKey);
    const levelInfo = getLevelInfo(player.xp);
    const playerUrl = `player.html?id=${player.id}`;
    const playerName = player.username || `ID ${player.id}`;
    const row = document.createElement("tr");
    if (isActive) {
      row.classList.add("player-active");
    }
    row.tabIndex = 0;
    row.setAttribute("role", "link");
    row.setAttribute("aria-label", `Открыть статистику игрока ${playerName}`);
    row.innerHTML = `
      <td><a class="nickname-link" href="${playerUrl}">${playerName}</a></td>
      <td>${numberFormat.format(seasonFloor)}</td>
      <td>${numberFormat.format(levelInfo.level)}</td>
      <td>${isActive ? "Активен в сезоне" : "Неактивен"}</td>
    `;
    const openPlayer = () => {
      window.location.href = playerUrl;
    };
    row.addEventListener("click", (event) => {
      if (event.target.closest("a")) return;
      openPlayer();
    });
    row.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openPlayer();
    });
    body.appendChild(row);
  });
};

let cachedData = null;
let cachedSeasonMap = null;
let currentSeasonKey = null;

const getSeasonData = (data, seasonKey) => {
  if (!data || !seasonKey) {
    return {
      summary: data.summary,
      distributions: data.distributions,
      timeseries: data.timeseries,
      monetization: data.monetization,
      leaderboard: data.leaderboard,
    };
  }
  const seasonStats = data.seasons_stats?.[seasonKey];
  if (!seasonStats) {
    return {
      summary: data.summary,
      distributions: data.distributions,
      timeseries: data.timeseries,
      monetization: data.monetization,
      leaderboard: data.leaderboard,
    };
  }
  return {
    summary: { ...data.summary, ...seasonStats.summary },
    distributions: seasonStats.distributions,
    timeseries: seasonStats.timeseries,
    monetization: seasonStats.monetization || data.monetization,
    leaderboard: seasonStats.leaderboard || data.leaderboard,
  };
};

const applySeason = (seasonKey) => {
  if (!cachedData) return;
  currentSeasonKey = seasonKey;
  const seasonData = getSeasonData(cachedData, seasonKey);
  const summary = seasonData.summary;
  const monetization = seasonData.monetization;
  const seasonInfo = cachedSeasonMap?.get(seasonKey) || null;
  const seasonsOrder =
    Array.isArray(cachedData.seasons_index) && cachedData.seasons_index.length
      ? cachedData.seasons_index
      : Array.from(cachedSeasonMap?.values() || []);
  const seasonIdx = seasonsOrder.findIndex(
    (season) => season.season_key === seasonKey
  );
  const prevSeasonKey =
    seasonIdx > 0 ? seasonsOrder[seasonIdx - 1].season_key : null;
  const prevSeasonStats = prevSeasonKey
    ? cachedData.seasons_stats?.[prevSeasonKey]
    : null;
  const currentPlayers = asNumber(summary.total_users_season, 0);
  const prevPlayers = asNumber(prevSeasonStats?.summary?.total_users_season, 0);
  const interestDelta =
    prevPlayers > 0
      ? ((currentPlayers - prevPlayers) / prevPlayers) * 100
      : 0;

  setText("activeRuns", summary.active_runs);
  setText("avgRunMinutes", summary.avg_run_minutes, decimalFormat);
  setText("totalUsersAll", cachedData.summary.total_users_all);
  setText("totalUsersSeason", summary.total_users_season);
  setText("totalRunsSeason", summary.total_runs_season);
  setText("totalXpSeason", summary.total_xp_season);
  setText("avgMaxFloorSeason", summary.avg_max_floor_season, decimalFormat);
  setText("totalDeaths", summary.total_deaths);
  setText("totalKills", summary.total_kills);
  setText("totalTreasures", summary.total_treasures);
  setText("totalChests", summary.total_chests);
  setRaw("tutorialRate", `${cachedData.summary.tutorial_completion_rate}%`);
  setText("starsBought", monetization.stars_bought);
  setRaw("seasonInterest", formatPercentDelta(interestDelta));
  setText("runsToday", summary.runs_today);
  setText("avgFloorToday", summary.avg_floor_today, decimalFormat);
  setText("runsWeek", summary.runs_last_7_days);
  setText("avgFloorWeek", summary.avg_floor_last_7_days, decimalFormat);

  const usersById = new Map(
    (cachedData.users_list || []).map((user) => [user.id, user])
  );
  const leaderboardFallback = (cachedData.seasons || [])
    .filter((row) => row.season_key === seasonKey)
    .map((row) => ({
      username: usersById.get(row.user_id)?.username || `user_${row.user_id}`,
      max_floor_character: row.max_floor_character || "-",
      max_floor: Number(row.max_floor || 0),
      xp: Number(row.xp_gained || 0),
    }))
    .sort((a, b) => {
      if (b.max_floor !== a.max_floor) return b.max_floor - a.max_floor;
      return b.xp - a.xp;
    })
    .slice(0, 10);
  const leaderboardData =
    Array.isArray(seasonData.leaderboard) && seasonData.leaderboard.length
      ? seasonData.leaderboard
      : leaderboardFallback;
  buildLeaderboard(leaderboardData);

  const spentByUser =
    seasonData.monetization?.spent_by_user ||
    cachedData.monetization?.spent_by_user ||
    [];
  buildStarsSpentTable(spentByUser);
  buildTodayPlayersTable(summary.today_players || []);

  const activeRuns = (cachedData.active_runs || []).filter((run) =>
    isInSeason(run.started_at, seasonInfo)
  );
  buildActiveRuns(activeRuns);
  buildAllPlayers(
    cachedData.users_list || [],
    seasonKey,
    document.getElementById("playerSearch")?.value || ""
  );

  destroyCharts();

  const chartBuilders = [
    {
      id: "runsPerDayChart",
      build: (canvas) => {
        const runsPerDay = seasonData.timeseries.runs_per_day || [];
        const activePlayers = seasonData.timeseries.active_players_per_day || [];
        const timeline = buildDailyTimeline([runsPerDay, activePlayers]);
        buildChart(canvas, {
          type: "line",
          data: {
            labels: timeline.labels,
            datasets: [
              {
                label: "Забеги",
                data: timeline.valuesFor(runsPerDay),
                borderColor: palette.moss,
                backgroundColor: "rgba(61, 91, 74, 0.25)",
                tension: 0.35,
                fill: true,
              },
              {
                label: "Игроки",
                data: timeline.valuesFor(activePlayers),
                borderColor: palette.sun,
                backgroundColor: "rgba(127, 103, 70, 0.15)",
                tension: 0.35,
                fill: true,
              },
            ],
          },
          options: {
            ...baseOptions,
            plugins: { legend: { position: "bottom" } },
            scales: {
              y: { ticks: { precision: 0 } },
              x: { ticks: { maxRotation: 0 } },
            },
          },
        });
      },
    },
    {
      id: "newPlayersChart",
      build: (canvas) => {
        const newPlayers = seasonData.timeseries.new_players_per_day || [];
        const monthSeries = buildMonthlySeries(newPlayers);
        buildChart(canvas, {
          type: "bar",
          data: {
            labels: monthSeries.labels,
            datasets: [
              {
                label: "Новые игроки",
                data: monthSeries.values,
                backgroundColor: "rgba(139, 94, 60, 0.55)",
                borderRadius: 6,
              },
            ],
          },
          options: {
            ...baseOptions,
            plugins: { legend: { display: false } },
            scales: {
              y: { ticks: { precision: 0 } },
              x: { ticks: { maxRotation: 0 } },
            },
          },
        });
      },
    },
    {
      id: "deathsByFloorChart",
      build: (canvas) => {
        const deathsByFloor = toPairs(seasonData.distributions.deaths_by_floor);
        buildChart(canvas, {
          type: "bar",
          data: {
            labels: deathsByFloor.map((item) => item.label),
            datasets: [
              {
                data: deathsByFloor.map((item) => item.value),
                backgroundColor: "rgba(139, 94, 60, 0.55)",
                borderRadius: 6,
              },
            ],
          },
          options: {
            ...baseOptions,
            plugins: { legend: { display: false } },
            scales: {
              y: { ticks: { precision: 0 } },
              x: { ticks: { maxRotation: 0 } },
            },
          },
        });
      },
    },
    {
      id: "killsByTypeChart",
      build: (canvas) => {
        const killsByType = toPairs(seasonData.distributions.kills_by_type);
        buildChart(canvas, {
          type: "bar",
          data: {
            labels: killsByType.map((item) => item.label),
            datasets: [
              {
                data: killsByType.map((item) => item.value),
                backgroundColor: "rgba(61, 91, 74, 0.5)",
                borderRadius: 6,
              },
            ],
          },
          options: {
            ...baseOptions,
            plugins: { legend: { display: false } },
            scales: {
              y: { ticks: { precision: 0 } },
              x: { ticks: { maxRotation: 0 } },
            },
          },
        });
      },
    },
    {
      id: "heroRunsChart",
      build: (canvas) => {
        const heroRuns = toPairs(seasonData.distributions.hero_runs);
        buildChart(canvas, {
          type: "doughnut",
          data: {
            labels: heroRuns.map((item) => item.label),
            datasets: [
              {
                data: heroRuns.map((item) => item.value),
                backgroundColor: [
                  palette.ember,
                  palette.moss,
                  palette.sun,
                  "#2f3a48",
                  "#d9794d",
                  "#6b8f7f",
                ],
                borderWidth: 0,
              },
            ],
          },
          options: {
            ...baseOptions,
            plugins: { legend: { position: "bottom" } },
          },
        });
      },
    },
    {
      id: "unlockedHeroesChart",
      build: (canvas) => {
        const seasonUnlockedHeroes = toPairs(
          seasonData.distributions.unlocked_heroes || []
        );
        const unlockedHeroes = (
          seasonUnlockedHeroes.length
            ? seasonUnlockedHeroes
            : toPairs(cachedData.distributions?.unlocked_heroes || [])
        )
          .filter((item) => {
            const normalized = item.label.trim().toLowerCase();
            return normalized !== "рыцарь" && normalized !== "wanderer";
          })
          .sort((a, b) => {
            if (b.value !== a.value) {
              return b.value - a.value;
            }
            return a.label.localeCompare(b.label, "ru");
          });
        buildChart(canvas, {
          type: "bar",
          data: {
            labels: unlockedHeroes.map((item) => item.label),
            datasets: [
              {
                data: unlockedHeroes.map((item) => item.value),
                backgroundColor: "rgba(61, 91, 74, 0.55)",
                borderRadius: 6,
              },
            ],
          },
          options: {
            ...baseOptions,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (ctx) => `${numberFormat.format(ctx.parsed.y)} игроков`,
                },
              },
            },
            scales: {
              y: {
                ticks: { precision: 0 },
                title: { display: true, text: "Игроков" },
              },
              x: { ticks: { maxRotation: 0 } },
            },
          },
        });
      },
    },
    {
      id: "runMaxFloorChart",
      build: (canvas) => {
        const runMaxFloor = toPairs(seasonData.distributions.run_max_floor);
        buildChart(canvas, {
          type: "bar",
          data: {
            labels: runMaxFloor.map((item) => item.label),
            datasets: [
              {
                data: runMaxFloor.map((item) => item.value),
                backgroundColor: "rgba(127, 103, 70, 0.55)",
                borderRadius: 6,
              },
            ],
          },
          options: {
            ...baseOptions,
            plugins: { legend: { display: false } },
            scales: {
              y: { ticks: { precision: 0 } },
              x: { ticks: { maxRotation: 0 } },
            },
          },
        });
      },
    },
    {
      id: "actionsChart",
      build: (canvas) => {
        const actions = toPairs(monetization.actions_by_type || []);
        buildChart(canvas, {
          type: "bar",
          data: {
            labels: actions.map((item) => item.label),
            datasets: [
              {
                data: actions.map((item) => item.value),
                backgroundColor: "rgba(42, 47, 51, 0.6)",
                borderRadius: 6,
              },
            ],
          },
          options: {
            ...baseOptions,
            plugins: { legend: { display: false } },
            scales: {
              y: { ticks: { precision: 0 } },
              x: { ticks: { maxRotation: 0 } },
            },
          },
        });
      },
    },
    {
      id: "purchasesChart",
      build: (canvas) => {
        buildChart(canvas, {
          type: "bar",
          data: {
            labels: ["Покупки", "Звезды", "Уровни"],
            datasets: [
              {
                data: [
                  monetization.purchase_count,
                  monetization.stars_bought,
                  monetization.levels_bought,
                ],
                backgroundColor: [
                  "rgba(139, 94, 60, 0.55)",
                  "rgba(61, 91, 74, 0.55)",
                  "rgba(127, 103, 70, 0.55)",
                ],
                borderRadius: 6,
              },
            ],
          },
          options: {
            ...baseOptions,
            plugins: { legend: { display: false } },
            scales: {
              y: { ticks: { precision: 0 } },
              x: { ticks: { maxRotation: 0 } },
            },
          },
        });
      },
    },
  ];

  observeCharts(chartBuilders);
};

const buildSeasonSelect = (seasons, defaultKey) => {
  const select = document.getElementById("seasonSelect");
  if (!select) return;
  select.innerHTML = "";
  if (!seasons.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Сезоны не найдены";
    select.appendChild(option);
    select.disabled = true;
    return;
  }
  select.disabled = false;
  seasons.forEach((season) => {
    const option = document.createElement("option");
    option.value = season.season_key;
    option.textContent = `Сезон ${season.season_key}`;
    select.appendChild(option);
  });
  if (defaultKey) {
    select.value = defaultKey;
  }
  select.onchange = () => {
    applySeason(select.value);
  };
};

const loadData = async (forceReload = false) => {
  const suffix = forceReload ? `?ts=${Date.now()}` : "";
  const response = await fetch(`data/stats.json${suffix}`);
  const data = await response.json();

  cachedData = data;
  const seasonsIndexRaw = Array.isArray(data.seasons_index)
    ? data.seasons_index
    : [];
  const seasonsFromSummaries = Array.isArray(data.seasons)
    ? data.seasons
        .reduce((acc, item) => {
          if (!item || !item.season_key) return acc;
          if (!acc.find((entry) => entry.season_key === item.season_key)) {
            acc.push({
              season_key: item.season_key,
              started_at: item.started_at || null,
              ended_at: item.ended_at || null,
            });
          }
          return acc;
        }, [])
        .sort((a, b) => a.season_key.localeCompare(b.season_key))
    : [];
  const seasonsFromStats = Object.keys(data.seasons_stats || {})
    .sort((a, b) => a.localeCompare(b))
    .map((season_key) => ({
      season_key,
      started_at: null,
      ended_at: null,
    }));
  const seasonsFromSummaryKey = data.summary.current_season_key
    ? [
        {
          season_key: data.summary.current_season_key,
          started_at: null,
          ended_at: null,
        },
      ]
    : [];
  const seasonsIndex =
    seasonsIndexRaw.length > 0
      ? seasonsIndexRaw
      : seasonsFromSummaries.length > 0
        ? seasonsFromSummaries
        : seasonsFromStats.length > 0
          ? seasonsFromStats
          : seasonsFromSummaryKey;

  cachedSeasonMap = new Map(
    seasonsIndex.map((season) => [season.season_key, season])
  );

  setRaw("generatedAt", formatUtcPlus3(data.generated_at));
  buildAllPlayers(data.users_list || [], data.summary.current_season_key || "");
  const searchInput = document.getElementById("playerSearch");
  if (searchInput) {
    searchInput.value = "";
    searchInput.oninput = () => {
      buildAllPlayers(
        cachedData.users_list || [],
        currentSeasonKey,
        searchInput.value
      );
    };
  }

  const defaultSeasonKey =
    (currentSeasonKey &&
      cachedSeasonMap &&
      cachedSeasonMap.has(currentSeasonKey) &&
      currentSeasonKey) ||
    data.summary.current_season_key ||
    seasonsIndex?.[seasonsIndex.length - 1]?.season_key ||
    null;
  buildSeasonSelect(seasonsIndex, defaultSeasonKey);
  applySeason(defaultSeasonKey);

  staggerReveal();
};

const init = () => {
  loadData(false).catch((error) => {
    console.error("Failed to load stats", error);
  });

  const refreshButton = document.getElementById("refreshButton");
  if (refreshButton) {
    refreshButton.addEventListener("click", () => {
      refreshButton.disabled = true;
      refreshButton.textContent = "Обновляем...";
      loadData(true)
        .catch((error) => {
          console.error("Failed to load stats", error);
        })
        .finally(() => {
          refreshButton.disabled = false;
          refreshButton.textContent = "Обновить данные";
        });
    });
  }
};

init();

window.addEventListener("beforeunload", () => {
  destroyCharts();
});

window.addEventListener("resize", () => {
  setupActiveRunsCollapse();
});
