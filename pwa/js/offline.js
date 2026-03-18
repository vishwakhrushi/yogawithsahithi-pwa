/**
 * offline.js — IndexedDB-based offline queue
 *
 * When API POST calls fail due to no network, they are queued in IndexedDB.
 * When the device comes back online, queued actions are replayed automatically.
 */

const offlineQueue = {
  DB_NAME: "ywsh_offline",
  STORE_NAME: "queue",
  db: null,

  async open() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.DB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME, { keyPath: "id", autoIncrement: true });
        }
      };
      req.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  },

  async enqueue(action, body) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, "readwrite");
      tx.objectStore(this.STORE_NAME).add({
        action,
        body,
        timestamp: Date.now(),
      });
      tx.oncomplete = () => {
        this.updateBadge();
        resolve();
      };
      tx.onerror = (e) => reject(e.target.error);
    });
  },

  async getAll() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, "readonly");
      const req = tx.objectStore(this.STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = (e) => reject(e.target.error);
    });
  },

  async remove(id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, "readwrite");
      tx.objectStore(this.STORE_NAME).delete(id);
      tx.oncomplete = resolve;
      tx.onerror = (e) => reject(e.target.error);
    });
  },

  async count() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, "readonly");
      const req = tx.objectStore(this.STORE_NAME).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });
  },

  async flush() {
    if (!navigator.onLine) return;

    const items = await this.getAll();
    if (items.length === 0) return;

    let synced = 0;
    let failed = 0;

    for (const item of items) {
      try {
        const res = await fetch(api.baseUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({ ...item.body, action: item.action, token: api.token }),
          redirect: "follow",
        });
        const data = await res.json();

        if (data.status !== "error" && !data.error) {
          await this.remove(item.id);
          synced++;
        } else {
          failed++;
        }
      } catch (e) {
        failed++;
        break; // Stop if still offline
      }
    }

    this.updateBadge();

    if (synced > 0) {
      showToast(`Synced ${synced} offline payment${synced > 1 ? "s" : ""}`, "success");
    }
    if (failed > 0) {
      showToast(`${failed} item${failed > 1 ? "s" : ""} failed to sync`, "warning");
    }
  },

  async updateBadge() {
    const n = await this.count();
    const badge = document.getElementById("offlineCount");
    if (badge) {
      badge.textContent = String(n);
      badge.style.display = n > 0 ? "flex" : "none";
    }
  },
};

// --- Online/Offline detection ---

window.addEventListener("online", () => {
  document.getElementById("offlineBanner").classList.remove("active");
  offlineQueue.flush();
});

window.addEventListener("offline", () => {
  document.getElementById("offlineBanner").classList.add("active");
});

// Init offline state on load
document.addEventListener("DOMContentLoaded", () => {
  if (!navigator.onLine) {
    document.getElementById("offlineBanner").classList.add("active");
  }
  offlineQueue.updateBadge();
});
