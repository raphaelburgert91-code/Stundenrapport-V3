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
    "Pädagogische Vor-/Nachbereitung",
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
  const reportTypeSelect = document.getElementById("reportTypeSelect");
  const appTitle = document.getElementById("appTitle");
  const appSubtitle = document.getElementById("appSubtitle");
  const externalBrowserMessage = "Diese Funktion bitte in Chrome oder Edge öffnen.";

  init();

  function init() {
    buildWeekOptions();
    buildYearOptions();
    bindTabs();
    document.getElementById("printButton").addEventListener("click", () => {
      triggerPrint();
    });
    reportTypeSelect.addEventListener("change", renderReport);
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
          : "Baden-Württemberg",
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
    input.placeholder = "";
    input.autocomplete = "off";
    input.autocorrect = "off";
    input.setAttribute("autocorrect", "off");
    input.spellcheck = false;
    input.disabled = isReadOnly;
    input.className = "time-input";
    input.value = initialValue || "";

    const message = document.createElement("span");
    message.className = "time-error";
    message.hidden = true;

    const showTimeError = (show) => {
      input.classList.toggle("invalid", show);
      input.setAttribute("aria-invalid", show ? "true" : "false");
      message.hidden = !show;
      message.textContent = show ? "Bitte Uhrzeit als 0730 oder 07:30 eingeben" : "";
    };

    input.addEventListener("input", () => {
      showTimeError(false);
    });

    const commitTimeInput = () => {
      const parsed = parseTimeInput(input.value);
      if (parsed.empty) {
        input.value = "";
        showTimeError(false);
        updateEntry(dayKey, entryIndex, field, "");
        return;
      }
      if (parsed.valid) {
        input.value = parsed.value;
        showTimeError(false);
        updateEntry(dayKey, entryIndex, field, parsed.value);
        return;
      }
      showTimeError(true);
      updateEntry(dayKey, entryIndex, field, "");
    };

    input.addEventListener("blur", commitTimeInput);
    input.addEventListener("change", commitTimeInput);

    const wrapper = document.createElement("span");
    wrapper.className = "time-field";
    wrapper.append(input, message);
    return wrapper;
  }

  function updateEntry(dayKey, entryIndex, field, value) {
    const day = state.weeks[periodKey(selectedPeriod.year, selectedPeriod.week)].days[dayKey];
    const entry = day.entries[entryIndex];
    if (entry[field] === value) {
      return;
    }
    entry[field] = value;
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
        <span>Übertrag</span>
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
        <article class="summary-card">
          <span>Übertrag gesamt</span>
          <strong>${formatSignedHours(yearCarry)}</strong>
        </article>
      `;
    }
  }

  function renderReport() {
    const reportType = getReportType();
    if (reportType === "month") {
      renderMonthReport();
      return;
    }
    if (reportType === "year") {
      renderYearReport();
      return;
    }
    renderWeekReport();
  }

  function renderWeekReport() {
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
        <div><span>Start-Übertrag</span><strong>${formatSignedHours(getStartCarry())}</strong></div>
        <div><span>Übertrag gesamt</span><strong>${formatSignedHours(carry)}</strong></div>
      </div>
    `;
  }

  function renderMonthReport() {
    const selected = getSelectedDateObject();
    const year = selected.getFullYear();
    const month = selected.getMonth() + 1;
    const stats = getMonthStats(year, month);
    const rows = stats.periods.map((period) => {
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

    report.innerHTML = `
      <div class="report-header">
        <div>
          <h2>Monatsrapport</h2>
          <strong>${getDisplayName() || "Name"}</strong>
        </div>
        <div>
          <strong>${String(month).padStart(2, "0")}/${year}</strong>
        </div>
      </div>
      <table class="report-table report-table-compact">
        <thead>
          <tr>
            <th>Woche</th>
            <th>Zeitraum</th>
            <th>Ist</th>
            <th>Soll</th>
            <th>Plus / Minus</th>
            <th>Übertrag</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="report-summary">
        <div><span>Arbeitstage</span><strong>${stats.summary.workday}</strong></div>
        <div><span>Urlaubstage</span><strong>${stats.summary.vacation}</strong></div>
        <div><span>Krankheitstage</span><strong>${stats.summary.illness}</strong></div>
        <div><span>Feiertage</span><strong>${stats.summary.holiday}</strong></div>
        <div><span>Freie Tage</span><strong>${stats.summary.free}</strong></div>
        <div><span>Ist-Stunden</span><strong>${formatHours(stats.total)}</strong></div>
        <div><span>Sollstunden</span><strong>${formatHours(stats.target)}</strong></div>
        <div><span>Plus / Minus</span><strong>${formatSignedHours(stats.balance)}</strong></div>
        <div><span>Übertrag gesamt</span><strong>${formatSignedHours(stats.carry)}</strong></div>
      </div>
    `;
  }

  function renderYearReport() {
    const year = getSelectedDateObject().getFullYear();
    const stats = getYearStats(year);
    const rows = stats.months.map((monthStats) => `
      <tr>
        <td>${String(monthStats.month).padStart(2, "0")}/${year}</td>
        <td>${monthStats.summary.workday}</td>
        <td>${monthStats.summary.vacation}</td>
        <td>${monthStats.summary.illness}</td>
        <td>${monthStats.summary.holiday}</td>
        <td>${monthStats.summary.free}</td>
        <td>${formatHours(monthStats.total)}</td>
        <td>${formatHours(monthStats.target)}</td>
        <td>${formatSignedHours(monthStats.balance)}</td>
      </tr>`).join("");

    report.innerHTML = `
      <div class="report-header">
        <div>
          <h2>Jahresrapport</h2>
          <strong>${getDisplayName() || "Name"}</strong>
        </div>
        <div>
          <strong>${year}</strong>
        </div>
      </div>
      <table class="report-table report-table-compact">
        <thead>
          <tr>
            <th>Monat</th>
            <th>Arbeit</th>
            <th>Urlaub</th>
            <th>Krank</th>
            <th>Feiertag</th>
            <th>Frei</th>
            <th>Ist</th>
            <th>Soll</th>
            <th>Plus / Minus</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="report-summary">
        <div><span>Arbeitstage</span><strong>${stats.summary.workday}</strong></div>
        <div><span>Urlaubstage</span><strong>${stats.summary.vacation}</strong></div>
        <div><span>Krankheitstage</span><strong>${stats.summary.illness}</strong></div>
        <div><span>Feiertage</span><strong>${stats.summary.holiday}</strong></div>
        <div><span>Freie Tage</span><strong>${stats.summary.free}</strong></div>
        <div><span>Ist-Stunden</span><strong>${formatHours(stats.total)}</strong></div>
        <div><span>Sollstunden</span><strong>${formatHours(stats.target)}</strong></div>
        <div><span>Plus / Minus</span><strong>${formatSignedHours(stats.balance)}</strong></div>
        <div><span>Übertrag gesamt</span><strong>${formatSignedHours(stats.carry)}</strong></div>
      </div>
    `;
  }

  function reportDayRow(day) {
    const date = new Date(`${day.date}T00:00:00`);
    const dayType = getDayTypeLabel(day);
    const holidayDate = isHoliday(date);
    const dayLabel = holidayDate ? `${dayType} - Feiertag` : dayType;
    const timeEntries = day.entries
      .filter((entry) => entry.from || entry.to)
      .map((entry) => `${entry.category}: ${entry.from || "-"} - ${entry.to || "-"}`);
    const timesText = timeEntries.length > 0 ? timeEntries.join("<br>") : "";
    const remark = day.remark ? escapeHtml(day.remark) : "";
    return `<tr>
      <td>${escapeHtml(formatDate(date))}</td>
      <td>${escapeHtml(day.weekday)}</td>
      <td>${escapeHtml(dayLabel)}</td>
      <td>${timesText}</td>
      <td>${formatHours(getDayTotal(day))}</td>
      <td>${remark}</td>
    </tr>`;
  }

  function getReportType() {
    return reportTypeSelect.value || "week";
  }

  function getMonthStats(year, month) {
    const periods = getPeriodsForMonth(year, month);
    const days = periods.flatMap((period) => getOrderedDays(period.year, period.week));
    const summary = getDayTypeSummary(days);
    const total = roundHours(periods.reduce((sum, period) => sum + getWeekTotal(period.year, period.week), 0));
    const target = roundHours(days.reduce((sum, day) => sum + getDayTarget(day), 0));
    const balance = roundHours(total - target);
    const lastPeriod = periods[periods.length - 1];
    const carry = lastPeriod ? getCarryAfterWeek(lastPeriod.year, lastPeriod.week) : getStartCarry();
    return { year, month, periods, summary, total, target, balance, carry };
  }

  function getYearStats(year) {
    const months = Array.from({ length: 12 }, (_, index) => getMonthStats(year, index + 1));
    const summary = months.reduce((totals, monthStats) => {
      totals.workday += monthStats.summary.workday;
      totals.vacation += monthStats.summary.vacation;
      totals.illness += monthStats.summary.illness;
      totals.holiday += monthStats.summary.holiday;
      totals.free += monthStats.summary.free;
      return totals;
    }, { workday: 0, vacation: 0, illness: 0, holiday: 0, free: 0 });
    const total = roundHours(months.reduce((sum, monthStats) => sum + monthStats.total, 0));
    const target = roundHours(months.reduce((sum, monthStats) => sum + monthStats.target, 0));
    const balance = roundHours(total - target);
    const carry = getCarryAfterWeek(year, getWeeksInYear(year));
    return { year, months, summary, total, target, balance, carry };
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
    return typeof state.settings.region === "string" && state.settings.region ? state.settings.region : "Baden-Württemberg";
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
    const parsed = parseTimeInput(value);
    if (!parsed.valid) {
      return 0;
    }
    const [hours, minutes] = parsed.value.split(":").map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
      return 0;
    }
    return hours * 60 + minutes;
  }

  function parseTimeInput(value) {
    const rawValue = String(value || "").trim();
    if (!rawValue) {
      return { rawValue, value: "", valid: false, empty: true, error: "" };
    }

    const colonMatch = rawValue.match(/^(\d{1,2}):(\d{2})$/);
    if (colonMatch) {
      return parseTimeParts(colonMatch[1], colonMatch[2], rawValue);
    }

    const digitMatch = rawValue.match(/^\d{3,4}$/);
    if (digitMatch) {
      const digits = rawValue;
      if (digits.length === 3) {
        return parseTimeParts(digits.slice(0, 1), digits.slice(1), rawValue);
      }
      return parseTimeParts(digits.slice(0, 2), digits.slice(2), rawValue);
    }

    return invalidTime(rawValue);
  }

  function parseTimeParts(hours, minutes, rawValue) {
    const paddedHours = String(hours).padStart(2, "0");
    const paddedMinutes = String(minutes);
    const valid = /^([01]\d|2[0-3]):([0-5]\d)$/.test(`${paddedHours}:${paddedMinutes}`);
    if (!valid) {
      return invalidTime(rawValue);
    }
    return {
      rawValue,
      value: `${paddedHours}:${paddedMinutes}`,
      valid: true,
      empty: false,
      error: ""
    };
  }

  function invalidTime(rawValue) {
    return {
      rawValue,
      value: "",
      valid: false,
      empty: false,
      error: "Bitte Uhrzeit als 0730 oder 07:30 eingeben"
    };
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

  function buildPdfFilename() {
    const reportType = getReportType();
    const weekText = String(selectedPeriod.week).padStart(2, "0");
    const selected = getSelectedDateObject();
    if (reportType === "month") {
      return `Rapport_Monat_${String(selected.getMonth() + 1).padStart(2, "0")}_${selected.getFullYear()}.pdf`;
    }
    if (reportType === "year") {
      return `Rapport_Jahr_${selected.getFullYear()}.pdf`;
    }
    return `Rapport_Woche_KW${weekText}_${selectedPeriod.year}.pdf`;
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
