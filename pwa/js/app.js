/**
 * app.js — Hash router, screen management, role-based nav
 */

// ===================== ROUTING =====================

const SCREENS = ["login", "dashboard", "add-payment", "payments", "students", "whatsapp"];

// Min role required per screen (null = no auth needed)
const SCREEN_ROLES = {
  "login":       null,
  "dashboard":   "VIEW_ONLY",
  "add-payment": "STAFF",
  "payments":    "VIEW_ONLY",
  "students":    "VIEW_ONLY",
  "whatsapp":    "STAFF",
};

// Track if screen has been initialized
const screenLoaded = {};

function navigateTo(screen, navBtn) {
  window.location.hash = "#/" + screen;
}

function handleRoute() {
  const hash = (window.location.hash || "").replace("#/", "");
  const screen = SCREENS.includes(hash) ? hash : (api.isLoggedIn() ? "dashboard" : "login");

  // Auth check
  const minRole = SCREEN_ROLES[screen];
  if (minRole && !api.isLoggedIn()) {
    window.location.hash = "#/login";
    return;
  }
  if (minRole && !hasRole(minRole)) {
    showToast("You don't have permission to access this screen", "error");
    window.location.hash = "#/dashboard";
    return;
  }

  // Show/hide screens
  SCREENS.forEach(s => {
    const el = document.getElementById("screen-" + s);
    if (el) el.classList.toggle("active", s === screen);
  });

  // Show/hide app chrome
  const isLogin = screen === "login";
  document.getElementById("appHeader").style.display = isLogin ? "none" : "flex";
  document.getElementById("bottomNav").style.display = isLogin ? "none" : "flex";

  // Update nav active state
  document.querySelectorAll(".bottom-nav .nav-item").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.screen === screen);
  });

  // Init screen
  if (!isLogin && !screenLoaded[screen]) {
    screenLoaded[screen] = true;
    initScreen(screen);
  }
}

function initScreen(screen) {
  switch (screen) {
    case "dashboard":   loadDashboard(); break;
    case "add-payment": initAddPayment(); break;
    case "payments":    searchPayments(); break;
    case "students":    searchStudents(); break;
    case "whatsapp":    initWhatsApp(); break;
  }
}

// ===================== APP INIT =====================

window.addEventListener("hashchange", handleRoute);

document.addEventListener("DOMContentLoaded", () => {
  // Register service worker
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(e => console.warn("SW registration failed:", e));
  }

  // Set up role-based nav visibility
  updateNavVisibility();

  // Route
  handleRoute();
});

function updateNavVisibility() {
  const role = api.role;

  // Hide "Add" and "WhatsApp" for VIEW_ONLY
  const navAdd = document.getElementById("navAddPayment");
  const navWa  = document.getElementById("navWhatsApp");
  if (navAdd) navAdd.style.display = hasRole("STAFF") ? "flex" : "none";
  if (navWa)  navWa.style.display = hasRole("STAFF") ? "flex" : "none";

  // Hide broadcast tab for STAFF
  const broadcastTab = document.getElementById("waBroadcastTab");
  if (broadcastTab) broadcastTab.style.display = hasRole("MANAGER") ? "" : "none";

  // Show/hide export CSV button
  const exportBtn = document.getElementById("exportCsvBtn");
  if (exportBtn) exportBtn.style.display = hasRole("MANAGER") ? "" : "none";

  // Update user badge
  const badge = document.getElementById("userBadge");
  if (badge && role) {
    badge.textContent = role.replace("_", " ");
  }
}

function onLoginSuccess() {
  // Reset screen loaded state so they reload with fresh data
  Object.keys(screenLoaded).forEach(k => delete screenLoaded[k]);
  updateNavVisibility();
  window.location.hash = "#/dashboard";
}

function logout() {
  api.clearAuth();
  Object.keys(screenLoaded).forEach(k => delete screenLoaded[k]);
  window.location.hash = "#/login";
}

// ===================== TOAST NOTIFICATIONS =====================

function showToast(message, type = "info", duration = 3000) {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = "toast " + type;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s";
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ===================== MODAL =====================

function closeEditModal() {
  document.getElementById("editModal").classList.remove("active");
}

// Close modal on overlay click
document.addEventListener("click", (e) => {
  if (e.target.id === "editModal") closeEditModal();
});

// ===================== INSTALL PROMPT =====================

let deferredPrompt = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  // Could show an install button here
});
