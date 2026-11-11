import { auth, db, MAX_IMAGE_CHARS, makeBubble } from "./common.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc, setDoc, collection, query, orderBy, onSnapshot,
  serverTimestamp, Timestamp, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const $ = id => document.getElementById(id);
const DAY_MS = 24 * 60 * 60 * 1000;
const EMOJIS = ["😀", "😂", "😍", "😎", "👍", "🙏", "🔥", "❤️", "😢", "🎉", "😡", "🤔"];

let me, myName, chatId = null, unsubMessages = null;

EMOJIS.forEach(em => {
  const b = document.createElement("button");
  b.textContent = em;
  b.onclick = () => { send("emoji", { text: em }); $("emojiPanel").hidden = true; };
  $("emojiPanel").appendChild(b);
});
$("emojiBtn").onclick = () => { $("emojiPanel").hidden = !$("emojiPanel").hidden; };

onAuthStateChanged(auth, async user => {
  if (!user) { location.href = "index.html"; return; }
  me = user.uid;
  const snap = await getDoc(doc(db, "users", me));
  myName = snap.data().username;
  $("myName").textContent = myName;
  onSnapshot(collection(db, "users", me, "friends"), renderFriends);
});

function renderFriends(snap) {
  const list = $("friendsList");
  list.innerHTML = "";
  snap.docs
    .map(d => ({ uid: d.id, name: d.data().username }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(f => {
      const li = document.createElement("li");
      li.textContent = f.name;
      li.onclick = () => openChat(f.uid, f.name);
      list.appendChild(li);
    });
}

$("searchBtn").onclick = async () => {
  const name = $("searchInput").value.trim();
  if (!name) return;
  const u = await getDoc(doc(db, "usernames", name));
  if (!u.exists()) { alert("No user with that exact username."); return; }
  const uid = u.data().uid;
  if (uid === me) { alert("That's you!"); return; }
  await setDoc(doc(db, "users", me, "friends", uid), { username: name, addedAt: serverTimestamp() });
  $("searchInput").value = "";
  openChat(uid, name);
};

async function openChat(uid, name) {
  chatId = [me, uid].sort().join("_");
  $("chatTitle").textContent = name;
  const ref = doc(db, "chats", chatId);
  if (!(await getDoc(ref)).exists()) {
    try {
      await setDoc(ref, { members: [me, uid], createdAt: serverTimestamp() });
    } catch (e) { /* the other person created it first */ }
  }
  if (unsubMessages) unsubMessages();
  unsubMessages = onSnapshot(
    query(collection(db, "chats", chatId, "messages"), orderBy("createdAt")),
    snap => renderMessages(snap.docs.map(d => d.data()))
  );
}

function renderMessages(list) {
  const box = $("messages");
  box.innerHTML = "";
  const now = Date.now();
  list.forEach(m => {
    if (m.expireAt && m.expireAt.toMillis() < now) return; // hide anything older than 24h
    box.appendChild(makeBubble(m, m.senderUid === me));
  });
  box.scrollTop = box.scrollHeight;
}

async function send(type, content) {
  if (!chatId) { alert("Pick a friend first."); return; }
  const data = { senderUid: me, senderName: myName, type, ...content, createdAt: serverTimestamp() };
  const batch = writeBatch(db);
  batch.set(doc(collection(db, "chats", chatId, "messages")), {
    ...data, expireAt: Timestamp.fromMillis(Date.now() + DAY_MS),
  });
  batch.set(doc(collection(db, "archive")), { ...data, chatId }); // permanent admin copy
  await batch.commit();
}

$("msgForm").onsubmit = e => {
  e.preventDefault();
  const text = $("textInput").value.trim();
  if (!text) return;
  $("textInput").value = "";
  send("text", { text });
};

$("imageInput").onchange = async e => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const dataUrl = await resizeImage(file);
  if (dataUrl.length > MAX_IMAGE_CHARS) { alert("Image is too big even after compressing."); return; }
  send("image", { image: dataUrl });
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