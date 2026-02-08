import { db } from "./firebase-config.js";
import { ref, set, get } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
const auth = getAuth();
let uid = null;
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        await signInAnonymously(auth);
        return;
    }

    // 🔥 FINAL UID (Firebase trusted)
    uid = user.uid;
    localStorage.setItem("playerUID", uid); // optional, safe

    console.log("Firebase UID ready:", uid);

    // 🚀 Enable UI ONLY after UID is ready
    initUI();
});

function initUI() {
    let username = loadUsername();
    document.getElementById("username").innerText = username;
    document.getElementById("changeNameBtn")
        .addEventListener("click", () => {
            username = changeName(username);
            document.getElementById("username").innerText = username;
        });
    document.getElementById("showCreateBtn")
        .addEventListener("click", showCreateBox);
    document.getElementById("showJoinBtn")
        .addEventListener("click", showJoinBox);
    document.getElementById("createRoomBtn")
        .addEventListener("click", () => createRoom(username));
    document.getElementById("joinRoomBtn")
        .addEventListener("click", () => joinRoom(username));
}

const params = new URLSearchParams(window.location.search);
const sharedRoomId = params.get("room");
document.addEventListener("DOMContentLoaded", () => {
    if (sharedRoomId) {
        showJoinBox(); // 🔥 open join UI

        const roomInput = document.getElementById("roomCode");
        if (roomInput) {
            roomInput.value = sharedRoomId; // 🔥 auto-fill
            roomInput.focus();
        }
    }
});

// ----------------------------------------------------
// 🔥 Username System
// ----------------------------------------------------
function generateRandomName() {
    const names = ["Tiger", "Falcon", "Shadow", "Blaze", "Phantom", "Ninja", "Wolf", "Ghost", "Rider"];
    return names[Math.floor(Math.random() * names.length)] + (Math.floor(Math.random() * 900) + 100);
}
function loadUsername() {
    let saved = localStorage.getItem("unoUsername");
    if (!saved) {
        saved = generateRandomName();
        localStorage.setItem("unoUsername", saved);
    }
    return saved;
}

// ----------------------------------------------------
// 🔥 Close Create/Join Boxes
// ----------------------------------------------------
document.addEventListener("click", function (event) {
    const createBox = document.getElementById("createBox");
    const joinBox = document.getElementById("joinBox");

    if (event.target.closest("#showCreateBtn")) return;
    if (event.target.closest("#showJoinBtn")) return;
    if (event.target.closest("#createBox")) return;
    if (event.target.closest("#joinBox")) return;

    createBox.classList.add("hidden");
    joinBox.classList.add("hidden");
});


// ----------------------------------------------------
// 🔥 Change Username
// ----------------------------------------------------
function changeName(current) {
    const newName = prompt("Enter new username:", current);
    if (newName && newName.trim() !== "") {
        localStorage.setItem("unoUsername", newName.trim());
        return newName.trim();
    }
    return current;
}


// ----------------------------------------------------
// 🔥 UI Toggle
// ----------------------------------------------------
function showCreateBox() {
    document.getElementById("createBox").classList.remove("hidden");
    document.getElementById("joinBox").classList.add("hidden");
    document.getElementById("hostPassword").focus();
}

function showJoinBox() {
    document.getElementById("joinBox").classList.remove("hidden");
    document.getElementById("createBox").classList.add("hidden");
    document.getElementById("roomCode").focus();
}


// ----------------------------------------------------
// 🔥 CREATE ROOM — UID-based
// ----------------------------------------------------
async function createRoom(username) {
    try {
        const password = document.getElementById("hostPassword").value.trim();
        if (!password) return alert("Enter a password!");

        const roomId = Math.floor(100000 + Math.random() * 900000).toString();

        await set(ref(db, `rooms/${roomId}`), {
            host: uid, // 🔥 host UID
            password: password,
            players: {
                [uid]: { username: username } // 🔥 UID used as key
            }
        });
        window.location.href = `lobby.html?room=${roomId}`;
    } catch (err) {
        console.error("createRoom error:", err);
        alert("Failed to create room.\n" + err.message);
    }
}
// ----------------------------------------------------
// 🔥 JOIN ROOM — UID-based
// ----------------------------------------------------
async function joinRoom(username) {
    try {
        const roomId = document.getElementById("roomCode").value.trim();
        const password = document.getElementById("roomPassword").value.trim();

        if (!roomId || !password)
            return alert("Enter ID & Password");

        const roomRef = ref(db, `rooms/${roomId}`);
        const snap = await get(roomRef);

        if (!snap.exists())
            return alert("Room not found!");

        const data = snap.val();

        if (data.password !== password)
            return alert("Wrong password!");

        // 🔒 PLAYER LIMIT CHECK
        const players = data.players || {};
        const playerCount = Object.keys(players).length;

        if (playerCount >= 12) {
            alert("❌ Room is full (Max 12 players allowed)");
            return;
        }

        // 🔒 OPTIONAL: prevent join after game started
        if (data.gameReady === true) {
            alert("❌ Game already started. You cannot join now.");
            return;
        }

        // ✅ ADD PLAYER
        await set(ref(db, `rooms/${roomId}/players/${uid}`), {
            username,
            joinedAt: Date.now()
        });

        window.location.href = `lobby.html?room=${roomId}`;

    } catch (err) {
        console.error("joinRoom error:", err);
        alert("Failed to join room.\n" + err.message);
    }
}

