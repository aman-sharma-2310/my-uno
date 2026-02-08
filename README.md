# 🎮 UNO Multiplayer (Realtime)

A real-time multiplayer UNO card game built using **HTML, CSS, JavaScript, and Firebase Realtime Database**.
Players can create private rooms, join using room ID & password, and play UNO with real rules and live synchronization.

---

## ✨ Features

- 🔥 Real-time multiplayer gameplay
- 🔐 Private rooms with password protection
- 👥 Supports up to 12 players
- 🎴 Real UNO rules implemented
  - Skip, Reverse, +2, Wild, Wild +4
  - UNO press & UNO catch logic
- ⏱ Turn-based system with draw & pass rules
- 🏆 Winner detection with replay support
- 📱 Fully mobile-optimized UI
- 🚪 Host controls (delete room / transfer host)
- 🧠 Inactivity handling (auto-remove inactive players)

---

## 🕹 How to Play

1. Create a room and share the Room ID & password
2. Players join the lobby
3. Host starts the game
4. On your turn:
   - Play a legal card **OR**
   - Draw once → play if possible → else pass
5. Press **UNO** when you have 2 cards
6. First player to finish cards wins 🎉

---

## 🛠 Tech Stack

- **Frontend:** HTML, CSS, Vanilla JavaScript
- **Backend:** Firebase Realtime Database
- **Auth:** UID stored via localStorage
- **Architecture:** Client-side game engine with synced state

---

## 📱 Mobile Support

- Optimized for small screens
- No scrolling during gameplay
- Touch-friendly controls
- Responsive card scaling

---

## 🚀 Future Improvements

- Sound effects
- Spectator mode
- Chat inside room
- PWA support
- Game statistics

---

## 👨‍💻 Developer

**Aman Sharma**
Built as a learning + showcase project for real-time systems and game logic.
