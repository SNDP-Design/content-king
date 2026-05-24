// This file mirrors public/app.js so GitHub Pages can publish /docs.
const platforms = {
  linkedin: { limit: 3000 },
  x: { limit: 280 },
  instagram: { limit: 2200 },
  reddit: { limit: 40000 }
};

const state = {
  mode: "url",
  extracted: null,
  result: null,
  history: JSON.parse(localStorage.getItem("contentKingHistory") || "[]")
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const elements = {
  sourceUrl: $("#sourceUrl"),
  sourceNotes: $("#sourceNotes"),
  company: $("#company"),
  audience: $("#audience"),
  goal: $("#goal"),
  tone: $("#tone"),
  cta: $("#cta"),
  apiKey: $("#apiKey"),
  apiBase: $("#apiBase"),
  extractBtn: $("#extractBtn"),
  generateBtn: $("#generateBtn"),
  clearBtn: $("#clearBtn"),
  exportBtn: $("#exportBtn"),
  clearHistoryBtn: $("#clearHistoryBtn"),
  results: $("#results"),
  alert: $("#alert"),
  apiStatus: $("#apiStatus"),
  historyList: $("#historyList"),
  template: $("#postCardTemplate")
};

const apiConfig = {
  base: localStorage.getItem("contentKingApiBase") || ""
};

function apiUrl(path) {
  const base = (apiConfig.base || "").trim().replace(/\/+$/, "");
  return base ? `${base}${path}` : path;
}

function setAlert(message, tone = "error") {
  elements.alert.hidden = !message;
  elements.alert.textContent = message || "";
  elements.alert.style.borderColor = tone === "ok" ? "rgba(15,118,110,.28)" : "rgba(184,79,100,.28)";
  elements.alert.style.color = tone === "ok" ? "#115e59" : "#7d2637";
  elements.alert.style.background = tone === "ok" ? "rgba(15,118,110,.08)" : "rgba(184,79,100,.08)";
}

function setBusy(button, busy, label) {
  button.disabled = busy;
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = label;
  } else {
    button.textContent = button.dataset.label || button.textContent;
  }
}

function campaignPayload() {
  return {
    company: elements.company.value.trim(),
    audience: elements.audience.value.trim(),
    goal: elements.goal.value,
    tone: elements.tone.value,
    cta: elements.cta.value.trim()
  };
}

function sourcePayload() {
  const notes = elements.sourceNotes.value.trim();
  const extracted = state.extracted || {};
  return {
    title: extracted.title || "",
    description: extracted.description || "",
    sourceUrl: elements.sourceUrl.value.trim(),
    sourceText: [extracted.text, notes].filter(Boolean).join("\n\n"),
    campaign: campaignPayload(),
    apiKey: elements.apiKey.value.trim()
  };
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function countChars(value) {
  return [...value].length;
}

function platformLimitLabel(key, count) {
  const limit = platforms[key]?.limit;
  if (!limit) return "";
  return count > limit ? `${count - limit} over limit` : `${limit - count} left`;
}

function renderEmpty() {
  elements.results.innerHTML = `<div class="empty-state">Add a source and generate posts for LinkedIn, X, Instagram, and Reddit.</div>`;
}

function renderResults(result) {
  elements.results.innerHTML = "";
  const posts = result?.posts || {};
  Object.entries(posts).forEach(([key, item]) => {
    const node = elements.template.content.cloneNode(true);
    const card = node.querySelector(".post-card");
    const textarea = node.querySelector(".post-text");
    const charCount = node.querySelector(".char-count");
    const limitNote = node.querySelector(".limit-note");
    const tips = node.querySelector(".tips");

    node.querySelector(".platform").textContent = item.platform || key;
    node.querySelector("h3").textContent = item.title || "Draft";
    textarea.value = item.post || "";
    textarea.addEventListener("input", () => updateCount());
    node.querySelector(".copy-btn").addEventListener("click", async (event) => {
      await navigator.clipboard.writeText(textarea.value);
      event.currentTarget.textContent = "Copied";
      setTimeout(() => (event.currentTarget.textContent = "Copy"), 1100);
    });

    (item.tips || []).forEach((tip) => {
      const li = document.createElement("li");
      li.textContent = tip;
      tips.append(li);
    });

    function updateCount() {
      const count = countChars(textarea.value);
      charCount.textContent = `${count.toLocaleString()} characters`;
      limitNote.textContent = platformLimitLabel(key, count);
      limitNote.classList.toggle("warning", count > (platforms[key]?.limit || Infinity));
    }
    updateCount();
    elements.results.append(card);
  });
  elements.exportBtn.disabled = !result;
}

function saveHistory(result) {
  const source = elements.sourceUrl.value.trim() || elements.sourceNotes.value.trim().slice(0, 72) || "Untitled source";
  const item = {
    id: crypto.randomUUID(),
    source,
    date: new Date().toISOString(),
    result
  };
  state.history = [item, ...state.history].slice(0, 12);
  localStorage.setItem("contentKingHistory", JSON.stringify(state.history));
  renderHistory();
}

function renderHistory() {
  elements.historyList.innerHTML = "";
  if (!state.history.length) {
    elements.historyList.innerHTML = `<div class="empty-state">Saved generations appear here.</div>`;
    return;
  }
  state.history.forEach((item) => {
    const button = document.createElement("button");
    button.className = "history-item";
    button.type = "button";
    button.innerHTML = `<strong>${escapeHtml(item.source)}</strong><span>${new Date(item.date).toLocaleString()}</span>`;
    button.addEventListener("click", () => {
      state.result = item.result;
      renderResults(item.result);
      setAlert("Loaded a previous generation.", "ok");
    });
    elements.historyList.append(button);
  });
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char];
  });
}

async function extractUrl() {
  setAlert("");
  const url = elements.sourceUrl.value.trim();
  if (!url) {
    setAlert("Paste a URL first.");
    return false;
  }
  setBusy(elements.extractBtn, true, "Fetching");
  try {
    state.extracted = await postJson(apiUrl("/api/extract"), { url });
    elements.sourceNotes.value = [state.extracted.title, state.extracted.description, state.extracted.text]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 12000);
    setAlert("Source fetched. You can edit the notes before generating.", "ok");
    return true;
  } catch (error) {
    setAlert(error.message);
    return false;
  } finally {
    setBusy(elements.extractBtn, false);
  }
}

async function generate() {
  setAlert("");
  if (elements.sourceUrl.value.trim() && !elements.sourceNotes.value.trim() && !state.extracted) {
    const fetched = await extractUrl();
    if (!fetched) return;
  }
  setBusy(elements.generateBtn, true, "Generating");
  elements.results.innerHTML = `
    <article class="post-card loading"><header><div><p class="platform">LinkedIn</p><h3>Drafting...</h3></div></header><textarea class="post-text" disabled></textarea></article>
    <article class="post-card loading"><header><div><p class="platform">X</p><h3>Drafting...</h3></div></header><textarea class="post-text" disabled></textarea></article>
    <article class="post-card loading"><header><div><p class="platform">Instagram</p><h3>Drafting...</h3></div></header><textarea class="post-text" disabled></textarea></article>
    <article class="post-card loading"><header><div><p class="platform">Reddit</p><h3>Drafting...</h3></div></header><textarea class="post-text" disabled></textarea></article>
  `;
  try {
    const result = await postJson(apiUrl("/api/generate"), sourcePayload());
    state.result = result;
    renderResults(result);
    saveHistory(result);
    elements.apiStatus.textContent = result.isFallback ? "Demo drafts" : "Gemini generated";
    setAlert(result.warning || "Posts generated.", result.warning ? "error" : "ok");
  } catch (error) {
    renderEmpty();
    setAlert(error.message);
  } finally {
    setBusy(elements.generateBtn, false);
  }
}

function setMode(mode) {
  state.mode = mode;
  $$(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.sourceMode === mode));
  $(".url-field").style.display = mode === "url" ? "grid" : "none";
  if (mode === "notes") elements.sourceNotes.focus();
}

function exportJson() {
  if (!state.result) return;
  const blob = new Blob([JSON.stringify(state.result, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `content-king-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function clearForm() {
  state.extracted = null;
  state.result = null;
  [elements.sourceUrl, elements.sourceNotes, elements.company, elements.audience, elements.cta, elements.apiKey].forEach(
    (input) => (input.value = "")
  );
  elements.goal.selectedIndex = 0;
  elements.tone.selectedIndex = 0;
  elements.exportBtn.disabled = true;
  setAlert("");
  renderEmpty();
}

function wireApiBase() {
  elements.apiBase.value = apiConfig.base;
  elements.apiBase.addEventListener("change", () => {
    apiConfig.base = elements.apiBase.value.trim();
    localStorage.setItem("contentKingApiBase", apiConfig.base);
    setAlert(apiConfig.base ? "API endpoint saved." : "Using built-in API endpoint.", "ok");
  });
  if (location.hostname.endsWith("github.io") && !apiConfig.base) {
    setAlert("This page is on GitHub Pages. Add your API endpoint under Advanced settings.", "error");
  }
}

$$(".tab").forEach((tab) => tab.addEventListener("click", () => setMode(tab.dataset.sourceMode)));
elements.extractBtn.addEventListener("click", extractUrl);
elements.generateBtn.addEventListener("click", generate);
elements.clearBtn.addEventListener("click", clearForm);
elements.exportBtn.addEventListener("click", exportJson);
elements.clearHistoryBtn.addEventListener("click", () => {
  state.history = [];
  localStorage.removeItem("contentKingHistory");
  renderHistory();
});

setMode("url");
renderEmpty();
renderHistory();
wireApiBase();

