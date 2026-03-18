/**
 * api.js — Fetch wrapper for Apps Script REST API
 *
 * CORS Note: Apps Script deployed as "Anyone, even anonymous" handles
 * CORS via a redirect. Use Content-Type: text/plain for POSTs to avoid
 * preflight. Always use redirect: "follow".
 */

const api = {
  baseUrl: localStorage.getItem("YWSH_API_URL") || "",
  token:   localStorage.getItem("YWSH_TOKEN") || "",
  role:    localStorage.getItem("YWSH_ROLE") || "",
  email:   localStorage.getItem("YWSH_EMAIL") || "",

  setAuth(url, token, email, role) {
    this.baseUrl = url;
    this.token   = token;
    this.email   = email;
    this.role    = role;
    localStorage.setItem("YWSH_API_URL", url);
    localStorage.setItem("YWSH_TOKEN", token);
    localStorage.setItem("YWSH_EMAIL", email);
    localStorage.setItem("YWSH_ROLE", role);
  },

  clearAuth() {
    this.baseUrl = "";
    this.token   = "";
    this.email   = "";
    this.role    = "";
    localStorage.removeItem("YWSH_API_URL");
    localStorage.removeItem("YWSH_TOKEN");
    localStorage.removeItem("YWSH_EMAIL");
    localStorage.removeItem("YWSH_ROLE");
  },

  isLoggedIn() {
    return !!(this.baseUrl && this.token && this.role);
  },

  /**
   * GET request to Apps Script API
   * @param {string} action - API action name
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} - Parsed JSON response
   */
  async get(action, params = {}) {
    const url = new URL(this.baseUrl);
    url.searchParams.set("action", action);
    url.searchParams.set("token", this.token);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") {
        url.searchParams.set(k, String(v));
      }
    });

    const res = await fetch(url.toString(), { redirect: "follow" });
    if (!res.ok) throw new Error("Network error: " + res.status);
    const data = await res.json();

    if (data.status === "error" || data.error) {
      const msg = data.error || data.message || "Unknown error";
      if (msg.includes("Unauthorized")) this.onAuthFail();
      throw new Error(msg);
    }
    return data;
  },

  /**
   * POST request to Apps Script API
   * Content-Type must be text/plain to avoid CORS preflight
   * @param {string} action - API action name
   * @param {Object} body - Request body
   * @returns {Promise<Object>} - Parsed JSON response
   */
  async post(action, body = {}) {
    try {
      const res = await fetch(this.baseUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ ...body, action, token: this.token }),
        redirect: "follow",
      });
      if (!res.ok) throw new Error("Network error: " + res.status);
      const data = await res.json();

      if (data.status === "error" || data.error) {
        const msg = data.error || data.message || "Unknown error";
        if (msg.includes("Unauthorized")) this.onAuthFail();
        throw new Error(msg);
      }
      return data;
    } catch (err) {
      // If offline, queue for later
      if (!navigator.onLine) {
        await offlineQueue.enqueue(action, body);
        throw new Error("OFFLINE: Saved for sync when connected.");
      }
      throw err;
    }
  },

  onAuthFail() {
    this.clearAuth();
    window.location.hash = "#/login";
  },
};

// Role level helper
const ROLE_LEVEL = { VIEW_ONLY: 0, STAFF: 1, MANAGER: 2, ADMIN: 3 };

function hasRole(minRole) {
  return (ROLE_LEVEL[api.role] || 0) >= (ROLE_LEVEL[minRole] || 0);
}

function digitsOnly(s) {
  return String(s || "").replace(/\D/g, "");
}

function formatCurrency(n) {
  return "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
}
