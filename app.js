const storageKey = "loan-tracker-v2";
const legacyStorageKey = "loan-tracker-v1";

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createEmptyLoan(overrides = {}) {
  return {
    id: createId(),
    loanName: "新贷款",
    principal: 0,
    annualRate: 0,
    termMonths: 360,
    startMonth: new Date().toISOString().slice(0, 7),
    paymentDay: 12,
    repaymentType: "equalPayment",
    events: [],
    ...overrides,
  };
}

function createBlankLoan(index) {
  return createEmptyLoan({
    loanName: `新贷款 ${index}`,
  });
}

const els = {
  addLoan: document.querySelector("#addLoan"),
  deleteLoan: document.querySelector("#deleteLoan"),
  loanList: document.querySelector("#loanList"),
  loanName: document.querySelector("#loanName"),
  principal: document.querySelector("#principal"),
  annualRate: document.querySelector("#annualRate"),
  termMonths: document.querySelector("#termMonths"),
  startMonth: document.querySelector("#startMonth"),
  paymentDay: document.querySelector("#paymentDay"),
  repaymentType: document.querySelector("#repaymentType"),
  eventDate: document.querySelector("#eventDate"),
  eventType: document.querySelector("#eventType"),
  eventValue: document.querySelector("#eventValue"),
  eventValueLabel: document.querySelector("#eventValueLabel"),
  prepayMode: document.querySelector("#prepayMode"),
  prepayModeWrap: document.querySelector("#prepayModeWrap"),
  eventNote: document.querySelector("#eventNote"),
  addEvent: document.querySelector("#addEvent"),
  eventList: document.querySelector("#eventList"),
  summaryTitle: document.querySelector("#summaryTitle"),
  summarySub: document.querySelector("#summarySub"),
  currentPayment: document.querySelector("#currentPayment"),
  remainingPrincipal: document.querySelector("#remainingPrincipal"),
  totalInterest: document.querySelector("#totalInterest"),
  payoffDate: document.querySelector("#payoffDate"),
  timeline: document.querySelector("#timeline"),
  timelineHint: document.querySelector("#timelineHint"),
  scheduleBody: document.querySelector("#scheduleBody"),
  tableFilter: document.querySelector("#tableFilter"),
  installApp: document.querySelector("#installApp"),
  exportBackup: document.querySelector("#exportBackup"),
  importBackup: document.querySelector("#importBackup"),
  backupFile: document.querySelector("#backupFile"),
  exportCsv: document.querySelector("#exportCsv"),
  saveLocal: document.querySelector("#saveLocal"),
  clearData: document.querySelector("#clearData"),
};

let state = loadState();
let latestSchedule = [];
let latestPhases = [];
let deferredInstallPrompt = null;

function normalizeLoan(loan, fallbackName = "未命名贷款") {
  return {
    id: loan.id || createId(),
    loanName: loan.loanName || fallbackName,
    principal: Math.max(0, Number(loan.principal) || 0),
    annualRate: Math.max(0, Number(loan.annualRate) || 0),
    termMonths: Math.max(1, Math.floor(Number(loan.termMonths) || 1)),
    startMonth: loan.startMonth || "2026-06",
    paymentDay: Math.min(28, Math.max(1, Math.floor(Number(loan.paymentDay) || 12))),
    repaymentType: loan.repaymentType === "equalPrincipal" ? "equalPrincipal" : "equalPayment",
    events: Array.isArray(loan.events)
      ? loan.events.map((event) => ({ ...event, id: event.id || createId() }))
      : [],
  };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && Array.isArray(saved.loans) && saved.loans.length) {
      const loans = saved.loans.map((loan, index) => normalizeLoan(loan, `贷款 ${index + 1}`));
      return {
        loans,
        activeLoanId: loans.some((loan) => loan.id === saved.activeLoanId)
          ? saved.activeLoanId
          : loans[0].id,
      };
    }

    const legacy = JSON.parse(localStorage.getItem(legacyStorageKey));
    if (legacy && Number(legacy.principal) > 0) {
      const loan = normalizeLoan(legacy, legacy.loanName || "住房贷款");
      return { loans: [loan], activeLoanId: loan.id };
    }
  } catch {
    localStorage.removeItem(storageKey);
  }

  const loan = createEmptyLoan();
  return { loans: [loan], activeLoanId: loan.id };
}

function activeLoan() {
  let loan = state.loans.find((item) => item.id === state.activeLoanId);
  if (!loan) {
    loan = state.loans[0] || createBlankLoan(1);
    if (!state.loans.length) state.loans.push(loan);
    state.activeLoanId = loan.id;
  }
  return loan;
}

function readForm() {
  const loan = activeLoan();
  loan.loanName = els.loanName.value.trim() || "未命名贷款";
  loan.principal = Math.max(0, Number(els.principal.value) || 0);
  loan.annualRate = Math.max(0, Number(els.annualRate.value) || 0);
  loan.termMonths = Math.max(1, Math.floor(Number(els.termMonths.value) || 1));
  loan.startMonth = els.startMonth.value || "2026-06";
  loan.paymentDay = Math.min(28, Math.max(1, Math.floor(Number(els.paymentDay.value) || 12)));
  loan.repaymentType = els.repaymentType.value;
}

function fillForm() {
  const loan = activeLoan();
  els.loanName.value = loan.loanName;
  els.principal.value = loan.principal;
  els.annualRate.value = loan.annualRate;
  els.termMonths.value = loan.termMonths;
  els.startMonth.value = loan.startMonth;
  els.paymentDay.value = loan.paymentDay;
  els.repaymentType.value = loan.repaymentType;
  els.deleteLoan.disabled = state.loans.length <= 1;
  els.eventDate.value = defaultEventDate(loan);
}

function money(value) {
  return Number(value).toLocaleString("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 2,
  });
}

function percent(value) {
  return `${Number(value).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}%`;
}

function paymentDeltaCell(delta) {
  if (Math.abs(delta) < 0.005) return `<span class="delta flat">0</span>`;
  const sign = delta > 0 ? "+" : "-";
  const className = delta > 0 ? "up" : "down";
  return `<span class="delta ${className}">${sign}${money(Math.abs(delta))}</span>`;
}

function monthLabel(startMonth, offset) {
  const [year, month] = startMonth.split("-").map(Number);
  const date = new Date(year, month - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthDiff(startMonth, targetMonth) {
  const [startYear, start] = startMonth.split("-").map(Number);
  const [targetYear, target] = targetMonth.split("-").map(Number);
  return (targetYear - startYear) * 12 + (target - start);
}

function defaultEventDate(loan = activeLoan()) {
  const [year, month] = loan.startMonth.split("-").map(Number);
  const date = new Date(year, month + 11, Math.min(loan.paymentDay, 28));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function effectiveMonth(event, loan) {
  if (!event.date) return Math.max(1, Math.floor(Number(event.month) || 1));
  const [year, month, day] = event.date.split("-").map(Number);
  const eventMonth = `${year}-${String(month).padStart(2, "0")}`;
  const baseMonth = monthDiff(loan.startMonth, eventMonth) + 1;
  const shift = day > loan.paymentDay ? 1 : 0;
  return Math.max(1, baseMonth + shift);
}

function paymentDateForRow(row, loan) {
  return `${row.date}-${String(loan.paymentDay).padStart(2, "0")}`;
}

function paidStatus(row, loan, today = new Date()) {
  const [year, month, day] = paymentDateForRow(row, loan).split("-").map(Number);
  const paymentDate = new Date(year, month - 1, day, 23, 59, 59);
  return paymentDate < today ? "paid" : "pending";
}

function monthlyPayment(balance, monthlyRate, months) {
  if (months <= 0 || balance <= 0) return 0;
  if (monthlyRate === 0) return balance / months;
  const factor = Math.pow(1 + monthlyRate, months);
  return (balance * monthlyRate * factor) / (factor - 1);
}

function monthsToPayoff(balance, monthlyRate, payment) {
  if (balance <= 0) return 0;
  if (payment <= 0) return Infinity;
  if (monthlyRate === 0) return Math.ceil(balance / payment);
  if (payment <= balance * monthlyRate) return Infinity;
  return Math.ceil(Math.log(payment / (payment - balance * monthlyRate)) / Math.log(1 + monthlyRate));
}

function calculateSchedule(loan = activeLoan()) {
  const eventsByMonth = new Map();
  const sortedEvents = [...loan.events].sort((a, b) => {
    const monthDelta = effectiveMonth(a, loan) - effectiveMonth(b, loan);
    if (monthDelta !== 0) return monthDelta;
    return String(a.date || "").localeCompare(String(b.date || ""));
  });
  sortedEvents.forEach((event) => {
    const month = effectiveMonth(event, loan);
    if (!eventsByMonth.has(month)) eventsByMonth.set(month, []);
    eventsByMonth.get(month).push(event);
  });

  let balance = loan.principal;
  let annualRate = loan.annualRate;
  let plannedEndMonth = loan.termMonths;
  let lockedPayment = 0;
  const rows = [];
  const phases = [
    {
      month: 1,
      type: "start",
      title: "初始方案",
      detail: `${percent(annualRate)}，${loan.termMonths} 期，每月 ${loan.paymentDay} 日还款，${loan.repaymentType === "equalPayment" ? "等额本息" : "等额本金"}`,
    },
  ];

  for (let month = 1; month <= plannedEndMonth && balance > 0.005 && month <= 600; month += 1) {
    const events = eventsByMonth.get(month) || [];
    const beforeEventBalance = balance;
    const eventNotes = [];
    let prepaymentThisMonth = 0;
    let forceReducePayment = false;
    let forceShortenTerm = false;

    for (const event of events) {
      if (event.type === "rate") {
        annualRate = Number(event.value);
        lockedPayment = 0;
        forceReducePayment = true;
        eventNotes.push(`利率调整为 ${percent(annualRate)}${event.date ? `（${event.date}）` : ""}`);
        phases.push({
          month,
          type: "rate",
          title: `第 ${month} 期利率调整`,
          detail: `${event.date ? `${event.date} 发生，` : ""}${percent(annualRate)}${event.note ? `，${event.note}` : ""}`,
        });
      }

      if (event.type === "prepay") {
        const prepay = Math.min(balance, Math.max(0, Number(event.value) || 0));
        balance -= prepay;
        prepaymentThisMonth += prepay;
        eventNotes.push(`提前还款 ${money(prepay)}${event.date ? `（${event.date}）` : ""}`);
        if (event.mode === "shortenTerm") forceShortenTerm = true;
        else forceReducePayment = true;
        phases.push({
          month,
          type: "prepay",
          title: `第 ${month} 期提前还款`,
          detail: `${event.date ? `${event.date} 发生，` : ""}${money(prepay)}，${event.mode === "shortenTerm" ? "缩短期限" : "降低月供"}${event.note ? `，${event.note}` : ""}`,
        });
      }
    }

    if (balance <= 0.005) {
      rows.push({
        month,
        date: monthLabel(loan.startMonth, month - 1),
        annualRate,
        payment: 0,
        principalPaid: 0,
        interest: 0,
        prepayment: prepaymentThisMonth || beforeEventBalance,
        balance: 0,
        changed: events.length > 0,
        note: eventNotes.join("；"),
      });
      break;
    }

    const remainingMonths = Math.max(1, plannedEndMonth - month + 1);
    const monthlyRate = annualRate / 100 / 12;
    let payment = 0;
    let interest = balance * monthlyRate;
    let principalPaid = 0;

    if (loan.repaymentType === "equalPayment") {
      if (forceShortenTerm && lockedPayment === 0) {
        lockedPayment = monthlyPayment(beforeEventBalance, monthlyRate, remainingMonths);
      }
      if (forceReducePayment || lockedPayment === 0) {
        lockedPayment = monthlyPayment(balance, monthlyRate, remainingMonths);
      }
      payment = Math.min(lockedPayment, balance + interest);
      principalPaid = Math.max(0, payment - interest);

      if (forceShortenTerm) {
        const newRemain = monthsToPayoff(balance, monthlyRate, lockedPayment);
        if (Number.isFinite(newRemain)) plannedEndMonth = Math.min(plannedEndMonth, month + newRemain - 1);
      }
    } else {
      const principalBase = forceShortenTerm ? beforeEventBalance : balance;
      principalPaid = Math.min(balance, principalBase / remainingMonths);
      payment = principalPaid + interest;
      if (forceShortenTerm) {
        const newRemain = Math.ceil(balance / Math.max(0.01, principalPaid));
        plannedEndMonth = Math.min(plannedEndMonth, month + newRemain - 1);
      }
    }

    balance = Math.max(0, balance - principalPaid);
    rows.push({
      month,
      date: monthLabel(loan.startMonth, month - 1),
      annualRate,
      payment,
      principalPaid,
      interest,
      prepayment: prepaymentThisMonth,
      balance,
      changed: events.length > 0,
      note: eventNotes.join("；"),
    });
  }

  return { rows, phases };
}

function loanSnapshot(loan) {
  const { rows } = calculateSchedule(loan);
  const last = rows[rows.length - 1];
  const current = rows.find((row) => row.balance > 0) || last;
  return {
    payment: current ? current.payment : 0,
    balance: last ? last.balance : 0,
    payoff: last ? `${last.date}` : "-",
  };
}

function renderLoanList() {
  els.loanList.innerHTML = state.loans
    .map((loan) => {
      const snapshot = loanSnapshot(loan);
      return `
        <button class="loan-card ${loan.id === state.activeLoanId ? "active" : ""}" type="button" data-loan-id="${loan.id}">
          <strong>${loan.loanName}</strong>
          <span>${money(loan.principal)} · ${percent(loan.annualRate)} · ${loan.termMonths} 期</span>
          <small>月供 ${money(snapshot.payment)} · 结清 ${snapshot.payoff}</small>
        </button>`;
    })
    .join("");
}

function renderEvents() {
  const loan = activeLoan();
  const events = [...loan.events].sort((a, b) => {
    const monthDelta = effectiveMonth(a, loan) - effectiveMonth(b, loan);
    if (monthDelta !== 0) return monthDelta;
    return String(a.date || "").localeCompare(String(b.date || ""));
  });
  if (!events.length) {
    els.eventList.innerHTML = `<div class="muted">暂无变化记录</div>`;
    return;
  }

  els.eventList.innerHTML = events
    .map((event) => {
      const month = effectiveMonth(event, loan);
      const happened = event.date ? `${event.date} 发生 · ` : "";
      const title =
        event.type === "rate"
          ? `第 ${month} 期 利率调整`
          : `第 ${month} 期 提前还款`;
      const detail =
        event.type === "rate"
          ? `${happened}${percent(event.value)}${event.note ? ` · ${event.note}` : ""}`
          : `${happened}${money(event.value)} · ${event.mode === "shortenTerm" ? "缩短期限" : "降低月供"}${event.note ? ` · ${event.note}` : ""}`;
      return `
        <div class="event-item">
          <div><strong>${title}</strong><span>${detail}</span></div>
          <button type="button" data-remove="${event.id}" title="删除">×</button>
        </div>`;
    })
    .join("");
}

function renderSummary(rows) {
  const loan = activeLoan();
  const last = rows[rows.length - 1];
  const current = rows.find((row) => row.balance > 0) || last;
  const totalInterest = rows.reduce((sum, row) => sum + row.interest, 0);

  els.summaryTitle.textContent = loan.loanName;
  els.summarySub.textContent = `${money(loan.principal)} · ${percent(loan.annualRate)} · ${loan.termMonths} 期 · 每月 ${loan.paymentDay} 日还款`;
  els.currentPayment.textContent = current ? money(current.payment) : "-";
  els.remainingPrincipal.textContent = last ? money(last.balance) : money(0);
  els.totalInterest.textContent = money(totalInterest);
  els.payoffDate.textContent = last ? `${last.date}（第 ${last.month} 期）` : "-";
}

function renderTimeline(phases) {
  const loan = activeLoan();
  els.timelineHint.textContent = `${phases.length} 个阶段`;
  els.timeline.innerHTML = phases
    .map(
      (phase) => `
        <article class="phase ${phase.type}">
          <strong>${phase.title}</strong>
          <span>${monthLabel(loan.startMonth, phase.month - 1)} · ${phase.detail}</span>
        </article>`,
    )
    .join("");
}

function renderSchedule(rows) {
  const loan = activeLoan();
  const changedMonths = new Set();
  rows.forEach((row) => {
    if (row.changed) {
      changedMonths.add(row.month);
      changedMonths.add(row.month + 1);
    }
  });

  const filtered = rows.filter((row) => {
    if (els.tableFilter.value === "changed") return changedMonths.has(row.month);
    if (els.tableFilter.value === "remaining") return row.balance > 0;
    return true;
  });

  els.scheduleBody.innerHTML = filtered
    .map((row) => {
      const previous = rows[row.month - 2];
      const paymentDelta = previous ? row.payment - previous.payment : 0;
      const status = paidStatus(row, loan);
      const statusText = status === "paid" ? "已还" : "待还";
      return `
        <tr class="${row.changed ? "changed" : ""} ${status === "paid" ? "paid-row" : "pending-row"}">
          <td>第 ${row.month} 期</td>
          <td>${row.date}</td>
          <td>${percent(row.annualRate)}</td>
          <td>${money(row.payment)}</td>
          <td>${paymentDeltaCell(paymentDelta)}</td>
          <td>${money(row.principalPaid)}</td>
          <td>${money(row.interest)}</td>
          <td>${row.prepayment > 0 ? money(row.prepayment) : "-"}</td>
          <td>${money(row.balance)}</td>
          <td><span class="status-pill ${status}">${statusText}</span></td>
          <td>${row.note ? `<span class="tag">${row.note}</span>` : "-"}</td>
        </tr>`;
    })
    .join("");
}

function render({ syncForm = false } = {}) {
  if (syncForm) fillForm();
  else readForm();
  const result = calculateSchedule();
  latestSchedule = result.rows;
  latestPhases = result.phases;
  renderLoanList();
  renderEvents();
  renderSummary(latestSchedule);
  renderTimeline(latestPhases);
  renderSchedule(latestSchedule);
}

function save() {
  readForm();
  localStorage.setItem(storageKey, JSON.stringify(state));
  els.saveLocal.textContent = "已保存";
  window.setTimeout(() => {
    els.saveLocal.textContent = "保存";
  }, 1000);
  renderLoanList();
}

function addEvent() {
  readForm();
  const loan = activeLoan();
  const type = els.eventType.value;
  const event = {
    id: createId(),
    date: els.eventDate.value || defaultEventDate(loan),
    type,
    value: Math.max(0, Number(els.eventValue.value) || 0),
    note: els.eventNote.value.trim(),
  };
  if (type === "prepay") event.mode = els.prepayMode.value;
  loan.events.push(event);
  els.eventNote.value = "";
  els.eventDate.value = defaultEventDate(loan);
  save();
  render();
}

function addLoan() {
  readForm();
  const loan = createBlankLoan(state.loans.length + 1);
  state.loans.unshift(loan);
  state.activeLoanId = loan.id;
  saveStateOnly();
  render({ syncForm: true });
}

function deleteLoan() {
  if (state.loans.length <= 1) return;
  const currentId = state.activeLoanId;
  const currentIndex = state.loans.findIndex((loan) => loan.id === currentId);
  state.loans = state.loans.filter((loan) => loan.id !== currentId);
  const nextLoan = state.loans[Math.max(0, currentIndex - 1)] || state.loans[0];
  state.activeLoanId = nextLoan.id;
  saveStateOnly();
  render({ syncForm: true });
}

function saveStateOnly() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function exportBackup() {
  readForm();
  const payload = {
    app: "loan-tracker",
    version: 2,
    exportedAt: new Date().toISOString(),
    data: state,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  link.href = URL.createObjectURL(blob);
  link.download = `还贷记录备份-${date}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function normalizeImportedState(raw) {
  const imported = raw && raw.data ? raw.data : raw;
  if (!imported || !Array.isArray(imported.loans) || imported.loans.length === 0) {
    throw new Error("备份文件格式不正确");
  }
  const loans = imported.loans.map((loan, index) => normalizeLoan(loan, `贷款 ${index + 1}`));
  return {
    loans,
    activeLoanId: loans.some((loan) => loan.id === imported.activeLoanId)
      ? imported.activeLoanId
      : loans[0].id,
  };
}

function importBackupFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      state = normalizeImportedState(JSON.parse(reader.result));
      saveStateOnly();
      updateEventTypeUI();
      render({ syncForm: true });
      els.saveLocal.textContent = "已恢复";
      window.setTimeout(() => {
        els.saveLocal.textContent = "保存";
      }, 1000);
    } catch (error) {
      alert(error.message || "备份文件无法读取");
    } finally {
      els.backupFile.value = "";
    }
  });
  reader.readAsText(file);
}

function clearLocalData() {
  if (!confirm("确定清空这台设备上的所有贷款记录吗？清空前建议先备份。")) return;
  localStorage.removeItem(storageKey);
  localStorage.removeItem(legacyStorageKey);
  state = loadState();
  updateEventTypeUI();
  render({ syncForm: true });
}

function updateEventTypeUI() {
  const isPrepay = els.eventType.value === "prepay";
  els.eventValueLabel.textContent = isPrepay ? "提前还款金额" : "新年利率 %";
  els.eventValue.step = isPrepay ? "1000" : "0.01";
  els.eventValue.value = isPrepay ? "50000" : "3.45";
  els.prepayModeWrap.classList.toggle("hidden", !isPrepay);
}

function exportCsv() {
  const loan = activeLoan();
  const headers = ["期数", "月份", "年利率", "月供", "月供变化", "本金", "利息", "提前还款", "剩余本金", "状态", "变化"];
  const lines = latestSchedule.map((row, index) => {
    const previous = latestSchedule[index - 1];
    const paymentDelta = previous ? row.payment - previous.payment : 0;
    const status = paidStatus(row, loan) === "paid" ? "已还" : "待还";
    return [
      row.month,
      row.date,
      row.annualRate,
      row.payment.toFixed(2),
      paymentDelta.toFixed(2),
      row.principalPaid.toFixed(2),
      row.interest.toFixed(2),
      row.prepayment.toFixed(2),
      row.balance.toFixed(2),
      status,
      row.note,
    ]
      .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
      .join(",");
  });
  const blob = new Blob([`\ufeff${headers.join(",")}\n${lines.join("\n")}`], {
    type: "text/csv;charset=utf-8",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${loan.loanName || "还贷记录"}-明细.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

document.querySelectorAll("input, select").forEach((input) => {
  input.addEventListener("input", render);
  input.addEventListener("change", render);
});

els.loanList.addEventListener("click", (event) => {
  const card = event.target.closest("[data-loan-id]");
  if (!card) return;
  readForm();
  state.activeLoanId = card.dataset.loanId;
  saveStateOnly();
  render({ syncForm: true });
});

els.addLoan.addEventListener("click", addLoan);
els.deleteLoan.addEventListener("click", deleteLoan);
els.eventType.addEventListener("change", updateEventTypeUI);
els.addEvent.addEventListener("click", addEvent);
els.saveLocal.addEventListener("click", save);
els.exportCsv.addEventListener("click", exportCsv);
els.exportBackup.addEventListener("click", exportBackup);
els.importBackup.addEventListener("click", () => els.backupFile.click());
els.backupFile.addEventListener("change", () => importBackupFile(els.backupFile.files[0]));
els.installApp.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  els.installApp.classList.add("hidden");
});
els.tableFilter.addEventListener("change", () => renderSchedule(latestSchedule));
els.clearData.addEventListener("click", clearLocalData);

els.eventList.addEventListener("click", (event) => {
  const id = event.target.dataset.remove;
  if (!id) return;
  const loan = activeLoan();
  loan.events = loan.events.filter((item) => item.id !== id);
  save();
  render();
});

fillForm();
updateEventTypeUI();
render({ syncForm: true });
setupMobileCollapsibles();

function setupMobileCollapsibles() {
  document.querySelectorAll("summary button").forEach((button) => {
    button.addEventListener("click", (event) => event.stopPropagation());
  });
  if (!window.matchMedia || !window.matchMedia("(max-width: 620px)").matches) return;
  document.querySelectorAll(".sidebar .collapsible").forEach((panel, index) => {
    panel.open = index === 0;
  });
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  els.installApp.classList.remove("hidden");
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  els.installApp.classList.add("hidden");
});
