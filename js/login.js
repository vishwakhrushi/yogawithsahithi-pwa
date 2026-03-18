/**
 * login.js — Token entry and API URL configuration
 */

// Pre-fill saved values
document.addEventListener("DOMContentLoaded", () => {
  const savedUrl = localStorage.getItem("YWSH_API_URL");
  const savedToken = localStorage.getItem("YWSH_TOKEN");

  if (savedUrl) document.getElementById("loginApiUrl").value = savedUrl;
  if (savedToken) document.getElementById("loginToken").value = savedToken;

  // If already logged in, go to dashboard
  if (api.isLoggedIn()) {
    onLoginSuccess();
  }
});

async function doLogin() {
  const urlInput   = document.getElementById("loginApiUrl");
  const tokenInput = document.getElementById("loginToken");
  const errorEl    = document.getElementById("loginError");
  const loginBtn   = document.getElementById("loginBtn");

  const url   = urlInput.value.trim();
  const token = tokenInput.value.trim();

  if (!url) { errorEl.textContent = "API URL is required."; return; }
  if (!token) { errorEl.textContent = "Token is required."; return; }

  errorEl.textContent = "";
  loginBtn.disabled = true;
  loginBtn.textContent = "Verifying...";

  try {
    // Temporarily set URL and token for the API call
    api.baseUrl = url;
    api.token = token;

    const result = await api.get("verifyToken");

    if (result.status === "success" && result.role) {
      // Save auth
      const remember = document.getElementById("loginRemember").checked;
      api.setAuth(url, token, result.email, result.role);

      if (!remember) {
        // Clear from localStorage on page unload if not remembering
        window.addEventListener("beforeunload", () => api.clearAuth(), { once: true });
      }

      showToast("Welcome! Logged in as " + result.role.replace("_", " "), "success");
      onLoginSuccess();
    } else {
      throw new Error("Invalid response from server.");
    }
  } catch (err) {
    errorEl.textContent = err.message || "Login failed. Check your URL and token.";
    api.baseUrl = "";
    api.token = "";
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Sign In";
  }
}

// Allow Enter key to submit
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  if (form) {
    form.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); doLogin(); }
    });
  }
});
