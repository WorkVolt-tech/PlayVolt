"use strict";

const API_URL = "https://eybzbtyfafmqbkulyvog.supabase.co/functions/v1/pin-and-spin";
const SESSION_KEY = "pin_and_spin_session_v1";
const NAME_KEY = "pin_and_spin_nickname";
const COLORS = [
  { name: "Red", hex: "#ff5579", symbol: "●" },
  { name: "Blue", hex: "#52adff", symbol: "◆" },
  { name: "Green", hex: "#62e5a0", symbol: "▲" },
  { name: "Yellow", hex: "#ffdc55", symbol: "✦" },
  { name: "Purple", hex: "#b987ff", symbol: "⬟" },
  { name: "Orange", hex: "#ff995a", symbol: "■" },
];
const MODES = {
  classic: "CLASSIC",
  reveal: "REVEAL",
  "timed-reveal": "TIMED REVEAL",
  rush: "RUSH",
};
const $ = (id) => document.getElementById(id);
let session = null;
let game = null;
let busy = false;
let polling = false;
let lastNetworkWarning = 0;
let view = "play";
let draft = [null, null, null, null];
let selectedSlot = 0;
let serverOffset = 0;
let toastTimeout = null;

function safe(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}
function createToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => n.toString(16).padStart(2, "0")).join("");
}
function saveSession() {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}
function flash(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.classList.remove("show"), 3600);
}
function colorMarkup(index, tiny = false) {
  const color = COLORS[Number(index)];
  if (!color) return tiny ? '<span class="tiny-peg">?</span>' : '<span class="slot">?</span>';
  if (tiny) return '<span class="tiny-peg" title="' + color.name + '" aria-label="' + color.name +
    '" style="--color:' + color.hex + '">' + color.symbol + '</span>';
  return '<span class="slot filled" title="' + color.name + '" style="--slot-color:' + color.hex +
    '"><span class="slot-shape">' + color.symbol + '</span></span>';
}
function smallPegs(colors) {
  return '<span class="tiny-pegs">' + (Array.isArray(colors) ? colors : [])
    .map((value) => colorMarkup(value, true)).join("") + '</span>';
}
function empty(text) {
  return '<div class="empty-state">' + safe(text) + '</div>';
}
async function api(action, context, data = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 13000);
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        code: context.code || "",
        token: context.token,
        data,
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.error) {
      throw new Error(result.error || "The game service could not complete that request.");
    }
    return result;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("The server took too long. Please try again.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
function setGame(value) {
  if (!value || !value.code) return;
  const previousPuzzle = game?.puzzle;
  const previousRound = game?.round;
  const previousStatus = game?.status;
  game = value;
  serverOffset = new Date(value.serverTime || Date.now()).getTime() - Date.now();
  if (previousPuzzle != null && previousPuzzle !== game.puzzle) {
    view = "play";
    clearDraft();
  } else if (previousRound != null && previousRound !== game.round && game.mode !== "classic") {
    clearDraft();
  }
  if (previousStatus === "lobby" && game.status === "playing") view = "play";
  render();
}
function showHome() {
  $("homeScreen").hidden = false;
  $("roomScreen").hidden = true;
  $("liveIndicator").querySelector("span").textContent = "PARTY GAME";
}
function forgetRoom() {
  session = null;
  game = null;
  view = "play";
  clearDraft();
  saveSession();
  showHome();
}
async function enter(action) {
  if (busy) return;
  const create = action === "create";
  const name = (create ? $("createName") : $("joinName")).value.trim().slice(0, 20);
  const code = create ? "" : $("joinCode").value.trim().toUpperCase();
  if (!name) { flash("Please enter a nickname."); return; }
  if (!create && !/^[A-Z0-9]{6}$/.test(code)) { flash("Enter your six-character room code."); return; }
  const candidate = {
    code,
    token: !create && session && session.code === code ? session.token : createToken(),
    name,
  };
  const data = { name };
  if (create) data.mode = document.querySelector('input[name="mode"]:checked').value;
  busy = true;
  setFormBusy(true);
  try {
    const result = await api(action, candidate, data);
    session = { ...candidate, code: result.code };
    localStorage.setItem(NAME_KEY, name);
    saveSession();
    view = "play";
    clearDraft();
    setGame(result);
    history.replaceState(null, "", location.pathname + "?room=" + encodeURIComponent(result.code));
    flash(create ? "Room created! Share the code with friends." : "You're in! Get ready.");
  } catch (error) {
    flash(error.message || "Could not join the room.");
  } finally {
    busy = false;
    setFormBusy(false);
    if (game) render();
  }
}
function setFormBusy(value) {
  $("createButton").disabled = value;
  $("joinButton").disabled = value;
}
async function act(action, data = {}) {
  if (busy || !session) return;
  busy = true;
  render();
  try {
    const result = await api(action, session, data);
    if (action === "leave") {
      forgetRoom();
      history.replaceState(null, "", location.pathname);
      flash("You left the room.");
      return;
    }
    if (action === "guess") clearDraft();
    if (action === "replay") { clearDraft(); view = "play"; }
    setGame(result);
  } catch (error) {
    flash(error.message || "Something went wrong.");
  } finally {
    busy = false;
    render();
  }
}
async function refresh() {
  if (!session || busy || polling) return;
  polling = true;
  try {
    const result = await api("state", session);
    setGame(result);
  } catch (error) {
    if (/not found|expired|no longer in this room/i.test(error.message || "")) {
      forgetRoom();
      history.replaceState(null, "", location.pathname);
      flash("That room is no longer available.");
    } else if (Date.now() - lastNetworkWarning > 20000) {
      lastNetworkWarning = Date.now();
      flash("Connection interrupted. Retrying…");
    }
  } finally {
    polling = false;
  }
}
function clearDraft() {
  draft = [null, null, null, null];
  selectedSlot = 0;
}
function myGuesses() {
  return (game?.guesses || []).filter((guess) => guess.playerId === game.me);
}
function canSubmit() {
  if (!game || game.status !== "playing" || busy) return false;
  if (game.deadline && new Date(game.deadline).getTime() <= Date.now() + serverOffset) return false;
  if (game.mode === "classic" && game.turnId !== game.me) return false;
  const guesses = myGuesses();
  if (game.mode === "rush") return guesses.length < 8;
  if (game.mode === "reveal" || game.mode === "timed-reveal") {
    return game.round <= 4 && !guesses.some((guess) => guess.attempt === game.round);
  }
  return guesses.length < 4;
}
function currentAttempt() {
  return game && ["reveal", "timed-reveal"].includes(game.mode) ? game.round : myGuesses().length + 1;
}
function selectColor(index) {
  if (!canSubmit()) return;
  draft[selectedSlot] = index;
  const next = [1, 2, 3, 4].map((offset) => (selectedSlot + offset) % 4).find((slot) => draft[slot] === null);
  selectedSlot = next == null ? (selectedSlot + 1) % 4 : next;
  renderSlots();
}
function renderSlots() {
  const enabled = canSubmit();
  $("slots").innerHTML = draft.map((id, pos) => {
    const color = id == null ? null : COLORS[id];
    const classes = "slot" + (color ? " filled" : "") + (selectedSlot === pos && enabled ? " selected" : "");
    const style = color ? ' style="--slot-color:' + color.hex + '"' : "";
    const inner = color ? '<span class="slot-shape">' + color.symbol + '</span>' : "+";
    const label = "Slot " + (pos + 1) + (color ? ", " + color.name : ", empty");
    return '<button class="' + classes + '" type="button" data-slot="' + pos + '" aria-label="' + label + '"' +
      style + (enabled ? "" : " disabled") + '><span class="slot-number">' + (pos + 1) +
      '</span>' + inner + '</button>';
  }).join("");
  $("slots").querySelectorAll("[data-slot]").forEach((button) => {
    button.addEventListener("click", () => { selectedSlot = Number(button.dataset.slot); renderSlots(); });
  });
  $("palette").innerHTML = COLORS.map((color, id) => {
    return '<button class="color-choice" type="button" data-color="' + id + '" style="--color:' +
      color.hex + '" aria-label="Choose ' + color.name + '"' + (enabled ? "" : " disabled") +
      '><span>' + color.symbol + '</span><small>' + color.name + '</small></button>';
  }).join("");
  $("palette").querySelectorAll("[data-color]").forEach((button) => {
    button.addEventListener("click", () => selectColor(Number(button.dataset.color)));
  });
  $("guessButton").disabled = !enabled || draft.some((slot) => slot === null);
  $("clearButton").disabled = !enabled || draft.every((slot) => slot === null);
}
function guessMarkup(guess, label) {
  const score = guess.revealed
    ? '<span class="pin">' + guess.pins + ' PIN</span><span class="spin">' + guess.spins + ' SPIN</span>'
    : '<span class="pending">SEALED</span>';
  return '<div class="guess-item"><div class="guess-id"><b>' + safe(label) + '</b><small>TRY ' +
    guess.attempt + '</small></div>' + smallPegs(guess.colors) + '<div class="score">' + score + '</div></div>';
}
function renderHistory() {
  const guesses = myGuesses();
  $("historyCount").textContent = guesses.length + " SUBMITTED";
  $("myHistory").innerHTML = guesses.length
    ? guesses.slice().reverse().map((guess) => guessMarkup(guess, "#" + guess.attempt)).join("")
    : empty("Your guesses will appear here as you play.");
}
function renderResults() {
  const visible = (game.guesses || []).filter((guess) => guess.revealed && Array.isArray(guess.colors));
  const people = new Map((game.players || []).map((player) => [player.id, player]));
  $("resultCount").textContent = visible.length + " REVEALED";
  if (!visible.length) {
    $("resultsList").innerHTML = empty("Nothing has been revealed yet. Once guesses are public, everybody's results will show here.");
    return;
  }
  const rounds = [...new Set(visible.map((guess) => guess.attempt))].sort((a, b) => b - a);
  $("resultsList").innerHTML = rounds.map((round) => {
    const entries = visible.filter((guess) => guess.attempt === round);
    return '<div class="round-group"><h3>ROUND / TRY ' + round + '</h3><div class="guess-list">' +
      entries.map((guess) => {
        const player = people.get(guess.playerId);
        return guessMarkup(guess, player?.name || "Player");
      }).join("") + '</div></div>';
  }).join("");
}
function renderLobby() {
  const players = (game.players || []).filter((player) => player.active);
  const mine = players.find((player) => player.id === game.me);
  const amHost = game.hostId === game.me;
  const allReady = players.length >= 2 && players.every((player) => player.ready);
  $("playerCount").textContent = players.length + " / 10 PLAYERS";
  $("playerList").innerHTML = players.map((player) => {
    const name = safe(player.name);
    return '<div class="player-item"><span class="player-avatar">' +
      safe((player.name || "?").slice(0, 1).toUpperCase()) +
      '</span><div class="player-info"><div class="player-name">' + name +
      (player.id === game.me ? " (YOU)" : "") + '</div><div class="player-description">' +
      (player.id === game.hostId ? "HOST" : "PLAYER " + player.seat) +
      '</div></div><span class="ready-pill' + (player.ready ? "" : " wait") + '">' +
      (player.ready ? "● READY" : "○ WAITING") + '</span></div>';
  }).join("");
  $("readyButton").hidden = amHost;
  $("readyButton").textContent = mine?.ready ? "NOT READY" : "I'M READY";
  $("readyButton").disabled = busy;
  $("startButton").hidden = !amHost;
  $("startButton").disabled = busy || !allReady;
  $("lobbyHelp").textContent = players.length < 2
    ? "Invite at least one friend using the room code to start."
    : allReady ? "Everybody is ready! Let's crack the code." : "Wait for everybody to mark themselves ready.";
}
function renderGame() {
  const finished = game.status === "finished";
  const allowed = canSubmit();
  const limit = game.mode === "rush" ? 8 : 4;
  const attempt = currentAttempt();
  $("matchPanel").hidden = false;
  $("finishPanel").hidden = !finished || view === "results";
  $("playView").hidden = view !== "play" || finished;
  $("resultsView").hidden = view !== "results";
  $("playTab").classList.toggle("active", view === "play");
  $("resultsTab").classList.toggle("active", view === "results");
  $("playTab").setAttribute("aria-selected", String(view === "play"));
  $("resultsTab").setAttribute("aria-selected", String(view === "results"));
  $("roundLabel").textContent = game.mode === "rush" ? "RUSH MODE" :
    ["reveal", "timed-reveal"].includes(game.mode) ? "ROUND " + game.round + " / 4" : "CLASSIC · 4 TRIES EACH";
  const mine = myGuesses();
  const alreadySent = mine.some((guess) => guess.attempt === game.round);
  let status = "MAKE YOUR MOVE";
  if (finished) status = "GAME OVER";
  else if (game.mode === "classic" && game.turnId !== game.me) status = "WAIT YOUR TURN";
  else if (["reveal", "timed-reveal"].includes(game.mode) && alreadySent) status = "WAIT FOR THE REVEAL";
  else if (mine.length >= limit) status = "ALL GUESSES USED";
  else if (!allowed) status = "ROUND ENDING";
  $("matchStatus").textContent = status;
  $("attemptLabel").textContent = "TRY " + Math.min(attempt, limit) + " / " + limit;
  $("guessHelp").textContent = allowed ? "Tap colors to fill the selected slots. Repeats are allowed." :
    "You can view the guesses while waiting for your next move.";
  renderSlots();
  renderHistory();
  renderResults();
  updateTimer();
  if (finished) {
    const people = new Map((game.players || []).map((player) => [player.id, player]));
    const winners = (game.winners || []).map((id) => people.get(id)?.name || "Player");
    const iWon = (game.winners || []).includes(game.me);
    $("winnerTitle").textContent = winners.length ? (iWon ? "YOU CRACKED IT!" : "CODE CRACKED!") : "NO WINNER THIS TIME";
    $("winnerMessage").textContent = winners.length ? (winners.join(" & ") + (winners.length > 1 ? " share the win!" : " wins the match!")) :
      "Nobody solved the combination this time.";
    $("answerSlots").innerHTML = Array.isArray(game.answer) ? game.answer.map((id) => colorMarkup(id)).join("") : "";
    $("replayButton").hidden = game.hostId !== game.me;
  }
}
function render() {
  if (!session || !game) { showHome(); return; }
  $("homeScreen").hidden = true;
  $("roomScreen").hidden = false;
  $("liveIndicator").querySelector("span").textContent = "ROOM LIVE";
  $("roomCode").textContent = game.code;
  $("roomMode").textContent = (MODES[game.mode] || "GAME") + " · " + (game.players || []).filter((p) => p.active).length + " PLAYERS";
  $("lobbyPanel").hidden = game.status !== "lobby";
  $("matchPanel").hidden = game.status === "lobby";
  $("finishPanel").hidden = game.status !== "finished" || view === "results";
  $("leaveButton").disabled = busy;
  if (game.status === "lobby") renderLobby();
  else renderGame();
}
function updateTimer() {
  if (!game?.deadline || game.status !== "playing") {
    $("timer").hidden = true;
    return;
  }
  const ms = Math.max(0, new Date(game.deadline).getTime() - Date.now() - serverOffset);
  const seconds = Math.ceil(ms / 1000);
  $("timer").hidden = false;
  $("timer").textContent = String(Math.floor(seconds / 60)).padStart(2, "0") + ":" +
    String(seconds % 60).padStart(2, "0");
  $("timer").classList.toggle("urgent", seconds <= 20);
  if (seconds === 0) {
    $("guessButton").disabled = true;
  }
}
function switchForm(which) {
  const create = which === "create";
  $("createForm").hidden = !create;
  $("joinForm").hidden = create;
  $("createTab").classList.toggle("active", create);
  $("joinTab").classList.toggle("active", !create);
  $("createTab").setAttribute("aria-selected", String(create));
  $("joinTab").setAttribute("aria-selected", String(!create));
}
function switchView(next) {
  view = next;
  render();
}
async function copyInvite() {
  if (!game) return;
  const link = new URL(location.href);
  link.searchParams.set("room", game.code);
  try {
    await navigator.clipboard.writeText(link.toString());
    flash("Invite link copied!");
  } catch {
    window.prompt("Copy your invite link:", link.toString());
  }
}
function wire() {
  $("createTab").addEventListener("click", () => switchForm("create"));
  $("joinTab").addEventListener("click", () => switchForm("join"));
  $("createForm").addEventListener("submit", (event) => { event.preventDefault(); enter("create"); });
  $("joinForm").addEventListener("submit", (event) => { event.preventDefault(); enter("join"); });
  document.querySelectorAll('input[name="mode"]').forEach((radio) => radio.addEventListener("change", () => {
    document.querySelectorAll(".mode-option").forEach((label) => {
      label.classList.toggle("selected", label.querySelector("input").checked);
    });
  }));
  $("shareButton").addEventListener("click", copyInvite);
  $("readyButton").addEventListener("click", () => {
    const mine = (game.players || []).find((player) => player.id === game.me);
    act("ready", { ready: !mine?.ready });
  });
  $("startButton").addEventListener("click", () => act("start"));
  $("clearButton").addEventListener("click", () => { clearDraft(); renderSlots(); });
  $("guessButton").addEventListener("click", () => {
    if (!canSubmit() || draft.some((slot) => slot === null)) return;
    act("guess", { colors: draft.slice(), puzzle: game.puzzle, attempt: currentAttempt() });
  });
  $("playTab").addEventListener("click", () => switchView("play"));
  $("resultsTab").addEventListener("click", () => switchView("results"));
  $("finishResultsButton").addEventListener("click", () => switchView("results"));
  $("replayButton").addEventListener("click", () => act("replay"));
  $("leaveButton").addEventListener("click", () => {
    if (window.confirm("Leave this room?")) act("leave");
  });
}
async function init() {
  wire();
  const name = localStorage.getItem(NAME_KEY) || "";
  $("createName").value = name;
  $("joinName").value = name;
  const roomFromLink = new URLSearchParams(location.search).get("room");
  if (roomFromLink && /^[A-Fa-f0-9]{6}$/.test(roomFromLink)) {
    $("joinCode").value = roomFromLink.toUpperCase();
    switchForm("join");
  }
  try {
    const remembered = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    if (remembered && /^[a-f0-9]{64}$/.test(remembered.token) &&
        /^[A-F0-9]{6}$/.test(remembered.code)) {
      session = remembered;
      await refresh();
    }
  } catch { localStorage.removeItem(SESSION_KEY); }
  if (!game) showHome();
  setInterval(refresh, 1800);
  setInterval(updateTimer, 250);
}
init();
