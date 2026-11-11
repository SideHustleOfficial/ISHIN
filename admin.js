import { auth, db, makeBubble } from "./common.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc, getDocs, collection, query, orderBy, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const $ = id => document.getElementById(id);
let archive = [];

onAuthStateChanged(auth, async user => {
  if (!user) { location.href = "index.html"; return; }
  const snap = await getDoc(doc(db, "admins", user.uid)).catch(() => null);
  if (!snap || !snap.exists()) { $("denied").hidden = false; return; }
  $("app").hidden = false;
  loadUsers();
  loadArchive();
});

$("exportAll").onclick = () => download(archive, "chat-archive-all.json");

async function loadUsers() {
  const snap = await getDocs(collection(db, "users"));
  const tbody = $("usersTable").querySelector("tbody");
  tbody.innerHTML = "";
  snap.docs.forEach(d => {
    const u = d.data();
    const tr = document.createElement("tr");
    [u.username, u.password, d.id].forEach(v => {
      const td = document.createElement("td");
      td.textContent = v;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

async function loadArchive() {
  const snap = await getDocs(query(collection(db, "archive"), orderBy("createdAt")));
  archive = snap.docs.map(d => d.data());

  const byChat = {};
  archive.forEach(m => { (byChat[m.chatId] ??= []).push(m); });

  const list = $("chatList");
  list.innerHTML = "";
  Object.entries(byChat).forEach(([chatId, msgs]) => {
    const names = [...new Set(msgs.map(m => m.senderName))].join(" ↔ ");

    const row = document.createElement("div");
    row.className = "row";
    const label = document.createElement("span");
    label.textContent = `${names} — ${msgs.length} items`;

    const open = document.createElement("button");
    open.textContent = "Open";
    open.onclick = () => showChat(chatId, names, msgs);

    const del = document.createElement("button");
    del.textContent = "Delete live messages";
    del.onclick = () => deleteLive(chatId);

    const exp = document.createElement("button");
    exp.textContent = "JSON";
    exp.onclick = () => download(msgs, `chat-${chatId}.json`);

    row.append(label, open, del, exp);
    list.appendChild(row);
  });
}

function showChat(chatId, title, msgs) {
  $("chatView").hidden = false;
  $("viewTitle").textContent = title;
  $("exportChat").onclick = () => download(msgs, `chat-${chatId}.json`);
  $("deleteLive").onclick = () => deleteLive(chatId);
  const box = $("viewMessages");
  box.innerHTML = "";
  msgs.forEach(m => box.appendChild(makeBubble(m, false)));
}

async function deleteLive(chatId) {
  if (!confirm("Delete all LIVE messages in this chat? The permanent archive copy is kept.")) return;
  const snap = await getDocs(collection(db, "chats", chatId, "messages"));
  for (let i = 0; i < snap.docs.length; i += 450) { // batches are capped at 500 writes
    const batch = writeBatch(db);
    snap.docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
  alert(`Deleted ${snap.size} live messages.`);
}

function download(items, filename) {
  const clean = items.map(({ createdAt, ...rest }) => ({
    ...rest,
    createdAt: createdAt?.toDate ? createdAt.toDate().toISOString() : null,
  }));
  const blob = new Blob([JSON.stringify(clean, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}