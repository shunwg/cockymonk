// gallery.js — builds gallery.html's row of cards, one per GALLERY_SCREENS
// entry. Each card is an <iframe src="index.html?preview=<id>&theme=...">,
// so the actual screen is rendered by the real js/ui.js code (see its
// runGalleryPreview) — this file only builds chrome around it: the phone
// frame, refresh/theme buttons, and a feedback form that POSTs to
// /api/dev/gallery-feedback (server/gallery-feedback.mjs), gated by the same
// DEV_TOOLS flag as gallery.html itself.
import { GALLERY_SCREENS } from "./gallery-screens.js";

const row = document.getElementById("gallery-row");

function iframeSrc(screen, theme) {
  // A cache-busting param, not just src reassignment, so "Refresh" reliably
  // reloads even if the theme didn't change — some browsers no-op a src
  // reassignment to the exact same URL.
  return `index.html?preview=${encodeURIComponent(screen.id)}&theme=${encodeURIComponent(theme)}&_r=${Math.random().toString(36).slice(2)}`;
}

for (const screen of GALLERY_SCREENS) {
  const state = { theme: "light" }; // matches the app's actual default (js/storage.js loadTheme())

  const card = document.createElement("div");
  card.className = "gallery-card";

  const title = document.createElement("div");
  title.className = "gallery-card-title";
  title.textContent = screen.label;
  title.appendChild(Object.assign(document.createElement("span"), { className: "gallery-card-id", textContent: screen.id }));
  card.appendChild(title);

  const frame = document.createElement("div");
  frame.className = "gallery-phone-frame";
  const iframe = document.createElement("iframe");
  iframe.className = "gallery-iframe";
  iframe.src = iframeSrc(screen, state.theme);
  frame.appendChild(iframe);
  card.appendChild(frame);

  const controls = document.createElement("div");
  controls.className = "gallery-controls";

  const refreshBtn = document.createElement("button");
  refreshBtn.type = "button";
  refreshBtn.className = "gallery-btn";
  refreshBtn.textContent = "↻ Refresh";
  refreshBtn.addEventListener("click", () => { iframe.src = iframeSrc(screen, state.theme); });
  controls.appendChild(refreshBtn);

  const themeBtn = document.createElement("button");
  themeBtn.type = "button";
  themeBtn.className = "gallery-btn";
  themeBtn.textContent = `🎨 ${state.theme}`;
  themeBtn.addEventListener("click", () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    themeBtn.textContent = `🎨 ${state.theme}`;
    iframe.src = iframeSrc(screen, state.theme);
  });
  controls.appendChild(themeBtn);
  card.appendChild(controls);

  const form = document.createElement("form");
  form.className = "gallery-feedback-form";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Feedback on this screen…";
  input.className = "gallery-feedback-input";
  form.appendChild(input);

  const submitBtn = document.createElement("button");
  submitBtn.type = "submit";
  submitBtn.className = "gallery-btn gallery-btn-primary";
  submitBtn.textContent = "Send";
  form.appendChild(submitBtn);
  card.appendChild(form);

  const status = document.createElement("div");
  status.className = "gallery-feedback-status";
  card.appendChild(status);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const note = input.value.trim();
    if (!note) return;
    submitBtn.disabled = true;
    status.textContent = "";
    status.className = "gallery-feedback-status";
    try {
      const res = await fetch("/api/dev/gallery-feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ screenId: screen.id, screenLabel: screen.label, theme: state.theme, note }),
      });
      const data = await res.json();
      if (data.ok) {
        input.value = "";
        status.textContent = "Logged ✓";
        status.classList.add("ok");
      } else {
        status.textContent = "Failed to log.";
        status.classList.add("err");
      }
    } catch {
      status.textContent = "Failed to log — is the dev server running?";
      status.classList.add("err");
    } finally {
      submitBtn.disabled = false;
    }
  });

  row.appendChild(card);
}
