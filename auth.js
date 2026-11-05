// Tài khoản: đăng ký / đăng nhập bằng username + mật khẩu.
// - Mật khẩu băm bằng bcrypt (không bao giờ lưu mật khẩu thô)
// - Token đăng nhập ký HMAC-SHA256, sống 30 ngày
// - Lưu người dùng trong data/users.json ở máy, hoặc MongoDB khi có biến MONGODB_URI (xem store.js)
// - Giới hạn tốc độ theo IP để chống dò mật khẩu / spam đăng ký

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');

const store = require('./store');                 // lưu file ở máy / MongoDB khi có MONGODB_URI
const TOKEN_TTL = 30 * 24 * 3600 * 1000;

// ---------- Tài khoản (giữ trong bộ nhớ, ghi xuống file / database khi đổi) + khoá ký token ----------
let users = {}; // key: username viết thường -> { username, hash, createdAt, ... }
let SECRET = '';
let settings = {};  // cài đặt từ trang quản trị: { admins: [], ipBans: [], mainTpl, cinemaTheme, mainName }
const ready = (async () => { users = await store.init(); SECRET = await store.loadSecret(); settings = await store.loadSettings(); })();
const saveSettings = () => store.saveSettings(settings);
const saveUsers = () => store.saveUsers(users);

// chuẩn hoá tên: dạng Unicode NFC (bộ gõ khác nhau ra cùng 1 chữ), bỏ khoảng trắng đầu/cuối, nhiều dấu cách → 1 dấu cách
const cleanName = (name) => String(name || '').normalize('NFC').trim().replace(/\s+/g, ' ');
const keyOf = (name) => cleanName(name).toLocaleLowerCase('vi');   // so khớp không phân biệt hoa / thường

// ---------- Quản trị: chủ (biến môi trường ADMIN_USERS) + admin do chủ thêm; khoá tài khoản / IP ----------
const OWNERS = new Set(String(process.env.ADMIN_USERS || '').split(',').map((x) => keyOf(x)).filter(Boolean));
const isOwner = (name) => OWNERS.has(keyOf(name));
const isAdmin = (name) => isOwner(name) || (settings.admins || []).includes(keyOf(name));
const hasRole = (name, r) => { const u = users[keyOf(name)]; return !!(u && Array.isArray(u.roles) && u.roles.includes(r)); };
const banOf = (u) => (u && u.ban && (!u.ban.until || u.ban.until > Date.now()) ? u.ban : null);
const ipBanOf = (ip) => (ip ? (settings.ipBans || []).find((b) => b.ip === ip) || null : null);
const fmtUntil = (t) => (t ? 'đến ' + new Date(t).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false }) : 'vĩnh viễn');
const banMsg = (b) => `Tài khoản đã bị khoá ${fmtUntil(b.until)}${b.reason ? ' · Lý do: ' + b.reason : ''}`;
// ghi lại lần hoạt động gần nhất + IP (để quản trị phát hiện acc clone / hack); chỉ lưu xuống khi đổi IP hoặc sau 10 phút
function touch(name, ip) {
  const u = users[keyOf(name)]; if (!u) return;
  const now = Date.now(), changed = ip && u.lastIp !== ip;
  if (changed) { u.ips = [ip, ...(u.ips || []).filter((x) => x !== ip)].slice(0, 5); u.lastIp = ip; }
  if (changed || now - (u.lastSeen || 0) > 600_000) { u.lastSeen = now; saveUsers(); }
}

// ---------- Token ----------
const b64u = (s) => Buffer.from(s).toString('base64url');
function sign(username) {
  const u = users[keyOf(username)];
  const body = b64u(JSON.stringify({ u: username, v: (u && u.pv) || 0, exp: Date.now() + TOKEN_TTL }));
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return body + '.' + sig;
}
// Trả về username (đúng chữ hoa/thường đã đăng ký) hoặc null
function verify(token) {
  if (typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expect = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!p.exp || p.exp < Date.now()) return null;
    const u = users[keyOf(p.u)];
    if (!u || (p.v || 0) !== (u.pv || 0)) return null;      // đã đổi mật khẩu → token cũ không dùng được nữa
    return u.username;
  } catch {
    return null;
  }
}

// ---------- Rate limit ----------
const buckets = new Map();
function limited(key, max, windowMs) {
  const now = Date.now();
  const b = buckets.get(key) || { n: 0, reset: now + windowMs };
  if (now > b.reset) { b.n = 0; b.reset = now + windowMs; }
  b.n++;
  buckets.set(key, b);
  return b.n > max;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (now > b.reset) buckets.delete(k);
}, 60_000).unref();

// ---------- Routes ----------
const REG_LIMIT = Number(process.env.REG_LIMIT) || 8; // số lần đăng ký tối đa / giờ / IP
const USERNAME_RE = /^(?=.{3,16}$)[\p{L}\p{N}_.-]+(?: [\p{L}\p{N}_.-]+)*$/u;   // chữ (có dấu), số, _ . - và dấu cách giữa các từ
const DUMMY_HASH = bcrypt.hashSync('dummy-password', 10);
const router = express.Router();
const userOf = (req) => { const n = verify((req.get('authorization') || '').replace(/^Bearer\s+/i, '')); return n ? users[keyOf(n)] : null; };
const ipBlocked = (req, res) => { const b = ipBanOf(req.ip); if (b) res.status(403).json({ error: 'Mạng (IP) của bạn đã bị chặn' + (b.reason ? ' · Lý do: ' + b.reason : ''), banned: true }); return !!b; };
const avatarKey = (u) => keyOf(u.username), bgKey = (u) => 'bg:' + keyOf(u.username);

// ---------- Hồ sơ: ảnh đại diện (đặt trước json 2kb vì ảnh lớn hơn) ----------
router.post('/avatar', express.json({ limit: '400kb' }), async (req, res) => {
  const u = userOf(req); if (!u) return res.status(401).json({ error: 'Chưa đăng nhập' });
  if (limited('av:' + u.username, 10, 600_000)) return res.status(429).json({ error: 'Đổi ảnh quá nhiều lần, thử lại sau' });
  const data = req.body && req.body.data;
  if (data === null) {                                         // xoá ảnh
    await store.delFile(avatarKey(u)); delete u.avatarVer; await saveUsers();
    return res.json({ avatarVer: 0 });
  }
  const m = /^data:(image\/(jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(data || ''));
  if (!m) return res.status(400).json({ error: 'Ảnh không hợp lệ (chỉ JPG / PNG / WEBP)' });
  const buf = Buffer.from(m[3], 'base64');
  if (buf.length > 250_000) return res.status(400).json({ error: 'Ảnh quá lớn' });
  await store.putFile(avatarKey(u), m[1], buf);
  u.avatarVer = Date.now(); await saveUsers();
  res.json({ avatarVer: u.avatarVer });
});
router.get('/avatar/:name', async (req, res) => {
  const u = users[keyOf(req.params.name)];
  if (!u || !u.avatarVer) return res.status(404).end();
  try {
    const f = await store.getFile(avatarKey(u)); if (!f) return res.status(404).end();
    res.set('Content-Type', f.mime); res.set('Cache-Control', 'public, max-age=86400');
    res.send(f.data);
  } catch { res.status(404).end(); }
});

// ---------- Hồ sơ: nền sau lưng nhân vật — màu (2 màu chuyển) hoặc ảnh ----------
const hexc = (v) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null);
router.post('/profilebg', express.json({ limit: '1200kb' }), async (req, res) => {
  const u = userOf(req); if (!u) return res.status(401).json({ error: 'Chưa đăng nhập' });
  if (limited('bg:' + u.username, 30, 600_000)) return res.status(429).json({ error: 'Đổi nền quá nhiều lần, thử lại sau' });
  const b = req.body || {};
  if (b.reset) { await store.delFile(bgKey(u)); delete u.bg; await saveUsers(); return res.json({ bg: null }); }
  if (b.color) {                                               // nền màu: 1 hoặc 2 màu chuyển, góc chuyển 0–360
    const c1 = hexc(b.color[0]), c2 = hexc(b.color[1]) || c1, ang = Math.round(Math.min(360, Math.max(0, +b.angle || 160)));
    if (!c1) return res.status(400).json({ error: 'Màu không hợp lệ' });
    await store.delFile(bgKey(u));
    u.bg = { type: 'color', c1, c2, ang }; await saveUsers(); return res.json({ bg: u.bg });
  }
  const bright = (v) => Math.round(Math.min(1.6, Math.max(0.3, +v || 1)) * 100) / 100;
  if (b.brightness != null && !b.data) {                       // chỉ chỉnh độ sáng ảnh nền đang dùng
    if (!u.bg || u.bg.type !== 'image') return res.status(400).json({ error: 'Chưa có ảnh nền' });
    u.bg = { ...u.bg, bright: bright(b.brightness) }; await saveUsers(); return res.json({ bg: u.bg });
  }
  const m = /^data:(image\/(jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(b.data || ''));
  if (!m) return res.status(400).json({ error: 'Ảnh không hợp lệ (chỉ JPG / PNG / WEBP)' });
  const buf = Buffer.from(m[3], 'base64');
  if (buf.length > 850_000) return res.status(400).json({ error: 'Ảnh nền quá lớn' });
  await store.putFile(bgKey(u), m[1], buf);
  u.bg = { type: 'image', ver: Date.now(), bright: bright(b.brightness ?? (u.bg && u.bg.bright)) }; await saveUsers();
  res.json({ bg: u.bg });
});
router.get('/profilebg/:name', async (req, res) => {
  const u = users[keyOf(req.params.name)];
  if (!u || !u.bg || u.bg.type !== 'image') return res.status(404).end();
  try {
    const f = await store.getFile(bgKey(u)); if (!f) return res.status(404).end();
    res.set('Content-Type', f.mime); res.set('Cache-Control', 'public, max-age=86400');
    res.send(f.data);
  } catch { res.status(404).end(); }
});

router.use(express.json({ limit: '16kb' }));   // bộ đồ + màu sơn có thể dài hơn 2kb

router.post('/register', async (req, res) => {
  if (ipBlocked(req, res)) return;
  if (limited('reg:' + req.ip, REG_LIMIT, 3600_000)) return res.status(429).json({ error: 'Đăng ký quá nhiều lần, thử lại sau' });
  const username = cleanName(req.body && req.body.username);
  const password = String((req.body && req.body.password) || '');
  if (!USERNAME_RE.test(username)) return res.status(400).json({ error: 'Tên đăng nhập 3–16 ký tự: chữ (có dấu), số, dấu cách, _ . -' });
  if (password.length < 6 || password.length > 72) return res.status(400).json({ error: 'Mật khẩu từ 6 đến 72 ký tự' });
  if (users[keyOf(username)]) return res.status(409).json({ error: 'Tên đăng nhập đã có người dùng' });
  const hash = await bcrypt.hash(password, 10);
  if (users[keyOf(username)]) return res.status(409).json({ error: 'Tên đăng nhập đã có người dùng' });
  users[keyOf(username)] = { username, hash, createdAt: Date.now(), regIp: req.ip, lastIp: req.ip, ips: [req.ip], lastSeen: Date.now() };
  await saveUsers();
  res.json({ token: sign(username), username });
});

router.post('/login', async (req, res) => {
  if (limited('login:' + req.ip, 15, 60_000)) return res.status(429).json({ error: 'Thử quá nhiều lần, đợi 1 phút' });
  const password = String((req.body && req.body.password) || '').slice(0, 72);
  const u = users[keyOf(req.body && req.body.username)];
  const ok = await bcrypt.compare(password, u ? u.hash : DUMMY_HASH);
  if (!u || !ok) return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
  const b = banOf(u); if (b) return res.status(403).json({ error: banMsg(b), banned: true });
  if (!isAdmin(u.username) && ipBlocked(req, res)) return;
  touch(u.username, req.ip);
  res.json({ token: sign(u.username), username: u.username });
});

router.get('/me', (req, res) => {
  const u = userOf(req);
  if (!u) return res.status(401).json({ error: 'Chưa đăng nhập' });
  const b = banOf(u); if (b) return res.status(403).json({ error: banMsg(b), banned: true });
  touch(u.username, req.ip);
  ensureFashion(u);
  res.json({ username: u.username, createdAt: u.createdAt || null, avatarVer: u.avatarVer || 0, bg: u.bg || null, admin: isAdmin(u.username), roles: Array.isArray(u.roles) ? u.roles : [], ...fashionOf(u) });
});

// ---------- Thời trang: giới tính, màu da, đồ đã mua, đồ đang mặc ----------
// Danh mục đồ dùng chung với trình duyệt: public/catalog.json
const CATALOG = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'catalog.json'), 'utf8'));
const ITEMS = new Map(CATALOG.items.map((it) => [it.id, it]));
const REQUIRED = ['top', 'bottom', 'shoes', 'hair', 'face', 'bubble', 'dance', 'seat'];   // luôn phải mặc 1 món
const SLOTS = new Set(CATALOG.slots.map((s) => s.id));
const okFor = (it, g) => it && (it.g === 'u' || it.g === g);
const hex = (v) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null);
// equip = { slot: id } — riêng "dance" là mảng tối đa maxDances điệu (kết hợp, nhảy lần lượt)
// paint = { itemId: [màu chính, màu phụ] } — người dùng tự sơn màu từng món; mọi món đều có sẵn trong tủ đồ
const MAX_DANCES = CATALOG.maxDances || 4;
function cleanDances(v, g) {
  const arr = (Array.isArray(v) ? v : [v]).filter((id, k, a2) => { const it = ITEMS.get(id); return it && it.slot === 'dance' && okFor(it, g) && a2.indexOf(id) === k; });
  return arr.slice(0, MAX_DANCES);
}
function ensureFashion(u) {
  if (u.gender !== 'm' && u.gender !== 'f') u.gender = 'm';
  if (!hex(u.skin)) u.skin = '#f1c9a5';
  delete u.owned;
  if (!u.equip || typeof u.equip !== 'object') u.equip = {};
  for (const [slot, id] of Object.entries(u.equip)) {
    if (slot === 'dance') { const d = cleanDances(id, u.gender); if (d.length) u.equip.dance = d; else delete u.equip.dance; continue; }
    if (!okFor(ITEMS.get(id), u.gender) || ITEMS.get(id).slot !== slot) delete u.equip[slot];
  }
  for (const id of CATALOG.starter[u.gender]) { const it = ITEMS.get(id); if (!u.equip[it.slot]) u.equip[it.slot] = it.slot === 'dance' ? [id] : id; }
  if (!u.paint || typeof u.paint !== 'object') u.paint = {};
  for (const [id, c] of Object.entries(u.paint)) if (!ITEMS.has(id) || !Array.isArray(c)) delete u.paint[id];
  return u;
}
const equippedPaint = (u) => {
  const ids = Object.values(u.equip).flat(), out = {};
  for (const id of ids) if (u.paint[id]) out[id] = u.paint[id];
  return out;
};
const fashionOf = (u) => ({ gender: u.gender, skin: u.skin, equip: u.equip, paint: u.paint, pose: u.pose === 'dance' ? 'dance' : 'static' });

router.post('/profile', async (req, res) => {        // giới tính + màu da
  const u = userOf(req); if (!u) return res.status(401).json({ error: 'Chưa đăng nhập' });
  if (limited('pf:' + u.username, 30, 60_000)) return res.status(429).json({ error: 'Lưu quá nhanh, đợi chút nhé' });
  ensureFashion(u);
  const g = req.body && req.body.gender, sk = hex(req.body && req.body.skin);
  if (g === 'm' || g === 'f') u.gender = g;
  if (sk) u.skin = sk;
  const pose = req.body && req.body.pose; if (pose === 'static' || pose === 'dance') u.pose = pose;   // hồ sơ hiển thị: đứng yên / nhảy
  ensureFashion(u); await saveUsers();
  res.json(fashionOf(u));
});
router.post('/wardrobe', async (req, res) => {       // lưu bộ đồ đang mặc + màu sơn
  const u = userOf(req); if (!u) return res.status(401).json({ error: 'Chưa đăng nhập' });
  if (limited('wd:' + u.username, 60, 60_000)) return res.status(429).json({ error: 'Thao tác quá nhanh' });
  ensureFashion(u);
  const eq = req.body && req.body.equip, paint = req.body && req.body.paint;
  if (!eq || typeof eq !== 'object') return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
  for (const [slot, id] of Object.entries(eq)) {
    if (!SLOTS.has(slot)) continue;
    if (slot === 'dance') { const d = cleanDances(id, u.gender); if (!d.length) return res.status(400).json({ error: 'Chọn ít nhất 1 điệu nhảy' }); u.equip.dance = d; continue; }
    if (id == null) { if (!REQUIRED.includes(slot)) delete u.equip[slot]; continue; }
    const it = ITEMS.get(id);
    if (!it || it.slot !== slot || !okFor(it, u.gender)) return res.status(400).json({ error: 'Món này không hợp với nhân vật' });
    u.equip[slot] = id;
  }
  if (paint && typeof paint === 'object') {
    for (const [id, c] of Object.entries(paint).slice(0, 200)) {
      if (!ITEMS.has(id) || !Array.isArray(c)) continue;
      const c1 = hex(c[0]), c2 = hex(c[1]);
      if (c1 || c2) u.paint[id] = [c1, c2]; else delete u.paint[id];
    }
  }
  await saveUsers();
  res.json(fashionOf(u));
});

// ---------- Đổi mật khẩu ----------
router.post('/password', async (req, res) => {
  const u = userOf(req); if (!u) return res.status(401).json({ error: 'Chưa đăng nhập' });
  if (limited('pw:' + u.username, 6, 600_000)) return res.status(429).json({ error: 'Thử quá nhiều lần, đợi 10 phút' });
  const oldPw = String((req.body && req.body.oldPassword) || '').slice(0, 72), newPw = String((req.body && req.body.newPassword) || '');
  if (!(await bcrypt.compare(oldPw, u.hash))) return res.status(400).json({ error: 'Mật khẩu hiện tại không đúng' });
  if (newPw.length < 6 || newPw.length > 72) return res.status(400).json({ error: 'Mật khẩu mới từ 6 đến 72 ký tự' });
  if (newPw === oldPw) return res.status(400).json({ error: 'Mật khẩu mới phải khác mật khẩu cũ' });
  u.hash = await bcrypt.hash(newPw, 10); u.pv = (u.pv || 0) + 1; await saveUsers();
  res.json({ token: sign(u.username) });                      // token mới; các phiên đăng nhập khác bị đăng xuất
});

// Xoá hẳn tài khoản (trang quản trị): dữ liệu, ảnh đại diện, ảnh nền; tên được giải phóng để đăng ký lại
async function deleteUser(name) {
  const k = keyOf(name), u = users[k]; if (!u) return false;
  delete users[k];
  settings.admins = (settings.admins || []).filter((x) => x !== k);
  await store.deleteUser(k);
  await Promise.all([store.delFile(avatarKey(u)), store.delFile(bgKey(u))].map((p) => p.catch(() => {})));
  await saveUsers(); await saveSettings();
  return true;
}

// Cho server.js: trang phục + phiên bản ảnh đại diện của 1 người
function getProfile(name) {
  const u = users[keyOf(name)]; if (!u) return { look: null, av: 0 };
  ensureFashion(u);
  return { look: { gender: u.gender, skin: u.skin, equip: u.equip, paint: equippedPaint(u), pose: u.pose === 'dance' ? 'dance' : 'static' }, av: u.avatarVer || 0, bg: u.bg || null };
}

module.exports = {
  router, verify, getProfile, ready,
  // cho trang quản trị (admin.js)
  users: () => users, settings: () => settings, saveUsers, saveSettings, keyOf, cleanName,
  isOwner, isAdmin, hasRole, deleteUser, banOf, ipBanOf, banMsg, touch, userOf,
};
