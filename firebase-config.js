import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getDatabase, onValue, ref, set }  from "https://www.gstatic.com/firebasejs/11.0.0/firebase-database.js";
const firebaseConfig = {
    apiKey: "AIzaSyB_ADQx7ahelrhnQXrB0XLjeG7KufVqFvo",
    authDomain: "my-uno-f033e.firebaseapp.com",
    databaseURL: "https://my-uno-f033e-default-rtdb.asia-southeast1.firebasedatabase.app/",
    projectId: "my-uno-f033e",
    storageBucket: "my-uno-f033e.firebasestorage.app",
    messagingSenderId: "461966569116",
    appId: "1:461966569116:web:d616e5f9b045184a64c759"
};
const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);