import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAIEYryVjB1gX2bzXWERNI0udfjHXuXwzc",
  authDomain: "paigonco.firebaseapp.com",
  projectId: "paigonco",
  storageBucket: "paigonco.appspot.com",
  messagingSenderId: "879434208536",
  appId: "1:879434208536:web:5ff633fc0534c3f1d73a6d"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
