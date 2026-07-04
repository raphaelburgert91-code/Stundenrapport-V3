(function () {
  "use strict";

  const START_YEAR = 2026;
  const START_WEEK = 27;
  const END_YEAR = Math.max(new Date().getFullYear() + 10, 2036);
  const DEFAULT_WEEKLY_TARGET = 20.44;
  const DEFAULT_START_CARRY = 36.12;
  const STORAGE_KEY = "stundenrapport-mama-v2";
  const OLD_STORAGE_KEY = "stundenrapport-christiane-burgert";
  const LAST_PERIOD_KEY = "stundenrapport-last-period";
  const LAST_DATE_KEY = "stundenrapport-last-date";
  const LAST_VIEW_KEY = "stundenrapport-last-view";
  const OLD_LAST_WEEK_KEY = "stundenrapport-last-week";

  const categories = [
    "Gruppe vormittags",
    "Gruppe nachmittags",
    "PÃ¤dagogische Vor-/Nachbereitung",
    "Dienstbeginn/Entlassen/Raum richten",
    "Elternarbeit",
    "Dienstbesprechung"
  ];

  const dayNames = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"];
  const state = loadState();
  let selectedPeriod = getInitialPeriod();
  let selectedDate = getInitialDate();
  let currentView = getInitialView();

  const weekSelect = document.getElementById("weekSelect");
  const dateInput = document.getElementById("dateInput");
  const nameInput = document.getElementById("nameInput");
  const settingsNameInput = document.getElementById("settingsNameInput");
  const weeklyTargetInput = document.getElementById("weeklyTargetInput");
  const startCarryInput = document.getElementById("startCarryInput");
  const settingsStartCarryInput = document.getElementById("settingsStartCarryInput");
  const settingsRegionInput = document.getElementById("settingsRegionInput");
  const settingsYearInput = document.getElementById("settingsYearInput");
  const weeklyTargetLabel = document.getElementById("weeklyTargetLabel");
  const weekRange = document.getElementById("weekRange");
  const weekTotal = document.getElementById("weekTotal");
  const weekBalance = document.getElementById("weekBalance");
  const carryBalance = document.getElementById("carryBalance");
  const weekBalanceCard = document.getElementById("weekBalanceCard");
  const carryBalanceCard = document.getElementById("carryBalanceCard");
  const dayCards = document.getElementById("dayCards");
  const monthSelect = document.getElementById("monthSelect");
  const yearSelect = document.getElementById("yearSelect");
  const yearlySelect = document.getElementById("yearlySelect");
  const monthSummary = document.getElementById("monthSummary");
  const monthlyTableBody = document.getElementById("monthlyTableBody");
  const yearlyTableBody = document.getElementById("yearlyTableBody");
  const report = document.getElementById("report");
  const reportNotice = document.getElementById("reportNotice");
  const appTitle = document.getElementById("appTitle");
  const appSubtitle = document.getElementById("appSubtitle");
  const externalBrowserMessage = "Diese Funktion bitte in Chrome oder Edge öffnen.";

  init();

  function init() {
    buildWeekOptions();
    buildYearOptions();
    bindTabs();
    document.getElementById("previewButton").addEventListener("click", () => {
      showView("reportView");
    });
    document.getElementById("printButton").addEventListener("click", () => {
      triggerPrint();
    });
    document.getElementById("savePdfButton").addEventListener("click", () => {
      triggerPrint();
    });
    document.getElementById("shareButton").addEventListener("click", shareReport);
    document.getElementById("exportButton").addEventListener("click", exportCsv);
    document.getElementById("backupButton").addEventListener("click", exportBackup);
    document.getElementById("importButton").addEventListener("click", openBackupPicker);
    document.getElementById("importInput").addEventListener("change", importBackup);
    document.getElementById("openWeekFromMonthButton").addEventListener("click", () => showView("entryView"));

    nameInput.addEventListener("input", () => {
      saveName(nameInput.value);
      render();
    });
    settingsNameInput.addEventListener("input", () => {
      saveName(settingsNameInput.value);
      render();
    });
    weeklyTargetInput.addEventListener("input", () => {
      const value = parseDecimal(weeklyTargetInput.value);
      if (value === null) {
        return;
      }
      state.settings.weeklyTarget = value;
      saveState();
      render();
    });
    const updateStartCarry = (valueInput) => {
      const value = parseDecimal(valueInput.value);
      if (value === null) {
        return;
      }
      state.settings.startCarry = value;
      saveState();
      render();
    };

    startCarryInput.addEventListener("input", () => updateStartCarry(startCarryInput));
    settingsStartCarryInput.addEventListener("input", () => updateStartCarry(settingsStartCarryInput));
    settingsRegionInput.addEventListener("change", () => {
      state.settings.region = settingsRegionInput.value;
      saveState();
      render();
    });
    settingsYearInput.addEventListener("change", () => {
      const value = Number.parseInt(settingsYearInput.value, 10);
      if (!Number.isFinite(value)) {
        return;
      }
      state.settings.year = value;
      saveState();
      render();
    });

    dateInput.addEventListener("change", () => {
      const dateValue = dateInput.value;
      if (!dateValue) {
        return;
      }
      setSelectedDate(dateValue, "entryView");
    });

    weekSelect.addEventListener("change", () => {
      const parsed = parsePeriodKey(weekSelect.value);
      selectedPeriod = parsed;
      selectedDate = getDateKey(getWeekDates(parsed.year, parsed.week)[0]);
      persistSelection();
      ensureWeek(selectedPeriod.year, selectedPeriod.week);
      showView("entryView");
    });

    monthSelect.addEventListener("change", () => {
      const month = Number.parseInt(monthSelect.value, 10);
      const year = Number.parseInt(yearSelect.value, 10);
      setSelectedDate(`${year}-${String(month).padStart(2, "0")}-01`, "monthlyView");
    });
    yearSelect.addEventListener("change", () => {
      const month = Number.parseInt(monthSelect.value, 10);
      const year = Number.parseInt(yearSelect.value, 10);
      setSelectedDate(`${year}-${String(month).padStart(2, "0")}-01`, "monthlyView");
    });
    yearlySelect.addEventListener("change", () => {
      const year = Number.parseInt(yearlySelect.value, 10);
      setSelectedDate(`${year}-01-01`, "yearlyView");
    });

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("service-worker.js").catch(() => {});
    }

    ensureWeek(selectedPeriod.year, selectedPeriod.week);
    showView(currentView);
  }

  function buildWeekOptions() {
    weekSelect.innerHTML = "";
    forEachPeriod((year, week) => {
      const option = document.createElement("option");
      const range = getWeekDates(year, week);
      option.value = periodKey(year, week);
      option.textContent = `${year} - KW ${week} (${formatShortDate(range[0])} - ${formatShortDate(range[4])})`;
      weekSelect.appendChild(option);
    });
    weekSelect.value = periodKey(selectedPeriod.year, selectedPeriod.week);
  }

  function buildYearOptions() {
    const years = Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, index) => START_YEAR + index);
    [yearSelect, yearlySelect].forEach((select) => {
      select.innerHTML = "";
      years.forEach((year) => {
        const option = document.createElement("option");
        option.value = String(year);
        option.textContent = String(year);
        select.appendChild(option);
      });
    });
    const selectedYear = getSelectedDateObject().getFullYear();
    yearSelect.value = String(selectedYear);
    yearlySelect.value = String(selectedYear);
    monthSelect.value = String(getSelectedDateObject().getMonth() + 1);
  }

  function bindTabs() {
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => showView(tab.dataset.view));
    });
  }

  function showView(viewId) {
    currentView = viewId;
    localStorage.setItem(LAST_VIEW_KEY, viewId);
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.view === viewId);
    });
    document.querySelectorAll(".view").forEach((view) => {
      view.classList.toggle("active", view.id === viewId);
    });
    render();
  }

  function showReportNotice(message) {
    reportNotice.textContent = message;
    reportNotice.hidden = false;
  }

  function clearReportNotice() {
    reportNotice.textContent = "";
    reportNotice.hidden = true;
  }

  function isLikelyEmbeddedBrowser() {
    const userAgent = navigator.userAgent || "";
    return /Electron|VSCode|Codex|wv\)/i.test(userAgent);
  }

  function showExternalBrowserHint(actionText) {
    const prefix = actionText ? `${actionText}: ` : "";
    showReportNotice(`${prefix}${externalBrowserMessage}`);
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
        name: typeof savedState.settings?.name === "string" ? savedState.settings.name : "",
        weeklyTarget: Number.isFinite(savedState.settings?.weeklyTarget)
          ? savedState.settings.weeklyTarget
          : DEFAULT_WEEKLY_TARGET,
        startCarry: Number.isFinite(savedState.settings?.startCarry)
          ? savedState.settings.startCarry
          : DEFAULT_START_CARRY,
        region: typeof savedState.settings?.region === "string" && savedState.settings.region
          ? savedState.settings.region
          : "Baden-WÃ¼rttemberg",
        year: Number.isFinite(savedState.settings?.year)
          ? savedState.settings.year
          : new Date().getFullYear()
      }
    };
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function saveName(value) {
    state.settings.name = String(value || "").trim();
    saveState();
  }

  function persistSelection() {
    localStorage.setItem(LAST_PERIOD_KEY, periodKey(selectedPeriod.year, selectedPeriod.week));
    localStorage.setItem(LAST_DATE_KEY, selectedDate);
    localStorage.setItem(LAST_VIEW_KEY, currentView);
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

  function getInitialDate() {
    const savedDate = localStorage.getItem(LAST_DATE_KEY);
    if (savedDate && /^\d{4}-\d{2}-\d{2}$/.test(savedDate)) {
      return savedDate;
    }
    return getDateKey(new Date());
  }

  function getInitialView() {
    return localStorage.getItem(LAST_VIEW_KEY) || "entryView";
  }

  function setSelectedDate(dateValue, viewId) {
    const parsedDate = new Date(`${dateValue}T00:00:00`);
    if (Number.isNaN(parsedDate.getTime())) {
      return;
    }
    selectedDate = getDateKey(parsedDate);
    const weekInfo = getIsoWeekInfo(parsedDate);
    selectedPeriod = { year: weekInfo.year, week: weekInfo.week };
    persistSelection();
    if (viewId) {
      showView(viewId);
    } else {
      render();
    }
  }

  function ensureWeek(year, week) {
    const key = periodKey(year, week);
    let changed = false;
    if (!state.weeks[key]) {
      state.weeks[key] = { days: {} };
      changed = true;
    }

    const dates = getWeekDates(year, week);
    dayNames.forEach((dayName, index) => {
      const dayKey = getDateKey(dates[index]);
      if (!state.weeks[key].days[dayKey]) {
        state.weeks[key].days[dayKey] = {
          date: dayKey,
          weekday: dayName,
          dayType: "workday",
          allowHolidayWork: false,
          entries: categories.map((category) => ({
            category,
            from: "",
            to: ""
          })),
          remark: ""
        };
        changed = true;
      }
    });
    if (changed) {
      saveState();
    }
  }

  function render() {
    ensureWeek(selectedPeriod.year, selectedPeriod.week);
    updateControls();
    renderDashboard();
    renderEntryView();
    renderMonthlyOverview();
    renderYearlyOverview();
    renderReport();
  }

  function updateControls() {
    const selectedDateObject = getSelectedDateObject();
    const selectedYear = selectedDateObject.getFullYear();
    const selectedMonth = selectedDateObject.getMonth() + 1;

    nameInput.value = getDisplayName();
    settingsNameInput.value = getDisplayName();
    weeklyTargetInput.value = formatDecimal(getWeeklyTarget());
    settingsStartCarryInput.value = formatDecimal(getStartCarry());
    startCarryInput.value = formatDecimal(getStartCarry());
    settingsRegionInput.value = getSettingsRegion();
    settingsYearInput.value = String(getSettingsYear());
    weeklyTargetLabel.textContent = formatHours(getWeekTarget(selectedPeriod.year, selectedPeriod.week));
    dateInput.value = selectedDate;
    weekSelect.value = periodKey(selectedPeriod.year, selectedPeriod.week);
    monthSelect.value = String(selectedMonth);
    yearSelect.value = String(selectedYear);
    yearlySelect.value = String(selectedYear);
    appTitle.textContent = getDisplayName() || "Arbeitsstunden";
    appSubtitle.textContent = getDisplayName() ? "Arbeitszeiterfassung" : "Arbeitszeiterfassung";
  }

  function renderDashboard() {
    const dates = getWeekDates(selectedPeriod.year, selectedPeriod.week);
    const total = getWeekTotal(selectedPeriod.year, selectedPeriod.week);
    const target = getWeekTarget(selectedPeriod.year, selectedPeriod.week);
    const balance = roundHours(total - target);
    const carry = getCarryAfterWeek(selectedPeriod.year, selectedPeriod.week);

    weekRange.textContent = `${formatDate(dates[0])} - ${formatDate(dates[4])}`;
    weekTotal.textContent = formatHours(total);
    weekBalance.textContent = formatSignedHours(balance);
    if (document.activeElement !== startCarryInput && document.activeElement !== settingsStartCarryInput) {
      startCarryInput.value = formatDecimal(getStartCarry());
      settingsStartCarryInput.value = formatDecimal(getStartCarry());
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
      const dayDate = new Date(`${day.date}T00:00:00`);
      const total = getDayTotal(day);
      const holidayDate = isHoliday(dayDate);
      const isReadOnlyDay = day.dayType !== "workday" || (holidayDate && !day.allowHolidayWork);
      card.classList.toggle("empty", total === 0 && !day.remark);
      card.classList.toggle("positive", total > 0);
      card.classList.toggle("vacation", day.dayType === "vacation");
      card.classList.toggle("illness", day.dayType === "illness");
      card.classList.toggle("free", day.dayType === "free");
      card.classList.toggle("holiday", holidayDate);
      template.querySelector("h2").textContent = day.weekday;
      template.querySelector("p").textContent = formatDate(dayDate);
      template.querySelector(".day-total").textContent = formatHours(total);
      const statusLabel = holidayDate ? "Feiertag" : getDayTypeLabel(day);
      template.querySelector(".day-status-pill").textContent = statusLabel;
      template.querySelector(".day-target-pill").textContent = `Soll: ${formatHours(getDayTarget(day))}`;
      const typeSelect = template.querySelector(".day-type-select");
      typeSelect.value = day.dayType || "workday";
      typeSelect.addEventListener("change", () => {
        day.dayType = typeSelect.value;
        day.allowHolidayWork = false;
        saveState();
        render();
      });
      const holidayButton = template.querySelector(".holiday-button");
      holidayButton.classList.toggle("active", Boolean(day.allowHolidayWork));
      holidayButton.textContent = holidayDate && day.allowHolidayWork ? "Arbeitszeit wird erfasst" : "Trotz Feiertag Arbeitszeit erfassen";
      holidayButton.addEventListener("click", () => {
        day.allowHolidayWork = !day.allowHolidayWork;
        saveState();
        render();
      });
      holidayButton.style.display = holidayDate ? "inline-flex" : "none";
      typeSelect.disabled = holidayDate && !day.allowHolidayWork;
      const entries = template.querySelector(".entries");
      entries.classList.toggle("disabled", isReadOnlyDay);
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
    row.dataset.dayKey = dayKey;
    row.dataset.entryIndex = entryIndex;

    const title = document.createElement("div");
    title.className = "entry-title";
    title.textContent = entry.category;

    const day = state.weeks[periodKey(selectedPeriod.year, selectedPeriod.week)].days[dayKey];
    const isHolidayLocked = isHoliday(new Date(`${dayKey}T00:00:00`)) && !day.allowHolidayWork && day.dayType === "workday";
    const isReadOnly = day.dayType !== "workday" || isHolidayLocked;

    const fromLabel = document.createElement("label");
    fromLabel.innerHTML = '<span class="time-label">Von</span>';
    fromLabel.appendChild(createTimeInput(dayKey, entryIndex, "from", entry.from || "", isReadOnly));

    const toLabel = document.createElement("label");
    toLabel.innerHTML = '<span class="time-label">Bis</span>';
    toLabel.appendChild(createTimeInput(dayKey, entryIndex, "to", entry.to || "", isReadOnly));

    const duration = document.createElement("div");
    duration.className = "duration";
    duration.textContent = formatHours(getEntryDuration(entry));

    row.append(title, fromLabel, toLabel, duration);
    return row;
  }

  function createTimeInput(dayKey, entryIndex, field, initialValue, isReadOnly) {
    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "numeric";
    input.maxLength = 5;
    input.placeholder = "HH:MM";
    input.autocomplete = "off";
    input.disabled = isReadOnly;
    input.className = "time-input";

    let lastCommittedValue = initialValue || "";
    input.value = formatTimeValue(initialValue || "");

    const updateVisualState = (value) => {
      const parsed = parseTimeInput(value);
      input.classList.toggle("invalid", Boolean(parsed.error));
      input.setAttribute("aria-invalid", parsed.error ? "true" : "false");
      input.title = parsed.error || "";
      input.value = parsed.display;
      if (parsed.error && !parsed.complete) {
        input.classList.add("invalid");
      }
    };

    input.addEventListener("focus", () => {
      if (input.value) {
        input.setSelectionRange(0, input.value.length);
      }
    });

    input.addEventListener("input", () => {
      const parsed = parseTimeInput(input.value);
      updateVisualState(parsed.rawValue);
      if (parsed.valid && parsed.complete) {
        lastCommittedValue = parsed.value;
        updateEntry(dayKey, entryIndex, field, parsed.value);
      }
    });

    input.addEventListener("blur", () => {
      const parsed = finalizeTimeInput(input.value, lastCommittedValue);
      const nextValue = parsed.value || lastCommittedValue || "";
      input.value = nextValue ? formatTimeValue(nextValue) : "";
      if (nextValue) {
        updateEntry(dayKey, entryIndex, field, nextValue);
      }
      updateVisualState(input.value);
    });

    return input;
  }

  function updateEntry(dayKey, entryIndex, field, value) {
    const day = state.weeks[periodKey(selectedPeriod.year, selectedPeriod.week)].days[dayKey];
    day.entries[entryIndex][field] = value;
    saveState();
    window.requestAnimationFrame(() => {
      renderDashboard();
      renderReport();
      updateEntryRow(dayKey, entryIndex);
    });
  }

  function updateEntryRow(dayKey, entryIndex) {
    const row = dayCards.querySelector(`[data-day-key="${dayKey}"][data-entry-index="${entryIndex}"]`);
    if (!row) {
      return;
    }
    const day = state.weeks[periodKey(selectedPeriod.year, selectedPeriod.week)].days[dayKey];
    const entry = day.entries[entryIndex];
    row.querySelector(".duration").textContent = formatHours(getEntryDuration(entry));
    const card = row.closest(".day-card");
    if (card) {
      const total = getDayTotal(day);
      card.classList.toggle("empty", total === 0 && !day.remark);
      card.classList.toggle("positive", total > 0);
      card.querySelector(".day-total").textContent = formatHours(total);
    }
  }

  function renderMonthlyOverview() {
    const year = Number.parseInt(yearSelect.value || String(getSelectedDateObject().getFullYear()), 10);
    const month = Number.parseInt(monthSelect.value || String(getSelectedDateObject().getMonth() + 1), 10);
    const periods = getPeriodsForMonth(year, month);
    const days = periods.flatMap((period) => getOrderedDays(period.year, period.week));
    const total = periods.reduce((sum, period) => sum + getWeekTotal(period.year, period.week), 0);
    const summary = getDayTypeSummary(days);
    const target = roundHours(days.reduce((sum, day) => sum + getDayTarget(day), 0));
    const balance = roundHours(total - target);
    const carry = periods.length > 0 ? getCarryAfterWeek(periods[periods.length - 1].year, periods[periods.length - 1].week) : getStartCarry();

    monthSummary.innerHTML = `
      <article class="summary-card">
        <span>Monat</span>
        <strong>${month.toString().padStart(2, "0")}/${year}</strong>
      </article>
      <article class="summary-card">
        <span>Arbeitstage</span>
        <strong>${summary.workday}</strong>
      </article>
      <article class="summary-card">
        <span>Urlaubstage</span>
        <strong>${summary.vacation}</strong>
      </article>
      <article class="summary-card">
        <span>Krankheitstage</span>
        <strong>${summary.illness}</strong>
      </article>
      <article class="summary-card">
        <span>Feiertage</span>
        <strong>${summary.holiday}</strong>
      </article>
      <article class="summary-card">
        <span>Freie Tage</span>
        <strong>${summary.free}</strong>
      </article>
      <article class="summary-card">
        <span>Ist-Stunden</span>
        <strong>${formatHours(total)}</strong>
      </article>
      <article class="summary-card">
        <span>Sollstunden</span>
        <strong>${formatHours(target)}</strong>
      </article>
      <article class="summary-card">
        <span>Plus / Minus</span>
        <strong>${formatSignedHours(balance)}</strong>
      </article>
      <article class="summary-card">
        <span>Ãœbertrag</span>
        <strong>${formatSignedHours(carry)}</strong>
      </article>
    `;

    monthlyTableBody.innerHTML = periods.length === 0
      ? '<tr><td colspan="6">Keine Wochen gefunden.</td></tr>'
      : periods.map((period) => {
          const dates = getWeekDates(period.year, period.week);
          const weekTotalValue = getWeekTotal(period.year, period.week);
          const weekTargetValue = getWeekTarget(period.year, period.week);
          const weekBalanceValue = roundHours(weekTotalValue - weekTargetValue);
          const weekCarry = getCarryAfterWeek(period.year, period.week);
          return `
            <tr>
              <td>${period.year} - KW ${period.week}</td>
              <td>${formatShortDate(dates[0])} - ${formatShortDate(dates[4])}</td>
              <td>${formatHours(weekTotalValue)}</td>
              <td>${formatHours(weekTargetValue)}</td>
              <td>${formatSignedHours(weekBalanceValue)}</td>
              <td>${formatSignedHours(weekCarry)}</td>
            </tr>`;
        }).join("");
  }

  function renderYearlyOverview() {
    const year = Number.parseInt(yearlySelect.value || String(getSelectedDateObject().getFullYear()), 10);
    const items = [];
    let totalHours = 0;
    let totalTarget = 0;
    let totalBalance = 0;
    let totalWorkdays = 0;
    let totalVacation = 0;
    let totalIllness = 0;
    let totalHoliday = 0;
    let totalFree = 0;

    for (let month = 1; month <= 12; month += 1) {
      const periods = getPeriodsForMonth(year, month);
      const days = periods.flatMap((period) => getOrderedDays(period.year, period.week));
      const monthSummaryStats = getDayTypeSummary(days);
      const monthTotal = periods.reduce((sum, period) => sum + getWeekTotal(period.year, period.week), 0);
      const monthTarget = roundHours(days.reduce((sum, day) => sum + getDayTarget(day), 0));
      const monthBalance = roundHours(monthTotal - monthTarget);
      totalHours += monthTotal;
      totalTarget += monthTarget;
      totalBalance += monthBalance;
      totalWorkdays += monthSummaryStats.workday;
      totalVacation += monthSummaryStats.vacation;
      totalIllness += monthSummaryStats.illness;
      totalHoliday += monthSummaryStats.holiday;
      totalFree += monthSummaryStats.free;
      items.push(`
        <tr>
          <td>${month.toString().padStart(2, "0")}/${year}</td>
          <td>${monthSummaryStats.workday}</td>
          <td>${monthSummaryStats.vacation}</td>
          <td>${monthSummaryStats.illness}</td>
          <td>${monthSummaryStats.holiday}</td>
          <td>${monthSummaryStats.free}</td>
          <td>${formatHours(monthTotal)}</td>
          <td>${formatHours(monthTarget)}</td>
          <td>${formatSignedHours(monthBalance)}</td>
        </tr>`);
    }

    const yearCarry = getCarryAfterWeek(year, getWeeksInYear(year));
    yearlyTableBody.innerHTML = `
      ${items.join("")}
      <tr class="table-total">
        <td>Gesamt</td>
        <td>${totalWorkdays}</td>
        <td>${totalVacation}</td>
        <td>${totalIllness}</td>
        <td>${totalHoliday}</td>
        <td>${totalFree}</td>
        <td>${formatHours(totalHours)}</td>
        <td>${formatHours(totalTarget)}</td>
        <td>${formatSignedHours(totalBalance)}</td>
      </tr>
    `;

    const summary = document.getElementById("yearlySummary");
    if (summary) {
      summary.innerHTML = `
        <article class="summary-card">
          <span>Arbeitstage</span>
          <strong>${totalWorkdays}</strong>
        </article>
        <article class="summary-card">
          <span>Urlaubstage</span>
          <strong>${totalVacation}</strong>
        </article>
        <article class="summary-card">
          <span>Krankheitstage</span>
          <strong>${totalIllness}</strong>
        </article>
        <article class="summary-card">
          <span>Feiertage</span>
          <strong>${totalHoliday}</strong>
        </article>
        <article class="summary-card">
          <span>Freie Tage</span>
          <strong>${totalFree}</strong>
        </article>
        <article class="summary-card">
          <span>Gesamtstunden</span>
          <strong>${formatHours(totalHours)}</strong>
        </article>
        <article class="summary-card">
          <span>Sollstunden</span>
          <strong>${formatHours(totalTarget)}</strong>
        </article>
        <article class="summary-card">
          <span>Plus / Minus</span>
          <strong>${formatSignedHours(totalBalance)}</strong>
        </article>
      `;
    }
  }

  function shareReport() {
    clearReportNotice();
    showView("reportView");
    const reportTitle = `Wochenrapport ${getDisplayName() || "Arbeitsstunden"} ${selectedPeriod.year} KW ${selectedPeriod.week}`;
    const shareData = {
      title: reportTitle,
      text: reportTitle,
      url: window.location.href
    };

    if (typeof navigator.share === "function") {
      navigator.share(shareData).then(() => {
        clearReportNotice();
      }).catch((error) => {
        if (error && error.name !== "AbortError") {
          console.warn("Teilen fehlgeschlagen.", error);
          showExternalBrowserHint("Teilen fehlgeschlagen");
        }
      });
      return;
    }

    const fallbackText = `${reportTitle}\n${window.location.href}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(fallbackText).then(() => {
        showReportNotice("Rapport-Text wurde in die Zwischenablage kopiert.");
      }).catch(() => {
        showExternalBrowserHint("Teilen wird hier nicht unterstützt");
      });
      return;
    }

    showExternalBrowserHint("Teilen wird hier nicht unterstützt");
  }

  function renderReport() {
    const dates = getWeekDates(selectedPeriod.year, selectedPeriod.week);
    const days = getOrderedDays(selectedPeriod.year, selectedPeriod.week);
    const rows = days.map((day) => reportDayRow(day));

    const total = getWeekTotal(selectedPeriod.year, selectedPeriod.week);
    const target = getWeekTarget(selectedPeriod.year, selectedPeriod.week);
    const balance = roundHours(total - target);
    const carry = getCarryAfterWeek(selectedPeriod.year, selectedPeriod.week);

    report.innerHTML = `
      <div class="report-header">
        <div>
          <h2>Wochenrapport</h2>
          <strong>${getDisplayName() || "Name"}</strong>
        </div>
        <div>
          <strong>${selectedPeriod.year} - KW ${selectedPeriod.week}</strong><br>
          ${formatDate(dates[0])} - ${formatDate(dates[4])}
        </div>
      </div>
      <table class="report-table">
        <thead>
          <tr>
            <th>Datum</th>
            <th>Wochentag</th>
            <th>Tagesart</th>
            <th>Arbeitszeiten</th>
            <th>Tagesstunden</th>
            <th>Bemerkung</th>
          </tr>
        </thead>
        <tbody>${rows.join("")}</tbody>
      </table>
      <div class="report-summary">
        <div><span>Wochensumme</span><strong>${formatHours(total)}</strong></div>
        <div><span>Sollstunden</span><strong>${formatHours(target)}</strong></div>
        <div><span>Plus / Minus</span><strong>${formatSignedHours(balance)}</strong></div>
        <div><span>Start-Ãœbertrag</span><strong>${formatSignedHours(getStartCarry())}</strong></div>
        <div><span>Ãœbertrag gesamt</span><strong>${formatSignedHours(carry)}</strong></div>
      </div>
    `;
  }

  function reportDayRow(day) {
    const date = new Date(`${day.date}T00:00:00`);
    const dayType = getDayTypeLabel(day);
    const holidayDate = isHoliday(date);
    const dayLabel = holidayDate ? `${dayType} Â· Feiertag` : dayType;
    const timeEntries = day.entries
      .filter((entry) => entry.from || entry.to)
      .map((entry) => `${entry.category}: ${entry.from || "-"} - ${entry.to || "-"}`);
    const timesText = timeEntries.length > 0 ? timeEntries.join("<br>") : "â€”";
    const remark = day.remark ? escapeHtml(day.remark) : "â€”";
    return `<tr>
      <td>${escapeHtml(formatDate(date))}</td>
      <td>${escapeHtml(day.weekday)}</td>
      <td>${escapeHtml(dayLabel)}</td>
      <td>${timesText}</td>
      <td>${formatHours(getDayTotal(day))}</td>
      <td>${remark}</td>
    </tr>`;
  }

  function exportCsv() {
    clearReportNotice();
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
    downloadFile(
      `stundenrapport-${sanitizeFilename(getDisplayName() || "arbeitsstunden")}-${selectedPeriod.year}-kw${selectedPeriod.week}.csv`,
      "\ufeff" + csv,
      "text/csv;charset=utf-8",
      "CSV-Export"
    );
  }

  function exportBackup() {
    clearReportNotice();
    const backup = {
      app: "Arbeitsstunden",
      version: 1,
      exportedAt: new Date().toISOString(),
      data: state
    };
    downloadFile(
      `arbeitsstunden-backup-${getDateKey(new Date())}.json`,
      JSON.stringify(backup, null, 2),
      "application/json;charset=utf-8",
      "Backup speichern"
    );
  }

  function openBackupPicker() {
    clearReportNotice();
    try {
      document.getElementById("importInput").click();
      if (isLikelyEmbeddedBrowser()) {
        showExternalBrowserHint("Falls keine Dateiauswahl erscheint");
      }
    } catch (error) {
      console.warn("Dateiauswahl konnte nicht geöffnet werden.", error);
      showExternalBrowserHint("Backup laden fehlgeschlagen");
    }
  }

  function importBackup(event) {
    clearReportNotice();
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
        const ok = window.confirm("Backup laden und aktuelle Daten auf diesem GerÃ¤t ersetzen?");
        if (!ok) {
          event.target.value = "";
          return;
        }
        state.weeks = imported.weeks;
        state.settings = imported.settings;
        saveState();
        ensureWeek(selectedPeriod.year, selectedPeriod.week);
        render();
        showReportNotice("Backup wurde geladen.");
      } catch (error) {
        showReportNotice("Backup konnte nicht geladen werden.");
        console.error(error);
      } finally {
        event.target.value = "";
      }
    });
    reader.readAsText(file);
  }

  function downloadFile(filename, content, type, actionText) {
    if (!("download" in HTMLAnchorElement.prototype)) {
      showExternalBrowserHint(`${actionText} nicht unterstützt`);
      return;
    }

    let url = "";
    try {
      const blob = new Blob([content], { type });
      url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.rel = "noopener";
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
      showReportNotice(`${actionText} wurde gestartet. Falls kein Download erscheint: ${externalBrowserMessage}`);
    } catch (error) {
      console.warn(`${actionText} fehlgeschlagen.`, error);
      showExternalBrowserHint(`${actionText} fehlgeschlagen`);
    } finally {
      if (url) {
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    }
  }

  function getOrderedDays(year, week) {
    ensureWeek(year, week);
    const days = state.weeks[periodKey(year, week)].days;
    return getWeekDates(year, week).map((date) => days[getDateKey(date)]);
  }

  function getWeekTotal(year, week) {
    return roundHours(getOrderedDays(year, week).reduce((sum, day) => sum + getDayTotal(day), 0));
  }

  function getWeekTarget(year, week) {
    return roundHours(getOrderedDays(year, week).reduce((sum, day) => sum + getDayTarget(day), 0));
  }

  function getDayTotal(day) {
    const dayType = day.dayType || "workday";
    if (dayType === "free") {
      return 0;
    }
    if (dayType === "vacation" || dayType === "illness") {
      return getDayTarget(day);
    }
    const holiday = isHoliday(new Date(`${day.date}T00:00:00`));
    if (holiday && !day.allowHolidayWork) {
      return 0;
    }
    return roundHours(day.entries.reduce((sum, entry) => sum + getEntryDuration(entry), 0));
  }

  function getDayTarget(day) {
    const dayType = day.dayType || "workday";
    if (dayType === "free") {
      return 0;
    }
    if (dayType === "vacation" || dayType === "illness") {
      return roundHours(getWeeklyTarget() / 5);
    }
    const holiday = isHoliday(new Date(`${day.date}T00:00:00`));
    if (holiday && !day.allowHolidayWork) {
      return 0;
    }
    return roundHours(getWeeklyTarget() / 5);
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
      carry = roundHours(carry + getWeekTotal(year, week) - getWeekTarget(year, week));
    }, targetYear, targetWeek);
    return carry;
  }

  function getWeeklyTarget() {
    return Number.isFinite(state.settings.weeklyTarget) ? state.settings.weeklyTarget : DEFAULT_WEEKLY_TARGET;
  }

  function getSettingsRegion() {
    return typeof state.settings.region === "string" && state.settings.region ? state.settings.region : "Baden-WÃ¼rttemberg";
  }

  function getDayTypeSummary(days) {
    return days.reduce((summary, day) => {
      const dayType = day.dayType || "workday";
      if (dayType === "vacation") {
        summary.vacation += 1;
      } else if (dayType === "illness") {
        summary.illness += 1;
      } else if (dayType === "free") {
        summary.free += 1;
      } else {
        summary.workday += 1;
      }
      if (isHoliday(new Date(`${day.date}T00:00:00`))) {
        summary.holiday += 1;
      }
      return summary;
    }, { workday: 0, vacation: 0, illness: 0, free: 0, holiday: 0 });
  }

  function getStartCarry() {
    return Number.isFinite(state.settings.startCarry) ? state.settings.startCarry : DEFAULT_START_CARRY;
  }

  function getSettingsYear() {
    return Number.isFinite(state.settings.year) ? state.settings.year : new Date().getFullYear();
  }

  function getDisplayName() {
    return state.settings.name || "";
  }

  function getSelectedDateObject() {
    const parsed = new Date(`${selectedDate}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  function getPeriodsForMonth(year, month) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);
    const seen = new Set();
    const periods = [];
    const cursor = new Date(start);

    while (cursor <= end) {
      const info = getIsoWeekInfo(cursor);
      const key = periodKey(info.year, info.week);
      if (!seen.has(key)) {
        seen.add(key);
        periods.push(info);
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    return periods.sort((left, right) => {
      if (left.year !== right.year) {
        return left.year - right.year;
      }
      return left.week - right.week;
    });
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
    return getIsoWeekInfo(date).week;
  }

  function getIsoWeekInfo(date) {
    const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = target.getUTCDay() || 7;
    target.setUTCDate(target.getUTCDate() + 4 - day);
    const year = target.getUTCFullYear();
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const week = Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
    return { year, week };
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
    const normalized = formatTimeValue(value);
    if (!normalized) {
      return 0;
    }
    const [hours, minutes] = normalized.split(":").map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
      return 0;
    }
    return hours * 60 + minutes;
  }

  function formatTimeValue(value) {
    const parsed = parseTimeInput(value);
    return parsed.display;
  }

  function parseTimeInput(value) {
    const rawValue = String(value || "").trim();
    if (!rawValue) {
      return { rawValue, display: "", value: "", valid: false, complete: false, error: "" };
    }

    const sanitized = rawValue.replace(/[^\d:]/g, "");
    if (!sanitized) {
      return { rawValue, display: "", value: "", valid: false, complete: false, error: "" };
    }

    if (sanitized.includes(":")) {
      const [hoursPart, minutesPart] = sanitized.split(":", 2);
      const hours = String(hoursPart || "").replace(/\D/g, "");
      const minutes = String(minutesPart || "").replace(/\D/g, "");
      if (!hours || !minutes) {
        return { rawValue, display: sanitized, value: "", valid: false, complete: false, error: "" };
      }
      return parseTimeParts(hours, minutes, sanitized);
    }

    const digits = sanitized.replace(/:/g, "");
    if (digits.length <= 2) {
      return { rawValue, display: digits, value: "", valid: false, complete: false, error: "" };
    }
    if (digits.length === 3) {
      const hours = digits.slice(0, 1).padStart(2, "0");
      const minutes = digits.slice(1, 3).padStart(2, "0");
      const parsed = parseTimeParts(hours, minutes, `${hours}:${minutes}`);
      if (parsed.valid) {
        return parsed;
      }
      return { rawValue, display: digits, value: "", valid: false, complete: false, error: "" };
    }
    if (digits.length >= 4) {
      const hours = digits.slice(0, 2);
      const minutes = digits.slice(2, 4);
      return parseTimeParts(hours, minutes, `${hours}:${minutes}`);
    }
    return { rawValue, display: digits, value: "", valid: false, complete: false, error: "" };
  }

  function parseTimeParts(hours, minutes, displayValue) {
    const paddedHours = String(hours).padStart(2, "0");
    const paddedMinutes = String(minutes).padStart(2, "0");
    const valid = /^([01]\d|2[0-3]):([0-5]\d)$/.test(`${paddedHours}:${paddedMinutes}`);
    if (!valid) {
      return {
        rawValue: displayValue,
        display: displayValue,
        value: "",
        valid: false,
        complete: true,
        error: "Bitte eine Uhrzeit zwischen 00:00 und 23:59 eingeben."
      };
    }
    return {
      rawValue: displayValue,
      display: `${paddedHours}:${paddedMinutes}`,
      value: `${paddedHours}:${paddedMinutes}`,
      valid: true,
      complete: true,
      error: ""
    };
  }

  function finalizeTimeInput(value, fallbackValue) {
    const parsed = parseTimeInput(value);
    if (parsed.valid && parsed.complete) {
      return parsed;
    }
    if (!parsed.display) {
      return { rawValue: value, display: "", value: "", valid: false, complete: false, error: "" };
    }

    const digits = String(parsed.display || "").replace(/:/g, "");
    if (digits.length === 1) {
      const hours = digits.padStart(2, "0");
      return parseTimeParts(hours, "00", `${hours}:00`);
    }
    if (digits.length === 2) {
      const hours = digits.padStart(2, "0");
      return parseTimeParts(hours, "00", `${hours}:00`);
    }
    if (digits.length === 3) {
      const hours = digits.slice(0, 1).padStart(2, "0");
      const minutes = digits.slice(1, 3).padStart(2, "0");
      const parsed = parseTimeParts(hours, minutes, `${hours}:${minutes}`);
      if (parsed.valid) {
        return parsed;
      }
      return { rawValue: value, display: digits, value: "", valid: false, complete: false, error: "" };
    }

    if (fallbackValue) {
      return parseTimeInput(fallbackValue);
    }
    return { rawValue: value, display: "", value: "", valid: false, complete: false, error: "" };
  }

  function setBalanceClass(element, value) {
    element.classList.toggle("positive", value > 0);
    element.classList.toggle("negative", value < 0);
  }

  function getDayTypeLabel(day) {
    const dayType = day.dayType || "workday";
    const map = {
      workday: "Arbeitstag",
      vacation: "Urlaub",
      illness: "Krankheit",
      free: "Frei"
    };
    return map[dayType] || "Arbeitstag";
  }

  function isHoliday(date) {
    const key = getDateKey(date);
    const year = date.getFullYear();
    const easter = getEasterSunday(year);
    const holidays = new Set();
    const add = (value) => holidays.add(getDateKey(value));

    add(new Date(year, 0, 1));
    add(new Date(year, 0, 6));
    add(new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() - 2));
    add(new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() + 1));
    add(new Date(year, 4, 1));
    add(new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() + 39));
    add(new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() + 50));
    add(new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() + 60));
    add(new Date(year, 9, 3));
    add(new Date(year, 10, 1));
    add(new Date(year, 11, 25));
    add(new Date(year, 11, 26));
    return holidays.has(key);
  }

  function getEasterSunday(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
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

  function sanitizeFilename(value) {
    return String(value || "stundenrapport")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function buildPdfFilename() {
    const weekText = String(selectedPeriod.week).padStart(2, "0");
    const baseName = getDisplayName()
      ? `Rapport_${sanitizeFilename(getDisplayName())}_KW${weekText}_${selectedPeriod.year}`
      : `Rapport_KW${weekText}_${selectedPeriod.year}`;
    return `${baseName}.pdf`;
  }

  function triggerPrint() {
    clearReportNotice();
    showView("reportView");
    if (typeof window.print !== "function") {
      showExternalBrowserHint("Drucken / PDF wird hier nicht unterstützt");
      return;
    }

    const originalTitle = document.title;
    document.title = buildPdfFilename();
    window.setTimeout(() => {
      try {
        window.print();
        if (isLikelyEmbeddedBrowser()) {
          showExternalBrowserHint("Falls kein Druckdialog erscheint");
        }
      } catch (error) {
        console.warn("Drucken / PDF fehlgeschlagen.", error);
        showExternalBrowserHint("Drucken / PDF fehlgeschlagen");
      } finally {
        window.setTimeout(() => {
          document.title = originalTitle;
        }, 300);
      }
    }, 120);
  }
})();
