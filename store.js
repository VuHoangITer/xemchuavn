// Lưu trữ dữ liệu: tài khoản, ảnh (đại diện / nền), khoá bí mật.
// - Chạy ở máy (không có MONGODB_URI): lưu file trong data/ như trước.
// - Có biến môi trường MONGODB_URI (vd khi đưa lên Render): lưu vào MongoDB Atlas → khởi động lại / deploy lại không mất dữ liệu.
// Tài khoản vẫn được giữ trong bộ nhớ để tra nhanh; khi thay đổi chỉ ghi những tài khoản thực sự đổi.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MONGO_URI = process.env.MONGODB_URI || '';
const DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const USERS_FILE = path.join(DIR, 'users.json');
const SECRET_FILE = path.join(DIR, 'secret.key');
const FILE_DIR = path.join(DIR, 'avatars');
const fileName = (name) => path.join(FILE_DIR, crypto.createHash('sha1').update(name).digest('hex') + '.img');

let mongo = null, colUsers = null, colFiles = null, colMeta = null;
const lastSaved = new Map();                  // key → JSON lúc ghi gần nhất (chỉ ghi tài khoản đã đổi)

async function init() {
  if (!MONGO_URI) {
    fs.mkdirSync(FILE_DIR, { recursive: true });
    let users = {};
    try { users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); } catch {}
    console.log('Lưu dữ liệu: file trong', DIR);
    return users;
  }
  const { MongoClient } = require('mongodb');
  mongo = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  await mongo.connect();
  const db = mongo.db(process.env.MONGODB_DB || undefined);   // tên database lấy từ chuỗi kết nối (mặc định "test")
  colUsers = db.collection('users'); colFiles = db.collection('files'); colMeta = db.collection('meta');
  const users = {};
  for await (const d of colUsers.find({})) { const { _id, ...u } = d; users[_id] = u; lastSaved.set(_id, JSON.stringify(u)); }
  console.log('Lưu dữ liệu: MongoDB ·', Object.keys(users).length, 'tài khoản');
  return users;
}

// ---- khoá ký token: biến môi trường AUTH_SECRET > lưu trong database / file
async function loadSecret() {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  if (colMeta) {
    const d = await colMeta.findOne({ _id: 'secret' });
    if (d && d.value) return d.value;
    const s = crypto.randomBytes(32).toString('hex');
    await colMeta.updateOne({ _id: 'secret' }, { $setOnInsert: { value: s } }, { upsert: true });
    return (await colMeta.findOne({ _id: 'secret' })).value;
  }
  try { return fs.readFileSync(SECRET_FILE, 'utf8').trim(); }
  catch { const s = crypto.randomBytes(32).toString('hex'); fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(SECRET_FILE, s, { mode: 0o600 }); return s; }
}

// ---- ghi tài khoản (gộp nhiều lần gọi liên tiếp thành 1 lần ghi)
let saving = Promise.resolve();
function saveUsers(users) {
  saving = saving.then(async () => {
    if (!colUsers) {
      const tmp = USERS_FILE + '.tmp';
      await fs.promises.writeFile(tmp, JSON.stringify(users));
      await fs.promises.rename(tmp, USERS_FILE);
      return;
    }
    const ops = [];
    for (const [k, u] of Object.entries(users)) {
      const j = JSON.stringify(u);
      if (lastSaved.get(k) !== j) { ops.push({ replaceOne: { filter: { _id: k }, replacement: u, upsert: true } }); lastSaved.set(k, j); }
    }
    if (ops.length) await colUsers.bulkWrite(ops, { ordered: false });
  }).catch((e) => console.error('Lỗi lưu tài khoản:', e.message));
  return saving;
}

// ---- ảnh: { mime, data }
async function putFile(name, mime, buf) {
  if (colFiles) return colFiles.replaceOne({ _id: name }, { _id: name, mime, data: buf, at: new Date() }, { upsert: true });
  await fs.promises.writeFile(fileName(name), Buffer.concat([Buffer.from(mime + '\n'), buf]));
}
async function getFile(name) {
  if (colFiles) { const d = await colFiles.findOne({ _id: name }); return d ? { mime: d.mime, data: Buffer.from(d.data.buffer || d.data) } : null; }
  try { const raw = await fs.promises.readFile(fileName(name)), nl = raw.indexOf(10); return { mime: raw.slice(0, nl).toString(), data: raw.slice(nl + 1) }; }
  catch { return null; }
}
async function delFile(name) {
  if (colFiles) return colFiles.deleteOne({ _id: name });
  await fs.promises.rm(fileName(name), { force: true });
}

module.exports = { init, loadSecret, saveUsers, putFile, getFile, delFile, usingMongo: () => !!colUsers };
