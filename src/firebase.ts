import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBk01r0-sPYJ-HqqtB0yd94v4kEeSHeVZA",
  authDomain: "astute-apparatus-75xj8.firebaseapp.com",
  projectId: "astute-apparatus-75xj8",
  storageBucket: "astute-apparatus-75xj8.firebasestorage.app",
  messagingSenderId: "805586542198",
  appId: "1:805586542198:web:7a454957c65cf7734e8957"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
// We specify the specific databaseId since it might not be the default one.
export const db = getFirestore(app, "ai-studio-demonslayerquiz-2ec13536-8fea-4d52-8fe8-7913e5566e7b");
