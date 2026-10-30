/**
 * Firestore security rules tests. Run against the local emulator only:
 *
 *   npm run test:rules        (from the repo root; needs Java 21 for firebase-tools 15)
 *
 * Each test encodes either something the real client code does (must be
 * allowed) or something an attacker would try (must be denied).
 */
import test, { after, before, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection,
  runTransaction, writeBatch, serverTimestamp, increment, Timestamp,
} from 'firebase/firestore';

const here = path.dirname(fileURLToPath(import.meta.url));
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: process.env.GCLOUD_PROJECT?.startsWith('demo-') ? process.env.GCLOUD_PROJECT : 'demo-paigon-rules',
    firestore: { rules: readFileSync(path.join(here, '../../firestore.rules'), 'utf8'), host, port: Number(port) },
  });
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

const user = (uid, extra = {}) => env.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true, ...extra }).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const seed = (fn) => env.withSecurityRulesDisabled(async (ctx) => fn(ctx.firestore()));

/** The signup the site performs: profile and username index in one transaction. */
function signup(db, uid, username) {
  return runTransaction(db, async (tx) => {
    tx.set(doc(db, 'usernames', username.toLowerCase()), { uid });
    tx.set(doc(db, 'users', uid), {
      uid, email: `${uid}@example.com`, username, usernameLower: username.toLowerCase(),
      createdAt: serverTimestamp(), eligibilityConfirmed: true,
    });
  });
}

// ── Signup and usernames ──────────────────────────────────────────────────

test('signup: profile + username index together is allowed', async () => {
  await assertSucceeds(signup(user('alice'), 'alice', 'Alice_1'));
});

test('signup without a username (account page first visit) is allowed', async () => {
  await assertSucceeds(setDoc(doc(user('carol'), 'users/carol'), { uid: 'carol', email: 'carol@example.com', username: null, usernameLower: null, createdAt: serverTimestamp() }));
});

test('signup that writes balanceCents (the old game-page bug) is denied', async () => {
  await assertFails(setDoc(doc(user('bob'), 'users/bob'), { uid: 'bob', balanceCents: 0, createdAt: serverTimestamp() }));
});

test('a username without its index entry is denied', async () => {
  await assertFails(setDoc(doc(user('bob'), 'users/bob'), { uid: 'bob', username: 'Bobby', usernameLower: 'bobby' }));
});

test('a username already taken by someone else cannot be claimed', async () => {
  await signup(user('alice'), 'alice', 'Shared');
  await assertFails(signup(user('mallory'), 'mallory', 'shared'));
});

test('usernames must be valid and the index key lower-cased', async () => {
  await assertFails(signup(user('bob'), 'bob', 'ab'));
  await assertFails(signup(user('bob'), 'bob', 'has space'));
  await assertFails(signup(user('bob'), 'bob', '<script>'));
  const db = user('bob');
  await assertFails(runTransaction(db, async (tx) => {
    tx.set(doc(db, 'usernames', 'Bobby'), { uid: 'bob' });
    tx.set(doc(db, 'users', 'bob'), { uid: 'bob', username: 'Bobby', usernameLower: 'Bobby' });
  }));
});

test('changing username must release the old one in the same transaction (no hoarding)', async () => {
  const db = user('alice');
  await signup(db, 'alice', 'First');
  // Claim a second name while keeping the first: denied.
  await assertFails(runTransaction(db, async (tx) => {
    tx.set(doc(db, 'usernames', 'second'), { uid: 'alice' });
    tx.update(doc(db, 'users', 'alice'), { username: 'Second', usernameLower: 'second', usernameChangedAt: serverTimestamp() });
  }));
  // The way account.html does it, releasing the old name: allowed.
  await assertSucceeds(runTransaction(db, async (tx) => {
    tx.set(doc(db, 'usernames', 'second'), { uid: 'alice' });
    tx.update(doc(db, 'users', 'alice'), { username: 'Second', usernameLower: 'second', usernameChangedAt: serverTimestamp() });
    tx.delete(doc(db, 'usernames', 'first'));
  }));
});

test('someone else\'s username entry cannot be deleted', async () => {
  await signup(user('alice'), 'alice', 'Alice');
  await assertFails(deleteDoc(doc(user('mallory'), 'usernames/alice')));
});

test('usernames are not readable signed out', async () => {
  await signup(user('alice'), 'alice', 'Alice');
  await assertFails(getDoc(doc(anon(), 'usernames/alice')));
});

// ── Server-only fields ────────────────────────────────────────────────────

test('players cannot write balances, flags, points or results on their own profile', async () => {
  await seed(db => setDoc(doc(db, 'users/alice'), { uid: 'alice', balanceCents: 0, wins: 0 }));
  const db = user('alice');
  for (const field of ['balanceCents', 'isDev', 'points', 'wins', 'losses', 'lastWithdrawalAt', 'gamesPlayed', 'somethingNew']) {
    await assertFails(setDoc(doc(db, 'users/alice'), { [field]: 1 }, { merge: true }), field);
  }
  await assertFails(updateDoc(doc(db, 'users/alice'), { balanceCents: increment(100000) }));
});

test('admin email gives no browser-side exception, verified or not', async () => {
  await seed(db => setDoc(doc(db, 'users/boss'), { uid: 'boss', balanceCents: 0 }));
  for (const verified of [false, true]) {
    const db = env.authenticatedContext('boss', { email: 'contact@paigonco.com', email_verified: verified }).firestore();
    await assertFails(setDoc(doc(db, 'users/boss'), { balanceCents: increment(100000) }, { merge: true }));
    await assertFails(setDoc(doc(db, 'users/boss'), { isDev: true }, { merge: true }));
  }
});

test('legacy profiles carrying old fields can still update allowed fields', async () => {
  await seed(db => setDoc(doc(db, 'users/alice'), { uid: 'alice', balanceCents: 500, wins: 7, points: 40, username: 'Old Name!' }));
  const db = user('alice');
  await assertSucceeds(setDoc(doc(db, 'users/alice'), { preferredGame: 'dash' }, { merge: true }));
  await assertSucceeds(setDoc(doc(db, 'users/alice'), { winStreak: 3, lossStreak: 0, trialCompletedDash: true }, { merge: true }));
  await assertSucceeds(setDoc(doc(db, 'users/alice'), { soloRunsDateDash: '2026-10-29', soloRunsTodayDash: 2 }, { merge: true }));
});

test('profiles are private and cannot be deleted from the browser', async () => {
  await seed(db => setDoc(doc(db, 'users/alice'), { uid: 'alice' }));
  await assertFails(getDoc(doc(user('mallory'), 'users/alice')));
  await assertSucceeds(getDoc(doc(user('alice'), 'users/alice')));
  await assertFails(deleteDoc(doc(user('alice'), 'users/alice')));
});

// ── Results are server-written ────────────────────────────────────────────

test('match history: own is readable, nobody can write it from a browser', async () => {
  await seed(db => setDoc(doc(db, 'users/alice/matches/m1'), { game: 'dash', won: true }));
  await assertSucceeds(getDoc(doc(user('alice'), 'users/alice/matches/m1')));
  await assertFails(getDoc(doc(user('mallory'), 'users/alice/matches/m1')));
  await assertFails(addDoc(collection(user('alice'), 'users/alice/matches'), { game: 'DASH', won: true, createdAt: serverTimestamp() }));
});

test('public feeds are readable by anyone and writable by no browser', async () => {
  for (const c of ['leaderboard', 'recentActivity', 'matchResults', 'siteStats', 'tournaments']) {
    await seed(db => setDoc(doc(db, `${c}/x`), { v: 1 }));
    await assertSucceeds(getDoc(doc(anon(), `${c}/x`)), c);
    await assertFails(setDoc(doc(user('alice'), `${c}/y`), { winner: '<img src=x onerror=alert(1)>', createdAt: serverTimestamp() }), c);
  }
});

test('the integrity review queue is server-only, even for the flagged player', async () => {
  await seed(db => setDoc(doc(db, 'integrityFlags/type_ABC_alice'), { uid: 'alice', status: 'open' }));
  await assertFails(getDoc(doc(user('alice'), 'integrityFlags/type_ABC_alice')));
  await assertFails(getDoc(doc(anon(), 'integrityFlags/type_ABC_alice')));
  await assertFails(setDoc(doc(user('alice'), 'integrityFlags/type_ABC_alice'), { uid: 'alice', status: 'cleared' }));
  // Nor can a player lift the marker on their own match record.
  await seed(db => setDoc(doc(db, 'users/alice/matches/type_ABC'), { game: 'type', won: true, underReview: true }));
  await assertFails(setDoc(doc(user('alice'), 'users/alice/matches/type_ABC'), { underReview: false }, { merge: true }));
});

test('unknown collections are closed', async () => {
  await assertFails(setDoc(doc(user('alice'), 'anything/x'), { v: 1 }));
  await assertFails(getDoc(doc(anon(), 'stripeEvents/x')));
});

// ── Responsible gaming ────────────────────────────────────────────────────

test('self-exclusion can be set and extended but not cut short while active', async () => {
  const db = user('alice');
  await seed(db2 => setDoc(doc(db2, 'users/alice'), { uid: 'alice' }));
  const week = Timestamp.fromMillis(Date.now() + 7 * 864e5);
  const month = Timestamp.fromMillis(Date.now() + 30 * 864e5);
  await assertSucceeds(setDoc(doc(db, 'users/alice'), { selfExclusionUntil: week }, { merge: true }));
  await assertFails(setDoc(doc(db, 'users/alice'), { selfExclusionUntil: null }, { merge: true }));
  await assertFails(setDoc(doc(db, 'users/alice'), { selfExclusionUntil: Timestamp.fromMillis(Date.now() + 864e5) }, { merge: true }));
  await assertSucceeds(setDoc(doc(db, 'users/alice'), { selfExclusionUntil: month }, { merge: true }));
});

test('an expired self-exclusion can be cleared', async () => {
  await seed(db => setDoc(doc(db, 'users/alice'), { uid: 'alice', selfExclusionUntil: Timestamp.fromMillis(Date.now() - 864e5) }));
  await assertSucceeds(setDoc(doc(user('alice'), 'users/alice'), { selfExclusionUntil: null }, { merge: true }));
});
