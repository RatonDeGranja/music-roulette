import {initializeApp} from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDCYH7WDmdZjaqXjg5qwnXhKssWsg1Kyn0",
  authDomain: "music-roulette-roberto.firebaseapp.com",
  projectId: "music-roulette-roberto",
  storageBucket: "music-roulette-roberto.firebasestorage.app",
  messagingSenderId: "828094298459",
  appId: "1:828094298459:web:c3cedf99ccdaa819f3c27e",
  measurementId: "G-2T6WEMSKN3"
};
const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);