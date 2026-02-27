/* LoanManager PWA (Option B: store API key on-device)
   Backend: Google Apps Script Web App
*/

const DEFAULT_API_URL = "https://script.google.com/macros/s/AKfycbyaOhLY8lf0zwGQ2XdosVOizWKuT4-dlaKvVLhmfKH9w6zEH4tYSihezsg4TEUhcGDcmA/exec";

const storage = {
  get apiUrl() { return localStorage.getItem("lm_api_url") || DEFAULT_API_URL; },
  set apiUrl(v) { localStorage.setItem("lm_api_url", v); },
  get apiKey() { return localStorage.getItem("lm_api_key") || ""; },
  set apiKey(v) { localStorage.setItem("lm_api_key", v); },
};

const $ = (sel) => document.querySelector(sel);

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 2600);
}

function zarmoney(n) {
  const num = Number(n || 0);
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(num);
}

function toISODate(d) {
  const dt = new Date(d);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function apiGet(action, params = {}) {
  const apiUrl = storage.apiUrl;
  const key = storage.apiKey;
  if (!key) throw new Error("API key not set. Go to Settings.");

  const usp = new URLSearchParams({ action, key, ...params });
  const url = `${apiUrl}?${usp.toString()}`;
  const res = await fetch(url, { method: "GET" });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "API GET failed");
  return data;
}

async function apiPost(body) {
  const apiUrl = storage.apiUrl;
  const key = storage.apiKey;
  if (!key) throw new Error("API key not set. Go to Settings.");

  // Key stays in URL
  const url = `${apiUrl}?key=${encodeURIComponent(key)}`;

  // IMPORTANT: Use text/plain to avoid CORS preflight (OPTIONS)
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: JSON.stringify({ ...body })
  });

  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "API POST failed");
  return data;
}

/* ---------------- Routing ---------------- */

const state = { clients: [], loans: [], currentLoan: null, currentTx: [] };

function setTitle(t) { $("#title").textContent = t; }

function setBack(visible, onClick) {
  const btn = $("#backBtn");
  if (!visible) {
    btn.classList.add("hidden");
    btn.onclick = null;
    return;
  }
  btn.classList.remove("hidden");
  btn.onclick = onClick;
}

function setActiveTab(routeHash) {
  document.querySelectorAll(".tab").forEach(b => {
    const isActive = b.dataset.route === routeHash;
    b.classList.toggle("active", isActive);
  });
}

function nav(hash) { location.hash = hash; }

function requireSetupOrRedirect() {
  if (!storage.apiKey || !storage.apiUrl) { nav("#/setup"); return false; }
  return true;
}

/* ---------------- Views ---------------- */

function viewSetup() {
  setTitle("Setup");
  setBack(false);
  setActiveTab("");

  $("#view").innerHTML = `
    <div class="card">
      <h2>Connect your backend</h2>
      <p class="muted">Enter your Apps Script Web App URL and API key once. This stays on your device.</p>
      <div class="stack">
        <label class="muted">API URL</label>
        <input class="input" id="apiUrl" placeholder="https://script.google.com/macros/s/.../exec" value="${escapeHtml(storage.apiUrl)}" />
        <label class="muted">API Key</label>
        <input class="input" id="apiKey" placeholder="LMGR-..." value="${escapeHtml(storage.apiKey)}" />
        <button class="btn" id="saveSetupBtn">Save & Test</button>
        <button class="btn secondary" id="resetSetupBtn">Reset</button>
      </div>
    </div>
  `;

  $("#saveSetupBtn").onclick = async () => {
    storage.apiUrl = $("#apiUrl").value.trim();
    storage.apiKey = $("#apiKey").value.trim();
    try { await apiGet("ping"); toast("Connected ✅"); nav("#/dashboard"); }
    catch (e) { toast(`Connection failed: ${e.message}`); }
  };

  $("#resetSetupBtn").onclick = () => {
    localStorage.removeItem("lm_api_url");
    localStorage.removeItem("lm_api_key");
    toast("Reset. Enter details again.");
    viewSetup();
  };
}

async function viewDashboard() {
  if (!requireSetupOrRedirect()) return;
  setTitle("Dashboard");
  setBack(false);
  setActiveTab("#/dashboard");

  $("#view").innerHTML = `
    <div class="card">
      <h2>Portfolio snapshot</h2>
      <div class="row space">
        <div class="muted">Loading…</div>
        <div class="pill">ZAR</div>
      </div>
    </div>
    <div class="card">
      <h2>Quick actions</h2>
      <div class="stack">
        <button class="btn" id="qaAddClient">Add client</button>
        <button class="btn secondary" id="qaAddLoan">Add loan</button>
      </div>
    </div>
  `;

  $("#qaAddClient").onclick = () => nav("#/clients?new=1");
  $("#qaAddLoan").onclick = () => nav("#/loans?new=1");

  try {
    const loansData = await apiGet("loans");
    const loans = loansData.loans || [];
    const totalOutstanding = loans.reduce((a, l) => a + Number(l.OutstandingSnapshot || 0), 0);
    const activeCount = loans.filter(l => Number(l.OutstandingSnapshot || 0) > 0).length;

    $("#view").innerHTML = `
      <div class="card">
        <h2>Portfolio snapshot</h2>
        <div class="row space">
          <div class="muted">Total outstanding</div>
          <div style="font-weight:800">${zarmoney(totalOutstanding)}</div>
        </div>
        <div class="row space" style="margin-top:10px">
          <div class="muted">Active loans</div>
          <div class="pill">${activeCount}</div>
        </div>
      </div>
      <div class="card">
        <h2>Quick actions</h2>
        <div class="stack">
          <button class="btn" id="qaAddClient">Add client</button>
          <button class="btn secondary" id="qaAddLoan">Add loan</button>
        </div>
      </div>
    `;
    $("#qaAddClient").onclick = () => nav("#/clients?new=1");
    $("#qaAddLoan").onclick = () => nav("#/loans?new=1");
  } catch (e) {
    toast(e.message);
  }
}

async function viewClients() {
  if (!requireSetupOrRedirect()) return;
  setTitle("Clients");
  setBack(false);
  setActiveTab("#/clients");

  $("#view").innerHTML = `
    <div class="card">
      <h2>Clients</h2>
      <div class="row">
        <input class="input" id="clientSearch" placeholder="Search name or phone…" />
        <button class="iconbtn" id="addClientBtn">＋</button>
      </div>
      <div id="clientsList" class="stack" style="margin-top:12px"></div>
    </div>
    <div id="clientFormWrap"></div>
  `;

  $("#addClientBtn").onclick = () => renderClientForm();
  const params = parseHashParams();
  if (params.new === "1") renderClientForm();

  try {
    const data = await apiGet("clients");
    state.clients = (data.clients || []).filter(c => c.IsActive !== false && c.IsActive !== "FALSE");
    renderClientsList(state.clients);
  } catch (e) {
    toast(e.message);
  }

  $("#clientSearch").addEventListener("input", (ev) => {
    const q = ev.target.value.trim().toLowerCase();
    const filtered = state.clients.filter(c =>
      String(c.FullName || "").toLowerCase().includes(q) ||
      String(c.PhoneNumber || "").toLowerCase().includes(q)
    );
    renderClientsList(filtered);
  });
}

function renderClientForm() {
  $("#clientFormWrap").innerHTML = `
    <div class="card">
      <h2>Add client</h2>
      <div class="stack">
        <input class="input" id="fullName" placeholder="Full name" />
        <input class="input" id="phoneNumber" placeholder="Phone number" />
        <select class="input" id="riskLevel">
          <option>Low</option><option>Medium</option><option>High</option>
        </select>
        <input class="input" id="defaultRate" value="0.35" inputmode="decimal" />
        <textarea class="input" id="notes" placeholder="Notes (optional)"></textarea>
        <button class="btn" id="saveClient">Save client</button>
        <button class="btn secondary" id="cancelClient">Cancel</button>
      </div>
    </div>
  `;

  $("#cancelClient").onclick = () => $("#clientFormWrap").innerHTML = "";

  $("#saveClient").onclick = async () => {
    try {
      const fullName = $("#fullName").value.trim();
      const phoneNumber = $("#phoneNumber").value.trim();
      const riskLevel = $("#riskLevel").value;
      const defaultInterestRate = Number($("#defaultRate").value);
      const notes = $("#notes").value.trim();

      if (!fullName) throw new Error("Full name is required.");
      if (!phoneNumber) throw new Error("Phone number is required.");
      if (!Number.isFinite(defaultInterestRate)) throw new Error("Default interest rate must be a number (e.g. 0.35).");

      await apiPost({ action: "createClient", fullName, phoneNumber, riskLevel, defaultInterestRate, notes });
      toast("Client saved ✅");
      const data = await apiGet("clients");
      state.clients = (data.clients || []).filter(c => c.IsActive !== false && c.IsActive !== "FALSE");
      renderClientsList(state.clients);
      $("#clientFormWrap").innerHTML = "";
    } catch (e) { toast(e.message); }
  };
}

function renderClientsList(clients) {
  const wrap = $("#clientsList");
  if (!clients.length) { wrap.innerHTML = `<div class="muted">No clients yet.</div>`; return; }

  wrap.innerHTML = clients.map(c => `
    <div class="listItem" data-client="${escapeHtml(String(c.ClientID || ""))}">
      <div class="row space">
        <div style="font-weight:800">${escapeHtml(String(c.FullName || ""))}</div>
        <div class="pill">${escapeHtml(String(c.RiskLevel || "Low"))}</div>
      </div>
      <div class="muted" style="margin-top:6px">${escapeHtml(String(c.PhoneNumber || ""))}</div>
    </div>
  `).join("");

  wrap.querySelectorAll("[data-client]").forEach(el => {
    el.onclick = () => nav(`#/loans?clientId=${encodeURIComponent(el.getAttribute("data-client"))}`);
  });
}

async function viewLoans() {
  if (!requireSetupOrRedirect()) return;
  setTitle("Loans");
  setBack(false);
  setActiveTab("#/loans");

  const params = parseHashParams();
  const clientIdFilter = params.clientId ? String(params.clientId) : null;

  $("#view").innerHTML = `
    <div class="card">
      <h2>Loans</h2>
      <div class="row">
        <input class="input" id="loanSearch" placeholder="Search by client or loan ID…" />
        <button class="iconbtn" id="addLoanBtn">＋</button>
      </div>
      ${clientIdFilter ? `<p class="muted" style="margin:10px 0 0">Filtered by client</p>` : ""}
      <div id="loansList" class="stack" style="margin-top:12px"></div>
    </div>
    <div id="loanFormWrap"></div>
  `;

  $("#addLoanBtn").onclick = () => renderLoanForm(clientIdFilter);
  if (params.new === "1") renderLoanForm(clientIdFilter);

  try {
    const loansData = await apiGet("loans", clientIdFilter ? { clientId: clientIdFilter } : {});
    state.loans = loansData.loans || [];
    const clientsData = await apiGet("clients");
    state.clients = clientsData.clients || [];
    renderLoansList(state.loans);
  } catch (e) { toast(e.message); }

  $("#loanSearch").addEventListener("input", (ev) => {
    const q = ev.target.value.trim().toLowerCase();
    renderLoansList(state.loans.filter(l =>
      String(l.LoanID || "").toLowerCase().includes(q) ||
      String(l.ClientID || "").toLowerCase().includes(q)
    ));
  });
}

function clientNameById(clientId) {
  const c = (state.clients || []).find(x => String(x.ClientID) === String(clientId));
  return c ? String(c.FullName || "") : String(clientId || "");
}

function loanStatus(loan) {
  const outstanding = Number(loan.OutstandingSnapshot || 0);
  if (outstanding <= 0) return { label: "SETTLED", cls: "ok" };
  const due = loan.DueDate ? new Date(loan.DueDate) : null;
  const today = new Date();
  if (due) {
    const dueISO = toISODate(due);
    const todayISO = toISODate(today);
    if (dueISO === todayISO) return { label: "DUE TODAY", cls: "warn" };
    if (due < new Date(todayISO)) return { label: "OVERDUE", cls: "bad" };
  }
  return { label: "ACTIVE", cls: "" };
}

function renderLoansList(loans) {
  const wrap = $("#loansList");
  if (!loans.length) { wrap.innerHTML = `<div class="muted">No loans yet.</div>`; return; }

  wrap.innerHTML = loans.map(l => {
    const st = loanStatus(l);
    return `
      <div class="listItem" data-loan="${escapeHtml(String(l.LoanID || ""))}">
        <div class="row space">
          <div style="font-weight:800">${escapeHtml(clientNameById(l.ClientID))}</div>
          <div class="pill ${st.cls}">${st.label}</div>
        </div>
        <div class="row space" style="margin-top:8px">
          <div class="muted">Outstanding</div>
          <div style="font-weight:800">${zarmoney(l.OutstandingSnapshot || 0)}</div>
        </div>
        <div class="muted" style="margin-top:6px">LoanID: ${escapeHtml(String(l.LoanID).slice(0,8))}… • Due: ${escapeHtml(String(l.DueDate || ""))}</div>
      </div>
    `;
  }).join("");

  wrap.querySelectorAll("[data-loan]").forEach(el => el.onclick = () => nav(`#/loan?id=${encodeURIComponent(el.getAttribute("data-loan"))}`));
}

function renderLoanForm(prefillClientId) {
  const clientOptions = (state.clients || []).map(c =>
    `<option value="${escapeHtml(String(c.ClientID))}" ${prefillClientId && String(c.ClientID) === String(prefillClientId) ? "selected" : ""}>
      ${escapeHtml(String(c.FullName || ""))} (${escapeHtml(String(c.PhoneNumber || ""))})
    </option>`
  ).join("");

  const issued = toISODate(new Date());
  const due = toISODate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

  $("#loanFormWrap").innerHTML = `
    <div class="card">
      <h2>Add loan</h2>
      <div class="stack">
        <label class="muted">Client</label>
        <select class="input" id="loanClient">${clientOptions}</select>
        <label class="muted">Principal (ZAR)</label>
        <input class="input" id="principal" placeholder="e.g. 1000" inputmode="decimal" />
        <label class="muted">Interest rate (e.g. 0.35)</label>
        <input class="input" id="rate" value="0.35" inputmode="decimal" />
        <div class="row space">
          <div class="muted">Disbursement fee (R20)</div>
          <input type="checkbox" id="feeApplied" checked />
        </div>
        <label class="muted">Date issued</label>
        <input class="input" id="dateIssued" type="date" value="${issued}" />
        <label class="muted">Due date</label>
        <input class="input" id="dueDate" type="date" value="${due}" />
        <textarea class="input" id="loanNotes" placeholder="Notes (optional)"></textarea>
        <button class="btn" id="saveLoan">Save loan</button>
        <button class="btn secondary" id="cancelLoan">Cancel</button>
      </div>
      <p class="muted" style="margin-top:10px">The backend will create a BASE_LOAN transaction automatically.</p>
    </div>
  `;

  $("#cancelLoan").onclick = () => $("#loanFormWrap").innerHTML = "";

  $("#saveLoan").onclick = async () => {
    try {
      const clientId = $("#loanClient").value;
      const principal = Number($("#principal").value);
      const interestRateUsed = Number($("#rate").value);
      const disbursementFeeApplied = $("#feeApplied").checked;
      const disbursementFeeAmount = 20;
      const dateIssued = $("#dateIssued").value;
      const dueDate = $("#dueDate").value;
      const notes = $("#loanNotes").value.trim();

      if (!clientId) throw new Error("Select a client.");
      if (!Number.isFinite(principal) || principal <= 0) throw new Error("Principal must be a positive number.");
      if (!Number.isFinite(interestRateUsed) || interestRateUsed <= 0) throw new Error("Interest rate must be a number like 0.35.");
      if (!dueDate) throw new Error("Due date is required.");

      await apiPost({
        action: "createLoan",
        clientId,
        principal,
        interestRateUsed,
        disbursementFeeApplied,
        disbursementFeeAmount,
        dateIssued,
        dueDate,
        createBaseLoanTransaction: true,
        notes
      });

      toast("Loan saved ✅");
      $("#loanFormWrap").innerHTML = "";
      const loansData = await apiGet("loans");
      state.loans = loansData.loans || [];
      renderLoansList(state.loans);
    } catch (e) { toast(e.message); }
  };
}

async function viewLoanDetail() {
  if (!requireSetupOrRedirect()) return;

  const params = parseHashParams();
  const loanId = params.id ? String(params.id) : "";
  if (!loanId) { toast("Missing loan id."); nav("#/loans"); return; }

  setTitle("Loan");
  setActiveTab("");
  setBack(true, () => history.back());

  $("#view").innerHTML = `<div class="card"><h2>Loan details</h2><div class="muted">Loading…</div></div>`;

  try {
    const [loanRes, txRes, clientsRes] = await Promise.all([
      apiGet("loan", { loanId }),
      apiGet("transactions", { loanId }),
      apiGet("clients")
    ]);

    state.currentLoan = loanRes.loan;
    state.currentTx = txRes.transactions || [];
    state.clients = clientsRes.clients || [];

    const loan = state.currentLoan;
    const st = loanStatus(loan);

    $("#view").innerHTML = `
      <div class="card">
        <h2>${escapeHtml(clientNameById(loan.ClientID))}</h2>
        <div class="row space" style="margin-top:8px">
          <div class="muted">Status</div>
          <div class="pill ${st.cls}">${st.label}</div>
        </div>
        <div class="row space" style="margin-top:10px">
          <div class="muted">Outstanding</div>
          <div style="font-weight:900;font-size:18px">${zarmoney(loan.OutstandingSnapshot || 0)}</div>
        </div>
        <div class="row space" style="margin-top:10px">
          <div class="muted">Original total</div>
          <div style="font-weight:800">${zarmoney(loan.OriginalTotal || 0)}</div>
        </div>
        <div class="row space" style="margin-top:10px">
          <div class="muted">Due date</div>
          <div style="font-weight:800">${escapeHtml(String(loan.DueDate || ""))}</div>
        </div>
        <div class="row" style="margin-top:12px; gap:10px">
          <button class="btn" id="payBtn">Record payment</button>
          <button class="btn secondary" id="refreshBtn">Refresh</button>
        </div>
      </div>
      <div class="card">
        <h2>Ledger</h2>
        <div class="stack">
          ${(state.currentTx.length ? state.currentTx : []).slice().reverse().map(t => `
            <div class="listItem" style="cursor:default">
              <div class="row space">
                <div style="font-weight:800">${escapeHtml(String(t.TransactionType || ""))}</div>
                <div style="font-weight:850">${zarmoney(Number(t.Amount || 0))}</div>
              </div>
              <div class="muted" style="margin-top:6px">${escapeHtml(String(t.TransactionDate || ""))} • ${escapeHtml(String(t.Notes || ""))}</div>
            </div>
          `).join("") || `<div class="muted">No transactions.</div>`}
        </div>
      </div>
    `;

    $("#refreshBtn").onclick = () => viewLoanDetail();
    $("#payBtn").onclick = () => renderPaymentModal(loan);

  } catch (e) { toast(e.message); }
}

function renderPaymentModal(loan) {
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div class="card">
      <h2>Record payment</h2>
      <p class="muted">Enter amount in ZAR. This will reduce outstanding balance.</p>
      <div class="stack">
        <input class="input" id="payAmount" placeholder="e.g. 200" inputmode="decimal" />
        <input class="input" id="payDate" type="date" value="${toISODate(new Date())}" />
        <textarea class="input" id="payNotes" placeholder="Notes (optional)"></textarea>
        <button class="btn" id="savePay">Save payment</button>
        <button class="btn secondary" id="cancelPay">Cancel</button>
      </div>
    </div>
  `;
  $("#view").prepend(wrap);
  wrap.querySelector("#cancelPay").onclick = () => wrap.remove();
  wrap.querySelector("#savePay").onclick = async () => {
    try {
      const amt = Number(wrap.querySelector("#payAmount").value);
      const date = wrap.querySelector("#payDate").value;
      const notes = wrap.querySelector("#payNotes").value.trim();
      if (!Number.isFinite(amt) || amt <= 0) throw new Error("Payment must be a positive number.");
      if (!date) throw new Error("Payment date is required.");
      await apiPost({
        action: "recordTransaction",
        loanId: loan.LoanID,
        clientId: loan.ClientID,
        transactionType: "PAYMENT",
        amount: -Math.abs(amt),
        transactionDate: date,
        notes: notes || "Payment"
      });
      toast("Payment recorded ✅");
      wrap.remove();
      await viewLoanDetail();
    } catch (e) { toast(e.message); }
  };
}

function viewSettings() {
  setTitle("Settings");
  setActiveTab("");
  setBack(true, () => history.back());

  $("#view").innerHTML = `
    <div class="card">
      <h2>Connection</h2>
      <div class="stack">
        <label class="muted">API URL</label>
        <input class="input" id="s_apiUrl" value="${escapeHtml(storage.apiUrl)}" />
        <label class="muted">API Key</label>
        <input class="input" id="s_apiKey" value="${escapeHtml(storage.apiKey)}" />
        <button class="btn" id="s_save">Save</button>
        <button class="btn secondary" id="s_test">Test connection</button>
      </div>
    </div>
  `;

  $("#s_save").onclick = () => { storage.apiUrl = $("#s_apiUrl").value.trim(); storage.apiKey = $("#s_apiKey").value.trim(); toast("Saved ✅"); };
  $("#s_test").onclick = async () => {
    try { storage.apiUrl = $("#s_apiUrl").value.trim(); storage.apiKey = $("#s_apiKey").value.trim(); await apiGet("ping"); toast("Connection OK ✅"); }
    catch (e) { toast(`Failed: ${e.message}`); }
  };
}

/* ---------------- App Shell ---------------- */

function escapeHtml(s) {
  return String(s ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

function parseHashParams() {
  const hash = location.hash || "";
  const qIndex = hash.indexOf("?");
  if (qIndex === -1) return {};
  const qs = hash.slice(qIndex + 1);
  const p = new URLSearchParams(qs);
  const out = {};
  for (const [k,v] of p.entries()) out[k] = v;
  return out;
}

function currentRoute() {
  const hash = location.hash || "#/dashboard";
  return hash.split("?")[0];
}

async function render() {
  const route = currentRoute();
  if (route === "#/dashboard") return viewDashboard();
  if (route === "#/clients") return viewClients();
  if (route === "#/loans") return viewLoans();
  if (route === "#/loan") return viewLoanDetail();
  if (route === "#/setup") return viewSetup();
  if (route === "#/settings") return viewSettings();
  return viewDashboard();
}

function wireUI() {
  document.querySelectorAll(".tab").forEach(btn => btn.onclick = () => nav(btn.dataset.route));
  $("#settingsBtn").onclick = () => nav("#/settings");
  window.addEventListener("hashchange", () => render());
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./service-worker.js").catch(() => {});
}

(function init(){
  wireUI();
  if (!storage.apiKey) location.hash = "#/setup";
  if (!location.hash) location.hash = "#/dashboard";
  render().catch(e => toast(e.message));
})();
