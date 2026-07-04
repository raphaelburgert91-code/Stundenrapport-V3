(function () {
  "use strict";

  const PERSON_NAME = "Christiane Burgert";
  const START_YEAR = 2026;
  const START_WEEK = 27;
  const END_YEAR = Math.max(new Date().getFullYear() + 10, 2036);
  const WEEKLY_TARGET = 20.44;
  const DEFAULT_START_CARRY = 36.12;
  const STORAGE_KEY = "stundenrapport-christiane-burgert";
  const OLD_STORAGE_KEY = "stundenrapport-christiane-burgert-2026";
  const LAST_PERIOD_KEY = "stundenrapport-last-period";
  const OLD_LAST_WEEK_KEY = "stundenrapport-last-week";

  const categories = [
    "Gruppe vormittags",
    "Gruppe nachmittags",
    "Pädagogische Vor-/Nachbereitung",
    "Dienstbeginn/Entlassen/Raum richten",
    "Elternarbeit",
    "Dienstbesprechung"
  ];

  const dayNames = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"];
  const state = loadState();
  let selectedPeriod = getInitialPeriod();

  const weekSelect = document.getElementById("weekSelect");
  const weekRange = document.getElementById("weekRange");
  const weekTotal = document.getElementById("weekTotal");
  const weekBalance = document.getElementById("weekBalance");
  const carryBalance = document.getElementById("carryBalance");
  const startCarryInput = document.getElementById("startCarryInput");
  const weekBalanceCard = document.getElementById("weekBalanceCard");
  const carryBalanceCard = document.getElementById("carryBalanceCard");
  const dayCards = document.getElementById("dayCards");
  const report = document.getElementById("report");

  init();

  function init() {
    buildWeekOptions();
    bindTabs();
    document.getElementById("printButton").addEventListener("click", () => {
      showView("reportView");
      window.print();
    });
    document.getElementById("exportButton").addEventListener("click", exportCsv);
    document.getElementById("backupButton").addEventListener("click", exportBackup);
    document.getElementById("importInput").addEventListener("change", importBackup);
    startCarryInput.addEventListener("input", () => {
      const value = parseDecimal(startCarryInput.value);
      if (value === null) {
        return;
      }
      state.settings.startCarry = value;
      saveState();
      renderDashboard();
      renderReport();
    });

    weekSelect.addEventListener("change", () => {
      selectedPeriod = parsePeriodKey(weekSelect.value);
      localStorage.setItem(LAST_PERIOD_KEY, periodKey(selectedPeriod.year, selectedPeriod.week));
      ensureWeek(selectedPeriod.year, selectedPeriod.week);
      render();
    });

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("service-worker.js").catch(() => {});
    }

    ensureWeek(selectedPeriod.year, selectedPeriod.week);
    render();
  }

  function buildWeekOptions() {
    forEachPeriod((year, week) => {
      const option = document.createElement("option");
      const range = getWeekDates(year, week);
      option.value = periodKey(year, week);
      option.textContent = `${year} - KW ${week} (${formatShortDate(range[0])} - ${formatShortDate(range[4])})`;
      weekSelect.appendChild(option);
    });
    weekSelect.value = periodKey(selectedPeriod.year, selectedPeriod.week);
  }

  function bindTabs() {
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => showView(tab.dataset.view));
    });
  }

  function showView(viewId) {
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.view === viewId);
    });
    document.querySelectorAll(".view").forEach((view) => {
      view.classList.toggle("active", view.id === viewId);
    });
    if (viewId === "reportView") {
      renderReport();
    }
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && saved.weeks) {
        return normalizeState(saved);
      }
      const oldSaved = JSON.parse(localStorage.getItem(OLD_STORAGE_KEY));
      if (oldSaved && oldSaved.weeks) {
        return migrateOldState(oldSaved);
      }
    } catch (error) {
      console.warn("Gespeicherte Daten konnten nicht geladen werden.", error);
    }
    return normalizeState({ weeks: {} });
  }

  function migrateOldState(oldState) {
    const migrated = normalizeState({ weeks: {} });
    Object.keys(oldState.weeks).forEach((week) => {
      migrated.weeks[periodKey(START_YEAR, Number(week))] = oldState.weeks[week];
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    return migrated;
  }

  function normalizeState(savedState) {
    return {
      weeks: savedState.weeks || {},
      settings: {
        startCarry: Number.isFinite(savedState.settings?.startCarry)
          ? savedState.settings.startCarry
          : DEFAULT_START_CARRY
      }
    };
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function getInitialPeriod() {
    const savedPeriod = parsePeriodKey(localStorage.getItem(LAST_PERIOD_KEY));
    if (isAllowedPeriod(savedPeriod.year, savedPeriod.week)) {
      return savedPeriod;
    }

    const oldSavedWeek = Number(localStorage.getItem(OLD_LAST_WEEK_KEY));
    if (isAllowedPeriod(START_YEAR, oldSavedWeek)) {
      return { year: START_YEAR, week: oldSavedWeek };
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentWeek = getIsoWeek(now);
    if (isAllowedPeriod(currentYear, currentWeek)) {
      return { year: currentYear, week: currentWeek };
    }

    return { year: START_YEAR, week: START_WEEK };
  }

  function ensureWeek(year, week) {
    const key = periodKey(year, week);
    if (!state.weeks[key]) {
      state.weeks[key] = { days: {} };
    }

    const dates = getWeekDates(year, week);
    dayNames.forEach((dayName, index) => {
      const dayKey = getDateKey(dates[index]);
      if (!state.weeks[key].days[dayKey]) {
        state.weeks[key].days[dayKey] = {
          date: dayKey,
          weekday: dayName,
          entries: categories.map((category) => ({
            category,
            from: "",
            to: ""
          })),
          remark: ""
        };
      }
    });
    saveState();
  }

  function render() {
    ensureWeek(selectedPeriod.year, selectedPeriod.week);
    renderDashboard();
    renderEntryView();
    renderReport();
  }

  function renderDashboard() {
    const dates = getWeekDates(selectedPeriod.year, selectedPeriod.week);
    const total = getWeekTotal(selectedPeriod.year, selectedPeriod.week);
    const balance = roundHours(total - WEEKLY_TARGET);
    const carry = getCarryAfterWeek(selectedPeriod.year, selectedPeriod.week);

    weekRange.textContent = `${formatDate(dates[0])} - ${formatDate(dates[4])}`;
    weekTotal.textContent = formatHours(total);
    weekBalance.textContent = formatSignedHours(balance);
    if (document.activeElement !== startCarryInput) {
      startCarryInput.value = formatDecimal(getStartCarry());
    }
    carryBalance.textContent = formatSignedHours(carry);
    setBalanceClass(weekBalanceCard, balance);
    setBalanceClass(carryBalanceCard, carry);
  }

  function renderEntryView() {
    dayCards.innerHTML = "";
    getOrderedDays(selectedPeriod.year, selectedPeriod.week).forEach((day) => {
      const template = document.getElementById("dayTemplate").content.cloneNode(true);
      const card = template.querySelector(".day-card");
      const total = getDayTotal(day);
      card.classList.toggle("empty", total === 0 && !day.remark);
      card.classList.toggle("positive", total > 0);
      template.querySelector("h2").textContent = day.weekday;
      template.querySelector("p").textContent = formatDate(new Date(`${day.date}T00:00:00`));
      template.querySelector(".day-total").textContent = formatHours(total);

      const entries = template.querySelector(".entries");
      day.entries.forEach((entry, entryIndex) => {
        entries.appendChild(createEntryRow(day.date, entry, entryIndex));
      });

      const textarea = template.querySelector("textarea");
      textarea.value = day.remark || "";
      textarea.addEventListener("input", () => {
        day.remark = textarea.value;
        saveState();
        renderDashboard();
        renderReport();
      });

      dayCards.appendChild(template);
    });
  }

  function createEntryRow(dayKey, entry, entryIndex) {
    const row = document.createElement("div");
    row.className = "entry-row";

    const title = document.createElement("div");
    title.className = "entry-title";
    title.textContent = entry.category;

    const fromLabel = document.createElement("label");
    fromLabel.innerHTML = '<span class="time-label">Von</span>';
    const fromInput = document.createElement("input");
    fromInput.type = "time";
    fromInput.value = entry.from || "";
    fromInput.addEventListener("input", () => updateEntry(dayKey, entryIndex, "from", fromInput.value));
    fromLabel.appendChild(fromInput);

    const toLabel = document.createElement("label");
    toLabel.innerHTML = '<span class="time-label">Bis</span>';
    const toInput = document.createElement("input");
    toInput.type = "time";
    toInput.value = entry.to || "";
    toInput.addEventListener("input", () => updateEntry(dayKey, entryIndex, "to", toInput.value));
    toLabel.appendChild(toInput);

    const duration = document.createElement("div");
    duration.className = "duration";
    duration.textContent = formatHours(getEntryDuration(entry));

    row.append(title, fromLabel, toLabel, duration);
    return row;
  }

  function updateEntry(dayKey, entryIndex, field, value) {
    const day = state.weeks[periodKey(selectedPeriod.year, selectedPeriod.week)].days[dayKey];
    day.entries[entryIndex][field] = value;
    saveState();
    render();
  }

  function renderReport() {
    const dates = getWeekDates(selectedPeriod.year, selectedPeriod.week);
    const days = getOrderedDays(selectedPeriod.year, selectedPeriod.week);
    const rows = [];

    days.forEach((day) => {
      const activeEntries = day.entries.filter((entry) => entry.from || entry.to);
      if (activeEntries.length === 0 && !day.remark) {
        rows.push(reportRow(day, { category: "Keine Eingabe", from: "", to: "" }, true));
      } else {
        activeEntries.forEach((entry) => rows.push(reportRow(day, entry, false)));
        if (day.remark) {
          rows.push(`<tr><td>${escapeHtml(day.weekday)}<br>${formatDate(new Date(`${day.date}T00:00:00`))}</td><td>Bemerkungen</td><td colspan="3">${escapeHtml(day.remark)}</td></tr>`);
        }
      }
    });

    const total = getWeekTotal(selectedPeriod.year, selectedPeriod.week);
    const balance = roundHours(total - WEEKLY_TARGET);
    const carry = getCarryAfterWeek(selectedPeriod.year, selectedPeriod.week);

    report.innerHTML = `
      <div class="report-header">
        <div>
          <h2>Wochenrapport</h2>
          <strong>${PERSON_NAME}</strong>
        </div>
        <div>
          <strong>${selectedPeriod.year} - KW ${selectedPeriod.week}</strong><br>
          ${formatDate(dates[0])} - ${formatDate(dates[4])}
        </div>
      </div>
      <table class="report-table">
        <thead>
          <tr>
            <th>Tag</th>
            <th>Bereich</th>
            <th>Von</th>
            <th>Bis</th>
            <th>Dauer</th>
          </tr>
        </thead>
        <tbody>${rows.join("")}</tbody>
      </table>
      <div class="report-summary">
        <div><span>Wochensumme</span><strong>${formatHours(total)}</strong></div>
        <div><span>Sollstunden</span><strong>${formatHours(WEEKLY_TARGET)}</strong></div>
        <div><span>Plus / Minus</span><strong>${formatSignedHours(balance)}</strong></div>
        <div><span>Start-Übertrag</span><strong>${formatSignedHours(getStartCarry())}</strong></div>
        <div><span>Übertrag gesamt</span><strong>${formatSignedHours(carry)}</strong></div>
      </div>
    `;
  }

  function reportRow(day, entry, isEmpty) {
    const date = new Date(`${day.date}T00:00:00`);
    return `<tr>
      <td>${escapeHtml(day.weekday)}<br>${formatDate(date)}</td>
      <td>${escapeHtml(entry.category)}</td>
      <td>${escapeHtml(entry.from || "")}</td>
      <td>${escapeHtml(entry.to || "")}</td>
      <td>${isEmpty ? "-" : formatHours(getEntryDuration(entry))}</td>
    </tr>`;
  }

  function exportCsv() {
    const rows = [[
      "Datum",
      "Wochentag",
      "Kalenderwoche",
      "Kategorie",
      "Von-Zeit",
      "Bis-Zeit",
      "Dauer",
      "Bemerkung"
    ]];

    forEachPeriod((year, week) => {
      ensureWeek(year, week);
      getOrderedDays(year, week).forEach((day) => {
        day.entries.forEach((entry) => {
          if (entry.from || entry.to || day.remark) {
            rows.push([
              day.date,
              day.weekday,
              `${year} KW ${week}`,
              entry.category,
              entry.from,
              entry.to,
              formatDecimal(getEntryDuration(entry)),
              day.remark || ""
            ]);
          }
        });
      });
    });

    const csv = rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `stundenrapport-christiane-burgert-${selectedPeriod.year}-kw${selectedPeriod.week}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function exportBackup() {
    const backup = {
      app: "Arbeitsstunden",
      version: 1,
      exportedAt: new Date().toISOString(),
      data: state
    };
    downloadFile(
      `arbeitsstunden-backup-${getDateKey(new Date())}.json`,
      JSON.stringify(backup, null, 2),
      "application/json;charset=utf-8"
    );
  }

  function importBackup(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      try {
        const parsed = JSON.parse(String(reader.result || "{}"));
        const imported = normalizeState(parsed.data || parsed);
        if (!imported.weeks || typeof imported.weeks !== "object") {
          throw new Error("Backup enthalt keine Wochen.");
        }
        const ok = window.confirm("Backup laden und aktuelle Daten auf diesem Gerat ersetzen?");
        if (!ok) {
          event.target.value = "";
          return;
        }
        state.weeks = imported.weeks;
        state.settings = imported.settings;
        saveState();
        ensureWeek(selectedPeriod.year, selectedPeriod.week);
        render();
      } catch (error) {
        window.alert("Backup konnte nicht geladen werden.");
        console.error(error);
      } finally {
        event.target.value = "";
      }
    });
    reader.readAsText(file);
  }

  function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function getOrderedDays(year, week) {
    const days = state.weeks[periodKey(year, week)].days;
    return getWeekDates(year, week).map((date) => days[getDateKey(date)]);
  }

  function getWeekTotal(year, week) {
    return roundHours(getOrderedDays(year, week).reduce((sum, day) => sum + getDayTotal(day), 0));
  }

  function getDayTotal(day) {
    return roundHours(day.entries.reduce((sum, entry) => sum + getEntryDuration(entry), 0));
  }

  function getEntryDuration(entry) {
    if (!entry.from || !entry.to) {
      return 0;
    }
    const from = timeToMinutes(entry.from);
    const to = timeToMinutes(entry.to);
    if (to <= from) {
      return 0;
    }
    return roundHours((to - from) / 60);
  }

  function getCarryAfterWeek(targetYear, targetWeek) {
    let carry = getStartCarry();
    forEachPeriod((year, week) => {
      ensureWeek(year, week);
      carry = roundHours(carry + getWeekTotal(year, week) - WEEKLY_TARGET);
    }, targetYear, targetWeek);
    return carry;
  }

  function getStartCarry() {
    return Number.isFinite(state.settings.startCarry) ? state.settings.startCarry : DEFAULT_START_CARRY;
  }

  function getWeekDates(year, week) {
    const jan4 = new Date(year, 0, 4);
    const jan4Day = jan4.getDay() || 7;
    const mondayWeek1 = new Date(jan4);
    mondayWeek1.setDate(jan4.getDate() - jan4Day + 1);
    const monday = new Date(mondayWeek1);
    monday.setDate(mondayWeek1.getDate() + (week - 1) * 7);
    return [0, 1, 2, 3, 4].map((offset) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + offset);
      return date;
    });
  }

  function forEachPeriod(callback, stopYear = END_YEAR, stopWeek = getWeeksInYear(END_YEAR)) {
    for (let year = START_YEAR; year <= stopYear; year += 1) {
      const firstWeek = year === START_YEAR ? START_WEEK : 1;
      const lastWeek = Math.min(getWeeksInYear(year), year === stopYear ? stopWeek : getWeeksInYear(year));
      for (let week = firstWeek; week <= lastWeek; week += 1) {
        callback(year, week);
      }
    }
  }

  function getWeeksInYear(year) {
    return getIsoWeek(new Date(year, 11, 28));
  }

  function periodKey(year, week) {
    return `${year}-W${String(week).padStart(2, "0")}`;
  }

  function parsePeriodKey(value) {
    const match = String(value || "").match(/^(\d{4})-W(\d{1,2})$/);
    if (!match) {
      return { year: 0, week: 0 };
    }
    return { year: Number(match[1]), week: Number(match[2]) };
  }

  function isAllowedPeriod(year, week) {
    if (year < START_YEAR || year > END_YEAR) {
      return false;
    }
    if (year === START_YEAR && week < START_WEEK) {
      return false;
    }
    return week >= 1 && week <= getWeeksInYear(year);
  }

  function getIsoWeek(date) {
    const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = target.getUTCDay() || 7;
    target.setUTCDate(target.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
    return Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
  }

  function getDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatDate(date) {
    return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function formatShortDate(date) {
    return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
  }

  function formatHours(hours) {
    return `${formatDecimal(hours)} h`;
  }

  function formatSignedHours(hours) {
    const sign = hours > 0 ? "+" : "";
    return `${sign}${formatHours(hours)}`;
  }

  function formatDecimal(number) {
    return roundHours(number).toFixed(2).replace(".", ",");
  }

  function parseDecimal(value) {
    const normalized = String(value).trim().replace(",", ".");
    if (normalized === "" || normalized === "-" || normalized === "+") {
      return null;
    }
    const number = Number(normalized);
    return Number.isFinite(number) ? roundHours(number) : null;
  }

  function roundHours(number) {
    return Math.round((number + Number.EPSILON) * 100) / 100;
  }

  function timeToMinutes(value) {
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes;
  }

  function setBalanceClass(element, value) {
    element.classList.toggle("positive", value > 0);
    element.classList.toggle("negative", value < 0);
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function csvCell(value) {
    return `"${String(value).replaceAll('"', '""')}"`;
  }
})();
