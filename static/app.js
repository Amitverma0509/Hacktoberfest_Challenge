const notesInput = document.getElementById("notes");
const charCount = document.getElementById("char-count");
const clearBtn = document.getElementById("clear-btn");
const modeCards = [...document.querySelectorAll(".mode-card")];
const generateBtn = document.getElementById("generate-btn");
const generateLabel = document.getElementById("generate-label");
const resultTitle = document.getElementById("result-title");
const emptyState = document.getElementById("empty-state");
const loadingState = document.getElementById("loading-state");
const loadingTitle = document.getElementById("loading-title");
const errorState = document.getElementById("error-state");
const resultContent = document.getElementById("result-content");
const resultFooter = document.getElementById("result-footer");
const copyBtn = document.getElementById("copy-btn");

const modes = {
  explain: { button: "Explain my notes", title: "Your simple explanation", loading: "Making your notes easier..." },
  quiz: { button: "Create my quiz", title: "Your practice quiz", loading: "Putting together your quiz..." },
  flashcards: { button: "Make flashcards", title: "Your revision flashcards", loading: "Creating your flashcards..." }
};
let selectedMode = "explain";
let latestResult = "";

modeCards.forEach((card) => {
  card.addEventListener("click", () => {
    selectedMode = card.dataset.mode;
    modeCards.forEach((item) => {
      const selected = item === card;
      item.classList.toggle("selected", selected);
      item.setAttribute("aria-pressed", String(selected));
    });
    generateLabel.textContent = modes[selectedMode].button;
  });
});

notesInput.addEventListener("input", () => {
  charCount.textContent = `${notesInput.value.length.toLocaleString()} / 12,000 characters`;
});

clearBtn.addEventListener("click", () => {
  notesInput.value = "";
  notesInput.dispatchEvent(new Event("input"));
  notesInput.focus();
});

function showOnly(state) {
  emptyState.hidden = state !== "empty";
  loadingState.hidden = state !== "loading";
  errorState.hidden = state !== "error";
  resultContent.hidden = state !== "result";
  resultFooter.hidden = state !== "result";
}

generateBtn.addEventListener("click", async () => {
  const notes = notesInput.value.trim();
  if (!notes) {
    notesInput.focus();
    errorState.textContent = "Paste a few lines of notes first, and I'll help you study them.";
    showOnly("error");
    return;
  }

  generateBtn.disabled = true;
  generateLabel.textContent = "Working...";
  loadingTitle.textContent = modes[selectedMode].loading;
  resultTitle.textContent = modes[selectedMode].title;
  showOnly("loading");

  try {
    const response = await fetch("/api/study", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes, mode: selectedMode })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
    latestResult = data.result;
    resultContent.classList.remove("is-deck", "is-explain");
    resultContent.textContent = "";
    deck = null;
    quiz = null;
    const render = { flashcards: renderDeck, quiz: renderQuiz, explain: renderExplain }[selectedMode];
    if (!render(latestResult)) resultContent.textContent = latestResult;
    showOnly("result");
  } catch (error) {
    errorState.textContent = error.message || "Couldn't reach StudySaathi. Check that Flask and Ollama are running.";
    showOnly("error");
  } finally {
    generateBtn.disabled = false;
    generateLabel.textContent = modes[selectedMode].button;
  }
});

copyBtn.addEventListener("click", async () => {
  if (!latestResult) return;
  try {
    await navigator.clipboard.writeText(latestResult);
    copyBtn.textContent = "Copied!";
    setTimeout(() => { copyBtn.textContent = "Copy result"; }, 1600);
  } catch {
    copyBtn.textContent = "Copy unavailable";
  }
});

/* ---------- Flashcard deck (result section only) ---------- */
let deck = null;

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function parseCards(text) {
  const clean = text.replace(/\*\*/g, "").replace(/\r/g, "");
  const re = /FRONT\s*:\s*([\s\S]*?)\s*BACK\s*:\s*([\s\S]*?)(?=\n\s*(?:#+\s*)?(?:\d+[.)]\s*)?(?:Card\s*\d+\s*:?\s*)?FRONT\s*:|$)/gi;
  const strip = (t) => t.trim().replace(/\s*(?:flash\s?card|card)\s*#?\d+\s*[:.\-]?\s*$/i, "").replace(/^\[|\]$/g, "").trim();
  const cards = [];
  let m;
  while ((m = re.exec(clean))) {
    const q = strip(m[1]), a = strip(m[2]);
    if (q && a) cards.push({ q, a, status: null });
  }
  return cards;
}

function renderDeck(text) {
  const cards = parseCards(text);
  if (!cards.length) return false; // model ignored the format -> show plain text
  deck = { cards, queue: cards.map((_, i) => i), pos: 0 };
  resultContent.classList.add("is-deck");
  drawDeck();
  return true;
}

function drawDeck() {
  const { cards, queue, pos } = deck;
  const known = cards.filter((c) => c.status === "known").length;
  const learning = cards.filter((c) => c.status === "learning").length;

  if (pos >= queue.length) {
    const missed = cards.length - known;
    resultContent.innerHTML = `
      <div class="fc-done">
        <div class="fc-done-badge">${missed === 0 ? "🎉" : "✦"}</div>
        <h3>${missed === 0 ? "Deck complete!" : "Nice round!"}</h3>
        <p class="fc-score"><strong>${known}</strong> / ${cards.length} cards known</p>
        <p class="fc-done-note">${missed === 0 ? "You knew every card. Come back tomorrow to keep it fresh." : "Revisit the ones you're still learning, repetition is how it sticks."}</p>
        <div class="fc-done-actions">
          ${missed ? `<button class="fc-btn primary" data-action="review" type="button">Review ${missed} missed</button>` : ""}
          <button class="fc-btn" data-action="restart" type="button">Start over</button>
        </div>
      </div>`;
    return;
  }

  const idx = queue[pos];
  const card = cards[idx];
  const tone = idx % 4;
  const more = queue.length - pos - 1;
  resultContent.innerHTML = `
    <div class="fc-progress">
      <div class="fc-bar"><span style="width:${(pos / queue.length) * 100}%"></span></div>
      <div class="fc-meta">
        <span>Card ${pos + 1} of ${queue.length}</span>
        <span class="fc-counts"><b class="c-know">✓ ${known}</b><b class="c-learn">↻ ${learning}</b></span>
      </div>
    </div>
    <div class="fc-stage ${more > 0 ? "has-more" : ""} ${more > 1 ? "has-more-2" : ""}">
      <div class="fc-card" data-action="flip" role="button" tabindex="0" aria-label="Flashcard. Press to flip.">
        <div class="fc-inner">
          <div class="fc-face fc-front tone-${tone}">
            <span class="fc-tag">QUESTION · ${String(idx + 1).padStart(2, "0")}</span>
            <p class="fc-text">${esc(card.q)}</p>
            <span class="fc-hint">Tap to reveal ↻</span>
          </div>
          <div class="fc-face fc-back">
            <span class="fc-tag">ANSWER</span>
            <p class="fc-text">${esc(card.a)}</p>
            <span class="fc-hint">Tap to flip back ↻</span>
          </div>
        </div>
      </div>
    </div>
    <div class="fc-rate">
      <button class="fc-btn learn" data-action="learn" type="button">↻ Still learning</button>
      <button class="fc-btn know" data-action="know" type="button">✓ Got it</button>
    </div>
    <div class="fc-nav">
      <button class="fc-icon" data-action="prev" type="button" aria-label="Previous card" ${pos === 0 ? "disabled" : ""}>←</button>
      <button class="fc-shuffle" data-action="shuffle" type="button">⤮ Shuffle</button>
      <button class="fc-icon" data-action="next" type="button" aria-label="Next card">→</button>
    </div>`;
}

function deckAction(action) {
  if (!deck) return;
  const { cards, queue } = deck;
  if (action === "flip") {
    const el = resultContent.querySelector(".fc-card");
    if (el) el.classList.toggle("flipped");
    return;
  }
  if (action === "know" || action === "learn") {
    if (deck.pos < queue.length) cards[queue[deck.pos]].status = action === "know" ? "known" : "learning";
    deck.pos++;
  } else if (action === "next") {
    if (deck.pos < queue.length) deck.pos++;
  } else if (action === "prev") {
    deck.pos = Math.max(0, deck.pos - 1);
  } else if (action === "shuffle") {
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
    deck.pos = 0;
  } else if (action === "review") {
    deck.queue = cards.map((c, i) => (c.status !== "known" ? i : -1)).filter((i) => i >= 0);
    deck.pos = 0;
  } else if (action === "restart") {
    cards.forEach((c) => (c.status = null));
    deck.queue = cards.map((_, i) => i);
    deck.pos = 0;
  }
  drawDeck();
}

resultContent.addEventListener("click", (e) => {
  const target = e.target.closest("[data-action]");
  if (target) deckAction(target.dataset.action);
});

document.addEventListener("keydown", (e) => {
  if (!deck || resultContent.hidden) return;
  const t = e.target;
  if (t.matches("textarea, input") || (t.matches("button") && !t.classList.contains("fc-card"))) return;
  if (e.key === " " || e.key === "Enter") { e.preventDefault(); deckAction("flip"); }
  else if (e.key === "ArrowRight") deckAction("next");
  else if (e.key === "ArrowLeft") deckAction("prev");
});

/* ---------- Explain view ---------- */
const inline = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`(.+?)`/g, "<code>$1</code>");
const SEC_KEY = /summary|key (ideas?|points?|concepts?)|example|analogy|terms?|vocabulary|recap|takeaway|conclusion|overview|remember/i;
const SEC_ICON = [[/summary|overview/i, "☼", 0], [/key/i, "✦", 3], [/example|analogy/i, "✎", 1], [/term|vocab/i, "▤", 2], [/recap|takeaway|conclusion|remember/i, "✓", 3]];

function parseHeading(line) {
  let m = line.match(/^\s*#{1,4}\s*(.+?)\s*#*\s*$/);
  if (m) return { title: m[1], rest: "" };
  m = line.match(/^\s*(?:\d+[.)]\s*)?\*\*(.+?)\*\*\s*:?\s*(.*)$/);
  if (m && m[1].length < 60 && SEC_KEY.test(m[1])) return { title: m[1], rest: m[2] };
  m = line.match(/^\s*\d+[.)]\s*([A-Za-z][^:\n]{1,50}?)\s*:?\s*$/);
  if (m && SEC_KEY.test(m[1])) return { title: m[1], rest: "" };
  return null;
}

function renderBody(lines) {
  let html = "", list = null;
  const close = () => { if (list) { html += `</${list}>`; list = null; } };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || /^[-_*]{3,}$/.test(line)) { close(); continue; }
    const b = line.match(/^[-*•]\s+(.*)/);
    const n = !b && line.match(/^\d+[.)]\s+(.*)/);
    if (b || n) {
      const t = b ? "ul" : "ol";
      if (list !== t) { close(); html += `<${t}>`; list = t; }
      html += `<li>${inline((b || n)[1])}</li>`;
    } else { close(); html += `<p>${inline(line)}</p>`; }
  }
  close();
  return html;
}

function renderExplain(text) {
  const lines = text.replace(/\r/g, "").split("\n");
  const intro = [], secs = [];
  let cur = null;
  for (const l of lines) {
    const h = parseHeading(l);
    if (h) {
      cur = { title: h.title.replace(/\*+/g, "").replace(/^\d+[.)]\s*/, "").replace(/[:\s]+$/, "").trim(), lines: h.rest ? [h.rest] : [] };
      secs.push(cur);
    } else (cur ? cur.lines : intro).push(l);
  }
  if (!secs.length) secs.push({ title: "Your explanation", lines: intro.splice(0) });
  const introHtml = intro.some((x) => x.trim()) ? `<div class="ex-intro">${renderBody(intro)}</div>` : "";
  resultContent.classList.add("is-deck", "is-explain");
  resultContent.innerHTML = introHtml + secs.map((sec, i) => {
    const hit = SEC_ICON.find(([re]) => re.test(sec.title));
    const [, icon, tone] = hit || [null, "✦", i % 4];
    return `<section class="ex-sec" style="animation-delay:${i * 70}ms">
      <div class="ex-head"><span class="ex-ic i${tone}">${icon}</span><h4>${esc(sec.title)}</h4></div>
      <div class="ex-body">${renderBody(sec.lines)}</div></section>`;
  }).join("");
  return true;
}

/* ---------- Quiz view ---------- */
let quiz = null;

function parseQuiz(text) {
  const clean = ("\n" + text.replace(/\*\*/g, "").replace(/\r/g, ""));
  const blocks = clean.split(/\n\s*(?:#{1,4}\s*)?(?:(?:Question|Q)\s*\d+\s*[.):]?|\d+\s*[.)])\s*/i).slice(1);
  const optRe = /^\s*[-*]?\s*\(?([A-D])[.):]\s+(.+)$/;
  const ansRe = /^\s*[-*]?\s*(?:correct\s+)?answer\s*(?:is)?\s*:?\s*\(?([A-D])\b/i;
  const expRe = /^\s*[-*]?\s*(?:explanation|why)\s*:?\s*(.*)$/i;
  const qs = [];
  for (const block of blocks) {
    const q = { text: [], opts: [], ans: null, exp: [] };
    let phase = "q", m;
    for (const line of block.split("\n")) {
      if (phase !== "exp" && (m = line.match(ansRe))) { q.ans = m[1].toUpperCase(); phase = "after"; continue; }
      if ((m = line.match(expRe))) { phase = "exp"; if (m[1]) q.exp.push(m[1]); continue; }
      if (phase === "exp") { if (line.trim()) q.exp.push(line.trim()); continue; }
      if (phase === "after") continue;
      if ((m = line.match(optRe))) { q.opts.push({ k: m[1].toUpperCase(), t: m[2].trim() }); phase = "opts"; }
      else if (line.trim()) (phase === "opts" ? (q.opts[q.opts.length - 1].t += " " + line.trim()) : q.text.push(line.trim()));
    }
    if (q.opts.length >= 2 && q.opts.some((o) => o.k === q.ans)) qs.push({ q: q.text.join(" "), opts: q.opts, ans: q.ans, exp: q.exp.join(" ") });
  }
  return qs;
}

function renderQuiz(text) {
  const qs = parseQuiz(text);
  if (!qs.length) return false;
  quiz = { qs, pos: 0, score: 0, picked: null };
  resultContent.classList.add("is-deck");
  drawQuiz();
  return true;
}

function drawQuiz() {
  const { qs, pos, score, picked } = quiz;
  if (pos >= qs.length) {
    const pct = score / qs.length;
    resultContent.innerHTML = `
      <div class="fc-done">
        <div class="fc-done-badge">${pct === 1 ? "🎉" : pct >= .6 ? "✦" : "☼"}</div>
        <h3>${pct === 1 ? "Perfect score!" : pct >= .6 ? "Nicely done!" : "Good start!"}</h3>
        <p class="fc-score"><strong>${score}</strong> / ${qs.length} correct</p>
        <p class="fc-done-note">${pct === 1 ? "You really know this topic." : "Read the explanations again and give it another go, practice makes it stick."}</p>
        <div class="fc-done-actions"><button class="fc-btn primary" data-qa="retry" type="button">Try again</button></div>
      </div>`;
    return;
  }
  const q = qs[pos], answered = picked !== null;
  const opts = q.opts.map((o) => {
    let cls = "";
    if (answered) cls = o.k === q.ans ? "correct" : o.k === picked ? "wrong" : "dim";
    return `<button class="qz-opt ${cls}" data-qa="pick" data-opt="${o.k}" type="button" ${answered ? "disabled" : ""}>
      <span class="qz-letter">${answered && o.k === q.ans ? "✓" : answered && o.k === picked ? "✕" : o.k}</span><span>${esc(o.t)}</span></button>`;
  }).join("");
  const ok = picked === q.ans;
  const fb = answered ? `<div class="qz-fb ${ok ? "good" : "bad"}"><strong>${ok ? "✓ Correct!" : `✕ Not quite, the answer is ${q.ans}.`}</strong>${esc(q.exp || "")}</div>` : "";
  resultContent.innerHTML = `
    <div class="fc-progress">
      <div class="fc-bar"><span style="width:${((pos + (answered ? 1 : 0)) / qs.length) * 100}%"></span></div>
      <div class="fc-meta"><span>Question ${pos + 1} of ${qs.length}</span><span class="fc-counts"><b class="c-know">★ ${score}</b></span></div>
    </div>
    <div class="qz-card ${answered ? "still" : ""}"><span class="fc-tag">QUESTION ${String(pos + 1).padStart(2, "0")}</span><p class="qz-q">${esc(q.q)}</p></div>
    <div class="qz-opts">${opts}</div>${fb}
    ${answered ? `<button class="fc-btn primary qz-next" data-qa="next" type="button">${pos + 1 < qs.length ? "Next question →" : "See results →"}</button>` : ""}`;
}

function quizAction(action, opt) {
  if (action === "pick" && quiz.picked === null) {
    quiz.picked = opt;
    if (opt === quiz.qs[quiz.pos].ans) quiz.score++;
  } else if (action === "next" && quiz.picked !== null) {
    quiz.pos++; quiz.picked = null;
  } else if (action === "retry") {
    quiz.pos = 0; quiz.score = 0; quiz.picked = null;
  } else return;
  drawQuiz();
}

resultContent.addEventListener("click", (e) => {
  const t = e.target.closest("[data-qa]");
  if (t && quiz) quizAction(t.dataset.qa, t.dataset.opt);
});

document.addEventListener("keydown", (e) => {
  if (!quiz || resultContent.hidden || e.target.matches("textarea, input")) return;
  if (/^[a-d]$/i.test(e.key)) quizAction("pick", e.key.toUpperCase());
  else if (e.key === "Enter" && quiz.picked !== null && !e.target.matches("button")) quizAction("next");
});

/* ---------- Theme (light / dark) ---------- */
(function () {
  const root = document.documentElement;
  const meta = document.querySelector('meta[name="theme-color"]');
  let theme;
  try { theme = localStorage.getItem("ss-theme"); } catch {}
  if (!theme) theme = window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

  const pill = document.querySelector(".local-pill");
  const wrap = document.createElement("div");
  wrap.className = "topbar-right";
  pill.parentNode.insertBefore(wrap, pill);
  wrap.appendChild(pill);
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "theme-toggle";
  wrap.appendChild(btn);

  function apply() {
    root.dataset.theme = theme;
    btn.textContent = theme === "dark" ? "☀" : "☾";
    btn.title = btn.ariaLabel = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
    if (meta) meta.content = theme === "dark" ? "#14170f" : "#f7f6f2";
  }
  btn.addEventListener("click", () => {
    theme = theme === "dark" ? "light" : "dark";
    try { localStorage.setItem("ss-theme", theme); } catch {}
    apply();
  });
  apply();
})();