import { auth, db, emailFor, USERNAME_RE } from "./common.js";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const $ = id => document.getElementById(id);
let signupMode = false;

onAuthStateChanged(auth, user => { if (user) location.href = "chat.html"; });

$("toggle").onclick = e => {
  e.preventDefault();
  signupMode = !signupMode;
  $("title").textContent = signupMode ? "Sign up" : "Log in";
  $("submit").textContent = signupMode ? "Create account" : "Log in";
  $("toggle").textContent = signupMode ? "Already have an account? Log in" : "New here? Sign up";
  $("availability").textContent = "";
  $("error").textContent = "";
};

let timer;
$("username").oninput = () => {
  clearTimeout(timer);
  if (signupMode) timer = setTimeout(checkAvailability, 400);
};

async function checkAvailability() {
  const name = $("username").value;
  const out = $("availability");
  if (!USERNAME_RE.test(name)) {
    out.textContent = "3-20 letters, numbers, _ or .";
    out.className = "hint error";
    return;
  }
  const snap = await getDoc(doc(db, "usernames", name)); // exact, case-sensitive
  out.textContent = snap.exists() ? "Occupied ❌" : "Available ✅";
  out.className = "hint " + (snap.exists() ? "error" : "ok");
}

$("submit").onclick = async () => {
  const name = $("username").value;
  const pass = $("password").value;
  $("error").textContent = "";
  if (!USERNAME_RE.test(name)) {
    $("error").textContent = "Username must be 3-20 letters, numbers, _ or .";
    return;
  }
  if (pass.length < 6) {
    $("error").textContent = "Password must be at least 6 characters.";
    return;
  }
  try {
    if (signupMode) await signUp(name, pass);
    else await signInWithEmailAndPassword(auth, emailFor(name), pass);
    location.href = "chat.html";
  } catch (err) {
    $("error").textContent = friendly(err);
  }
};

async function signUp(name, pass) {
  const cred = await createUserWithEmailAndPassword(auth, emailFor(name), pass);
  try {
    await setDoc(doc(db, "usernames", name), { uid: cred.user.uid });
  } catch (err) {
    await cred.user.delete(); // roll back so no orphan account is left
    throw err;
  }
  // Plain-text password stored as requested; only the admin can read this document.
  await setDoc(doc(db, "users", cred.user.uid), {
    username: name, password: pass, createdAt: serverTimestamp(),
  });
}

function friendly(err) {
  switch (err.code) {
    case "auth/email-already-in-use": return "Occupied ❌ - pick another username";
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password": return "Wrong username or password.";
    case "auth/weak-password": return "Password must be at least 6 characters.";
    case "permission-denied": return "This username is not allowed to sign up.";
    default: return err.message;
  }
}