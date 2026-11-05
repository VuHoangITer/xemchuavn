// XEMCHUAVN - server
// Node.js + Express + Socket.IO
// - Đăng nhập bắt buộc (xem auth.js)
// - Mỗi phòng có 152 chỗ; ai vào sẽ được xếp 1 chỗ ngẫu nhiên, đổi chỗ qua bảng chọn ghế.
//   Quá 152 người thì vào chế độ "đứng xem" (vẫn xem + chat được, chỉ không có nhân vật).
// - Rạp công cộng ("main"): chỉ chat, vote bỏ qua video
// - Phòng riêng (mã 5 ký tự): chat + voice (WebRTC mesh) + ai cũng điều khiển được video

const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');
const auth = require('./auth');
const { resolveLink, LinkError } = require('./media');   // nhận diện mọi loại link video

const PORT = process.env.PORT || 3000;
const SEATS = 152;
// Loại phòng: số ghế, số chỗ nhảy, số người tối đa (phải khớp ROOM_TEMPLATES ở public/app.js)
const TEMPLATES = {
  cinema:  { name: 'Rạp lớn 152 chỗ',     seats: 152, dance: 5, cap: 0 },     // cap 0 = theo giới hạn chung
  mini30:  { name: 'Phòng chiếu 30 chỗ',  seats: 30,  dance: 0, cap: 30 },
  room10:  { name: 'Phòng VIP 10 chỗ',    seats: 10,  dance: 0, cap: 10 },
  couple2: { name: 'Phòng đôi',           seats: 2,   dance: 0, cap: 2 },
};
// Phong cách rạp lớn (phải khớp CINEMA_STYLES ở public/app.js; trang trí ở public/styles/<id>.js) — đổi trong trang quản trị
const CINEMA_THEMES = { demon: 'Huyền bí ác quỷ', luxury: 'Sang trọng', cosmic: 'Vũ trụ', anime: 'Anime hoa anh đào' };
const DANCE = 5;                // 5 chỗ nhảy trên bục: chỉ số 152..156 (không xếp ngẫu nhiên vào đây)
const PARTY_RATIO = 1 / 3;      // đủ 1/3 người trong phòng vote thì bật đèn bar
const MENU_IDS = new Set(['popcorn', 'popcorn_cheese', 'hotdog', 'fries', 'nachos', 'soda', 'milktea', 'juice', 'coffee', 'water']);   // 4 khu: ghế thường, ghế da, ghế đôi, giường nằm (bố cục ở public/app.js)
const SKIP_RATIO = 0.3; // đủ 30% người xem đồng ý thì chuyển bài
const MAX_QUEUE = 100;
const MAX_CHAT_LEN = 160;
const CHAT_HISTORY = 60;
const SYNC_INTERVAL_MS = 5000;
const MAX_PRIVATE_USERS = 150;
const MAX_OWNED_ROOMS = 3; // mỗi tài khoản tạo tối đa 3 phòng cùng lúc

// Mật khẩu phòng: scrypt + salt riêng, không lưu mật khẩu thô
function hashPw(pw) {
  const salt = crypto.randomBytes(16);
  return { salt, hash: crypto.scryptSync(pw, salt, 32) };
}
function checkPw(room, pw) {
  const h = crypto.scryptSync(pw, room.pw.salt, 32);
  return crypto.timingSafeEqual(h, room.pw.hash);
}

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY || process.env.RENDER) app.set('trust proxy', 1); // chạy sau proxy (Render / nginx / cloudflare) → lấy đúng IP người dùng
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e5 });

// Máy chủ ICE cho voice + chia sẻ màn hình: STUN miễn phí của Google, thêm TURN nếu có cấu hình (giúp mạng 4G / công ty vẫn kết nối được)
app.get('/api/ice', (req, res) => {
  const ice = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  if (process.env.TURN_URLS) ice.push({ urls: process.env.TURN_URLS.split(',').map((x) => x.trim()).filter(Boolean), username: process.env.TURN_USERNAME || '', credential: process.env.TURN_CREDENTIAL || '' });
  res.json({ iceServers: ice });
});
// cấu hình giao diện cho trình duyệt (đọc lúc tải trang)
app.get('/api/config', (req, res) => {
  const st = auth.settings(), main = rooms.get('main');
  res.set('Cache-Control', 'no-store').json({ mainTpl: main ? main.tpl : 'cinema', cinemaTheme: CINEMA_THEMES[st.cinemaTheme] ? st.cinemaTheme : 'demon' });
});
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.use('/api', auth.router);
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules', 'three')));
app.use(express.static(path.join(__dirname, 'public')));

// IP người dùng giống cách Express tính req.ip (sau proxy lấy địa chỉ cuối trong X-Forwarded-For)
function clientIp(socket) {
  const xff = String(socket.handshake.headers['x-forwarded-for'] || '').split(',').map((x) => x.trim()).filter(Boolean);
  return (app.get('trust proxy') && xff.length ? xff[xff.length - 1] : socket.handshake.address) || '';
}
// Chỉ cho socket đã đăng nhập
io.use((socket, next) => {
  const name = auth.verify(socket.handshake.auth && socket.handshake.auth.token);
  if (!name) return next(new Error('unauthorized'));
  const u = auth.users()[auth.keyOf(name)], ip = clientIp(socket);
  if (auth.banOf(u)) return next(new Error('banned'));
  if (auth.ipBanOf(ip) && !auth.isAdmin(name)) return next(new Error('banned'));
  socket.data.username = name;
  socket.data.ip = ip;
  auth.touch(name, ip);
  next();
});

// ---------- Room state ----------
const rooms = new Map();

function makeRoom(id, type, extra = {}) {
  const tpl = TEMPLATES[extra.tpl] ? extra.tpl : 'cinema', T = TEMPLATES[tpl];
  return {
    tpl, nSeats: T.seats, nDance: T.dance, cap: T.cap,
    id,
    type, // 'public' | 'private'
    name: extra.name || (type === 'public' ? 'Rạp công cộng' : id),
    owner: extra.owner || null,
    pw: extra.pw || null, // { salt, hash } nếu phòng có mật khẩu
    queue: [],
    current: null, // { vid, title, by }
    startedAt: 0, // thời điểm (ms) mà video ở giây 0
    paused: false,
    pausedAt: 0, // giây
    token: 0, // tăng mỗi lần đổi video
    votes: new Set(),
    users: new Map(), // socket.id -> { name, voice, seat }
    seats: new Array(T.seats + T.dance).fill(null), // seat index -> socket.id (sau các ghế là chỗ nhảy, nếu có)
    party: new Set(),               // ai đang vote bật đèn bar
    chat: [],
    emptyTimer: null,
    bt: null,
  };
}

rooms.set('main', makeRoom('main', 'public', { name: 'Rạp công cộng' }));

// Đổi bố cục rạp công cộng (trang quản trị): dựng lại phòng, giữ video / hàng chờ / chat; mọi người tải lại trang để vào cảnh mới
function setMainRoom(tpl, name) {
  const old = rooms.get('main');
  const nr = makeRoom('main', 'public', { name: name || old.name, tpl });
  for (const k of ['queue', 'current', 'startedAt', 'paused', 'pausedAt', 'token', 'chat']) nr[k] = old[k];
  if (old.tpl !== nr.tpl) {
    io.to('main').emit('server:reload', { what: 'layout', message: 'Quản trị viên vừa đổi bố cục rạp, đang tải lại…' });
    for (const sid of old.users.keys()) { const s = io.sockets.sockets.get(sid); if (s) { s.leave('main'); s.data.room = null; } }
  } else { nr.users = old.users; nr.seats = old.seats; nr.votes = old.votes; nr.party = old.party; }
  clearTimeout(old.bt);
  rooms.set('main', nr);
}

function position(room) {
  if (!room.current) return 0;
  return room.paused ? room.pausedAt : Math.max(0, (Date.now() - room.startedAt) / 1000);
}

function needVotes(room) {
  return Math.max(1, Math.ceil(room.users.size * SKIP_RATIO));
}

const PARTY_MS = 60 * 1000;      // đèn bar bật 1 phút rồi tự tắt (phải vote lại mới bật tiếp)
function partyNeed(room) { return Math.max(1, Math.ceil(room.users.size * PARTY_RATIO)); }
// Gọi sau mỗi lần số vote / số người thay đổi: đủ vote → bật + hẹn giờ tắt; tụt dưới mức → tắt luôn
function checkParty(room) {
  const on = room.party.size >= partyNeed(room);
  if (on && !room.partyTimer) {
    room.partyEnd = Date.now() + PARTY_MS;
    room.partyTimer = setTimeout(() => {
      room.partyTimer = null; room.partyEnd = 0;
      room.party.clear();                 // hết giờ: xoá vote, đèn tắt
      scheduleBroadcast(room);
    }, PARTY_MS);
  } else if (!on && room.partyTimer) {
    clearTimeout(room.partyTimer); room.partyTimer = null; room.partyEnd = 0;
  }
}
function partyState(room) {
  const need = partyNeed(room), on = !!room.partyTimer;
  return { votes: room.party.size, need, on, left: on ? Math.max(0, room.partyEnd - Date.now()) : 0, ids: [...room.party] };
}

function snapshot(room) {
  const list = [];
  let standing = 0;
  for (const [id, u] of room.users) {
    // Rạp công cộng: gửi mọi người đang ngồi + tối đa 150 người đứng xem (để nhẹ khi quá đông)
    if (room.type === 'public' && u.seat == null && ++standing > 150) continue;
    const pf = auth.getProfile(u.name);
    list.push({ id, name: u.name, seat: u.seat, voice: u.voice, recline: u.recline ?? 0.3, food: u.food || [], look: pf.look, av: pf.av, bg: pf.bg });
  }
  return {
    id: room.id,
    type: room.type,
    name: room.name,
    locked: !!room.pw,
    current: room.current,
    position: position(room),
    paused: room.paused,
    token: room.token,
    queue: room.queue.slice(0, 50),
    queueLength: room.queue.length,
    online: room.users.size,
    votes: room.votes.size,
    need: needVotes(room),
    party: partyState(room),
    users: list,
    share: room.share ? { id: room.share.id, name: room.share.name } : null,   // ai đang chia sẻ màn hình (phòng riêng)
  };
}

function broadcast(room) {
  clearTimeout(room.bt);
  room.bt = null;
  io.to(room.id).emit('state', snapshot(room));
}
// Gom các thay đổi hiện diện (vào/ra/đổi ghế/voice) để không gửi dồn dập khi phòng đông
function scheduleBroadcast(room) {
  if (room.bt) return;
  room.bt = setTimeout(() => {
    room.bt = null;
    io.to(room.id).emit('state', snapshot(room));
  }, 250);
}

function startNext(room) {
  const next = room.queue.shift() || null;
  room.current = next;
  room.startedAt = Date.now();
  room.paused = false;
  room.pausedAt = 0;
  room.token++;
  room.votes.clear();
  broadcast(room);
}

function pushChat(room, msg) {
  room.chat.push(msg);
  if (room.chat.length > CHAT_HISTORY) room.chat.shift();
  io.to(room.id).emit('chat', msg);
}

function sysMsg(room, text) {
  pushChat(room, { system: true, text, t: Date.now() });
}

// ---------- Helpers ----------
function extractVideoId(input) {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  let u;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'music.youtube.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else {
      const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/);
      if (m) id = m[1];
    }
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

async function fetchTitle(vid) {
  try {
    const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(
      'https://www.youtube.com/watch?v=' + vid
    )}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(3500) });
    if (!r.ok) return null;
    const j = await r.json();
    return typeof j.title === 'string' ? j.title.slice(0, 150) : null;
  } catch {
    return null;
  }
}

function newCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let tries = 0; tries < 50; tries++) {
    let c = '';
    for (let i = 0; i < 5; i++) c += chars[Math.floor(Math.random() * chars.length)];
    if (!rooms.has(c)) return c;
  }
  return null;
}

function randomFreeSeat(room) {
  const free = [];
  for (let i = 0; i < room.nSeats; i++) if (room.seats[i] == null) free.push(i);
  return free.length ? free[Math.floor(Math.random() * free.length)] : null;
}

function leaveRoom(socket) {
  const room = rooms.get(socket.data.room);
  if (!room) return;
  const u = room.users.get(socket.id);
  if (u && u.seat != null && room.seats[u.seat] === socket.id) room.seats[u.seat] = null;
  room.users.delete(socket.id);
  room.votes.delete(socket.id);
  room.party.delete(socket.id);
  checkParty(room);
  socket.leave(room.id);
  socket.data.room = null;
  if (u && u.voice) socket.to(room.id).emit('voice:left', socket.id);
  if (room.share && room.share.id === socket.id) { room.share = null; io.to(room.id).emit('share:ended'); broadcast(room); }   // người chia sẻ rời phòng
  if (room.type === 'private') {
    if (u) sysMsg(room, `${u.name} đã rời phòng`);
    if (room.users.size === 0) {
      clearTimeout(room.emptyTimer);
      room.emptyTimer = setTimeout(() => {
        if (room.users.size === 0) rooms.delete(room.id);
      }, 60_000);
    }
  }
  // vote có thể đủ sau khi người rời đi
  if (room.type === 'public' && room.current && room.votes.size >= needVotes(room)) startNext(room);
  else scheduleBroadcast(room);
}

// ---------- Socket handlers ----------
io.on('connection', (socket) => {
  socket.data.room = null;
  socket.data.lastChat = 0;
  socket.data.lastSeat = 0;

  socket.on('room:create', (d, cb) => {
    if (typeof d === 'function') { cb = d; d = {}; }
    if (typeof cb !== 'function') return;
    const me = socket.data.username;
    const name = String((d && d.name) || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 30) || `Phòng của ${me}`;
    const password = d && typeof d.password === 'string' ? d.password : '';
    if (password && (password.length < 4 || password.length > 32)) return cb({ error: 'Mật khẩu phòng từ 4 đến 32 ký tự' });
    if (rooms.size > 2000) return cb({ error: 'Server đang quá tải phòng' });
    let owned = 0;
    for (const r of rooms.values()) if (r.owner === me) owned++;
    if (owned >= MAX_OWNED_ROOMS) return cb({ error: `Bạn đang có ${MAX_OWNED_ROOMS} phòng, hãy đợi phòng cũ đóng (trống 1 phút sẽ tự đóng)` });
    const code = newCode();
    if (!code) return cb({ error: 'Không tạo được phòng' });
    const tpl = d && TEMPLATES[d.tpl] ? d.tpl : 'cinema';
    rooms.set(code, makeRoom(code, 'private', { name, owner: me, pw: password ? hashPw(password) : null, tpl }));
    // Phòng chưa có ai vào vẫn tự đóng sau 1 phút
    const r = rooms.get(code);
    r.emptyTimer = setTimeout(() => { if (r.users.size === 0) rooms.delete(code); }, 60_000);
    cb({ code, tpl });
  });

  socket.on('rooms:list', (cb) => {
    if (typeof cb !== 'function') return;
    const list = [...rooms.values()].map((r) => ({
      id: r.id, name: r.name, type: r.type, tpl: r.tpl, cap: r.cap || null, online: r.users.size, locked: !!r.pw,
      title: r.current ? r.current.title : null,
    }));
    list.sort((a, b) => (a.type === b.type ? b.online - a.online : a.type === 'public' ? -1 : 1));
    cb(list.slice(0, 100));
  });

  socket.on('join', (data, cb) => {
    cb = typeof cb === 'function' ? cb : () => {};
    const raw = String((data && data.room) || 'main').toUpperCase().trim();
    const id = raw === 'MAIN' ? 'main' : raw;
    const room = rooms.get(id);
    if (!room) return cb({ error: 'Không tìm thấy phòng ' + id });
    if (room.pw && room.owner !== socket.data.username) {
      const pw = data && typeof data.password === 'string' ? data.password : '';
      if (!pw) return cb({ error: 'Phòng này có mật khẩu', needPassword: true, name: room.name });
      const now = Date.now();
      if (now - (socket.data.pwT || 0) > 60_000) { socket.data.pwT = now; socket.data.pwN = 0; }
      if (++socket.data.pwN > 6) return cb({ error: 'Nhập sai quá nhiều lần, đợi 1 phút', needPassword: false });
      if (!checkPw(room, pw)) return cb({ error: 'Sai mật khẩu phòng', needPassword: true, wrong: true, name: room.name });
    }
    if (socket.data.room === room.id) return cb({ ok: true, type: room.type, tpl: room.tpl, id: room.id, name: room.name, me: socket.id, seat: room.users.get(socket.id)?.seat ?? null });
    if (socket.data.room) leaveRoom(socket);
    if (room.type === 'private' && room.users.size >= (room.cap || MAX_PRIVATE_USERS)) return cb({ error: room.cap ? `Phòng đã đủ ${room.cap} người` : 'Phòng đã đầy' });

    // Cùng 1 tài khoản mở 2 tab: đá tab cũ ra
    for (const [otherId, u] of room.users) {
      if (u.name === socket.data.username && otherId !== socket.id) {
        const other = io.sockets.sockets.get(otherId);
        if (other) { other.emit('kicked'); leaveRoom(other); }
      }
    }

    clearTimeout(room.emptyTimer);
    const name = socket.data.username;
    const seat = randomFreeSeat(room);
    room.users.set(socket.id, { name, voice: false, seat });
    checkParty(room);                 // thêm người → cần nhiều vote hơn
    if (seat != null) room.seats[seat] = socket.id;
    socket.data.room = room.id;
    socket.data.name = name;
    socket.join(room.id);
    cb({ ok: true, type: room.type, tpl: room.tpl, id: room.id, name: room.name, me: socket.id, seat });
    socket.emit('chat:history', room.chat);
    if (room.type === 'private') sysMsg(room, `${name} đã vào phòng`);
    socket.emit('state', snapshot(room)); // người mới thấy ngay
    scheduleBroadcast(room);
  });

  socket.on('seat:take', (idx) => {
    const room = rooms.get(socket.data.room);
    const me = room && room.users.get(socket.id);
    if (!me || !Number.isInteger(idx) || idx < 0 || idx >= room.nSeats + room.nDance) return;
    const now = Date.now();
    if (now - socket.data.lastSeat < 800) return;
    socket.data.lastSeat = now;
    if (room.seats[idx] != null) return socket.emit('toast', 'Ghế này có người ngồi rồi');
    if (me.seat != null) room.seats[me.seat] = null;
    me.seat = idx;
    me.food = [];                    // đổi chỗ thì món cũ không theo sang
    room.seats[idx] = socket.id;
    scheduleBroadcast(room);
  });

  // Rời ghế: vẫn ở trong phòng xem tiếp (đứng xem), nhân vật đi ra
  socket.on('seat:leave', () => {
    const room = rooms.get(socket.data.room);
    const me = room && room.users.get(socket.id);
    if (!me || me.seat == null) return;
    if (room.seats[me.seat] === socket.id) room.seats[me.seat] = null;
    me.seat = null; me.food = [];
    scheduleBroadcast(room);
  });

  // Căn tin: chỉ người đang ngồi mới gọi được; tối đa 6 món / lần, 15 giây / lần
  socket.on('order', (items) => {
    const room = rooms.get(socket.data.room);
    const me = room && room.users.get(socket.id);
    if (!me) return;
    if (me.seat == null || me.seat >= room.nSeats) return socket.emit('toast', 'Bạn cần ngồi ghế mới gọi món được');
    if (!Array.isArray(items)) return;
    const list = items.filter((id) => typeof id === 'string' && MENU_IDS.has(id)).slice(0, 6);
    if (!list.length) return;
    const now = Date.now();
    if (now - (socket.data.lastOrder || 0) < 15000) return socket.emit('toast', 'Bạn vừa gọi món, đợi chút rồi gọi tiếp nhé');
    socket.data.lastOrder = now;
    me.food = list;
    io.to(room.id).emit('order', { uid: socket.id, seat: me.seat, items: list });
    scheduleBroadcast(room);
  });

  // Độ ngả lưng của ghế (0 = thẳng, 1 = ngả hết cỡ) — để mọi người thấy nhân vật ngả theo
  socket.on('seat:recline', (v) => {
    const room = rooms.get(socket.data.room);
    const me = room && room.users.get(socket.id);
    if (!me || typeof v !== 'number' || !Number.isFinite(v)) return;
    const now = Date.now();
    if (now - (socket.data.lastRecline || 0) < 100) return;
    socket.data.lastRecline = now;
    me.recline = Math.round(Math.min(1, Math.max(0, v)) * 100) / 100;
    scheduleBroadcast(room);
  });

  socket.on('add', async (url) => {
    const room = rooms.get(socket.data.room);
    if (!room) return;
    if (room.queue.length >= MAX_QUEUE) return socket.emit('toast', 'Hàng chờ đã đầy');
    const now = Date.now();
    if (now - (socket.data.lastAdd || 0) < 2500) return socket.emit('toast', 'Gửi chậm lại chút nhé');
    socket.data.lastAdd = now;
    let r;
    try { r = await resolveLink(url); }
    catch (e) { return socket.emit('toast', e instanceof LinkError ? e.message : 'Không lấy được video từ link này'); }
    if (!rooms.has(room.id)) return;
    const item = { src: r.src, vid: r.vid || null, url: r.url || null, h: r.h || null, kind: r.kind || null, live: !!r.live, title: r.title || 'Video', by: socket.data.name || 'Khách' };
    const title = item.title;
    room.queue.push(item);
    if (!room.current) startNext(room);
    else broadcast(room);
    socket.emit('toast', 'Đã thêm: ' + title);
  });

  // Chỉ phòng riêng: ai cũng điều khiển được
  socket.on('control', (d) => {
    const room = rooms.get(socket.data.room);
    if (!room || room.type !== 'private' || !room.current || !d) return;
    const t = Math.max(0, Number(d.time) || 0);
    if (d.action === 'play') {
      room.paused = false;
      room.startedAt = Date.now() - t * 1000;
    } else if (d.action === 'pause') {
      room.paused = true;
      room.pausedAt = t;
    } else return;
    socket.to(room.id).emit('state', snapshot(room));
  });

  // Đổi trang phục / ảnh đại diện → cả phòng thấy ngay
  socket.on('profile:changed', () => {
    const room = rooms.get(socket.data.room);
    const now = Date.now();
    if (!room || now - (socket.data.lastProfile || 0) < 1000) return;
    socket.data.lastProfile = now;
    scheduleBroadcast(room);
  });

  // Vote bật đèn bar (bấm lần nữa = rút vote)
  socket.on('party', () => {
    const room = rooms.get(socket.data.room);
    if (!room || !room.users.has(socket.id)) return;
    const now = Date.now();
    if (now - (socket.data.lastParty || 0) < 600) return;
    socket.data.lastParty = now;
    if (room.party.has(socket.id)) room.party.delete(socket.id); else room.party.add(socket.id);
    checkParty(room);
    scheduleBroadcast(room);
  });

  socket.on('skip', () => {
    const room = rooms.get(socket.data.room);
    if (!room || !room.current) return;
    if (room.type === 'private') return startNext(room);
    if (room.votes.has(socket.id)) room.votes.delete(socket.id); // bấm lần nữa = rút phiếu
    else room.votes.add(socket.id);
    if (room.votes.size >= needVotes(room)) startNext(room);
    else scheduleBroadcast(room);
  });

  // Client báo hết video. Chặn spam: phải qua >= 3s kể từ lúc bắt đầu.
  socket.on('ended', (d) => {
    const room = rooms.get(socket.data.room);
    if (!room || !room.current || !d || d.token !== room.token) return;
    if (Date.now() - room.startedAt < 3000) return;
    startNext(room);
  });

  socket.on('chat', (text) => {
    const room = rooms.get(socket.data.room);
    if (!room || typeof text !== 'string') return;
    const now = Date.now();
    if (now - socket.data.lastChat < 700) return;
    const t = text.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, MAX_CHAT_LEN);
    if (!t) return;
    socket.data.lastChat = now;
    const pf = auth.getProfile(socket.data.name);              // kèm ảnh đại diện + giới tính để khung chat hiển thị
    const eq = (pf.look && pf.look.equip) || {}, ne = eq.nameeffect || null;
    const ns = eq.namefont || ne ? { nf: eq.namefont || null, ne, pc: ne && pf.look.paint ? pf.look.paint[ne] || null : null } : null;   // kiểu chữ tên
    pushChat(room, { name: socket.data.name, text: t, id: socket.id, t: now, av: pf.av || 0, g: pf.look && pf.look.gender === 'f' ? 'f' : 'm', ns });
  });

  // ----- Voice (chỉ phòng riêng) -----
  socket.on('voice:join', (cb) => {
    const room = rooms.get(socket.data.room);
    if (!room || room.type !== 'private' || typeof cb !== 'function') return cb && cb([]);
    const me = room.users.get(socket.id);
    if (!me) return cb([]);
    const others = [...room.users.entries()].filter(([id, u]) => id !== socket.id && u.voice).map(([id]) => id);
    me.voice = true;
    cb(others);
    scheduleBroadcast(room);
  });

  socket.on('voice:leave', () => {
    const room = rooms.get(socket.data.room);
    if (!room) return;
    const me = room.users.get(socket.id);
    if (me && me.voice) {
      me.voice = false;
      socket.to(room.id).emit('voice:left', socket.id);
      scheduleBroadcast(room);
    }
  });

  socket.on('voice:signal', (d) => {
    const room = rooms.get(socket.data.room);
    if (!room || room.type !== 'private' || !d || !room.users.has(d.to)) return;
    io.to(d.to).emit('voice:signal', { from: socket.id, data: d.data });
  });

  // ----- Chia sẻ màn hình (chỉ phòng riêng, 1 người mỗi lúc): máy chủ chỉ chuyển tín hiệu WebRTC, hình đi thẳng giữa các máy -----
  socket.on('share:start', (cb) => {
    const room = rooms.get(socket.data.room), me = room && room.users.get(socket.id);
    if (typeof cb !== 'function') return;
    if (!room || room.type !== 'private' || !me) return cb({ error: 'Chỉ phòng riêng mới chia sẻ màn hình được' });
    if (room.share && room.share.id !== socket.id && room.users.has(room.share.id)) return cb({ error: room.share.name + ' đang chia sẻ màn hình' });
    room.share = { id: socket.id, name: me.name };
    sysMsg(room, me.name + ' bắt đầu chia sẻ màn hình');
    broadcast(room); cb({ ok: true });
  });
  socket.on('share:stop', () => {
    const room = rooms.get(socket.data.room);
    if (!room || !room.share || room.share.id !== socket.id) return;
    room.share = null; io.to(room.id).emit('share:ended'); broadcast(room);
  });
  socket.on('share:want', () => {                                      // người xem xin luồng hình → báo người chia sẻ tạo kết nối
    const room = rooms.get(socket.data.room);
    if (!room || !room.share || room.share.id === socket.id || !room.users.has(socket.id)) return;
    io.to(room.share.id).emit('share:want', { from: socket.id });
  });
  socket.on('share:signal', (d) => {
    const room = rooms.get(socket.data.room);
    if (!room || room.type !== 'private' || !room.share || !d || !room.users.has(d.to)) return;
    if (socket.id !== room.share.id && d.to !== room.share.id) return;  // chỉ trao đổi giữa người chia sẻ ↔ người xem
    io.to(d.to).emit('share:signal', { from: socket.id, data: d.data });
  });

  socket.on('disconnect', () => leaveRoom(socket));
});

// Đồng bộ định kỳ để sửa lệch thời gian
setInterval(() => {
  for (const room of rooms.values()) {
    if (room.current && !room.paused && room.users.size) {
      io.to(room.id).emit('sync', { token: room.token, position: position(room) });
    }
  }
}, SYNC_INTERVAL_MS);

// chờ nạp xong dữ liệu (file / MongoDB) rồi mới mở cổng
// trang quản trị
app.use('/api/admin', require('./admin')({ io, rooms, auth, TEMPLATES, CINEMA_THEMES, leaveRoom, startNext, sysMsg, setMainRoom }));
app.use('/api', (req, res) => res.status(404).json({ error: 'Không có API này' }));

auth.ready.then(() => {                                       // áp cài đặt đã lưu cho rạp công cộng
  const st = auth.settings();
  if ((st.mainTpl && TEMPLATES[st.mainTpl] && st.mainTpl !== 'cinema') || st.mainName) setMainRoom(TEMPLATES[st.mainTpl] ? st.mainTpl : 'cinema', st.mainName);
}).then(() => server.listen(PORT, () => console.log(`XEMCHUAVN chạy tại http://localhost:${PORT}`)))
  .catch((e) => { console.error('Không kết nối được nơi lưu dữ liệu:', e.message); process.exit(1); });
