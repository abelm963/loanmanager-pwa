/* LoanManager PWA — FULL STABLE VERSION */

const DEFAULT_API_URL =
  "https://script.google.com/macros/s/AKfycbyaOhLY8lf0zwGQ2XdosVOizWKuT4-dlaKvVLhmfKH9w6zEH4tYSihezsg4TEUhcGDcmA/exec";

const storage = {
  get apiUrl() {
    return localStorage.getItem("lm_api_url") || DEFAULT_API_URL;
  },
  set apiUrl(v) {
    localStorage.setItem("lm_api_url", v);
  },
  get apiKey() {
    return localStorage.getItem("lm_api_key") || "";
  },
  set apiKey(v) {
    localStorage.setItem("lm_api_key", v);
  }
};

const state = {
  clients: [],
  loans: [],
  currentLoan: null,
  currentTx: [],
  viewToken: 0
};

const $ = (s) => document.querySelector(s);

function isRoute(hash) {
  return (location.hash || "").split("?")[0] === hash;
}

function toast(msg) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 3000);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function zarmoney(n) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR"
  }).format(Number(n || 0));
}

function toISODate(d) {
  const dt = new Date(d);
  return dt.toISOString().slice(0, 10);
}

/* ================= API ================= */

async function apiGet(action, params = {}) {
  const key = storage.apiKey;
  if (!key) throw new Error("API key missing");

  const url =
    storage.apiUrl +
    "?" +
    new URLSearchParams({ action, key, ...params }).toString();

  const res = await fetch(url);
  const data = await res.json();

  if (!data.ok) throw new Error(data.error || "API error");
  return data;
}

async function apiPost(body) {
  const key = storage.apiKey;
  if (!key) throw new Error("API key missing");

  const url = storage.apiUrl + "?key=" + encodeURIComponent(key);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: JSON.stringify(body)
  });

  const data = await res.json();

  if (!data.ok) throw new Error(data.error || "API error");
  return data;
}

/* ================= ROUTING ================= */

function nav(h) {
  location.hash = h;
}

function parseParams() {
  const hash = location.hash;
  const i = hash.indexOf("?");
  if (i === -1) return {};
  return Object.fromEntries(new URLSearchParams(hash.slice(i + 1)));
}

function requireSetup() {
  if (!storage.apiKey) {
    nav("#/setup");
    return false;
  }
  return true;
}

function setTitle(t) {
  $("#title").textContent = t;
}

function setBack(show, fn) {
  const b = $("#backBtn");
  if (!b) return;

  if (!show) {
    b.classList.add("hidden");
    b.onclick = null;
  } else {
    b.classList.remove("hidden");
    b.onclick = fn;
  }
}

/* ================= SETUP ================= */

function viewSetup() {
  setTitle("Setup");
  setBack(false);

  $("#view").innerHTML = `
  <div class="card">
    <h2>Connect backend</h2>
    <input class="input" id="apiUrl" value="${escapeHtml(
      storage.apiUrl
    )}" />
    <input class="input" id="apiKey" placeholder="API key"
      value="${escapeHtml(storage.apiKey)}" />
    <button class="btn" id="saveBtn">Save & Test</button>
  </div>
`;

  $("#saveBtn").onclick = async () => {
    storage.apiUrl = $("#apiUrl").value.trim();
    storage.apiKey = $("#apiKey").value.trim();

    try {
      await apiGet("ping");
      toast("Connected");
      nav("#/dashboard");
    } catch (e) {
      toast(e.message);
    }
  };
}

/* ================= DASHBOARD ================= */

async function viewDashboard() {
  if (!requireSetup()) return;

  const token = ++state.viewToken;

  setTitle("Dashboard");
  setBack(false);

  $("#view").innerHTML = "Loading…";

  try {
    const data = await apiGet("loans");

    if (token !== state.viewToken) return;

    const loans = data.loans || [];

    const total = loans.reduce(
      (a, l) => a + Number(l.OutstandingSnapshot || 0),
      0
    );

    $("#view").innerHTML = `
      <div class="card">
        <h2>Total outstanding</h2>
        <div>${zarmoney(total)}</div>
      </div>
      <div class="card">
        <button class="btn" id="addClient">Add client</button>
        <button class="btn secondary" id="addLoan">Add loan</button>
      </div>
    `;

    $("#addClient").onclick = () => nav("#/clients?new=1");
    $("#addLoan").onclick = () => nav("#/loans?new=1");

  } catch (e) {
    toast(e.message);
  }
}

/* ================= CLIENTS ================= */

async function viewClients() {
  if (!requireSetup()) return;

  const token = ++state.viewToken;

  setTitle("Clients");
  setBack(false);

  $("#view").innerHTML = `
  <div class="card">
    <button class="btn" id="addBtn">Add client</button>
    <div id="clientsList"></div>
  </div>
  <div id="form"></div>
`;

  $("#addBtn").onclick = renderClientForm;

  try {
    const data = await apiGet("clients");

    if (token !== state.viewToken || !isRoute("#/clients")) return;

    state.clients = data.clients || [];
    renderClientsList();

  } catch (e) {
    toast(e.message);
  }
}

function renderClientsList() {

  const wrap = $("#clientsList");

  if (!wrap) return;

  if (!state.clients.length) {
    wrap.innerHTML = "No clients";
    return;
  }

  wrap.innerHTML = state.clients
    .map(
      (c) => `
<div class="listItem">
<b>${escapeHtml(c.FullName)}</b><br>
${escapeHtml(c.PhoneNumber)}
</div>
`
    )
    .join("");
}

function renderClientForm() {

  $("#form").innerHTML = `
<div class="card">
<input id="name" class="input" placeholder="Name">
<input id="phone" class="input" placeholder="Phone">
<button class="btn" id="save">Save</button>
</div>
`;

  $("#save").onclick = async () => {

    try {

      await apiPost({
        action: "createClient",
        fullName: $("#name").value,
        phoneNumber: $("#phone").value
      });

      toast("Client created");

      viewClients();

    } catch (e) {
      toast(e.message);
    }

  };
}

/* ================= LOANS ================= */

async function viewLoans() {

  if (!requireSetup()) return;

  const token = ++state.viewToken;

  setTitle("Loans");
  setBack(false);

  $("#view").innerHTML = "Loading…";

  try {

    const data = await apiGet("loans");

    if (token !== state.viewToken) return;

    state.loans = data.loans || [];

    $("#view").innerHTML = state.loans
      .map(
        (l) => `
<div class="listItem">
${zarmoney(l.OutstandingSnapshot)}
</div>`
      )
      .join("");

  } catch (e) {
    toast(e.message);
  }
}

/* ================= SETTINGS ================= */

function viewSettings() {

  setTitle("Settings");

  $("#view").innerHTML = `
<input id="key" value="${escapeHtml(storage.apiKey)}">
<button id="save">Save</button>
`;

  $("#save").onclick = () => {
    storage.apiKey = $("#key").value;
    toast("Saved");
  };
}

/* ================= MAIN ================= */

async function render() {

  const r = location.hash.split("?")[0];

  if (r === "#/setup") return viewSetup();
  if (r === "#/clients") return viewClients();
  if (r === "#/loans") return viewLoans();
  if (r === "#/settings") return viewSettings();

  return viewDashboard();
}

function init() {

  window.addEventListener("hashchange", render);

  document.querySelectorAll(".tab").forEach((b) =>
    b.onclick = () => nav(b.dataset.route)
  );

  if (!storage.apiKey) nav("#/setup");

  render();

}

init();
