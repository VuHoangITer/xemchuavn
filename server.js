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
// lỗi lạ trong 1 sự kiện không được làm sập cả rạp: ghi log rồi chạy tiếp
process.on('uncaughtException', (e) => console.error('Lỗi chưa bắt:', e));
process.on('unhandledRejection', (e) => console.error('Promise lỗi chưa bắt:', e));
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
    djIdx: T.dance ? T.seats + T.dance : -1,   // chỗ đứng sau bàn DJ (chỉ phòng có sân khấu), ngay sau các chỗ nhảy
    arena: newArena(), boxInv: new Map(), boxAll: null,          // sân boxing riêng của phòng (xem public/app.js: SÂN BOXING)
    dj: null,                                   // { id, name, prev } người đang chơi DJ
    rate: 1,                                    // tốc độ phát chung (DJ chỉnh)
    djBeat: null,                               // { bpm, at }: nhịp bài đang phát, at = giây trong video có phách 1 (đèn / loa / tự động DJ dùng chung)
    djAuto: false,                              // DJ đang bật chế độ tự động đánh
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
    seats: new Array(T.seats + T.dance + (T.dance ? 1 : 0)).fill(null),   // + bàn DJ // seat index -> socket.id (sau các ghế là chỗ nhảy, nếu có)
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
  for (const k of ['queue', 'current', 'startedAt', 'paused', 'pausedAt', 'token', 'chat', 'rate', 'arena', 'boxInv']) nr[k] = old[k];
  if (old.tpl !== nr.tpl) {
    io.to('main').emit('server:reload', { what: 'layout', message: 'Quản trị viên vừa đổi bố cục rạp, đang tải lại…' });
    for (const sid of old.users.keys()) { const s = io.sockets.sockets.get(sid); if (s) { s.leave('main'); s.data.room = null; } }
  } else { nr.users = old.users; nr.seats = old.seats; nr.votes = old.votes; nr.party = old.party; }
  clearTimeout(old.bt);
  if (old.tpl !== nr.tpl) nr.botN = 0; else nr.botN = old.botN || 0;
  rooms.set('main', nr);
  balanceBots(nr, true);
}

function position(room) {
  if (!room.current) return 0;
  return room.paused ? room.pausedAt : Math.max(0, (Date.now() - room.startedAt) / 1000 * (room.rate || 1));
}
// đặt lại mốc thời gian để video đang ở giây t (theo tốc độ hiện tại)
function setPos(room, t) {
  if (room.paused) room.pausedAt = t; else room.startedAt = Date.now() - (t * 1000) / (room.rate || 1);
}
// đổi tốc độ phát chung mà không làm giật vị trí
function setRate(room, r) {
  const t = position(room); room.rate = r; setPos(room, t);
}

// số người thật trong phòng (bot lấp rạp không được vote)
const realCount = (room) => room.users.size - (room.botN || 0);
function needVotes(room) {
  return Math.max(1, Math.ceil(realCount(room) * SKIP_RATIO));
}

const PARTY_MS = 60 * 1000;      // đèn bar bật 1 phút rồi tự tắt (phải vote lại mới bật tiếp)
function partyNeed(room) { return Math.max(1, Math.ceil(realCount(room) * PARTY_RATIO)); }
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
  } else if (!on && room.partyTimer && !room.partyForced) {
    clearTimeout(room.partyTimer); room.partyTimer = null; room.partyEnd = 0;
  }
}
function partyState(room) {
  const need = partyNeed(room), on = !!room.partyTimer;
  return { votes: room.party.size, need, on, left: on ? Math.max(0, room.partyEnd - Date.now()) : 0, ids: [...room.party], dj: !!room.partyForced };
}

function snapshot(room) {
  const list = [];
  let standing = 0;
  for (const [id, u] of room.users) {
    // Rạp công cộng: gửi mọi người đang ngồi + tối đa 150 người đứng xem (để nhẹ khi quá đông)
    if (room.type === 'public' && u.seat == null && ++standing > 150) continue;
    if (u.bot) { list.push({ id, name: u.name, seat: u.seat, voice: false, recline: u.recline, food: [], look: u.look, av: 0, bg: null, snap: u.snapUntil > Date.now() || undefined }); continue; }
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
    rate: room.rate || 1,
    arena: arenaState(room),
    dj: room.dj ? { id: room.dj.id, name: room.dj.name, auto: !!room.djAuto } : null,
    djBeat: room.djBeat,
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
  room.rate = 1;
  room.djBeat = null;                           // bài mới → nhịp mới (DJ / tự động DJ gửi lại)
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
  if (room.dj && room.dj.id === socket.id) endDJ(room, false);
  arenaLeave(room, socket.id, 'rời phòng');
  room.boxInv.delete(socket.id);
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
  balanceBots(room);                                       // rạp công cộng có bot: 1 bot vào lấp chỗ trống
  // vote có thể đủ sau khi người rời đi
  if (room.type === 'public' && room.current && room.votes.size >= needVotes(room)) startNext(room);
  else scheduleBroadcast(room);
}

// ---------- Bot lấp đầy rạp công cộng (bật / tắt trong trang quản trị) ----------
// Bật: rạp công cộng luôn đầy ghế. Mỗi người thật vào → 1 bot đứng dậy đi ra nhường chỗ; người thật ra → 1 bot vào lại.
// Bot chỉ ngồi xem: không chat, không vote (vote bỏ qua / đèn bar chỉ tính người thật).
const BOT_A = ['Minh', 'Anh', 'Linh', 'Huy', 'Trang', 'Nam', 'Vy', 'Khoa', 'Thảo', 'Long', 'Ngọc', 'Phúc', 'Hà', 'Duy', 'My', 'Quân', 'Tú', 'Hân', 'Bảo', 'Nhi',
  'Khánh', 'Trâm', 'Đạt', 'Yến', 'Sơn', 'Thư', 'Kiên', 'Mai', 'Tâm', 'Hiếu', 'Lan', 'Phong', 'Giang', 'Châu', 'Vinh', 'Uyên', 'Thắng', 'Diệp', 'Hưng', 'Ly'];
const BOT_B = ['dz', 'kute', '2k5', '2k7', 'idol', 'vn', 'pro', 'xinh', 'baby', 'chan', 'kun', 'official', 'nè', 'oi', 'cute', 'no1'];
let botSeq = 0;
function botName(room) {
  const taken = new Set([...room.users.values()].map((u) => auth.keyOf(u.name)));
  for (let k = 0; k < 40; k++) {
    const a = BOT_A[Math.floor(Math.random() * BOT_A.length)], b = BOT_A[Math.floor(Math.random() * BOT_A.length)], r = Math.random();
    let n = r < 0.3 ? `${a} ${b}` : r < 0.55 ? `${a.toLowerCase()}${Math.floor(Math.random() * 99) + 1}` : r < 0.8 ? `${a.toLowerCase()}.${BOT_B[Math.floor(Math.random() * BOT_B.length)]}` : `${a}${b}`;
    n = n.slice(0, 16);
    const key = auth.keyOf(n);
    if (n.length >= 3 && !taken.has(key) && !auth.users()[key]) return n;   // không trùng tài khoản thật
  }
  return 'khach' + (++botSeq);
}
function addBot(room, snap) {
  const free = []; for (let i = 0; i < room.nSeats; i++) if (room.seats[i] == null) free.push(i);
  if (!free.length) return false;
  const id = 'bot_' + (++botSeq), seat = free[Math.floor(Math.random() * free.length)];
  room.users.set(id, { name: botName(room), bot: true, voice: false, seat, recline: Math.round((0.1 + Math.random() * 0.55) * 100) / 100, look: auth.randomLook(), snapUntil: snap ? Date.now() + 4000 : 0 });
  room.seats[seat] = id; room.botN = (room.botN || 0) + 1;
  return true;
}
function removeBot(room, id) {
  if (!id) { const ids = [...room.users.keys()].filter((k) => room.users.get(k).bot); if (!ids.length) return false; id = ids[Math.floor(Math.random() * ids.length)]; }
  const u = room.users.get(id); if (!u || !u.bot) return false;
  if (u.seat != null && room.seats[u.seat] === id) room.seats[u.seat] = null;
  room.users.delete(id); room.botN--; return true;
}
// giữ số bot = số ghế còn thiếu (chỉ rạp công cộng, khi đang bật)
function balanceBots(room, snap = false) {
  if (!room || room.id !== 'main') return;
  const on = !!auth.settings().bots, target = on ? Math.max(0, room.nSeats - realCount(room)) : 0;
  let changed = false;
  while ((room.botN || 0) > target && removeBot(room)) changed = true;
  while ((room.botN || 0) < target && addBot(room, snap)) changed = true;
  if (changed) scheduleBroadcast(room);
}
// người thật vào lúc rạp đầy: 1 bot nhường ghế trước
function makeSeatForReal(room) {
  if (room.id === 'main' && room.botN && randomFreeSeat(room) == null) removeBot(room);
}

// ---------- Sân boxing (đối kháng thời gian thực, tam khắc kiểu Naraka) ----------
// Đòn TRẮNG (đấm thẳng) thắng đòn ĐỎ · đòn ĐỎ (phản đòn) thắng đòn XANH · đòn XANH (đấm tụ lực, có giáp) thắng đòn TRẮNG.
//  - Trắng: nhanh. Trúng người đang thủ thế đỏ → phá thế (x1.5). Trúng người đang gồng xanh → chỉ nửa sát thương, không ngắt được.
//  - Xanh: giữ để gồng, tối đa 1.5s thì tự nhả; nhả trước 1s → thành đòn trắng. Trúng → đánh ngã (choáng) + đẩy lùi mạnh.
//  - Đỏ: thế phản đòn ~0.6s. Gặp đòn xanh → kẻ tấn công bị phá thế (choáng lâu, mất máu); gặp đòn trắng → người đỡ bị phá thế.
//  - Né: né được mọi đòn trong chốc lát, tốn thể lực; hết thể lực phải đợi hồi.
// Máy võ sĩ tự di chuyển, gửi vị trí 20 lần/giây. Server quyết định trúng / trượt. 100 máu, KO hoặc hết 90 giây.
const AR = {
  R: 6.0,                                                            // nửa cạnh sàn đấu (m)
  white: { dmg: 8, range: 2.35, wind: 130, cd: 450, kb: 0.55 },
  blue: { min: 1000, max: 1500, dmgLo: 16, dmgHi: 24, range: 3.9, wind: 180, cd: 700, kb: 1.6, stun: 900 },   // nhả xanh: lao người tới → với xa hơn nhiều
  air: { dmg: 11, range: 2.45, wind: 230, stun: 260, kb: 0.8 },     // nhảy đấm từ trên xuống (vẫn tính là đòn trắng)
  red: { win: 600, cd: 1400, stun: 1300, dmg: 6 },
  DODGE_MS: 380, DODGE_COST: 65, STAM_MAX: 100, STAM_REGEN: 14, STAM_DELAY: 900,   // né 1 lần rồi chờ ~3s mới né tiếp được
  LAG_MS: 250,                                                       // bù độ trễ mạng khi xét trúng đòn
  TIME: 90000, COUNT: 3500,
};
const SIDES = ['a', 'b'];
function per(v) { return { a: v, b: v }; }       // khai báo hàm (dùng được trước dòng này: newArena chạy lúc tạo rạp công cộng)
function newArena() {
  return { slots: { a: null, b: null }, phase: 'wait', hp: per(100), pos: { a: { x: -3, z: 0 }, b: { x: 3, z: 0 } },
    charge: per(0), red: per(0), dodge: per(0), stun: per(0), cd: per(0), rcd: per(0), stam: per(100), stamT: per(0), ctimer: per(null), hist: { a: [], b: [] },
    lastAtk: per(0), bot: null, botTimer: null,
    at: 0, timer: null, winner: null, reason: '' };
}
function arenaState(room) {
  const A = room.arena, sl = (x) => (x ? { id: x.id, name: x.name, bot: !!x.bot, look: x.look || undefined } : null);
  return { slots: { a: sl(A.slots.a), b: sl(A.slots.b) }, phase: A.phase, hp: A.hp, left: Math.max(0, A.at - Date.now()), winner: A.winner, reason: A.reason };
}
const arenaEmit = (room) => io.to(room.id).emit('ba:state', arenaState(room));
const sideOf = (A, id) => (A.slots.a && A.slots.a.id === id ? 'a' : A.slots.b && A.slots.b.id === id ? 'b' : null);
const other = (s) => (s === 'a' ? 'b' : 'a');
function stamNow(A, s, now) {                                        // thể lực hồi dần sau lần né cuối
  const t = A.stamT[s] || 0, since = now - t - AR.STAM_DELAY;
  return since > 0 ? Math.min(AR.STAM_MAX, A.stam[s] + since / 1000 * AR.STAM_REGEN) : A.stam[s];
}
function arenaReset(A) {
  A.hp = per(100); A.pos = { a: { x: -3, z: 0 }, b: { x: 3, z: 0 } }; A.hist = { a: [], b: [] };
  for (const s of SIDES) { clearTimeout(A.ctimer[s]); A.ctimer[s] = null; }
  A.charge = per(0); A.red = per(0); A.dodge = per(0); A.stun = per(0); A.cd = per(0); A.rcd = per(0); A.stam = per(AR.STAM_MAX); A.stamT = per(0);
}
function arenaCount(room) {                                          // đủ 2 người → về vị trí → đếm ngược
  const A = room.arena; clearTimeout(A.timer);
  A.phase = 'count'; A.at = Date.now() + AR.COUNT; A.winner = null; A.reason = ''; arenaReset(A);
  io.to(room.id).emit('ba:reset', { pos: A.pos });
  arenaEmit(room);
  sysMsg(room, `🥊 ${A.slots.a.name} đấu với ${A.slots.b.name} ở sân boxing!`);
  A.timer = setTimeout(() => {
    if (A.phase !== 'count') return;
    A.phase = 'fight'; A.at = Date.now() + AR.TIME; arenaEmit(room);
    if (A.bot) { clearInterval(A.botTimer); A.botTimer = setInterval(() => botTick(room), 50); }
    A.timer = setTimeout(() => arenaEnd(room, A.hp.a === A.hp.b ? null : A.hp.a > A.hp.b ? 'a' : 'b', 'hết giờ'), AR.TIME);
  }, AR.COUNT);
}
function arenaEnd(room, win, reason) {
  const A = room.arena; if (A.phase !== 'fight' && A.phase !== 'count') return;
  clearTimeout(A.timer); for (const s of SIDES) { clearTimeout(A.ctimer[s]); A.ctimer[s] = null; A.charge[s] = 0; }
  clearInterval(A.botTimer); A.botTimer = null;
  A.phase = 'end'; A.winner = win; A.reason = reason; A.at = Date.now() + 5000;
  const W = win && A.slots[win], L = win && A.slots[other(win)];
  io.to(room.id).emit('ba:end', { win, reason, winner: W ? W.name : null, loser: L ? L.name : null });
  sysMsg(room, W ? `🏆 ${W.name} thắng ${L ? L.name : ''} ở sân boxing (${reason})!` : `🤝 Trận boxing hoà (${reason})`);
  arenaEmit(room);
  A.timer = setTimeout(() => {                                       // xong trận: sân trống, ai cũng thách đấu được
    A.slots.a = A.slots.b = null; A.bot = null;
    A.phase = 'wait'; A.winner = null; A.reason = ''; A.hp = per(100);
    arenaEmit(room);
  }, 5000);
}
function arenaLeave(room, id, why) {                                 // rời sàn: đang đánh thì thua
  const A = room.arena, s = sideOf(A, id); if (!s) return;
  if (A.phase === 'fight' || A.phase === 'count') { arenaEnd(room, other(s), `${A.slots[s].name} bỏ cuộc${why ? ' · ' + why : ''}`); return; }
  if (A.phase === 'end') return;
  A.slots[s] = null; arenaEmit(room);
}
// khoảng cách gần nhất giữa 2 võ sĩ trong ~0.25s vừa qua (bù độ trễ: trên màn hình thấy trúng thì tính trúng)
function arenaDist(A, s, d, now) {
  const P = A.pos[s]; let best = Math.hypot(P.x - A.pos[d].x, P.z - A.pos[d].z);
  for (const h of A.hist[d]) if (now - h.t <= AR.LAG_MS) best = Math.min(best, Math.hypot(P.x - h.x, P.z - h.z));
  for (const h of A.hist[s]) if (now - h.t <= AR.LAG_MS) best = Math.min(best, Math.hypot(h.x - A.pos[d].x, h.z - A.pos[d].z));
  return best;
}
function arenaTryStart(room) { const A = room.arena; if (A.phase === 'wait' && A.slots.a && A.slots.b) arenaCount(room); }
function arenaDamage(room, d, dmg) { const A = room.arena; A.hp[d] = Math.max(0, A.hp[d] - dmg); return A.hp[d] <= 0; }
function arenaStun(room, s, ms) {                                    // choáng: huỷ gồng, không ra đòn được
  const A = room.arena; A.stun[s] = Date.now() + ms;
  if (A.charge[s]) { clearTimeout(A.ctimer[s]); A.ctimer[s] = null; A.charge[s] = 0; }
}
// đòn TRẮNG trúng / trượt
function botKnock(A, d, fx, fz, kb) {                                // bot trúng đòn: server tự đẩy lùi vị trí bot
  if (!A.bot || A.bot.side !== d || !kb) return;
  const Q = A.pos[d], dx = Q.x - fx, dz = Q.z - fz, l = Math.hypot(dx, dz) || 1;
  A.bot.kx += dx / l * kb * 7; A.bot.kz += dz / l * kb * 7;
}
function arenaWhite(room, s, air) {
  const A = room.arena; if (A.phase !== 'fight') return;
  const d = other(s), now = Date.now(), M = air ? { ...AR.white, ...AR.air } : AR.white, P = A.pos[s], Q = A.pos[d];
  if (A.stun[s] > now) return;                                       // bị choáng trong lúc vung → huỷ
  if (arenaDist(A, s, d, now) > M.range) return io.to(room.id).emit('ba:miss', { s, k: 'white' });
  if (A.dodge[d] > now) return io.to(room.id).emit('ba:miss', { s, k: 'white', dodged: true });
  let dmg = M.dmg, kind = 'normal', kb = M.kb, stun = 0;
  if (air) stun = M.stun;
  if (A.red[d] > now) { dmg = Math.round(M.dmg * 1.5); kind = 'breakred'; kb = M.kb * 1.4; stun = 450; A.red[d] = 0; }   // trắng phá đỏ
  else if (A.charge[d]) { dmg = Math.round(M.dmg * 0.5); kind = 'armor'; kb = 0; }                                        // xanh có giáp: không ngắt
  if (stun) arenaStun(room, d, stun);
  const ko = arenaDamage(room, d, dmg);
  botKnock(A, d, P.x, P.z, kb);
  io.to(room.id).emit('ba:hit', { s: d, by: s, k: air ? 'air' : 'white', kind, dmg, stun, hp: A.hp, kb, fx: P.x, fz: P.z });
  if (ko) arenaEnd(room, s, 'KO');
}
// đòn XANH (power 0..1 theo thời gian gồng 1s → 1.5s)
function arenaBlue(room, s, power) {
  const A = room.arena; if (A.phase !== 'fight') return;
  const d = other(s), now = Date.now(), M = AR.blue, P = A.pos[s], Q = A.pos[d];
  if (A.stun[s] > now) return;
  if (arenaDist(A, s, d, now) > M.range) return io.to(room.id).emit('ba:miss', { s, k: 'blue' });
  if (A.dodge[d] > now) return io.to(room.id).emit('ba:miss', { s, k: 'blue', dodged: true });
  if (A.red[d] > now) {                                              // đỏ khắc xanh: phản đòn
    A.red[d] = 0; arenaStun(room, s, AR.red.stun);
    const ko = arenaDamage(room, s, AR.red.dmg);
    botKnock(A, s, Q.x, Q.z, 0.9);
    io.to(room.id).emit('ba:parry', { s: d, by: s, dmg: AR.red.dmg, stun: AR.red.stun, hp: A.hp, fx: Q.x, fz: Q.z });
    if (ko) arenaEnd(room, d, 'KO');
    return;
  }
  const dmg = Math.round(M.dmgLo + (M.dmgHi - M.dmgLo) * power);
  arenaStun(room, d, M.stun);
  const ko = arenaDamage(room, d, dmg);
  botKnock(A, d, P.x, P.z, M.kb * (0.8 + 0.4 * power));
  io.to(room.id).emit('ba:hit', { s: d, by: s, k: 'blue', kind: 'normal', dmg, stun: M.stun, hp: A.hp, kb: M.kb * (0.8 + 0.4 * power), fx: P.x, fz: P.z });
  if (ko) arenaEnd(room, s, 'KO');
}
// nhả đòn gồng (chủ động nhả hoặc tự nhả ở 1.5s)
function arenaRelease(room, s, auto) {
  const A = room.arena, t0 = A.charge[s]; if (!t0) return;
  clearTimeout(A.ctimer[s]); A.ctimer[s] = null; A.charge[s] = 0;
  if (A.phase !== 'fight' || A.stun[s] > Date.now()) return io.to(room.id).emit('ba:anim', { s, k: 'cancel' });
  const held = Math.min(AR.blue.max, Date.now() - t0);
  if (held < AR.blue.min) {                                          // nhả sớm → thành đòn trắng
    io.to(room.id).emit('ba:anim', { s, k: 'white', rel: true });
    setTimeout(() => arenaWhite(room, s), AR.white.wind);
    return;
  }
  const power = (held - AR.blue.min) / (AR.blue.max - AR.blue.min);
  io.to(room.id).emit('ba:anim', { s, k: 'blue', auto: !!auto });
  if (A.bot && A.bot.side === s) { const P = A.pos[s], Q = A.pos[other(s)], l = Math.hypot(Q.x - P.x, Q.z - P.z) || 1; A.bot.dash = { x: (Q.x - P.x) / l * 9, z: (Q.z - P.z) / l * 9, until: Date.now() + 250 }; }
  setTimeout(() => arenaBlue(room, s, power), AR.blue.wind);
}

// ---------- Bàn DJ ----------// ---------- Bàn DJ ----------// ---------- Bot boxing (bật trong trang quản trị): thách đấu 5s chưa ai nhận → đánh với bot ----------
// Bot chạy trên server, phản xạ có độ trễ như người (~0.2s) và đánh theo tam khắc:
//  thấy đối thủ thủ thế đỏ → đánh trắng · thấy gồng xanh → canh lúc nhả để phản đỏ (hoặc né) · đối thủ choáng → gồng xanh trừng phạt
//  đang gồng mà đối thủ bật đỏ → nhả sớm thành trắng · bình thường: giữ khoảng cách, đi vòng, đấm thăm dò.
const BOT_BOX_NAMES = ['Bot Tyson', 'Bot Pacquiao', 'Bot Ali', 'Bot Rocky', 'Bot Mike', 'Bot Lý Tiểu Long', 'Bot Diệp Vấn'];
function startBotFight(room, humanId) {
  const A = room.arena, u = room.users.get(humanId); if (!u || !(A.phase === 'wait' && !A.slots.a && !A.slots.b)) return false;
  const name = BOT_BOX_NAMES[Math.floor(Math.random() * BOT_BOX_NAMES.length)];
  A.slots = { a: { id: humanId, name: u.name }, b: { id: 'bot:box', name, bot: true, look: auth.randomLook() } };
  A.bot = { side: 'b', kx: 0, kz: 0, dash: null, strafe: Math.random() < 0.5 ? 1 : -1, strafeT: 0, think: 0, react: 200, prefer: 2.0 };
  if (room.boxAll) { clearTimeout(room.boxAll.timer); room.boxAll = null; }
  for (const [tid, inv] of room.boxInv) { clearTimeout(inv.timer); io.to(tid).emit('box:inviteGone'); }
  room.boxInv.clear(); io.to(room.id).emit('box:inviteGone');
  io.to(humanId).emit('toast', `Chưa ai nhận lời — ${name} vào đấu với bạn!`);
  arenaEmit(room); arenaTryStart(room); return true;
}
function botAct(room, k) {
  const A = room.arena, B = A.bot, s = B.side, now = Date.now();
  if (A.stun[s] > now) return false;
  if (k === 'white') { if (now < A.cd[s] || A.charge[s]) return false; A.cd[s] = now + AR.white.cd; A.lastAtk[s] = now; io.to(room.id).emit('ba:anim', { s, k: 'white' }); setTimeout(() => arenaWhite(room, s), AR.white.wind); return true; }
  if (k === 'charge') { if (now < A.cd[s] || A.charge[s]) return false; A.charge[s] = now; A.cd[s] = now + AR.blue.max + AR.blue.cd; io.to(room.id).emit('ba:anim', { s, k: 'charge' }); A.ctimer[s] = setTimeout(() => arenaRelease(room, s, true), AR.blue.max); return true; }
  if (k === 'release') { if (!A.charge[s]) return false; A.cd[s] = now + AR.white.cd; arenaRelease(room, s, false); return true; }
  if (k === 'red') { if (now < A.rcd[s] || A.charge[s]) return false; A.rcd[s] = now + AR.red.cd; A.red[s] = now + AR.red.win; io.to(room.id).emit('ba:anim', { s, k: 'red' }); return true; }
  if (k === 'dodge') {
    const st = stamNow(A, s, now); if (st < AR.DODGE_COST) return false;
    A.stam[s] = st - AR.DODGE_COST; A.stamT[s] = now; A.dodge[s] = now + AR.DODGE_MS;
    if (A.charge[s]) { clearTimeout(A.ctimer[s]); A.ctimer[s] = null; A.charge[s] = 0; }
    const P = A.pos[s], Q = A.pos[other(s)], l = Math.hypot(P.x - Q.x, P.z - Q.z) || 1, side = Math.random() < 0.5 ? 1 : -1;
    const bx = (P.x - Q.x) / l, bz = (P.z - Q.z) / l, sx = -bz * side, sz = bx * side;   // lùi chéo sang bên
    B.dash = { x: (bx * 0.6 + sx * 0.8) * 10, z: (bz * 0.6 + sz * 0.8) * 10, until: now + 220 };
    io.to(room.id).emit('ba:anim', { s, k: 'dodge' }); return true;
  }
  return false;
}
function botTick(room) {
  const A = room.arena, B = A.bot; if (!B || A.phase !== 'fight') return;
  const s = B.side, d = other(s), now = Date.now(), dt = 0.05, P = A.pos[s], Q = A.pos[d];
  const dx = Q.x - P.x, dz = Q.z - P.z, dist = Math.hypot(dx, dz) || 0.001, ux = dx / dist, uz = dz / dist;
  const stunned = A.stun[s] > now, R = B.react + (Math.random() * 60 - 30), chance = (p) => Math.random() < p * dt * 20 / 20;
  let mx = 0, mz = 0;
  if (!stunned && now >= B.think) {
    B.think = now + 90 + Math.random() * 60;                           // "suy nghĩ" ~10 lần / giây
    const redStart = A.red[d] - AR.red.win, oppCharge = A.charge[d], oppStun = A.stun[d] - now, held = A.charge[s] ? now - A.charge[s] : 0;
    if (A.charge[s]) {                                                 // bot đang gồng
      if (A.red[d] > now && now - redStart > R && held < AR.blue.min) botAct(room, 'release');   // đối thủ bật đỏ → nhả sớm thành trắng (trắng thắng đỏ)
      else if (held >= AR.blue.min + 40 && (dist < AR.blue.range - 0.8 || oppStun > 150) && A.red[d] <= now) botAct(room, 'release');
    } else if (A.red[d] > now && now - redStart > R) {                   // đối thủ thủ thế đỏ → đánh trắng phá thế
      if (dist < AR.white.range + 0.2) botAct(room, 'white'); else { mx += ux; mz += uz; }
    } else if (oppCharge) {                                            // đối thủ gồng xanh → đoán lúc nhả để phản đỏ
      if (B.chargeSeen !== oppCharge) { B.chargeSeen = oppCharge; B.plan = Math.random() < 0.72 ? 'red' : Math.random() < 0.5 ? 'dodge' : 'away'; B.redAt = 1000 + Math.random() * 120; }
      const age = now - oppCharge;
      if (A.red[s] > now || A.dodge[s] > now) { /* đang phản / đang né: đứng yên chờ */ }
      else if (B.plan === 'red' && age >= B.redAt && dist < AR.blue.range + 0.8) botAct(room, 'red');   // đỏ 0.6s phủ cú nhả từ 1s đến 1.5s (+ lúc vung)
      else if (B.plan === 'dodge' && age >= 1150 && dist < AR.blue.range + 0.5) botAct(room, 'dodge');
      else if (B.plan === 'away') { mx -= ux; mz -= uz; }                // lùi ra khỏi tầm
    } else if (oppStun > 1080 && dist < AR.blue.range) {               // đối thủ bị choáng lâu → gồng xanh trừng phạt
      botAct(room, 'charge');
    } else if (oppStun > 120 && dist < AR.white.range) {
      botAct(room, 'white');
    } else if (now - A.lastAtk[d] < 120 && dist < AR.white.range + 0.3 && Math.random() < 0.22) {   // thỉnh thoảng né kịp cú đấm
      botAct(room, 'dodge');
    } else {                                                           // bình thường: thăm dò
      if (dist < AR.white.range - 0.1 && Math.random() < 0.38) botAct(room, 'white');
      else if (dist > 2.4 && dist < 3.6 && Math.random() < 0.07) botAct(room, 'charge');
    }
  }
  // di chuyển: giữ khoảng cách ưa thích, đi vòng sang bên, lùi khi bị choáng
  if (now > B.strafeT) { B.strafeT = now + 900 + Math.random() * 1400; if (Math.random() < 0.5) B.strafe *= -1; B.prefer = 1.6 + Math.random() * 0.9; }
  const want = A.charge[s] ? 2.6 : A.charge[d] ? (B.plan === 'red' ? 2.4 : 4.4) : B.prefer;   // đối thủ gồng: định phản thì đứng trong tầm, không thì lùi xa
  const gap = dist - want;
  mx += ux * Math.max(-1, Math.min(1, gap * 1.4)); mz += uz * Math.max(-1, Math.min(1, gap * 1.4));
  mx += -uz * B.strafe * 0.55; mz += ux * B.strafe * 0.55;
  if (Math.abs(P.x) > AR.R - 1.2 || Math.abs(P.z) > AR.R - 1.2) { mx -= P.x * 0.25; mz -= P.z * 0.25; }   // tránh dồn vào góc
  const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
  const sp = stunned ? 1.2 : A.charge[s] ? 2.0 : A.red[s] > now ? 1.5 : 4.3;
  let vx = mx * sp, vz = mz * sp;
  if (B.dash && now < B.dash.until) { vx += B.dash.x; vz += B.dash.z; }
  vx += B.kx; vz += B.kz; const dec = Math.pow(0.015, dt); B.kx *= dec; B.kz *= dec;
  P.x = Math.max(-AR.R + 0.35, Math.min(AR.R - 0.35, P.x + vx * dt)); P.z = Math.max(-AR.R + 0.35, Math.min(AR.R - 0.35, P.z + vz * dt));
  const ex = P.x - Q.x, ez = P.z - Q.z, el = Math.hypot(ex, ez); if (el < 0.9 && el > 0.001) { P.x = Q.x + ex / el * 0.9; P.z = Q.z + ez / el * 0.9; }
  const H = A.hist[s]; H.push({ x: P.x, z: P.z, t: now }); while (H.length && now - H[0].t > 400) H.shift();
  io.to(room.id).volatile.emit('ba:st', { s, x: +P.x.toFixed(3), z: +P.z.toFixed(3), m: Math.hypot(vx, vz) > 0.4 ? 1 : 0 });
}

// ---------- Bàn DJ ----------
// Người có vai trò DJ (hoặc quản trị) lên bàn DJ trên sân khấu; điều khiển tốc độ / tua / phanh video chung + hiệu ứng âm thanh, ánh sáng cho cả rạp.
const canDJ = (name) => auth.hasRole(name, 'dj') || auth.isAdmin(name);
function endDJ(room, moveBack = true) {
  const dj = room.dj; if (!dj) return;
  room.dj = null; room.djAuto = false; room.djBeat = null;
  clearTimeout(room.brakeT); clearTimeout(room.brakeT2);
  if (room.paused && room.brakePause) { room.paused = false; setPos(room, room.pausedAt); }   // đang phanh dở → chạy tiếp
  room.brakePause = false;
  if (room.rate !== 1) setRate(room, 1);
  if (room.partyForced) { room.partyForced = false; clearTimeout(room.partyTimer); room.partyTimer = null; room.partyEnd = 0; checkParty(room); }
  const me = room.users.get(dj.id);
  if (me && me.seat === room.djIdx) {
    room.seats[room.djIdx] = null;
    if (moveBack) {                                            // về lại ghế cũ (nếu còn trống) hoặc ghế trống bất kỳ
      const back = dj.prev != null && room.seats[dj.prev] == null ? dj.prev : randomFreeSeat(room);
      me.seat = back; if (back != null) room.seats[back] = dj.id;
    } else me.seat = null;
  }
  sysMsg(room, `🎧 DJ ${dj.name} đã rời bàn DJ`);
  broadcast(room);
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
    makeSeatForReal(room);
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
    balanceBots(room);
    scheduleBroadcast(room);
  });

  socket.on('seat:take', (idx) => {
    const room = rooms.get(socket.data.room);
    const me = room && room.users.get(socket.id);
    if (!me || !Number.isInteger(idx) || idx < 0 || idx >= room.nSeats + room.nDance) return;
    const now = Date.now();
    if (now - socket.data.lastSeat < 800) return;
    socket.data.lastSeat = now;
    const occ = room.seats[idx] != null && room.users.get(room.seats[idx]);
    if (occ && occ.bot) {                                          // ghế của bot: bot đứng dậy đổi sang ghế cũ của mình (hoặc ra về)
      const bid = room.seats[idx], back = me.seat != null && me.seat < room.nSeats ? me.seat : null;
      room.seats[idx] = null;
      if (back != null) { if (room.seats[back] === socket.id) room.seats[back] = null; occ.seat = back; room.seats[back] = bid; me.seat = null; }
      else removeBot(room, bid);
    }
    if (room.seats[idx] != null) return socket.emit('toast', 'Ghế này có người ngồi rồi');
    if (room.dj && room.dj.id === socket.id) endDJ(room, false);   // DJ đi chỗ khác → đóng bàn DJ
    if (me.seat != null && room.seats[me.seat] === socket.id) room.seats[me.seat] = null;
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
    if (room.dj && room.dj.id === socket.id) return endDJ(room, false);
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
      room.startedAt = Date.now() - (t * 1000) / (room.rate || 1);
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
  // ----- Sân boxing -----
  socket.on('ba:leave', () => { const room = rooms.get(socket.data.room); if (room) arenaLeave(room, socket.id, 'rời sàn'); });
  socket.on('ba:st', (d) => {                                         // vị trí võ sĩ (máy võ sĩ tự tính) → chuyển cho cả phòng
    const room = rooms.get(socket.data.room); if (!room || !d) return;
    const A = room.arena, s = sideOf(A, socket.id); if (!s || (A.phase !== 'fight' && A.phase !== 'count')) return;
    const x = Math.max(-AR.R, Math.min(AR.R, Number(d.x) || 0)), z = Math.max(-AR.R, Math.min(AR.R, Number(d.z) || 0));
    A.pos[s] = { x, z };
    const H = A.hist[s], tn = Date.now(); H.push({ x, z, t: tn }); while (H.length && tn - H[0].t > 400) H.shift();
    socket.volatile.to(room.id).emit('ba:st', { s, x, z, m: d.m ? 1 : 0 });
  });
  socket.on('ba:atk', (d) => {                                         // đòn trắng (air = đang nhảy: đấm từ trên xuống)
    const room = rooms.get(socket.data.room); if (!room) return;
    const A = room.arena, s = sideOf(A, socket.id), now = Date.now(), air = !!(d && d.air);
    if (!s || A.phase !== 'fight' || now < A.cd[s] || A.stun[s] > now || A.charge[s]) return;
    A.cd[s] = now + AR.white.cd; A.lastAtk[s] = now;
    socket.to(room.id).emit('ba:anim', { s, k: air ? 'slam' : 'white' });   // người khác thấy vung tay ngay (máy mình đã tự diễn)
    setTimeout(() => arenaWhite(room, s, air), air ? AR.air.wind : AR.white.wind);
  });
  socket.on('ba:jump', () => {                                         // nhảy: huỷ gồng (không thể vừa nhảy vừa gồng)
    const room = rooms.get(socket.data.room); if (!room) return;
    const A = room.arena, s = sideOf(A, socket.id); if (!s || A.phase !== 'fight') return;
    if (A.charge[s]) { clearTimeout(A.ctimer[s]); A.ctimer[s] = null; A.charge[s] = 0; }
    socket.to(room.id).emit('ba:anim', { s, k: 'jump' });
  });
  socket.on('ba:charge', () => {                                       // bắt đầu gồng đòn xanh
    const room = rooms.get(socket.data.room); if (!room) return;
    const A = room.arena, s = sideOf(A, socket.id), now = Date.now();
    if (!s || A.phase !== 'fight' || now < A.cd[s] || A.stun[s] > now || A.charge[s]) return;
    A.charge[s] = now; A.cd[s] = now + AR.blue.max + AR.blue.cd; A.lastAtk[s] = now;
    socket.to(room.id).emit('ba:anim', { s, k: 'charge' });
    A.ctimer[s] = setTimeout(() => arenaRelease(room, s, true), AR.blue.max);   // gồng đủ 1.5s → tự nhả
  });
  socket.on('ba:release', () => {
    const room = rooms.get(socket.data.room); if (!room) return;
    const A = room.arena, s = sideOf(A, socket.id); if (!s || !A.charge[s]) return;
    A.cd[s] = Date.now() + AR.white.cd;
    arenaRelease(room, s, false);
  });
  socket.on('ba:red', () => {                                          // thế phản đòn (đỏ)
    const room = rooms.get(socket.data.room); if (!room) return;
    const A = room.arena, s = sideOf(A, socket.id), now = Date.now();
    if (!s || A.phase !== 'fight' || now < A.rcd[s] || A.stun[s] > now || A.charge[s]) return;
    A.rcd[s] = now + AR.red.cd; A.red[s] = now + AR.red.win;
    socket.to(room.id).emit('ba:anim', { s, k: 'red' });
  });
  socket.on('ba:dodge', () => {                                        // né: tốn thể lực
    const room = rooms.get(socket.data.room); if (!room) return;
    const A = room.arena, s = sideOf(A, socket.id), now = Date.now();
    if (!s || A.phase !== 'fight' || A.stun[s] > now) return;
    const st = stamNow(A, s, now);
    if (st < AR.DODGE_COST) return socket.emit('ba:stam', { s, v: Math.floor(st), fail: true });
    A.stam[s] = st - AR.DODGE_COST; A.stamT[s] = now; A.dodge[s] = now + AR.DODGE_MS;
    if (A.charge[s]) { clearTimeout(A.ctimer[s]); A.ctimer[s] = null; A.charge[s] = 0; }   // né thì huỷ gồng
    socket.to(room.id).emit('ba:anim', { s, k: 'dodge' });
    socket.emit('ba:stam', { s, v: Math.floor(A.stam[s]) });
  });
  // thách đấu 1 người hoặc cả phòng (ai nhận trước được đấu). Chỉ 1 sân: đấu xong mới thách đấu tiếp được.
  const arenaFree = (A) => A.phase === 'wait' && !A.slots.a && !A.slots.b;
  function boxStart(room, aId, bId) {
    const A = room.arena, ua = room.users.get(aId), ub = room.users.get(bId); if (!ua || !ub || !arenaFree(A)) return false;
    A.slots = { a: { id: aId, name: ua.name }, b: { id: bId, name: ub.name } };
    if (room.boxAll) { clearTimeout(room.boxAll.timer); room.boxAll = null; }
    for (const [tid, inv] of room.boxInv) { clearTimeout(inv.timer); io.to(tid).emit('box:inviteGone'); }
    room.boxInv.clear(); io.to(room.id).emit('box:inviteGone');
    arenaEmit(room); arenaTryStart(room); return true;
  }
  socket.on('box:challenge', (targetId, cb) => {
    cb = typeof cb === 'function' ? cb : () => {};
    const room = rooms.get(socket.data.room), me = room && room.users.get(socket.id); if (!me) return cb({ error: 'Chưa vào phòng' });
    if (!arenaFree(room.arena) || room.boxAll) return cb({ error: 'Sân boxing đang có trận / lời thách đấu khác, đợi xong đã' });
    const now = Date.now();
    if (now - (socket.data.boxT || 0) < 6000) return cb({ error: 'Đợi vài giây rồi thách đấu tiếp' });
    socket.data.boxT = now;
    if (targetId === '*') {                                              // thách đấu cả phòng
      const real = [...room.users.entries()].filter(([id, u]) => id !== socket.id && !u.bot);
      if (!real.length) { if (auth.settings().boxBot) { startBotFight(room, socket.id); return cb({ ok: true, n: 0, bot: true }); } return cb({ error: 'Phòng chưa có ai khác để thách đấu' }); }
      const botOn = !!auth.settings().boxBot;
      room.boxAll = { from: socket.id, name: me.name, timer: setTimeout(() => {
        if (!room.boxAll || room.boxAll.from !== socket.id) return;
        room.boxAll = null; io.to(room.id).emit('box:inviteGone');
        if (!(botOn && startBotFight(room, socket.id))) socket.emit('toast', 'Chưa ai nhận lời thách đấu');
      }, botOn ? 5000 : 20000) };
      for (const [id] of real) io.to(id).emit('box:invite', { from: socket.id, name: me.name, ms: botOn ? 5000 : 20000, all: true });
      sysMsg(room, `🥊 ${me.name} thách đấu cả phòng! Ai nhận trước sẽ lên sàn.`);
      return cb({ ok: true, n: real.length });
    }
    const tg = room.users.get(targetId);
    if (!tg || targetId === socket.id) return cb({ error: 'Không tìm thấy người này' });
    if (tg.bot) { setTimeout(() => { socket.emit('toast', `${tg.name} đã từ chối lời thách đấu`); if (auth.settings().boxBot) startBotFight(room, socket.id); }, 2500 + Math.random() * 2000); return cb({ ok: true }); }
    const old = room.boxInv.get(targetId); if (old) clearTimeout(old.timer);
    const inv = { from: socket.id, name: me.name, at: now };
    const botOn = !!auth.settings().boxBot;
    inv.timer = setTimeout(() => {
      if (room.boxInv.get(targetId) !== inv) return;
      room.boxInv.delete(targetId); io.to(targetId).emit('box:inviteGone');
      if (!(botOn && startBotFight(room, socket.id))) socket.emit('toast', `${tg.name} không trả lời lời thách đấu`);
    }, botOn ? 5000 : 15000);
    room.boxInv.set(targetId, inv);
    io.to(targetId).emit('box:invite', { from: socket.id, name: me.name, ms: botOn ? 5000 : 15000 });
    cb({ ok: true });
  });
  socket.on('box:answer', (d) => {
    const room = rooms.get(socket.data.room); if (!room || !d) return;
    const me = room.users.get(socket.id); if (!me) return;
    if (room.boxAll && room.boxAll.from === d.from && d.from !== socket.id) {            // trả lời lời thách đấu cả phòng
      if (!d.accept) return;
      if (!room.users.get(d.from)) { room.boxAll = null; return socket.emit('toast', 'Người thách đấu đã rời phòng'); }
      if (!boxStart(room, d.from, socket.id)) socket.emit('toast', 'Đã có người nhận trước rồi');
      return;
    }
    const inv = room.boxInv.get(socket.id);
    if (!inv || inv.from !== d.from) return socket.emit('toast', 'Lời thách đấu đã hết hạn hoặc có người nhận trước');
    clearTimeout(inv.timer); room.boxInv.delete(socket.id);
    if (!room.users.get(inv.from)) return socket.emit('toast', 'Người thách đấu đã rời phòng');
    if (!d.accept) return io.to(inv.from).emit('toast', `${me.name} đã từ chối lời thách đấu`);
    if (!boxStart(room, inv.from, socket.id)) { socket.emit('toast', 'Sân boxing đang có trận khác'); io.to(inv.from).emit('toast', 'Sân boxing đang có trận khác'); }
  });

  // ----- Bàn DJ -----
  socket.on('dj:open', (cb) => {
    cb = typeof cb === 'function' ? cb : () => {};
    const room = rooms.get(socket.data.room), me = room && room.users.get(socket.id);
    if (!me) return cb({ error: 'Chưa vào phòng' });
    if (!canDJ(me.name)) return cb({ error: 'Bạn chưa có vai trò DJ' });
    if (room.djIdx < 0) return cb({ error: 'Phòng này không có sân khấu để đặt bàn DJ' });
    if (room.dj && room.dj.id === socket.id) return cb({ ok: true });
    if (room.dj) return cb({ error: `DJ ${room.dj.name} đang chơi` });
    const occ = room.seats[room.djIdx]; if (occ && occ !== socket.id) return cb({ error: 'Bàn DJ đang bận' });
    const prev = me.seat;
    if (prev != null && room.seats[prev] === socket.id) room.seats[prev] = null;
    me.seat = room.djIdx; me.food = []; room.seats[room.djIdx] = socket.id;
    room.dj = { id: socket.id, name: me.name, prev };
    sysMsg(room, `🎧 DJ ${me.name} đã lên bàn DJ!`);
    broadcast(room);
    cb({ ok: true });
  });
  socket.on('dj:close', () => {
    const room = rooms.get(socket.data.room);
    if (room && room.dj && room.dj.id === socket.id) endDJ(room, true);
  });
  const DJ_PADS = new Set(['airhorn', 'siren', 'drop', 'clap', 'kick', 'zap', 'yeah', 'snare', 'boom', 'riser', 'roll']);
  const DJ_LIGHTS = new Set(['strobe', 'laser', 'blackout', 'color']);
  const DJ_RATES = [0.5, 0.75, 1, 1.25, 1.5];
  socket.on('dj:fx', (d) => {
    const room = rooms.get(socket.data.room);
    if (!room || !room.dj || room.dj.id !== socket.id || !d || typeof d.k !== 'string') return;
    const now = Date.now();
    if (d.k === 'scratch') {                                      // chà đĩa: gửi liên tục khi kéo đĩa → tối đa 30 lần/giây
      if (now - (socket.data.djS || 0) < 33) return; socket.data.djS = now;
      const v = Math.max(-1, Math.min(1, Number(d.v) || 0)), deck = d.deck === 1 ? 1 : 0;
      return socket.volatile.to(room.id).emit('dj:fx', { k: 'scratch', v, deck });
    }
    if (d.k !== 'cut') {                                          // tối đa ~8 hiệu ứng / giây, cho phép dồn 6 cái cùng lúc
      const tk = socket.data.djTok ?? 6, last = socket.data.djT || now;
      const tok = Math.min(6, tk + (now - last) / 125); socket.data.djT = now;
      if (tok < 1) { socket.data.djTok = tok; return; }
      socket.data.djTok = tok - 1;
    }
    const live = !room.current || room.current.live;
    switch (d.k) {
      case 'pad': if (DJ_PADS.has(d.v)) io.to(room.id).emit('dj:fx', { k: 'pad', v: d.v, bpm: room.djBeat ? room.djBeat.bpm : 124 }); return;
      case 'beat': {                                               // nhịp bài (tự nhận diện theo tên bài hoặc DJ bấm theo nhịp)
        const bpm = Math.round(Number(d.bpm) * 10) / 10, at = Number(d.at);
        if (!(bpm >= 60 && bpm <= 200) || !(at >= 0 && at < 86400)) return;
        room.djBeat = { bpm, at: Math.round(at * 1000) / 1000 }; broadcast(room); return;
      }
      case 'auto': room.djAuto = !!d.v; broadcast(room); return;
      case 'combo':                                                // combo tắt tiếng + tắt đèn + nháy liền mạch theo nhịp
        if (['drop', 'chop', 'flash', 'blackdrop'].includes(d.v)) io.to(room.id).emit('dj:fx', { k: 'combo', v: d.v, bpm: (room.djBeat ? room.djBeat.bpm : 124) * (room.rate || 1) });
        return;
      case 'light': if (DJ_LIGHTS.has(d.v)) io.to(room.id).emit('dj:fx', { k: 'light', v: d.v }); return;
      case 'cut': io.to(room.id).emit('dj:fx', { k: 'cut', v: !!d.v }); return;   // tắt tiếng video trong lúc giữ nút
      case 'stutter': io.to(room.id).emit('dj:fx', { k: 'stutter' }); return;     // lặp nhịp ngắn (mỗi máy tự làm rồi đồng bộ lại)
      case 'party': {                                              // bật / tắt đèn bar ngay, không cần vote
        room.partyForced = !room.partyForced;
        clearTimeout(room.partyTimer); room.partyTimer = null; room.partyEnd = 0;
        if (room.partyForced) { room.partyEnd = now + 30 * 60_000; room.partyTimer = setTimeout(() => { room.partyTimer = null; room.partyForced = false; scheduleBroadcast(room); }, 30 * 60_000); }
        else checkParty(room);
        broadcast(room); return;
      }
      case 'rate': {                                               // tốc độ phát chung
        const r = DJ_RATES.includes(Number(d.v)) ? Number(d.v) : 1;
        if (live || r === room.rate) return;
        setRate(room, r); broadcast(room); io.to(room.id).emit('dj:fx', { k: 'rate', v: r }); return;
      }
      case 'rewind': {                                             // quay ngược đĩa: lùi 6 giây cho cả rạp
        if (live) return;
        io.to(room.id).emit('dj:fx', { k: 'rewind' });
        setTimeout(() => { if (room.dj && room.current && !room.current.live) { setPos(room, Math.max(0, position(room) - 6)); broadcast(room); } }, 650);
        return;
      }
      case 'brake': {                                              // phanh đĩa: chậm dần → dừng 1 giây → chạy tiếp
        if (live || room.paused) return;
        io.to(room.id).emit('dj:fx', { k: 'brake' });
        clearTimeout(room.brakeT); clearTimeout(room.brakeT2);
        room.brakeT = setTimeout(() => {
          if (!room.current || room.paused) return;
          room.pausedAt = position(room); room.paused = true; room.brakePause = true; broadcast(room);
          room.brakeT2 = setTimeout(() => { if (room.brakePause && room.paused) { room.paused = false; room.brakePause = false; setPos(room, room.pausedAt); broadcast(room); } }, 1100);
        }, 900);
        return;
      }
    }
  });

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
app.use('/api/admin', require('./admin')({ io, rooms, auth, TEMPLATES, CINEMA_THEMES, leaveRoom, startNext, sysMsg, setMainRoom, endDJ, balanceBots }));
app.use('/api', (req, res) => res.status(404).json({ error: 'Không có API này' }));

auth.ready.then(() => {                                       // áp cài đặt đã lưu cho rạp công cộng
  const st = auth.settings();
  if ((st.mainTpl && TEMPLATES[st.mainTpl] && st.mainTpl !== 'cinema') || st.mainName) setMainRoom(TEMPLATES[st.mainTpl] ? st.mainTpl : 'cinema', st.mainName);
  balanceBots(rooms.get('main'), true);                      // bot lấp rạp (nếu đang bật)
}).then(() => server.listen(PORT, () => console.log(`XEMCHUAVN chạy tại http://localhost:${PORT}`)))
  .catch((e) => { console.error('Không kết nối được nơi lưu dữ liệu:', e.message); process.exit(1); });
