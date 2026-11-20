import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  collection,
  getDocs,
  deleteDoc
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const STORE_ID = 'RR7024';
const CONFIGURED = firebaseConfig.apiKey && !firebaseConfig.apiKey.includes('PASTE_') && firebaseConfig.projectId && !firebaseConfig.projectId.includes('PASTE_');

let db = null;
if (CONFIGURED) {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
}

function dateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function dayRef(date = new Date()) {
  return doc(db, 'stores', STORE_ID, 'daily', dateKey(date));
}
function weeklyScheduleRef() {
  return doc(db, 'stores', STORE_ID, 'weeklySchedule', 'current');
}
function clean(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  if (Array.isArray(value)) return value.map(clean);
  if (typeof value === 'object') {
    const out = {};
    Object.entries(value).forEach(([k, v]) => { out[k] = clean(v); });
    return out;
  }
  return value;
}
function setStatus(text, ok = true) {
  const el = document.getElementById('firebase-save-status');
  if (!el) return;
  el.textContent = text;
  el.style.color = ok ? '#4ade80' : '#f87171';
}
async function loadDay() {
  if (!CONFIGURED || !db) { setStatus('⚠ Firebase config needed', false); return null; }
  try {
    const snap = await getDoc(dayRef());
    if (!snap.exists()) { setStatus('☁ Firebase ready — new day'); return null; }
    setStatus('☁ Loaded from Firebase');
    return snap.data();
  } catch (err) { console.error('[Firebase] load failed:', err); setStatus('⚠ Firebase load failed', false); throw err; }
}
let saveTimer = null;
let pendingState = null;
async function saveDay(state, immediate = false) {
  if (!CONFIGURED || !db) return;
  pendingState = clean(state);
  if (!immediate) { clearTimeout(saveTimer); saveTimer = setTimeout(() => flushSave(), 350); return; }
  await flushSave();
}
async function flushSave() {
  if (!pendingState) return;
  const state = pendingState; pendingState = null; setStatus('☁ Saving...');
  try {
    await setDoc(dayRef(), { ...state, updatedAt: serverTimestamp() }, { merge: true });
    setStatus('✓ Saved to Firebase');
  } catch (err) { console.error('[Firebase] save failed:', err); pendingState = state; setStatus('⚠ Save failed — check connection', false); }
}
async function loadWeeklySchedule() {
  if (!CONFIGURED || !db) { setStatus('⚠ Firebase config needed', false); return null; }
  const snap = await getDoc(weeklyScheduleRef());
  if (!snap.exists()) return null;
  return snap.data();
}
async function saveWeeklySchedule(schedule) {
  if (!CONFIGURED || !db) { setStatus('⚠ Firebase config needed', false); return; }
  try {
    await setDoc(weeklyScheduleRef(), { weeklySchedule: clean(schedule), updatedAt: serverTimestamp() }, { merge: true });
    setStatus('✓ Schedule saved to Firebase');
  } catch (err) {
    console.error('[Firebase] weekly schedule save failed:', err);
    setStatus('⚠ Schedule save failed — check connection', false);
    throw err;
  }
}
function dailyCheckerRef(monthKey) {
  return doc(db, 'stores', STORE_ID, 'dailyChecker', monthKey);
}
async function loadDailyChecker(monthKey) {
  if (!CONFIGURED || !db) { setStatus('⚠ Firebase config needed', false); throw new Error('Firebase is not configured'); }
  try {
    const snap = await getDoc(dailyCheckerRef(monthKey));
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    console.error('[Firebase] Daily Checker load failed:', err);
    setStatus('⚠ Daily Checker load failed', false);
    throw err;
  }
}
const dailyCheckerSaveTimers = new Map();
const dailyCheckerPending = new Map();
async function saveDailyChecker(monthKey, entries, immediate = false) {
  if (!CONFIGURED || !db) throw new Error('Firebase is not configured');
  dailyCheckerPending.set(monthKey, clean(entries));
  if (!immediate) {
    clearTimeout(dailyCheckerSaveTimers.get(monthKey));
    dailyCheckerSaveTimers.set(monthKey, setTimeout(() => { flushDailyChecker(monthKey).catch(() => {}); }, 400));
    return;
  }
  clearTimeout(dailyCheckerSaveTimers.get(monthKey));
  await flushDailyChecker(monthKey);
}
async function flushDailyChecker(monthKey) {
  if (!dailyCheckerPending.has(monthKey)) return;
  const entries = dailyCheckerPending.get(monthKey);
  dailyCheckerPending.delete(monthKey);
  dailyCheckerSaveTimers.delete(monthKey);
  setStatus('☁ Saving Daily Checker...');
  try {
    await setDoc(dailyCheckerRef(monthKey), { month: monthKey, entries, updatedAt: serverTimestamp() }, { merge: true });
    setStatus('✓ Daily Checker saved to Firebase');
  } catch (err) {
    console.error('[Firebase] Daily Checker save failed:', err);
    dailyCheckerPending.set(monthKey, entries);
    setStatus('⚠ Daily Checker save failed — check connection', false);
    throw err;
  }
}
async function clearDailyChecker(monthKey) {
  await saveDailyChecker(monthKey, {}, true);
}

function nonCashRef(month) {
  return doc(db, 'stores', STORE_ID, 'nonCash', month);
}
async function loadNonCash(month) {
  if (!CONFIGURED || !db) return null;
  const snap = await getDoc(nonCashRef(month));
  return snap.exists() ? snap.data() : null;
}
async function saveNonCash(month, state) {
  if (!CONFIGURED || !db) throw new Error('Firebase not configured');
  await setDoc(nonCashRef(month), clean(state));
}
// PMF – one document per saved Product Movement Form
async function listPmf() {
  if (!CONFIGURED || !db) return null;
  const snap = await getDocs(collection(db, 'stores', STORE_ID, 'pmf'));
  return snap.docs.map(d => ({ ...d.data(), id: d.id }));
}
async function savePmf(id, form) {
  if (!CONFIGURED || !db) throw new Error('Firebase not configured');
  await setDoc(doc(db, 'stores', STORE_ID, 'pmf', id), clean(form));
}
async function deletePmf(id) {
  if (!CONFIGURED || !db) throw new Error('Firebase not configured');
  await deleteDoc(doc(db, 'stores', STORE_ID, 'pmf', id));
}
window.RRFB = { dateKey, loadDay, saveDay, flushSave, loadWeeklySchedule, saveWeeklySchedule, loadDailyChecker, saveDailyChecker, clearDailyChecker, setStatus, loadNonCash, saveNonCash, listPmf, savePmf, deletePmf };
window.dispatchEvent(new CustomEvent('rr-firebase-ready'));
