import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
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

function clean(value) {
  if (value === undefined) return null;
  if (value === null) return null;
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
  if (!CONFIGURED || !db) {
    setStatus('⚠ Firebase config needed', false);
    return null;
  }
  try {
    const snap = await getDoc(dayRef());
    if (!snap.exists()) {
      setStatus('☁ Firebase ready — new day');
      return null;
    }
    setStatus('☁ Loaded from Firebase');
    return snap.data();
  } catch (err) {
    console.error('[Firebase] load failed:', err);
    setStatus('⚠ Firebase load failed', false);
    throw err;
  }
}

let saveTimer = null;
let pendingState = null;

async function saveDay(state, immediate = false) {
  if (!CONFIGURED || !db) return;
  pendingState = clean(state);
  if (!immediate) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => flushSave(), 350);
    return;
  }
  await flushSave();
}

async function flushSave() {
  if (!pendingState) return;
  const state = pendingState;
  pendingState = null;
  setStatus('☁ Saving...');
  try {
    await setDoc(dayRef(), {
      ...state,
      updatedAt: serverTimestamp()
    }, { merge: true });
    setStatus('✓ Saved to Firebase');
  } catch (err) {
    console.error('[Firebase] save failed:', err);
    pendingState = state;
    setStatus('⚠ Save failed — check connection', false);
  }
}

window.RRFB = {
  dateKey,
  loadDay,
  saveDay,
  flushSave,
  setStatus
};

window.dispatchEvent(new CustomEvent('rr-firebase-ready'));
