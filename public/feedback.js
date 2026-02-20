const numberFormat = new Intl.NumberFormat("en-US");

const CATEGORY_ORDER = ["bug", "balance", "idea", "other"];
const CATEGORY_LABELS = {
  bug: "Баги",
  balance: "Баланс",
  idea: "Идеи",
  other: "Другое",
};
const STATUS_LABELS = {
  new: "Новый",
  in_progress: "В работе",
  resolved: "Решен",
  rejected: "Отклонен",
};
const SOURCE_LABELS = {
  menu: "Меню",
  post_run: "После забега",
  profile: "Профиль",
  other: "Другое",
};

const state = {
  feedback: [],
  selectedType: "all",
  sort: "newest",
};

const setText = (id, value) => {
  const node = document.getElementById(id);
  if (node) {
    node.textContent = value;
  }
};

const parseDateValue = (value) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toTimestamp = (value) => parseDateValue(value)?.getTime() || 0;

const formatDateTime = (value) => {
  const parsed = parseDateValue(value);
  if (!parsed) return "-";
  const shifted = new Date(parsed.getTime() + 3 * 60 * 60 * 1000);
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const year = shifted.getUTCFullYear();
  const hours = String(shifted.getUTCHours()).padStart(2, "0");
  const minutes = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${day}.${month}.${year} ${hours}:${minutes} GMT+3`;
};

const formatUtcPlus3 = (value) => formatDateTime(value);

const normalizeCategory = (value) =>
  CATEGORY_ORDER.includes(value) ? value : "other";

const normalizeStatus = (value) =>
  Object.prototype.hasOwnProperty.call(STATUS_LABELS, value) ? value : "new";

const normalizeSource = (value) =>
  Object.prototype.hasOwnProperty.call(SOURCE_LABELS, value) ? value : "other";

const normalizeFeedback = (items) => {
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    const category = normalizeCategory(String(item?.category || "").toLowerCase());
    const status = normalizeStatus(String(item?.status || "").toLowerCase());
    const source = normalizeSource(String(item?.source || "").toLowerCase());
    const username = String(item?.username || "").trim();
    return {
      id: Number(item?.id) || 0,
      user_id: item?.user_id ?? null,
      telegram_id: item?.telegram_id ?? null,
      username: username || "unknown",
      category,
      message: String(item?.message || "").trim(),
      source,
      status,
      run_id: item?.run_id ?? null,
      admin_note: String(item?.admin_note || "").trim(),
      created_at: item?.created_at || null,
      updated_at: item?.updated_at || null,
    };
  });
};

const categoryOrderIndex = (category) => {
  const idx = CATEGORY_ORDER.indexOf(category);
  return idx >= 0 ? idx : CATEGORY_ORDER.length;
};

const sortFeedback = (items, mode) => {
  const sorted = [...items];
  if (mode === "oldest") {
    sorted.sort((a, b) => toTimestamp(a.created_at) - toTimestamp(b.created_at));
    return sorted;
  }
  if (mode === "type") {
    sorted.sort((a, b) => {
      const typeDelta = categoryOrderIndex(a.category) - categoryOrderIndex(b.category);
      if (typeDelta !== 0) return typeDelta;
      return toTimestamp(b.created_at) - toTimestamp(a.created_at);
    });
    return sorted;
  }
  sorted.sort((a, b) => toTimestamp(b.created_at) - toTimestamp(a.created_at));
  return sorted;
};

const buildTypeFilter = (items) => {
  const select = document.getElementById("feedbackTypeFilter");
  if (!select) return;

  const counts = Object.fromEntries(
    CATEGORY_ORDER.map((category) => [category, 0])
  );
  items.forEach((item) => {
    counts[item.category] = (counts[item.category] || 0) + 1;
  });

  select.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = `Все (${numberFormat.format(items.length)})`;
  select.appendChild(allOption);

  CATEGORY_ORDER.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = `${CATEGORY_LABELS[category]} (${numberFormat.format(
      counts[category]
    )})`;
    select.appendChild(option);
  });

  const canKeepSelection =
    state.selectedType === "all" ||
    CATEGORY_ORDER.includes(state.selectedType);
  select.value = canKeepSelection ? state.selectedType : "all";
};

const renderSummary = (items) => {
  const container = document.getElementById("feedbackSummary");
  if (!container) return;
  container.innerHTML = "";

  const counts = Object.fromEntries(
    CATEGORY_ORDER.map((category) => [category, 0])
  );
  items.forEach((item) => {
    counts[item.category] = (counts[item.category] || 0) + 1;
  });

  CATEGORY_ORDER.forEach((category) => {
    const card = document.createElement("div");
    card.className = "summary-card summary-card--muted";
    const title = document.createElement("h3");
    title.textContent = CATEGORY_LABELS[category];
    const value = document.createElement("p");
    value.textContent = numberFormat.format(counts[category]);
    card.appendChild(title);
    card.appendChild(value);
    container.appendChild(card);
  });
};

const createBadge = (text, className) => {
  const badge = document.createElement("span");
  badge.className = `feedback-badge ${className}`;
  badge.textContent = text;
  return badge;
};

const categoryBadgeClass = (category) => `feedback-badge--category-${category}`;
const statusBadgeClass = (status) => `feedback-badge--status-${status}`;

const renderFeedbackList = (items) => {
  const list = document.getElementById("feedbackList");
  if (!list) return;
  list.innerHTML = "";

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "run-card feedback-empty";
    empty.textContent = "Нет отзывов для выбранного фильтра.";
    list.appendChild(empty);
    return;
  }

  items.forEach((entry) => {
    const card = document.createElement("article");
    card.className = "run-card feedback-card";

    const top = document.createElement("div");
    top.className = "feedback-card__top";

    const badges = document.createElement("div");
    badges.className = "feedback-badges";
    badges.appendChild(
      createBadge(CATEGORY_LABELS[entry.category], categoryBadgeClass(entry.category))
    );
    badges.appendChild(
      createBadge(STATUS_LABELS[entry.status], statusBadgeClass(entry.status))
    );
    badges.appendChild(createBadge(SOURCE_LABELS[entry.source], "feedback-badge--source"));
    top.appendChild(badges);

    const createdAt = document.createElement("span");
    createdAt.className = "feedback-date";
    createdAt.textContent = formatDateTime(entry.created_at);
    top.appendChild(createdAt);

    const message = document.createElement("p");
    message.className = "feedback-message";
    message.textContent = entry.message || "(пустое сообщение)";

    const meta = document.createElement("div");
    meta.className = "feedback-meta";

    const feedbackId = document.createElement("span");
    feedbackId.textContent = `#${entry.id}`;
    meta.appendChild(feedbackId);

    const user = document.createElement("span");
    user.textContent = `Игрок: ${entry.username}`;
    meta.appendChild(user);

    if (entry.telegram_id) {
      const telegram = document.createElement("span");
      telegram.textContent = `TG: ${entry.telegram_id}`;
      meta.appendChild(telegram);
    }

    if (entry.run_id) {
      const run = document.createElement("span");
      run.textContent = `Забег: #${entry.run_id}`;
      meta.appendChild(run);
    }

    card.appendChild(top);
    card.appendChild(message);
    card.appendChild(meta);

    if (entry.admin_note) {
      const note = document.createElement("p");
      note.className = "feedback-note";
      note.textContent = `Примечание администратора: ${entry.admin_note}`;
      card.appendChild(note);
    }

    list.appendChild(card);
  });
};

const applyFilters = () => {
  const filtered =
    state.selectedType === "all"
      ? state.feedback
      : state.feedback.filter((entry) => entry.category === state.selectedType);
  const sorted = sortFeedback(filtered, state.sort);
  renderSummary(state.feedback);
  renderFeedbackList(sorted);
  setText("feedbackTotal", numberFormat.format(state.feedback.length));
};

const staggerReveal = () => {
  const items = document.querySelectorAll(".reveal");
  if (!items.length) return;
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting || entry.intersectionRatio > 0.01) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.01, rootMargin: "0px 0px -10% 0px" }
  );
  items.forEach((item) => observer.observe(item));
};

const loadData = async (forceReload = false) => {
  const suffix = forceReload ? `?ts=${Date.now()}` : "";
  const response = await fetch(`data/stats.json${suffix}`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const data = await response.json();
  state.feedback = normalizeFeedback(data.feedback);
  setText("feedbackGeneratedAt", formatUtcPlus3(data.generated_at));
  buildTypeFilter(state.feedback);
  applyFilters();
};

const init = () => {
  const typeSelect = document.getElementById("feedbackTypeFilter");
  if (typeSelect) {
    typeSelect.addEventListener("change", () => {
      state.selectedType = typeSelect.value || "all";
      applyFilters();
    });
  }

  const sortSelect = document.getElementById("feedbackSort");
  if (sortSelect) {
    sortSelect.addEventListener("change", () => {
      state.sort = sortSelect.value || "newest";
      applyFilters();
    });
  }

  const refreshButton = document.getElementById("feedbackRefresh");
  if (refreshButton) {
    refreshButton.addEventListener("click", () => {
      refreshButton.disabled = true;
      refreshButton.textContent = "Обновляем...";
      loadData(true)
        .catch((error) => {
          console.error("Failed to load feedback", error);
        })
        .finally(() => {
          refreshButton.disabled = false;
          refreshButton.textContent = "Обновить данные";
        });
    });
  }

  loadData(false).catch((error) => {
    console.error("Failed to load feedback", error);
    const list = document.getElementById("feedbackList");
    if (list) {
      list.innerHTML = "<div class=\"run-card feedback-empty\">Не удалось загрузить отзывы.</div>";
    }
  });

  staggerReveal();
};

init();
