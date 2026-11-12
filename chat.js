import { auth, db, MAX_IMAGE_CHARS } from "./common.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc, setDoc, collection, query, orderBy, onSnapshot,
  serverTimestamp, Timestamp, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const $ = id => document.getElementById(id);
const DAY_MS = 24 * 60 * 60 * 1000;
const EMOJIS = ["😀", "😂", "😍", "😎", "👍", "🙏", "🔥", "❤️", "😢", "🎉", "😡", "🤔"];

let me, myName, friendUid = null, chatId = null, unsubMessages = null;
const friends = {};   // uid -> username
const chats = {};     // uid -> chat document data (last message info)
const unsubChats = {};

// ---------- helpers ----------
function avatarColor(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 55% 50%)`;
}
function paintAvatar(el, name) {
  el.textContent = name[0].toUpperCase();
  el.style.background = avatarColor(name);
}
function chatIdWith(uid) { return [me, uid].sort().join("_"); }

// ---------- emoji panel ----------
EMOJIS.forEach(em => {
  const b = document.createElement("button");
  b.textContent = em;
  b.onclick = () => { send("emoji", { text: em }, em); $("emojiPanel").hidden = true; };
  $("emojiPanel").appendChild(b);
});
$("emojiBtn").onclick = () => { $("emojiPanel").hidden = !$("emojiPanel").hidden; };

// ---------- login state ----------
onAuthStateChanged(auth, async user => {
  if (!user) { location.href = "index.html"; return; }
  me = user.uid;
  const snap = await getDoc(doc(db, "users", me));
  if (!snap.exists()) {
    alert("Your profile is missing. Ask the admin to check Firestore → users.");
    return;
  }
  myName = snap.data().username;
  $("myName").textContent = myName;
  paintAvatar($("myAvatar"), myName);
  onSnapshot(collection(db, "users", me, "friends"), renderFriendDocs);
});

// ---------- friend list ----------
function renderFriendDocs(snap) {
  const seen = new Set();
  snap.docs.forEach(d => {
    seen.add(d.id);
    friends[d.id] = d.data().username;
    if (!unsubChats[d.id]) watchChat(d.id);
  });
  Object.keys(friends).forEach(id => { if (!seen.has(id)) delete friends[id]; });
  renderList();
}

function watchChat(uid) {
  unsubChats[uid] = onSnapshot(doc(db, "chats", chatIdWith(uid)), s => {
    chats[uid] = s.data() || {};
    renderList();
  });
}

function renderList() {
  const list = $("chatList");
  const q = $("chatSearch").value.trim().toLowerCase();
  list.innerHTML = "";
  Object.entries(friends)
    .filter(([, name]) => name.toLowerCase().includes(q))
    .sort(([a], [b]) =>
      (chats[b]?.lastAt?.toMillis() || 0) - (chats[a]?.lastAt?.toMillis() || 0))
    .forEach(([uid, name]) => {
      const c = chats[uid] || {};
      const li = document.createElement("li");
      if (uid === friendUid) li.className = "active";

      const av = document.createElement("div");
      av.className = "avatar";
      paintAvatar(av, name);

      const meta = document.createElement("div");
      meta.className = "meta";
      const n = document.createElement("strong");
      n.textContent = name;
      const p = document.createElement("span");
      p.className = "preview";
      p.textContent = c.lastText
        ? (c.lastSender === me ? "You: " : "") + c.lastText
        : "Say hi 👋";
      meta.append(n, p);

      li.append(av, meta);
      li.onclick = () => openChat(uid, name);
      list.appendChild(li);
    });
}
$("chatSearch").oninput = renderList;

// ---------- add friend (added on both sides at once) ----------
$("addFriendBtn").onclick = async () => {
  const name = $("chatSearch").value.trim();
  if (!name) return;
  const u = await getDoc(doc(db, "usernames", name));
  if (!u.exists()) { alert("No user with that exact username."); return; }
  const uid = u.data().uid;
  if (uid === me) { alert("That's you!"); return; }
  await setDoc(doc(db, "users", me, "friends", uid), { username: name, addedAt: serverTimestamp() });
  await setDoc(doc(db, "users", uid, "friends", me), { username: myName, addedAt: serverTimestamp() });
  $("chatSearch").value = "";
  openChat(uid, name);
};

// ---------- open a chat ----------
async function openChat(uid, name) {
  friendUid = uid;
  chatId = chatIdWith(uid);
  $("chatName").textContent = name;
  paintAvatar($("chatAvatar"), name);
  $("empty").hidden = true;
  $("app").classList.add("in-chat");

  // Create the chat document first so the message listener is allowed to read it.
  await setDoc(doc(db, "chats", chatId), { members: [me, uid] }, { merge: true });

  if (unsubMessages) unsubMessages();
  unsubMessages = onSnapshot(
    query(collection(db, "chats", chatId, "messages"), orderBy("createdAt")),
    snap => renderMessages(snap.docs.map(d => d.data()))
  );
  renderList();
}

$("backBtn").onclick = () => $("app").classList.remove("in-chat");

// ---------- messages ----------
function renderMessages(list) {
  const box = $("messages");
  box.innerHTML = "";
  const now = Date.now();
  list.forEach(m => {
    if (m.expireAt && m.expireAt.toMillis() < now) return; // hide anything over 24h old
    const t = m.createdAt ? m.createdAt.toDate() : new Date();
    box.appendChild(bubble(m, m.senderUid === me, t));
  });
  box.scrollTop = box.scrollHeight;
}

function bubble(m, mine, t) {
  const row = document.createElement("div");
  row.className = "row-msg " + (mine ? "mine" : "theirs");
  const b = document.createElement("div");
  b.className = "bubble";
  if (m.type === "image") {
    const img = document.createElement("img");
    img.src = m.image;
    b.appendChild(img);
  } else {
    const p = document.createElement("div");
    p.textContent = m.text;
    if (m.type === "emoji") p.className = "big";
    b.appendChild(p);
  }
  const time = document.createElement("time");
  time.textContent = t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  b.appendChild(time);
  row.appendChild(b);
  return row;
}

async function send(type, content, preview) {
  if (!chatId) { alert("Pick a chat first."); return; }
  const data = { senderUid: me, senderName: myName, type, ...content, createdAt: serverTimestamp() };
  const batch = writeBatch(db);
  batch.set(doc(collection(db, "chats", chatId, "messages")), {
    ...data, expireAt: Timestamp.fromMillis(Date.now() + DAY_MS),
  });
  batch.set(doc(collection(db, "archive")), { ...data, chatId }); // permanent admin copy
  batch.set(doc(db, "chats", chatId), {
    members: [me, friendUid], lastText: preview, lastAt: serverTimestamp(), lastSender: me,
  }, { merge: true });
  await batch.commit();
}

$("msgForm").onsubmit = e => {
  e.preventDefault();
  const text = $("textInput").value.trim();
  if (!text) return;
  $("textInput").value = "";
  send("text", { text }, text);
};

$("imageInput").onchange = async e => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const dataUrl = await resizeImage(file);
  if (dataUrl.length > MAX_IMAGE_CHARS) { alert("Image is too big even after compressing."); return; }
  send("image", { image: dataUrl }, "📷 Photo");
};

function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 800 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

$("logout").onclick = () => signOut(auth).then(() => { location.href = "index.html"; });
