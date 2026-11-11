import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Firebase Auth needs an email, so each username maps to a hex-encoded fake email.
// Hex keeps every byte, so "Ali" and "ali" never collide.
export function emailFor(username) {
  const hex = [...new TextEncoder().encode(username)]
    .map(b => b.toString(16).padStart(2, "0")).join("");
  return `u${hex}@chat.local`;
}

export const USERNAME_RE = /^[A-Za-z0-9_.]{3,20}$/;
export const MAX_IMAGE_CHARS = 900000; // Firestore documents max out at 1 MiB

export function makeBubble(m, isMine) {
  const div = document.createElement("div");
  div.className = "bubble " + (isMine ? "mine" : "theirs");
  const who = document.createElement("small");
  who.textContent = m.senderName;
  div.appendChild(who);
  if (m.type === "image") {
    const img = document.createElement("img");
    img.src = m.image;
    div.appendChild(img);
  } else {
    const p = document.createElement("div");
    p.textContent = m.text;
    if (m.type === "emoji") p.className = "big";
    div.appendChild(p);
  }
  const t = document.createElement("time");
  t.textContent = m.createdAt ? m.createdAt.toDate().toLocaleString() : "sending…";
  div.appendChild(t);
  return div;
}