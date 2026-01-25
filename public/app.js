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

const toPairs = (pairs) =>
  pairs.map(([label, value]) => ({ label, value }));

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
  return `${day}.${month}.${year} ${hours}:${minutes}`;
};

const formatDateTime = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value || "-";
  }
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const year = parsed.getUTCFullYear();
  const hours = String(parsed.getUTCHours()).padStart(2, "0");
  const minutes = String(parsed.getUTCMinutes()).padStart(2, "0");
  return `${day}.${month}.${year} ${hours}:${minutes}`;
};

const formatDateOnly = (value) => {
  if (!value) return "-";
  const parts = String(value).split("-");
  if (parts.length >= 3) {
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }
  return value;
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
  leaderboard.forEach((entry, index) => {
    const item = document.createElement("li");
    item.innerHTML = `<span>#${index + 1} ${entry.username}</span><strong>${numberFormat.format(
      entry.max_floor
    )}F</strong>`;
    list.appendChild(item);
  });
};

const buildSeasons = (seasons) => {
  const container = document.getElementById("seasonList");
  if (!container) return;
  container.innerHTML = "";
  if (!seasons.length) {
    container.textContent = "No seasons recorded yet.";
    return;
  }
  seasons.forEach((season) => {
    const card = document.createElement("div");
    card.className = "season-card";
    card.innerHTML = `
      <strong>Сезон ${season.season_key}</strong>
      <p>Максимальный этаж: ${numberFormat.format(season.max_floor)}</p>
      <p>Всего забегов: ${numberFormat.format(season.total_runs)}</p>
      <p>Герой вершины: ${season.max_floor_character || "неизвестно"}</p>
    `;
    container.appendChild(card);
  });
};

const buildActiveRuns = (runs) => {
  const container = document.getElementById("activeRunsList");
  if (!container) return;
  container.innerHTML = "";
  if (!runs.length) {
    container.innerHTML = "<div class=\"run-card\">Нет активных забегов.</div>";
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
            <strong>${enemy.hp ?? "?"}/${enemy.max_hp ?? "?"} HP</strong>
          </li>
        `
        )
        .join("")
      : "<li><span>Враги отсутствуют</span><strong>-</strong></li>";

    card.innerHTML = `
      <h3>Забег #${run.run_id}</h3>
      <div class="run-meta">
        <span>Игрок: ${run.username || `ID ${run.user_id}`}</span>
        <span>Этаж: ${run.floor ?? "-"}</span>
        <span>Фаза: ${run.phase || "неизвестно"}</span>
        <span>Старт: ${formatDateTime(run.started_at)}</span>
      </div>
      <div class="run-section">
        <strong>Характеристики героя</strong>
        <ul>
          <li><span>HP</span><strong>${player.hp ?? "?"}/${player.hp_max ?? "?"}</strong></li>
          <li><span>ОД</span><strong>${player.ap ?? "?"}/${player.ap_max ?? "?"}</strong></li>
          <li><span>Броня</span><strong>${player.armor ?? "?"}</strong></li>
          <li><span>Точность</span><strong>${player.accuracy ?? "?"}</strong></li>
          <li><span>Уклонение</span><strong>${player.evasion ?? "?"}</strong></li>
          <li><span>Сила</span><strong>${player.power ?? "?"}</strong></li>
          <li><span>Удача</span><strong>${player.luck ?? "?"}</strong></li>
          <li><span>Оружие</span><strong>${player.weapon || "неизвестно"}</strong></li>
          <li><span>Зелья</span><strong>${player.potions ?? 0}</strong></li>
          <li><span>Свитки</span><strong>${player.scrolls ?? 0}</strong></li>
        </ul>
      </div>
      <div class="run-section">
        <strong>Противники</strong>
        <ul>${enemiesHtml}</ul>
      </div>
    `;
    container.appendChild(card);
  });
};

const buildAllPlayers = (players) => {
  const list = document.getElementById("allPlayersList");
  if (!list) return;
  list.innerHTML = "";
  const sorted = [...players].sort((a, b) => {
    if (b.max_floor !== a.max_floor) {
      return b.max_floor - a.max_floor;
    }
    return b.xp - a.xp;
  });
  sorted.forEach((player) => {
    const item = document.createElement("li");
    item.innerHTML = `
      <a href="player.html?id=${player.id}">
        <span>${player.username}</span> <strong>Этаж ${numberFormat.format(player.max_floor)}</strong>
      </a>
    `;
    list.appendChild(item);
  });
};

const loadData = async (forceReload = false) => {
  const suffix = forceReload ? `?ts=${Date.now()}` : "";
  const response = await fetch(`data/stats.json${suffix}`);
  const data = await response.json();

  destroyCharts();

  setRaw("generatedAt", formatUtcPlus3(data.generated_at));
  setText("activeRuns", data.summary.active_runs);
  setText("avgRunMinutes", data.summary.avg_run_minutes, decimalFormat);
  setText("totalUsersAll", data.summary.total_users_all);
  setText("totalUsersSeason", data.summary.total_users_season);
  setText("totalRunsSeason", data.summary.total_runs_season);
  setText("totalXpSeason", data.summary.total_xp_season);
  setText("avgMaxFloorSeason", data.summary.avg_max_floor_season, decimalFormat);
  setText("totalDeaths", data.summary.total_deaths);
  setText("totalKills", data.summary.total_kills);
  setText("totalTreasures", data.summary.total_treasures);
  setText("totalChests", data.summary.total_chests);
  setRaw("tutorialRate", `${data.summary.tutorial_completion_rate}%`);
  setText("starsBought", data.monetization.stars_bought);
  setText("runsToday", data.summary.runs_today);
  setText("avgFloorToday", data.summary.avg_floor_today, decimalFormat);
  setText("runsWeek", data.summary.runs_last_7_days);
  setText("avgFloorWeek", data.summary.avg_floor_last_7_days, decimalFormat);

  buildLeaderboard(data.leaderboard);
  buildSeasons(data.seasons);
  buildActiveRuns(data.active_runs);
  buildAllPlayers(data.users_list || []);

  const chartBuilders = [
    {
      id: "runsPerDayChart",
      build: (canvas) => {
        const runsPerDay = data.timeseries.runs_per_day;
        buildChart(canvas, {
          type: "line",
          data: {
            labels: runsPerDay.map((item) => formatDateOnly(item.date)),
            datasets: [
              {
                label: "Забеги",
                data: runsPerDay.map((item) => item.count),
                borderColor: palette.moss,
                backgroundColor: "rgba(61, 91, 74, 0.25)",
                tension: 0.35,
                fill: true,
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
        const deathsByFloor = toPairs(data.distributions.deaths_by_floor);
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
        const killsByType = toPairs(data.distributions.kills_by_type);
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
        const heroRuns = toPairs(data.distributions.hero_runs);
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
        const unlockedHeroes = toPairs(data.distributions.unlocked_heroes || []);
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
      id: "runMaxFloorChart",
      build: (canvas) => {
        const runMaxFloor = toPairs(data.distributions.run_max_floor);
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
        const actions = toPairs(data.monetization.actions_by_type);
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
                  data.monetization.purchase_count,
                  data.monetization.stars_bought,
                  data.monetization.levels_bought,
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
