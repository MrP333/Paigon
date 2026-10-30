import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { ENV } from './env';

const app = initializeApp(ENV.firebase);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Local development talks to the Firebase emulators, never a real project.
// Ports match firebase.json at the repo root.
if (ENV.useEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
