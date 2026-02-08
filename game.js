import { db } from "./firebase-config.js";
import { ref, onValue, remove, get, set, update } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
// ---------------------- BASIC INFO ----------------------
const params = new URLSearchParams(window.location.search);
const roomId = params.get("room");
const auth = getAuth();
let uid = null;
onAuthStateChanged(auth, (user) => {
    if (!user) return;
    uid = user.uid; // ✅ TRUSTED UID
    console.log("Lobby UID:", uid);
    // ✅ SAFE: start lobby listeners & logic
    initGame();
});
const username = localStorage.getItem("unoUsername");
let pendingWildCard = null;
const MAX_MISS = 3; // 50 for testing change to 3 in production
let START_CARDS = 7;
// ---------------- TURN TIMER ----------------
let turnTimerInterval = null;
let remainingTime = 0;
const BASE_TURN_TIME = 15; // seconds
const DRAW_BONUS_TIME = 5; // seconds
let ENABLED_SPECIAL_CARDS = {
    shuffle: false,
    skipAll: false
};
// -----------------------------------------Loading DOM---------------------
const winnerPopup = document.getElementById("winnerPopup");
const winnerText = document.getElementById("winnerText");
const winnerOkBtn = document.getElementById("winnerOkBtn");
const drawPile = document.getElementById("drawPile");
const passBtn = document.getElementById("passBtn");
const roomBox = document.getElementById("roomIdDisplay");
const exitb = document.getElementById("leaveBtn");
const discard = document.getElementById("discardPile");
document.getElementById("drawPile").onclick = () => {
    drawCard();
    // console.log("drawing card")
};
const topBox = document.getElementById("topPlayers");
const leftBox = document.getElementById("leftPlayers");
const rightBox = document.getElementById("rightPlayers");
const container = document.getElementById("playerHand");
const wildPopup = document.getElementById("wildPopup");
const exitModal = document.getElementById("exitModal");
const exitTitle = document.getElementById("exitTitle");
const exitText = document.getElementById("exitText");
const exitCancelBtn = document.getElementById("exitCancelBtn");
const exitLeaveBtn = document.getElementById("exitLeaveBtn");
const exitDeleteBtn = document.getElementById("exitDeleteBtn");
const exitHostLeaveBtn = document.getElementById("exitHostLeaveBtn");
const myTurnBar = document.getElementById("myTurnBar");
const myTurnBarFill = document.getElementById("myTurnBarFill");
// ---------------------------------------------------------------------------
let drawState = {
    active: false,
    legalCards: []
};
if (!roomId) {
    alert("Invalid room!");
    window.location.href = "index.html";
}
if (roomBox && roomId) {
    roomBox.innerText = `Room ID: ${roomId}`;
}

// Leave button
function openExitModal() {
    exitModal.classList.remove("hidden");
}

function closeExitModal() {
    exitModal.classList.add("hidden");

    // reset buttons
    exitLeaveBtn.classList.add("hidden");
    exitDeleteBtn.classList.add("hidden");
    exitHostLeaveBtn.classList.add("hidden");
}
exitCancelBtn.addEventListener("click", closeExitModal);
// ---------------- EXIT BUTTON ----------------
exitb.addEventListener("click", async () => {
    const roomRef = ref(db, `rooms/${roomId}`);
    const snap = await get(roomRef);

    if (!snap.exists()) {
        window.location.href = "index.html";
        return;
    }

    const data = snap.val();
    const amIHost = data.host === uid;

    openExitModal();

    if (!amIHost) {
        // normal player
        exitTitle.innerText = "Leave Room";
        exitText.innerText = "Are you sure you want to leave the room?";
        exitLeaveBtn.classList.remove("hidden");

        exitLeaveBtn.onclick = async () => {
            await remove(ref(db, `rooms/${roomId}/players/${uid}`));
            window.location.href = "index.html";
        };
    } else {
        // host
        exitTitle.innerText = "Host Options";
        exitText.innerText = "What do you want to do with this room?";

        exitDeleteBtn.classList.remove("hidden");
        exitHostLeaveBtn.classList.remove("hidden");

        exitDeleteBtn.onclick = async () => {
            await set(ref(db, `rooms/${roomId}/deletedBy`), uid);
            await remove(roomRef);
            window.location.href = "index.html";
        };

        exitHostLeaveBtn.onclick = async () => {
            await remove(ref(db, `rooms/${roomId}/players/${uid}`));

            const remaining = Object.keys(data.players).filter(p => p !== uid);
            if (remaining.length > 0) {
                await set(ref(db, `rooms/${roomId}/host`), remaining[0]);
            }

            window.location.href = "index.html";
        };
    }
});
// Notfying room is deleted
const roomRootRef = ref(db, `rooms/${roomId}`);
onValue(roomRootRef, (snap) => {
    if (!snap.exists()) {
        alert("Room was deleted by host.");
        window.location.href = "index.html";
    }
});
// -------------------------------------------------------------------------
// ------------------------------Update Game Settings-----------------------
// -------------------------------------------------------------------------
async function loadGameSettingsOnce() {
    const snap = await get(
        ref(db, `rooms/${roomId}/game/gameSettings`)
    );

    if (!snap.exists()) {
        console.warn("⚠ gameSettings not found, using defaults");
        return;
    }

    const settings = snap.val();

    // 🎴 Start cards (safety clamp)
    const value = Number(settings.startCards);
    START_CARDS = Math.min(14, Math.max(7, value));

    // 🌀 Special cards
    ENABLED_SPECIAL_CARDS = {
        shuffle: settings.specialCards?.shuffle ?? false,
        skipAll: settings.specialCards?.skipAll ?? false
    };

    // console.log("🃏 START_CARDS:", START_CARDS);
    // console.log("✨ Special Cards:", ENABLED_SPECIAL_CARDS);
}
function renderDiscardCard(code) {

    if (!discard) return;

    discard.innerHTML = ""; // clear old card

    const card = document.createElement("div");
    card.classList.add("card");

    /* ---------- COLOR ---------- */
    if (code.includes("R")) card.classList.add("red-card");
    else if (code.includes("B")) card.classList.add("blue-card");
    else if (code.includes("G")) card.classList.add("green-card");
    else if (code.includes("Y")) card.classList.add("yellow-card");
    else if (code.startsWith("W")) card.classList.add("wild-card");

    /* ---------- SYMBOL ---------- */
    let symbol;
    const value = code.slice(1);

    if (code === "W") symbol = "W";
    else if (code === "W4") symbol = "+4";
    else if (value === "sk") symbol = "🚫";
    else if (value === "rev") symbol = "🔄";
    else if (code === "W-SH") symbol = "🌀";
    else if (code === "W-SA") symbol = "🛑";
    else symbol = value;

    /* ---------- BASE STRUCTURE ---------- */
    card.innerHTML = `
        <span class="corner tl">${symbol}</span>
        <span class="corner br">${symbol}</span>
        <div class="card-center">${symbol}</div>
    `;

    /* ---------- OVAL ---------- */
    if (code.startsWith("W")) {
        const oval = document.createElement("div");
        oval.className = "wild-oval";
        card.insertBefore(oval, card.querySelector(".card-center"));
    } else {
        const oval = document.createElement("div");
        oval.className = "color-oval";
        card.insertBefore(oval, card.querySelector(".card-center"));
    }
    discard.appendChild(card);
}
// Update Dicard Pile
const discardRef = ref(db, `rooms/${roomId}/game/discardPile`);
onValue(discardRef, snap => {
    if (!snap.exists()) return;
    const pile = snap.val();
    const topCardObj = pile.at(-1);
    if (!topCardObj) return;
    renderDiscardCard(topCardObj.card);
});

// ---------------------- REALTIME PLAYERS LIST ----------------------
let currentGame = null;
const roomRef = ref(db, `rooms/${roomId}`);
onValue(roomRef, snapshot => {
    if (!snapshot.exists()) return;
    const data = snapshot.val();
    if (!data.players) return;
    const playerIDs = Object.keys(data.players);
    if (!data.game) return;
    currentGame = data.game;
    // safety checks
    if (
        !Array.isArray(currentGame.turnOrder) ||
        typeof currentGame.turnIndex !== "number"
    ) return;
    startTurnTimer(currentGame);
    // -------------------------------
    // 🔥 TURN + DRAW RULE HANDLING
    // -------------------------------
    const isMyTurn = currentGame.turnOrder[currentGame.turnIndex] === uid;

    const hasDrawn = currentGame.hasDrawn?.[uid] === true;
    if (!drawPile || !passBtn) return;
    const canInteract =
        isMyTurn &&
        currentGame.gameStatus === "playing";

    drawPile.style.pointerEvents = canInteract ? "auto" : "none";
    drawPile.style.opacity = canInteract ? "1" : "0.4";

    if (isMyTurn) {
        if (hasDrawn) {
            // ❌ already drawn → disable deck
            drawPile.style.opacity = "0.4";
            // ✅ allow pass
            passBtn.disabled = false;
        } else {
            // ✅ can draw
            drawPile.style.pointerEvents = "auto";
            drawPile.style.opacity = "1";
            // ❌ cannot pass yet
            passBtn.disabled = true;
        }
    } else {
        // ❌ not your turn
        drawPile.style.opacity = "0.3";
        passBtn.disabled = true;
    }

    // -------------------------------
    // 🔥 EXISTING UI UPDATES
    // -------------------------------
    renderPlayers(playerIDs, data);
    renderMyHand(currentGame.hands[uid], data);
});

function rotateTurnOrder(turnOrder, myID) {
    const idx = turnOrder.indexOf(myID);
    if (idx === -1) return turnOrder;
    return [...turnOrder.slice(idx), ...turnOrder.slice(0, idx)];
}
// ---------------------- RENDER PLAYERS ----------------------
function renderPlayers(turnOrder, playersData) {
    const myID = uid;
    // 🔄 Rotate order so I am always reference point
    const rotated = rotateTurnOrder(turnOrder, myID);
    // ❌ remove myself (I am bottom hand)
    const opponents = rotated.slice(1);


    topBox.innerHTML = "";
    leftBox.innerHTML = "";
    rightBox.innerHTML = "";
    const n = opponents.length;
    let left = [];
    let top = [];
    let right = [];
    if (n === 1) {
        top.push(opponents[0]);
    }
    else if (n === 2) {
        left.push(opponents[0]);
        right.push(opponents[1]);
    }
    else {
        const leftCount = Math.ceil(n / 3);
        const topCount = Math.ceil((n - leftCount) / 2);
        const rightCount = n - leftCount - topCount;

        left = opponents.slice(0, leftCount);
        top = opponents.slice(leftCount, leftCount + topCount);
        right = opponents.slice(leftCount + topCount);
    }

    left.forEach(id =>
        leftBox.appendChild(makePlayerBox(id, playersData))
    );
    top.forEach(id =>
        topBox.appendChild(makePlayerBox(id, playersData))
    );
    right.forEach(id =>
        rightBox.appendChild(makePlayerBox(id, playersData))
    );
}

// ---------------------- PLAYER BOX UI ----------------------
function makePlayerBox(playerId, data) {
    const div = document.createElement("div");
    div.classList.add("player-box-mini");
    div.dataset.uid = playerId;

    const username = data.players[playerId]?.username || "Player";
    const hand = data.game?.hands?.[playerId] || [];

    const isUno = hand.length === 1;

    div.innerHTML = `
        <div class="player-name-row">
        <span class="player-name">${username}</span>
        </div>
        
        <div class="card-count">${hand.length} cards</div>
        <div class="turn-bar hidden">
            <div class="turn-bar-fill"></div>
        </div>
    ${isUno ? `<div class="uno-indicator">UNO!</div>` : ``}
`;
    return div;
}
// ---------------------- DECK GENERATION ----------------------
function generateDeck() {
    const colors = ["R", "G", "B", "Y"];
    const deck = [];

    const makeCard = (card) => ({
        id: `${card}-${crypto.randomUUID().slice(0, 4)}`,
        card
    });

    // Number + action cards
    colors.forEach(c => {
        deck.push(makeCard(c + "0"));

        for (let i = 1; i <= 9; i++) {
            deck.push(makeCard(c + i));
            deck.push(makeCard(c + i));
        }

        deck.push(makeCard(c + "sk"));
        deck.push(makeCard(c + "sk"));

        deck.push(makeCard(c + "rev"));
        deck.push(makeCard(c + "rev"));

        deck.push(makeCard(c + "+2"));
        deck.push(makeCard(c + "+2"));
    });

    // Wild cards
    for (let i = 0; i < 4; i++) deck.push(makeCard("W"));
    for (let i = 0; i < 4; i++) deck.push(makeCard("W4"));
    // Special Cards
    if (ENABLED_SPECIAL_CARDS.shuffle) {
        deck.push(makeCard("W-SH"));
    }
    if (ENABLED_SPECIAL_CARDS.skipAll) {
        deck.push(makeCard("W-SA"));
    }
    // console.log(deck);
    return deck;
}
function shuffle(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}


function distributeCards(playerIDs, deck) {
    const hands = {};
    playerIDs.forEach(id => hands[id] = []);
    const totalNeeded = playerIDs.length * START_CARDS;
    // 🔒 SAFETY CHECK
    if (deck.length < totalNeeded) {
        console.error(
            "❌ Not enough cards in deck",
            "Needed:", totalNeeded,
            "Available:", deck.length
        );
        throw new Error("Not enough cards in deck to distribute");
    }

    // 🎴 ROUND-ROBIN DEALING (REAL UNO STYLE)
    for (let i = 0; i < START_CARDS; i++) {
        for (const id of playerIDs) {
            const card = deck.shift();

            if (!card) {
                throw new Error("Deck ran out while dealing cards");
            }

            hands[id].push(card);
        }
    }
    return hands;
}
async function refillDeckIfNeeded(requiredCount) {
    const gameRef = ref(db, `rooms/${roomId}/game`);
    const snap = await get(gameRef);
    if (!snap.exists()) return false;
    const game = snap.val();
    const { deck, discardPile } = game;
    // ✅ Enough cards → nothing to do
    if (deck && deck.length >= requiredCount) return true;
    // ❌ Cannot refill if discard too small

    if (!discardPile || discardPile.length <= 1) {
        console.warn("⚠ Cannot refill deck (discard pile too small)");
        return false;
    }
    // 🃏 Keep top discard
    const topCard = discardPile[discardPile.length - 1];
    const refillCards = discardPile.slice(0, -1);

    shuffle(refillCards);

    const newDeck = [
        ...(deck || []),   // keep existing cards
        ...refillCards     // add shuffled discard
    ];

    await update(gameRef, {
        deck: newDeck,
        discardPile: [topCard]
    });

    // console.log(`♻️ Deck refilled to satisfy ${requiredCount} cards`);
    return newDeck.length >= requiredCount;
}


// ------------------get deck card color --------------- 
function getInitialColor(card) {
    // Wild cards → choose random color
    if (card === "W" || card === "W4") {
        const colors = ["R", "G", "B", "Y"];
        return colors[Math.floor(Math.random() * colors.length)];
    }
    // Normal card → first letter is color
    return card[0];
}
// ---------------------- START GAME (HOST ONLY) ----------------------
async function startGame(roomId) {
    const playersRef = ref(db, `rooms/${roomId}/players`);
    const snap = await get(playersRef);

    if (!snap.exists()) return;

    const players = Object.keys(snap.val());

    let deck = generateDeck();
    shuffle(deck);

    const hands = distributeCards(players, deck);

    // Draw first discard card
    let firstCard = deck.shift();

    // If first card is W or W4, keep drawing
    while (firstCard.card === "W" || firstCard.card === "W4") {
        deck.push(firstCard); // put back at bottom
        firstCard = deck.shift();
    }
    let currentColor = getInitialColor(firstCard.card);
    const missCount = {};
    players.forEach(uid => missCount[uid] = 0);

    const hasDrawn = {};
    players.forEach(pid => hasDrawn[pid] = false);

    await set(ref(db, `rooms/${roomId}/game`), {
        deck,
        hands,
        discardPile: [firstCard],
        currentColor,
        turnOrder: players,
        turnIndex: 0,
        direction: 1,
        missCount,
        hasDrawn,
        lastUnoPress: null
    });
    // console.log("Game started — cards distributed.");
}

// ---------------------- INIT GAME ----------------------
async function initGame() {
    if (!uid) return; // safety

    const roomRef = ref(db, `rooms/${roomId}`);
    const snap = await get(roomRef);
    if (!snap.exists()) return;

    const data = snap.val();

    const isHost = data.host === uid;

    // 🔥 Load settings ONCE before starting
    await loadGameSettingsOnce();

    // 🚫 Game already ready → do nothing
    if (data.gameReady === true) {
        return;
    }

    // 🚫 No gameStarted flag yet
    if (data.game?.gameStarted !== true) {
        return;
    }

    // ✅ ONLY HOST starts the game
    if (isHost) {
        await startGame(roomId);

        // 🔒 Lock start so it never runs again
        await update(roomRef, {
            gameReady: true
        });

        console.log("🎮 Game initialized by host");
    }
}

// ------------------------------------------------------------------------------------
function parseCard(card) {
    if (card === "W" || card === "W4") {
        return { color: "W", value: card };
    }

    const color = card[0];
    const value = card.slice(1); // "5", "sk", "rev", "+2"
    return { color, value };
}

function isLegalMove(card, topCard, currentColor) {
    if (!topCard) return true;

    const c = parseCard(card);
    const t = parseCard(topCard);

    // 🔥 FALLBACK: derive color from discard if needed
    const effectiveColor = currentColor || t.color;

    if (c.color === "W") return true;
    if (c.color === effectiveColor) return true;
    if (c.value === t.value) return true;

    return false;
}

function renderMyHand(hand, playersData) {
    if (!Array.isArray(hand)) return;
    if (!container) return;

    container.innerHTML = "";

    const { turnOrder, turnIndex, discardPile, currentColor } = playersData.game;

    const myTurn = turnOrder[turnIndex] === uid;
    const topCard = discardPile?.at?.(-1);
    const hasDrawn = playersData.game.hasDrawn?.[uid] === true;

    hand.forEach((cardObj) => {
        const div = document.createElement("div");
        div.classList.add("card");
        div.classList.remove("legal", "illegal");
        div.onclick = null;
        const code = cardObj.card;

        /* ---------------- COLOR CLASS ---------------- */
        if (code.includes("R")) div.classList.add("red-card");
        else if (code.includes("B")) div.classList.add("blue-card");
        else if (code.includes("G")) div.classList.add("green-card");
        else if (code.includes("Y")) div.classList.add("yellow-card");
        else if (code.startsWith("W")) div.classList.add("wild-card");

        /* ---------------- SYMBOL ---------------- */
        let symbol;
        const value = code.slice(1);

        if (code === "W") symbol = "W";
        else if (code === "W4") symbol = "+4";
        else if (value === "sk") symbol = "🚫";
        else if (value === "rev") symbol = "🔄";
        else if (code === "W-SH") symbol = "🌀";
        else if (code === "W-SA") symbol = "🛑";
        else symbol = value;

        /* ---------------- BASE STRUCTURE (SAME FOR ALL) ---------------- */
        div.innerHTML = `
            <span class="corner tl"></span>
            <span class="corner br"></span>
            <div class="card-center"></div>
        `;

        const tl = div.querySelector(".corner.tl");
        const br = div.querySelector(".corner.br");
        const center = div.querySelector(".card-center");

        center.innerText = symbol;
        tl.innerText = symbol;
        br.innerText = symbol;

        /* ---------------- WILD OVAL ---------------- */
        if (code.startsWith("W")) {
            const oval = document.createElement("div");
            oval.className = "wild-oval";
            div.insertBefore(oval, center);
        }
        /* ---------------- Color OVAL ---------------- */
        else {
            const oval = document.createElement("div");
            oval.className = "color-oval";
            div.insertBefore(oval, center);
        }
        /* ---------------- LEGAL CHECK ---------------- */
        const legal =
            myTurn &&
            (
                // allow play BEFORE any draw
                !hasDrawn ||
                // allow play AFTER draw
                (drawState.active && drawState.legalCards.includes(code))
            ) &&
            (
                // 🔥 FIX: if topCard not ready, allow play
                !topCard ||
                isLegalMove(code, topCard.card, currentColor)
            );
        /* ---------------- CORNER VISIBILITY ---------------- */
        tl.style.display = "block";
        br.style.display = "block";

        /* ---------------- INTERACTION ---------------- */
        div.dataset.cardId = cardObj.id;

        if (legal) {
            div.classList.add("legal");
            div.onclick = () => playCard(cardObj);
        } else {
            div.classList.add("illegal");
            div.onclick = null;
        }
        container.appendChild(div);
    });
}
// ---------------------------------------------------------------------------------------
// --------------------------- Action and Wild Card---------------------------------------
// ----------------------------------------------------------------------------------------
function getNextIndex(game, step = 1) {
    const len = game.turnOrder.length;
    return (
        (game.turnIndex + game.direction * step + len) % len
    );
}

async function handleActionCard(card) {
    if (currentGame.gameStatus === "finished") return;
    const gameRef = ref(db, `rooms/${roomId}/game`);
    const snap = await get(gameRef);
    if (!snap.exists()) return;

    const game = snap.val();
    let updates = {};

    const cardCode = card.card;

    // 🎨 ALWAYS set color for non-wild
    if (!cardCode.startsWith("W")) {
        updates.currentColor = cardCode[0];
    }

    let finalTurnIndex;

    // SKIP
    if (cardCode.includes("sk")) {
        finalTurnIndex = getNextIndex(game, 2);
    }

    // REVERSE
    else if (cardCode.includes("rev")) {
        const newDirection = game.direction * -1;
        updates.direction = newDirection;

        finalTurnIndex =
            game.turnOrder.length === 2
                ? getNextIndex(game, 2)
                : getNextIndex({ ...game, direction: newDirection });
    }

    // +2
    else if (cardCode.includes("+2")) {
        const nextIndex = getNextIndex(game, 1);
        const nextUID = game.turnOrder[nextIndex];
        // 1️⃣ Ensure deck exists (may refill DB)
        await refillDeckIfNeeded(2);
        // 2️⃣ Re-read latest game state
        const snap = await get(gameRef);
        if (!snap.exists()) return;
        const latestGame = snap.val();
        let deck = [...latestGame.deck];
        // 3️⃣ Safety check
        if (deck.length < 2) {
            console.warn("❌ Not enough cards for +2");
            return;
        }
        // 4️⃣ Draw 2 cards
        const drawn = deck.splice(0, 2);
        // 5️⃣ Apply updates using LATEST state
        updates[`hands/${nextUID}`] = [
            ...latestGame.hands[nextUID],
            ...drawn
        ];
        updates.deck = deck;
        // 6️⃣ Skip the punished player
        finalTurnIndex = getNextIndex(latestGame, 2);
    }

    // NORMAL
    else {
        finalTurnIndex = getNextIndex(game, 1);
    }

    // ✅ SET FINAL TURN
    updates.turnIndex = finalTurnIndex;

    // ✅ RESET DRAW STATE ONLY FOR ACTUAL NEXT PLAYER
    clearTurnTimer();
    const finalUID = game.turnOrder[finalTurnIndex];
    updates[`hasDrawn/${finalUID}`] = false;

    // console.log("🎨 FINAL COLOR SET:", updates.currentColor);
    await update(gameRef, updates);
}
function openWildPopup() {
    wildPopup.classList.remove("hidden");
}

function closeWildPopup() {
    wildPopup.classList.add("hidden");
}
document.querySelectorAll(".color-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
        const gameRef = ref(db, `rooms/${roomId}/game`);
        if (!currentGame) return;
        if (currentGame.turnOrder[currentGame.turnIndex] !== uid) return;

        const color = btn.dataset.color; // R, G, B, Y
        const updates = {};

        // 1️⃣ Change current color
        updates.currentColor = color;

        // 2️⃣ Handle W or W4 AFTER color selection
        if (pendingWildCard === "W") {
            const nextIndex = getNextIndex(currentGame, 1);
            const nextUID = currentGame.turnOrder[nextIndex];

            // move to next player
            updates.turnIndex = nextIndex;

            // ✅ reset draw state ONLY for next player
            updates[`hasDrawn/${nextUID}`] = false;
        }
        // Wild +4
        else if (pendingWildCard === "W4") {

            const nextIndex = getNextIndex(currentGame, 1);
            const nextUID = currentGame.turnOrder[nextIndex];

            // 1️⃣ Ensure deck exists (may refill DB)
            await refillDeckIfNeeded(4);

            // 2️⃣ Re-read latest game state
            const snap = await get(gameRef);
            if (!snap.exists()) return;

            const latestGame = snap.val();
            let deck = [...latestGame.deck];

            // 3️⃣ Safety check
            if (deck.length < 4) {
                console.warn("❌ Not enough cards for W4");
                return;
            }

            // 4️⃣ Draw 4 cards
            const drawnCards = deck.splice(0, 4);

            // 5️⃣ Give 4 cards to next player
            updates[`hands/${nextUID}`] = [
                ...latestGame.hands[nextUID],
                ...drawnCards
            ];
            updates.deck = deck;

            // 6️⃣ Skip next player
            const skipIndex = getNextIndex(latestGame, 2);
            const skipUID = latestGame.turnOrder[skipIndex];

            updates.turnIndex = skipIndex;

            // 7️⃣ Reset draw state for actual next player
            updates[`hasDrawn/${skipUID}`] = false;
        }
        // Shuffle Hand
        else if (pendingWildCard === "W-SH") {
            // 1️⃣ Always try to refill first (safe no-op if not needed)
            await refillDeckIfNeeded();
            // 2️⃣ Re-read latest game state
            let snap = await get(gameRef);
            if (!snap.exists()) return;
            let latestGame = snap.val();
            const allCards = [];
            // 3️⃣ Collect all hand cards
            Object.values(latestGame.hands).forEach(hand => {
                hand.forEach(card => allCards.push(card));
            });
            const playerIds = latestGame.turnOrder;
            const playerCount = playerIds.length;
            // 4️⃣ Calculate extra cards needed
            let remainder = allCards.length % playerCount;
            let needed = remainder === 0 ? 0 : (playerCount - remainder);
            // 5️⃣ If extra cards needed, ensure deck again
            if (needed > 0) {
                // 🔁 Try refill again (covers deck < needed case)
                await refillDeckIfNeeded(needed);
                snap = await get(gameRef);
                if (!snap.exists()) return;
                latestGame = snap.val();
            }

            let deck = [...latestGame.deck];

            // 6️⃣ Final safety check
            if (deck.length < needed) {
                console.warn("⚠ Not enough cards for shuffle equalization");
                needed = deck.length; // take whatever is available
            }

            // 7️⃣ Draw required cards
            const drawn = deck.splice(0, needed);
            allCards.push(...drawn);

            // 8️⃣ Shuffle everything
            shuffle(allCards);

            // 9️⃣ Equal distribution
            const cardsPerPlayer = Math.floor(allCards.length / playerCount);
            const newHands = {};
            playerIds.forEach(id => newHands[id] = []);

            for (let i = 0; i < cardsPerPlayer; i++) {
                for (const id of playerIds) {
                    newHands[id].push(allCards.shift());
                }
            }
            // 🔟 Save updates
            updates.hands = newHands;
            updates.deck = deck;
            updates.turnIndex = getNextIndex(latestGame, 1);
        }

        // Skip All
        else if (pendingWildCard === "W-SA") {
            updates.turnIndex = getNextIndex(
                currentGame,
                currentGame.turnOrder.length
            );
        }
        await update(ref(db, `rooms/${roomId}/game`), updates);
        pendingWildCard = null;
        closeWildPopup();
    });
});

async function playCard(card, source = "manual") {
    if (!currentGame) return;
    if (currentGame.gameStatus === "finished") return;
    const {
        turnOrder,
        turnIndex,
        hands,
        discardPile,
        currentColor,
        hasDrawn,
    } = currentGame;

    if (!turnOrder?.length) return;

    // 🔒 Only current player
    if (turnOrder[turnIndex] !== uid) return;

    const myHand = hands?.[uid];
    if (!myHand) return;

    // ✅ find exact card object
    const index = myHand.findIndex(c => c.id === card.id);
    if (index === -1) return;

    const topCard = discardPile.at(-1);
    const effectiveColor = currentColor || topCard.card[0];

    // ✅ legality check
    if (!isLegalMove(card.card, topCard.card, effectiveColor)) return;
    // reset miss count (manual play)
    if (source === "manual") {
        await update(ref(db, `rooms/${roomId}/game/missCount`), {
            [uid]: 0
        });
    }
    // -----------------------------
    // 🟣 REMOVE ONLY THE PLAYED CARD
    // -----------------------------
    const newHand = [
        ...myHand.slice(0, index),
        ...myHand.slice(index + 1)
    ];
    // -----------------------------
    // 🟣 DISCARD UPDATE
    // -----------------------------
    await update(ref(db, `rooms/${roomId}/game`), {
        [`hands/${uid}`]: newHand,
        discardPile: [...discardPile, card],
        [`hasDrawn/${uid}`]: false
    });
    // ---- Announce Winner------------------------------ 
    if (newHand.length === 0) {
        await update(ref(db, `rooms/${roomId}/game`), {
            [`hands/${uid}`]: newHand
        });
        await declareWinner(uid);
        return; // ❌ STOP EVERYTHING
    }
    // -----------------------------
    // 🟣 WILD → choose color
    // -----------------------------
    if (card.card.startsWith("W")) {
        pendingWildCard = card.card; // W, W4, W-SH, W-SA
        openWildPopup();
        return;
    }
    // -----------------------------
    // ✅ ALL OTHER ACTIONS
    // -----------------------------
    await handleActionCard(card);
}
// ------------------------------------------------------------------------------------
// --------------------------------------Pass Button-----------------------------------
// ------------------------------------------------------------------------------------
function disablePass() {
    passBtn.disabled = true;
    // console.log("Pass Btn disabled");
}
function enablePass() {
    passBtn.disabled = false;
    // console.log("Pass Btn enabled");
}
passBtn.addEventListener("click", async () => {
    if (!currentGame) return;
    // console.log("Pass Btn Clicked");

    const { turnIndex, turnOrder, direction } = currentGame;
    if (turnOrder[turnIndex] !== uid) return;

    const count = turnOrder.length;
    const nextIndex = (turnIndex + direction + count) % count;
    const nextUID = turnOrder[nextIndex];
    clearTurnTimer();
    await update(ref(db, `rooms/${roomId}/game`), {
        turnIndex: nextIndex,
        [`hasDrawn/${nextUID}`]: false
    });
    disablePass();
});

function getLegalCards(hand, topCard, currentColor) {
    return hand.filter(card =>
        isLegalMove(card, topCard, currentColor)
    );
}
// -----------------------------------------------------------------------------
// ----------------------------Draw Card----------------------------------------
// -----------------------------------------------------------------------------
async function drawCard(source = "manual") {
    if (!currentGame) return;
    // if (currentGame.gameStatus === "finished") return;
    const {
        turnOrder,
        turnIndex,
        hands,
        deck,
        discardPile,
        currentColor,
        hasDrawn
    } = currentGame;
    if (!deck || deck.length === 0) {
        await refillDeckIfNeeded();
        const snap = await get(ref(db, `rooms/${roomId}/game`));
        if (!snap.exists()) return;
        deck = snap.val().deck;
        if (!deck || deck.length === 0) {
            console.warn("❌ No cards available even after refill");
            return;
        }
    }

    // 🔒 Must be your turn
    if (turnOrder[turnIndex] !== uid) return;
    if (hasDrawn?.[uid]) return;

    // Reset miss count only for manual draw
    if (source === "manual") {
        await update(ref(db, `rooms/${roomId}/game/missCount`), {
            [uid]: 0
        });
    }

    // 🎴 Draw card (object)
    const drawnCard = deck[0];
    const newDeck = deck.slice(1);
    const newHand = [...hands[uid], drawnCard];

    await update(ref(db, `rooms/${roomId}/game`), {
        deck: newDeck,
        [`hands/${uid}`]: newHand,
        [`hasDrawn/${uid}`]: true
    });
    // ⏱️ Add bonus time for draw
    remainingTime += DRAW_BONUS_TIME;
    updateTurnUI(uid, remainingTime);

    const topCardObj = discardPile.at(-1);

    // 🔍 Check legal cards using CARD STRINGS
    const legalCards = getLegalCards(
        newHand.map(c => c.card),
        topCardObj.card,
        currentColor
    );

    // ❌ No legal card → auto skip
    if (legalCards.length == 0) {
        await advanceTurn();
        return;
    }
    // ✅ At least one legal card → allow play / pass
    enablePass();
    enterPostDrawState(legalCards);
}
// ---------------------------------------------------------------------------------------
// ---------------------------------Helper Functions of Draw Card-------------------------
// ---------------------------------------------------------------------------------------
function enterPostDrawState(legalCards) {
    drawState.active = true;
    drawState.legalCards = legalCards;
    highlightLegalCardsAfterDraw(legalCards);
}
function highlightLegalCardsAfterDraw(legalCards) {
    const hand = document.getElementById("playerHand");
    if (!hand) return;

    hand.querySelectorAll(".card").forEach(div => {
        const cardId = div.dataset.cardId;
        const cardObj = currentGame.hands[uid].find(c => c.id === cardId);
        if (!cardObj) return;
        const cardText = cardObj.card;

        div.classList.remove("legal", "illegal");
        div.onclick = null;

        // ✅ legalCards is array of card STRINGS
        if (legalCards.includes(cardText)) {
            div.classList.add("legal");
            if (legalCards.includes("R")) {
                div.classList.add("red-card");
            } else if (legalCards.includes("B")) {
                div.classList.add("blue-card");
            } else if (legalCards.includes("G")) {
                div.classList.add("green-card");
            } else if (legalCards.includes("y")) {
                div.classList.add("yellow-card");
            }
            // ✅ pass full card object using ID
            div.onclick = () => {
                const cardObj = currentGame.hands[uid]
                    .find(c => c.id === cardId);

                if (cardObj) {
                    // console.log("calling play card after draw")
                    playCard(cardObj);
                }
            };
        } else {
            div.classList.add("illegal");
        }
    });

    if (passBtn) passBtn.style.display = "inline-block";
}

async function advanceTurn() {
    if (currentGame.gameStatus === "finished") return;
    const gameRef = ref(db, `rooms/${roomId}/game`);
    const snap = await get(gameRef);
    if (!snap.exists()) return;

    const game = snap.val();
    const { turnOrder, turnIndex, direction } = game;

    const count = turnOrder.length;
    const nextIndex = (turnIndex + direction + count) % count;
    const nextUID = turnOrder[nextIndex];
    clearTurnTimer();
    await update(gameRef, {
        turnIndex: nextIndex,
        [`hasDrawn/${nextUID}`]: false,  // reset next player
        lastUnoPress: null
    });
}
// -----------------------------------------------------------------------------------
// ------------Handle Time of 15 sec for each player----------------------------------
// -----------------------------------------------------------------------------------
function updateTurnUI(activeUID, timeLeft) {

    /* ---------- MY TURN BAR ---------- */
    if (activeUID === uid) {
        myTurnBar.classList.remove("hidden");

        const percent =
            (timeLeft / BASE_TURN_TIME) * 100;

        myTurnBarFill.style.width = `${percent}%`;
        myTurnBarFill.classList.toggle("danger", timeLeft <= 5);
    } else {
        myTurnBar.classList.add("hidden");
    }

    /* ---------- OPPONENT MINI BARS ---------- */
    document.querySelectorAll(".player-box-mini").forEach(box => {
        const boxUID = box.dataset.uid;
        const bar = box.querySelector(".turn-bar");
        const fill = box.querySelector(".turn-bar-fill");

        if (!bar || !fill) return;

        if (boxUID === activeUID) {
            bar.classList.remove("hidden");

            const percent =
                (timeLeft / BASE_TURN_TIME) * 100;

            fill.style.width = `${percent}%`;
            fill.classList.toggle("danger", timeLeft <= 5);
        } else {
            bar.classList.add("hidden");
        }
    });
}

async function handleTurnTimeout(playerUID) {
    if (!currentGame) return;

    const gameRef = ref(db, `rooms/${roomId}/game`);
    const snap = await get(gameRef);
    if (!snap.exists()) return;

    const game = snap.val();
    const {
        turnOrder,
        turnIndex,
        direction,
        missCount
    } = game;

    const newMiss = (missCount?.[playerUID] || 0) + 1;

    // 🔴 increment miss count
    await update(gameRef, {
        [`missCount/${playerUID}`]: newMiss
    });

    // console.log("⏰ Turn missed:", playerUID, "→", newMiss);

    // 🚫 remove inactive player
    if (newMiss >= MAX_MISS) {
        await removeInactivePlayer(playerUID);
        return;
    }

    // ➡️ advance turn
    const count = turnOrder.length;
    const nextIndex =
        (turnIndex + direction + count) % count;

    const nextUID = turnOrder[nextIndex];

    await update(gameRef, {
        turnIndex: nextIndex,
        [`hasDrawn/${nextUID}`]: false
    });
}

function clearTurnTimer() {
    if (turnTimerInterval) {
        clearInterval(turnTimerInterval);
        turnTimerInterval = null;
    }
}
function startTurnTimer(game) {
    if (
        !game ||
        !Array.isArray(game.turnOrder) ||
        typeof game.turnIndex !== "number"
    ) {
        return;
    }
    clearTurnTimer();

    const { turnOrder, turnIndex } = game;
    const activeUID = turnOrder[turnIndex];

    remainingTime = BASE_TURN_TIME;

    updateTurnUI(activeUID, remainingTime);

    turnTimerInterval = setInterval(async () => {
        remainingTime--;

        updateTurnUI(activeUID, remainingTime);

        if (remainingTime <= 0) {
            clearTurnTimer();
            await handleTurnTimeout(activeUID);
        }
    }, 1000);
}
async function removeInactivePlayer(playerUID) {
    const gameRef = ref(db, `rooms/${roomId}/game`);
    const snap = await get(gameRef);
    if (!snap.exists()) return;

    const game = snap.val();

    let {
        turnOrder,
        hands,
        missCount,
        turnIndex
    } = game;

    // Remove player
    turnOrder = turnOrder.filter(id => id !== playerUID);
    delete hands[playerUID];
    delete missCount[playerUID];

    // Fix turn index
    if (turnIndex >= turnOrder.length) {
        turnIndex = 0;
    }

    // 🔥 Check win condition
    if (turnOrder.length === 1) {
        await declareWinner(turnOrder[0]);
        return;
    }

    await update(gameRef, {
        turnOrder,
        hands,
        missCount,
        turnIndex
    });
}
// ----------------------------------------------------------------------------
// ---------------------------UNO Button---------------------------------------
// ----------------------------------------------------------------------------
function hasAtLeastOneLegalCard(hand, topCard, currentColor) {
    return hand.some(cardObj =>
        isLegalMove(cardObj.card, topCard.card, currentColor)
    );
}
unoBtn.addEventListener("click", async () => {
    if (!currentGame) return;
    if (currentGame.gameStatus === "finished") return;
    const { turnIndex, lastUnoPress } = currentGame;

    // ❌ UNO already pressed once this turn → IGNORE
    if (lastUnoPress && lastUnoPress.turnIndex === turnIndex) {
        return;
    }
    const {
        turnOrder,
        hands,
        discardPile,
        currentColor
    } = currentGame;

    const currentTurnUID = turnOrder[turnIndex];
    const targetHand = hands[currentTurnUID];
    const topCard = discardPile.at(-1);

    // ❌ safety
    if (!targetHand || !topCard) return;

    // ❌ MUST be exactly 2 cards (2nd last card rule)
    if (targetHand.length !== 2) return;

    // ❌ MUST have at least one legal move
    if (!hasAtLeastOneLegalCard(targetHand, topCard, currentColor)) return;

    // ✅ VALID UNO PRESS → SAVE
    await update(ref(db, `rooms/${roomId}/game`), {
        lastUnoPress: {
            uid: uid,
            turnIndex: turnIndex,
            time: Date.now()
        }
    });
});

const unoPressRef = ref(db, `rooms/${roomId}/game/lastUnoPress`);
onValue(unoPressRef, async (snap) => {
    if (!snap.exists()) return;
    if (!currentGame) return;
    const { uid: pressedUID, turnIndex } = snap.val();
    const gameRef = ref(db, `rooms/${roomId}/game`);

    const {
        turnOrder,
        hands,
        deck,
        direction
    } = currentGame;

    // ❌ ignore stale press
    if (turnIndex !== currentGame.turnIndex) return;
    const currentTurnUID = turnOrder[turnIndex];
    // -------------------------
    // 🟡 UNO DONE
    // -------------------------
    if (pressedUID === currentTurnUID) {
        // if (pressedUID === uid) {
        //     alert("✅ You said UNO!");
        // } else {
        //     alert("🔔 Player said UNO!");
        // }
        return;
    }

    // -------------------------
    // 🟢 UNO CAUGHT → DRAW 2 + NEXT TURN
    // -------------------------
    if (pressedUID !== currentTurnUID) {

        // 🔔 alerts
        // if (pressedUID === uid) {
        //     alert("🎯 You caught UNO!");
        // } else if (currentTurnUID === uid) {
        //     alert("⚠️ UNO caught! You forgot to say UNO!");
        // } else {
        //     alert("🔔 UNO was caught!");
        // }

        // 🎴 DRAW 2 CARDS
        const newDeck = [...deck];
        const drawn = newDeck.splice(0, 2);

        const updatedHand = [
            ...hands[currentTurnUID],
            ...drawn
        ];

        // ➡️ ADVANCE TURN
        const count = turnOrder.length;
        const nextIndex =
            (turnIndex + direction + count) % count;
        const nextUID = turnOrder[nextIndex];
        clearTurnTimer();
        await update(gameRef, {
            deck: newDeck,
            [`hands/${currentTurnUID}`]: updatedHand,
            turnIndex: nextIndex,
            [`hasDrawn/${nextUID}`]: false,
            lastUnoPress: null
        });
    }
});

// ---------------------------------------------------------------------------------
// --------------------------Winner detection---------------------------------------
// ---------------------------------------------------------------------------------
async function declareWinner(winnerUID) {
    const gameRef = ref(db, `rooms/${roomId}/game`);

    await update(gameRef, {
        winner: winnerUID,
        gameStatus: "finished"
    });

    // console.log("🏆 Winner declared:", winnerUID);
}
const winnerRef = ref(db, `rooms/${roomId}/game/winner`);

onValue(winnerRef, async (snap) => {
    if (!snap.exists()) return;

    const winnerUID = snap.val();

    // Show popup
    winnerPopup.classList.remove("hidden");

    if (winnerUID === uid) {
        winnerText.innerText = "🎉 Congratulations! You won the game!";
    } else {
        const userSnap = await get(
            ref(db, `rooms/${roomId}/players/${winnerUID}`)
        );
        const name = userSnap.exists()
            ? userSnap.val().username
            : "A player";

        winnerText.innerText = `🏆 ${name} won the game!`;
    }
});
winnerOkBtn.addEventListener("click", async () => {
    // 🔥 Completely remove game state
    await remove(ref(db, `rooms/${roomId}/game`));
    // Allow host to start again
    await update(ref(db, `rooms/${roomId}`), {
        gameReady: null
    });
    // Go back to lobby
    window.location.href = `lobby.html?room=${roomId}`;
});

