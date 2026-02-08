import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getFirestore }  from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};

// 🔥 Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
