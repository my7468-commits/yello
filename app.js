/* ===================================================================
   共用資料層(此為雛形版本:所有資料存放在瀏覽器 localStorage 中，
   僅此瀏覽器可見。未來要正式上線，可將 Store.* 方法改為呼叫後端 API，
   其餘頁面程式碼幾乎不需更動。)
   =================================================================== */

const STORAGE_KEYS = {
  reservations: "rb_reservations",
  menuFood: "rb_menu_food",
  menuAlcohol: "rb_menu_alcohol",
};

// 預設菜單資料（第一次開啟時自動寫入，之後可在「菜單管理模式」中修改）
const DEFAULT_FOOD = [
  { id: "f1", name: "松露野菇燉飯", price: 380, desc: "義大利米、綜合野菇、松露油", available: true },
  { id: "f2", name: "primo 炙燒和牛薄切", price: 620, desc: "澳洲和牛、海鹽、山葵醬", available: true },
  { id: "f3", name: "自製提拉米蘇", price: 180, desc: "手工馬斯卡彭起司、可可粉", available: true },
];

// 酒單分類（給下拉選單與分組顯示用）
const ALCOHOL_CATEGORIES = ["威士忌", "調酒", "紅白酒", "啤酒", "其它"];

const DEFAULT_ALCOHOL = [
  { id: "a1", name: "招牌梅酒 Sour", price: 260, desc: "日本梅酒、氣泡水、檸檬", available: true, category: "調酒" },
  { id: "a2", name: "Old Fashioned", price: 320, desc: "波本威士忌、苦精、橙皮", available: true, category: "調酒" },
  { id: "a3", name: "生啤酒（一杯）", price: 160, desc: "當季精釀，口味依供應調整", available: true, category: "啤酒" },
];

function uid(prefix) {
  return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function readList(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function writeList(key, list) {
  localStorage.setItem(key, JSON.stringify(list));
}

const Store = {
  // ---- 訂位 ----
  getReservations() {
    return readList(STORAGE_KEYS.reservations) || [];
  },
  addReservation(data) {
    const list = Store.getReservations();
    const record = {
      id: uid("r"),
      status: "pending", // pending / confirmed / cancelled，預留未來擴充狀態
      paymentStatus: "not_required", // 預留：未來若需收費，可用 unpaid / deposit / paid
      createdAt: new Date().toISOString(),
      ...data,
    };
    list.unshift(record);
    writeList(STORAGE_KEYS.reservations, list);
    return record;
  },
  removeReservation(id) {
    const list = Store.getReservations().filter((r) => r.id !== id);
    writeList(STORAGE_KEYS.reservations, list);
  },

  // ---- 菜單：食物 ----
  getFoodMenu() {
    let list = readList(STORAGE_KEYS.menuFood);
    if (!list) {
      list = DEFAULT_FOOD;
      writeList(STORAGE_KEYS.menuFood, list);
    }
    return list;
  },
  saveFoodMenu(list) {
    writeList(STORAGE_KEYS.menuFood, list);
  },

  // ---- 菜單：酒類 ----
  getAlcoholMenu() {
    let list = readList(STORAGE_KEYS.menuAlcohol);
    if (!list) {
      list = DEFAULT_ALCOHOL;
      writeList(STORAGE_KEYS.menuAlcohol, list);
    }
    return list;
  },
  saveAlcoholMenu(list) {
    writeList(STORAGE_KEYS.menuAlcohol, list);
  },
};

/* ===================================================================
   菜單共用同步：透過 config.js 的 WEBHOOK_URL（Google Apps Script）
   讀取／寫入共用菜單，讓所有裝置看到同一份資料。若尚未設定網址，
   或連線失敗，會自動退回使用本機 localStorage 快取。
   =================================================================== */

function isWebhookConfigured() {
  return typeof WEBHOOK_URL !== "undefined" && WEBHOOK_URL && WEBHOOK_URL.indexOf("PASTE_YOUR") === -1;
}

/* ---------------------------------------------------------------------
   Google Apps Script 網頁應用程式的回應「不會」帶 Access-Control-Allow-Origin
   標頭，所以瀏覽器用一般 fetch() 讀取回應內容一律會被 CORS 政策擋下來
   （不管是用 file:// 打開，還是部署到 GitHub Pages 等正式網址都一樣）。
   這裡改用 JSONP（動態插入 <script> 標籤）繞開這個限制：
   script 標籤載入外部資源不受 CORS 限制，Apps Script 那邊只要把 JSON
   包成 callbackName(JSON) 的函式呼叫格式回傳即可。
   --------------------------------------------------------------------- */
function jsonp(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const callbackName = "__jsonp_cb_" + Date.now() + "_" + Math.random().toString(36).slice(2);
    const script = document.createElement("script");
    let settled = false;

    function cleanup() {
      delete window[callbackName];
      if (script.parentNode) script.parentNode.removeChild(script);
      clearTimeout(timer);
    }

    window[callbackName] = function (data) {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(data);
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("timeout"));
    }, timeoutMs || 15000);

    script.onerror = function () {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("script_load_error"));
    };

    const sep = url.indexOf("?") === -1 ? "?" : "&";
    script.src = url + sep + "callback=" + callbackName;
    document.head.appendChild(script);
  });
}

async function fetchRemoteMenu() {
  if (!isWebhookConfigured()) return null;
  try {
    const data = await jsonp(`${WEBHOOK_URL}?action=getMenu`);
    if (data && Array.isArray(data.food) && Array.isArray(data.alcohol)) {
      Store.saveFoodMenu(data.food);
      Store.saveAlcoholMenu(data.alcohol);
      return data;
    }
    return null;
  } catch (err) {
    console.error("讀取共用菜單失敗，改用本機快取", err);
    return null;
  }
}

async function saveRemoteMenu(category, items, password) {
  if (!isWebhookConfigured()) return { ok: false, reason: "not_configured" };
  try {
    const url = `${WEBHOOK_URL}?action=saveMenu&category=${encodeURIComponent(category)}&password=${encodeURIComponent(password)}&items=${encodeURIComponent(JSON.stringify(items))}`;
    const data = await jsonp(url);
    if (data && data.result === "success") return { ok: true };
    return { ok: false, reason: data && data.message ? data.message : "unknown" };
  } catch (err) {
    console.error("寫入共用菜單失敗", err);
    return { ok: false, reason: "network" };
  }
}

/* ===================================================================
   訂位管理同步：供 admin.html 讀取所有訂位、更新狀態使用。
   =================================================================== */

async function fetchRemoteReservations(password) {
  if (!isWebhookConfigured()) return { ok: false, reason: "not_configured" };
  try {
    const url = `${WEBHOOK_URL}?action=getReservations&password=${encodeURIComponent(password)}`;
    const data = await jsonp(url);
    if (data && Array.isArray(data.reservations)) {
      return { ok: true, reservations: data.reservations };
    }
    return { ok: false, reason: data && data.message ? data.message : "unknown" };
  } catch (err) {
    console.error("讀取訂位清單失敗", err);
    return { ok: false, reason: "network" };
  }
}

async function updateRemoteReservationStatus(id, status, password) {
  if (!isWebhookConfigured()) return { ok: false, reason: "not_configured" };
  try {
    const url = `${WEBHOOK_URL}?action=updateReservationStatus&id=${encodeURIComponent(id)}&status=${encodeURIComponent(status)}&password=${encodeURIComponent(password)}`;
    const data = await jsonp(url);
    if (data && data.result === "success") return { ok: true };
    return { ok: false, reason: data && data.message ? data.message : "unknown" };
  } catch (err) {
    console.error("更新訂位狀態失敗", err);
    return { ok: false, reason: "network" };
  }
}

async function submitReservationRemote(data) {
  if (!isWebhookConfigured()) return false;
  try {
    const url = `${WEBHOOK_URL}?action=submitReservation&data=${encodeURIComponent(JSON.stringify(data))}`;
    const result = await jsonp(url);
    return !!(result && result.result === "success");
  } catch (err) {
    console.error("寫入 Google 試算表失敗", err);
    return false;
  }
}

function showToast(message) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove("show"), 2200);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}
