/* ============================================================
   Super Tic Tac Toe — game logic
   ============================================================ */
(() => {
  "use strict";

  const HUES = [190, 275, 45, 145, 335, 215, 20, 250, 305];
  const LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];
  const NAMES = { X: "Player one", O: "Player two" };
  const LABELS = { X: "Ice", O: "Ember" };
  const STORAGE_KEY = "super-tic-tac-toe-v1";

  const $ = (sel, root = document) => root.querySelector(sel);
  const pad2 = (n) => String(n).padStart(2, "0");

  const macro = $("#macro");
  const stage = $("#stage");
  const winline = $("#winline");
  const toastEl = $("#toast");
  const resultEl = $("#result");
  const resultMark = $("#resultMark");
  const resultTitle = $("#resultTitle");
  const resultText = $("#resultText");
  const resultKicker = $("#resultKicker");
  const resultScore = $("#resultScore");
  const roundNum = $("#roundNum");
  const playerX = $("#playerX");
  const playerO = $("#playerO");
  const scoreX = $("#scoreX");
  const scoreO = $("#scoreO");
  const turnText = $("#turnText");
  const turnDot = $("#turnDot");
  const targetPill = $("#targetPill");
  const undoBtn = $("#undoBtn");
  const soundBtn = $("#soundBtn");
  const newBtn = $("#newBtn");
  const rematchBtn = $("#rematchBtn");
  const reviewBtn = $("#reviewBtn");
  const resetMatchBtn = $("#resetMatchBtn");

  const boardEls = [];
  const cellEls = [];

  /* ------------------------------------------------------------
     State
     ------------------------------------------------------------ */

  let match = {
    scores: { X: 0, O: 0, D: 0 },
    muted: false,
    round: 1,
  };

  let game;

  function createGame(starter) {
    return {
      cells: Array.from({ length: 9 }, () => Array(9).fill(null)),
      boards: Array(9).fill(null), // null | "X" | "O" | "D"
      turn: starter,
      starter,
      nextBoard: null,
      over: null, // { winner: "X"|"O"|null, combo: number[]|null }
      moves: 0,
      history: [],
    };
  }

  function loadMatch() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || typeof saved !== "object") return;
      if (saved.scores) {
        for (const key of ["X", "O", "D"]) {
          const n = Number(saved.scores[key]);
          if (Number.isFinite(n) && n >= 0) match.scores[key] = Math.floor(n);
        }
      }
      if (typeof saved.muted === "boolean") match.muted = saved.muted;
      if (Number.isFinite(saved.round) && saved.round >= 1) {
        match.round = Math.floor(saved.round);
      }
    } catch {
      /* storage is optional */
    }
  }

  function persist() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ scores: match.scores, muted: match.muted, round: match.round })
      );
    } catch {
      /* storage is optional */
    }
  }

  /* ------------------------------------------------------------
     Sound (WebAudio, no assets)
     ------------------------------------------------------------ */

  let audioCtx = null;

  function getAudio() {
    if (match.muted) return null;
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        audioCtx = new AC();
      } catch {
        return null;
      }
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function tone(freq, { dur = 0.12, type = "sine", gain = 0.045, delay = 0, slide = null } = {}) {
    const ac = getAudio();
    if (!ac) return;
    const t0 = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const amp = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t0 + dur);
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(amp).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  const sfx = {
    place(player) {
      const base = player === "X" ? 587.33 : 493.88;
      tone(base, { dur: 0.1, type: "triangle", gain: 0.04 });
      tone(base * 1.5, { dur: 0.07, type: "sine", gain: 0.018, delay: 0.035 });
    },
    boardWin() {
      [523.25, 659.25, 783.99].forEach((f, i) =>
        tone(f, { dur: 0.22, type: "triangle", gain: 0.042, delay: i * 0.07 })
      );
    },
    macroWin() {
      [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        tone(f, { dur: 0.5, type: "sine", gain: 0.05, delay: i * 0.09 })
      );
      tone(196, { dur: 0.9, type: "triangle", gain: 0.025, delay: 0.02 });
    },
    draw() {
      tone(329.63, { dur: 0.25, type: "sine", gain: 0.035 });
      tone(293.66, { dur: 0.25, type: "sine", gain: 0.03, delay: 0.1 });
      tone(246.94, { dur: 0.4, type: "sine", gain: 0.03, delay: 0.2 });
    },
    undo() {
      tone(440, { dur: 0.13, type: "sine", gain: 0.03, slide: 220 });
    },
    invalid() {
      tone(128, { dur: 0.1, type: "sawtooth", gain: 0.022, slide: 96 });
    },
    ui() {
      tone(880, { dur: 0.04, type: "sine", gain: 0.012 });
    },
    newRound() {
      tone(330, { dur: 0.12, type: "triangle", gain: 0.03, slide: 440 });
    },
  };

  /* ------------------------------------------------------------
     Board construction
     ------------------------------------------------------------ */

  function buildBoards() {
    const frag = document.createDocumentFragment();

    for (let b = 0; b < 9; b++) {
      const board = document.createElement("section");
      board.className = "board";
      board.dataset.board = String(b);
      board.style.setProperty("--h", HUES[b]);
      board.setAttribute("aria-label", `Board ${b + 1}`);

      const index = document.createElement("span");
      index.className = "board-index";
      index.setAttribute("aria-hidden", "true");
      index.textContent = pad2(b + 1);

      const cells = document.createElement("div");
      cells.className = "cells";

      const row = [];
      for (let c = 0; c < 9; c++) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cell";
        btn.dataset.board = String(b);
        btn.dataset.cell = String(c);
        btn.style.setProperty(
          "--ch",
          HUES[b] + ((c % 3) + Math.floor(c / 3) - 2) * 3
        );

        const slot = document.createElement("span");
        slot.className = "mark-slot";
        btn.appendChild(slot);

        cells.appendChild(btn);
        row.push(btn);
      }

      const win = document.createElement("div");
      win.className = "board-win";

      board.append(index, cells, win);
      frag.appendChild(board);
      boardEls.push(board);
      cellEls.push(row);
    }

    macro.appendChild(frag);
  }

  /* ------------------------------------------------------------
     Helpers
     ------------------------------------------------------------ */

  function markSVG(player, extra = "") {
    const className = `mark ${player}${extra ? " " + extra : ""}`;
    const gradient = player === "X" ? "url(#gradX)" : "url(#gradO)";
    if (player === "X") {
      return `<svg class="${className}" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <path class="ink-shadow" d="M27 27 73 73M73 27 27 73" />
        <path class="ink" d="M27 27 73 73M73 27 27 73" stroke="${gradient}" />
      </svg>`;
    }
    return `<svg class="${className}" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <circle class="ink-shadow" cx="50" cy="50" r="26.5" />
      <circle class="ink" cx="50" cy="50" r="26.5" stroke="${gradient}" />
    </svg>`;
  }

  function other(player) {
    return player === "X" ? "O" : "X";
  }

  function isBoardOpen(b) {
    return game.boards[b] === null && game.cells[b].includes(null);
  }

  function legalBoards() {
    if (game.over) return [];
    const target = game.nextBoard;
    if (target !== null && isBoardOpen(target)) return [target];
    return [0, 1, 2, 3, 4, 5, 6, 7, 8].filter(isBoardOpen);
  }

  function findCombo(winner) {
    for (const line of LINES) {
      if (line.every((b) => game.boards[b] === winner)) return line;
    }
    return null;
  }

  function firstEmptyCell(b) {
    const i = game.cells[b].indexOf(null);
    return i >= 0 ? cellEls[b][i] : null;
  }

  /* ------------------------------------------------------------
     Rendering
     ------------------------------------------------------------ */

  let winlineKey = "";
  let toastTimer = null;
  let resultTimer = null;

  function render(options = {}) {
    const legal = legalBoards();
    const legalSet = new Set(legal);
    const combo = game.over && game.over.combo ? game.over.combo : [];

    for (let b = 0; b < 9; b++) {
      const boardEl = boardEls[b];
      const winner = game.boards[b];

      boardEl.classList.toggle("dim", !game.over && legal.length > 0 && !legalSet.has(b));
      boardEl.classList.toggle("available", legalSet.has(b));
      boardEl.classList.toggle(
        "targeted",
        !game.over && game.nextBoard === b && legalSet.has(b)
      );
      boardEl.classList.toggle("won", Boolean(winner));
      boardEl.classList.toggle("draw", winner === "D");
      boardEl.classList.toggle("combo", combo.includes(b));

      if (winner) boardEl.dataset.winner = winner;
      else delete boardEl.dataset.winner;

      for (let c = 0; c < 9; c++) {
        const value = game.cells[b][c];
        const cell = cellEls[b][c];
        const slot = cell.firstElementChild;
        const mark = value || "";

        if (cell.dataset.mark !== mark) {
          cell.dataset.mark = mark;
          if (value) {
            slot.innerHTML = markSVG(value, options.animate !== false ? "pop" : "");
          } else {
            slot.innerHTML = "";
          }
        }

        const playable = !game.over && legalSet.has(b) && !value;
        cell.classList.toggle("playable", playable);
        cell.tabIndex = playable ? 0 : -1;
        cell.setAttribute("aria-disabled", playable ? "false" : "true");
        cell.setAttribute(
          "aria-label",
          `Board ${b + 1}, square ${c + 1}: ${playable ? "empty" : value ? value : "unavailable"}`
        );
      }

      const winEl = boardEl.querySelector(".board-win");
      const key = winner || "";
      if (winEl.dataset.key !== key) {
        winEl.dataset.key = key;
        if (winner === "D") {
          winEl.innerHTML = '<span class="draw-label">Draw</span>';
        } else if (winner) {
          winEl.innerHTML = markSVG(winner, "big");
        } else {
          winEl.innerHTML = "";
        }
      }
    }

    renderHud(legal);

    if (game.over && game.over.combo) {
      drawWinLine(game.over.combo, game.over.winner, options.animate !== false);
    } else {
      clearWinLine();
    }

    undoBtn.disabled = game.over !== null || game.history.length === 0;
  }

  function renderHud(legal) {
    const over = game.over;
    const activePlayer = over ? over.winner : game.turn;

    playerX.classList.toggle("active", activePlayer === "X");
    playerO.classList.toggle("active", activePlayer === "O");
    scoreX.textContent = String(match.scores.X);
    scoreO.textContent = String(match.scores.O);

    turnText.textContent = over
      ? over.winner
        ? `${NAMES[over.winner]} wins`
        : "Stalemate"
      : NAMES[activePlayer];

    turnDot.style.background = over
      ? over.winner
        ? `var(--${over.winner.toLowerCase()})`
        : "var(--muted-2)"
      : `var(--${game.turn.toLowerCase()})`;
    turnDot.style.boxShadow = over
      ? "none"
      : `0 0 10px var(--${game.turn.toLowerCase()})`;
    turnDot.style.animationPlayState = over ? "paused" : "running";
    turnDot.style.opacity = over ? "0.5" : "";

    if (over) {
      targetPill.textContent = over.winner ? "Round over" : "Draw";
      targetPill.classList.remove("has-hue");
    } else if (game.nextBoard === null) {
      targetPill.textContent = "Free choice";
      targetPill.classList.remove("has-hue");
    } else {
      targetPill.textContent = `Board ${pad2(game.nextBoard + 1)}`;
      targetPill.classList.add("has-hue");
      targetPill.style.setProperty("--hc", HUES[game.nextBoard]);
    }

    if (!over && legal.length === 0) {
      // Safety net; should be caught by the draw condition instead.
      targetPill.textContent = "No moves";
    }
  }

  function drawWinLine(combo, winner, animate = true) {
    const key = `${winner}:${combo.join(",")}`;
    if (key === winlineKey) return;
    winlineKey = key;

    const rect = stage.getBoundingClientRect();
    if (!rect.width) return;
    const a = boardEls[combo[0]].getBoundingClientRect();
    const b = boardEls[combo[2]].getBoundingClientRect();
    const x1 = a.left + a.width / 2 - rect.left;
    const y1 = a.top + a.height / 2 - rect.top;
    const x2 = b.left + b.width / 2 - rect.left;
    const y2 = b.top + b.height / 2 - rect.top;
    const width = Math.max(3, rect.width * 0.0085);
    const core = winner === "X" ? "#b6efff" : "#ffd3a7";
    const halo = winner === "X" ? "#4fc2ff" : "#ff8b4d";

    winline.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
    winline.innerHTML = `
      <line class="halo" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
        stroke="${halo}" stroke-width="${width * 6}" />
      <line class="core" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
        pathLength="1" stroke="${core}" stroke-width="${width}"
        style="filter: drop-shadow(0 0 7px ${halo}) drop-shadow(0 0 20px ${halo}66)" />
    `;
    winline.classList.remove("show");
    if (animate) {
      setTimeout(() => winline.classList.add("show"), 40);
    } else {
      winline.classList.add("show");
    }
  }

  function clearWinLine() {
    if (!winlineKey) return;
    winlineKey = "";
    winline.classList.remove("show");
    winline.innerHTML = "";
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    toastEl.textContent = message;
    toastEl.classList.add("show");
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1600);
  }

  function shake(el) {
    el.classList.remove("shake");
    void el.offsetWidth;
    el.classList.add("shake");
    setTimeout(() => el.classList.remove("shake"), 380);
  }

  function bumpScore(player) {
    const el = player === "X" ? scoreX : scoreO;
    el.classList.remove("bump");
    void el.offsetWidth;
    el.classList.add("bump");
    setTimeout(() => el.classList.remove("bump"), 560);
  }

  /* ------------------------------------------------------------
     Playing
     ------------------------------------------------------------ */

  function attemptMove(b, c, cell, fromKeyboard = false) {
    if (game.over) {
      showToast("Round complete — start a rematch");
      return;
    }

    if (game.cells[b][c]) {
      shake(cell);
      sfx.invalid();
      showToast("That square is taken");
      return;
    }

    const legal = legalBoards();
    if (!legal.includes(b)) {
      shake(cell);
      sfx.invalid();
      showToast(
        game.nextBoard !== null
          ? `Follow the play — board ${pad2(game.nextBoard + 1)}`
          : "That board is closed"
      );
      return;
    }

    makeMove(b, c, fromKeyboard);
  }

  function makeMove(b, c, fromKeyboard) {
    game.history.push({
      cells: game.cells.map((row) => row.slice()),
      boards: game.boards.slice(),
      turn: game.turn,
      starter: game.starter,
      nextBoard: game.nextBoard,
      over: game.over ? { ...game.over } : null,
      moves: game.moves,
    });

    const player = game.turn;
    game.cells[b][c] = player;
    game.moves++;

    const madeBoard = Boolean(checkSmallWin(b, player));
    if (madeBoard) {
      game.boards[b] = player;
    } else if (!game.cells[b].includes(null)) {
      game.boards[b] = "D";
    }

    let finished = false;

    if (madeBoard) {
      const combo = findCombo(player);
      if (combo) {
        game.over = { winner: player, combo };
        match.scores[player]++;
        persist();
        bumpScore(player);
        finished = true;
      }
    }

    if (!finished && game.boards.every((v) => v !== null)) {
      game.over = { winner: null, combo: null };
      match.scores.D++;
      persist();
      finished = true;
    }

    if (!finished) {
      const target = c;
      game.nextBoard = isBoardOpen(target) ? target : null;
      game.turn = other(player);
    }

    render();
    sfx.place(player);

    if (madeBoard && !finished) sfx.boardWin();

    if (finished) {
      hideResult();
      if (game.over.winner) {
        sfx.macroWin();
      } else {
        sfx.draw();
      }
      scheduleResult();
    }

    if (fromKeyboard && !finished) {
      const nextTarget = game.nextBoard !== null ? game.nextBoard : legalBoards()[0];
      if (nextTarget !== undefined && nextTarget !== null) {
        const first = firstEmptyCell(nextTarget);
        if (first) setTimeout(() => first.focus({ preventScroll: true }), 40);
      }
    }
  }

  function checkSmallWin(b, player) {
    const cells = game.cells[b];
    return LINES.some((line) => line.every((i) => cells[i] === player));
  }

  /* ------------------------------------------------------------
     Round flow
     ------------------------------------------------------------ */

  function scheduleResult() {
    clearTimeout(resultTimer);
    const finishedGame = game.over;
    resultTimer = setTimeout(() => {
      if (game.over !== finishedGame) return;
      fillResult();
      resultEl.hidden = false;
      rematchBtn.focus({ preventScroll: true });
    }, 950);
  }

  function fillResult() {
    const over = game.over;
    if (!over) return;

    const winner = over.winner;
    resultKicker.textContent = `Round ${pad2(match.round)} · Final`;
    resultTitle.textContent = winner ? `${NAMES[winner]} wins` : "Stalemate";

    if (winner) {
      resultMark.innerHTML = markSVG(winner, "final");
      resultText.textContent = `${LABELS[winner]} sealed three boards in a row.`;
    } else {
      resultMark.innerHTML = '<span class="draw-glyph">—</span>';
      resultText.textContent = "Every board is settled, but no line was completed.";
    }

    resultScore.textContent = `Ice ${match.scores.X} · Ember ${match.scores.O} · Draws ${match.scores.D}`;
  }

  function hideResult() {
    clearTimeout(resultTimer);
    resultEl.hidden = true;
  }

  function newRound(announce = true) {
    match.round += 1;
    const nextStarter = match.round % 2 === 0 ? "O" : "X";
    game = createGame(nextStarter);
    persist();
    hideResult();
    clearWinLine();
    roundNum.textContent = pad2(match.round);
    render();
    if (announce) {
      sfx.newRound();
      showToast(`${NAMES[nextStarter]} start${nextStarter === "X" ? "s" : ""} this round`);
    }
    if (!announce) sfx.ui();
  }

  function startMatch() {
    match = { scores: { X: 0, O: 0, D: 0 }, muted: match.muted, round: 1 };
    persist();
    game = createGame("X");
    hideResult();
    clearWinLine();
    roundNum.textContent = "01";
    updateSoundButton();
    render();
    sfx.ui();
    showToast("Match reset");
  }

  function undo() {
    if (game.over || game.history.length === 0) return;
    const previous = game.history.pop();
    game = {
      ...previous,
      history: game.history,
    };
    hideResult();
    clearWinLine();
    render();
    sfx.undo();
    const target = game.nextBoard !== null ? game.nextBoard : legalBoards()[0];
    if (target !== undefined && target !== null) {
      const cell = firstEmptyCell(target);
      if (cell) cell.focus({ preventScroll: true });
    }
  }

  function updateSoundButton() {
    soundBtn.classList.toggle("muted", match.muted);
    soundBtn.setAttribute("aria-pressed", String(match.muted));
    soundBtn.setAttribute("aria-label", match.muted ? "Unmute sound" : "Mute sound");
  }

  function toggleSound() {
    match.muted = !match.muted;
    persist();
    updateSoundButton();
    if (!match.muted) {
      sfx.ui();
      showToast("Sound on");
    } else {
      showToast("Sound off");
    }
  }

  /* ------------------------------------------------------------
     Events
     ------------------------------------------------------------ */

  function bindEvents() {
    macro.addEventListener("click", (event) => {
      const cell = event.target.closest(".cell");
      if (!cell) return;
      const b = Number(cell.dataset.board);
      const c = Number(cell.dataset.cell);
      attemptMove(b, c, cell, event.detail === 0);
    });

    macro.addEventListener("keydown", (event) => {
      const cell = event.target.closest(".cell");
      if (!cell) return;
      const keys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
      if (!keys.includes(event.key)) return;

      event.preventDefault();
      const b = Number(cell.dataset.board);
      const c = Number(cell.dataset.cell);
      let r = Math.floor(c / 3);
      let col = c % 3;

      if (event.key === "ArrowUp") r = (r + 2) % 3;
      if (event.key === "ArrowDown") r = (r + 1) % 3;
      if (event.key === "ArrowLeft") col = (col + 2) % 3;
      if (event.key === "ArrowRight") col = (col + 1) % 3;

      cellEls[b][r * 3 + col].focus();
    });

    window.addEventListener("keydown", (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const tag = event.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      const key = event.key.toLowerCase();
      if (key === "u") {
        event.preventDefault();
        undo();
      } else if (key === "n") {
        event.preventDefault();
        newRound();
      } else if (key === "m") {
        event.preventDefault();
        toggleSound();
      } else if (event.key === "Escape" && !resultEl.hidden) {
        resultEl.hidden = true;
        newBtn.focus({ preventScroll: true });
      }
    });

    undoBtn.addEventListener("click", undo);
    newBtn.addEventListener("click", () => newRound());
    soundBtn.addEventListener("click", toggleSound);
    rematchBtn.addEventListener("click", () => newRound());
    reviewBtn.addEventListener("click", () => {
      resultEl.hidden = true;
      newBtn.focus({ preventScroll: true });
      sfx.ui();
    });
    resetMatchBtn.addEventListener("click", startMatch);

    document.addEventListener(
      "pointerdown",
      () => {
        getAudio();
      },
      { once: true }
    );

    let resizeFrame = 0;
    window.addEventListener("resize", () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        if (game.over && game.over.combo) {
          winlineKey = "";
          drawWinLine(game.over.combo, game.over.winner, false);
        }
      });
    });
  }

  /* ------------------------------------------------------------
     Boot
     ------------------------------------------------------------ */

  loadMatch();
  buildBoards();
  game = createGame(match.round % 2 === 0 ? "O" : "X");
  roundNum.textContent = pad2(match.round);
  bindEvents();
  updateSoundButton();
  render({ animate: false });
})();
