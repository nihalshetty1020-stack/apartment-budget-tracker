import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDKl5TBd-XIiPnvuBxd56cG9sg_OlxeetU",
  authDomain: "apartment-budget-tracker.firebaseapp.com",
  projectId: "apartment-budget-tracker",
  storageBucket: "apartment-budget-tracker.firebasestorage.app",
  messagingSenderId: "389694587209",
  appId: "1:389694587209:web:99f521975999a66f1c9a98"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();