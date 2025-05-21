window._endlessEnterHandler = null;

// Global state for new input system
let gameActiveInputRow = null;
let gameCurrentTileIndex = 0;
let gameCurrentGuess = [];
let gameCurrentWordLength = 0;

// Helper to update visual marker for the current tile
function updateActiveTileMarker() {
  if (gameActiveInputRow) {
    for (let i = 0; i < gameActiveInputRow.children.length; i++) {
      gameActiveInputRow.children[i].classList.remove('current-letter-tile');
    }
    if (gameCurrentTileIndex < gameCurrentWordLength) {
      gameActiveInputRow.children[gameCurrentTileIndex].classList.add('current-letter-tile');
    }
  }
}

// Helper to initialize or reset state for a new active input row
function initializeNewActiveInputRow() {
  gameActiveInputRow = document.querySelector(".active-input-row");
  if (gameActiveInputRow) {
    gameCurrentWordLength = gameActiveInputRow.children.length;
    gameCurrentTileIndex = 0;
    gameCurrentGuess = Array(gameCurrentWordLength).fill('');
    // Ensure all tiles are clear initially for the new active row
    for (let i = 0; i < gameCurrentWordLength; i++) {
        if(gameActiveInputRow.children[i]) gameActiveInputRow.children[i].textContent = '';
    }
    updateActiveTileMarker();
  } else {
    // No active row, reset state (e.g., end of game)
    gameCurrentTileIndex = 0;
    gameCurrentGuess = [];
    gameCurrentWordLength = 0;
  }
}

// Global keydown handler for the new input system
function handleGlobalKeyDown(event) {
  if (document.querySelector(".modal-bg")) return; // Ignore input if modal is open

  if (!gameActiveInputRow) return; // No active row, ignore

  const key = event.key;

  if (key.match(/^[a-zA-Z]$/) && gameCurrentTileIndex < gameCurrentWordLength) {
    event.preventDefault(); // Prevent default browser action for letters
    gameCurrentGuess[gameCurrentTileIndex] = key.toLowerCase();
    gameActiveInputRow.children[gameCurrentTileIndex].textContent = key.toUpperCase();
    gameCurrentTileIndex++;
    updateActiveTileMarker();
  } else if (key === 'Backspace' && gameCurrentTileIndex > 0) {
    event.preventDefault(); // Prevent default browser action for backspace
    gameCurrentTileIndex--;
    gameCurrentGuess[gameCurrentTileIndex] = '';
    gameActiveInputRow.children[gameCurrentTileIndex].textContent = '';
    updateActiveTileMarker();
  } else if (key === 'Enter' && gameCurrentTileIndex === gameCurrentWordLength) {
    event.preventDefault(); // Prevent default browser action for enter
    const submittedWord = gameCurrentGuess.join('');
    // Call appropriate submit function based on current game mode
    if (typeof window.submitGuess === 'function' && !isEndless) { // Check if normal game's submitGuess is available
        window.submitGuess(submittedWord);
    } else if (typeof window.submitGuessEndless === 'function' && isEndless) { // Check if endless game's submitGuessEndless is available
        window.submitGuessEndless(submittedWord);
    }
  }
}


// EXTRA LIFE: Add 6th upgrade for extra life in endless mode
const UPGRADE_MAX = [1, 5, 5, 5, 5, 2, 3]; // EXTRA LIFE, Added Word Reroll (index 6)
const UPGRADE_COSTS = [30, 25, 15, 10, 17, 40, 25]; // EXTRA LIFE, Added Word Reroll cost
// Track upgrade uses left for current endless run (reset at start)
let endlessUpgradeUses = [0, 0, 0, 0, 0, 0, 0]; // EXTRA LIFE, Added slot for reroll

// Make roundTimer global for endless mode to prevent timer overlap
let endlessRoundTimer = null;
const UPGRADE_BASE = [
  { name: "+1 Guess for all words", desc: "Gain +1 guess each word.", cost: 30,
    long: "Every word gives one extra guess. Always active once unlocked." },
  { name: "Super Hint", desc: "Reveal a letter in place for current word.", cost: 25,
    long: "Use to reveal a letter in the correct position for the current word. Multiple purchases allow multiple uses per word." },
  { name: "Positive Hint", desc: "Reveal a letter in word.", cost: 15,
    long: "Use to reveal a letter that exists somewhere in the word. Each purchase adds an extra use per word." },
  { name: "Negative Hint", desc: "Reveal a letter NOT in word.", cost: 10,
    long: "Use to reveal a letter that is NOT in the word. Each purchase adds an extra use per word." },
  { name: "Bonus Guess", desc: "Get an extra guess this word.", cost: 17,
    long: "Use to get an extra guess for the current word. Each purchase adds an extra use per word." },
  // EXTRA LIFE
  { name: "Extra Life (endless only)", desc: "Continue if you get a word wrong in endless.", cost: 40,
    long: "Lets you continue the endless run if you get a word wrong. Can be used twice per run if owned. Only works in endless mode." },
  // WORD REROLL
  { name: "Word Reroll", desc: "Reroll the current word.", cost: 25,
    long: "Use to reroll the current word. Resets your guesses and timer for this word, but does NOT restore used hints. You can buy up to 3 per run. (Does not increase words solved or affect stats.)" }
];
const UPGRADE_TOOLTIPS = UPGRADE_BASE.map(u => u.long);
let UPGRADES = UPGRADE_BASE.map((u,i)=>({...u, cost:UPGRADE_COSTS[i]}));

const DEFAULT_STATS_TOTAL = {
  totalGoldEarned: 0,
  totalWordsSolved: 0,
  totalWordsAttempted: 0,
  totalBossesSolved: 0,
  totalBossesAttempted: 0,
  totalHintsUsed: [0, 0, 0, 0, 0, 0, 0], // super, pos, neg, bonus, not used: +1 guess, [5]=extra life (unused for stats, but keep length 7)
  totalGuesses: 0,
  runsPlayed: 0,
  runsCompleted: 0,
  bestRunWords: 0,
  bestRunBoss: 0,
  bestRunGuesses: 0,
  endlessBestWords: 0 // This will be moved to DEFAULT_STATS_ENDLESS and removed from total
};

// Helper for deep copying
const deepCopy = (obj) => JSON.parse(JSON.stringify(obj));

const DEFAULT_STATS_NORMAL = deepCopy(DEFAULT_STATS_TOTAL);
// Normal mode doesn't have endlessBestWords, so remove it or set to 0
DEFAULT_STATS_NORMAL.endlessBestWords = 0;

const DEFAULT_STATS_ENDLESS = deepCopy(DEFAULT_STATS_TOTAL);
// Endless mode specific stats - keep endlessBestWords here
// Clear out stats that don't make sense for endless mode if any (for now, all are kept)

// Adjust DEFAULT_STATS_TOTAL to not track endlessBestWords directly
DEFAULT_STATS_TOTAL.endlessBestWords = 0;


// Endless mode state
let isEndless = false;
// Fix word bleed bug: always clear endlessWordList and endlessWordsSolved on run start
let endlessWordList = [];
let endlessWordsSolved = 0;
// EXTRA LIFE: Track extra lives left for current endless run
let endlessExtraLives = 0; // EXTRA LIFE
function beginEndless() {
  upgrades = upgradeLevels.map(x=>!!x);
  isEndless = true;
  // Always clear endlessWordList and endlessWordsSolved when starting endless mode
  endlessWordList = [];
  endlessWordsSolved = 0;
  // Set upgrade uses for this endless run
  endlessUpgradeUses = upgradeLevels.slice();
  // EXTRA LIFE: Set endlessExtraLives at run start
  endlessExtraLives = upgradeLevels[5] || 0; // EXTRA LIFE
  // Clear any existing endlessRoundTimer
  if (typeof endlessRoundTimer !== "undefined" && endlessRoundTimer !== null) {
    clearInterval(endlessRoundTimer);
    endlessRoundTimer = null;
  }
  document.getElementById('menu').style.display = "none";
  document.getElementById('game').style.display = "";
  document.getElementById('upgrade-sidebar').style.display = "";
  startEndlessGame();
}

function quitEndless() {
  // Close any open modal
  closeModal();
  // Remove any lingering enter/keydown handlers
  if (window._endlessEnterHandler) {
    document.removeEventListener('keydown', window._endlessEnterHandler);
    window._endlessEnterHandler = null;
  }
  document.removeEventListener('keydown', handleGlobalKeyDown);
  initializeNewActiveInputRow(); // Clear input state
  // Stop timer if exists
  if (typeof endlessRoundTimer !== "undefined" && endlessRoundTimer !== null) {
    clearInterval(endlessRoundTimer);
    endlessRoundTimer = null;
  }
  // Hide game UI, show menu
  document.getElementById('game').style.display = "none";
  document.getElementById('game').innerHTML = "";
  document.getElementById('menu').style.display = "";
  document.getElementById('upgrade-sidebar').style.display = "none";
  isEndless = false;
  // Only update best, do NOT award gold here (now handled in summary)
  if (typeof endlessWordsSolved !== "undefined") {
    let currentRunBest = endlessWordsSolved;
    if (currentRunBest > (STATS.endless.endlessBestWords || 0)) {
      STATS.endless.endlessBestWords = currentRunBest;
    }
    // The STATS.total.endlessBestWords is a legacy/migrated field and represents the *absolute historical best*.
    // It should only be updated if a new score surpasses this historical best.
    // It is NOT a sum or aggregate but the peak score.
    // The loader already handles migrating old STATS.endlessBestWords to STATS.total.endlessBestWords
    // and also to STATS.endless.endlessBestWords.
    // So, here we only update if current endless run is greater than the historical total.
    if (currentRunBest > (STATS.total.endlessBestWords || 0)) {
        STATS.total.endlessBestWords = currentRunBest;
    }
    updateStats();
  }
  player.wordsCompleted = 0;
  saveAll();
}

function startEndlessGame() {
  let boss_killed = 0;
  // Always clear endlessWordList and endlessWordsSolved when starting endless mode
  endlessWordList = [];
  endlessWordsSolved = 0;
  // Clear any existing endlessRoundTimer before starting a new game
  if (typeof endlessRoundTimer !== "undefined" && endlessRoundTimer !== null) {
    clearInterval(endlessRoundTimer);
    endlessRoundTimer = null;
  }
  // EXTRA LIFE: Initialize endlessExtraLives from upgradeLevels[5]
  endlessExtraLives = upgradeLevels[5] || 0; // EXTRA LIFE
  // Settings
  let guesses = modifiers[1]?6:7;
  let boss = modifiers[2];
  let timerEnabled = modifiers[3];
  // endlessWordsSolved is now global
  // Ensure allGuesses is local
  let allGuesses = [];
  let wordHintHistory = [];
  let extraGuesses = upgradeLevels[0]>0?1:0;
  let bonusGuessThisWord = 0;
  let msg = "";
  let showAnswer = false;
  let timeLeft = 60;
  let keyboardState = {};
  const KB_ROWS = [
    ['Q','W','E','R','T','Y','U','I','O','P'],
    ['A','S','D','F','G','H','J','K','L'],
    ['Z','X','C','V','B','N','M']
  ];
  let curWord = 0;
  let curBossRound = 0;
  // endlessWordList is global
  let endlessBossWord = null;
  let isBossRound = false;
  // Add flag for endless over status
  let isEndlessOver = false;

  wordHintHistory[0] = [];
  // No runsPlayed increment for endless, but you could add if desired
  saveAll();

  function getIsBossRound() {
    // Every 5th word is boss if boss enabled, else never
    return boss && ((endlessWordsSolved+1)%5===0);
  }

  function nextTargetWord() {
    isBossRound = getIsBossRound();
    // If this is a boss round, increment bosses attempted at the start of the round
    if (isBossRound) {
    STATS.endless.totalBossesAttempted++; // Update endless stats
    STATS.total.totalBossesAttempted++;   // Update total stats
      endlessBossWord = randomWord(SEVEN_LETTER_WORDS);
      endlessWordList.push(endlessBossWord);
    } else {
      let wordSource = isEasyMode ? FIVE_LETTER_GUESS_WORDS : FIVE_LETTER_WORDS;
      let w = randomWord(wordSource);
      endlessWordList.push(w);
    }
    curWord = endlessWordsSolved;
    wordHintHistory[curWord] = [];
    // Per-word used upgrades (for sidebar display)
    let usedThisWord = [0,0,0,0,0,0,0]; // EXTRA LIFE, Added slot for reroll
    bonusGuessThisWord = 0;
    showAnswer = false;
    timeLeft = 60;
    msg = "";
    render();
    startTimer();
  }

  function render() {
    let isBoss = getIsBossRound();
    let len = isBoss?7:5;
    let target = endlessWordList[curWord];
    let guessesThis = (allGuesses[curWord]||[]);
    let totalGuesses = guesses + extraGuesses + bonusGuessThisWord;
    document.getElementById('game').innerHTML = `
      ${isBoss ? `<div style="font-size:2.2em;font-weight:900;color:#ffd700;text-align:center;margin-bottom:0.2em;letter-spacing:0.08em;">BOSS WORD</div>` : ''}
      ${timerEnabled ? `<div class="timer-box"><span id="timer-val">${timeLeft}</span> seconds</div>` : ''}
      <div style="margin-bottom:1em;">
        <b>Word ${endlessWordsSolved+1}</b>
        ${isBoss?'<span style="color:#ffd700;font-weight:bold;">&nbsp;&middot;&nbsp;BOSS</span>':''}
        &middot; Guesses: <b>${guessesThis.length}/${totalGuesses}</b>
      </div>
      <div id="tiles"></div>
      ${wordHintHistory[curWord].length ? `<div class="hint-history"><b>Hints:</b><br>${wordHintHistory[curWord].map(h=>h).join("<br>")}</div>`:""}
      ${!showAnswer && !isRoundOver() ? `
        <input type="text" class="guess-input" id="guess-inp" maxlength="${len}" autocomplete="off" placeholder="${len}-letter word">
        <button class="menu-btn" style="width:100%;" onclick="submitGuessEndless()">Guess</button>
      ` : ""}
      <div class="message" id="game-msg">${msg}</div>
      ${showAnswer ? `
        <div style="margin:1em 0; color:#ffd700; font-size:1.3em; font-weight:bold;">
          The correct word was: <span style="color:#fff; letter-spacing:0.15em;">${target.toUpperCase()}</span>
        </div>
        <button class="menu-btn" id="next-word-btn" onclick="nextWordEndless()">Next Word</button>
      ` : ""}
      <div id="kb-area"></div>
      <button class="menu-btn" style="background:#353555;margin-top:1.2em;" onclick="quitEndless()">Quit</button>
    `;
    let guessRows = guessesThis.map(guess =>
      tileRowHTML(guess, target)
    ).join("");
    document.getElementById('tiles').innerHTML = guessRows;

    // Generate empty guess rows
    let emptyRowsHTML = "";
    for (let i = 0; i < totalGuesses - guessesThis.length; i++) {
      let rowClass = "input-tile-row";
      if (i === 0) {
        rowClass += " active-input-row";
      } else {
        rowClass += " placeholder-row";
      }
      emptyRowsHTML += `<div class="${rowClass}">`;
      for (let j = 0; j < len; j++) {
        let tileClass = "input-tile";
        if (i === 0 && j === 0) { // First tile of active row
          // tileClass += " active-tile"; // Optional: for styling the current letter input caret
        } else if (i !== 0) {
          tileClass += " placeholder-tile";
        }
        emptyRowsHTML += `<span class="${tileClass}"></span>`;
      }
      emptyRowsHTML += `</div>`;
    }
    document.getElementById('tiles').innerHTML += emptyRowsHTML;

    updateKeyboardState(guessesThis, target);
    document.getElementById('kb-area').innerHTML = KB_ROWS.map(row =>
      `<div class="kb-row">${row.map(l =>
        `<span class="kb-key ${keyboardState[l]||'gray'}">${l}</span>`
      ).join("")}</div>`
    ).join("");
    if (timerEnabled && document.getElementById('timer-val')) document.getElementById('timer-val').textContent = timeLeft;
    if(!showAnswer && !isRoundOver()) {
      // Input focus and onkeyup are handled by global listener now
    }
    initializeNewActiveInputRow(); // Initialize for the current row
    if(showAnswer) {
// Store a reference so quitEndless() can remove it later
        if (!window._endlessEnterHandler) window._endlessEnterHandler = handleNextWordEnter;
          document.addEventListener('keydown', window._endlessEnterHandler, {once:true});       if(document.getElementById('next-word-btn')) {
        document.getElementById('next-word-btn').focus();
      }
    }
    document.getElementById('upgrade-sidebar').innerHTML = upgradesSidebarHTML();
    document.getElementById('upgrade-sidebar').style.display = "flex";
    setSidebarTooltips();
  }

  function setSidebarTooltips() {
    // Attach tooltip listeners to sidebar rows
    let rows = document.querySelectorAll('.upg-side-row');
    rows.forEach((row, i) => {
      let idx = Array.from(row.parentNode.children).indexOf(row);
      if(row.querySelector('.upg-tooltip')) return;
      let tipDiv = document.createElement('div');
      tipDiv.className = 'upg-tooltip';
      tipDiv.innerHTML = UPGRADE_TOOLTIPS[idx]||"";
      row.appendChild(tipDiv);
      row.onmouseenter = ()=>{ tipDiv.style.opacity='1'; };
      row.onmouseleave = ()=>{ tipDiv.style.opacity='0'; };
    });
  }

  function handleNextWordEnter(e) {
    if(e.key === "Enter" && showAnswer) {
      window.nextWordEndless();
    } else {
      // re-register for next
      document.addEventListener('keydown', handleNextWordEnter, {once:true});
    }
  }

  function upgradesSidebarHTML() {
    let html = `<div class="upg-side-title">Upgrades</div>`;
    let showAny = false;
    for(let i=1;i<=4;i++) if(upgradeLevels[i]>0) showAny = true;
    if(!showAny && upgradeLevels[0]<1 && (!upgradeLevels[5] || upgradeLevels[5]<1) && (!upgradeLevels[6] || upgradeLevels[6]<1)) {
      html += `<div class="upg-side-row" disabled>No upgrades for this run</div>`;
      return html;
    }
    if(upgradeLevels[0]>0) {
      html += `<div class="upg-side-row">${UPGRADE_BASE[0].name}
        <span class="upg-used-label">+1 Guess (Always active)</span>
      </div>`;
    }
    for(let i=1;i<=4;i++) {
      if(upgradeLevels[i]>0) {
        html += `<div class="upg-side-row">
          ${UPGRADE_BASE[i].name}
          <span class="upg-count-label">${endlessUpgradeUses[i]}</span>
          <button class="upg-use-btn" onclick="useHintInEndless(${i})"
            ${endlessUpgradeUses[i]<=0||isRoundOver()?'disabled':''}>Use</button>
        </div>`;
      }
    }
    // WORD REROLL: Show reroll button if owned and uses left (move above extra life)
    if (upgradeLevels[6] > 0 && endlessUpgradeUses[6] > 0) {
      html += `<div class="upg-side-row">
        ${UPGRADE_BASE[6].name}
        <span class="upg-count-label">${endlessUpgradeUses[6]}</span>
        <button class="upg-use-btn" onclick="rerollCurrentWordEndless()" ${isRoundOver()?'disabled':''}>Reroll</button>
      </div>`;
    }
    // EXTRA LIFE: Show extra lives left in endless sidebar if >0
    if (upgradeLevels[5] > 0 && endlessExtraLives > 0) {
      html += `<div class="upg-side-row">
        ${UPGRADE_BASE[5].name}
        <span class="upg-count-label">${endlessExtraLives}</span>
      </div>`;
    }
    return html;
  }

  // Use hints: i = 1 (super), 2 (pos), 3 (neg), 4 (bonus)
  window.useHintInEndless = function(i) {
    let isBoss = getIsBossRound();
    let len = isBoss?7:5;
    let target = endlessWordList[curWord];
    let guessesThis = (allGuesses[curWord]||[]);
    let prevHints = wordHintHistory[curWord]||[];
    // Use endlessUpgradeUses for availability, and decrement on use
    if(i>=1 && i<=4 && endlessUpgradeUses[i]>0) {
      if(i===1) {
        let revealedPos = new Set();
        prevHints.forEach(h=>{
          let m = h.match(/^Super Hint: Letter (\d+)/);
          if(m) revealedPos.add(+m[1]-1);
        });
        guessesThis.forEach(g=>{
          for(let j=0;j<g.length;j++) if(g[j]===target[j]) revealedPos.add(j);
        });
        let unrevealed = [];
        for(let j=0;j<len;j++) if(!revealedPos.has(j)) unrevealed.push(j);
        if(unrevealed.length===0) { msg = "No unrevealed letters left!"; render(); return;}
        let pos = unrevealed[Math.floor(Math.random()*unrevealed.length)];
        let hint = `Super Hint: Letter ${pos+1} is <b>${target[pos].toUpperCase()}</b>`;
        (wordHintHistory[curWord]||[]).push(hint);
        STATS.endless.totalHintsUsed[1]++; STATS.total.totalHintsUsed[1]++;
      }
      if(i===2) {
        let already = new Set();
        prevHints.forEach(h=>{
          let m = h.match(/^Positive Hint:.*<b>([A-Z])<\/b>/);
          if(m) already.add(m[1]);
        });
        guessesThis.forEach(g=>{for(let ch of g) already.add(ch.toUpperCase());});
        let unrevealed = [];
        for(let ch of target.toUpperCase()) if(!already.has(ch)) unrevealed.push(ch);
        if(unrevealed.length===0) { msg = "No unguessed letters left!"; render(); return;}
        let hintLetter = unrevealed[Math.floor(Math.random()*unrevealed.length)];
        let hint = `Positive Hint: The word contains <b>${hintLetter}</b>`;
        (wordHintHistory[curWord]||[]).push(hint);
        STATS.endless.totalHintsUsed[2]++; STATS.total.totalHintsUsed[2]++;
      }
      if(i===3) {
        let already = new Set();
        prevHints.forEach(h=>{
          let m = h.match(/^Negative Hint:.*<b>([A-Z])<\/b>/);
          if(m) already.add(m[1]);
        });
        let notInWord = [];
        for(let k=0;k<26;k++) {
          let l = String.fromCharCode(65+k);
          if(!target.toUpperCase().includes(l) && !already.has(l)) notInWord.push(l);
        }
        if(notInWord.length===0) { msg = "No unused negatives left!"; render(); return;}
        let ltr = notInWord[Math.floor(Math.random()*notInWord.length)];
        let hint = `Negative Hint: The word does NOT contain <b>${ltr}</b>`;
        (wordHintHistory[curWord]||[]).push(hint);
        STATS.endless.totalHintsUsed[3]++; STATS.total.totalHintsUsed[3]++;
      }
      if(i===4) {
        bonusGuessThisWord++;
        let hint = `Bonus Guess: You have an extra guess for this word!`;
        (wordHintHistory[curWord]||[]).push(hint);
        STATS.endless.totalHintsUsed[4]++; STATS.total.totalHintsUsed[4]++;
      }
      endlessUpgradeUses[i]--;
      msg = "";
      saveAll();
      render();
    }
  };

  function startTimer() {
    if (typeof endlessRoundTimer !== "undefined" && endlessRoundTimer !== null) {
      clearInterval(endlessRoundTimer);
      endlessRoundTimer = null;
    }
    timeLeft = 60;
    if (!timerEnabled) return;
    endlessRoundTimer = setInterval(() => {
      timeLeft--;
      if (document.getElementById('timer-val')) document.getElementById('timer-val').textContent = timeLeft;
      if (timeLeft <= 0) {
        clearInterval(endlessRoundTimer);
        endlessRoundTimer = null;
        showEndOfWord(false);
      }
    }, 1000);
  }

  function submitGuessEndless(submittedWord) {
    let isBoss = getIsBossRound();
    let len = isBoss?7:5;
    let target = endlessWordList[curWord];
    let val = submittedWord.toLowerCase(); // Use parameter

    if(val.length !== len) return showMsg(`Word must be ${len} letters.`); // This check might be redundant if Enter only works on full row
    if(isBoss) {
      if(!SEVEN_LETTER_GUESS_WORDS.includes(val))
        return showMsg("Invalid word.");
    } else {
      if(!FIVE_LETTER_WORDS.includes(val))
        return showMsg("Invalid word.");
    }

    allGuesses[curWord]=allGuesses[curWord]||[];
    allGuesses[curWord].push(val);
    msg = "";
    saveAll();
    render();
    if(val===target) {
      if (typeof endlessRoundTimer !== "undefined" && endlessRoundTimer !== null) {
        clearInterval(endlessRoundTimer);
        endlessRoundTimer = null;
      }
      setTimeout(()=>{showEndOfWord(true);}, 600);
      return;
    }
    let totalGuesses = guesses + extraGuesses + bonusGuessThisWord;
    if(allGuesses[curWord].length >= totalGuesses) {
      if (typeof endlessRoundTimer !== "undefined" && endlessRoundTimer !== null) {
        clearInterval(endlessRoundTimer);
        endlessRoundTimer = null;
      }
      setTimeout(()=>{showEndOfWord(false);}, 700);
      return;
    }
  }
  window.submitGuessEndless = submitGuessEndless;

  function isRoundOver() {
    let isBoss = getIsBossRound();
    let len = isBoss?7:5;
    let target = endlessWordList[curWord];
    let guessesThis = (allGuesses[curWord]||[]);
    let totalGuesses = guesses + extraGuesses + bonusGuessThisWord;
    if (!guessesThis) return false;
    if (guessesThis[guessesThis.length-1] === target) return true;
    if (guessesThis.length >= totalGuesses) return true;
    if (timerEnabled && timeLeft <= 0) return true;
    return false;
  }
  function showEndOfWord(won) {
    // EXTRA LIFE: If failed and endlessExtraLives > 0, consume and retry same word
    if (!won && endlessExtraLives > 0) {
      endlessExtraLives--;
      STATS.endless.totalHintsUsed[5]++; STATS.total.totalHintsUsed[5]++; // Track extra life use
      // Show a temporary message/modal
      showModal(`
        <div style="font-size:1.5em;color:#ffd700;margin-bottom:1em;">Extra Life used!</div>
        <div style="margin-bottom:1.2em;">You get another try at this word.<br>Extra Lives left: <b>${endlessExtraLives}</b></div>
        <button class="menu-btn" onclick="closeModal();window._retryEndlessWord && window._retryEndlessWord();">Continue</button>
      `);
      // Provide a function to retry the word after modal closes
      window._retryEndlessWord = function() {
        // Reset guesses, hints, timer, etc for current word, but do NOT increment stats or curWord
        allGuesses[curWord] = [];
        wordHintHistory[curWord] = [];
        bonusGuessThisWord = 0;
        showAnswer = false;
        msg = "";
        timeLeft = 60;
        // Restart timer
        startTimer();
        render();
        window._retryEndlessWord = null;
      };
      return;
    }
    showAnswer = true;
    if (won) {
      endlessWordsSolved++;
      const guessesCount = (allGuesses[curWord] || []).length;
      STATS.endless.totalGuesses += guessesCount; STATS.total.totalGuesses += guessesCount;
      STATS.endless.totalWordsAttempted++; STATS.total.totalWordsAttempted++;
      player.wordsCompleted++; // This seems like a session-specific counter, might not need to be in STATS
      STATS.endless.totalWordsSolved++; STATS.total.totalWordsSolved++;
      // For boss rounds, only increment solved if won and boss round
      if (won && getIsBossRound()) {
        STATS.endless.totalBossesSolved++; STATS.total.totalBossesSolved++;
        boss_killed += 1;
      }
      saveAll();
      render();
      // Wait for nextWordEndless
    } else {
      // Game over -- set flag, update stats, and show summary
      isEndlessOver = true;
      STATS.endless.totalWordsAttempted++; STATS.total.totalWordsAttempted++;
      // Bosses attempted is now incremented at round start, so don't double-count here
      const guessesCount = (allGuesses[curWord]||[]).length;
      STATS.endless.totalGuesses += guessesCount; STATS.total.totalGuesses += guessesCount;
      
      let currentRunBest = endlessWordsSolved;
      if (currentRunBest > (STATS.endless.endlessBestWords || 0)) {
        STATS.endless.endlessBestWords = currentRunBest;
      }
      // Update total.endlessBestWords if this run is a new absolute historical best.
      if (currentRunBest > (STATS.total.endlessBestWords || 0)) {
        STATS.total.endlessBestWords = currentRunBest;
      }
      saveAll();
      updateStats();
      // Move gold reward and modal to showEndlessSummary
      showEndlessSummary(allGuesses, boss); // This will also remove keydown listener

      // No need to manually hide game elements here if showEndlessSummary does it
      // document.getElementById('game').style.display="none";
      // document.getElementById('menu').style.display="";
      // document.getElementById('upgrade-sidebar').style.display = "none";
      // isEndless = false; // This should be handled by quitEndless or similar logic
      saveAll();
    }
  }

  // Show endless summary and award gold
  function showEndlessSummary(allGuesses, boss) {
    document.removeEventListener('keydown', handleGlobalKeyDown);
    initializeNewActiveInputRow(); // Clear input state

    allGuesses = []; // This seems to clear the history before display, intentional?
    let prevBestDisplay = STATS.endless.endlessBestWords || 0; // For display comparison
    let goldEarned = 0;
    if(isEasyMode) {
      goldEarned = endlessWordsSolved * 4;
    } else {
      goldEarned = endlessWordsSolved * 5;
    }
    goldEarned += boss_killed * 10; // boss_killed is specific to this endless run
    player.gold += goldEarned;
    STATS.endless.totalGoldEarned += goldEarned; STATS.total.totalGoldEarned += goldEarned;
    updateStats();
    showModal(`
      <h2 style="font-size:2em;color:#ffd700;">Endless Run Over!</h2>
      <div style="font-size:1.2em;color:#25b365;margin:0.8em 0;">
        Word gotten wrong: <b>${endlessWordList[curWord]}</b><br>
        Words solved: <b>${endlessWordsSolved}</b><br>
        Gold earned: <b>${goldEarned}</b><br>
        ${endlessWordsSolved > prevBestDisplay ? `<span style="color:#ffd700;">New Best!</span><br>`:""}
      </div>
      <div style="margin-bottom:1em;">${allGuesses.map((g,i)=> // allGuesses is empty here due to earlier line
        `<div style="margin-bottom:.3em;font-size:1.06em;">
        ${g && (boss && ((i+1)%5===0) ? "Boss: " : "")}${g && g[g.length-1]===endlessWordList[i]?"✔️":"❌"} ${endlessWordList[i]}</div>`).join("")}
      </div>
      <button class="menu-btn" onclick="closeModal();quitEndless()">Continue</button>
    `);
  }
  window.nextWordEndless = function() {
    // Only called if previous word was solved
    showAnswer = false;
    curWord++;
    bonusGuessThisWord = 0;
    msg = "";
    wordHintHistory[curWord] = [];
    nextTargetWord();
  };

  function updateKeyboardState(guessesArr, target) {
    let best = {};
    guessesArr.forEach(guess => {
      let g = getTileColors(guess, target);
      for(let i=0;i<guess.length;i++) {
        let l = guess[i].toUpperCase();
        let v = (g[i]==="green")?2:(g[i]==="yellow")?1:0;
        best[l] = Math.max(best[l]||0, v);
      }
    });
    KB_ROWS.flat().forEach(l => {
      if(best[l]===2) keyboardState[l] = "green";
      else if(best[l]===1) keyboardState[l] = "yellow";
      else if(best[l]===0) keyboardState[l] = "dark";
      else keyboardState[l] = "gray";
    });
  }

  function showMsg(t) {msg=t; document.getElementById('game-msg').textContent=t;}

  // Start first word
  endlessWordList = [];
  nextTargetWord();

  // Move rerollCurrentWordEndless here so it closes over allGuesses, curWord, etc.
  window.rerollCurrentWordEndless = function() {
    if (upgradeLevels[6] > 0 && endlessUpgradeUses[6] > 0 && !isRoundOver()) {
      endlessUpgradeUses[6]--;
      STATS.endless.totalHintsUsed[6]++; STATS.total.totalHintsUsed[6]++; // Track reroll use
      // Remove current word and generate a new one (same type)
      let isBoss = getIsBossRound();
      let len = isBoss ? 7 : 5;
      let newWord = isBoss ? randomWord(SEVEN_LETTER_WORDS) : randomWord(FIVE_LETTER_WORDS);
      endlessWordList[curWord] = newWord;
      // Reset guesses and timer for this word, but keep hints used
      allGuesses[curWord] = [];
      bonusGuessThisWord = 0;
      msg = "";
      timeLeft = 60;
      // Do NOT reset wordHintHistory[curWord]
      startTimer();
      render();
      saveAll();
    }
  };
}
// EXTRA LIFE: Ensure stats and upgrades arrays are correct length (7)
let STATS = (() => {
  let loadedStats = JSON.parse(localStorage.getItem("wordrun_stats"));
  let s = {};

  const validateStatObject = (statObj, defaultStatObj) => {
    let newStatObj = deepCopy(defaultStatObj); // Start with a clean default structure
    if (statObj && typeof statObj === 'object') {
      for (const key in defaultStatObj) {
        if (statObj.hasOwnProperty(key)) {
          if (key === "totalHintsUsed") {
            if (Array.isArray(statObj[key]) && statObj[key].length === 7) {
              newStatObj[key] = statObj[key];
            } else {
              // If incorrect, keep the default
              console.warn(`Invalid totalHintsUsed for ${key} in loaded stats, using default.`);
            }
          } else if (typeof statObj[key] === typeof defaultStatObj[key]) {
            newStatObj[key] = statObj[key];
          } else {
            // If type mismatch, keep the default
            console.warn(`Type mismatch for ${key} in loaded stats, using default.`);
          }
        }
      }
    }
    // Ensure totalHintsUsed is always a valid array of 7 numbers
    if (!Array.isArray(newStatObj.totalHintsUsed) || newStatObj.totalHintsUsed.length !== 7) {
        newStatObj.totalHintsUsed = (Array.isArray(newStatObj.totalHintsUsed) ? newStatObj.totalHintsUsed.slice(0,7) : []);
        while (newStatObj.totalHintsUsed.length < 7) newStatObj.totalHintsUsed.push(0);
    }
    return newStatObj;
  };

  if (loadedStats && loadedStats.normal && loadedStats.endless && loadedStats.total) {
    // New format detected
    s.normal = validateStatObject(loadedStats.normal, DEFAULT_STATS_NORMAL);
    s.endless = validateStatObject(loadedStats.endless, DEFAULT_STATS_ENDLESS);
    s.total = validateStatObject(loadedStats.total, DEFAULT_STATS_TOTAL);
  } else {
    // Old format detected, or no stats found
    let oldTotalStats = loadedStats || DEFAULT_STATS_TOTAL; // Use loaded if available, else default

    // Initialize with defaults
    s.normal = deepCopy(DEFAULT_STATS_NORMAL);
    s.endless = deepCopy(DEFAULT_STATS_ENDLESS);
    s.total = validateStatObject(oldTotalStats, DEFAULT_STATS_TOTAL); // Validate the loaded old stats against total structure

    // Migrate endlessBestWords
    if (oldTotalStats && oldTotalStats.hasOwnProperty('endlessBestWords')) {
      s.endless.endlessBestWords = oldTotalStats.endlessBestWords;
    }
    // Ensure total.endlessBestWords is 0 as it's now in endless
    s.total.endlessBestWords = 0;
    
    // If loadedStats was null (no stats ever saved), ensure total is also from its default
    if (!loadedStats) {
        s.total = deepCopy(DEFAULT_STATS_TOTAL);
    }
  }
  return s;
})();
let upgradeLevels = (() => {
  let arr = JSON.parse(localStorage.getItem("wordrun_upgradeLevels") || "[0,0,0,0,0,0,0]");
  if (!Array.isArray(arr) || arr.length < 7) {
    arr = arr.slice(0,7);
    while (arr.length < 7) arr.push(0);
  }
  return arr;
})();
let player = JSON.parse(localStorage.getItem("wordrun_player") || JSON.stringify({ gold: 5, wordsCompleted: 0 }));

function saveAll() {
  // Ensure arrays are always length 7 for stats/upgrades for all stat objects
  ['normal', 'endless', 'total'].forEach(mode => {
    if (STATS[mode] && Array.isArray(STATS[mode].totalHintsUsed)) {
      STATS[mode].totalHintsUsed = STATS[mode].totalHintsUsed.slice(0,7);
      while (STATS[mode].totalHintsUsed.length < 7) STATS[mode].totalHintsUsed.push(0);
    } else if (STATS[mode]) {
      // Ensure it exists even if not an array initially (should be caught by loader, but good fallback)
      STATS[mode].totalHintsUsed = [0,0,0,0,0,0,0];
    }
  });

  if (Array.isArray(upgradeLevels)) {
    upgradeLevels = upgradeLevels.slice(0,7);
    while (upgradeLevels.length < 7) upgradeLevels.push(0);
  }
  localStorage.setItem("wordrun_stats", JSON.stringify(STATS));
  localStorage.setItem("wordrun_upgradeLevels", JSON.stringify(upgradeLevels));
  localStorage.setItem("wordrun_player", JSON.stringify(player));
}
function resetStatsAndGold(confirmFirst=true) {
  if(confirmFirst && !confirm("Reset all statistics, gold, and upgrades? This cannot be undone.")) return;
  STATS.normal = deepCopy(DEFAULT_STATS_NORMAL);
  STATS.endless = deepCopy(DEFAULT_STATS_ENDLESS);
  STATS.total = deepCopy(DEFAULT_STATS_TOTAL);
  upgradeLevels = [0,0,0,0,0,0,0]; // EXTRA LIFE, Added slot for reroll
  player = { gold: 5, wordsCompleted: 0 };
  saveAll();
  updateStats();
  closeModal();
  alert("All stats, gold, and upgrades have been reset.");
  location.reload();
}

let FIVE_LETTER_WORDS = [], FIVE_LETTER_GUESS_WORDS = [], SEVEN_LETTER_WORDS = [], SEVEN_LETTER_GUESS_WORDS = [];
let upgrades = [false, false, false, false, false];
let modifiers = [false,false,false,false];

updateStats();

Promise.all([
  fetch('fiveLetterWords.txt').then(r=>r.text()),
  fetch('fiveLetterWordsGuess.txt').then(r=>r.text()),
  fetch('sevenLetterWords.txt').then(r=>r.text()),
  fetch('sevenLetterWordsGuess.txt').then(r=>r.text())
]).then(([five, fiveGuess, seven, sevenGuess])=>{
  FIVE_LETTER_WORDS = five.split('\n').map(w=>w.trim().toLowerCase()).filter(w=>w.length===5 && !w.includes(' '));
  FIVE_LETTER_GUESS_WORDS = fiveGuess.split('\n').map(w=>w.trim().toLowerCase()).filter(w=>w.length===5 && !w.includes(' '));
  SEVEN_LETTER_WORDS = seven.split('\n').map(w=>w.trim().toLowerCase()).filter(w=>w.length===7 && !w.includes(' '));
  SEVEN_LETTER_GUESS_WORDS = sevenGuess.split('\n').map(w=>w.trim().toLowerCase()).filter(w=>w.length===7 && !w.includes(' '));
  if(FIVE_LETTER_WORDS.length < 10 || FIVE_LETTER_GUESS_WORDS.length < 10 || SEVEN_LETTER_WORDS.length < 2 || SEVEN_LETTER_GUESS_WORDS.length < 2) {
    document.getElementById("loading-msg").textContent = "Word files loaded, but not enough words! (Check your .txt files)";
    return;
  }
  document.getElementById("loading-msg").style.display="none";
  document.getElementById("menu").style.display="";
  document.getElementById("mode-toggle-row").style.display = "block";
}).catch(()=>{
  document.getElementById("loading-msg").textContent = "Error loading word files!";
});

function beginRun() {
  isEndless = false;
  // Detach any lingering Endless enter handler (extra safety)
  if (window._endlessEnterHandler) {
    document.removeEventListener('keydown', window._endlessEnterHandler);
    window._endlessEnterHandler = null;
  }
  document.removeEventListener('keydown', handleGlobalKeyDown); // Remove previous if any
  document.addEventListener('keydown', handleGlobalKeyDown); // Add for new game

  upgrades = upgradeLevels.map(x=>!!x);
  // const inp = document.getElementById('guess-inp'); // Not used anymore
  // if (inp) inp.onkeyup = null; // Not used anymore
  // Ensure all endless mode variables are reset before regular run
  endlessWordList = [];
  
  endlessWordsSolved = 0;
  endlessUpgradeUses = [0, 0, 0, 0, 0, 0, 0]; // EXTRA LIFE, Added slot for reroll
  hideMenu();
  showGame();
  startGame(); // This will call render, which calls initializeNewActiveInputRow
}
function showShop() {
  showModal(`
    <h2>Upgrades Shop</h2>
    ${UPGRADE_BASE.map((u,i)=>`
      <div class="upgrade-card" onmouseenter="showUpgradeTooltip(event,${i})" onmouseleave="hideUpgradeTooltip(event)">
        <span class="upgrade-name">${u.name}
          <span class="upgrade-cost">(${u.cost} gold)</span>
          ${UPGRADE_MAX[i]>1?`<span class="upg-count-label">${upgradeLevels[i]}/${UPGRADE_MAX[i]}</span>`:""}
        </span>
        <button class="upgrade-btn" onclick="purchaseUpgrade(${i})"
          ${upgradeLevels[i]>=UPGRADE_MAX[i]||player.gold<u.cost?'disabled':''}>
          ${upgradeLevels[i]>=UPGRADE_MAX[i] ? "Maxed" : player.gold < u.cost ? "Not enough gold" : "Upgrade"}
        </button>
        <div class="upgrade-tooltip" style="opacity:0;">${UPGRADE_TOOLTIPS[i]}</div>
      </div>
    `).join("")}
    <button class="menu-btn" onclick="closeModal()">Close</button>
  `);
}
window.showUpgradeTooltip = function(e, idx) {
  let tip = e.currentTarget.querySelector('.upgrade-tooltip');
  if(tip) tip.style.opacity = '1';
};
window.hideUpgradeTooltip = function(e) {
  let tip = e.currentTarget.querySelector('.upgrade-tooltip');
  if(tip) tip.style.opacity = '0';
};
function purchaseUpgrade(idx) {
  if(player.gold >= UPGRADE_COSTS[idx] && upgradeLevels[idx] < UPGRADE_MAX[idx]) {
    player.gold -= UPGRADE_COSTS[idx];
    upgradeLevels[idx]++;
    saveAll();
    updateStats();
    showShop();
  }
}
function showInventory() {
  showModal(`
    <h2>Inventory</h2>
    <ul class="inventory-list">
      ${UPGRADE_BASE.map((u,i)=>
        upgradeLevels[i]>0
          ? `<li class="inventory-item">${u.name} ${UPGRADE_MAX[i]>1?`<span class="upg-count-label">${upgradeLevels[i]}/${UPGRADE_MAX[i]}</span>`:""}</li>`
          : ""
        ).join('') || "<li class='inventory-item'>No upgrades owned</li>"}
    </ul>
    <button class="menu-btn" onclick="closeModal()">Close</button>
  `);
}
function showStats(modeToDisplay = 'total') {
  let currentStatsView;
  let titleMode;

  if (modeToDisplay === 'normal') {
    currentStatsView = STATS.normal;
    titleMode = "Normal Mode";
  } else if (modeToDisplay === 'endless') {
    currentStatsView = STATS.endless;
    titleMode = "Endless Mode";
  } else {
    currentStatsView = STATS.total;
    titleMode = "Total";
  }

  let avgGuesses = currentStatsView.totalWordsSolved ? (currentStatsView.totalGuesses / currentStatsView.totalWordsSolved).toFixed(2) : "—";
  let hintsUsedSum = currentStatsView.totalHintsUsed.slice(1,5).reduce((a,b)=>a+b,0); // Sum for Super, Pos, Neg, Bonus
  let avgHintsPerWord = currentStatsView.totalWordsSolved ? (
    hintsUsedSum / currentStatsView.totalWordsSolved
  ).toFixed(2) : "—";

  let generalStatsHTML = `
    <tr><td class="stats-label">Gold Earned</td><td>${currentStatsView.totalGoldEarned}</td></tr>
    <tr><td class="stats-label">Runs Played</td><td>${currentStatsView.runsPlayed !== undefined ? currentStatsView.runsPlayed : 'N/A'}</td></tr>
    <tr><td class="stats-label">Runs Completed</td><td>${currentStatsView.runsCompleted !== undefined ? currentStatsView.runsCompleted : 'N/A'}</td></tr>
  `;

  if (modeToDisplay === 'normal') {
    generalStatsHTML += `
      <tr><td class="stats-label">Best Run (Words)</td><td>${currentStatsView.bestRunWords||0}</td></tr>
      <tr><td class="stats-label">Best Run (Bosses)</td><td>${currentStatsView.bestRunBoss||0}</td></tr>
      <tr><td class="stats-label">Best Run (Least Guesses)</td><td>${currentStatsView.bestRunGuesses||"—"}</td></tr>
    `;
  } else if (modeToDisplay === 'endless') {
    generalStatsHTML += `
      <tr><td class="stats-label">Best Endless Run (Words)</td><td>${currentStatsView.endlessBestWords||0}</td></tr>
    `;
  } else { // Total
    generalStatsHTML += `
      <tr><td class="stats-label">Best Normal Run (Words)</td><td>${STATS.normal.bestRunWords||0}</td></tr>
      <tr><td class="stats-label">Best Normal Run (Bosses)</td><td>${STATS.normal.bestRunBoss||0}</td></tr>
      <tr><td class="stats-label">Best Normal Run (Least Guesses)</td><td>${STATS.normal.bestRunGuesses||"—"}</td></tr>
      <tr><td class="stats-label">Historical Best Endless (Words)</td><td>${currentStatsView.endlessBestWords||0}</td></tr>
    `;
    // For total, runsPlayed and runsCompleted are directly from STATS.total, which is sum of normal runs.
    // If endless runs were tracked, this would need adjustment or clarification.
  }
  
  let wordsBossesHTML = `
    <tr><td class="stats-label">Words Solved</td><td>${currentStatsView.totalWordsSolved}</td></tr>
    <tr><td class="stats-label">Words Attempted</td><td>${currentStatsView.totalWordsAttempted}</td></tr>
    <tr><td class="stats-label">Bosses Solved</td><td>${currentStatsView.totalBossesSolved}</td></tr>
    <tr><td class="stats-label">Bosses Attempted</td><td>${currentStatsView.totalBossesAttempted}</td></tr>
  `;

  let hintsHTML = `
    <tr><td class="stats-label">Super Hints Used</td><td>${currentStatsView.totalHintsUsed[1]}</td></tr>
    <tr><td class="stats-label">Positive Hints Used</td><td>${currentStatsView.totalHintsUsed[2]}</td></tr>
    <tr><td class="stats-label">Negative Hints Used</td><td>${currentStatsView.totalHintsUsed[3]}</td></tr>
    <tr><td class="stats-label">Bonus Guesses Used</td><td>${currentStatsView.totalHintsUsed[4]}</td></tr>
    <tr><td class="stats-label">Word Rerolls Used</td><td>${currentStatsView.totalHintsUsed[6]}</td></tr>
    <tr><td class="stats-label">Extra Lives Used</td><td>${currentStatsView.totalHintsUsed[5]}</td></tr>
    <tr><td class="stats-label">Hints per Solved Word (avg)</td><td>${avgHintsPerWord}</td></tr>
  `;
  
  let guessesHTML = `
    <tr><td class="stats-label">Total Guesses</td><td>${currentStatsView.totalGuesses}</td></tr>
    <tr><td class="stats-label">Guesses per Solved Word (avg)</td><td>${avgGuesses}</td></tr>
  `;

  showModal(`
    <h2 class="stats-title">Player Statistics</h2>
    <div class="stats-tabs">
      <button class="stat-tab-btn ${modeToDisplay === 'normal' ? 'active' : ''}" onclick="showStats('normal')">Normal</button>
      <button class="stat-tab-btn ${modeToDisplay === 'endless' ? 'active' : ''}" onclick="showStats('endless')">Endless</button>
      <button class="stat-tab-btn ${modeToDisplay === 'total' ? 'active' : ''}" onclick="showStats('total')">Total</button>
    </div>
    <div class="stats-content">
      <h3 style="text-align:center; margin-bottom:0.8em; color:#e0c46c;">${titleMode}</h3>
      <div class="stats-group">
        <table class="stats-table">
          <tr><th colspan="2">General</th></tr>
          ${generalStatsHTML}
        </table>
      </div>
      <div class="stats-group">
        <table class="stats-table">
          <tr><th colspan="2">Words & Bosses</th></tr>
          ${wordsBossesHTML}
        </table>
      </div>
      <div class="stats-group">
        <table class="stats-table">
          <tr><th colspan="2">Hints Used</th></tr>
          ${hintsHTML}
        </table>
      </div>
      <div class="stats-group">
        <table class="stats-table">
          <tr><th colspan="2">Guesses</th></tr>
          ${guessesHTML}
        </table>
      </div>
    </div>
    <button class="menu-btn" onclick="closeModal()">Close</button>
    <button class="menu-btn" style="background:#e05454;color:#fff;margin-left:2em;" onclick="resetStatsAndGold()">Reset All</button>
  `);
}
function toggleModifier(idx) {
  modifiers[idx]=!modifiers[idx];
  showModifiers();
}
function showModifiers() {
  showModal(`
    <h2>Difficulty Modifiers</h2>
    ${[
      { name: "Word count +1", desc: "6 words" },
      { name: "Guesses -1", desc: "6 guesses" },
      { name: "Boss round", desc: "7-letter boss (+10 gold)" },
      { name: "Timer", desc: "60s per word" }
    ].map((m,i) => `
      <div class="modifier-card">
        <span class="modifier-name">${m.name} <span style="color:#7ee">${m.desc}</span></span>
        <button class="modifier-btn" onclick="toggleModifier(${i})">${modifiers[i]?"Enabled":"Enable"}</button>
      </div>
    `).join("")}
    <button class="menu-btn" onclick="closeModal()">Close</button>
  `);
}
function showModal(html) { document.getElementById("modal-root").innerHTML = `<div class="modal-bg"><div class="modal-panel">${html}</div></div>`; }
function closeModal() { document.getElementById("modal-root").innerHTML=""; }

function startGame() {
  let boss_killed = 0;
  // Clear endlessWordList and endlessWordsSolved to prevent bleed from endless mode
  endlessWordList = [];
  endlessWordsSolved = 0;
  let words = modifiers[0]?6:5;
  let guesses = modifiers[1]?6:7;
  let boss = modifiers[2];
  let timerEnabled = modifiers[3];
  let curWord = 0, correct=0, bossSolved=0;
  let allGuesses = [];
  let hintUses = [0, 0, 0, 0, 0, 0, 0]; // counts used this run
  let rerollUses = 0; // Track reroll uses for this run
  let wordHintHistory = []; // array of arrays (one per word)
  let extraGuesses = upgradeLevels[0]>0?1:0;
  let bonusGuessThisWord = 0;
  let wordList = [];
  let wordSource = isEasyMode ? FIVE_LETTER_GUESS_WORDS : FIVE_LETTER_WORDS;
  for(let i=0; i<words; ++i)
    wordList.push(randomWord(wordSource));
  let bossWord = boss ? randomWord(SEVEN_LETTER_WORDS) : null;
  let msg = "";
  let showAnswer = false;
  let roundTimer = null;
  let timeLeft = 60;
  let keyboardState = {};
  const KB_ROWS = [
    ['Q','W','E','R','T','Y','U','I','O','P'],
    ['A','S','D','F','G','H','J','K','L'],
    ['Z','X','C','V','B','N','M']
  ];

  wordHintHistory[0] = [];
  STATS.normal.runsPlayed += 1; STATS.total.runsPlayed += 1;
  saveAll();

  function upgradesSidebarHTML() {
    let html = `<div class="upg-side-title">Upgrades</div>`;
    let showAny = false;
    for(let i=1;i<=4;i++) if(upgradeLevels[i]>0) showAny = true;
    if(!showAny && upgradeLevels[0]<1 && (!upgradeLevels[5] || upgradeLevels[5]<1) && (!upgradeLevels[6] || upgradeLevels[6]<1)) {
      html += `<div class="upg-side-row" disabled>No upgrades for this run</div>`;
      return html;
    }
    if(upgradeLevels[0]>0) {
      html += `<div class="upg-side-row">${UPGRADE_BASE[0].name}
        <span class="upg-used-label">+1 Guess (Always active)</span>
      </div>`;
    }
    for(let i=1;i<=4;i++) {
      if(upgradeLevels[i]>0) {
        html += `<div class="upg-side-row">
          ${UPGRADE_BASE[i].name}
          <span class="upg-count-label">${upgradeLevels[i]-hintUses[i]}</span>
          <button class="upg-use-btn" onclick="useHintInRun(${i})"
            ${hintUses[i]>=upgradeLevels[i]||isRoundOver()?'disabled':''}>Use</button>
        </div>`;
      }
    }
    // WORD REROLL: Show reroll button if owned and uses left
    if (upgradeLevels[6] > 0 && (upgradeLevels[6] - rerollUses) > 0) {
      html += `<div class="upg-side-row">
        ${UPGRADE_BASE[6].name}
        <span class="upg-count-label">${upgradeLevels[6] - rerollUses}</span>
        <button class="upg-use-btn" onclick="rerollCurrentWordRun()" ${isRoundOver()?'disabled':''}>Reroll</button>
      </div>`;
    }
    return html;
  }
  window.rerollCurrentWordRun = function() {
    if (upgradeLevels[6] > 0 && (upgradeLevels[6] - rerollUses) > 0 && !isRoundOver()) {
      rerollUses++;
      STATS.normal.totalHintsUsed[6]++; STATS.total.totalHintsUsed[6]++; // Track reroll use
      let isBoss = boss && curWord === words;
      let len = isBoss ? 7 : 5;
      let newWord = isBoss ? randomWord(SEVEN_LETTER_WORDS) : randomWord(FIVE_LETTER_WORDS);
      if (isBoss) bossWord = newWord; else wordList[curWord] = newWord;
      allGuesses[curWord] = [];
      bonusGuessThisWord = 0;
      msg = "";
      timeLeft = 60;
      // Do NOT reset wordHintHistory[curWord]
      startTimer();
      render();
      saveAll();
    }
  };

  function render() {
    let isBoss = boss && curWord === words;
    let len = isBoss?7:5;
    let target = isBoss?bossWord:wordList[curWord];
    let guessesThis = (allGuesses[curWord]||[]);
    let totalGuesses = guesses + extraGuesses + bonusGuessThisWord;
    document.getElementById('game').innerHTML = `
      ${isBoss ? `<div style="font-size:2.2em;font-weight:900;color:#ffd700;text-align:center;margin-bottom:0.2em;letter-spacing:0.08em;">BOSS WORD</div>` : ''}
      ${timerEnabled ? `<div class="timer-box"><span id="timer-val">${timeLeft}</span> seconds</div>` : ''}
      <div style="margin-bottom:1em;">
        <b>Word ${curWord+1}/${words + (boss?1:0)}</b> 
        &middot; Guesses: <b>${guessesThis.length}/${totalGuesses}</b>
      </div>
      <div id="tiles"></div>
      ${wordHintHistory[curWord].length ? `<div class="hint-history"><b>Hints:</b><br>${wordHintHistory[curWord].map(h=>h).join("<br>")}</div>`:""}
      ${!showAnswer && !isRoundOver() ? `
        
      ` : ""}
      <div class="message" id="game-msg">${msg}</div>
      ${showAnswer ? `
        <div style="margin:1em 0; color:#ffd700; font-size:1.3em; font-weight:bold;">
          The correct word was: <span style="color:#fff; letter-spacing:0.15em;">${target.toUpperCase()}</span>
        </div>
        <button class="menu-btn" id="next-word-btn" onclick="nextWord()">Next Word</button>
      ` : ""}
      <div id="kb-area"></div>
      <button class="menu-btn" style="background:#353555;margin-top:1.2em;" onclick="quitRun()">Quit</button>
    `;
    let guessRows = guessesThis.map(guess =>
      tileRowHTML(guess, target)
    ).join("");
    document.getElementById('tiles').innerHTML = guessRows;

    // Generate empty guess rows
    let emptyRowsHTML = "";
    for (let i = 0; i < totalGuesses - guessesThis.length; i++) {
      let rowClass = "input-tile-row";
      if (i === 0) {
        rowClass += " active-input-row";
      } else {
        rowClass += " placeholder-row";
      }
      emptyRowsHTML += `<div class="${rowClass}">`;
      for (let j = 0; j < len; j++) {
        let tileClass = "input-tile";
        if (i === 0 && j === 0) { // First tile of active row
          // tileClass += " active-tile"; // Optional: for styling the current letter input caret
        } else if (i !== 0) {
          tileClass += " placeholder-tile";
        }
        emptyRowsHTML += `<span class="${tileClass}"></span>`;
      }
      emptyRowsHTML += `</div>`;
    }
    document.getElementById('tiles').innerHTML += emptyRowsHTML;

    updateKeyboardState(guessesThis, target);
    document.getElementById('kb-area').innerHTML = KB_ROWS.map(row =>
      `<div class="kb-row">${row.map(l =>
        `<span class="kb-key ${keyboardState[l]||'gray'}">${l}</span>`
      ).join("")}</div>`
    ).join("");
    if (timerEnabled && document.getElementById('timer-val')) document.getElementById('timer-val').textContent = timeLeft;
    if(!showAnswer && !isRoundOver()) {
      // Input focus and onkeyup are handled by global listener now
    }
    initializeNewActiveInputRow(); // Initialize for the current row
    if(showAnswer) {
      // Remove any existing event listener first
      if (window._nextWordEnterHandler) {
        document.removeEventListener('keydown', window._nextWordEnterHandler);
      }
      // Create and store the new handler
      window._nextWordEnterHandler = function(e) {
        if(e.key === "Enter") {
          document.removeEventListener('keydown', window._nextWordEnterHandler);
          window._nextWordEnterHandler = null;
          window.nextWord();
        }
      };
      document.addEventListener('keydown', window._nextWordEnterHandler);
      if(document.getElementById('next-word-btn')) {
        document.getElementById('next-word-btn').focus();
      }
    }
    document.getElementById('upgrade-sidebar').innerHTML = upgradesSidebarHTML();
    document.getElementById('upgrade-sidebar').style.display = "flex";
    setSidebarTooltips();
  }

  function setSidebarTooltips() {
    // Attach tooltip listeners to sidebar rows
    let rows = document.querySelectorAll('.upg-side-row');
    rows.forEach((row, i) => {
      let idx = Array.from(row.parentNode.children).indexOf(row);
      if(row.querySelector('.upg-tooltip')) return;
      let tipDiv = document.createElement('div');
      tipDiv.className = 'upg-tooltip';
      tipDiv.innerHTML = UPGRADE_TOOLTIPS[idx]||"";
      row.appendChild(tipDiv);
      row.onmouseenter = ()=>{ tipDiv.style.opacity='1'; };
      row.onmouseleave = ()=>{ tipDiv.style.opacity='0'; };
    });
  }

  function handleNextWordEnter(e) {
    if(e.key === "Enter" && showAnswer) {
      window.nextWord();
    } else {
      // re-register for next
      document.addEventListener('keydown', handleNextWordEnter, {once:true});
    }
  }

  // Use hints: i = 1 (super), 2 (pos), 3 (neg), 4 (bonus)
  window.useHintInRun = function(i) {
    let isBoss = boss && curWord === words;
    let len = isBoss?7:5;
    let target = isBoss?bossWord:wordList[curWord];
    let guessesThis = (allGuesses[curWord]||[]);
    let prevHints = wordHintHistory[curWord]||[];
    if(i===1 && hintUses[1]<upgradeLevels[1]) {
      let revealedPos = new Set();
      prevHints.forEach(h=>{
        let m = h.match(/^Super Hint: Letter (\d+)/);
        if(m) revealedPos.add(+m[1]-1);
      });
      guessesThis.forEach(g=>{
        for(let j=0;j<g.length;j++) if(g[j]===target[j]) revealedPos.add(j);
      });
      let unrevealed = [];
      for(let j=0;j<len;j++) if(!revealedPos.has(j)) unrevealed.push(j);
      if(unrevealed.length===0) { msg = "No unrevealed letters left!"; render(); return;}
      let pos = unrevealed[Math.floor(Math.random()*unrevealed.length)];
      let hint = `Super Hint: Letter ${pos+1} is <b>${target[pos].toUpperCase()}</b>`;
      (wordHintHistory[curWord]||[]).push(hint);
      hintUses[1]++; STATS.normal.totalHintsUsed[1]++; STATS.total.totalHintsUsed[1]++;
    }
    if(i===2 && hintUses[2]<upgradeLevels[2]) {
      let already = new Set();
      prevHints.forEach(h=>{
        let m = h.match(/^Positive Hint:.*<b>([A-Z])<\/b>/);
        if(m) already.add(m[1]);
      });
      guessesThis.forEach(g=>{for(let ch of g) already.add(ch.toUpperCase());});
      let unrevealed = [];
      for(let ch of target.toUpperCase()) if(!already.has(ch)) unrevealed.push(ch);
      if(unrevealed.length===0) { msg = "No unguessed letters left!"; render(); return;}
      let hintLetter = unrevealed[Math.floor(Math.random()*unrevealed.length)];
      let hint = `Positive Hint: The word contains <b>${hintLetter}</b>`;
      (wordHintHistory[curWord]||[]).push(hint);
      hintUses[2]++; STATS.normal.totalHintsUsed[2]++; STATS.total.totalHintsUsed[2]++;
    }
    if(i===3 && hintUses[3]<upgradeLevels[3]) {
      let already = new Set();
      prevHints.forEach(h=>{
        let m = h.match(/^Negative Hint:.*<b>([A-Z])<\/b>/);
        if(m) already.add(m[1]);
      });
      let notInWord = [];
      for(let k=0;k<26;k++) {
        let l = String.fromCharCode(65+k);
        if(!target.toUpperCase().includes(l) && !already.has(l)) notInWord.push(l);
      }
      if(notInWord.length===0) { msg = "No unused negatives left!"; render(); return;}
      let ltr = notInWord[Math.floor(Math.random()*notInWord.length)];
      let hint = `Negative Hint: The word does NOT contain <b>${ltr}</b>`;
      (wordHintHistory[curWord]||[]).push(hint);
      hintUses[3]++; STATS.normal.totalHintsUsed[3]++; STATS.total.totalHintsUsed[3]++;
    }
    if(i===4 && hintUses[4]<upgradeLevels[4]) {
      bonusGuessThisWord++;
      let hint = `Bonus Guess: You have an extra guess for this word!`;
      (wordHintHistory[curWord]||[]).push(hint);
      hintUses[4]++; STATS.normal.totalHintsUsed[4]++; STATS.total.totalHintsUsed[4]++;
    }
    msg = "";
    saveAll();
    render();
  };

  function startTimer() {
    clearInterval(roundTimer);
    timeLeft = 60;
    if (!timerEnabled) return;
    roundTimer = setInterval(() => {
      timeLeft--;
      if (document.getElementById('timer-val')) document.getElementById('timer-val').textContent = timeLeft;
      if (timeLeft <= 0) {
        clearInterval(roundTimer);
        showEndOfWord();
      }
    }, 1000);
  }

  function submitGuess(submittedWord) {
    let isBoss = boss && curWord === words;
    let len = isBoss?7:5;
    let target = isBoss?bossWord:wordList[curWord];
    let val = submittedWord.toLowerCase(); // Use parameter

    if(val.length !== len) return showMsg(`Word must be ${len} letters.`); // Might be redundant
    if(isBoss) {
      if(!SEVEN_LETTER_GUESS_WORDS.includes(val))
        return showMsg("Invalid word.");
    } else {
      if(!FIVE_LETTER_WORDS.includes(val))
        return showMsg("Invalid word.");
    }

    allGuesses[curWord]=allGuesses[curWord]||[];
    allGuesses[curWord].push(val);
    msg = "";
    saveAll();
    render();
    if(val===target) {
      clearInterval(roundTimer);
      setTimeout(()=>{showEndOfWord(true);}, 600);
      return;
    }
    let totalGuesses = guesses + extraGuesses + bonusGuessThisWord;
    if(allGuesses[curWord].length >= totalGuesses) {
      clearInterval(roundTimer);
      setTimeout(()=>{showEndOfWord(false);}, 700);
      return;
    }
  }
  window.submitGuess = submitGuess;

  function isRoundOver() {
    let isBoss = boss && curWord === words;
    let len = isBoss?7:5;
    let target = isBoss?bossWord:wordList[curWord];
    let guessesThis = (allGuesses[curWord]||[]);
    let totalGuesses = guesses + extraGuesses + bonusGuessThisWord;
    if (!guessesThis) return false;
    if (guessesThis[guessesThis.length-1] === target) return true;
    if (guessesThis.length >= totalGuesses) return true;
    if (timerEnabled && timeLeft <= 0) return true;
    return false;
  }
  function showEndOfWord(won) {
    showAnswer = true;
    if (won) {
      correct++; player.wordsCompleted++; // player.wordsCompleted seems session-specific
      STATS.normal.totalWordsSolved++; STATS.total.totalWordsSolved++;
      if(boss && curWord===words) {
        boss_killed++; // session-specific
        bossSolved++;  // session-specific for normal run best
        STATS.normal.totalBossesSolved++; STATS.total.totalBossesSolved++;
      }
    }
    // Always attempted
    STATS.normal.totalWordsAttempted++; STATS.total.totalWordsAttempted++;
    if(boss && curWord===words) {
      STATS.normal.totalBossesAttempted++; STATS.total.totalBossesAttempted++;
    }
    // Guesses
    let guessesThis = (allGuesses[curWord]||[]);
    STATS.normal.totalGuesses += guessesThis.length; STATS.total.totalGuesses += guessesThis.length;
    saveAll();
    render();
  }
  window.nextWord = function() {
    // Old input event listeners are removed or not added.
    // Global listener handles input.
    
    showAnswer = false;
    timeLeft = 60;
    curWord++;
    bonusGuessThisWord = 0;
    msg = "";
    wordHintHistory[curWord] = [];
    if(boss && curWord===words+1 || !boss && curWord===words) {
      clearInterval(roundTimer);
      document.getElementById('upgrade-sidebar').style.display = "none";
      showSummary();
      return;
    }
    render(); // This will call initializeNewActiveInputRow
    startTimer();
    
    // New input listener is already global. No need to set up per-input field.
  };

  function updateKeyboardState(guessesArr, target) {
    let best = {};
    guessesArr.forEach(guess => {
      let g = getTileColors(guess, target);
      for(let i=0;i<guess.length;i++) {
        let l = guess[i].toUpperCase();
        let v = (g[i]==="green")?2:(g[i]==="yellow")?1:0;
        best[l] = Math.max(best[l]||0, v);
      }
    });
    KB_ROWS.flat().forEach(l => {
      if(best[l]===2) keyboardState[l] = "green";
      else if(best[l]===1) keyboardState[l] = "yellow";
      else if(best[l]===0) keyboardState[l] = "dark";
      else keyboardState[l] = "gray";
    });
  }

  function showMsg(t) {msg=t; document.getElementById('game-msg').textContent=t;}
window.quitRun = function() {
    clearInterval(roundTimer);
    // Clean up any existing event listeners
    if (window._nextWordEnterHandler) {
        document.removeEventListener('keydown', window._nextWordEnterHandler);
        window._nextWordEnterHandler = null;
    }
    if (window._summaryEnterHandler) {
        document.removeEventListener('keydown', window._summaryEnterHandler);
        window._summaryEnterHandler = null;
    }
    // const inp = document.getElementById('guess-inp'); // Not used
    // if (inp) { // Not used
    //     inp.onkeyup = null; // Not used
    // }
    document.removeEventListener('keydown', handleGlobalKeyDown);
    initializeNewActiveInputRow(); // Clear input state

    hideGame();
    showMenu();
    saveAll();
}
  function showSummary() {
    // Clean up any existing event listeners before showing summary
    if (window._nextWordEnterHandler) {
        document.removeEventListener('keydown', window._nextWordEnterHandler);
        window._nextWordEnterHandler = null;
    }
    document.removeEventListener('keydown', handleGlobalKeyDown);
    initializeNewActiveInputRow(); // Clear input state

    let goldEarned = 0;
    if(isEasyMode) {
      goldEarned = correct * 4;
    } else {
      goldEarned = correct * 5;
    }
    goldEarned += boss_killed*10; // boss_killed is for this specific run
    player.gold+=goldEarned;
    STATS.normal.totalGoldEarned += goldEarned; STATS.total.totalGoldEarned += goldEarned;

    if(correct > (STATS.normal.bestRunWords || 0)) STATS.normal.bestRunWords = correct;
    if(bossSolved > (STATS.normal.bestRunBoss || 0)) STATS.normal.bestRunBoss = bossSolved;
    let guessesUsedThisRun = allGuesses.flat().length; // Assuming allGuesses is for the current run
    if(STATS.normal.bestRunGuesses == 0 || guessesUsedThisRun < STATS.normal.bestRunGuesses) {
      STATS.normal.bestRunGuesses = guessesUsedThisRun;
    }
    STATS.normal.runsCompleted += 1; STATS.total.runsCompleted += 1;
    saveAll();
    updateStats();
    showModal(`
      <h2 style="font-size:2em;color:#ffd700;">Run Complete!</h2>
      <div style="font-size:1.2em;color:#25b365;margin:0.8em 0;">
        Words solved: <b>${correct}</b> / ${words + (boss?1:0)}<br>
        Gold earned: <b>${goldEarned}</b>
      </div>
      <div style="margin-bottom:1em;">${allGuesses.map((g,i)=>
        `<div style="margin-bottom:.3em;font-size:1.06em;">
        ${g && (boss && i===words ? "Boss: " : "")}${g && g[g.length-1]===((boss&&i===words)?bossWord:wordList[i])?"✔️":"❌"} ${(boss&&i===words)?bossWord:wordList[i]}</div>`).join("")}
      </div>
      <button class="menu-btn" onclick="closeModal();quitRun()">Continue</button>
    `);
    // Store the event listener in a global variable for proper cleanup
    window._summaryEnterHandler = function(e) {
      if (e.key === 'Enter') {
        document.removeEventListener('keydown', window._summaryEnterHandler);
        window._summaryEnterHandler = null;
        closeModal();
        quitRun();
      }
    };
  document.addEventListener('keydown', window._summaryEnterHandler); // This is for summary modal, not game input
  // document.getElementById('game').style.display="none"; // Done by quitRun
  // document.getElementById('menu').style.display=""; // Done by quitRun
    document.getElementById('upgrade-sidebar').style.display = "none";
    saveAll();
  }
  render();
  startTimer(); // This will call render, which calls initializeNewActiveInputRow
}
function tileRowHTML(guess, target) {
  const colors = getTileColors(guess, target);
  return `<div class="tile-row">${[...guess].map((ch,i)=>
    `<span class="tile ${colors[i]}">${ch}</span>`
  ).join("")}</div>`;
}
function getTileColors(guess, target) {
  const colors = Array(target.length).fill("gray"), used={};
  for(let i=0;i<guess.length;i++) {
    if(guess[i]===target[i]) { colors[i]="green"; used[i]=true;}
  }
  for(let i=0;i<guess.length;i++) {
    if(colors[i]!=="green") {
      const idx = [...target].findIndex((ch,j)=>
        ch===guess[i] && !used[j] && guess[j]!==target[j]
      );
      if(idx!==-1) { colors[i]="yellow"; used[idx]=true;}
    }
  }
  return colors;
}
function randomWord(list) { return list[Math.floor(Math.random()*list.length)]; }
function updateStats() {
  document.getElementById('gold-stat').textContent = "🪙 " + player.gold;
  saveAll();
}
document.addEventListener("keydown", function(e){
      if(e.key === "Escape") closeModal();
    });
// Add reroll function for endless mode
window.rerollCurrentWordEndless = function() {
  if (upgradeLevels[6] > 0 && endlessUpgradeUses[6] > 0 && !isRoundOver()) {
    endlessUpgradeUses[6]--;
    STATS.endless.totalHintsUsed[6]++; STATS.total.totalHintsUsed[6]++; // Track reroll use in endless and total
    // Remove current word and generate a new one (same type)
    let isBoss = getIsBossRound();
    let len = isBoss ? 7 : 5;
    let newWord = isBoss ? randomWord(SEVEN_LETTER_WORDS) : randomWord(FIVE_LETTER_WORDS);
    endlessWordList[curWord] = newWord;
    // Reset guesses and timer for this word, but keep hints used
    allGuesses[curWord] = [];
    bonusGuessThisWord = 0;
    msg = "";
    timeLeft = 60;
    // Do NOT reset wordHintHistory[curWord]
    startTimer();
    render();
    saveAll();
  }
};

// Add easy/hard mode toggle state
let isEasyMode = true;

function updateModeToggleUI() {
  const btn = document.getElementById('mode-toggle-btn');
  if (btn) {
    btn.textContent = isEasyMode ? 'Easy Mode' : 'Hard Mode';
    btn.setAttribute('aria-label', isEasyMode ? 'Easy Mode: Common words only' : 'Hard Mode: All valid five-letter words');
  }
}

function toggleMode() {
  isEasyMode = !isEasyMode;
  updateModeToggleUI();
}

// Insert the toggle into the menu area
const menuDiv = document.getElementById('menu');
const modeToggleRow = document.createElement('div');
modeToggleRow.id = 'mode-toggle-row';
modeToggleRow.style = 'display:none;text-align:center;margin-bottom:1.1em;position:relative;';
modeToggleRow.innerHTML = `
  <button id="mode-toggle-btn" class="menu-btn" style="margin-bottom:0.2em;min-width:140px;position:relative;"
    onmouseenter="showModeTooltip()"
    onmouseleave="hideModeTooltip()"
    onclick="toggleMode()">
    Easy Mode
  </button>
  <span id="mode-toggle-tooltip" style="opacity:0;position:absolute;left:50%;transform:translateX(-50%);background:#20223a;color:#ffc838;font-size:0.98em;border-radius:0.7em;padding:0.5em 1.1em;box-shadow:0 2px 24px #0a0a0c33;white-space:pre-line;min-width:220px;max-width:350px;z-index:999;top:110%;pointer-events:none;transition:opacity 0.15s;">
    <b>Easy Mode:</b> Only common five-letter words are used.\n<b>Hard Mode:</b> Any valid five-letter word may appear, including rare or obscure words. (+1 gold per word)
  </span>
`;
menuDiv.parentNode.insertBefore(modeToggleRow, menuDiv);
updateModeToggleUI();

// Tooltip show/hide functions
window.showModeTooltip = function() {
  document.getElementById('mode-toggle-tooltip').style.opacity = '1';
};
window.hideModeTooltip = function() {
  document.getElementById('mode-toggle-tooltip').style.opacity = '0';
};

// Show/hide toggle row based on menu/game visibility
function showMenu() {
  document.getElementById('menu').style.display = '';
  document.getElementById('mode-toggle-row').style.display = 'block';
}
function hideMenu() {
  document.getElementById('menu').style.display = 'none';
  document.getElementById('mode-toggle-row').style.display = 'none';
}
function showGame() {
  document.getElementById('game').style.display = '';
  document.getElementById('upgrade-sidebar').style.display = '';
  document.getElementById('mode-toggle-row').style.display = 'none';
}
function hideGame() {
  document.getElementById('game').style.display = 'none';
  document.getElementById('upgrade-sidebar').style.display = 'none';
}
// Patch all menu/game transitions to use these
// In beginRun and beginEndless, hide menu and show game
function beginRun() {
  isEndless = false;
  if (window._endlessEnterHandler) {
    document.removeEventListener('keydown', window._endlessEnterHandler);
    window._endlessEnterHandler = null;
  }
  document.removeEventListener('keydown', handleGlobalKeyDown); // Remove previous if any
  document.addEventListener('keydown', handleGlobalKeyDown);   // Add for new game

  upgrades = upgradeLevels.map(x=>!!x);
  // const inp = document.getElementById('guess-inp'); // Not used
  // if (inp) inp.onkeyup = null; // Not used
  endlessWordList = [];
  endlessWordsSolved = 0;
  endlessUpgradeUses = [0, 0, 0, 0, 0, 0, 0];
  hideMenu();
  showGame();
  startGame(); // Calls render -> initializeNewActiveInputRow
}
function beginEndless() {
  upgrades = upgradeLevels.map(x=>!!x);
  isEndless = true;
  endlessWordList = [];
  endlessWordsSolved = 0;
  endlessUpgradeUses = upgradeLevels.slice();
  endlessExtraLives = upgradeLevels[5] || 0;
  if (typeof endlessRoundTimer !== "undefined" && endlessRoundTimer !== null) {
    clearInterval(endlessRoundTimer);
    endlessRoundTimer = null;
  }
  document.removeEventListener('keydown', handleGlobalKeyDown); // Remove previous if any
  document.addEventListener('keydown', handleGlobalKeyDown);   // Add for new game
  hideMenu();
  showGame();
  startEndlessGame(); // Calls render -> initializeNewActiveInputRow
}
// In quitRun and quitEndless, hide game and show menu
window.quitRun = function() {
  clearInterval(roundTimer);
  document.removeEventListener('keydown', handleGlobalKeyDown);
  initializeNewActiveInputRow(); // Clear input state

  hideGame();
  showMenu();
  saveAll();
}
function quitEndless() {
  closeModal();
  if (window._endlessEnterHandler) {
    document.removeEventListener('keydown', window._endlessEnterHandler);
    window._endlessEnterHandler = null;
  }
  document.removeEventListener('keydown', handleGlobalKeyDown);
  initializeNewActiveInputRow(); // Clear input state

  if (typeof endlessRoundTimer !== "undefined" && endlessRoundTimer !== null) {
    clearInterval(endlessRoundTimer);
    endlessRoundTimer = null;
  }
  hideGame();
  showMenu();
  isEndless = false;
  if (typeof endlessWordsSolved !== "undefined") {
    let currentRunBest = endlessWordsSolved;
    if (currentRunBest > (STATS.endless.endlessBestWords || 0)) {
      STATS.endless.endlessBestWords = currentRunBest;
    }
    // Update total.endlessBestWords if this run is a new absolute historical best.
    if (currentRunBest > (STATS.total.endlessBestWords || 0)) {
      STATS.total.endlessBestWords = currentRunBest;
    }
    updateStats();
  }
  player.wordsCompleted = 0;
  saveAll();
}
// On initial load, show menu and hide game/toggle
hideGame();
showMenu();
