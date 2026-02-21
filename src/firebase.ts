import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, FacebookAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

export const firebaseConfig = {
    apiKey: "AIzaSyAF5rs3cJFs_E6S7ouibqs7B2fgVRDLzc0",
    authDomain: "mn-nutriapp.firebaseapp.com",
    projectId: "mn-nutriapp",
    storageBucket: "mn-nutriapp.firebasestorage.app",
    messagingSenderId: "706226122083",
    appId: "1:706226122083:web:754e9feedc0cc0b5377756",
    measurementId: "G-J39PRJB106",
    geminiApiKey: (import.meta as any).env?.VITE_GEMINI_API_KEY || ""
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
export const facebookProvider = new FacebookAuthProvider();
