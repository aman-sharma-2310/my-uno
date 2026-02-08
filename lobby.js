import { db } from "./firebase-config.js";
import { ref, onValue, remove, get, set, update, onDisconnect, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
// ------------------------ Global Variables ----------------------------------
const auth = getAuth();
let uid = null;
onAuthStateChanged(auth, (user) => {
  if (!user) return;
  uid = user.uid; // ✅ TRUSTED UID
  console.log("Lobby UID:", uid);
  // ✅ SAFE: start lobby listeners & logic
  initLobby();
});

const params = new URLSearchParams(window.location.search);
const roomId = params.get("room");
const username = localStorage.getItem("unoUsername");
// const uid = localStorage.getItem("playerUID");
let roomData = null;
let isHost = false;
const MIN_CARDS = 7;
const MAX_CARDS = 14;
// -------------------------------Loading DOM---------------------------------
let startBtn = document.getElementById("startBtn");
let pass = document.getElementById("pass");
const exitModal = document.getElementById("exitModal");
const modalTitle = document.getElementById("modalTitle");
const modalMessage = document.getElementById("modalMessage");
const modalActions = document.getElementById("modalActions");
const container = document.getElementById("player-list");
document.getElementById("room-id").innerText = "Room ID: " + roomId;
const playersTab = document.getElementById("playersTab");
const settingsTab = document.getElementById("settingsTab");
const playersContent = document.getElementById("playersContent");
const settingsContent = document.getElementById("settingsContent");
const startCardsInput = document.getElementById("startCards");
const plusBtn = document.getElementById("plusCards");
const minusBtn = document.getElementById("minusCards");
function initLobby() {
    if (!uid) return; // safety

    // ---------------- PRESENCE ----------------
    const presenceRef = ref(db, `rooms/${roomId}/presence/${uid}`);

    set(presenceRef, {
        online: true,
        lastSeen: serverTimestamp()
    });

    onDisconnect(presenceRef).remove();

    const presenceRoot = ref(db, `rooms/${roomId}/presence`);
    let cleanupTimer = null;

    onValue(presenceRoot, async (snap) => {
        if (!snap.exists()) {
            cleanupTimer = setTimeout(async () => {
                const check = await get(presenceRoot);
                if (!check.exists()) {
                    await remove(ref(db, `rooms/${roomId}`));
                    console.log("🧹 Room auto-deleted (empty)");
                }
            }, 30000);
        } else if (cleanupTimer) {
            clearTimeout(cleanupTimer);
            cleanupTimer = null;
        }
    });

    // ---------------- ROOM LISTENER ----------------
    onValue(ref(db, `rooms/${roomId}`), (snap) => {
        if (!snap.exists()) {
            handleRoomDeleted();
            return;
        }

        roomData = snap.val();

        pass.textContent = "Password: " + roomData.password;
        pass.style.color = "yellow";
        pass.style.opacity = 0.8;
        pass.style.font = "13px";

        isHost = (roomData.host === uid);

        if (isHost && Object.keys(roomData.players).length > 1) {
            startBtn.style.display = "block";
        } else {
            startBtn.style.display = "none";
        }

        updatePlayers(roomData.players);
        applyHostSettingsUI(isHost);
        updateCount(roomData.players);
    });

    // ---------------- KICK LISTENER ----------------
    onValue(ref(db, `rooms/${roomId}/lastKick`), (snap) => {
        if (!snap.exists()) return;

        const data = snap.val();

        if (data.player === uid) {
            alert("You have been kicked from the room.");
            window.location.href = "index.html";
            return;
        }

        const kickedName =
            roomData?.players?.[data.player]?.username ?? "Player";

        alert(`${kickedName} was kicked by host.`);
    });

    // ---------------- START GAME LISTENER ----------------
    onValue(ref(db, `rooms/${roomId}/game/gameStarted`), (snap) => {
        if (snap.exists() && snap.val() === true) {
            window.location.href = `game.html?room=${roomId}`;
        }
    });

    // ---------------- START BUTTON ----------------
    startBtn.addEventListener("click", () => {
        if (!isHost) return;
        set(ref(db, `rooms/${roomId}/game/gameStarted`), true);
    });
}
// ----------------------------------------------------
document.getElementById("shareRoomBtn").addEventListener("click", async () => {
    if (!roomData) return;
    
    const text = 
    `🎮 Join my UNO Room!

    Room ID: ${roomId}
    Password: 
    ${roomData.password}
    
    Copy the password $ click on the link!
    Join here:
    ${window.location.origin}/index.html?room=${roomId}`;

    // ✅ Native Share (Mobile / Chrome / Edge)
    if (navigator.share) {
        try {
            await navigator.share({
                title: "UNO Game Invite",
                text: text
            });
        } catch (err) {
            console.log("Share cancelled");
        }
    } 
    // 🔁 Fallback: copy to clipboard
    else {
        await navigator.clipboard.writeText(text);
        alert("Room details copied to clipboard!");
    }
});
// ----------------------------------------------------
// 🔥 Render players + Kick buttons (UID system)
// ----------------------------------------------------

function updatePlayers(players) {
    container.innerHTML = "";

    Object.keys(players).forEach(playerUID => {
        const p = players[playerUID];

        const div = document.createElement("div");
        div.className = "player-item";

        div.innerText = p.username + (playerUID === roomData.host ? " (Host)" : "");

        // Host can kick others using UID
        if (isHost && playerUID !== uid) {
            const kickBtn = document.createElement("button");
            kickBtn.innerText = "Kick";
            kickBtn.className = "kick-btn";
            kickBtn.onclick = () => kickPlayer(playerUID);
            div.appendChild(kickBtn);
        }
        container.append(div);
    });
}
// ----------------------------------------------------
// 🔥 Player Count
// ----------------------------------------------------
function updateCount(players) {
    document.getElementById("count").innerText =
        `Players: ${Object.keys(players).length}`;
}
// ----------------------------------------------------
// 🔥 Kick Player (using UID)
// ----------------------------------------------------
async function kickPlayer(targetUID) {
    const ok = confirm(`Kick ${roomData.players[targetUID].username}?`);
    if (!ok) return;

    await set(ref(db, `rooms/${roomId}/lastKick`), {
        player: targetUID,
        by: uid,
        time: Date.now()
    });
    await remove(ref(db, `rooms/${roomId}/players/${targetUID}`));

    setTimeout(() => {
        remove(ref(db, `rooms/${roomId}/lastKick`));
    }, 1000);
}
// ----------------------------------------------------
// 🔥 Exit Room (Host or Player) — UID version
// ----------------------------------------------------
function showModal(title, message, buttons) {
    modalTitle.innerText = title;
    modalMessage.innerText = message;
    modalActions.innerHTML = "";

    buttons.forEach(btn => {
        const b = document.createElement("button");
        b.innerText = btn.text;
        b.className = btn.class;
        b.onclick = () => {
            exitModal.classList.add("hidden");
            btn.onClick();
        };
        modalActions.appendChild(b);
    });

    exitModal.classList.remove("hidden");
}
document.getElementById("exitBtn").addEventListener("click", async () => {
    const roomRef = ref(db, `rooms/${roomId}`);
    const snap = await get(roomRef);

    if (!snap.exists()) {
        window.location.href = "index.html";
        return;
    }

    const data = snap.val();
    const amIHost = data.host === uid;

    // NORMAL PLAYER
    if (!amIHost) {
        showModal(
            "Leave Room",
            "Are you sure you want to leave the room?",
            [
                {
                    text: "Leave",
                    class: "danger",
                    onClick: async () => {
                        await remove(ref(db, `rooms/${roomId}/players/${uid}`));
                        window.location.href = "index.html";
                    }
                },
                {
                    text: "Cancel",
                    class: "neutral",
                    onClick: () => { }
                }
            ]
        );
        return;
    }

    // HOST OPTIONS
    showModal(
        "Host Options",
        "You are the host. What do you want to do?",
        [
            {
                text: "Delete Room for Everyone",
                class: "danger",
                onClick: async () => {
                    await remove(roomRef);
                    window.location.href = "index.html";
                }
            },
            {
                text: "Leave & Assign New Host",
                class: "safe",
                onClick: async () => {
                    await remove(ref(db, `rooms/${roomId}/players/${uid}`));

                    const remaining = Object.keys(data.players || {}).filter(p => p !== uid);
                    if (remaining.length > 0) {
                        await set(ref(db, `rooms/${roomId}/host`), remaining[0]);
                    }

                    window.location.href = "index.html";
                }
            },
            {
                text: "Cancel",
                class: "neutral",
                onClick: () => { }
            }
        ]
    );
});


// ----------------------------------------------------
// 🔥 Handle Room Deleted
// ----------------------------------------------------
async function handleRoomDeleted() {
    const infoSnap = await get(ref(db, `rooms/${roomId}/deletedBy`));

    if (!isHost && infoSnap.exists()) {
        alert("Room was deleted by the host.");
    }

    window.location.href = "index.html";
}

// --------------------------------------------------------------
// ----------------------Game Settings --------------------------
// --------------------------------------------------------------

playersTab.onclick = () => {
    playersTab.classList.add("active");
    settingsTab.classList.remove("active");
    playersContent.classList.add("active");
    settingsContent.classList.remove("active");
};

settingsTab.onclick = () => {
    settingsTab.classList.add("active");
    playersTab.classList.remove("active");
    settingsContent.classList.add("active");
    playersContent.classList.remove("active");
};

// ------------- Setting available for only Host ------------
function applyHostSettingsUI(isHost) {
    const settingsBox = document.getElementById("settingsContent");
    if (!settingsBox) return;


    // 2️⃣ Disable all form controls (extra safety)
    settingsBox.querySelectorAll("input, select, button").forEach(el => {
        el.disabled = !isHost;
    });

    // 3️⃣ Host-only note (ALWAYS visible)
    let note = document.getElementById("hostNote");

    if (!isHost) {
        if (!note) {
            note = document.createElement("div");
            note.id = "hostNote";
            note.innerText = "⚠ Only host can change settings";
            note.style.color = "#e63946";
            note.style.fontSize = "13px";
            note.style.marginTop = "8px";
            note.style.textAlign = "center";
            note.style.pointerEvents = "none"; // note still readable

            settingsBox.appendChild(note);
        }
    } else {
        if (note) note.remove();
    }
}
// -------------------------------------------------------------------
async function saveGameSettings() {
    const roomRef = ref(db, `rooms/${roomId}`);
    const snap = await get(roomRef);
    if (!snap.exists()) return;

    const data = snap.val();
    if (data.host !== uid) return; // 🔒 host only

    const settings = {
        startCards: Math.min(
            14,
            Math.max(7, Number(startCardsInput.value))
        ),
        specialCards: {
            shuffle: document.getElementById("enableShuffle")?.checked ?? false,
            skipAll: document.getElementById("enableSkipAll")?.checked ?? false
        }
        //  Add here more settings
    };

    await update(
        ref(db, `rooms/${roomId}/game/gameSettings`),
        settings
    );

    console.log("✅ Game settings saved:", settings);
}

// -------------------------------------------------------------------

function updateButtons(value) {
    minusBtn.disabled = value <= MIN_CARDS;
    plusBtn.disabled = value >= MAX_CARDS;
}
onValue(
    ref(db, `rooms/${roomId}/game/gameSettings`),
    (snap) => {
        if (!snap.exists()) return;
        const settings = snap.val();

        // 🔢 Start Cards
        startCardsInput.value = settings.startCards;
        updateButtons(settings.startCards);
        if (document.getElementById("enableShuffle")) {
            document.getElementById("enableShuffle").checked =
                settings.specialCards?.shuffle ?? false;
        }

        if (document.getElementById("enableSkipAll")) {
            document.getElementById("enableSkipAll").checked =
                settings.specialCards?.skipAll ?? false;
        }
    }
);

plusBtn.addEventListener("click", async () => {
    if (plusBtn.disabled) return;
    startCardsInput.value++;
    updateButtons(Number(startCardsInput.value));
    await saveGameSettings();
});

minusBtn.addEventListener("click", async () => {
    if (minusBtn.disabled) return;
    startCardsInput.value--;
    updateButtons(Number(startCardsInput.value));
    await saveGameSettings();
});
// Init
updateButtons(Number(startCardsInput.value));
// Special Cards
document.querySelectorAll(".settings-box input")
    .forEach(input => {
        input.addEventListener("change", saveGameSettings);
    });
