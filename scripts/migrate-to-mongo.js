// Chuyển dữ liệu đang có trên máy (data/users.json, ảnh trong data/avatars, khoá data/secret.key) lên MongoDB Atlas.
// Cách chạy (PowerShell):   $env:MONGODB_URI="mongodb+srv://..."; node scripts/migrate-to-mongo.js
// Cách chạy (Git Bash):     MONGODB_URI="mongodb+srv://..." node scripts/migrate-to-mongo.js
// Chạy lại nhiều lần cũng được (ghi đè theo tên tài khoản, không tạo trùng).
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');

const URI = process.env.MONGODB_URI;
if (!URI) { console.error('Thiếu biến MONGODB_URI'); process.exit(1); }
const DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const keyOf = (name) => String(name || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');   // giống auth.js
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex');

(async () => {
  const users = JSON.parse(fs.readFileSync(path.join(DIR, 'users.json'), 'utf8'));
  const client = new MongoClient(URI, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || undefined);
  const colUsers = db.collection('users'), colFiles = db.collection('files'), colMeta = db.collection('meta');
  let nu = 0, nf = 0;
  for (const [k, u] of Object.entries(users)) {
    await colUsers.replaceOne({ _id: k }, u, { upsert: true }); nu++;
    for (const name of [keyOf(u.username), 'bg:' + keyOf(u.username)]) {          // ảnh đại diện + ảnh nền
      const f = path.join(DIR, 'avatars', sha(name) + '.img');
      if (!fs.existsSync(f)) continue;
      const raw = fs.readFileSync(f), nl = raw.indexOf(10);
      await colFiles.replaceOne({ _id: name }, { _id: name, mime: raw.slice(0, nl).toString(), data: raw.slice(nl + 1), at: new Date() }, { upsert: true }); nf++;
    }
  }
  const secretFile = path.join(DIR, 'secret.key');                                 // giữ khoá cũ → người dùng không bị đăng xuất
  if (fs.existsSync(secretFile)) await colMeta.updateOne({ _id: 'secret' }, { $set: { value: fs.readFileSync(secretFile, 'utf8').trim() } }, { upsert: true });
  console.log(`Xong: ${nu} tài khoản, ${nf} ảnh đã lên MongoDB`);
  await client.close();
})().catch((e) => { console.error('Lỗi:', e.message); process.exit(1); });
