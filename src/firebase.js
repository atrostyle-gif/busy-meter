import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBK2JKoIBF671JJ4kuGez1kVcWjduM_zn0",
  authDomain: "busymeter-7e1bd.firebaseapp.com",
  databaseURL: "https://busymeter-7e1bd-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "busymeter-7e1bd",
  storageBucket: "busymeter-7e1bd.firebasestorage.app",
  messagingSenderId: "973491604184",
  appId: "1:973491604184:web:7220bad812dfed309c65ad"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export { signInWithPopup, signOut, onAuthStateChanged };