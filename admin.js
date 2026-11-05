// XEMCHUAVN - API trang quản trị (/admin)
// Ai là quản trị:
//   - Chủ (owner): tên trong biến môi trường ADMIN_USERS (cách nhau dấu phẩy). Chủ thêm / bớt admin được, không ai khoá được chủ.
//   - Admin: do chủ thêm trong trang quản trị. Admin khoá được người thường, không khoá được admin khác.
// Làm được: xem tài khoản (IP, lần cuối online, acc chung IP), khoá / mở khoá (có thời hạn, chặn cả IP), đá khỏi rạp,
//           xem / đóng phòng, bỏ qua video, gửi thông báo toàn server, đổi bố cục + màu rạp công cộng.
'use strict';
const express = require('express');

module.exports = function setupAdmin(ctx) {
  const { io, rooms, auth, TEMPLATES, CINEMA_THEMES, leaveRoom, startNext, sysMsg, setMainRoom } = ctx;
  const router = express.Router();
  router.use(express.json({ limit: '20kb' }));

  // chỉ admin mới qua được
  router.use((req, res, next) => {
    const u = auth.userOf(req);
    if (!u || auth.banOf(u)) return res.status(401).json({ error: 'Chưa đăng nhập' });
    if (!auth.isAdmin(u.username)) return res.status(403).json({ error: 'Tài khoản này không có quyền quản trị' });
    req.admin = u.username; req.owner = auth.isOwner(u.username);
    next();
  });

  const K = auth.keyOf;
  const S = auth.settings;
  const socketsOf = (name) => [...io.sockets.sockets.values()].filter((s) => s.data.username && K(s.data.username) === K(name));
  const roomOf = (name) => { const s = socketsOf(name).find((x) => x.data.room); return s ? s.data.room : null; };
  const role = (name) => (auth.isOwner(name) ? 'owner' : auth.isAdmin(name) ? 'admin' : 'user');
  const clean = (v, n) => String(v || '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, n);
  const log = (who, what) => {                               // nhật ký thao tác quản trị (giữ 200 dòng gần nhất)
    const st = S(); st.log = [{ t: Date.now(), by: who, what }, ...(st.log || [])].slice(0, 200); auth.saveSettings();
  };
  // ai được xử lý ai: chủ xử lý mọi người trừ chủ khác; admin chỉ xử lý người thường
  const canTouch = (req, target) => {
    const r = role(target);
    if (K(target) === K(req.admin)) return 'Không tự xử lý chính mình được';
    if (r === 'owner') return 'Không thể xử lý tài khoản chủ';
    if (r === 'admin' && !req.owner) return 'Chỉ chủ mới xử lý được admin khác';
    return null;
  };
  const view = (u) => {
    const ban = auth.banOf(u);
    return {
      username: u.username, createdAt: u.createdAt || null, lastSeen: u.lastSeen || null, lastIp: u.lastIp || null,
      gender: u.gender || null, role: role(u.username), room: roomOf(u.username), online: socketsOf(u.username).length > 0,
      ban: ban ? { until: ban.until || 0, reason: ban.reason || '', by: ban.by || '', at: ban.at || 0 } : null,
    };
  };

  // đá mọi kết nối của 1 người (khi bị khoá / bị đá)
  function kickSockets(name, evt, payload) {
    for (const s of socketsOf(name)) { s.emit(evt, payload); leaveRoom(s); setTimeout(() => s.disconnect(true), 300); }
  }

  // ---------- Tổng quan ----------
  router.get('/me', (req, res) => res.json({ username: req.admin, owner: req.owner }));
  router.get('/overview', (req, res) => {
    const all = Object.values(auth.users()), now = Date.now();
    const online = new Set([...io.sockets.sockets.values()].map((s) => s.data.username && K(s.data.username)).filter(Boolean));
    res.json({
      users: all.length, online: online.size, banned: all.filter((u) => auth.banOf(u)).length,
      new24h: all.filter((u) => u.createdAt > now - 864e5).length, active24h: all.filter((u) => u.lastSeen > now - 864e5).length,
      rooms: rooms.size, ipBans: (S().ipBans || []).length, log: (S().log || []).slice(0, 30),
    });
  });

  // ---------- Tài khoản ----------
  router.get('/users', (req, res) => {
    const q = K(req.query.q || ''), f = String(req.query.filter || 'all');
    let list = Object.values(auth.users()).map(view);
    if (q) list = list.filter((u) => K(u.username).includes(q) || (u.lastIp || '').includes(q));
    if (f === 'online') list = list.filter((u) => u.online);
    else if (f === 'banned') list = list.filter((u) => u.ban);
    else if (f === 'admin') list = list.filter((u) => u.role !== 'user');
    else if (f === 'new') list = list.filter((u) => u.createdAt > Date.now() - 864e5);
    list.sort((a, b) => (b.online - a.online) || ((b.lastSeen || b.createdAt || 0) - (a.lastSeen || a.createdAt || 0)));
    res.json({ total: list.length, list: list.slice(0, 300) });
  });
  router.get('/user/:name', (req, res) => {
    const u = auth.users()[K(req.params.name)];
    if (!u) return res.status(404).json({ error: 'Không có tài khoản này' });
    const ips = u.ips || (u.lastIp ? [u.lastIp] : []);
    const sameIp = ips.length ? Object.values(auth.users()).filter((x) => x !== u && (x.ips || [x.lastIp]).some((ip) => ip && ips.includes(ip))).map((x) => x.username).slice(0, 50) : [];
    res.json({ ...view(u), regIp: u.regIp || null, ips, sameIp, ipBanned: ips.filter((ip) => auth.ipBanOf(ip)) });
  });
  router.post('/ban', (req, res) => {
    const u = auth.users()[K(req.body.username)];
    if (!u) return res.status(404).json({ error: 'Không có tài khoản này' });
    const why = canTouch(req, u.username); if (why) return res.status(403).json({ error: why });
    const minutes = Math.max(0, Math.min(5256000, Number(req.body.minutes) || 0));   // 0 = vĩnh viễn, tối đa 10 năm
    const reason = clean(req.body.reason, 120);
    u.ban = { until: minutes ? Date.now() + minutes * 60_000 : 0, reason, by: req.admin, at: Date.now() };
    u.pv = (u.pv || 0) + 1;                                  // huỷ mọi phiên đăng nhập đang có
    auth.saveUsers();
    if (req.body.ip && u.lastIp) {                           // chặn luôn IP gần nhất (chống tạo acc mới)
      const st = S(); st.ipBans = (st.ipBans || []).filter((b) => b.ip !== u.lastIp);
      st.ipBans.unshift({ ip: u.lastIp, user: u.username, reason, by: req.admin, at: Date.now() });
    }
    kickSockets(u.username, 'banned', { message: auth.banMsg(u.ban) });
    log(req.admin, `Khoá ${u.username} ${minutes ? minutes + ' phút' : 'vĩnh viễn'}${req.body.ip ? ' + chặn IP' : ''}${reason ? ' · ' + reason : ''}`);
    res.json({ ok: true });
  });
  router.post('/unban', (req, res) => {
    const u = auth.users()[K(req.body.username)];
    if (!u) return res.status(404).json({ error: 'Không có tài khoản này' });
    delete u.ban; auth.saveUsers();
    const st = S(); const before = (st.ipBans || []).length;
    st.ipBans = (st.ipBans || []).filter((b) => K(b.user || '') !== K(u.username));
    log(req.admin, `Mở khoá ${u.username}${before !== st.ipBans.length ? ' (gỡ chặn IP kèm theo)' : ''}`);
    res.json({ ok: true });
  });
  router.post('/kick', (req, res) => {
    const u = auth.users()[K(req.body.username)];
    if (!u) return res.status(404).json({ error: 'Không có tài khoản này' });
    const why = canTouch(req, u.username); if (why) return res.status(403).json({ error: why });
    const n = socketsOf(u.username).length;
    kickSockets(u.username, 'admin:kicked', { message: 'Bạn đã bị quản trị viên mời ra khỏi rạp' + (req.body.reason ? ' · ' + clean(req.body.reason, 120) : '') });
    log(req.admin, `Đá ${u.username} khỏi rạp`);
    res.json({ ok: true, sockets: n });
  });
  router.post('/role', (req, res) => {                       // chỉ chủ: cấp / gỡ quyền admin
    if (!req.owner) return res.status(403).json({ error: 'Chỉ chủ mới cấp quyền admin được' });
    const u = auth.users()[K(req.body.username)];
    if (!u) return res.status(404).json({ error: 'Không có tài khoản này' });
    if (auth.isOwner(u.username)) return res.status(400).json({ error: 'Tài khoản chủ đổi trong biến môi trường ADMIN_USERS' });
    const st = S(), k = K(u.username); st.admins = (st.admins || []).filter((x) => x !== k);
    if (req.body.admin) { st.admins.push(k); delete u.ban; auth.saveUsers(); }
    log(req.admin, `${req.body.admin ? 'Cấp' : 'Gỡ'} quyền admin: ${u.username}`);
    res.json({ ok: true });
  });

  // ---------- IP bị chặn ----------
  router.get('/ipbans', (req, res) => res.json(S().ipBans || []));
  router.post('/ipunban', (req, res) => {
    const st = S(); st.ipBans = (st.ipBans || []).filter((b) => b.ip !== req.body.ip);
    log(req.admin, `Gỡ chặn IP ${clean(req.body.ip, 60)}`); res.json({ ok: true });
  });

  // ---------- Phòng ----------
  router.get('/rooms', (req, res) => {
    res.json([...rooms.values()].map((r) => ({
      id: r.id, name: r.name, type: r.type, tpl: r.tpl, owner: r.owner, locked: !!r.pw, queue: r.queue.length,
      current: r.current ? { title: r.current.title || r.current.vid || '', by: r.current.by || '' } : null,
      users: [...r.users.values()].map((u) => u.name),
    })).sort((a, b) => (a.type === 'public' ? -1 : b.type === 'public' ? 1 : b.users.length - a.users.length)));
  });
  router.post('/room/skip', (req, res) => {
    const r = rooms.get(req.body.id); if (!r) return res.status(404).json({ error: 'Phòng không còn' });
    if (!r.current) return res.status(400).json({ error: 'Phòng chưa phát video nào' });
    const t = r.current.title || ''; startNext(r); sysMsg(r, 'Quản trị viên đã bỏ qua video');
    log(req.admin, `Bỏ qua video "${t.slice(0, 60)}" ở ${r.name}`); res.json({ ok: true });
  });
  router.post('/room/clear', (req, res) => {
    const r = rooms.get(req.body.id); if (!r) return res.status(404).json({ error: 'Phòng không còn' });
    r.queue = []; startNext(r); sysMsg(r, 'Quản trị viên đã xoá danh sách phát');
    log(req.admin, `Xoá danh sách phát ở ${r.name}`); res.json({ ok: true });
  });
  router.post('/room/close', (req, res) => {
    const r = rooms.get(req.body.id); if (!r) return res.status(404).json({ error: 'Phòng không còn' });
    if (r.id === 'main') return res.status(400).json({ error: 'Không đóng được rạp công cộng' });
    for (const sid of [...r.users.keys()]) { const s = io.sockets.sockets.get(sid); if (s) { s.emit('room:closed', { message: 'Phòng đã bị quản trị viên đóng' }); leaveRoom(s); } }
    clearTimeout(r.emptyTimer); clearTimeout(r.bt); rooms.delete(r.id);
    log(req.admin, `Đóng phòng ${r.name} (${r.id})`); res.json({ ok: true });
  });
  router.post('/announce', (req, res) => {
    const text = clean(req.body.text, 200); if (!text) return res.status(400).json({ error: 'Chưa nhập nội dung' });
    for (const r of rooms.values()) if (r.users.size) sysMsg(r, '📢 ' + text);
    io.emit('announce', { text });
    log(req.admin, `Thông báo: ${text}`); res.json({ ok: true });
  });

  // ---------- Giao diện rạp ----------
  router.get('/settings', (req, res) => {
    const st = S();
    res.json({
      mainTpl: rooms.get('main').tpl, cinemaTheme: st.cinemaTheme || 'demon', mainName: rooms.get('main').name,
      templates: Object.entries(TEMPLATES).map(([id, t]) => ({ id, name: t.name, seats: t.seats })),
      themes: Object.entries(CINEMA_THEMES).map(([id, name]) => ({ id, name })),
    });
  });
  router.post('/settings', (req, res) => {
    const st = S(), b = req.body || {}, changes = [];
    if (b.mainName != null) {
      const n = clean(b.mainName, 30) || 'Rạp công cộng';
      if (n !== rooms.get('main').name) { st.mainName = n; rooms.get('main').name = n; changes.push('tên rạp → ' + n); }
    }
    if (b.cinemaTheme != null && CINEMA_THEMES[b.cinemaTheme] && b.cinemaTheme !== (st.cinemaTheme || 'demon')) {
      st.cinemaTheme = b.cinemaTheme; changes.push('phong cách rạp lớn → ' + CINEMA_THEMES[b.cinemaTheme]);
      io.emit('server:reload', { what: 'theme', message: 'Quản trị viên vừa đổi giao diện rạp, đang tải lại…' });
    }
    if (b.mainTpl != null && TEMPLATES[b.mainTpl] && b.mainTpl !== rooms.get('main').tpl) {
      st.mainTpl = b.mainTpl; setMainRoom(b.mainTpl); changes.push('bố cục rạp công cộng → ' + TEMPLATES[b.mainTpl].name);
    }
    if (changes.length) log(req.admin, 'Đổi ' + changes.join(', ')); else auth.saveSettings();
    res.json({ ok: true, changes });
  });

  return router;
};
