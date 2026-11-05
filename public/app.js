// XEMCHUAVN - client
// Cảnh 3D (Three.js) + video YouTube gắn lên màn hình rạp (CSS3D) + nhân vật có tên/bong bóng chat + voice WebRTC
import * as THREE from 'three';
import { sfx, scratchSound, buildPanel, level as djLevel } from '/dj.js';   // bàn DJ: âm thanh hiệu ứng tự tổng hợp + bảng điều khiển
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const $ = (id) => document.getElementById(id);
// Danh mục thời trang dùng chung với server (public/catalog.json)
// PWA: đăng ký service worker (cài app lên màn hình chính)
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('/sw.js').catch(() => {});
const CATALOG = await fetch('/catalog.json').then((r) => r.json());
const SITE = await fetch('/api/config').then((r) => r.json()).catch(() => ({}));   // bố cục + màu rạp do trang quản trị chọn
const ITEM = new Map(CATALOG.items.map((it) => [it.id, it]));
const SLOT_NAME = Object.fromEntries(CATALOG.slots.map((s) => [s.id, s.name]));
const OPTIONAL_SLOTS = ['hat', 'glasses', 'back', 'mount', 'pet', 'avframe', 'nameplate', 'pfx', 'cardframe', 'namefont', 'nameeffect'];
// look = { gender, skin, equip: {slot: id} } → đồ đang mặc theo từng ô (thiếu thì lấy đồ khởi đầu)
// paint = { itemId: [màu chính, màu phụ] } do người dùng tự sơn; equip.dance = mảng điệu nhảy (combo)
const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
function paintItem(it, paint) {
  const pc = paint && paint[it.id];
  if (!Array.isArray(pc)) return it;
  return { ...it, color: isHex(pc[0]) ? pc[0] : it.color, accent: isHex(pc[1]) ? pc[1] : it.accent };
}
function resolveLook(look) {
  const g = look && look.gender === 'f' ? 'f' : 'm', eq = (look && look.equip) || {}, paint = look && look.paint, items = {};
  const ok = (it) => it && (it.g === 'u' || it.g === g);
  for (const id of CATALOG.starter[g]) { const it = ITEM.get(id); items[it.slot] = paintItem(it, paint); }
  for (const [slot, id] of Object.entries(eq)) { if (slot === 'dance') continue; const it = ITEM.get(id); if (ok(it) && it.slot === slot) items[slot] = paintItem(it, paint); }
  const dl = (Array.isArray(eq.dance) ? eq.dance : [eq.dance]).map((id) => ITEM.get(id)).filter((it) => ok(it) && it.slot === 'dance');
  return { g, skin: look && look.skin, items, dances: dl.length ? dl.map((d) => d.style) : ['bounce'] };
}
// ===================== Trang trí hồ sơ (kiểu khung / bảng tên / hiệu ứng): chỉ dùng CSS + vài hạt ký tự, nhẹ =====================
const PROFILE_SLOTS = ['avframe', 'nameplate', 'pfx', 'cardframe', 'namefont', 'nameeffect'];
// nền sau lưng nhân vật: { type: 'color', c1, c2, ang } hoặc { type: 'image', ver } (ảnh lưu trên server)
function bgCss(name, bg) {
  if (!bg) return '';
  if (bg.type === 'image') {                                    // độ sáng: phủ lớp đen (tối đi) hoặc trắng (sáng lên) lên ảnh
    const b = bg.bright ?? 1, ov = b < 1 ? `rgba(0,0,0,${(1 - b).toFixed(2)})` : `rgba(255,255,255,${((b - 1) * 0.55).toFixed(2)})`;
    return `linear-gradient(${ov}, ${ov}), center / cover no-repeat url("/api/profilebg/${encodeURIComponent(name)}?v=${bg.ver}"), #111`;
  }
  return `linear-gradient(${bg.ang ?? 160}deg, ${bg.c1}, ${bg.c2 || bg.c1})`;
}
function applyBg(el, name, bg) { el.style.background = bgCss(name, bg); }
function lookItem(look, slot) { const id = look && look.equip && look.equip[slot]; const it = id && ITEM.get(id); return it && it.slot === slot ? paintItem(it, look.paint) : null; }
const rnd = (a, b) => a + Math.random() * (b - a);
// hạt bay: ký tự (♥ ✦ ❄ …) chạy theo keyframes, toạ độ / thời gian ngẫu nhiên, bắt đầu giữa chừng (delay âm) để hiện ngay
const PARTS = {
  // khung ảnh đại diện
  'avf-hearts': { n: 5, ch: ['♥'], anim: 'fxRise', dur: [2, 3.2], size: [8, 13] },
  'avf-sparkle': { n: 6, ch: ['✦', '✧'], anim: 'fxTwinkle', dur: [1.3, 2.4], size: [8, 13], ring: true },
  'avf-sakura': { n: 5, ch: ['✿'], anim: 'fxFall', dur: [2.6, 4], size: [8, 12] },
  'avf-music': { n: 5, ch: ['♪', '♫', '♬'], anim: 'fxRise', dur: [2.2, 3.4], size: [10, 14] },
  'avf-snow': { n: 7, ch: ['❄', '•'], anim: 'fxFall', dur: [2.6, 4.2], size: [7, 11] },
  'avf-lightning': { n: 4, ch: ['ϟ'], anim: 'fxTwinkle', dur: [0.9, 1.6], size: [12, 16], ring: true },
  'avf-bubbles': { n: 6, ch: ['○', '◦'], anim: 'fxRise', dur: [2.2, 3.6], size: [8, 14] },
  'avf-leaves': { n: 5, ch: ['❦', '❧'], anim: 'fxFall', dur: [3, 4.5], size: [9, 13] },
  // bảng tên
  'np-stars': { n: 12, ch: ['✦', '•', '✧'], anim: 'fxTwinkle', dur: [1.4, 3], size: [6, 11], from: 35 },
  'np-hearts': { n: 7, ch: ['♥'], anim: 'fxRise', dur: [2.2, 3.6], size: [8, 13], from: 45 },
  'np-sakura': { n: 8, ch: ['✿', '❀'], anim: 'fxFall', dur: [2.6, 4.4], size: [8, 12], from: 40 },
  'np-flame': { n: 7, ch: ['▲', '•'], anim: 'fxRise', dur: [0.9, 1.6], size: [6, 10], from: 55 },
  'np-galaxy': { n: 14, ch: ['✦', '·', '✧', '•'], anim: 'fxTwinkle', dur: [1.2, 2.8], size: [5, 10], from: 30 },
  'np-music': { n: 7, ch: ['♪', '♫', '♬'], anim: 'fxRise', dur: [2, 3.4], size: [9, 14], from: 45 },
  'np-snow': { n: 12, ch: ['❄', '•', '❅'], anim: 'fxFall', dur: [2.6, 4.6], size: [6, 11], from: 35 },
  'np-bubbles': { n: 9, ch: ['○', '◦'], anim: 'fxRise', dur: [2.4, 4], size: [7, 14], from: 40 },
  'np-lightning': { n: 4, ch: ['ϟ'], anim: 'fxTwinkle', dur: [0.8, 1.4], size: [12, 18], from: 55 },
  // hiệu ứng hồ sơ
  'pfx-hearts': { n: 14, ch: ['♥', '❤'], anim: 'fxRise', dur: [3, 5.5], size: [10, 20] },
  'pfx-snow': { n: 28, ch: ['❄', '•', '❅'], anim: 'fxFall', dur: [4, 8], size: [7, 15] },
  'pfx-stars': { n: 18, ch: ['✦', '✧', '★'], anim: 'fxTwinkle', dur: [1.4, 3.2], size: [9, 18] },
  'pfx-bubbles': { n: 14, ch: ['○', '◯'], anim: 'fxRise', dur: [3.5, 6.5], size: [10, 24] },
  'pfx-petals': { n: 16, ch: ['✿', '❀'], anim: 'fxFall', dur: [4, 7], size: [10, 17] },
  'pfx-confetti': { n: 26, ch: ['▬', '●', '▲', '■'], anim: 'fxFallSpin', dur: [2.6, 5], size: [6, 11], multi: true },
  'pfx-fireflies': { n: 16, ch: ['●'], anim: 'fxFloat', dur: [3, 6], size: [4, 7] },
  'pfx-music': { n: 14, ch: ['♪', '♫', '♬', '♩'], anim: 'fxRise', dur: [3, 5.5], size: [12, 22] },
  'pfx-leaves': { n: 14, ch: ['❦', '❧', '🍃'], anim: 'fxFall', dur: [4.5, 8], size: [11, 18] },
  'pfx-rain': { n: 34, ch: ['│'], anim: 'fxRain', dur: [0.5, 0.9], size: [10, 16] },
  'pfx-butterflies': { n: 7, ch: ['🦋'], anim: 'fxFloat', dur: [4, 7], size: [14, 20] },
  'pfx-ghosts': { n: 6, ch: ['👻'], anim: 'fxFloat', dur: [4, 7], size: [16, 24] },
  'pfx-money': { n: 12, ch: ['💸', '💵', '🪙'], anim: 'fxFall', dur: [3.5, 6], size: [14, 20] },
  'pfx-sparkrise': { n: 18, ch: ['✦', '✧', '⋆'], anim: 'fxRise', dur: [2.5, 4.5], size: [8, 15] },
  'pfx-paws': { n: 10, ch: ['🐾'], anim: 'fxTwinkle', dur: [2, 3.5], size: [12, 18] },
  'pfx-love': { n: 9, ch: ['😍', '🥰', '💖'], anim: 'fxRise', dur: [3.5, 6], size: [14, 20] },
  'pfx-galaxy': { n: 22, ch: ['✦', '·', '✧', '★'], anim: 'fxTwinkle', dur: [1.2, 3], size: [6, 14] },
};
const CONFETTI = ['#ff6a2a', '#3fd6ff', '#ffd23a', '#ff6fa8', '#9be37a', '#a77bff'];
function particles(layer, key) {
  const P = PARTS[key]; if (!P) return;
  for (let k = 0; k < P.n; k++) {
    const sp = document.createElement('i'); sp.className = 'p'; sp.textContent = P.ch[k % P.ch.length];
    const d = rnd(P.dur[0], P.dur[1]), still = P.anim === 'fxTwinkle' || P.anim === 'fxFloat';
    let x = rnd(P.from || 0, 96), y = still ? rnd(4, 90) : 0;
    if (P.ring) { const an = k / P.n * Math.PI * 2; x = 50 + Math.cos(an) * 52 - 6; y = 50 + Math.sin(an) * 52 - 8; }
    sp.style.cssText = `left:${x}%;${still ? `top:${y}%;` : ''}font-size:${rnd(P.size[0], P.size[1]).toFixed(1)}px;animation-name:${P.anim};animation-duration:${d.toFixed(2)}s;animation-delay:${(-Math.random() * d).toFixed(2)}s;color:${P.multi ? CONFETTI[k % CONFETTI.length] : k % 2 ? 'var(--c2)' : 'var(--c1)'}`;
    layer.appendChild(sp);
  }
}
const setC = (el, it) => { el.style.setProperty('--c1', it.color || '#ffffff'); el.style.setProperty('--c2', it.accent || it.color || '#ffffff'); };
// phần gắn thêm của khung ảnh đại diện (tai, sừng, nơ, vương miện…)
const AVF_EXTRA = {
  cat: '<span class="ear l" style="--er:-22deg"></span><span class="ear r" style="--er:22deg"></span>',
  crown: '<span class="crown">♛<i></i></span>',
  halo: '<span class="halo"></span>',
  bunny: '<span class="bear l"></span><span class="bear r"></span>',
  devil: '<span class="horn l"></span><span class="horn r"></span>',
  bow: '<span class="bow"><b></b><b></b><i></i></span>',
  flowercrown: '<span class="fcrown"><i>✿</i><i>❀</i><i>✿</i><i>❀</i><i>✿</i></span>',
  stars: '<span class="orbit"><i>✦</i><i>✧</i><i>✦</i></span>',
  butterfly: '<span class="orbit slow"><i>🦋</i><i>🦋</i></span>',
  galaxy: '<span class="orbit"><i>•</i><i>✦</i><i>•</i><i>✧</i></span>',
};
function applyAvFrame(el, it) {
  el.querySelectorAll(':scope > .avf').forEach((n) => n.remove()); el.classList.toggle('has-avf', !!it);
  if (!it) return;
  const d = document.createElement('div'); d.className = 'avf avf-' + it.style; setC(d, it);
  if (AVF_EXTRA[it.style]) d.innerHTML = AVF_EXTRA[it.style];
  particles(d, 'avf-' + it.style); el.appendChild(d);
}
function applyNameplate(el, it) {
  el.querySelectorAll(':scope > .np-deco').forEach((n) => n.remove()); el.classList.toggle('np-host', !!it);
  if (!it) return;
  const d = document.createElement('div'); d.className = 'np-deco np-' + it.style + (NP_ART[it.style] ? ' np-artbg' : ''); setC(d, it); particles(d, 'np-' + it.style);
  if (NP_ART[it.style]) { const a = document.createElement('div'); a.className = 'np-art'; a.innerHTML = NP_ART[it.style]; d.appendChild(a); }   // hình minh hoạ bên phải
  el.prepend(d);
}
const CARD_ORN = { gold: '◆', hearts: '♥', ice: '❄', flame: '✹', vine: '❦', galaxy: '✦', lightning: 'ϟ', candy: '●', rainbow: '★' };
function applyCard(el, frame, fx) {
  el.querySelectorAll(':scope > .cardf, :scope > .pfx-layer, :scope > .cf-orn, :scope > .cf-eyebar, :scope > .cf-top, :scope > .cf-art').forEach((n) => n.remove());
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  if (fx) { const l = document.createElement('div'); l.className = 'pfx-layer pfx-' + fx.style; setC(l, fx); particles(l, 'pfx-' + fx.style); if (PFX_SCENE[fx.style]) l.innerHTML = PFX_SCENE[fx.style]; el.appendChild(l); }
  if (frame) {
    const f = document.createElement('div'); f.className = 'cardf cf-' + frame.style; setC(f, frame); el.appendChild(f);
    const orn = CARD_ORN[frame.style];
    if (orn) for (const c of ['tl', 'tr', 'bl', 'br']) { const o = document.createElement('span'); o.className = 'cf-orn ' + c; o.textContent = orn; setC(o, frame); el.appendChild(o); }
    const top = { eyes: ['cf-eyebar', '<i></i><i></i>'], cat: ['cf-top cf-catears', '<b></b><b></b>'], ribbon: ['cf-top cf-ribbon', '<span class="bow"><b></b><b></b><i></i></span>'] }[frame.style];
    if (top) { const b = document.createElement('div'); b.className = top[0]; setC(b, frame); b.innerHTML = top[1]; el.appendChild(b); }
    const art = CF_ART[frame.style];                          // trang trí tràn lên trên + xuống dưới khung
    if (art) for (const [k, cls] of [['top', 'top'], ['bottom', 'bot']]) { const d = document.createElement('div'); d.className = 'cf-art ' + cls + ' cfa-' + frame.style; setC(d, frame); d.innerHTML = art[k]; el.appendChild(d); }
  }
}
// ===================== Hình minh hoạ vector tự vẽ cho bảng tên / khung hồ sơ / cảnh hiệu ứng (dùng màu sơn --c1 / --c2) =====================
const SVG = (vb, body, cls = '') => `<svg class="${cls}" viewBox="${vb}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${body}</svg>`;
const CROW = (x, y, s = 1, flip = false, cls = '') => `<g class="crow ${cls}" transform="translate(${x} ${y}) scale(${flip ? -s : s} ${s})"><path d="M-14 6C-12-2-6-6 0-7 2-12 6-14 10-13l6-3-4 5c2 2 2 6 0 9 3 4 3 9 0 12l-5-1-2 6-2-5c-6 1-11 0-17-3Z" class="ink"/><path d="M10-13l7 1-6 2Z" class="ink"/><circle cx="8" cy="-10" r="1.6" class="eye"/></g>`;
const BIRD = (x, y, s = 1, d = 0) => `<g transform="translate(${x} ${y}) scale(${s})"><path class="flap ink" style="animation-delay:${d}s" d="M-16 0Q-8-9 0-1 8-9 16 0 8-4 0 3-8-4-16 0Z"/></g>`;
const BAT = (x, y, s = 1, d = 0) => `<g transform="translate(${x} ${y}) scale(${s})"><path class="flap ink" style="animation-delay:${d}s" d="M-14 0l5-4 2 3 2-5 2 4h2l2-4 2 5 2-3 5 4-6 1-4 4-3-2-3 2-4-4Z"/></g>`;
const BLOSSOM = (x, y, r = 5, cls = 'a2') => `<g transform="translate(${x} ${y})" class="${cls}">${[0, 72, 144, 216, 288].map((a) => `<ellipse rx="${r * 0.55}" ry="${r}" transform="rotate(${a}) translate(0 ${-r * 0.8})"/>`).join('')}<circle r="${r * 0.4}" fill="#ffe08a"/></g>`;
const FLAME = (x, y, s = 1, cls = 'a1', d = 0) => `<g transform="translate(${x} ${y}) scale(${s})"><path class="flick ${cls}" style="animation-delay:${d}s" d="M0 0C-16-14-6-26-10-42 0-34 0-52 9-64 11-48 24-40 17-20 25-26 25-12 18 0Z"/></g>`;
const HEART = (x, y, s = 1, cls = 'a1') => `<path class="${cls}" transform="translate(${x} ${y}) scale(${s})" d="M0 22C-26 6-30-10-18-18-10-23-3-18 0-12 3-18 10-23 18-18 30-10 26 6 0 22Z"/>`;
const STAR4 = (x, y, s = 1, cls = 'a2 tw', d = 0) => `<path class="${cls}" style="animation-delay:${d}s" transform="translate(${x} ${y}) scale(${s})" d="M0-6 1.5-1.5 6 0 1.5 1.5 0 6-1.5 1.5-6 0-1.5-1.5Z"/>`;

// ---- Bảng tên có hình bên phải (viewBox 160×60, nằm sát mép phải, mờ dần sang trái)
const NP_ART = {
  moon: SVG('0 0 160 60', `<circle cx="112" cy="26" r="17" fill="#e9eef5"/><circle cx="106" cy="21" r="3" fill="#c9d2de"/><circle cx="117" cy="31" r="4" fill="#cfd8e3"/><circle cx="118" cy="18" r="2" fill="#c9d2de"/>
    <path d="M70 46c10-8 22-6 30 0 8-6 22-6 30 2H70Z" fill="#9aa6b8" opacity=".55" class="drift"/>${BAT(70, 18, 0.8, 0)}${BAT(140, 12, 0.6, 0.3)}${STAR4(60, 10, 0.7, 'a2 tw', 0)}${STAR4(150, 40, 0.6, 'a2 tw', 0.7)}${STAR4(88, 8, 0.5, 'a2 tw', 1.2)}`),
  blossom: SVG('0 0 160 60', `<path d="M160 6C130 10 112 22 96 40M126 16c-4 8-6 14-4 22M108 30c8-2 14 0 18 6" stroke="#5a3a2a" stroke-width="3" fill="none" stroke-linecap="round"/>
    ${BLOSSOM(150, 9, 6)}${BLOSSOM(132, 14, 5)}${BLOSSOM(118, 24, 6)}${BLOSSOM(122, 40, 5)}${BLOSSOM(100, 38, 5)}${BLOSSOM(140, 30, 4)}<g class="a2 petals"><ellipse cx="80" cy="12" rx="2" ry="3"/><ellipse cx="96" cy="6" rx="2" ry="3"/><ellipse cx="70" cy="30" rx="2" ry="3"/></g>`),
  city: SVG('0 0 160 60', `<circle cx="140" cy="14" r="8" fill="#f5e6b8" opacity=".9"/>${[[62, 30, 10], [74, 18, 12], [88, 26, 9], [99, 10, 14], [115, 22, 10], [127, 14, 12], [141, 28, 9], [152, 20, 8]].map(([x, y, w]) => `<rect x="${x}" y="${y}" width="${w}" height="${60 - y}" fill="#0f1020"/>` + Array.from({ length: 6 }, (_, k) => `<rect class="win" style="animation-delay:${(k * 0.37 + x * 0.01) % 2}s" x="${x + 2 + (k % 2) * (w / 2 - 1)}" y="${y + 4 + Math.floor(k / 2) * 8}" width="2.5" height="3" />`).join('')).join('')}`),
  mountain: SVG('0 0 160 60', `<circle class="sunrise" cx="128" cy="34" r="12" style="fill:var(--c2)"/><path d="M60 60L92 22l14 16 14-20 40 42Z" fill="#3a3550" opacity=".85"/><path d="M80 60l28-26 16 12 12-10 24 24Z" fill="#23203a"/>${BIRD(100, 14, 0.4, 0)}${BIRD(112, 10, 0.35, 0.2)}`),
  koi: SVG('0 0 160 60', `<g class="swim" style="transform-origin:118px 30px"><g transform="translate(118 12)"><ellipse rx="12" ry="5" fill="#ff7a3a"/><path d="M11 0l9-6v12Z" fill="#ff7a3a"/><circle cx="-3" cy="-1" r="2.5" fill="#fff"/><circle cx="-8" cy="-1" r="1" fill="#111"/></g>
    <g transform="translate(118 48) rotate(180)"><ellipse rx="12" ry="5" fill="#fff"/><path d="M11 0l9-6v12Z" fill="#fff"/><circle cx="1" cy="0" r="3" fill="#e8402a"/><circle cx="-8" cy="-1" r="1" fill="#111"/></g></g><circle cx="118" cy="30" r="20" fill="none" stroke="#9fe3ff" stroke-opacity=".35" class="ripple"/>`),
  rocket: SVG('0 0 160 60', `<circle cx="140" cy="44" r="10" style="fill:var(--c2)"/><ellipse cx="140" cy="44" rx="18" ry="4" fill="none" stroke="#fff" stroke-opacity=".6"/>
    <g class="fly"><path d="M86 34l18-10c6-3 10-1 8 5l-10 18Z" fill="#e8e8f0"/><circle cx="104" cy="31" r="3" fill="#3fd6ff"/><path d="M90 40l-8 2 4-8Z" fill="#e8402a"/><path class="flick" d="M86 38l-10 8 4-10Z" fill="#ffb040"/></g>${STAR4(70, 12, 0.6, 'a2 tw', 0.2)}${STAR4(120, 8, 0.7, 'a2 tw', 1)}`),
  cat: SVG('0 0 160 60', `<path d="M96 60V30c0-10 6-16 6-16l6 8h16l6-8s6 6 6 16v30Z" fill="#141418"/><g class="blink"><ellipse cx="110" cy="38" rx="4" ry="5" style="fill:var(--c2)"/><ellipse cx="128" cy="38" rx="4" ry="5" style="fill:var(--c2)"/></g>
    <rect x="109" y="35" width="2" height="6" fill="#111"/><rect x="127" y="35" width="2" height="6" fill="#111"/><path d="M116 46l3 2 3-2" stroke="#ff8fa3" fill="none" stroke-width="1.5"/>`),
  bigwave: SVG('0 0 160 60', `<g class="slide"><path d="M60 60c10-20 30-34 54-30-12 4-16 14-10 20 6 6 18 2 20-8 4 14-6 26-22 28H60Z" style="fill:var(--c2)" opacity=".9"/><path d="M100 60c12-18 30-26 50-20-10 2-14 10-8 16 4 4 12 2 14-4 2 8-2 14-8 16Z" fill="#fff" opacity=".85"/></g>`),
  dragon: SVG('0 0 160 60', `<g class="float"><path d="M64 44c14-18 28 4 42-12s26 2 34-10" fill="none" style="stroke:var(--c2)" stroke-width="7" stroke-linecap="round"/><path d="M64 44c14-18 28 4 42-12s26 2 34-10" fill="none" stroke="#000" stroke-opacity=".25" stroke-width="2" stroke-dasharray="3 5"/>
    <circle cx="142" cy="21" r="7" style="fill:var(--c2)"/><path d="M144 15l6-8M139 15l2-9" style="stroke:var(--c2)" stroke-width="2.5" stroke-linecap="round"/><circle class="glow" cx="145" cy="20" r="1.8" fill="#ffe14a"/><path d="M148 24l9 3-8 1Z" fill="#ff7a3a" class="flick"/></g>`),
  flames: SVG('0 0 160 60', `${FLAME(150, 62, 0.9, 'a2', 0)}${FLAME(128, 64, 0.7, 'a1', 0.2)}${FLAME(110, 64, 0.55, 'a2', 0.4)}${FLAME(140, 64, 0.5, 'f3', 0.1)}`),
};

// ---- Khung hồ sơ "hoành tráng": trang trí tràn lên trên (top, viewBox 400×110) và xuống dưới (bottom, 400×70)
const BRANCH = (d) => `<path d="${d}" class="branch" fill="none" stroke-linecap="round"/>`;
const CF_ART = {
  raven: {
    top: SVG('0 0 400 110', `<circle cx="200" cy="64" r="44" fill="#dfe6ee"/><circle cx="186" cy="52" r="7" fill="#c3ccd8"/><circle cx="214" cy="74" r="9" fill="#c8d1dc"/><circle cx="216" cy="46" r="4" fill="#c3ccd8"/>
      ${BRANCH('M0 96C60 88 120 100 200 92S330 86 400 96M30 92c10-20 6-40 20-60M70 94c-6-18 4-30 0-46M330 90c8-16 2-34 18-54M372 94c-4-20 8-30 4-50M140 94c-12-10-26-12-40-26M260 92c16-10 30-10 44-24')}
      ${CROW(130, 80, 1.3)}${CROW(176, 74, 1.6, false, 'bob')}${CROW(222, 80, 1.3, true)}${CROW(300, 72, 1.1, true, 'bob2')}${CROW(52, 30, 0.9, false)}${CROW(352, 34, 0.9, true)}`, 'cfa-top'),
    bottom: SVG('0 0 400 70', BRANCH('M0 14C80 22 160 8 200 16S330 24 400 12M40 18c6 18-6 30 4 46M120 16c-8 16 6 28-4 44M200 16c4 14-8 26 0 40M280 18c-6 18 8 28 0 44M360 14c8 16-4 28 6 44M80 18c-14 10-30 6-44 18M320 18c14 10 30 8 44 20'), 'cfa-bot'),
  },
  sakura: {
    top: SVG('0 0 400 110', `${BRANCH('M0 90C70 70 130 96 200 84S330 60 400 86M60 80c10-16 30-22 40-40M300 74c-6-18 10-30 6-50')}${[[30, 80], [70, 60], [98, 44], [140, 86], [190, 80], [250, 76], [300, 60], [306, 30], [350, 74], [390, 80], [120, 70], [220, 92]].map(([x, y], k) => BLOSSOM(x, y, 7 + (k % 3) * 2)).join('')}`, 'cfa-top'),
    bottom: SVG('0 0 400 70', `${BRANCH('M0 20C90 34 160 10 220 22S340 34 400 18')}${[[40, 24], [110, 22], [180, 18], [260, 28], [330, 24], [380, 20]].map(([x, y]) => BLOSSOM(x, y, 6)).join('')}`, 'cfa-bot'),
  },
  royal: {
    top: SVG('0 0 400 110', `<path d="M170 92l8-34 14 16 8-26 8 26 14-16 8 34Z" class="gold"/><circle cx="200" cy="44" r="5" class="a2"/><circle cx="178" cy="58" r="3" class="a2"/><circle cx="222" cy="58" r="3" class="a2"/>
      <path d="M160 96c-30 0-40-22-64-18-18 3-22 18-40 14M240 96c30 0 40-22 64-18 18 3 22 18 40 14M120 92c-8-16 6-26 18-18M280 92c8-16-6-26-18-18" fill="none" class="goldline"/>${STAR4(110, 60, 1.2, 'a2 tw')}${STAR4(290, 60, 1.2, 'a2 tw', 0.8)}`, 'cfa-top'),
    bottom: SVG('0 0 400 70', `<path d="M120 12c30 0 40 24 80 24s50-24 80-24M150 14c-20 4-26 22-46 18M250 14c20 4 26 22 46 18" fill="none" class="goldline"/><path d="M200 26l9 10-9 10-9-10Z" class="a2"/>`, 'cfa-bot'),
  },
  frost: {
    top: SVG('0 0 400 110', `<path d="M0 88H400V96H0Z" fill="#e8f6ff"/>${Array.from({ length: 22 }, (_, k) => { const x = 8 + k * 18, h = 10 + ((k * 37) % 22); return `<path d="M${x - 6} 95L${x} ${95 + h}L${x + 6} 95Z" fill="#cfeeff" opacity=".9"/>`; }).join('')}
      <path d="M0 90c40-14 70-6 100-12s70 8 100-4 60-10 100 0 70 4 100-6v18H0Z" fill="#ffffff"/>${STAR4(80, 50, 2, 'a2 tw')}${STAR4(320, 40, 2.4, 'a2 tw', 0.6)}${STAR4(200, 30, 1.6, 'a2 tw', 1.1)}`, 'cfa-top'),
    bottom: SVG('0 0 400 70', `<path d="M0 10c50 16 90-4 140 8s90 14 140 0 80 4 120-6v58H0Z" fill="#f0faff" opacity=".95"/><path d="M0 22c60 10 120-4 200 6s140 0 200-4" stroke="#cfeeff" fill="none" stroke-width="3"/>`, 'cfa-bot'),
  },
  inferno: {
    top: SVG('0 0 400 110', `${Array.from({ length: 10 }, (_, k) => `<circle class="ember" style="animation-delay:${k * 0.4}s" cx="${30 + k * 38}" cy="${96 - (k % 3) * 10}" r="${2 + (k % 2)}" fill="#ffd23a"/>`).join('')}<path d="M0 100c30-8 50 4 80-4s50-12 80 0 60 8 80-2 50-10 80 0 50 6 80-2v8H0Z" class="a1"/>`, 'cfa-top'),
    bottom: SVG('0 0 400 70', `${Array.from({ length: 14 }, (_, k) => FLAME(14 + k * 29, 70, 0.55 + (k % 3) * 0.12, k % 2 ? 'a1' : 'a2', k * 0.13)).join('')}`, 'cfa-bot'),
  },
  cyber: {
    top: SVG('0 0 400 110', `<path d="M20 96V80h60l10-10h220l10 10h60v16" fill="none" class="neon"/><path d="M120 70l8-8h144l8 8" fill="none" class="neon2"/>${[150, 170, 190, 210, 230, 250].map((x, k) => `<rect class="blinkdot" style="animation-delay:${k * 0.2}s" x="${x}" y="64" width="8" height="3"/>`).join('')}
      <text x="200" y="92" text-anchor="middle" class="hudtxt">◢ ONLINE ◣</text>`, 'cfa-top'),
    bottom: SVG('0 0 400 70', `<path d="M20 10v16h80l10 10h60M380 10v16h-80l-10 10h-60M170 36h60" fill="none" class="neon"/><circle cx="170" cy="36" r="3" class="blinkdot"/><circle cx="230" cy="36" r="3" class="blinkdot" style="animation-delay:.5s"/>`, 'cfa-bot'),
  },
  garden: {
    top: SVG('0 0 400 110', `${BRANCH('M0 92C80 80 140 100 200 90S320 78 400 92')}${Array.from({ length: 12 }, (_, k) => `<ellipse cx="${20 + k * 33}" cy="${86 + (k % 2) * 6}" rx="9" ry="4" transform="rotate(${k % 2 ? 30 : -30} ${20 + k * 33} ${86 + (k % 2) * 6})" fill="#4caf50"/>`).join('')}${[[60, 78], [150, 84], [240, 80], [330, 76]].map(([x, y]) => BLOSSOM(x, y, 8, 'a2')).join('')}<g class="flutter"><path d="M200 50c-8-10-18-4-12 4 4 6 12 2 12-4 0 6 8 10 12 4 6-8-4-14-12-4Z" style="fill:var(--c2)"/></g>`, 'cfa-top'),
    bottom: SVG('0 0 400 70', `${Array.from({ length: 30 }, (_, k) => `<path class="sway" style="animation-delay:${(k % 5) * 0.2}s;transform-origin:${8 + k * 13.5}px 10px" d="M${8 + k * 13.5} 10q${k % 2 ? 4 : -4} 14 0 26" stroke="#4caf50" stroke-width="3" fill="none" stroke-linecap="round"/>`).join('')}<circle cx="90" cy="30" r="9" fill="#e8402a"/><circle cx="87" cy="27" r="2" fill="#fff"/><rect x="88" y="32" width="4" height="10" fill="#f3e2cc"/><circle cx="310" cy="30" r="9" fill="#e8402a"/><rect x="308" y="32" width="4" height="10" fill="#f3e2cc"/>`, 'cfa-bot'),
  },
  spooky: {
    top: SVG('0 0 400 110', `<path d="M0 0l60 60M0 30l30 30M0 60l60 0M30 0l30 60" stroke="#ffffff55" fill="none"/><path d="M0 20q20 10 40 0M0 40q30 14 60 0" stroke="#ffffff44" fill="none"/>
      <path d="M400 0l-60 60M400 30l-30 30M400 60h-60M370 0l-30 60" stroke="#ffffff55" fill="none"/>${BAT(130, 60, 1.6, 0)}${BAT(200, 40, 2, 0.2)}${BAT(270, 62, 1.4, 0.4)}<circle cx="200" cy="60" r="0" />`, 'cfa-top'),
    bottom: SVG('0 0 400 70', `${[[70, 0.9], [200, 1.2], [330, 0.8]].map(([x, s]) => `<g transform="translate(${x} 44) scale(${s})"><ellipse rx="22" ry="17" fill="#ff8a2a"/><ellipse rx="8" ry="17" fill="#ff9f4a"/><path d="M-2-17l2-8 4 1-2 7Z" fill="#3a6a2a"/><path class="glow" d="M-12-4l5-6 3 6ZM12-4l-5-6-3 6ZM-10 6q10 8 20 0l-4 4-3-3-3 3-3-3-3 3Z" fill="#ffe14a"/></g>`).join('')}`, 'cfa-bot'),
  },
  cloud: {
    top: SVG('0 0 400 110', `${['#ff5a5a', '#ffa53a', '#ffe14a', '#6ad66a', '#5aa8ff', '#a77bff'].map((c, k) => `<path d="M80 100A120 80 0 0 1 320 100" fill="none" stroke="${c}" stroke-width="7" transform="translate(0 ${k * 7})" opacity=".85"/>`).join('')}
      <g fill="#fff"><circle cx="70" cy="96" r="20"/><circle cx="95" cy="88" r="22"/><circle cx="118" cy="98" r="16"/><circle cx="282" cy="98" r="16"/><circle cx="305" cy="88" r="22"/><circle cx="330" cy="96" r="20"/></g>`, 'cfa-top'),
    bottom: SVG('0 0 400 70', `<g fill="#fff" class="drift">${[[30, 26, 18], [62, 20, 22], [96, 28, 16], [170, 24, 20], [204, 18, 24], [240, 26, 18], [310, 22, 20], [344, 28, 18], [376, 24, 16]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>`, 'cfa-bot'),
  },
  ocean: {
    top: SVG('0 0 400 110', `<path class="slide" d="M0 92c25-12 50 12 75 0s50-12 75 0 50 12 75 0 50-12 75 0 50 12 75 0 50-12 75 0v18H0Z" style="fill:var(--c1)"/><path class="slide2" d="M0 98c25-10 50 10 75 0s50-10 75 0 50 10 75 0 50-10 75 0 50 10 75 0 50-10 75 0v12H0Z" fill="#ffffff" opacity=".7"/>
      ${[[90, 60], [300, 50], [200, 40]].map(([x, y], k) => `<circle class="bubble" style="animation-delay:${k * 0.8}s" cx="${x}" cy="${y}" r="5" fill="none" stroke="#fff"/>`).join('')}`, 'cfa-top'),
    bottom: SVG('0 0 400 70', `${[40, 110, 290, 360].map((x, k) => `<path class="sway" style="animation-delay:${k * 0.3}s;transform-origin:${x}px 70px" d="M${x} 70c-8-16 8-24 0-40" stroke="#3a9a5a" stroke-width="5" fill="none" stroke-linecap="round"/>`).join('')}
      <path d="M170 70c0-18 10-30 30-30s30 12 30 30Z" fill="#ff7a8a"/><path d="M180 70v-14M200 70V44M220 70v-14" stroke="#ffb3c0" stroke-width="3"/><path d="M60 64l8-12 8 12Z" fill="#ffd1a0"/>`, 'cfa-bot'),
  },
};

// ---- Cảnh hiệu ứng hồ sơ: hiện lên → chuyển động → biến mất, lặp mỗi ~9 giây (viewBox 300×400 phủ cả thẻ)
const PFX_SCENE = {
  ravenmoon: SVG('0 0 300 400', `<g class="sc-fade"><circle cx="220" cy="90" r="50" fill="#e4eaf2"/><circle cx="205" cy="80" r="8" fill="#c8d1dc"/><circle cx="232" cy="104" r="10" fill="#cdd5e0"/>
    <path d="M0 330c60-40 120-10 180-40s100-10 120-30v140H0Z" fill="#1d2230" opacity=".7"/></g>${Array.from({ length: 7 }, (_, k) => `<g class="sc-flyx" style="animation-delay:${1 + k * 0.35}s"><g transform="translate(0 ${120 + (k % 4) * 45})">${BIRD(0, 0, 1 + (k % 3) * 0.3, k * 0.1)}</g></g>`).join('')}`, 'scene'),
  pinkflame: SVG('0 0 300 400', `<g class="sc-burst" style="transform-origin:40px 400px">${FLAME(30, 410, 2.6, 'a1', 0)}${FLAME(80, 410, 2, 'a2', 0.15)}</g><g class="sc-burst d2" style="transform-origin:270px 400px">${FLAME(270, 410, 2.8, 'a1', 0.1)}${FLAME(225, 410, 1.9, 'a2', 0.25)}</g><g class="sc-burst d3" style="transform-origin:150px 400px">${FLAME(150, 410, 1.6, 'f3', 0.2)}</g>`, 'scene'),
  fireworks: SVG('0 0 300 400', `${[[80, 110, 0], [210, 80, 1.1], [150, 190, 2.2]].map(([x, y, d]) => `<g class="sc-fw" style="animation-delay:${d}s;transform-origin:${x}px ${y}px">${Array.from({ length: 14 }, (_, k) => { const a = k / 14 * Math.PI * 2; return `<line x1="${x + Math.cos(a) * 8}" y1="${y + Math.sin(a) * 8}" x2="${x + Math.cos(a) * 46}" y2="${y + Math.sin(a) * 46}" class="${k % 2 ? 'sa1' : 'sa2'}" stroke-width="3" stroke-linecap="round"/>`; }).join('')}<circle cx="${x}" cy="${y}" r="5" fill="#fff"/></g>`).join('')}`, 'scene'),
  meteor: SVG('0 0 300 400', `${[[260, -20, 0], [300, 60, 0.7], [220, -40, 1.4], [320, 140, 2.1]].map(([x, y, d]) => `<g class="sc-meteor" style="animation-delay:${d}s"><line x1="${x}" y1="${y}" x2="${x + 70}" y2="${y - 50}" class="sa2" stroke-width="3" stroke-linecap="round" opacity=".7"/><circle cx="${x}" cy="${y}" r="4" fill="#fff"/></g>`).join('')}`, 'scene'),
  bigheart: SVG('0 0 300 400', `<g class="sc-heart" style="transform-origin:150px 190px">${HEART(150, 180, 3, 'a1')}</g>${Array.from({ length: 8 }, (_, k) => { const a = k / 8 * Math.PI * 2; return `<g class="sc-shard" style="--dx:${Math.cos(a) * 120}px;--dy:${Math.sin(a) * 120}px">${HEART(150, 190, 0.7, k % 2 ? 'a1' : 'a2')}</g>`; }).join('')}`, 'scene'),
  storm: SVG('0 0 300 400', `<rect class="sc-dark" width="300" height="400" fill="#0b0f1e"/><g class="sc-fade"><path d="M20 70c10-20 40-24 54-10 10-16 40-16 52 0 14-10 40-4 44 14 20-4 30 12 22 24H24c-16-2-18-20-4-28Z" fill="#3a4258"/><path d="M150 60c12-16 40-16 50-2 14-8 34 0 36 16 18 0 24 16 14 26H150Z" fill="#2c3346"/></g>
    <path class="sc-bolt" d="M170 100l-30 90h26l-24 100 60-120h-28l22-70Z" style="fill:var(--c1)"/>`, 'scene'),
  petalstorm: SVG('0 0 300 400', `${Array.from({ length: 22 }, (_, k) => `<g class="sc-gust" style="animation-delay:${(k % 8) * 0.18}s"><ellipse cx="0" cy="${30 + k * 16}" rx="5" ry="8" class="${k % 3 ? 'a1' : 'a2'}" transform="rotate(${k * 33} 0 ${30 + k * 16})"/></g>`).join('')}`, 'scene'),
  ghostpeek: SVG('0 0 300 400', `<g class="sc-ghost"><g transform="translate(250 200)"><path d="M-36 60V-10c0-30 20-50 36-50s36 20 36 50v70l-12-12-12 12-12-12-12 12-12-12Z" fill="#f4f6ff" opacity=".95"/><ellipse cx="-12" cy="-12" rx="6" ry="9" fill="#1b1b2a"/><ellipse cx="12" cy="-12" rx="6" ry="9" fill="#1b1b2a"/><ellipse cx="0" cy="12" rx="8" ry="6" fill="#1b1b2a"/><path class="wave-arm" d="M-36 10c-20-6-26-24-18-30" stroke="#f4f6ff" stroke-width="12" fill="none" stroke-linecap="round"/></g></g>`, 'scene'),
  catpaw: SVG('0 0 300 400', `<g class="sc-paw"><g transform="translate(150 420)"><ellipse rx="70" ry="90" style="fill:var(--c1)"/><ellipse cy="-20" rx="34" ry="28" style="fill:var(--c2)"/>${[[-44, -70], [-16, -92], [16, -92], [44, -70]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="14" ry="17" style="fill:var(--c2)"/>`).join('')}</g></g>${[60, 240, 110, 200].map((x, k) => `<g class="sc-pop" style="animation-delay:${2 + k * 0.25}s">${HEART(x, 150 + (k % 2) * 40, 0.6, 'a2')}</g>`).join('')}`, 'scene'),
  sparkleburst: SVG('0 0 300 400', `<circle class="sc-ring" cx="150" cy="190" r="20" fill="none" class2="" style="stroke:var(--c1)" stroke-width="6"/><circle class="sc-ring d2" cx="150" cy="190" r="20" fill="none" style="stroke:var(--c2)" stroke-width="3"/>
    ${Array.from({ length: 12 }, (_, k) => { const a = k / 12 * Math.PI * 2; return `<g class="sc-shard" style="--dx:${Math.cos(a) * 130}px;--dy:${Math.sin(a) * 130}px">${STAR4(150, 190, 2, k % 2 ? 'a1' : 'a2', 0)}</g>`; }).join('')}`, 'scene'),
};

// ---- Kiểu chữ tên: phông chữ (namefont) + hiệu ứng màu (nameeffect)
function nameStyleOf(look) { const nf = lookItem(look, 'namefont'), ne = lookItem(look, 'nameeffect'); return nf || ne ? { font: nf && nf.font, fx: ne && ne.style, c1: ne && ne.color, c2: ne && (ne.accent || ne.color) } : null; }
function nameEl(name, look) {
  const s = document.createElement('span'); s.className = 'nm'; s.textContent = name;
  const ns = nameStyleOf(look); if (!ns) return s;
  if (ns.font) s.style.fontFamily = `"${ns.font}", system-ui, sans-serif`;
  if (ns.fx) { s.classList.add('ne-' + ns.fx); s.style.setProperty('--c1', ns.c1 || '#ffffff'); s.style.setProperty('--c2', ns.c2 || ns.c1 || '#ffffff'); }
  return s;
}
// look tối giản từ tin chat (server gửi kèm id phông + hiệu ứng tên + màu sơn)
function chatLook(m) { const ns = m.ns; if (!ns) return null; return { equip: { namefont: ns.nf, nameeffect: ns.ne }, paint: ns.ne && ns.pc ? { [ns.ne]: ns.pc } : {} }; }

// Tạo icon SVG từ bộ icon chung trong index.html (#i-<tên>)
function icon(name) {
  const NS = 'http://www.w3.org/2000/svg', s = document.createElementNS(NS, 'svg'), u = document.createElementNS(NS, 'use');
  s.setAttribute('class', 'ico'); u.setAttribute('href', '#i-' + name); s.appendChild(u); return s;
}
const AV_S = 1.3;      // tỉ lệ nhân vật + ghế (to hơn cho dễ nhìn)

// ---- Bố cục rạp 152 chỗ, 4 khu từ gần màn ra xa; mỗi khu 2–4 hàng giống hệt nhau, 3 khối đối xứng.
// Mỗi hàng có 3 khối (trái | giữa | phải) ngăn bởi 2 lối đi ở x = ±AISLE_X; hàng sau cao hơn hàng trước (bậc thang).
// rMin/rMax = góc ngả lưng nhỏ nhất/lớn nhất (rad) — người ngồi tự chỉnh trong khoảng này; legrest = có gác chân bật lên.
const SEAT_TYPES = {
  regular: { name: 'Ghế thường', depth: 3.0, step: 0.7, off: 1.3,  rMin: 0.06, rMax: 0.38, legrest: false, legs: 'up',   color: 0x4c535e },
  leather: { name: 'Ghế da',     depth: 4.6, step: 0.9, off: 2.1,  rMin: 0.15, rMax: 0.95, legrest: true,  legs: 'up',   color: 0x6b4230 },
  couple:  { name: 'Ghế đôi',    depth: 4.6, step: 1.0, off: 2.1,  rMin: 0.15, rMax: 0.9,  legrest: true,  legs: 'up',   color: 0x7a2c40 },
  sofa:    { name: 'Sofa',       depth: 5.0, step: 0.55, off: 2.75, rMin: 0.12, rMax: 0.5, legrest: false, legs: 'up',   color: 0x3d383c },
  bed:     { name: 'Giường nằm', depth: 5.8, step: 1.3, off: 2.45, rMin: 0.5,  rMax: 1.15, legrest: false, legs: 'flat', color: 0x8a909b },
};
// ---- Loại phòng (chọn khi tạo phòng). Trang được nạp lại với ?tpl=<loại> để dựng đúng cảnh cho loại đó.
// units = số cụm ở [khối trái, giữa, phải]; unitW = bề rộng 1 cụm; spu = số chỗ/cụm (2 = ghế đôi / giường đôi)
const ROOM_TEMPLATES = {
  cinema: {
    name: 'Rạp lớn', seats: 152,
    rows: [
      ...Array(4).fill({ type: 'regular', units: [4, 8, 4], unitW: 1.85, spu: 1 }),                          // A–D  4 × 16 = 64
      ...Array(2).fill({ type: 'leather', units: [3, 6, 3], unitW: 2.3, spu: 1 }),                           // E–F  2 × 12 = 24
      ...Array(2).fill({ type: 'couple', units: [2, 4, 2], unitW: 3.9, spu: 2, gap: 0.5, seatOff: 0.78 }),   // G–H  2 × 16 = 32
      ...Array(2).fill({ type: 'bed', units: [2, 4, 2], unitW: 4.0, spu: 2, gap: 0.5, seatOff: 0.975 }),     // I–J  2 × 16 = 32
    ],
    aisleW: 2.6, aisleX: 10.4, sideX0: 20.7, hallX: 24, hallH: 34, z0: 4.75, landD: 16,
    scr: { w: 36, h: 20.25, y: 13.8, z: -12.1 }, stage: { z0: -12.6, z1: -6.6, h: 1.0 }, dance: 5, party: true, decor: 'cinema', zoneSigns: false, aisles: true,
  },
  mini30: {   // phòng chiếu lounge cho nhóm bạn: sofa + bàn trà, ghế lười, trần thiên hà, tường gỗ lam, biển neon vàng
    name: 'Phòng chiếu 30 chỗ', seats: 30,
    rows: Array(3).fill({ type: 'sofa', units: [0, 5, 0], unitW: 3.9, spu: 2, gap: 0.5, seatOff: 0.78 }),     // A–C  3 × 5 sofa đôi = 30
    aisleW: 2.4, aisleX: 12.25, sideX0: 13.6, hallX: 16.5, hallH: 17.5, z0: 4.0, landD: 14,   // sàn sau sâu → góc khán giả lùi đủ xa, thấy cả hàng cuối
    scr: { w: 22, h: 12.375, y: 9.7, z: -8.5 }, stage: { z0: -9.2, z1: -6.2, h: 0.6 }, dance: 0, party: false, decor: 'galaxy', zoneSigns: false, aisles: true,
  },
  room10: {   // phòng VIP kiểu home theater: trần sao, LED tím, biển neon, kệ trưng bày
    name: 'Phòng VIP 10 chỗ', seats: 10,
    rows: [
      { type: 'leather', units: [0, 5, 0], unitW: 2.3, spu: 1 },                                             // A  5 ghế da ngả
      { type: 'leather', units: [0, 5, 0], unitW: 2.3, spu: 1 },                                             // B  5 ghế da ngả
    ],
    aisleW: 2.2, aisleX: 7.9, sideX0: 9.0, hallX: 11.2, hallH: 12.8, z0: 2.6, landD: 5,
    cam: { pos: [0, 6.4, 1.3], look: [0, 4.6, -1] },   // đứng sau hàng ghế cuối nhìn về màn (như ảnh mẫu)
    scr: { w: 16.5, h: 9.28, y: 7.2, z: -6 }, stage: { z0: -6.6, z1: -4.4, h: 0.5 }, dance: 0, party: false, decor: 'lounge', zoneSigns: false, aisles: true,
  },
  couple2: {  // phòng đôi: phòng ngủ ấm cúng, 1 giường đôi, máy chiếu + màn chiếu trên tường
    name: 'Phòng đôi', seats: 2,
    rows: [{ type: 'bed', units: [0, 1, 0], unitW: 4.0, spu: 2, gap: 0, seatOff: 0.975 }],                   // 1 giường đôi
    aisleW: 1.8, aisleX: 3.4, sideX0: 4.4, hallX: 6.2, hallH: 7.2, z0: 1.4, landD: 1.6,   // giường kê sát tường sau
    cam: { pos: [0, 3.85, 2.45], look: [0, 2.6, -1] },   // nhìn từ đầu giường (z tính từ tường sau / về phía màn)
    scr: { w: 8.8, h: 4.95, y: 4.0, z: -6.4 }, stage: null, dance: 0, party: false, decor: 'bedroom', zoneSigns: false, aisles: false,
  },
};
// bố cục mặc định của rạp công cộng do trang quản trị chọn; phòng riêng mặc định 'cinema'
const MAIN_TPL = ROOM_TEMPLATES[SITE.mainTpl] ? SITE.mainTpl : 'cinema';
const TPL_ID = (() => {
  const sp = new URLSearchParams(location.search), t = sp.get('tpl'), r = (sp.get('room') || 'main').toLowerCase();
  return ROOM_TEMPLATES[t] ? t : r === 'main' ? MAIN_TPL : 'cinema';
})();
const TPLC = ROOM_TEMPLATES[TPL_ID];
const ROW_DEFS = TPLC.rows;
// ---- Phong cách rạp lớn (chọn trong trang quản trị; id phải khớp CINEMA_STYLES ở server.js)
// Mỗi phong cách = bảng màu (a/a2 nhấn chính, b/b2 nhấn phụ, surf = sàn/tường/trần/đèn LED, seats = màu ghế) + phần trang trí riêng.
// 'demon' dựng ngay trong file này; các phong cách khác nằm ở public/styles/<id>.js (chỉ tải khi được chọn).
// Thêm phong cách mới: tạo public/styles/<id>.js + thêm 1 dòng ở đây + 1 dòng ở server.js.
const CINEMA_STYLES = {
  demon: { a: 0xff2a3d, a2: 0xff2238, b: 0x8a2be2, b2: 0x9b30ff, lens: 0xffc2c8, crystal: 0xff7a86, beam: 0xff3a4a, beam2: 0x9b40ff, banner: 0xd6c0c8,
    grad: ['#12040a', '#1c0726', '#240612', '#070205'],
    surf: { floor: 0x120709, wall: 0x0e0508, ceil: 0x070204, back: 0x10060a, front: 0x0c0407, step: 0x1d0a10, aisle: 0x260c14, led: 0xff2238, hemi: [0xd8a0b4, 0x12050a, 0.58], glow: 380, frame: 0xff2238, frameW: 0.12 } },
  luxury: { a: 0xffb347, a2: 0xffa531, b: 0xffd9a0, b2: 0xe8b45e, beam: 0xffdca0, beam2: 0xffdca0, lens: 0xfff1d2,
    surf: { floor: 0x16120f, wall: 0x15110e, ceil: 0x120e0b, back: 0x15110e, front: 0x0d0b0a, step: 0x1f1a16, aisle: 0x2a231d, led: 0xffa531, hemi: [0xffe2c0, 0x15100b, 0.62], glow: 300, frame: 0x0b0a09, frameW: 0.5 },
    seats: { regular: 0x2b2826, leather: 0x262321, couple: 0x2b2522, bed: 0x34302d } },
  cosmic: { a: 0x7a5cff, a2: 0x5f8bff, b: 0x3fd6ff, b2: 0xc061ff, beam: 0xa08cff, beam2: 0x7fd9ff, lens: 0xdcd6ff,
    surf: { floor: 0x0a0c16, wall: 0x0b0d1a, ceil: 0x04050b, back: 0x0b0d1a, front: 0x07080f, step: 0x11142a, aisle: 0x151a36, led: 0x7a5cff, hemi: [0xaab4ff, 0x0a0a18, 0.6], glow: 360, frame: 0x2a1e0e, frameW: 0.3 },
    seats: { regular: 0x9a2716, leather: 0xa82d18, couple: 0xb3341c, bed: 0x8a2416 } },
  anime: { a: 0xff7ab8, a2: 0xff8fc8, b: 0xffd166, b2: 0xb28dff, beam: 0xffc6e2, beam2: 0xd9c2ff, lens: 0xfff0f7,
    surf: { floor: 0x2a2236, wall: 0x2b2140, ceil: 0x1a1430, back: 0x2b2140, front: 0x1c1628, step: 0x352a45, aisle: 0x45365c, led: 0xff8fc8, hemi: [0xffdcef, 0x1c1230, 0.78], glow: 300, frame: 0xb82632, frameW: 0.45 },
    seats: { regular: 0xf0a3c0, leather: 0xe58bb0, couple: 0xd96aa0, bed: 0xf4e3ec } },
};
const CS_ID = CINEMA_STYLES[SITE.cinemaTheme] ? SITE.cinemaTheme : 'demon';
const CT = CINEMA_STYLES[CS_ID];
if (TPLC.decor === 'cinema' && CT.seats) for (const [k, c] of Object.entries(CT.seats)) if (SEAT_TYPES[k]) SEAT_TYPES[k].color = c;   // màu ghế theo phong cách
const cssHex = (n) => '#' + n.toString(16).padStart(6, '0');
const AISLE_W = TPLC.aisleW, AISLE_X = TPLC.aisleX, BLOCK_IN = AISLE_X + AISLE_W / 2;   // mép trong 2 khối bên
const SIDE_X0 = TPLC.sideX0;                                             // ngoài mép này là lối đi sát tường
const SIDE_C = (BLOCK_IN + SIDE_X0) / 2;                                 // tâm khối bên (khối bên căn giữa → đều nhau)
const ROWS = ROW_DEFS.length;
const ROW_INFO = [], SEAT_INFO = [];
let LAND_Z0 = 0, TOP_H = 0;
{
  let z0 = TPLC.z0, h = 0;
  ROW_DEFS.forEach((d, r) => {
    const T = SEAT_TYPES[d.type];
    if (r > 0) h += T.step;
    const z = z0 + T.off, letter = 'ABCDEFGHIJ'[r], gap = d.gap || 0;
    ROW_INFO.push({ z0, depth: T.depth, h, z, type: d.type, letter, lane: z0 + T.depth - 0.45 });
    let n = 0;
    for (let b = 0; b < 3; b++) {
      const cnt = d.units[b]; if (!cnt) continue;
      const W = cnt * d.unitW + (cnt - 1) * gap;
      const cx = b === 1 ? 0 : b === 0 ? -SIDE_C : SIDE_C, start = cx - W / 2 + d.unitW / 2;
      for (let u = 0; u < cnt; u++) {
        const ux = start + u * (d.unitW + gap);
        for (let k = 0; k < d.spu; k++) {
          const half = d.spu === 2 ? (k ? 1 : -1) : 0;
          SEAT_INFO.push({ row: r, x: ux + half * (d.seatOff || 0), z, type: d.type, block: b, unitX: ux, half,
            pitch: d.spu === 2 ? d.seatOff * 2 : d.unitW, label: letter + String(++n).padStart(2, '0') });
        }
      }
    }
    z0 += T.depth;
  });
  LAND_Z0 = z0; TOP_H = h;
}
const SEATS = SEAT_INFO.length;   // = 152 ghế thật
// Sàn nhảy: 5 chỗ đứng nhảy trên bục trước màn, dùng chỉ số "ghế" 152..156 (server giữ chung mảng ghế)
const STAGE_Z0 = TPLC.stage ? TPLC.stage.z0 : 0, STAGE_Z1 = TPLC.stage ? TPLC.stage.z1 : 0, STAGE_H = TPLC.stage ? TPLC.stage.h : 0;
const DANCE_N = TPLC.dance, DANCE_SPOTS = Array.from({ length: DANCE_N }, (_, k) => ({ x: (k - 2) * 4.2, z: -8.6 }));
const DANCE_TYPE = { name: 'Sàn nhảy', dance: true };
// Bàn DJ: chỗ đứng đặc biệt ngay sau các chỗ nhảy (chỉ phòng có sân khấu), đứng sau bàn DJ giữa sân khấu, quay mặt xuống khán giả
const DJ_IDX = DANCE_N > 0 && TPLC.stage ? SEATS + DANCE_N : -1;
const DJ_SPOT = TPLC.stage ? { x: 0, z: TPLC.stage.z0 + 1.6 } : { x: 0, z: 0 };
const isDJ = (i) => DJ_IDX >= 0 && i === DJ_IDX;
const isDance = (i) => i != null && i >= SEATS && (i < SEATS + DANCE_N || i === DJ_IDX);   // đứng trên sân khấu (sàn nhảy hoặc bàn DJ)
const isRealSeat = (i) => i != null && i >= 0 && i < SEATS;
const seatName = (i) => (isDJ(i) ? 'Bàn DJ' : isDance(i) ? 'Sàn nhảy ' + (i - SEATS + 1) : SEAT_INFO[i].label);
const seatRow = (i) => (isDance(i) ? -1 : SEAT_INFO[i].row);
const seatType = (i) => (isDance(i) ? DANCE_TYPE : SEAT_TYPES[SEAT_INFO[i].type]);
function seatPos(i) { if (isDJ(i)) return DJ_SPOT; if (isDance(i)) return DANCE_SPOTS[i - SEATS]; const s = SEAT_INFO[i]; return { x: s.x, z: s.z }; }

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
// Độ cao sàn tại (z, x): mỗi hàng là 1 tầng; ở lối đi có thêm 1 bậc phụ (2 bậc thang / 1 tầng); sau hàng cuối là sàn chờ
const MID_STEP_D = 1.6;
function rowAt(z) {
  if (z < ROW_INFO[0].z0) return -1;
  for (let r = 0; r < ROWS; r++) if (z < ROW_INFO[r].z0 + ROW_INFO[r].depth) return r;
  return ROWS;
}
function inAisle(x) {
  const ax = Math.abs(x);
  return Math.abs(ax - AISLE_X) < AISLE_W / 2 || ax > SIDE_X0;
}
function floorY(z, x = 0) {
  const r = rowAt(z);
  if (r < 0) return z > STAGE_Z0 && z < STAGE_Z1 ? STAGE_H : 0;   // bục trước màn cao 1
  if (r >= ROWS) return TOP_H;
  const R = ROW_INFO[r];
  let h = R.h;
  if (r < ROWS - 1 && inAisle(x) && z > R.z0 + R.depth - MID_STEP_D) h += (ROW_INFO[r + 1].h - R.h) / 2;
  return h;
}

// =====================================================================
//  Helpers
// =====================================================================
function toast(t) {
  const el = $('toast'); el.textContent = t; el.style.display = 'block';
  clearTimeout(toast._t); toast._t = setTimeout(() => (el.style.display = 'none'), 3200);
}
function fmt(s) {
  s = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
// =====================================================================
//  Cảnh 3D
// =====================================================================
const stageEl = $('stage');
// Màn hình lớn 36 x 20.25 (2 bên có loa đứng), đáy màn cao hơn đầu khán giả hàng đầu
const SCR_W = TPLC.scr.w, SCR_H = TPLC.scr.h, SCR_Y = TPLC.scr.y, SCR_Z = TPLC.scr.z;
const SCR_TOP = SCR_Y + SCR_H / 2;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x08080a, 90, 200);
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 400);
// camera khán giả đứng sau tường sau (tường đó tự trong suốt) để thấy trọn màn hình + mọi hàng ghế
// đứng cao sát tường cuối rạp (tường sau ở LAND_Z0 + 16): thấy trọn màn + mọi hàng ghế
const CAM_POS = TPLC.cam ? new THREE.Vector3(TPLC.cam.pos[0], TPLC.cam.pos[1], LAND_Z0 + TPLC.landD - TPLC.cam.pos[2]) : new THREE.Vector3(0, TPLC.hallH * 0.9, LAND_Z0 + TPLC.landD - 1);
const CAM_TARGET = TPLC.cam ? new THREE.Vector3(TPLC.cam.look[0], TPLC.cam.look[1], TPLC.scr.z + 2) : new THREE.Vector3(0, 1.5, TPLC.z0 - 2.75);
camera.position.copy(CAM_POS);

const glR = new THREE.WebGLRenderer({ antialias: true, alpha: true });
glR.setClearColor(0x000000, 0);
const IS_TOUCH = matchMedia('(pointer: coarse)').matches;
// nút thu gọn menu bên phải (nhớ lựa chọn)
{
  const dock = document.getElementById('dock'), tg = document.getElementById('dockToggle');
  const setDock = (c) => { dock.classList.toggle('collapsed', c); tg.title = c ? 'Mở menu' : 'Thu gọn menu'; localStorage.setItem('rc_dock', c ? '1' : '0'); };
  tg.onclick = () => setDock(!dock.classList.contains('collapsed'));
  setDock(localStorage.getItem('rc_dock') === '1');
}
// chiều cao thanh menu (điện thoại: lưới 2 hàng) → các thanh khác tự đẩy lên cho khỏi chồng
new ResizeObserver(() => document.documentElement.style.setProperty('--dockH', document.getElementById('dock').offsetHeight + 'px')).observe(document.getElementById('dock'));   // điện thoại / máy tính bảng
glR.setPixelRatio(Math.min(devicePixelRatio, IS_TOUCH ? 1.5 : 2));   // điện thoại: giảm độ phân giải để mượt + đỡ nóng máy
stageEl.appendChild(glR.domElement);

const cssR = new CSS3DRenderer();
cssR.domElement.style.cssText = 'position:absolute;inset:0;z-index:0;pointer-events:none;overflow:hidden';
stageEl.insertBefore(cssR.domElement, glR.domElement);

const controls = new OrbitControls(camera, glR.domElement);
controls.target.copy(CAM_TARGET);
controls.enablePan = false; controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minDistance = Math.min(6, TPLC.hallX * 0.4); controls.maxDistance = CAM_POS.distanceTo(CAM_TARGET) + 6;
controls.minPolarAngle = 0.25; controls.maxPolarAngle = 1.5;
controls.enableZoom = false;   // góc khán giả: lăn chuột = đổi ống kính (audZoom), luôn giữ trọn màn hình trong khung
controls.minAzimuthAngle = -1.7; controls.maxAzimuthAngle = 1.7;
controls.update(); controls.saveState();

// ---- Ánh sáng: rạp tối sang trọng, điểm nhấn vàng ấm + ánh màn hắt xuống
// Màu sắc + ánh sáng theo chủ đề phòng
const THEME = {
  cinema:   CT.surf,
  galaxy:   { floor: 0x2a2623, wall: 0x2b2724, ceil: 0x0c0a0f, back: 0x25211e, front: 0x12100e, step: 0x2e2a27, aisle: 0x34302c, led: 0xffb35a,
              hemi: [0xffd9b0, 0x1a1410, 0.5], glow: 140, frame: 0x080808, frameW: 0.5 },
  lounge:   { floor: 0x1a171d, wall: 0x141217, ceil: 0x05040a, back: 0x121016, front: 0x0c0b0e, step: 0x1d1a21, aisle: 0x1d1a21, led: 0xa15cff,
              hemi: [0xc9b6ff, 0x0d0a12, 0.42], glow: 110, frame: 0x060606, frameW: 0.55 },
  bedroom:  { floor: 0x2a1f19, wall: 0x1b191c, ceil: 0x121013, back: 0x1a1719, front: 0x0d0c0d, step: 0x2a1f19, aisle: 0x2a1f19, led: 0xffb46a,
              hemi: [0xffd2a8, 0x140e0b, 0.32], glow: 70, frame: 0x060606, frameW: 0.6 },
}[TPLC.decor];
const HEMI = new THREE.HemisphereLight(THEME.hemi[0], THEME.hemi[1], THEME.hemi[2]); scene.add(HEMI);   // đèn chung (tối bớt khi bật đèn bar)
const screenGlow = new THREE.PointLight(TPLC.decor === 'bedroom' ? 0xffd8b8 : 0xc4d0ff, THEME.glow, TPLC.hallX * 3.3, 1.5); screenGlow.position.set(0, SCR_Y - 1.5, SCR_Z + 6); scene.add(screenGlow);
const fillL = new THREE.DirectionalLight(0xffe9cc, 0.35); fillL.position.set(5, 30, 30); scene.add(fillL);

// ---- Vật liệu dùng chung
const matCache = new Map();
function mat(color, o = {}) {
  const k = color + JSON.stringify(o);
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, metalness: 0.05, ...o }));
  return matCache.get(k);
}
function smat(color, o = {}) { return mat(color, { flatShading: false, roughness: 0.7, ...o }); }
const rgeoCache = new Map();
function rgeo(w, h, d, r) {                               // khối hộp bo tròn (dùng chung hình học)
  r = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  const k = [w, h, d, r].join('|');
  if (!rgeoCache.has(k)) rgeoCache.set(k, new RoundedBoxGeometry(w, h, d, 3, r));
  return rgeoCache.get(k);
}
function rb(w, h, d, color, x, y, z, parent = scene, r = 0.12, o) {
  const m = new THREE.Mesh(rgeo(w, h, d, r), smat(color, o));
  m.position.set(x, y, z); parent.add(m); return m;
}
function box(w, h, d, color, x, y, z, parent = scene, o) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, o));
  m.position.set(x, y, z); parent.add(m); return m;
}

// ---- Phòng chiếu rộng, trần cao (tường quay vào trong: camera đứng ngoài thì tường phía đó tự trong suốt)
const HALL_X = TPLC.hallX, HALL_FRONT = SCR_Z - 1.3, HALL_H = TPLC.hallH;
// sàn sau hàng cuối sâu 16 → cuối rạp đủ xa để camera khán giả thấy trọn mọi hàng ghế (cả hàng sau cùng)
const LAND_D = TPLC.landD, HALL_BACK = LAND_Z0 + LAND_D;
const HALL_D = HALL_BACK - HALL_FRONT, HALL_ZC = (HALL_BACK + HALL_FRONT) / 2;
function plane(w, h, color, x, y, z, rx, ry, o) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat(color, o));
  m.position.set(x, y, z); m.rotation.set(rx, ry, 0); scene.add(m); return m;
}
plane(HALL_X * 2, HALL_D, THEME.floor, 0, 0, HALL_ZC, -Math.PI / 2, 0);                  // sàn
plane(HALL_X * 2, HALL_D, THEME.ceil, 0, HALL_H, HALL_ZC, Math.PI / 2, 0);              // trần
plane(HALL_D, HALL_H, THEME.wall, -HALL_X, HALL_H / 2, HALL_ZC, 0, Math.PI / 2);        // tường trái
plane(HALL_D, HALL_H, THEME.wall, HALL_X, HALL_H / 2, HALL_ZC, 0, -Math.PI / 2);        // tường phải
plane(HALL_X * 2, HALL_H, THEME.back, 0, HALL_H / 2, HALL_BACK, 0, Math.PI);            // tường sau
plane(HALL_X * 2, HALL_H, THEME.front, 0, HALL_H / 2, HALL_FRONT, 0, 0);                 // tường sau màn
if (TPLC.stage) {                                                                        // bục trước màn
  box(HALL_X * 2, STAGE_H, STAGE_Z1 - STAGE_Z0, THEME.step, 0, STAGE_H / 2, (STAGE_Z0 + STAGE_Z1) / 2);
  box(HALL_X * 2, 0.06, 0.04, 0x000000, 0, STAGE_H, STAGE_Z1).material = new THREE.MeshBasicMaterial({ color: THEME.led });
}

// ---- Màn hình: viền đen mảnh (masking) + "lỗ" để lộ iframe YouTube phía sau canvas
box(SCR_W + THEME.frameW, SCR_H + THEME.frameW, 0.2, THEME.frame, 0, SCR_Y, SCR_Z - 0.25, scene, { metalness: TPLC.decor === 'bedroom' ? 0 : 0.75, roughness: 0.35 });   // viền màn mỏng
const hole = new THREE.Mesh(
  new THREE.PlaneGeometry(SCR_W, SCR_H),
  new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0, transparent: true, blending: THREE.NoBlending, side: THREE.DoubleSide })
);
hole.position.set(0, SCR_Y, SCR_Z); scene.add(hole);

const ytWrap = $('ytwrap');
const cssObj = new CSS3DObject(ytWrap);
cssObj.position.set(0, SCR_Y, SCR_Z);
cssObj.scale.setScalar(SCR_W / 1920);
const cssScene = new THREE.Scene(); cssScene.add(cssObj);

// ---- Biển (canvas -> texture)
function textTexture(text, w, h, font, fg, bg) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  if (bg) { x.fillStyle = bg; x.fillRect(0, 0, w, h); }
  x.font = font; x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// Đồ gắn trên tường trái / phải / trần được gom nhóm: khi camera (góc khán giả xoay tự do) ra ngoài
// bức tường nào thì ẩn đồ trên tường đó, để nhìn xuyên vào trong rạp (giống tường đã tự trong suốt).
const wallL = new THREE.Group(), wallR = new THREE.Group(), ceilG = new THREE.Group();
scene.add(wallL, wallR, ceilG);
function sortHallDecor() {
  for (const o of [...scene.children]) {
    if (o === wallL || o === wallR || o === ceilG || o.isInstancedMesh || o.isLight) continue;
    const p = o.position;
    if (p.x < -HALL_X + 1.5) wallL.add(o);
    else if (p.x > HALL_X - 1.5) wallR.add(o);
    else if (p.y > HALL_H - 1) ceilG.add(o);
  }
}
function updateHallCutaway() {
  const c = camera.position;
  wallL.visible = c.x > -HALL_X; wallR.visible = c.x < HALL_X; ceilG.visible = c.y < HALL_H;
}

// ---- Nội thất theo chủ đề cho các phòng không phải rạp lớn
let starPts = null;
const candles = [];
function buildThemeDecor() {
  const glowM = (c) => new THREE.MeshBasicMaterial({ color: c });
  const door = (x, z, ry, color) => { plane(2.2, 3.4, color, x, floorY(z - Math.cos(ry) * 0.5) + 1.7, z, 0, ry); };
  const ADDM = (c, o, tex) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, map: tex || null, depthWrite: false, fog: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });
  const candle = (x, y, z, h = 0.22) => {                      // nến trong ly thuỷ tinh, lửa chập chờn
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, h, 14), smat(0xf3e6cf)); c.position.set(x, y + h / 2, z); scene.add(c);
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, h + 0.1, 14, 1, true), smat(0xffffff, { transparent: true, opacity: 0.18, roughness: 0.05 })); glass.position.set(x, y + (h + 0.1) / 2, z); scene.add(glass);
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), glowM(0xffc46b)); f.scale.y = 1.8; f.position.set(x, y + h + 0.05, z); scene.add(f);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), ADDM(0xffa040, 0.35, DOT_TEX)); halo.position.set(x, y + h + 0.05, z + 0.02); scene.add(halo);
    const l = new THREE.PointLight(0xffa450, 2.2, 3.2, 2); l.position.set(x, y + h + 0.15, z); scene.add(l);
    candles.push({ f, halo, ph: Math.random() * 6, l });
  };
  const projector = (z, y) => {                                 // máy chiếu treo trần
    const pj = new THREE.Group(); pj.position.set(0, y, z); scene.add(pj);
    box(0.08, 0.5, 0.08, 0x111113, 0, 0.45, 0, pj); rb(0.5, 0.06, 0.4, 0x111113, 0, 0.22, 0, pj, 0.02);
    rb(1.3, 0.42, 1.0, 0xe9e9ee, 0, 0, 0, pj, 0.08, { roughness: 0.4 });
    const lr = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 16), smat(0x050505)); lr.rotation.x = Math.PI / 2; lr.position.set(0.3, -0.02, -0.52); pj.add(lr);
    const ln = new THREE.Mesh(new THREE.CircleGeometry(0.11, 16), glowM(0xdce6ff)); ln.position.set(0.3, -0.02, -0.575); ln.rotation.y = Math.PI; pj.add(ln);
  };
  const neonTex = (draw, w = 512, h = 512) => {                 // vẽ chữ / hình neon (có quầng sáng)
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    x.lineCap = x.lineJoin = 'round'; x.strokeStyle = x.fillStyle = '#ffb35a'; x.shadowColor = '#ff8a2a';
    for (const [blur, lw, a] of [[40, 14, 0.5], [18, 9, 0.8], [4, 4, 1]]) { x.shadowBlur = blur; x.lineWidth = lw; x.globalAlpha = a; draw(x); }
    x.globalAlpha = 1; x.shadowBlur = 0; x.strokeStyle = x.fillStyle = '#fff3dc'; x.lineWidth = 2.2; draw(x, true);
    return new THREE.CanvasTexture(c);
  };
  if (TPLC.decor === 'galaxy') {
    const amber = glowM(0xffb35a), purple = glowM(0xa15cff);
    // trần thiên hà: ô trần lớn vẽ tinh vân tím/xanh + sao, viền LED tím; phần trần ngoài tối có đèn âm trần
    const neb = (() => {
      const c = document.createElement('canvas'); c.width = 1024; c.height = 1024; const x = c.getContext('2d'), rng = mulberry32(5);
      x.fillStyle = '#05040c'; x.fillRect(0, 0, 1024, 1024);
      for (let i = 0; i < 70; i++) {
        const cx = rng() * 1024, cy = rng() * 1024, r = 80 + rng() * 260, col = [[120, 60, 220], [60, 90, 230], [190, 70, 200], [40, 40, 120]][i % 4];
        const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, `rgba(${col},${0.22 + rng() * 0.18})`); g.addColorStop(1, `rgba(${col},0)`);
        x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
      for (let i = 0; i < 1400; i++) { x.fillStyle = `rgba(255,255,255,${0.3 + rng() * 0.7})`; const r = rng() < 0.05 ? 1.8 : 0.9; x.fillRect(rng() * 1024, rng() * 1024, r, r); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const iw = HALL_X * 2 - 7, id = HALL_D - 9, icz = HALL_ZC + 1;
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(iw, id), new THREE.MeshBasicMaterial({ map: neb, fog: false }));
    sky.rotation.x = Math.PI / 2; sky.position.set(0, HALL_H - 0.02, icz); scene.add(sky);
    for (const [w, d, x, z] of [[iw, 0.08, 0, icz - id / 2], [iw, 0.08, 0, icz + id / 2], [0.08, id, -iw / 2, icz], [0.08, id, iw / 2, icz]]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), purple); c.position.set(x, HALL_H - 0.35, z); scene.add(c);
    }
    for (let z = HALL_FRONT + 2; z < HALL_BACK - 1; z += 4) for (const sx of [-1, 1]) {
      const d = new THREE.Mesh(new THREE.CircleGeometry(0.13, 12), glowM(0xfff0d8)); d.position.set(sx * (HALL_X - 1.7), HALL_H - 0.02, z); d.rotation.x = Math.PI / 2; scene.add(d);
    }
    for (const sx of [-1, 1]) {
      // tường đá tối + mảng gỗ lam dọc ở đầu và cuối phòng
      for (const [z0, z1] of [[HALL_FRONT + 0.3, SCR_Z + 3.2], [HALL_BACK - 7, HALL_BACK - 0.3]])
        for (let z = z0; z < z1; z += 0.42) box(0.18, HALL_H - 0.4, 0.26, 0x4a3020, sx * (HALL_X - 0.12), (HALL_H - 0.4) / 2 + 0.2, z, scene, { roughness: 0.6 });
      // mảng tường bo góc có viền LED vàng + biển neon
      const pz = SCR_Z + 9.2, pw = 9.5, ph = 8.5, py = 6.2;
      rb(0.25, ph, pw, 0x201d1b, sx * (HALL_X - 0.15), py, pz, scene, 0.6);
      for (const [h, w, y, dz] of [[0.06, pw - 0.6, py + ph / 2 - 0.05, 0], [0.06, pw - 0.6, py - ph / 2 + 0.05, 0], [ph - 0.6, 0.06, py, -pw / 2 + 0.05], [ph - 0.6, 0.06, py, pw / 2 - 0.05]]) {
        const e = new THREE.Mesh(new THREE.BoxGeometry(0.05, h, w), amber); e.position.set(sx * (HALL_X - 0.3), y, pz + dz); scene.add(e);
      }
      // dải LED chân tường
      const fl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, HALL_D), amber); fl.position.set(sx * (HALL_X - 0.35), 0.1, HALL_ZC); scene.add(fl);
      // kệ trưng bày phát sáng gần màn
      const kz = SCR_Z + 3.8;
      rb(0.5, 7, 2.2, 0x15110e, sx * (HALL_X - 0.45), 3.8, kz, scene, 0.04);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 6.8), ADDM(0xffb860, 0.22)); back.position.set(sx * (HALL_X - 0.68), 3.8, kz); back.rotation.y = -sx * Math.PI / 2; scene.add(back);
      for (let k = 0; k < 4; k++) {
        const y = 1.0 + k * 1.75;
        box(0.55, 0.06, 2.15, 0x3a2818, sx * (HALL_X - 0.95), y, kz);
        for (const dz of k < 3 ? [-0.6, 0, 0.6] : []) {
          const col = [0xd8c8a8, 0x7a5a9a, 0xc0503c, 0x3c6aa0, 0xe0b040][(k * 3 + dz * 5 + 9) % 5 | 0];
          const fig = new THREE.Group(); fig.position.set(sx * (HALL_X - 0.95), y + 0.03, kz + dz); scene.add(fig);
          const bd = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.22, 4, 8), smat(col)); bd.position.y = 0.22; fig.add(bd);
          const hd = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), smat(0xf1c9a5)); hd.position.y = 0.48; fig.add(hd);
        }
      }
      const kl = new THREE.PointLight(0xffb870, 10, 7, 1.8); kl.position.set(sx * (HALL_X - 1.3), 4.5, kz); scene.add(kl);
      // loa cột + chậu cây cao 2 bên sân khấu
      const g = new THREE.Group(); g.position.set(sx * (SCR_W / 2 + 1.1), STAGE_H, SCR_Z + 1.3); scene.add(g);
      rb(1.0, 4.0, 0.9, 0x0c0c0e, 0, 2.0, 0, g, 0.06);
      for (const y of [0.9, 1.9, 2.9, 3.6]) { const r = new THREE.Mesh(new THREE.TorusGeometry(y > 3.5 ? 0.13 : 0.3, 0.035, 8, 20), smat(0x2a2a30, { metalness: 0.6 })); r.position.set(0, y, 0.46); g.add(r); }
      for (const [px, pz2, sc] of [[sx * (SCR_W / 2 + 2.6), SCR_Z + 1.6, 1.3], [sx * (HALL_X - 1.4), SCR_Z + 7.5, 1.1], [sx * (HALL_X - 1.4), HALL_BACK - 2, 1.2]]) {
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.4 * sc, 0.32 * sc, 0.8 * sc, 16), smat(0xf2f0ea)); pot.position.set(px, floorY(pz2, px) + 0.4 * sc, pz2); scene.add(pot);
        for (let j = 0; j < 9; j++) { const lf = new THREE.Mesh(new THREE.SphereGeometry(0.42 * sc, 9, 7), smat(0x3b7a3e)); lf.position.set(px + Math.cos(j * 1.3) * 0.35 * sc, floorY(pz2, px) + (1.1 + (j % 4) * 0.45) * sc, pz2 + Math.sin(j * 1.3) * 0.35 * sc); scene.add(lf); }
      }
      const wl = new THREE.PointLight(0xffb36a, 18, 16, 1.7); wl.position.set(sx * (HALL_X - 2.5), 6, HALL_ZC + 4); scene.add(wl);
    }
    // biển neon: trái "Good Friends Good Movies" + bảng clapper, phải tay cầm game + PLAY WATCH CHILL
    const nz = SCR_Z + 9.2;
    const friends = neonTex((x) => {
      x.font = 'italic 700 74px "Segoe Script","Brush Script MT","Comic Sans MS",cursive'; x.textAlign = 'left';
      x.strokeText('Good', 70, 150); x.strokeText('Friends', 70, 250); x.strokeText('Good Movies', 50, 350);
      x.beginPath(); x.moveTo(90, 420); x.quadraticCurveTo(250, 380, 420, 400); x.stroke();
      x.strokeRect(330, 90, 110, 80); x.beginPath(); x.moveTo(330, 112); x.lineTo(440, 112); x.moveTo(355, 90); x.lineTo(345, 112); x.moveTo(385, 90); x.lineTo(375, 112); x.moveTo(415, 90); x.lineTo(405, 112); x.stroke();
    });
    const chill = neonTex((x) => {
      x.beginPath(); x.moveTo(150, 120); x.quadraticCurveTo(256, 90, 362, 120); x.quadraticCurveTo(420, 140, 425, 220); x.quadraticCurveTo(425, 270, 380, 255);
      x.lineTo(320, 215); x.lineTo(192, 215); x.lineTo(132, 255); x.quadraticCurveTo(87, 270, 87, 220); x.quadraticCurveTo(92, 140, 150, 120); x.stroke();   // tay cầm game
      x.beginPath(); x.moveTo(150, 165); x.lineTo(200, 165); x.moveTo(175, 140); x.lineTo(175, 190); x.stroke();
      for (const [cx, cy] of [[330, 150], [360, 175], [330, 195], [300, 175]]) { x.beginPath(); x.arc(cx, cy, 9, 0, Math.PI * 2); x.stroke(); }
      x.font = '600 58px "Segoe UI",system-ui,sans-serif'; x.textAlign = 'center';
      x.strokeText('PLAY', 256, 330); x.strokeText('WATCH', 256, 400); x.strokeText('CHILL', 256, 470);
    });
    for (const [sx, tex] of [[-1, friends], [1, chill]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 6.2), ADDM(0xffffff, 1, tex));
      m.position.set(sx * (HALL_X - 0.42), 6.4, nz); m.rotation.y = -sx * Math.PI / 2; scene.add(m);
      const l = new THREE.PointLight(0xff9a3c, 10, 9, 1.8); l.position.set(sx * (HALL_X - 1.2), 6.4, nz); scene.add(l);
    }
    // sân khấu: viền LED, loa thanh, nến, chậu cây nhỏ; ghế lười trước hàng đầu
    const sl = new THREE.Mesh(new THREE.BoxGeometry(HALL_X * 2 - 1, 0.04, 0.04), amber); sl.position.set(0, STAGE_H - 0.04, STAGE_Z1 + 0.01); scene.add(sl);
    rb(3.2, 0.3, 0.45, 0x0b0b0c, 0, STAGE_H + 0.15, SCR_Z + 1.1, scene, 0.05);
    for (const sx of [-1, 1]) { candle(sx * 3.4, STAGE_H, SCR_Z + 1.5); candle(sx * 3.9, STAGE_H, SCR_Z + 1.3, 0.15); candle(sx * 7.5, STAGE_H, SCR_Z + 1.6, 0.18); }
    const bagMat = smat(0x34302f, { roughness: 1 });
    for (const [bx2, bz2] of [[-9, -3.6], [-5.2, -2.6], [-1.6, -3.4], [1.9, -2.7], [5.4, -3.5], [9, -2.8]]) {
      const bag = new THREE.Mesh(new THREE.SphereGeometry(1.1, 20, 14), bagMat); bag.scale.set(1, 0.62, 1); bag.position.set(bx2, 0.62, bz2); scene.add(bag);
      const dent = new THREE.Mesh(new THREE.SphereGeometry(0.7, 14, 10), bagMat); dent.scale.set(1, 0.5, 1); dent.position.set(bx2, 1.05, bz2 + 0.35); scene.add(dent);
    }
    // biển lối ra + cửa phía sau
    const exitTex = textTexture('LỐI RA  EXIT', 512, 128, '800 60px system-ui,sans-serif', '#eafff0', '#0c7a36');
    const ex = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.45), new THREE.MeshBasicMaterial({ map: exitTex })); ex.position.set(HALL_X - 0.3, 5.4, SCR_Z + 6); ex.rotation.y = -Math.PI / 2; scene.add(ex);
    door(0, HALL_BACK - 0.05, Math.PI, 0x1c1714);
  } else if (TPLC.decor === 'lounge') {
    // Phòng VIP: tường ốp tối có khe LED tím, viền trần LED tím quanh ô trần sao, biển neon "Good Vibes Only" + bỏng ngô,
    // kệ trưng bày phát sáng (tượng nhỏ, cây), bục dưới màn có LED tím + nến, loa cột, máy chiếu treo trần
    const purple = glowM(0xa15cff), warm = glowM(0xffcf96);
    for (const sx of [-1, 1]) {
      // ô tường ốp (2 tông) + khe LED tím dọc ở mép các ô lớn
      const segs = [[HALL_FRONT + 0.4, SCR_Z + 3.4], [SCR_Z + 3.4, SCR_Z + 9.2], [SCR_Z + 9.2, HALL_BACK - 0.4]];
      segs.forEach(([z0, z1], k) => {
        rb(0.3, HALL_H - 0.6, z1 - z0 - 0.2, k === 1 ? 0x1b1820 : 0x16131a, sx * (HALL_X - 0.16), (HALL_H - 0.6) / 2 + 0.3, (z0 + z1) / 2, scene, 0.06, { roughness: 0.95 });
        for (const ez of [z0 + 0.05, z1 - 0.05]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.05, HALL_H - 1.2, 0.05), purple); l.position.set(sx * (HALL_X - 0.33), HALL_H / 2, ez); scene.add(l); }
      });
      // viền LED vàng ấm chân tường
      const fl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, HALL_D), warm); fl.position.set(sx * (HALL_X - 0.35), 0.1, HALL_ZC); scene.add(fl);
      // kệ trưng bày phát sáng gần màn: 3 tầng, tượng nhỏ + chậu cây trên cùng
      const kz = SCR_Z + 1.9;
      rb(0.5, 6.2, 1.9, 0x0e0c10, sx * (HALL_X - 0.45), 3.4, kz, scene, 0.04);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 6.0), ADDM(0xffb860, 0.22)); back.position.set(sx * (HALL_X - 0.68), 3.4, kz); back.rotation.y = -sx * Math.PI / 2; scene.add(back);
      for (let k = 0; k < 4; k++) {
        const y = 1.0 + k * 1.6;
        box(0.55, 0.06, 1.85, 0x2a2018, sx * (HALL_X - 0.95), y, kz);
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 1.8), warm); strip.position.set(sx * (HALL_X - 0.68), y + 1.5, kz); scene.add(strip);
        if (k < 3) for (const dz of [-0.45, 0.45]) {           // tượng nhỏ
          const col = [0xd8c8a8, 0x7a5a9a, 0xc0503c, 0x3c6aa0][(k * 2 + (dz > 0 ? 1 : 0)) % 4];
          const fig = new THREE.Group(); fig.position.set(sx * (HALL_X - 0.95), y + 0.03, kz + dz); scene.add(fig);
          const bd = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.22, 4, 8), smat(col)); bd.position.y = 0.22; fig.add(bd);
          const hd = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), smat(0xf1c9a5)); hd.position.y = 0.48; fig.add(hd);
        } else {                                                // chậu cây
          const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.3, 12), smat(0x2a2a2a)); pot.position.set(sx * (HALL_X - 0.95), y + 0.18, kz); scene.add(pot);
          for (let j = 0; j < 7; j++) { const lf = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), smat(0x3b7a3e)); lf.position.set(sx * (HALL_X - 0.95) + Math.cos(j) * 0.14, y + 0.45 + (j % 3) * 0.1, kz + Math.sin(j) * 0.18); scene.add(lf); }
        }
      }
      const kl = new THREE.PointLight(0xffb870, 8, 6, 1.8); kl.position.set(sx * (HALL_X - 1.2), 4, kz); scene.add(kl);
      // loa cột 2 bên màn
      const g = new THREE.Group(); g.position.set(sx * (SCR_W / 2 + 1.0), STAGE_H, SCR_Z + 1.2); scene.add(g);
      rb(0.9, 3.8, 0.8, 0x0c0c0e, 0, 1.9, 0, g, 0.06);
      for (const y of [0.9, 1.8, 2.7, 3.4]) { const r = new THREE.Mesh(new THREE.TorusGeometry(y > 3.3 ? 0.12 : 0.28, 0.035, 8, 20), smat(0x2a2a30, { metalness: 0.6 })); r.position.set(0, y, 0.41); g.add(r); }
      // đèn tím hắt nhẹ từ trên xuống mỗi bên
      const pl = new THREE.PointLight(0x9a5cff, 18, 14, 1.6); pl.position.set(sx * (HALL_X - 2), HALL_H - 2, HALL_ZC); scene.add(pl);
    }
    // biển neon trên 2 tường bên (giữa phòng)
    const nz = SCR_Z + 6.3;
    const vibes = neonTex((x, core) => {
      x.font = 'italic 700 92px "Segoe Script","Brush Script MT","Comic Sans MS",cursive'; x.textAlign = 'center';
      if (core) x.lineWidth = 1.5;
      x.strokeText('Good', 256, 250); x.strokeText('Vibes', 256, 345); x.strokeText('Only', 256, 440);
      x.beginPath(); x.moveTo(190, 150); x.lineTo(205, 80); x.lineTo(235, 120); x.lineTo(256, 70); x.lineTo(277, 120); x.lineTo(307, 80); x.lineTo(322, 150); x.closePath(); x.stroke();   // vương miện
    });
    const corn = neonTex((x) => {
      x.beginPath(); x.moveTo(170, 210); x.lineTo(200, 450); x.lineTo(312, 450); x.lineTo(342, 210); x.closePath(); x.stroke();              // hộp bỏng ngô
      for (const xx of [220, 256, 292]) { x.beginPath(); x.moveTo(xx, 215); x.lineTo(xx + (xx - 256) * 0.15, 445); x.stroke(); }
      for (const [cx, cy, r] of [[190, 185, 34], [240, 160, 40], [295, 170, 38], [330, 200, 30], [262, 120, 30]]) { x.beginPath(); x.arc(cx, cy, r, Math.PI * 0.9, Math.PI * 2.1); x.stroke(); }
    });
    for (const [sx, tex] of [[-1, vibes], [1, corn]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), ADDM(0xffffff, 1, tex));
      m.position.set(sx * (HALL_X - 0.4), 6.2, nz); m.rotation.y = -sx * Math.PI / 2; scene.add(m);
      const l = new THREE.PointLight(0xff9a3c, 7, 6, 1.8); l.position.set(sx * (HALL_X - 1.0), 6.2, nz); scene.add(l);
    }
    // trần: ô trần sao + viền LED tím quanh ô, viền vàng ấm ngoài cùng
    const inset = 1.1, iw = HALL_X * 2 - inset * 2, id = HALL_D - inset * 2;
    for (const [w, d, x, z] of [[iw, 0.07, 0, HALL_FRONT + inset], [iw, 0.07, 0, HALL_BACK - inset], [0.07, id, -HALL_X + inset, HALL_ZC], [0.07, id, HALL_X - inset, HALL_ZC]]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(w, 0.07, d), purple); c.position.set(x, HALL_H - 0.45, z); scene.add(c);
      const glowBand = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(w, d), 0.9), ADDM(0x9a5cff, 0.14));
      glowBand.position.set(x, HALL_H - 0.3, z); if (d > w) glowBand.rotation.y = Math.PI / 2; scene.add(glowBand);
    }
    box(HALL_X * 2 - 0.4, 0.4, 0.4, 0x0b0a0e, 0, HALL_H - 0.2, HALL_FRONT + inset - 0.25);   // gờ trần
    const N = 520, pos = new Float32Array(N * 3), rng = mulberry32(9);
    for (let i = 0; i < N; i++) pos.set([(rng() * 2 - 1) * (HALL_X - inset - 0.2), HALL_H - 0.03, HALL_FRONT + inset + 0.2 + rng() * (id - 0.4)], i * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    starPts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.07, sizeAttenuation: true, transparent: true, fog: false }));
    scene.add(starPts);
    projector(SCR_Z + 9.5, HALL_H - 0.9);
    // bục dưới màn: viền LED tím, loa thanh, nến 2 bên
    const sl = new THREE.Mesh(new THREE.BoxGeometry(HALL_X * 2 - 1, 0.04, 0.04), purple); sl.position.set(0, STAGE_H - 0.04, STAGE_Z1 + 0.01); scene.add(sl);
    rb(2.2, 0.28, 0.4, 0x0b0b0c, 0, STAGE_H + 0.14, SCR_Z + 0.9, scene, 0.05);
    for (const sx of [-1, 1]) { candle(sx * 3.2, STAGE_H, SCR_Z + 1.3); candle(sx * 3.6, STAGE_H, SCR_Z + 1.1, 0.14); candle(sx * 6.4, STAGE_H, SCR_Z + 1.4, 0.18); }
    door(0, HALL_BACK - 0.05, Math.PI, 0x15121a);
  } else if (TPLC.decor === 'bedroom') {
    // Phòng chiếu riêng cho 2 người: tường nỉ tối xếp chéo, viền LED hổ phách, đèn tường hắt lên/xuống,
    // máy chiếu treo trần, kệ thấp dưới màn + nến, loa cột 2 bên, thảm lông, tab đầu giường có nến + hoa hồng
    const bed = SEAT_INFO[0], bz = bed.z, bx = bed.unitX;
    const amber = glowM(0xffae5e);
    const washTex = (() => {                                  // vệt sáng hắt lên tường (mờ dần 2 đầu)
      const c = document.createElement('canvas'); c.width = 64; c.height = 256; const x = c.getContext('2d');
      const g = x.createRadialGradient(32, 128, 2, 32, 128, 128); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, 64, 256); return new THREE.CanvasTexture(c);
    })();
    // tấm nỉ ốp tường xếp chéo nhẹ + khe LED dọc
    for (const sx of [-1, 1]) {
      for (let z = HALL_FRONT + 1.0, i = 0; z < HALL_BACK - 0.6; z += 1.7, i++) {
        const pnl = rb(0.24, HALL_H - 0.6, 1.62, i % 2 ? 0x232126 : 0x1d1b20, sx * (HALL_X - 0.14), (HALL_H - 0.6) / 2 + 0.3, z, scene, 0.05, { roughness: 1 });
        pnl.rotation.y = (i % 2 ? 0.07 : -0.07) * sx;
        if (i % 3 === 1) { const led = new THREE.Mesh(new THREE.BoxGeometry(0.04, HALL_H - 1.2, 0.05), amber); led.position.set(sx * (HALL_X - 0.27), HALL_H / 2, z + 0.85); scene.add(led); }
        if (i % 3 === 0 && z > HALL_FRONT + 2 && z < HALL_BACK - 2) {   // đèn tường hắt lên + xuống
          rb(0.3, 0.42, 0.26, 0x101012, sx * (HALL_X - 0.42), 4.6, z, scene, 0.05);
          for (const up of [1, -1]) {
            const w = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.6), ADDM(0xffb877, 0.55, washTex));
            w.position.set(sx * (HALL_X - 0.3), 4.6 + up * 1.35, z); w.rotation.y = -sx * Math.PI / 2; scene.add(w);
          }
          const l = new THREE.PointLight(0xffb16a, 6, 5, 1.8); l.position.set(sx * (HALL_X - 0.8), 4.6, z); scene.add(l);
        }
      }
      // viền LED chạy dọc mép trần + chân tường
      for (const y of [HALL_H - 0.12, 0.12]) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, HALL_D), amber); c.position.set(sx * (HALL_X - 0.3), y, HALL_ZC); scene.add(c); }
      const wash = new THREE.Mesh(new THREE.PlaneGeometry(HALL_D, 1.6), ADDM(0xffa458, 0.18)); wash.position.set(sx * (HALL_X - 0.33), HALL_H - 0.8, HALL_ZC); wash.rotation.y = -sx * Math.PI / 2; scene.add(wash);
    }
    // trần: viền LED quanh khung trần + đèn âm trần nhỏ
    for (const z of [HALL_FRONT + 0.15, HALL_BACK - 0.15]) { const c = new THREE.Mesh(new THREE.BoxGeometry(HALL_X * 2, 0.06, 0.06), amber); c.position.set(0, HALL_H - 0.12, z); scene.add(c); }
    for (const z of [HALL_FRONT + 1.6, (HALL_FRONT + HALL_BACK) / 2, HALL_BACK - 1.6]) for (const sx of [-1, 1]) {
      const d = new THREE.Mesh(new THREE.CircleGeometry(0.1, 12), glowM(0xfff0d8)); d.position.set(sx * (HALL_X - 1.4), HALL_H - 0.02, z); d.rotation.x = Math.PI / 2; scene.add(d);
    }
    // máy chiếu treo trần
    const pjZ = bz - 3.2, pj = new THREE.Group(); pj.position.set(0, HALL_H - 0.75, pjZ); scene.add(pj);
    box(0.08, 0.5, 0.08, 0x111113, 0, 0.45, 0, pj); rb(0.5, 0.06, 0.4, 0x111113, 0, 0.22, 0, pj, 0.02);
    rb(1.3, 0.42, 1.0, 0x16161a, 0, 0, 0, pj, 0.08, { roughness: 0.4, metalness: 0.3 });
    const lr = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 16), smat(0x050505)); lr.rotation.x = Math.PI / 2; lr.position.set(0.3, -0.02, -0.52); pj.add(lr);
    const ln = new THREE.Mesh(new THREE.CircleGeometry(0.11, 16), glowM(0xdce6ff)); ln.position.set(0.3, -0.02, -0.575); ln.rotation.y = Math.PI; pj.add(ln);
    // kệ thấp dưới màn: loa thanh, nến, bình hoa khô
    const cz = SCR_Z + 0.75, cw = SCR_W + 0.6;
    rb(cw, 0.75, 1.1, 0x161417, 0, 0.38, cz, scene, 0.05, { roughness: 0.5 });
    const ledC = new THREE.Mesh(new THREE.BoxGeometry(cw - 0.2, 0.03, 0.03), amber); ledC.position.set(0, 0.06, cz + 0.56); scene.add(ledC);
    rb(1.4, 0.16, 0.22, 0x0b0b0c, 0, 0.84, cz, scene, 0.05);
    for (const sx of [-1, 1]) { candle(sx * (cw / 2 - 0.5), 0.76, cz + 0.15); candle(sx * (cw / 2 - 0.85), 0.76, cz + 0.25, 0.14); }
    const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.4, 12), smat(0x2a2420)); vase.position.set(-cw / 2 + 1.5, 0.96, cz); scene.add(vase);
    for (let k = 0; k < 5; k++) { const tw = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.8, 4), smat(0x6b4a2e)); tw.position.set(-cw / 2 + 1.5 + Math.sin(k) * 0.08, 1.5, cz + Math.cos(k) * 0.05); tw.rotation.z = (k - 2) * 0.18; scene.add(tw); }
    // loa cột 2 bên màn
    for (const sx of [-1, 1]) {
      const g = new THREE.Group(); g.position.set(sx * (SCR_W / 2 + 0.75), 0, SCR_Z + 0.9); scene.add(g);
      rb(0.7, 3.1, 0.65, 0x0c0c0e, 0, 1.55, 0, g, 0.06, { roughness: 0.6 });
      for (const y of [0.7, 1.4, 2.1, 2.75]) { const r = new THREE.Mesh(new THREE.TorusGeometry(y > 2.6 ? 0.1 : 0.22, 0.03, 8, 20), smat(0x2a2a2e, { metalness: 0.6 })); r.position.set(0, y, 0.33); g.add(r); }
    }
    // thảm lông xám đậm dưới giường
    plane(HALL_X * 2 - 1.6, HALL_D * 0.62, 0x2b2a2d, bx, 0.012, bz - 1.4, -Math.PI / 2, 0).material = smat(0x2b2a2d, { roughness: 1 });
    // tab đầu giường: nến (trái), hoa hồng + tinh dầu (phải)
    for (const sx of [-1, 1]) {
      const nx = bx + sx * 2.9, nz = bz + 1.6;
      rb(1.0, 0.9, 0.9, 0x141215, nx, 0.45, nz, scene, 0.05, { roughness: 0.5 });
      if (sx < 0) { candle(nx - 0.2, 0.9, nz - 0.1); candle(nx + 0.15, 0.9, nz + 0.1, 0.15); }
      else {
        const gl = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.45, 14), smat(0xffffff, { transparent: true, opacity: 0.2, roughness: 0.05 })); gl.position.set(nx - 0.15, 1.12, nz); scene.add(gl);
        for (let k = 0; k < 9; k++) { const r = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), smat(0x8a0f1e)); r.position.set(nx - 0.15 + Math.cos(k * 0.7) * 0.13 * (k % 3) / 2, 1.5 + (k % 2) * 0.06, nz + Math.sin(k * 0.7) * 0.13 * (k % 3) / 2); scene.add(r); }
        candle(nx + 0.25, 0.9, nz + 0.15, 0.15);
      }
    }
    door(HALL_X - 1.4, HALL_BACK - 0.05, Math.PI, 0x161417);
  }
}

// ---- Nội thất: tấm ốp đứng màu than + nẹp đèn LED vàng, đèn rọi gắn tường, loa đứng, bảng tên, quả cầu disco
let discoBall = null;
// ---- Chế độ đèn bar (đủ 1/3 người trong phòng vote): quả cầu disco bắn laser nhiều màu + đèn màu nháy
let partyOn = false, partyMine = false, partyFade = 0;
var djLight = 0;                                               // 0 → 1 khi có DJ (đèn giật theo nhịp)      // partyFade: 0 → 1 mượt khi bật / tắt
const PARTY_COLORS = [0xff3d8b, 0x2ff0c8, 0x4f9dff, 0xffd23a, 0xa66bff, 0x6dff5a];
const BPM = 124;                                               // nhịp nhạc giả lập để đèn chạy theo
const PARTY_TINT = [];                                         // vật liệu đèn LED (nẹp tường, mép bậc) đổi màu theo nhịp
const LENS_MATS = [];                                          // mặt đèn rọi 2 bên
let BEAM_MAT2 = null;                                          // luồng đèn rọi nhóm 2 (khác màu nhóm 1)
const MYST = TPLC.decor === 'cinema';   // rạp lớn: màu đèn rọi / mặt đèn lấy theo phong cách                       // rạp lớn: tông ác quỷ đỏ máu / tím trầm
const LED_BASE = new THREE.Color(THEME.led), BEAM_BASE = new THREE.Color(MYST ? CT.beam : 0xffdca0), BEAM_BASE2 = new THREE.Color(MYST ? CT.beam2 : 0xffdca0), LENS_BASE = new THREE.Color(MYST ? CT.lens : 0xfff1d2), _pc = new THREE.Color();
const SPEAKERS = [];                                         // 2 loa sân khấu (cảm nhận âm lượng khi có DJ)
const MYSTIC_SPIN = [];                                      // vật thể xoay / trôi chậm (ấn chú, pha lê, bụi phép)
// vật liệu cộng sáng, không ghi alpha → không che video phía sau canvas
const ADD = { transparent: true, depthWrite: false, fog: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
  blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor };
const DOT_TEX = (() => {                                       // chấm sáng tròn mềm
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.75)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
})();
const GRAD_TEX = (() => {                                      // mờ dần theo chiều dài tia
  const c = document.createElement('canvas'); c.width = 4; c.height = 128; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, '#fff'); g.addColorStop(0.5, '#888'); g.addColorStop(1, '#000');
  x.fillStyle = g; x.fillRect(0, 0, 4, 128); return new THREE.CanvasTexture(c);
})();

// 1) Chấm sáng phản chiếu từ quả cầu gương: quét chậm khắp tường, trần, sàn, ghế (không rơi lên màn chiếu)
const MIRROR_N = 380;
const mirrorDirs = Array.from({ length: MIRROR_N }, (_, i) => {
  const y = 1 - (i + 0.5) / MIRROR_N * 2, r = Math.sqrt(1 - y * y), th = i * 2.399963;
  return new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r);
});
const mirrorDots = (() => {
  const g = new THREE.BufferGeometry(), col = new Float32Array(MIRROR_N * 3), c = new THREE.Color();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MIRROR_N * 3), 3));
  for (let i = 0; i < MIRROR_N; i++) { c.setHex(i % 5 === 0 ? PARTY_COLORS[i % PARTY_COLORS.length] : 0xfff6e8); col.set([c.r, c.g, c.b], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.0, map: DOT_TEX, vertexColors: true, opacity: 0, ...ADD }));
  pts.frustumCulled = false; pts.visible = false; scene.add(pts); return pts;
})();
function hitRoom(P, d) {                                       // khoảng cách tới mặt phòng đầu tiên theo hướng d (−1 = bỏ qua)
  let t = Infinity;
  if (d.x > 1e-4) t = Math.min(t, (HALL_X - 0.35 - P.x) / d.x); else if (d.x < -1e-4) t = Math.min(t, (-HALL_X + 0.35 - P.x) / d.x);
  if (d.y > 1e-4) t = Math.min(t, (HALL_H - 0.05 - P.y) / d.y);
  else if (d.y < -1e-4) { let tf = (0.05 - P.y) / d.y; tf = (floorY(P.z + d.z * tf, P.x + d.x * tf) + 0.06 - P.y) / d.y; t = Math.min(t, tf); }
  if (d.z > 1e-4) t = Math.min(t, (HALL_BACK - 0.1 - P.z) / d.z);
  else if (d.z < -1e-4) {
    const ts = (SCR_Z + 0.05 - P.z) / d.z, hx = P.x + d.x * ts, hy = P.y + d.y * ts;
    if (ts < t && Math.abs(hx) < SCR_W / 2 + 0.3 && Math.abs(hy - SCR_Y) < SCR_H / 2 + 0.3) return -1;
    t = Math.min(t, (HALL_FRONT + 0.1 - P.z) / d.z);
  }
  return t;
}

// 2) Tia laser khối (có lõi sáng + quầng mờ) bắn từ quả cầu, đổi kiểu quét theo nhịp, luôn hướng về phía khán giả
const LASER_N = 16;
const lasers = new THREE.Group(); lasers.visible = false;
const laserBeams = Array.from({ length: LASER_N }, (_, i) => {
  const piv = new THREE.Group(); lasers.add(piv);
  const glowMat = new THREE.MeshBasicMaterial({ color: PARTY_COLORS[i % PARTY_COLORS.length], alphaMap: GRAD_TEX, opacity: 0.3, side: THREE.DoubleSide, ...ADD });
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, alphaMap: GRAD_TEX, opacity: 0.7, side: THREE.DoubleSide, ...ADD });
  const L = 46;
  const glowM = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.42, L, 10, 1, true).translate(0, -L / 2, 0), glowMat);
  const coreM = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.05, L, 6, 1, true).translate(0, -L / 2, 0), coreMat);
  piv.add(glowM, coreM);
  return { piv, glowMat, coreMat };
});
const _dir = new THREE.Vector3(), _down = new THREE.Vector3(0, -1, 0);

// 3) Hạt sáng bay lên (từ sàn, ghế và sân khấu) rồi tan dần gần trần
const RISE_N = 520;
const rise = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RISE_N * 3), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(RISE_N * 3), 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.42, map: DOT_TEX, vertexColors: true, opacity: 0, ...ADD }));
  pts.frustumCulled = false; pts.visible = false; scene.add(pts);
  const st = Array.from({ length: RISE_N }, () => ({ x: 0, y: -999, z: 0, v: 1, ph: Math.random() * 6, c: new THREE.Color() }));
  return { pts, st };
})();
function spawnRise(q, anywhere) {
  const onStage = Math.random() < 0.3;
  q.x = onStage ? (Math.random() - 0.5) * SCR_W : (Math.random() * 2 - 1) * (HALL_X - 2);
  q.z = onStage ? STAGE_Z0 + 1 + Math.random() * 4.5 : ROW_INFO[0].z0 + Math.random() * (LAND_Z0 - ROW_INFO[0].z0 + 4);
  q.y = anywhere ? floorY(q.z, q.x) + Math.random() * (HALL_H - 6) : floorY(q.z, q.x) + 0.3;
  q.v = 1.6 + Math.random() * 3.2; q.c.setHex(PARTY_COLORS[Math.floor(Math.random() * PARTY_COLORS.length)]);
  if (Math.random() < 0.35) q.c.setHex(0xfff2d6);              // xen hạt vàng trắng như kim tuyến
}

const partyLights = PARTY_COLORS.slice(0, 3).map((c, k) => { const l = new THREE.PointLight(c, 0, 70, 1.3); l.position.set((k - 1) * 14, HALL_H - 8, 10 + k * 8); scene.add(l); return l; });

function updateParty(t, dt) {
  partyFade += ((partyOn ? 1 : 0) - partyFade) * Math.min(1, dt * 2.5);
  const f = partyFade, live = f > 0.01;
  const beat = t * BPM / 60, kick = Math.exp(-(beat % 1) * 5);   // nháy mạnh đầu mỗi nhịp rồi tắt dần
  const bar = Math.floor(beat / 4), palette = (k) => PARTY_COLORS[(bar + k) % PARTY_COLORS.length];
  const showFx = live && camMode !== 'screen';                    // góc sát màn = chỉ xem phim

  // đèn chung tối bớt, nẹp LED đổi màu theo nhịp
  HEMI.intensity = THEME.hemi[2] - 0.3 * f;
  for (let k = 0; k < PARTY_TINT.length; k++) PARTY_TINT[k].color.copy(LED_BASE).lerp(_pc.setHex(palette(k)).multiplyScalar(0.55 + 0.45 * kick), f);

  // DJ đang chơi: đèn giật theo mức âm (cùng mức với loa: nhịp video + tiếng hiệu ứng DJ)
  djLight += ((cur && cur.dj ? 1 : 0) - djLight) * Math.min(1, dt * 3);
  const dl = djLight, L = (typeof djFx === 'object' && djFx) ? djFx.level || 0 : 0;
  if (dl > 0.01) {
    const djBar = Math.floor(t * BPM / 60 * ((cur && cur.rate) || 1) / 4);
    HEMI.intensity -= dl * (0.24 - 0.2 * L);                                 // phòng tối bớt, chớp sáng mỗi nhịp
    for (let k = 0; k < PARTY_TINT.length; k++) {
      _pc.setHex((djBar + k) % 2 ? CT.a : CT.b).multiplyScalar(0.12 + 1.15 * L);
      PARTY_TINT[k].color.lerp(_pc, dl * (1 - 0.5 * f));
    }
  }

  // quả cầu: quay, lấp lánh
  if (discoBall) {
    discoBall.material.emissive.setRGB(1, 1, 1);
    discoBall.material.emissiveIntensity = f * (0.12 + 0.25 * kick) + dl * 0.35 * L;
    lasers.position.copy(discoBall.position);
  }

  // 1) chấm phản chiếu
  mirrorDots.visible = live;
  if (live && discoBall) {
    const P = discoBall.position, a = discoBall.rotation.y, ca = Math.cos(a), sa = Math.sin(a);
    const arr = mirrorDots.geometry.attributes.position.array;
    for (let i = 0; i < MIRROR_N; i++) {
      const d = mirrorDirs[i]; _dir.set(d.x * ca + d.z * sa, d.y, -d.x * sa + d.z * ca);
      const tt = hitRoom(P, _dir);
      if (tt > 0 && tt < 200) { arr[i * 3] = P.x + _dir.x * tt; arr[i * 3 + 1] = P.y + _dir.y * tt; arr[i * 3 + 2] = P.z + _dir.z * tt; }
      else arr[i * 3 + 1] = -500;
    }
    mirrorDots.geometry.attributes.position.needsUpdate = true;
    mirrorDots.material.opacity = f * (0.7 + 0.3 * Math.sin(t * 23));
  }

  // 2) laser: đổi kiểu quét mỗi 2 ô nhịp (8 phách)
  const djLas = !!djFx && performance.now() < djFx.laserUntil && camMode !== 'screen';   // DJ bấm Laser: bật laser dù chưa bật đèn bar
  lasers.visible = showFx || djLas;
  if (showFx || djLas) {
    const mode = Math.floor(beat / 8) % 3;
    laserBeams.forEach((L, i) => {
      const u = i / (LASER_N - 1) - 0.5;
      let yaw, pitch;
      if (mode === 0) { yaw = u * 1.9 + Math.sin(t * 1.3) * 0.45; pitch = 0.75 + Math.sin(t * 2.1 + i) * 0.08; }                 // quạt quét trái phải
      else if (mode === 1) { yaw = Math.sin(i * 2.4 + t * 0.9) * 1.1; pitch = 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(t * 1.7 + i * 0.8)); } // đan chéo
      else { yaw = (i % 2 ? 1 : -1) * (0.25 + Math.abs(u) * 1.5) * Math.sin(t * 1.6); pitch = 0.7 + Math.cos(t * 1.1 + i) * 0.15; }   // chữ X đối xứng
      _dir.set(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      if (_dir.z < 0.2) { _dir.z = 0.2; _dir.normalize(); }    // không bao giờ bắn về phía màn
      L.piv.quaternion.setFromUnitVectors(_down, _dir);
      L.glowMat.color.setHex(palette(i % 3));
      const lf = djLas ? Math.max(f, 1) : f;                 // laser của DJ sáng hết cỡ
      L.glowMat.opacity = lf * (0.18 + 0.22 * kick);
      L.coreMat.opacity = lf * (0.45 + 0.4 * kick);
    });
  }

  // 3) hạt bay lên
  rise.pts.visible = showFx;
  if (showFx) {
    const pa = rise.pts.geometry.attributes.position.array, ca = rise.pts.geometry.attributes.color.array;
    for (let i = 0; i < RISE_N; i++) {
      const q = rise.st[i];
      if (q.y < -100) spawnRise(q, true);
      q.y += q.v * dt; q.x += Math.sin(t * 1.4 + q.ph) * 0.4 * dt; q.z += Math.cos(t * 1.1 + q.ph) * 0.25 * dt;
      if (q.y > HALL_H - 2.5) spawnRise(q, false);
      const fade = Math.min(1, (HALL_H - 2.5 - q.y) / 8) * (0.6 + 0.4 * Math.sin(t * 6 + q.ph * 3));
      pa[i * 3] = q.x; pa[i * 3 + 1] = q.y; pa[i * 3 + 2] = q.z;
      ca[i * 3] = q.c.r * fade; ca[i * 3 + 1] = q.c.g * fade; ca[i * 3 + 2] = q.c.b * fade;
    }
    rise.pts.geometry.attributes.position.needsUpdate = true; rise.pts.geometry.attributes.color.needsUpdate = true;
    rise.pts.material.opacity = f;
  }

  // đèn màu trong phòng nháy theo nhịp
  partyLights.forEach((l, k) => { l.intensity = Math.max(f * 55 * (0.3 + 0.7 * kick), dl * 70 * L); l.color.setHex(f > 0.5 ? palette(k * 2) : (k % 2 ? CT.a : CT.b)); });   // hắt màu nhẹ, không nhuộm cả phòng

  // đèn rọi 2 bên: cùng nhịp, quét đối xứng, 2 nhóm 2 màu, chớp sáng đầu mỗi phách
  const swing = Math.sin(beat * Math.PI / 2), tilt = Math.cos(beat * Math.PI / 4);
  for (const b of beams) {
    const u = b.userData, sx = u.baseZ > 0 ? -1 : 1;
    const calmZ = u.baseZ + Math.sin(t * 0.35 + u.phase) * 0.12, calmX = -0.45 + Math.sin(t * 0.27 + u.phase * 1.3) * 0.18;
    const partyZ = u.baseZ - sx * swing * 0.38, partyX = -0.45 + tilt * 0.4;
    const w = Math.max(f, dl * 0.85);                                        // có DJ: đèn rọi quét như lúc bật đèn bar
    b.rotation.z = calmZ + (partyZ - calmZ) * w; b.rotation.x = calmX + (partyX - calmX) * w;
  }
  if (BEAM_MAT) {
    BEAM_MAT.color.copy(BEAM_BASE).lerp(_pc.setHex(palette(0)), f);
    if (BEAM_MAT2) BEAM_MAT2.color.copy(BEAM_BASE2).lerp(_pc.setHex(palette(3)), f);
    const op = Math.min(0.55, 0.12 + f * (0.06 + 0.22 * kick) + dl * (0.04 + 0.32 * L));
    BEAM_MAT.opacity = op; if (BEAM_MAT2) BEAM_MAT2.opacity = op;
  }
  LENS_MATS.forEach((m, k) => m.color.copy(LENS_BASE).lerp(_pc.setHex(palette(k % 2 ? 3 : 0)), Math.max(f, dl * L)));
}
// Đèn bar chỉ bật 1 phút: nút hiện đếm ngược
let partyEndAt = 0;
function renderPartyLabel() {
  const left = Math.ceil((partyEndAt - Date.now()) / 1000);
  $('partyLbl').textContent = partyOn && left > 0 ? `Đèn bar: ${left}s` : 'Đèn bar';
}
setInterval(() => { if (partyOn) renderPartyLabel(); }, 500);
function applyParty(p) {
  if (!p) return;
  const was = partyOn;
  partyOn = !!p.on; partyMine = Array.isArray(p.ids) && p.ids.includes(myId);
  partyEndAt = partyOn ? Date.now() + (p.left || 0) : 0;
  renderPartyLabel();
  const b = $('pBadge'); b.textContent = `${p.votes}/${p.need}`; b.classList.add('show');
  $('dParty').classList.toggle('active', partyMine); $('dParty').classList.toggle('party-on', partyOn);
  if (partyOn && !was) toast('Đèn bar bật trong 1 phút! Quẩy lên nào');
  else if (!partyOn && was) toast('Đèn bar đã tắt — vote lại để bật tiếp');
}
// Luồng sáng đèn rọi: nón rỗng mờ dần từ đèn xuống, cộng sáng (không ghi alpha → không che video)
const beams = [];
const BEAM_LEN = 22;
const BEAM_GEO = new THREE.ConeGeometry(2.6, BEAM_LEN, 28, 1, true).translate(0, -BEAM_LEN / 2, 0);
const BEAM_MAT = (() => {
  const c = document.createElement('canvas'); c.width = 4; c.height = 128; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, '#fff'); g.addColorStop(0.35, '#777'); g.addColorStop(1, '#000');
  x.fillStyle = g; x.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(c);
  return new THREE.MeshBasicMaterial({ color: 0xffdca0, alphaMap: t, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, fog: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });
})();
if (TPLC.decor === 'cinema') {
  // ===== Rạp lớn phong cách ÁC QUỶ: băng rôn phù văn phát sáng đỏ máu / tím trầm, ấn chú trên trần, đèn pha lê, loa line-array =====
  const glow = (color) => new THREE.MeshBasicMaterial({ color });
  BEAM_MAT.color.copy(BEAM_BASE); BEAM_MAT2 = BEAM_MAT.clone(); BEAM_MAT2.color.copy(BEAM_BASE2);
  const tealLed = glow(CT.a2); PARTY_TINT.push(tealLed);   // 2 màu đèn nhấn của phong cách (loa, viền...)
  const violet = glow(CT.b);
  let styleOpt = {};
  if (CS_ID !== 'demon') {
    // phong cách khác: tải module trang trí riêng
    const ADD = { transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor };
    const ctx = { THREE, scene, RoundedBoxGeometry, rb, box, mat, smat, glow, floorY, cssHex, accA: tealLed, accB: violet, ADD,
      HALL_X, HALL_H, HALL_FRONT, HALL_BACK, HALL_D, HALL_ZC, SCR_W, SCR_H, SCR_Y, SCR_Z, STAGE_H, STAGE_Z0, STAGE_Z1,
      AISLE_X, AISLE_W, SIDE_X0, LAND_Z0, TOP_H, TPLC, CS: CT, SPIN: MYSTIC_SPIN, PARTY_TINT };
    try { const mod = await import('/styles/' + CS_ID + '.js'); styleOpt = (await mod.default(ctx)) || {}; }
    catch (e) { console.error('Không tải được phong cách rạp', CS_ID, e); }
  } else {
  const RUNES = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
  // vẽ 1 ấn chú tròn (vòng tròn đồng tâm + đa giác sao + phù văn quanh vòng)
  const sigil = (x, cx, cy, R, col, n = 6, seed = 1) => {
    x.save(); x.translate(cx, cy); x.strokeStyle = col; x.fillStyle = col; x.shadowColor = col; x.shadowBlur = R * 0.12; x.lineWidth = Math.max(2, R * 0.025);
    for (const k of [1, 0.86, 0.5]) { x.beginPath(); x.arc(0, 0, R * k, 0, Math.PI * 2); x.stroke(); }
    x.beginPath(); for (let i = 0; i <= n * 2; i++) { const a = (i * 2 * Math.PI * (n === 5 ? 2 : 1)) / (n === 5 ? 5 : n) - Math.PI / 2; const px = Math.cos(a) * R * 0.86, py = Math.sin(a) * R * 0.86; i ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke();
    if (n === 6) { x.beginPath(); for (let i = 0; i <= 3; i++) { const a = i * 2 * Math.PI / 3 + Math.PI / 2; const px = Math.cos(a) * R * 0.86, py = Math.sin(a) * R * 0.86; i ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke(); }
    x.font = `${Math.round(R * 0.11)}px serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; x.save(); x.rotate(a); x.fillText(RUNES[(i * 7 + seed * 3) % RUNES.length], 0, -R * 0.93); x.restore(); }
    x.beginPath(); x.ellipse(0, 0, R * 0.22, R * 0.12, 0, 0, Math.PI * 2); x.stroke(); x.beginPath(); x.arc(0, 0, R * 0.06, 0, Math.PI * 2); x.fill();   // con mắt giữa ấn
    x.restore();
  };
  // băng rôn phù văn trên tường (3 kiểu luân phiên)
  const bannerTex = (seed) => {
    const W = 256, H = 2048, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, CT.grad[0]); g.addColorStop(0.5, seed % 2 ? CT.grad[1] : CT.grad[2]); g.addColorStop(1, CT.grad[3]);
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    const A = seed % 2 ? cssHex(CT.b2) : cssHex(CT.a), B = seed % 2 ? cssHex(CT.a) : cssHex(CT.b2);
    x.strokeStyle = A; x.shadowColor = A; x.shadowBlur = 10; x.lineWidth = 3; x.strokeRect(14, 14, W - 28, H - 28); x.lineWidth = 1.5; x.strokeRect(24, 24, W - 48, H - 48);
    sigil(x, W / 2, 330, 100, A, 5, seed);   // ngôi sao năm cánh
    sigil(x, W / 2, 1450, 80, B, 6, seed + 4);
    x.shadowBlur = 8; x.fillStyle = B; x.shadowColor = B; x.font = '34px serif'; x.textAlign = 'center';
    for (let i = 0; i < 14; i++) x.fillText(RUNES[(i * 5 + seed) % RUNES.length], W / 2 + (i % 2 ? 26 : -26), 560 + i * 54);
    x.strokeStyle = A; x.shadowColor = A; x.lineWidth = 2; x.beginPath(); x.moveTo(W / 2, 1620); x.lineTo(W / 2, 1960); x.stroke();
    for (let i = 0; i < 5; i++) { x.beginPath(); x.moveTo(W / 2 - 40 + i * 4, 1660 + i * 60); x.lineTo(W / 2 + 40 - i * 4, 1660 + i * 60); x.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  };
  const bannerMats = [0, 1, 2].map((s) => new THREE.MeshBasicMaterial({ map: bannerTex(s + 1), color: CT.banner }));
  const panelH = HALL_H - 1.2;
  for (const sx of [-1, 1]) {
    for (let z = HALL_FRONT + 2.4, i = 0; z < HALL_BACK - 1.5; z += 4.2, i++) {
      rb(0.3, panelH, 3.6, 0x12060b, sx * (HALL_X - 0.16), panelH / 2 + 0.2, z, scene, 0.08);                     // khung tối
      const b = new THREE.Mesh(new THREE.PlaneGeometry(3.0, panelH - 1.6), bannerMats[(i + (sx > 0 ? 1 : 0)) % 3]);  // băng rôn phù văn
      b.position.set(sx * (HALL_X - 0.33), panelH / 2 + 0.3, z); b.rotation.y = -sx * Math.PI / 2; scene.add(b);
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.06, panelH - 2, 0.07), i % 2 ? violet : tealLed);         // nẹp neon đứng
      led.position.set(sx * (HALL_X - 0.26), panelH / 2 + 0.4, z + 2.1); scene.add(led);
      if (i % 2 === 0) {                                                                                         // đèn rọi
        const g = new THREE.Group(); g.position.set(sx * (HALL_X - 0.9), HALL_H - 4.5, z); scene.add(g);
        rb(0.18, 0.7, 0.18, 0x120609, sx * 0.45, 0.25, 0, g, 0.05);
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 1.0, 16), smat(0x1a0a10, { metalness: 0.6 }));
        body.rotation.z = sx * 0.9; g.add(body);
        const lens = new THREE.Mesh(new THREE.CircleGeometry(0.34, 16), glow(CT.lens)); LENS_MATS.push(lens.material);
        lens.position.set(-sx * 0.42, -0.31, 0); lens.rotation.set(0, -sx * Math.PI / 2, 0); lens.rotateX(-0.9); g.add(lens);
        if (z > 6) {                                       // đèn gần màn không có luồng sáng → không bao giờ đè lên màn chiếu
          const pivot = new THREE.Group(); pivot.position.copy(lens.position); g.add(pivot);
          const beam = new THREE.Mesh(BEAM_GEO, beams.length % 2 ? BEAM_MAT2 : BEAM_MAT); pivot.add(beam);
          pivot.userData = { baseZ: -sx * 0.62, phase: i * 1.7 + (sx > 0 ? 1 : 0) };
          beams.push(pivot);
        }
      }
    }
    const cove = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, HALL_D - 2), tealLed);                         // dải neon dọc mép trần
    cove.position.set(sx * (HALL_X - 0.35), HALL_H - 0.6, HALL_ZC); scene.add(cove);
    const cove2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, HALL_D - 2), violet);
    cove2.position.set(sx * (HALL_X - 0.35), 0.35, HALL_ZC); scene.add(cove2);
  }
  for (const [x, z, c] of [[-HALL_X + 3, 2, CT.a], [HALL_X - 3, 2, CT.b], [-HALL_X + 3, 22, CT.b], [HALL_X - 3, 22, CT.a]]) {
    const l = new THREE.PointLight(c, 80, 26, 1.8); l.position.set(x, 15, z); scene.add(l);
  }
  // ấn chú lớn phát sáng trên trần (xoay chậm)
  {
    const c = document.createElement('canvas'); c.width = c.height = 1024; const x = c.getContext('2d');
    sigil(x, 512, 512, 470, cssHex(CT.a), 5, 3); sigil(x, 512, 512, 230, cssHex(CT.b2), 6, 9);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor }));
    m.position.set(0, HALL_H - 0.25, HALL_ZC + 4); m.rotation.x = Math.PI / 2; m.userData.spin = 0.05; scene.add(m); MYSTIC_SPIN.push(m);
    const m2 = new THREE.Mesh(new THREE.PlaneGeometry(SCR_W * 0.7, SCR_W * 0.7), m.material); m2.position.set(0, STAGE_H + 0.03, (TPLC.stage.z0 + TPLC.stage.z1) / 2); m2.rotation.x = -Math.PI / 2;   // ấn chú mờ trên sân khấu
    m2.scale.set(1, 0.3, 1); m2.userData.spin = -0.08; scene.add(m2); MYSTIC_SPIN.push(m2);
  }
  // bụi phép phát sáng lơ lửng trong không khí
  {
    const N = 260, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), cA = new THREE.Color(CT.a), cB = new THREE.Color(CT.b2);
    for (let i = 0; i < N; i++) { pos.set([(Math.random() * 2 - 1) * (HALL_X - 1), 3 + Math.random() * (HALL_H - 5), HALL_FRONT + Math.random() * (HALL_BACK - HALL_FRONT)], i * 3); col.set((i % 2 ? cA : cB).toArray(), i * 3); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor }));   // cộng sáng nhưng không ghi alpha → không che video
    pts.userData.motes = true; scene.add(pts); MYSTIC_SPIN.push(pts);
  }
  // đèn pha lê trên trụ đá ở 2 đầu lối đi (gần sân khấu + cuối rạp)
  for (const [x, z] of [[-AISLE_X, TPLC.z0 - 1.2], [AISLE_X, TPLC.z0 - 1.2], [-AISLE_X - 1.6, LAND_Z0 + 1.5], [AISLE_X + 1.6, LAND_Z0 + 1.5]]) {
    const g = new THREE.Group(); g.position.set(x, floorY(z, x), z); scene.add(g);
    const stone = smat(0x1e0c12, { roughness: 0.6, metalness: 0.2 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 0.35, 8), stone); base.position.y = 0.18; g.add(base);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.5, 8), stone); col.position.y = 1.1; g.add(col);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.25, 0.3, 8), stone); cup.position.y = 1.95; g.add(cup);
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), new THREE.MeshStandardMaterial({ color: CT.crystal, emissive: CT.a2, emissiveIntensity: 1.6, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.9 }));
    crystal.position.y = 2.65; crystal.scale.y = 1.6; crystal.userData.spin = 0.6; crystal.userData.bob = 2.65; g.add(crystal); MYSTIC_SPIN.push(crystal);
    for (let k = 0; k < 3; k++) { const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), crystal.material); const a = k / 3 * Math.PI * 2; s.position.set(Math.cos(a) * 0.4, 2.15, Math.sin(a) * 0.4); s.scale.y = 1.8; g.add(s); }
    const l = new THREE.PointLight(CT.a, 18, 7, 2); l.position.y = 2.7; g.add(l);
  }
  // viền neon mép sân khấu
  { const e = new THREE.Mesh(new THREE.BoxGeometry(SCR_W + 6, 0.06, 0.06), tealLed); e.position.set(0, STAGE_H + 0.03, TPLC.stage.z1 + 0.02); scene.add(e); }
  }   // hết phong cách ác quỷ

  // Loa line-array 2 bên màn: thân bo vát, mặt lưới, 2 loa trầm có vòng sáng, loa treble họng kèn, cụm line-array treo phía trên
  const grille = (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 256; const x = c.getContext('2d'); x.fillStyle = '#0a0305'; x.fillRect(0, 0, 128, 256); x.fillStyle = '#2a0e14';
    for (let yy = 4; yy < 256; yy += 8) for (let xx = (yy / 8) % 2 ? 8 : 4; xx < 128; xx += 8) { x.beginPath(); x.arc(xx, yy, 2.2, 0, Math.PI * 2); x.fill(); } const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 4); return t; })();
  // Loa nằm trong SPEAKERS: khi có DJ, loa đổi sang chế độ "cảm nhận âm lượng": cột đèn VU, màng loa bơm, thân loa nảy theo xung, vòng sóng dưới chân
  for (const sx of [-1, 1]) {
    const g = new THREE.Group(); g.position.set(sx * (SCR_W / 2 + 2.4), STAGE_H, -9.6); g.rotation.y = -sx * 0.14; scene.add(g);
    g.visible = styleOpt.speakers !== false;                                                                           // phong cách không có loa: chỉ hiện khi có DJ
    const cab = smat(styleOpt.cab || 0x120609, { roughness: 0.45, metalness: 0.35 }), metal = smat(styleOpt.metal || 0x3a1a22, { metalness: 0.8, roughness: 0.3 });
    rb(3.0, 0.5, 2.6, styleOpt.cab || 0x1c0b11, 0, 0.25, 0, g, 0.1, { metalness: 0.4 });                                          // đế (đứng yên)
    const strip = new THREE.Mesh(new THREE.BoxGeometry(3.02, 0.05, 2.62), tealLed); strip.position.y = 0.52; g.add(strip);
    const up = new THREE.Group(); up.position.y = 0.55; g.add(up);                                                     // thân loa: nảy lên theo xung
    const Y = (y) => y - 0.55;
    const body = new THREE.Mesh(new RoundedBoxGeometry(2.5, 8.2, 2.1, 4, 0.28), cab); body.position.y = Y(4.65); up.add(body);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 7.7), new THREE.MeshStandardMaterial({ map: grille, roughness: 0.9, metalness: 0.1 })); face.position.set(0, Y(4.65), 1.06); up.add(face);
    const edges = [];
    for (const sx2 of [-1, 1]) { const edge = new THREE.Mesh(new THREE.BoxGeometry(0.05, 7.9, 0.05), violet); edge.position.set(sx2 * 1.26, Y(4.65), 1.02); up.add(edge); edges.push(edge); }   // viền sáng 2 cạnh
    const woofers = [];
    for (const y of [2.2, 4.4]) {                                                                                      // 2 loa trầm
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.1, 10, 36), metal); ring.position.set(0, Y(y), 1.1); up.add(ring);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.025, 6, 48), tealLed); halo.position.set(0, Y(y), 1.12); up.add(halo);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.82, 0.35, 36, 1, true), smat(0x08090d, { roughness: 0.95, side: THREE.DoubleSide })); cone.rotation.x = -Math.PI / 2; cone.position.set(0, Y(y), 1.0); up.add(cone);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 10), metal); cap.position.set(0, Y(y), 0.98); cap.scale.z = 0.5; up.add(cap);
      woofers.push({ halo, cone, cap });
    }
    const horn = new THREE.Mesh(new RoundedBoxGeometry(1.5, 0.75, 0.3, 3, 0.12), metal); horn.position.set(0, Y(6.3), 1.1); up.add(horn);   // treble họng kèn
    const throat = new THREE.Mesh(new RoundedBoxGeometry(1.2, 0.5, 0.2, 3, 0.1), smat(0x050608)); throat.position.set(0, Y(6.3), 1.2); up.add(throat);
    const logo = new THREE.Mesh(new THREE.CircleGeometry(0.22, 24), violet); logo.position.set(0, Y(7.75), 1.08); up.add(logo);
    // cột đèn VU 2 cạnh (chỉ hiện khi có DJ): xanh → vàng → đỏ, sáng theo mức âm
    const vu = new THREE.Group(); vu.visible = false; up.add(vu); const segs = [];
    const VU_N = 16;
    for (const sx2 of [-1, 1]) for (let i = 0; i < VU_N; i++) {
      const col = new THREE.Color(i < VU_N * 0.55 ? 0x2bff88 : i < VU_N * 0.82 ? 0xffd23f : 0xff2a3d);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.34, 0.05), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(0.12) }));
      m.position.set(sx2 * 1.17, Y(1.05 + i * 0.46), 1.1); vu.add(m); segs.push({ m, col, i });
    }
    const top = new THREE.Mesh(new THREE.CircleGeometry(1.4, 32), new THREE.MeshBasicMaterial({ color: CT.a, opacity: 0, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor }));
    top.position.set(0, Y(8.9), 0.2); up.add(top);                                                                    // loé sáng trên nóc loa khi xung mạnh
    const wave = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.6, 48), new THREE.MeshBasicMaterial({ color: CT.a, opacity: 0, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor }));
    wave.rotation.x = -Math.PI / 2; wave.position.y = 0.06; g.add(wave);                                             // vòng sóng lan ra dưới chân
    const arr = new THREE.Group(); arr.position.set(0, 13.2, 0.4); g.add(arr);                                          // cụm line-array treo cong chữ J
    for (let k = 0; k < 5; k++) { const m = new THREE.Mesh(new RoundedBoxGeometry(2.4, 0.62, 1.4, 3, 0.1), cab); m.position.set(0, -k * 0.66, k * k * 0.035); m.rotation.x = k * 0.07; arr.add(m);
      const l = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.05, 0.02), k % 2 ? violet : tealLed); l.position.set(0, -k * 0.66, 0.71 + k * k * 0.035); l.rotation.x = k * 0.07; arr.add(l); }
    for (const sx2 of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 4, 4), mat(0x222228)); w.position.set(sx2 * 0.9, 2.1, 0); arr.add(w); }
    SPEAKERS.push({ g, up, woofers, edges, vu, segs, VU_N, top, wave, arr, base: styleOpt.speakers !== false, waveT: 1, sx });
  }

  // Quả cầu disco trên trần (xoay chậm)
  {
    discoBall = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2, 3), new THREE.MeshStandardMaterial({ color: 0xe4e7ee, metalness: 1, roughness: 0.12, flatShading: true, emissive: 0x000000 }));   // quả cầu gương nhiều mặt
    discoBall.position.set(0, HALL_H - 3.2, -2); scene.add(discoBall); scene.add(lasers);
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.1, 4), mat(0x222226));
    wire.position.set(0, HALL_H - 1.05, -2); scene.add(wire);
  }

  // Tường sau: cửa sổ phòng máy chiếu + cửa ra vào
  plane(5, 2, 0xfff4dc, 0, TOP_H + 12, HALL_BACK - 0.16, 0, Math.PI, { emissive: 0xfff0d0, emissiveIntensity: 1 });
  plane(3.6, 4.6, 0x1a1a1d, 0, TOP_H + 2.3, HALL_BACK - 0.16, 0, Math.PI);

  // Biển "LỐI RA" xanh lá (nhỏ, tinh tế)
  const exitTex = textTexture('LỐI RA  EXIT', 512, 128, '800 60px system-ui,sans-serif', '#eafff0', '#0c7a36');
  const exitMat = new THREE.MeshBasicMaterial({ map: exitTex });
  const sign = (x, y, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.5), exitMat); m.position.set(x, y, z); m.rotation.y = ry; scene.add(m); };
  for (const sx of [-1, 1]) {
    box(0.2, 4.6, 3.2, 0x1a1a1d, sx * (HALL_X - 0.34), 2.3, -4.4);                      // cửa phụ phía trước
    sign(sx * (HALL_X - 0.46), 5.3, -4.4, -sx * Math.PI / 2);
  }
  sign(0, TOP_H + 5.3, HALL_BACK - 0.2, Math.PI);
}

buildThemeDecor();
sortHallDecor();

// ---- Mô hình các loại ghế (đơn vị chưa scale). Mỗi bộ phận:
//   hinge 'back' = lưng ghế, xoay quanh khớp sau mặt ngồi (ngả lưng); hinge 'leg' = gác chân, gập xuống ↔ bật ngang.
//   color 'state' = đổi màu theo trạng thái (trống / có người / ghế của bạn); unit = dùng chung cho cả ghế đôi / giường đôi.
const RB = (w, h, d, r = 0.1) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
const M = (parts) => mergeGeometries(parts);
const HINGE = { back: new THREE.Vector3(0, 0.95, 0.33), leg: new THREE.Vector3(0, 0.95, -0.5) };
const LEG_FOLD = 1.45;    // gác chân gập xuống gần thẳng đứng khi không dùng
const SEAT_MODELS = {
  regular: [
    { geo: RB(0.96, 0.2, 0.9, 0.07).translate(0, 0.85, -0.02), color: 'state' },
    { geo: M([RB(0.96, 1.3, 0.22, 0.08).translate(0, 0.7, 0.11), RB(0.8, 0.16, 0.24, 0.06).translate(0, 1.42, 0.12)]), hinge: 'back', color: 'state' },
    { geo: RB(1.0, 1.4, 0.06, 0.02).translate(0, 0.72, 0.25), hinge: 'back', color: 0x141417 },
    { geo: M([RB(0.12, 0.12, 0.95, 0.04).translate(-0.58, 1.3, 0), RB(0.12, 0.12, 0.95, 0.04).translate(0.58, 1.3, 0),
      RB(0.1, 0.55, 0.14, 0.03).translate(-0.58, 1.0, -0.05), RB(0.1, 0.55, 0.14, 0.03).translate(0.58, 1.0, -0.05),
      RB(0.86, 0.75, 0.7, 0.08).translate(0, 0.38, 0.08)]), color: 0x141417 },
  ],
  leather: [
    { geo: RB(1.06, 0.34, 1.0, 0.12).translate(0, 0.78, 0), color: 'state', o: { roughness: 0.45 } },
    { geo: M([RB(1.06, 1.35, 0.4, 0.14).translate(0, 0.72, 0.2), RB(0.86, 0.3, 0.3, 0.12).translate(0, 1.48, 0.12)]), hinge: 'back', color: 'state', o: { roughness: 0.45 } },
    { geo: RB(1.0, 0.26, 0.95, 0.1).translate(0, -0.13, -0.475), hinge: 'leg', color: 'state', o: { roughness: 0.45 } },
    { geo: M([RB(0.24, 0.72, 1.12, 0.1).translate(-0.66, 0.92, 0.04), RB(0.24, 0.72, 1.12, 0.1).translate(0.66, 0.92, 0.04),
      RB(1.5, 0.5, 1.15, 0.1).translate(0, 0.25, 0.08)]), color: 0x2a1b13, o: { roughness: 0.45, metalness: 0.1 } },
  ],
  couple: [
    { geo: RB(1.15, 0.32, 1.05, 0.12).translate(0, 0.79, -0.02), color: 'state' },
    { geo: RB(1.12, 1.25, 0.3, 0.12).translate(0, 0.68, 0.15), hinge: 'back', color: 'state' },
    { geo: RB(1.1, 0.26, 0.95, 0.1).translate(0, -0.13, -0.475), hinge: 'leg', color: 'state' },
    { geo: M([RB(2.6, 0.5, 1.2, 0.1).translate(0, 0.27, 0.05), RB(0.3, 0.8, 1.25, 0.12).translate(-1.28, 0.95, 0.05),
      RB(0.3, 0.8, 1.25, 0.12).translate(1.28, 0.95, 0.05), RB(2.86, 0.5, 0.24, 0.1).translate(0, 0.75, 0.72)]), unit: true, color: 0x1d1418 },
  ],
  sofa: [
    { geo: RB(1.15, 0.34, 1.1, 0.14).translate(0, 0.78, -0.02), color: 'state', o: { roughness: 1 } },
    { geo: RB(1.12, 1.15, 0.36, 0.16).translate(0, 0.62, 0.18), hinge: 'back', color: 'state', o: { roughness: 1 } },
    { geo: M([RB(2.7, 0.5, 1.25, 0.12).translate(0, 0.27, 0.05), RB(0.34, 0.85, 1.3, 0.16).translate(-1.3, 0.95, 0.05),
      RB(0.34, 0.85, 1.3, 0.16).translate(1.3, 0.95, 0.05), RB(2.94, 0.55, 0.3, 0.12).translate(0, 0.78, 0.74)]), unit: true, color: 0x2a2629, o: { roughness: 1 } },
    { geo: M([RB(0.5, 0.42, 0.18, 0.12).rotateZ(0.15).translate(-1.0, 1.25, 0.45), RB(0.5, 0.42, 0.18, 0.12).rotateZ(-0.15).translate(1.0, 1.25, 0.45)]), unit: true, color: 0x6b5f63, o: { roughness: 1 } },   // gối tựa
    { geo: RB(2.7, 0.09, 0.85, 0.04).translate(0, 0.66, -1.54), unit: true, color: 0x3b2a1e, o: { roughness: 0.5 } },        // mặt bàn trà gỗ
    { geo: RB(2.3, 0.6, 0.65, 0.05).translate(0, 0.31, -1.54), unit: true, color: 0x1e1814 },                              // chân bàn
    { geo: M([RB(0.22, 0.04, 0.22, 0.01).translate(0.95, 0.72, -1.54), RB(0.22, 0.04, 0.22, 0.01).translate(0.95, 1.06, -1.54),
      ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => RB(0.025, 0.34, 0.025, 0.008).translate(0.95 + a * 0.1, 0.89, -1.54 + b * 0.1))]), unit: true, color: 0x111111 },   // khung đèn lồng
    { geo: RB(0.17, 0.28, 0.17, 0.03).translate(0.95, 0.88, -1.54), unit: true, color: 0xffd08a, o: { emissive: 0xffa040, emissiveIntensity: 1.6 } },   // ánh nến trong lồng
  ],
  bed: [
    { geo: RB(1.25, 0.12, 1.7, 0.05).translate(0, 1.3, -0.85), color: 'state' },                                    // chăn
    { geo: RB(1.42, 0.45, 3.2, 0.12).translate(0, 0.72, -0.05), color: 0xc4c7ce },                                  // nệm
    { geo: M([RB(1.3, 1.6, 0.18, 0.08).translate(0, 0.82, 0.09), RB(1.0, 0.34, 0.5, 0.15).translate(0, 1.32, -0.18)]), hinge: 'back', color: 0xb9bcc4 }, // tựa lưng nâng hạ + gối
    { geo: RB(3.0, 0.5, 3.7, 0.06).translate(0, 0.25, 0.05), unit: true, color: 0x4a3222, o: { roughness: 0.55 } },        // khung gỗ
    { geo: RB(3.0, 2.2, 0.35, 0.12).translate(0, 1.6, 2.0), unit: true, color: 0x18181b, o: { roughness: 0.4 } },          // đầu giường bọc da
    { geo: M([RB(0.1, 1.0, 3.7, 0.03).translate(-1.55, 0.95, 0.05), RB(0.1, 1.0, 3.7, 0.03).translate(1.55, 0.95, 0.05)]), unit: true, color: 0x5a3d28, o: { roughness: 0.5 } },
  ],
};
// Khay để đồ ăn ở mỗi chỗ (đơn vị chưa scale, toạ độ theo ghế): ghế thường / da / đôi = khay gắn tay vịn phải xoay vào trước mặt,
// giường = bàn nhỏ có chân đặt trên chăn. Nhân viên mang món tới sẽ đặt lên khay này.
const TRAY = {
  regular: { x: 0.18, y: 1.46, z: -0.62, w: 0.52, d: 0.38, armX: 0.58 },
  leather: { x: 0.18, y: 1.4,  z: -0.68, w: 0.52, d: 0.38, armX: 0.66 },
  couple:  { x: 0.12, y: 1.45, z: -0.66, w: 0.52, d: 0.38, armX: 0.6 },
  bed:     { x: 0,    y: 1.52, z: -0.95, w: 0.9,  d: 0.42, legs: true },
  sofa:    { x: -0.05, y: 0.67, z: -1.54, w: 0.75, d: 0.6, none: true },   // món đặt lên bàn trà phía trước
};
if (TPLC.decor === 'bedroom') TRAY.bed.y = 1.25;          // phòng đôi: món đặt thẳng lên chăn, không dựng bàn
if (TPLC.decor === 'lounge') TRAY.leather = { x: 0.66, y: 1.3, z: -0.1, w: 0.3, d: 0.9 };   // phòng VIP: món đặt trên tay vịn phải
for (const [type, T] of Object.entries(TRAY)) {
  if (TPLC.decor === 'bedroom' && type === 'bed') continue;
  if (TPLC.decor === 'lounge' && type === 'leather') continue;
  if (T.none) continue;                                    // sofa: đã có bàn trà
  SEAT_MODELS[type].push({ geo: RB(T.w, 0.035, T.d, 0.015).translate(T.x, T.y, T.z), color: 0x2b2b31, o: { roughness: 0.4, metalness: 0.3 } });
  SEAT_MODELS[type].push({ geo: RB(T.w + 0.025, 0.014, T.d + 0.025, 0.006).translate(T.x, T.y + 0.004, T.z), color: 0xc9a24a, o: { metalness: 0.7, roughness: 0.35 } });  // viền vàng
  if (T.legs) {
    const parts = [];
    for (const lx of [-1, 1]) for (const lz of [-1, 1]) parts.push(RB(0.04, T.y - 0.95, 0.04, 0.015).translate(T.x + lx * (T.w / 2 - 0.05), (T.y + 0.95) / 2, T.z + lz * (T.d / 2 - 0.05)));
    SEAT_MODELS[type].push({ geo: M(parts), color: 0x5a3d28 });
  } else {
    const edge = T.x + T.w / 2, len = T.armX - edge + 0.04;
    SEAT_MODELS[type].push({ geo: M([RB(len, 0.035, 0.06, 0.012).translate(edge + len / 2 - 0.02, T.y - 0.035, T.z),
      RB(0.045, 0.22, 0.045, 0.015).translate(T.armX, T.y - 0.14, T.z)]), color: 0x1b1b1f, o: { metalness: 0.4 } });
  }
}
if (TPLC.decor === 'bedroom') {
  SEAT_TYPES.bed.color = 0x3f0f1a;                          // khăn phủ đỏ rượu (đổi màu theo trạng thái)
  const B = SEAT_MODELS.bed;
  B[0].geo = RB(1.5, 0.1, 1.05, 0.05).translate(0, 1.27, -1.15);   // khăn phủ ngang cuối giường (thấy được chăn xám phía trên)
  B[1].color = 0x2f2d33;                                     // chăn / nệm xám than
  B[2].color = 0x6a1a2a;                                     // tựa lưng + gối nhung đỏ rượu
  B[3].color = 0x141316; B[4].color = 0x1d1b1f;              // khung + đầu giường bọc nỉ tối
  B.splice(5, 1);                                            // bỏ vách gỗ ngăn giường
}
if (TPLC.decor === 'lounge') {
  SEAT_TYPES.leather.color = 0x241f27;                      // da đen ánh tím
  const L = SEAT_MODELS.leather;
  L[3].color = 0x141216;                                     // khung + tay vịn đen
  L.push({ geo: M([new THREE.TorusGeometry(0.09, 0.02, 8, 20).rotateX(Math.PI / 2).translate(-0.66, 1.29, -0.3),
    new THREE.TorusGeometry(0.09, 0.02, 8, 20).rotateX(Math.PI / 2).translate(0.66, 1.29, -0.3)]), color: 0xffd9a0, o: { emissive: 0xffb860, emissiveIntensity: 1.2 } });   // đèn ly ở tay vịn
}
const CH = { mine: new THREE.Color(TPLC.decor === 'bedroom' ? 0x5c1526 : TPLC.decor === 'lounge' ? 0x5b3a8c : 0xd9a432), hover: new THREE.Color(0xf5b942) };
const danceRings = DANCE_SPOTS.map((sp) => {
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.05, 40), new THREE.MeshBasicMaterial({ color: 0xff5fa2, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(sp.x, STAGE_H + 0.02, sp.z); scene.add(ring);
  const pad = new THREE.Mesh(new THREE.CircleGeometry(0.85, 40), new THREE.MeshBasicMaterial({ color: 0xff5fa2, transparent: true, opacity: 0.12 }));
  pad.rotation.x = -Math.PI / 2; pad.position.set(sp.x, STAGE_H + 0.015, sp.z); scene.add(pad);
  return ring;
});
const seatParts = Array.from({ length: SEATS }, () => []);   // mỗi ghế: [{mesh, k, hinge, state}]
const seatColors = new Array(SEATS), stateMeshes = new Set(), poseMeshes = new Set();
const seatPoseV = new Array(SEATS).fill(-1);
const seatSkins = new Array(SEATS).fill(null), seatBackAng = new Array(SEATS).fill(0);
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _sc = new THREE.Vector3(AV_S, AV_S, AV_S), _ax = new THREE.Vector3(1, 0, 0);
function setPartMatrix(mesh, k, x, z, hinge, angle) {
  _p.set(x, floorY(z), z);
  if (hinge) _p.addScaledVector(HINGE[hinge], AV_S);
  _q.setFromAxisAngle(_ax, angle || 0);
  _m4.compose(_p, _q, _sc); mesh.setMatrixAt(k, _m4);
}
// Đặt độ ngả cho ghế i: v = 0 (thẳng lưng, gác chân gập) … 1 (ngả hết cỡ, gác chân bật ngang)
function setSeatPose(i, v) {
  if (seatPoseV[i] === v) return;
  seatPoseV[i] = v;
  const S = SEAT_INFO[i], T = SEAT_TYPES[S.type];
  const back = T.rMin + v * (T.rMax - T.rMin), leg = -LEG_FOLD * (1 - Math.min(1, v / 0.45));
  for (const p of seatParts[i]) if (p.hinge) { setPartMatrix(p.mesh, p.k, S.x, S.z, p.hinge, p.hinge === 'back' ? back : leg); p.mesh.instanceMatrix.needsUpdate = true; }
  seatBackAng[i] = back; if (seatSkins[i]) seatSkins[i].back.rotation.x = back;
}
{
  for (const type of Object.keys(SEAT_MODELS)) {
    const T = SEAT_TYPES[type];
    const ids = SEAT_INFO.map((s, i) => (s.type === type ? i : -1)).filter((i) => i >= 0);
    if (!ids.length) continue;
    const units = [...new Map(ids.map((i) => [SEAT_INFO[i].row + '|' + SEAT_INFO[i].unitX.toFixed(2), SEAT_INFO[i]])).values()];
    const free = new THREE.Color(T.color), tk = new THREE.Color(T.color).multiplyScalar(0.6);
    ids.forEach((i) => (seatColors[i] = { free, taken: tk }));
    for (const part of SEAT_MODELS[type]) {
      const state = part.color === 'state';
      const mesh = new THREE.InstancedMesh(part.geo, smat(state ? 0xffffff : part.color, { roughness: 0.85, ...(part.o || {}) }), part.unit ? units.length : ids.length);
      if (part.unit) units.forEach((u, k) => setPartMatrix(mesh, k, u.unitX, u.z));
      else ids.forEach((i, k) => {
        setPartMatrix(mesh, k, SEAT_INFO[i].x, SEAT_INFO[i].z, part.hinge, 0);
        seatParts[i].push({ mesh, k, hinge: part.hinge, state });
        if (state) mesh.setColorAt(k, free);
      });
      if (state) stateMeshes.add(mesh);
      scene.add(mesh);
    }
  }
  for (let i = 0; i < SEATS; i++) setSeatPose(i, 0);
}
{
  // Các tầng bậc + đèn LED viền mép tầng
  const W = HALL_X * 2 - 0.1, STEP_COL = THEME.step, AISLE_COL = THEME.aisle;
  const ledMat = new THREE.MeshBasicMaterial({ color: THEME.led }); PARTY_TINT.push(ledMat);
  const strip = (x, w, h, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, 0.03), ledMat); m.position.set(x, h - 0.05, z); scene.add(m); };
  for (let r = 1; r < ROWS; r++) {
    const R = ROW_INFO[r];
    box(W, R.h, R.depth, STEP_COL, 0, R.h / 2, R.z0 + R.depth / 2);
    strip(0, W, R.h, R.z0 - 0.01);
  }
  if (TOP_H > 0) { box(W, TOP_H, LAND_D, STEP_COL, 0, TOP_H / 2, LAND_Z0 + LAND_D / 2); strip(0, W, TOP_H, LAND_Z0 - 0.01); }   // sàn sau hàng cuối
  // Bậc thang ở các lối đi: 2 bậc / 1 tầng, mép bậc có đèn vàng
  const aisles = [[-AISLE_X, AISLE_W], [AISLE_X, AISLE_W], [-(SIDE_X0 + HALL_X) / 2, HALL_X - SIDE_X0], [(SIDE_X0 + HALL_X) / 2, HALL_X - SIDE_X0]];
  if (TPLC.aisles) for (const [ax, aw] of aisles) {
    for (let r = 0; r < ROWS; r++) {
      const R = ROW_INFO[r];
      const flat = r < ROWS - 1 ? R.depth - MID_STEP_D : R.depth;
      box(aw - 0.1, 0.03, flat, AISLE_COL, ax, R.h + 0.015, R.z0 + flat / 2);
      if (r < ROWS - 1) {
        const dh = (ROW_INFO[r + 1].h - R.h) / 2, zc = R.z0 + R.depth - MID_STEP_D / 2;
        box(aw - 0.1, dh, MID_STEP_D, AISLE_COL, ax, R.h + dh / 2, zc);
        strip(ax, aw - 0.1, R.h + dh, zc - MID_STEP_D / 2 - 0.01);
      }
    }
    if (aw === AISLE_W && TOP_H > 0) for (const e of [-1, 1]) {                    // tay vịn vàng dọc lối đi giữa
      const z0 = ROW_INFO[0].z0, len = Math.hypot(LAND_Z0 - z0, TOP_H);
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, len, 6), smat(0xc9a24a, { metalness: 0.8, roughness: 0.3 }));
      rail.position.set(ax + e * (aw / 2 - 0.08), TOP_H / 2 + 1.2, (z0 + LAND_Z0) / 2);
      rail.rotation.x = Math.PI / 2 - Math.atan2(TOP_H, LAND_Z0 - z0); scene.add(rail);
    }
  }

  // Biển tên từng khu trên 2 tường bên (chữ vàng)
  const zones = [];
  ROW_INFO.forEach((R, r) => { const last = zones[zones.length - 1]; if (last && last.type === R.type) last.to = r; else zones.push({ type: R.type, from: r, to: r }); });
  if (TPLC.zoneSigns) for (const zn of zones) {
    const a = ROW_INFO[zn.from], b = ROW_INFO[zn.to];
    const c = document.createElement('canvas'); c.width = 640; c.height = 120; const x = c.getContext('2d');
    x.fillStyle = 'rgba(12,12,14,.92)'; x.fillRect(0, 0, 640, 120); x.strokeStyle = '#c9a24a'; x.lineWidth = 4; x.strokeRect(6, 6, 628, 108);
    x.font = '800 54px system-ui,"Segoe UI",sans-serif'; x.fillStyle = '#e8c27a'; x.textAlign = 'center'; x.textBaseline = 'middle';
    if ('letterSpacing' in x) x.letterSpacing = '6px';
    x.fillText(SEAT_TYPES[zn.type].name.toUpperCase() + '  ' + a.letter + (zn.to > zn.from ? '–' + b.letter : ''), 320, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    const mt = new THREE.MeshBasicMaterial({ map: t });
    const zc = (a.z0 + b.z0 + b.depth) / 2, y = b.h + 4.6;
    for (const sx of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.86), mt);
      m.position.set(sx * (HALL_X - 0.4), y, zc); m.rotation.y = -sx * Math.PI / 2;
      (sx < 0 ? wallL : wallR).add(m);
    }
  }
}

// =====================================================================
//  Nhân vật + nhãn tên + bong bóng chat
// =====================================================================
const SHIRTS = [0xa8c5f0, 0xf3b6a6, 0xa9dcc4, 0xd6c1f2, 0xf5d79a, 0xf2a7b8, 0xa6dbe8, 0xc9e3a6, 0xf6c3dc, 0xc3c7cf];   // pastel
const SKINS = [0xf1c9a5, 0xe0ac82, 0xc68863, 0x8d5a3b];
const HAIRS = [0x15110d, 0x2b1d12, 0x0c0c10, 0x3b2a1a];

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
// Tên + bong bóng giữ cùng kích thước trên màn hình dù ở xa hay gần (dễ đọc ở mọi góc nhìn).
// ratio = số px hiển thị trên màn hình cho 1 px của canvas
function spriteFromCanvas(c, ratio) {
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false, sizeAttenuation: false }));
  const unit = ratio * 2 * Math.tan(THREE.MathUtils.degToRad(42 / 2)) / Math.max(500, innerHeight);
  sp.center.set(0.5, 0); sp.scale.set(c.width * unit, c.height * unit, 1); sp.renderOrder = 10; return sp;
}
function disposeSprite(sp) { if (!sp) return; sp.parent && sp.parent.remove(sp); sp.material.map.dispose(); sp.material.dispose(); }

function makeNameSprite(text, isMe, ns) {
  const fam = ns && ns.font ? `"${ns.font}", system-ui, sans-serif` : 'system-ui,"Segoe UI",sans-serif', font = `700 30px ${fam}`;
  const c = document.createElement('canvas'), x = c.getContext('2d'); x.font = font;
  const w = Math.ceil(x.measureText(text).width) + 34, h = 48; c.width = w; c.height = h; x.font = font;
  const styled = !!(ns && ns.fx);
  x.fillStyle = isMe && !styled ? 'rgba(245,185,66,.95)' : 'rgba(8,14,12,.8)'; roundRect(x, 0, 0, w, h, 14); x.fill();
  if (isMe && styled) { x.strokeStyle = 'rgba(245,185,66,.95)'; x.lineWidth = 3; roundRect(x, 1.5, 1.5, w - 3, h - 3, 13); x.stroke(); }
  x.textBaseline = 'middle'; const tx = 17, ty = h / 2 + 2;
  let fill = isMe && !styled ? '#1b1400' : '#ffffff';
  if (styled) {
    const c1 = ns.c1 || '#ffffff', c2 = ns.c2 || c1, g = (stops, vert) => { const gr = vert ? x.createLinearGradient(0, 6, 0, h - 6) : x.createLinearGradient(tx, 0, w - tx, 0); stops.forEach((cc, k) => gr.addColorStop(k / (stops.length - 1), cc)); return gr; };
    fill = { gradient: g([c1, c2]), shine: g([c1, '#ffffff', c1]), ice: g(['#ffffff', c1], true), rainbow: g(['#ff4d4d', '#ffb03a', '#ffe94a', '#5ee07a', '#3fd6ff', '#7a7bff', '#ff4dd8']),
      fire: g(['#ffea00', '#ff9100', '#ff3d00'], true), gold: g(['#fff3c4', '#e8c24a', '#9a6a1a', '#ffe9a0'], true) }[ns.fx] || c1;
    if (ns.fx === 'glow' || ns.fx === 'neon' || ns.fx === 'fire' || ns.fx === 'ice') { x.shadowColor = ns.fx === 'fire' ? '#ff6a00' : c2; x.shadowBlur = 10; }
    if (ns.fx === 'outline') { x.strokeStyle = c2; x.lineWidth = 4; x.lineJoin = 'round'; x.strokeText(text, tx, ty); }
    if (ns.fx === '3d') { x.fillStyle = c2; x.fillText(text, tx + 2, ty + 2); }
    if (ns.fx === 'glitch') { x.fillStyle = c2; x.fillText(text, tx + 1.5, ty); x.fillStyle = '#3fd6ff'; x.fillText(text, tx - 1.5, ty); }
  }
  x.fillStyle = fill; x.fillText(text, tx, ty);
  return spriteFromCanvas(c, 0.55);
}
function makeBubbleSprite(text, skin) {
  skin = skin || ITEM.get('bubble_round');
  const font = '600 40px system-ui,"Segoe UI",sans-serif', maxW = 470, lineH = 52, pad = 24, tail = 18;
  const m = document.createElement('canvas').getContext('2d'); m.font = font;
  const lines = []; let line = '';
  const pushWord = (word) => {
    const t = line ? line + ' ' + word : word;
    if (m.measureText(t).width <= maxW) { line = t; return; }
    if (line) { lines.push(line); line = ''; }
    // từ quá dài: cắt theo ký tự
    let chunk = '';
    for (const ch of word) { if (m.measureText(chunk + ch).width > maxW) { lines.push(chunk); chunk = ch; } else chunk += ch; }
    line = chunk;
  };
  text.split(/\s+/).forEach(pushWord); if (line) lines.push(line);
  let out = lines.slice(0, 3); if (lines.length > 3) out[2] = out[2].replace(/.{0,2}$/, '') + '…';
  const w = Math.ceil(Math.max(...out.map((l) => m.measureText(l).width))) + pad * 2, h = out.length * lineH + pad * 2 - 6;
  const c = document.createElement('canvas'); c.width = w; c.height = h + tail; const x = c.getContext('2d'); x.font = font;
  const st = skin.style;
  const body = () => {                                        // dáng bong bóng theo kiểu
    if (st === 'spike') {                                     // viền răng cưa kiểu "hét to"
      const L = 3, T = 3, W2 = w - 6, H2 = h - 6, per = 2 * (W2 + H2), n = Math.max(16, Math.round(per / 26)), pts = [];
      for (let k = 0; k < n; k++) {
        let d = k / n * per, px, py, nx = 0, ny = 0;
        if (d < W2) { px = L + d; py = T; ny = 1; } else if ((d -= W2) < H2) { px = L + W2; py = T + d; nx = -1; } else if ((d -= H2) < W2) { px = L + W2 - d; py = T + H2; ny = -1; } else { d -= W2; px = L; py = T + H2 - d; nx = 1; }
        const off = k % 2 ? 9 : 0; pts.push([px + nx * off, py + ny * off]);
      }
      x.beginPath(); pts.forEach(([px, py], k) => (k ? x.lineTo(px, py) : x.moveTo(px, py))); x.closePath();
    } else roundRect(x, 3, 3, w - 6, h - 6, st === 'square' ? 6 : st === 'cloud' ? Math.min(46, (h - 6) / 2) : 24);
  };
  x.fillStyle = skin.color || '#fff'; body(); x.fill();
  if (st === 'cloud') { for (const [cx2, cy2, r2] of [[w / 2 - 8, h + 2, 8], [w / 2 - 18, h + 13, 5]]) { x.beginPath(); x.arc(cx2, cy2, r2, 0, Math.PI * 2); x.fill(); } }
  else { x.beginPath(); x.moveTo(w / 2 - 14, h - 4); x.lineTo(w / 2 + 14, h - 4); x.lineTo(w / 2, h + tail); x.closePath(); x.fill(); }
  if (skin.border) { x.strokeStyle = skin.border; x.lineWidth = 5; body(); x.stroke(); }
  if (skin.style === 'heart') {                              // trái tim nhỏ ở 2 góc
    x.fillStyle = skin.border || '#ff6f9e';
    for (const [hx2, hy] of [[18, 16], [w - 18, 16]]) { x.beginPath(); x.moveTo(hx2, hy + 8); x.bezierCurveTo(hx2 - 14, hy - 4, hx2 - 6, hy - 14, hx2, hy - 5); x.bezierCurveTo(hx2 + 6, hy - 14, hx2 + 14, hy - 4, hx2, hy + 8); x.fill(); }
  }
  x.fillStyle = skin.accent || '#111'; x.textBaseline = 'middle';
  out.forEach((l, i) => x.fillText(l, pad, pad - 3 + lineH * i + lineH / 2));
  return spriteFromCanvas(c, 0.55);
}

const avatars = new Map();  // socket id -> avatar (người đang có trong state)
const walkers = new Set();  // mọi avatar còn trong cảnh (kể cả người đang đi ra cửa)
let labelsOn = true;

// ---- Đường đi: mỗi hàng ghế có 1 "làn" sau lưng ghế; 2 lối đi dọc ở x = ±AISLE_X;
// sau hàng cuối có lối ngang nối 2 lối đi; cửa vào ở giữa tường sau.
const ENTRANCE = new THREE.Vector3(0, 0, HALL_BACK - 1.2);
const CROSS_Z = LAND_Z0 + 1.6;                            // lối ngang trên sàn sau hàng cuối
const WALK_SPEED = 7.5;   // đi nhanh khi đổi chỗ
const LANE = (r) => ROW_INFO[r].lane;                      // lối nhỏ sau lưng mỗi hàng
const aisleOf = (x) => (x < 0 ? -AISLE_X : AISLE_X);
const gapX = (seat) => { const s = SEAT_INFO[seat]; return s.x + (aisleOf(s.x) > s.x ? 1 : -1) * Math.min(1.1, s.pitch / 2); }; // khe cạnh ghế, phía lối đi
const gapPoint = (seat) => (isDance(seat) ? V3(seatPos(seat).x, seatPos(seat).z) : new THREE.Vector3(gapX(seat), 0, LANE(seatRow(seat))));
const V3 = (x, z) => new THREE.Vector3(x, 0, z);

// Đường từ điểm p (đang ở làn, lối đi hoặc sàn sau) tới ghế `seat`
function routeToDance(p, seat) {
  const pts = [], sp = seatPos(seat), FRONT_Z = ROW_INFO[0].z0 - 1.5;
  if (p.z > FRONT_Z + 0.3) {                                 // đang ở khu ghế / sàn sau → theo lối đi xuống phía trước
    const pa = aisleOf(Math.abs(p.x) < 0.5 ? sp.x || 1 : p.x);
    if (Math.abs(p.x - pa) > 0.05) pts.push(V3(pa, p.z));
    pts.push(V3(pa, FRONT_Z));
  }
  if (isDJ(seat)) { const sx = p.x < 0 ? -2.9 : 2.9; pts.push(V3(sx, FRONT_Z), V3(sx, sp.z), V3(sp.x, sp.z)); return pts; }   // DJ đi vòng cạnh bàn, không xuyên qua
  pts.push(V3(sp.x, FRONT_Z), V3(sp.x, sp.z));
  return pts;
}
function routeFrom(p, seat) {
  if (isDance(seat)) return routeToDance(p, seat);
  const pts = [], s = seatPos(seat), lz = LANE(seatRow(seat)), ta = aisleOf(s.x);
  if (Math.abs(p.z - lz) > 0.05) {                         // khác làn → ra lối đi, (đổi lối đi ở phía sau), đi tới làn đích
    const pa = Math.abs(p.x) < 0.5 ? ta : aisleOf(p.x);
    if (Math.abs(p.x - pa) > 0.05) pts.push(V3(pa, p.z));
    if (pa !== ta) pts.push(V3(pa, CROSS_Z), V3(ta, CROSS_Z));
    pts.push(V3(ta, lz));
  }
  pts.push(V3(gapX(seat), lz), V3(s.x, s.z));              // tới khe cạnh ghế rồi bước vào ghế
  return pts;
}
function routeToExit(p) {
  const pts = [], pa = aisleOf(p.x);
  if (p.z < CROSS_Z - 0.3) {                               // đang ở khu ghế → ra lối đi rồi lên lối ngang phía sau
    if (Math.abs(p.x - pa) > 0.05) pts.push(V3(pa, p.z));
    pts.push(V3(pa, CROSS_Z));
  }
  pts.push(ENTRANCE.clone());
  return pts;
}

const HEAD_Y = 1.44;   // đầu so với hông (hông cao 1.08 → đầu ở 2.52 khi đứng)
// ---- Vật liệu kiểu hoạt hình (cel-shading 3 tông) cho nhân vật
const TOON_GRAD = (() => { const t = new THREE.DataTexture(new Uint8Array([95, 175, 255]), 3, 1, THREE.RedFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; })();
const toonCache = new Map();
function tmat(color, o = {}) { const k = color + JSON.stringify(o); if (!toonCache.has(k)) toonCache.set(k, new THREE.MeshToonMaterial({ color, gradientMap: TOON_GRAD, ...o })); return toonCache.get(k); }
const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x2a1c18, side: THREE.BackSide });
const geoCache = new Map();
const cachedGeo = (k, make) => { if (!geoCache.has(k)) geoCache.set(k, make()); return geoCache.get(k); };
const capG = (r, l) => cachedGeo('c' + r + '|' + l, () => new THREE.CapsuleGeometry(r, l, 6, 14));
const sphG = (r) => cachedGeo('s' + r, () => new THREE.SphereGeometry(r, 22, 16));
const coneG = (r, h) => cachedGeo('k' + r + '|' + h, () => new THREE.ConeGeometry(r, h, 10, 1).translate(0, -h / 2, 0));   // đỉnh ở gốc, chĩa xuống -y

// ---- Biểu cảm khuôn mặt kiểu anime: vẽ lên canvas (cache theo kiểu + giới tính + màu mắt)
const faceTexCache = new Map();
function faceTexture(style, g, irisHex = '#6a4430') {
  const key = style + g + irisHex; if (faceTexCache.has(key)) return faceTexCache.get(key);
  const c = document.createElement('canvas'); c.width = 512; c.height = 384; const x = c.getContext('2d');
  x.lineCap = x.lineJoin = 'round';
  const ink = '#2a1a14';
  const eye = (cx, open = 1, flip = 1) => {                    // mắt anime: tròng lớn có chuyển màu + 2 đốm sáng + mi trên dày
    const cy = 196, w = 38, h = 52 * open;
    x.save(); x.beginPath(); x.ellipse(cx, cy, w, h, 0, 0, Math.PI * 2); x.clip();
    x.fillStyle = '#fff'; x.fillRect(cx - w, cy - h, w * 2, h * 2);
    const gr = x.createLinearGradient(0, cy - h, 0, cy + h); gr.addColorStop(0, ink); gr.addColorStop(0.45, irisHex); gr.addColorStop(1, '#f3e1c8');
    x.fillStyle = gr; x.beginPath(); x.ellipse(cx, cy + 4, w * 0.86, h * 0.95, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = ink; x.beginPath(); x.ellipse(cx, cy + 2, w * 0.38, h * 0.42, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#fff'; x.beginPath(); x.ellipse(cx - 12 * flip, cy - 18 * open, 11, 14 * open, 0, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.arc(cx + 13 * flip, cy + 20 * open, 5, 0, Math.PI * 2); x.fill();
    x.restore();
    x.strokeStyle = ink; x.lineWidth = g === 'f' ? 11 : 9;          // mi trên
    x.beginPath(); x.moveTo(cx - w - 6, cy - h * 0.55); x.quadraticCurveTo(cx, cy - h - 16, cx + w + 6, cy - h * 0.62); x.stroke();
    if (g === 'f') { x.lineWidth = 6; x.beginPath(); x.moveTo(cx + flip * (w + 2), cy - h * 0.6); x.lineTo(cx + flip * (w + 16), cy - h * 0.85); x.stroke(); }
    x.lineWidth = 3.5; x.beginPath(); x.moveTo(cx - w * 0.6, cy + h + 2); x.quadraticCurveTo(cx, cy + h + 7, cx + w * 0.6, cy + h + 2); x.stroke();
  };
  const closed = (cx, up = true) => { x.strokeStyle = ink; x.lineWidth = 9; x.beginPath(); up ? x.arc(cx, 214, 34, Math.PI * 1.15, Math.PI * 1.85) : x.arc(cx, 176, 34, Math.PI * 0.15, Math.PI * 0.85); x.stroke(); };
  const blush = (a = 0.4, lines = false) => {
    for (const cx of [128, 384]) {
      const gr = x.createRadialGradient(cx, 262, 2, cx, 262, 46); gr.addColorStop(0, `rgba(255,120,140,${a})`); gr.addColorStop(1, 'rgba(255,120,140,0)');
      x.fillStyle = gr; x.fillRect(cx - 50, 222, 100, 80);
      if (lines) { x.strokeStyle = `rgba(220,80,100,${a + 0.2})`; x.lineWidth = 3; for (const d of [-14, 0, 14]) { x.beginPath(); x.moveTo(cx + d - 6, 270); x.lineTo(cx + d + 6, 254); x.stroke(); } }
    }
  };
  const brows = (tilt = 0) => { x.strokeStyle = g === 'm' ? ink : '#5a3a2a'; x.lineWidth = g === 'm' ? 9 : 6; for (const [cx, d] of [[176, -1], [336, 1]]) { x.beginPath(); x.moveTo(cx - 34, 118 + tilt * d); x.quadraticCurveTo(cx, 104, cx + 34, 118 - tilt * d); x.stroke(); } };
  const nose = () => { x.strokeStyle = 'rgba(160,90,70,.6)'; x.lineWidth = 3; x.beginPath(); x.moveTo(256, 250); x.lineTo(252, 262); x.stroke(); };
  const L = 176, R = 336;
  switch (style) {
    case 'smile': brows(); closed(L); closed(R); blush(0.35); nose(); x.fillStyle = '#8a2c34'; x.beginPath(); x.moveTo(226, 290); x.quadraticCurveTo(256, 330, 286, 290); x.closePath(); x.fill(); x.fillStyle = '#ff8a9a'; x.beginPath(); x.ellipse(256, 308, 14, 7, 0, 0, Math.PI * 2); x.fill(); break;
    case 'wink': brows(); eye(L); closed(R); blush(0.35); nose(); x.strokeStyle = ink; x.lineWidth = 5; x.beginPath(); x.moveTo(236, 296); x.quadraticCurveTo(256, 310, 276, 294); x.stroke(); break;
    case 'blush': brows(-6); eye(L, 0.9); eye(R, 0.9, -1); blush(0.75, true); nose(); x.strokeStyle = ink; x.lineWidth = 5; x.beginPath(); x.moveTo(234, 300); x.quadraticCurveTo(245, 292, 256, 300); x.quadraticCurveTo(267, 308, 278, 300); x.stroke(); break;
    case 'cat': brows(); eye(L); eye(R, 1, -1); blush(0.3); x.strokeStyle = ink; x.lineWidth = 5; x.beginPath(); x.arc(240, 292, 16, 0, Math.PI); x.arc(272, 292, 16, 0, Math.PI); x.stroke(); break;
    case 'sleepy': brows(); for (const cx of [L, R]) { x.strokeStyle = ink; x.lineWidth = 9; x.beginPath(); x.arc(cx, 186, 34, Math.PI * 0.12, Math.PI * 0.88); x.stroke(); } nose(); x.strokeStyle = ink; x.lineWidth = 5; x.beginPath(); x.arc(256, 300, 10, 0, Math.PI * 2); x.stroke();
      x.fillStyle = '#6a8ad0'; x.font = 'bold 48px sans-serif'; x.fillText('z', 410, 110); x.font = 'bold 32px sans-serif'; x.fillText('z', 448, 74); break;
    case 'wow': brows(8); for (const cx of [L, R]) { x.fillStyle = '#fff'; x.beginPath(); x.arc(cx, 196, 42, 0, Math.PI * 2); x.fill(); x.strokeStyle = ink; x.lineWidth = 6; x.stroke(); x.fillStyle = irisHex; x.beginPath(); x.arc(cx, 198, 20, 0, Math.PI * 2); x.fill(); x.fillStyle = ink; x.beginPath(); x.arc(cx, 198, 10, 0, Math.PI * 2); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(cx - 8, 190, 5, 0, Math.PI * 2); x.fill(); }
      x.fillStyle = '#8a2c34'; x.beginPath(); x.ellipse(256, 304, 18, 24, 0, 0, Math.PI * 2); x.fill(); break;
    case 'cool': x.strokeStyle = ink; x.lineWidth = 9; for (const cx of [L, R]) { x.beginPath(); x.moveTo(cx - 36, 112); x.lineTo(cx + 36, 120); x.stroke(); }
      for (const cx of [L, R]) { eye(cx, 0.55); x.fillStyle = 'rgba(240,210,190,1)'; } nose(); x.strokeStyle = ink; x.lineWidth = 5; x.beginPath(); x.moveTo(232, 296); x.quadraticCurveTo(262, 304, 284, 286); x.stroke(); break;
    default: brows(); eye(L); eye(R, 1, -1); blush(0.28); nose(); x.strokeStyle = ink; x.lineWidth = 5; x.beginPath(); x.moveTo(240, 294); x.quadraticCurveTo(256, 304, 272, 294); x.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  faceTexCache.set(key, t); return t;
}
const HEAD_R = 0.55;
const FACE_GEO = new THREE.SphereGeometry(HEAD_R + 0.004, 28, 18, Math.PI * 1.5 - 0.76, 1.52, Math.PI / 2 - 0.46, 1.04);   // vùng mặt hẹp lại → mắt to kiểu chibi

// vật liệu tóc theo màu: kênh r của màu đỉnh = sáng/tối, kênh g = vệt bóng trộn sang trắng
const hairMats = new Map();
function hairMat(c) {
  if (!hairMats.has(c)) {
    const m = new THREE.MeshToonMaterial({ color: c, gradientMap: TOON_GRAD, vertexColors: true });
    m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', 'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), vColor.g * 0.42) * vColor.r;'); };
    m.customProgramCacheKey = () => 'hairmix';
    hairMats.set(c, m);
  }
  return hairMats.get(c);
}
// ---- Tóc anime: ghép từ nhiều lọn thuôn nhọn (mái lởm chởm, tóc mai, lọn sau gáy, đuôi tóc) ôm theo đầu, có vệt bóng "vòng sáng"
function buildHairGeo(hs, hatted = false) {
  const V = THREE.Vector3, R = HEAD_R;
  const base = new THREE.Color(1, 0, 0), shine = new THREE.Color(1, 1, 0), deep = new THREE.Color(0.78, 0, 0);   // r = độ sáng, g = vệt bóng (shader trộn với màu tóc)
  const parts = [], ties = [];
  const dirOf = (az, pol) => new V(Math.sin(az) * Math.sin(pol), Math.cos(pol), Math.cos(az) * Math.sin(pol));   // az=0 sau gáy, az=π trước mặt
  // 1 lọn tóc: ống dẹt tiết diện thấu kính chạy theo đường pts, hẹp dần thành mũi nhọn
  const lock = (pts, nrm, w0, th0, taper = 0.75) => {
    const N = pts.length, RS = 8, pos = [], col = [], idx = [];
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const tan = pts[Math.min(i + 1, N - 1)].clone().sub(pts[Math.max(i - 1, 0)]).normalize();
      const n = nrm[i].clone().addScaledVector(tan, -nrm[i].dot(tan)).normalize();
      const side = new V().crossVectors(tan, n).normalize();
      const w = Math.max(0.004, w0 * Math.pow(1 - t, taper) * Math.min(1, 0.6 + t * 4)), th = Math.max(0.004, th0 * (1 - t * 0.8));
      const pp = pts[i], pol = Math.acos(Math.max(-1, Math.min(1, pp.y / pp.length())));
      for (let k = 0; k < RS; k++) {
        const a = k / RS * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const v = pp.clone().addScaledVector(side, ca * w / 2).addScaledVector(n, sa * th / 2 + Math.abs(ca) * 0);
        pos.push(v.x, v.y, v.z);
        const c = sa > 0.1 && Math.abs(pol - 0.82) < 0.11 && pp.length() < R * 1.5 ? shine : sa < -0.3 ? deep : base;   // vòng sáng trên đỉnh, mặt trong tối hơn
        col.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < N - 1; i++) for (let k = 0; k < RS; k++) {
      const a = i * RS + k, b = i * RS + (k + 1) % RS, c = a + RS, d = b + RS; idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals(); parts.push(g);
  };
  // đường đi trên mặt đầu: từ cực (pol0) xuống pol1 theo góc az; tuỳ chọn phồng, xoắn, chĩa ra (spike), uốn mũi (flick), buông thẳng (hang)
  const surf = (az, p0, p1, w, th, o = {}) => {
    const pts = [], nrm = [], n1 = 10, rr = R * (o.r ?? 1.07);
    for (let i = 0; i <= n1; i++) {
      const t = i / n1, pol = p0 + (p1 - p0) * t, a = az + (o.twist ?? 0) * t, d = dirOf(a, pol);
      const r = rr * (1 + (o.puff ?? 0.09) * (hatted ? 0.3 : 1) * Math.sin(Math.PI * Math.min(1, t * 1.15)) + (hatted ? 0 : o.spike ?? 0) * t * t);
      const pt = d.clone().multiplyScalar(r);
      if (!o.hang && o.flick) pt.addScaledVector(new V(d.x, 0, d.z).normalize(), o.flick * Math.pow(t, 3));
      pts.push(pt); nrm.push(d);
    }
    if (o.hang) {
      const last = pts[pts.length - 1], d = nrm[nrm.length - 1], out = new V(d.x, 0, d.z).normalize();
      for (let i = 1; i <= 9; i++) {
        const t = i / 9;
        pts.push(last.clone().add(new V(0, -o.hang * t, 0)).addScaledVector(out, (o.splay ?? 0.06) * t + (o.flick ?? 0) * t * t * t)); nrm.push(out.clone());
      }
    }
    lock(pts, nrm, w, th, o.taper);
  };
  // lọn theo đường cong Bezier (đuôi ngựa, bím)
  const bez = (P, w, th, out) => {
    const pts = [], nrm = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16, u = 1 - t;
      pts.push(new V().addScaledVector(P[0], u * u * u).addScaledVector(P[1], 3 * u * u * t).addScaledVector(P[2], 3 * u * t * t).addScaledVector(P[3], t * t * t)); nrm.push(out);
    }
    lock(pts, nrm, w, th, 0.55);
  };
  const ball = (r, x, y, z, sx = 1, sy = 1, sz = 1) => {
    const g = new THREE.SphereGeometry(r, 18, 12); g.deleteAttribute('uv'); g.scale(sx, sy, sz); g.translate(x, y, z);
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const c = g.attributes.normal.getY(i) > 0.55 ? shine : base; col.set([c.r, c.g, c.b], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); parts.push(g);
  };
  // các nhóm lọn dùng chung
  const bangs = (n, span, len, o = {}) => {                   // mái trước trán, so le dài ngắn → lởm chởm tự nhiên
    for (let k = 0; k < n; k++) {
      const f = n === 1 ? 0 : k / (n - 1) * 2 - 1, az = Math.PI + f * span;
      const L = len - [0, 0.15, 0.05, 0.19][k % 4] - Math.abs(f) * (o.drop ?? 0.06);
      surf(az, 0.3, L, (o.w ?? 0.26) * 1.25, o.th ?? 0.08, { puff: o.puff ?? 0.15, twist: (o.part ? Math.sign(f || 1) * o.part : o.sweep ?? 0.1) * (0.6 + Math.abs(f) * 0.4), spike: o.spike, flick: o.flick, taper: 1.35 });
    }
  };
  const back = (n, span, len, o = {}) => {                    // lọn phủ sau đầu + hai bên
    for (let k = 0; k < n; k++) {
      const f = k / (n - 1) * 2 - 1, az = f * span;
      surf(az, 0.22, len - (k % 2 ? 0.06 : 0), o.w ?? 0.34, o.th ?? 0.09, { puff: o.puff ?? 0.1, twist: f * 0.05, flick: o.flick, hang: o.hang ? o.hang - (k % 2 ? 0.08 : 0) - Math.abs(f) * (o.hangDrop ?? 0.1) : 0, splay: o.splay, spike: o.spike, taper: o.taper ?? (o.hang ? 0.4 : 0.75) });
    }
  };
  const sides = (len, o = {}) => {                            // tóc mai trước tai
    for (const sx of [-1, 1]) for (const da of o.two ? [1.05, 1.32] : [1.15]) surf(Math.PI - sx * da, 0.55, len, o.w ?? 0.2, o.th ?? 0.07, { puff: 0.08, hang: o.hang, splay: 0.03, flick: o.flick, taper: o.hang ? 0.55 : 0.75 });
  };
  const ahoge = () => {                                       // 1 sợi dựng cong trên đỉnh
    if (hatted) return;
    const b0 = new V(0, R * 1.04, -0.05);
    bez([b0, b0.clone().add(new V(0.02, 0.28, -0.05)), b0.clone().add(new V(0.18, 0.36, -0.12)), b0.clone().add(new V(0.26, 0.2, -0.2))], 0.07, 0.05, new V(0, 0, -1));
  };
  switch (hs) {
    case 'm_spiky':
      bangs(6, 0.85, 1.22, { spike: 0.12, sweep: 0.28, puff: 0.16 });
      back(11, 1.75, 1.95, { flick: 0.1, puff: 0.14 }); sides(1.75);
      for (let k = 0; k < 7; k++) { const az = (k / 6 * 2 - 1) * 1.5; surf(az, 0.1, 1.05, 0.3, 0.09, { spike: 0.42, puff: 0.1, twist: az * 0.1 }); }
      break;
    case 'm_wavy':
      bangs(8, 0.95, 1.42, { part: 0.25, puff: 0.15, flick: 0.04 });
      back(12, 1.8, 2.2, { flick: 0.12, puff: 0.15 }); sides(2.05, { flick: 0.08 }); ahoge();
      break;
    case 'm_bun':
      bangs(6, 0.8, 1.2, { sweep: 0.35, puff: 0.1 }); back(11, 1.75, 1.9, { puff: 0.06 }); sides(1.7);
      if (!hatted) { ball(0.2, 0, R * 0.82, R * 0.68); ties.push(new V(0, R * 0.68, R * 0.55)); }
      break;
    case 'f_long':
      bangs(9, 0.95, 1.45, { w: 0.24, sweep: 0.06 });
      back(16, 1.72, 2.05, { hang: 1.15, splay: 0.1, flick: -0.06, w: 0.44 }); sides(1.85, { hang: 0.85, flick: -0.04, two: true, w: 0.24 });
      break;
    case 'f_twin':
      bangs(9, 0.95, 1.42, { w: 0.24 }); back(11, 1.7, 1.95); sides(1.95, { hang: 0.25 });
      for (const sx of [-1, 1]) {
        const t0 = new V(sx * 0.5, 0.28, 0.18); ties.push(t0.clone().add(new V(sx * 0.04, 0, 0)));
        for (const [dx, dz] of [[0, 0], [0.06, 0.07], [-0.05, -0.06]])
          bez([t0, t0.clone().add(new V(sx * (0.38 + dx), 0.12, 0.08 + dz)), t0.clone().add(new V(sx * (0.5 + dx), -0.65, 0.12 + dz)), t0.clone().add(new V(sx * (0.32 + dx), -1.45, 0.18 + dz))], 0.3, 0.11, new V(sx, 0, 0.3).normalize());
      }
      break;
    case 'f_bob':
      bangs(9, 0.95, 1.4, { w: 0.24, sweep: 0, drop: 0.02 });
      back(13, 1.8, 2.25, { puff: 0.16, flick: -0.1, w: 0.33 }); sides(2.2, { flick: -0.08, two: true });
      break;
    case 'f_bun':
      bangs(9, 0.95, 1.4, { w: 0.24 }); back(11, 1.7, 1.95, { puff: 0.07 }); sides(1.95, { hang: 0.35 });
      if (!hatted) { ball(0.24, 0, R * 1.08, R * 0.25); ties.push(new V(0, R * 0.88, R * 0.22)); }
      break;
    case 'f_pony': {
      bangs(9, 0.95, 1.42, { w: 0.24 }); back(11, 1.7, 1.9, { puff: 0.07 }); sides(1.9, { hang: 0.3 });
      const t0 = new V(0, 0.22, R * 0.98); ties.push(t0.clone());
      for (const [dx, dz] of [[0, 0], [0.08, -0.04], [-0.08, -0.04], [0, 0.06]])
        bez([t0, t0.clone().add(new V(dx, 0.18, 0.32 + dz)), t0.clone().add(new V(dx * 1.5, -0.5, 0.48 + dz)), t0.clone().add(new V(dx, -1.35, 0.32 + dz))], 0.32, 0.12, new V(0, 0.2, 1).normalize());
      break;
    }
    default:                                                  // m_short
      bangs(7, 0.85, 1.3, { sweep: 0.16 }); back(11, 1.75, 2.0, { puff: 0.08 }); sides(1.8);
  }
  const geo = mergeGeometries(parts);
  const out = geo.clone(), P = out.attributes.position, Nn = out.attributes.normal;
  for (let i = 0; i < P.count; i++) P.setXYZ(i, P.getX(i) + Nn.getX(i) * 0.02, P.getY(i) + Nn.getY(i) * 0.02, P.getZ(i) + Nn.getZ(i) * 0.02);
  out.deleteAttribute('color');
  return { geo, out, ties };
}

// ---- Nhân vật chibi kiểu anime: đầu to, thân + tay chân thuôn tròn, tóc nhiều lọn, đổ bóng hoạt hình
function createAvatar(u, isMe, opts = {}) {
  const hsh = hashStr(u.name);
  const L0 = resolveLook(u.look), it = L0.items, female = L0.g === 'f';
  const C = (h, d) => (typeof h === 'string' && /^#[0-9a-f]{6}$/i.test(h) ? parseInt(h.slice(1), 16) : d);
  const skin = C(L0.skin, SKINS[(hsh >>> 4) % SKINS.length]);
  const top = it.top, bot = it.bottom, shoe = it.shoes;
  const shirt = opts.shirt ?? C(top.color, 0xf4f4f4), shirtAcc = C(top.accent, new THREE.Color(shirt).multiplyScalar(0.7).getHex());
  const isDress = top.style === 'dress' || top.style === 'gown', isSkirt = ['skirt', 'pleat', 'maxi'].includes(bot.style);
  const pants = opts.shirt != null ? 0x26262b : C(bot.color, 0x3b5a8a), pantsAcc = C(bot.accent, new THREE.Color(pants).multiplyScalar(0.7).getHex());
  const legTop = isDress || isSkirt ? skin : pants;
  const legLow = isDress || isSkirt || bot.style === 'shorts' ? skin : pants;
  const shoeC = C(shoe.color, 0x1d1d20), shoeAcc = C(shoe.accent, 0x111111);
  const longSleeve = ['hoodie', 'jacket', 'sweater', 'shirt', 'suit', 'sailor', 'puffer'].includes(top.style) && opts.shirt == null;
  const sleeveC = top.style === 'jacket' ? shirtAcc : shirt, foreC = longSleeve ? sleeveC : skin;
  const upSleeve = top.style === 'jersey' || top.style === 'tank' ? skin : sleeveC;
  const TW = female ? 0.24 : 0.28;                                // bán kính thân
  const M = (geo, color, x, y, z, parent, o) => { const m = new THREE.Mesh(geo, typeof color === 'number' ? tmat(color, o) : color); m.position.set(x, y, z); parent.add(m); return m; };
  const g = new THREE.Group();
  const body = new THREE.Group(); body.scale.setScalar(AV_S); g.add(body);
  const shoeMesh = (parent, x, y, z, rx = 0) => {                 // giày: mỗi kiểu một dáng riêng (mũi giày hướng -z)
    const sg = new THREE.Group(); sg.position.set(x, y, z); sg.rotation.x = rx; parent.add(sg);
    const ss = shoe.style;
    const foot = (sx, sy, sz, c = shoeC, yy = 0, zz = -0.06, r = 0.15) => { const f = M(sphG(r), c, 0, yy, zz, sg); f.scale.set(sx, sy, sz); return f; };
    const sole = (c = shoeAcc, sy = 0.3, yy = -0.04) => foot(1.03, sy, 1.5, c, yy, -0.06, 0.155);
    const ring = (r, t, c, yy, zz = 0) => { const m = M(cachedGeo('shr' + r + t, () => new THREE.TorusGeometry(r, t, 6, 18)), c, 0, yy, zz, sg); m.rotation.x = Math.PI / 2; return m; };
    const arch = (r, t, c, yy, zz) => M(cachedGeo('sha' + r + t, () => new THREE.TorusGeometry(r, t, 6, 14, Math.PI)), c, 0, yy, zz, sg);
    if (ss === 'boots' || ss === 'rain') {
      const tall = ss === 'rain'; M(capG(tall ? 0.145 : 0.13, tall ? 0.3 : 0.22), shoeC, 0, tall ? 0.14 : 0.08, 0, sg);
      foot(0.95, 0.55, 1.35, shoeC, -0.04, -0.08); sole(shoeAcc, 0.22, -0.08);
      if (tall) ring(0.15, 0.03, shoeAcc, 0.36); else ring(0.135, 0.022, shoeAcc, 0.24);
    } else if (ss === 'hightop') {
      foot(1, 0.62, 1.45); sole(shoeAcc, 0.3); M(capG(0.135, 0.1), shoeC, 0, 0.12, 0.02, sg); ring(0.13, 0.03, shoeAcc, 0.24, 0.02);
      M(sphG(0.06), shoeAcc, 0.12, 0.08, 0.04, sg).scale.set(0.3, 1, 1); M(sphG(0.06), shoeAcc, -0.12, 0.08, 0.04, sg).scale.set(0.3, 1, 1);
    } else if (ss === 'vans') {
      foot(1, 0.48, 1.45, shoeC, 0.01); M(cachedGeo('vsole', () => new RoundedBoxGeometry(0.31, 0.08, 0.46, 2, 0.035)), shoeAcc, 0, -0.06, -0.06, sg);
      foot(0.85, 0.42, 0.55, shoeAcc, -0.01, -0.22, 0.15);
      for (const sx of [-1, 1]) { const st2 = M(capG(0.012, 0.16), shoeAcc, sx * 0.145, 0.0, -0.04, sg); st2.rotation.set(Math.PI / 2, 0, 0); st2.rotation.z = sx * 0.2; }
    } else if (ss === 'sandal') {
      const ft = M(sphG(0.12), skin, 0, 0.02, -0.06, sg); ft.scale.set(0.9, 0.5, 1.4);
      sole(shoeAcc, 0.18, -0.07); arch(0.11, 0.025, shoeC, -0.03, -0.14); arch(0.11, 0.025, shoeC, -0.03, 0.02);
    } else if (ss === 'clog' || ss === 'charm') {                    // dép sục: mũi bầu, lỗ thoáng, quai hậu (+ charm trang trí)
      foot(1.18, 0.8, 1.48, shoeC, 0.01, -0.07, 0.16); sole(new THREE.Color(shoeC).multiplyScalar(0.88).getHex(), 0.24, -0.08);
      const holeC = new THREE.Color(shoeC).multiplyScalar(0.55).getHex();
      for (const [hx, hz] of [[-0.08, -0.2], [0, -0.22], [0.08, -0.2], [-0.1, -0.12], [-0.035, -0.13], [0.035, -0.13], [0.1, -0.12], [-0.08, -0.05], [0.08, -0.05]]) M(sphG(0.02), holeC, hx, 0.105 - Math.abs(hz + 0.13) * 0.25, hz, sg).scale.set(1, 0.5, 1);
      const strap = M(cachedGeo('clstrap', () => new THREE.TorusGeometry(0.15, 0.025, 6, 16, Math.PI)), shoeAcc, 0, 0.05, -0.03, sg); strap.rotation.x = Math.PI / 2; strap.scale.set(1, 1.1, 1);
      for (const sx of [-1, 1]) M(sphG(0.032), shoeAcc, sx * 0.15, 0.05, -0.03, sg);
      if (ss === 'charm') {
        M(sphG(0.04), 0xffd23a, -0.07, 0.13, -0.17, sg);                                                     // charm mặt cười vàng
        const st2 = M(cachedGeo('chstar', () => new THREE.OctahedronGeometry(0.045, 0)), 0xff6fa8, 0.07, 0.125, -0.15, sg); st2.scale.set(1, 1, 0.5);
        for (const d of [-0.017, 0.017]) M(sphG(0.024), 0xe8402a, 0.0 + d, 0.135, -0.07, sg);               // trái tim
        M(cachedGeo('chcube', () => new RoundedBoxGeometry(0.06, 0.04, 0.05, 1, 0.012)), 0x5aa8ff, -0.06, 0.12, -0.04, sg);
        M(sphG(0.03), 0x9be37a, 0.08, 0.115, -0.03, sg);
      }
    } else if (ss === 'fluffy') {
      foot(1.25, 0.82, 1.73, shoeC, 0, -0.04); for (const sx of [-0.06, 0.06]) M(capG(0.03, 0.1), shoeAcc, sx, 0.13, 0.02, sg);
    } else if (ss === 'flat') {
      foot(0.95, 0.45, 1.4, shoeC, -0.02, -0.05, 0.14); arch(0.1, 0.02, shoeAcc, -0.02, -0.02);
    } else if (ss === 'heels') {
      const f = foot(0.85, 0.42, 1.45, shoeC, 0.02, -0.08, 0.14); f.rotation.x = -0.25;
      M(cachedGeo('heel', () => new THREE.CylinderGeometry(0.022, 0.035, 0.16, 8)), shoeAcc, 0, -0.07, 0.1, sg); arch(0.09, 0.018, shoeAcc, 0.02, 0.05);
    } else if (ss === 'loafer' || ss === 'oxford') {
      foot(0.98, 0.5, 1.45, shoeC, -0.01); sole(ss === 'oxford' ? 0x111111 : 0x2a1b13, 0.2, -0.06);
      M(cachedGeo('lband', () => new RoundedBoxGeometry(0.24, 0.04, 0.07, 2, 0.015)), shoeAcc, 0, 0.055, -0.12, sg);
      if (ss === 'oxford') for (const zz of [-0.05, 0.0]) M(capG(0.008, 0.09), shoeAcc, 0, 0.07, zz, sg).rotation.z = Math.PI / 2;
    } else {                                                       // sneaker
      foot(1, 0.62, 1.45); sole(shoeAcc, 0.3);
      for (const zz of [-0.12, -0.06, 0]) M(capG(0.01, 0.1), shoeAcc, 0, 0.085, zz, sg).rotation.z = Math.PI / 2;
    }
  };
  const seg = (parent, r, len, color, x, y, z, rx = 0) => { const m = M(capG(r, len), color, x, y, z, parent); m.rotation.x = rx; return m; };

  // Tư thế ngồi: 2 chân co
  const legsUp = new THREE.Group(); body.add(legsUp);
  for (const sx of [-0.15, 0.15]) {
    seg(legsUp, 0.14, 0.4, legTop, sx, 1.06, -0.28, Math.PI / 2);
    seg(legsUp, 0.115, 0.5, legLow, sx, 0.62, -0.56);
    shoeMesh(legsUp, sx, 0.13, -0.6);
  }
  // Tư thế nằm: chân duỗi
  const legsFlat = new THREE.Group(); body.add(legsFlat);
  for (const sx of [-0.15, 0.15]) {
    seg(legsFlat, 0.14, 0.42, legTop, sx, 1.06, -0.3, Math.PI / 2);
    seg(legsFlat, 0.115, 0.55, legLow, sx, 1.04, -0.95, Math.PI / 2);
    shoeMesh(legsFlat, sx, 1.14, -1.42, -1.3);
  }
  // Ngồi xếp bằng trên thú cưỡi (vịt, mây, đĩa bay): đùi + cẳng chân nằm ngang ngang hông → không chân nào thòng xuống xuyên qua thú cưỡi
  const legsRide = new THREE.Group(); legsRide.visible = false; body.add(legsRide);
  const limb = (r, a, b, color) => {
    const d = new THREE.Vector3().subVectors(b, a), L = d.length();
    const m = M(capG(r, L), color, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, legsRide);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return m;
  };
  for (const sx of [-1, 1]) {
    const yo = sx > 0 ? 0.06 : 0, V3 = THREE.Vector3;                   // chân phải gác lên trên chân trái
    const hipP = new V3(sx * 0.15, 1.0 + yo, -0.02), knee = new V3(sx * 0.43, 0.99 + yo, -0.36), ank = new V3(-sx * 0.1, 0.98 + yo, -0.5);
    limb(0.14, hipP, knee, legTop); limb(0.115, knee, ank, legLow);
    const fg = new THREE.Group(); fg.position.copy(ank).add(new V3(-sx * 0.06, 0, 0)); fg.rotation.y = sx * Math.PI / 2; legsRide.add(fg); shoeMesh(fg, 0, 0, 0);
  }
  if (isDress || isSkirt) { const lap = M(sphG(0.3), isDress ? shirt : pants, 0, 1.06, -0.2, legsRide); lap.scale.set(1.45, 0.38, 1.25); }   // tà váy phủ lòng

  // Cẳng tay khi ngồi (gác lên tay vịn)
  const armsSit = new THREE.Group(); body.add(armsSit);
  for (const sx of [-1, 1]) { seg(armsSit, 0.08, 0.42, foreC, sx * 0.5, 1.36, -0.16, Math.PI / 2); M(sphG(0.09), skin, sx * 0.5, 1.36, -0.46, armsSit); }

  // Đứng / đi
  const standG = new THREE.Group(); standG.visible = false; body.add(standG);
  const mkLeg = (x) => {
    const piv = new THREE.Group(); piv.position.set(x, 1.12, 0); standG.add(piv);
    seg(piv, 0.14, 0.3, legTop, 0, -0.26, 0); seg(piv, 0.12, 0.38, legLow, 0, -0.72, 0);
    shoeMesh(piv, 0, -1.04, -0.02); return piv;
  };
  const legL = mkLeg(-0.15), legR = mkLeg(0.15);
  const ax = TW * 1.25 + 0.06;
  const mkArm = (x) => {
    const piv = new THREE.Group(); piv.position.set(x, 1.88, 0); standG.add(piv);
    seg(piv, 0.085, 0.26, upSleeve, 0, -0.2, 0);
    const elb = new THREE.Group(); elb.position.y = -0.36; piv.add(elb);                 // khuỷu tay (gập được khi nhảy)
    M(sphG(0.08), upSleeve, 0, 0, 0, elb); seg(elb, 0.075, 0.26, foreC, 0, -0.16, 0);
    M(sphG(0.09), skin, 0, -0.38, 0, elb); piv.userData.elbow = elb; return piv;
  };
  const armL = mkArm(-ax), armR = mkArm(ax);

  // Phần trên (xoay quanh hông khi ngả lưng): hông, thân, cổ, đầu
  const upper = new THREE.Group(); upper.position.set(0, 1.08, 0); body.add(upper);
  const hip = M(sphG(0.3), isDress ? shirt : pants, 0, 0.04, 0, upper); hip.scale.set(TW * 4.1, 0.55, 0.85);
  const torsoLen = top.style === 'crop' ? 0.16 : 0.34;
  const torso = M(capG(TW, torsoLen), shirt, 0, 0.5 + (0.34 - torsoLen) / 2, 0.02, upper); torso.scale.set(1.25, 1, 0.82);
  if (top.style === 'crop') { const belly = M(capG(TW * 0.95, 0.12), skin, 0, 0.3, 0.02, upper); belly.scale.set(1.2, 1, 0.78); }
  M(capG(0.075, 0.1), skin, 0, 0.98, 0.02, upper);                                       // cổ
  const upArmL = seg(upper, 0.085, 0.3, upSleeve, -ax, 0.62, 0.08), upArmR = seg(upper, 0.085, 0.3, upSleeve, ax, 0.62, 0.08);
  // chi tiết áo
  const st = top.style;
  if (st === 'hoodie') {
    const hood = M(new THREE.TorusGeometry(0.26, 0.09, 10, 20), shirt, 0, 0.93, 0.16, upper); hood.rotation.x = Math.PI / 2.4;
    const pk = M(capG(0.08, 0.26), shirtAcc, 0, 0.36, -0.2, upper); pk.rotation.z = Math.PI / 2; pk.scale.z = 0.4;
    for (const sx of [-0.06, 0.06]) M(capG(0.015, 0.2), 0xf2f2f2, sx, 0.7, -0.22, upper);
  } else if (st === 'jacket') {
    M(capG(0.018, 0.5), shirtAcc, 0, 0.52, -0.235, upper);
    const band = M(capG(TW * 1.02, 0.02), shirtAcc, 0, 0.22, 0.02, upper); band.scale.set(1.27, 1, 0.84);
  } else if (st === 'sweater') {
    const band = M(capG(TW * 1.02, 0.03), shirtAcc, 0, 0.22, 0.02, upper); band.scale.set(1.27, 1, 0.84);
  } else if (st === 'shirt' || st === 'suit') {
    if (st === 'suit') { const v = M(new THREE.ConeGeometry(0.11, 0.36, 3), 0xf6f6f6, 0, 0.7, -0.215, upper); v.rotation.set(Math.PI, 0, 0); v.scale.z = 0.2; }
    for (const sx of [-1, 1]) { const c2 = rb(0.15, 0.05, 0.12, 0xf6f6f6, sx * 0.08, 0.88, -0.18, upper, 0.02); c2.rotation.z = -sx * 0.5; }
    const tie = M(new THREE.ConeGeometry(0.06, 0.34, 4), shirtAcc, 0, 0.66, -0.235, upper); tie.rotation.x = Math.PI; tie.scale.z = 0.3;
  } else if (st === 'sailor') {
    const col = rb(TW * 2.6, 0.26, 0.04, shirtAcc, 0, 0.78, 0.22, upper, 0.03);
    for (const sx of [-1, 1]) { const c2 = rb(0.28, 0.06, 0.03, shirtAcc, sx * 0.1, 0.74, -0.215, upper, 0.02); c2.rotation.z = sx * 0.7; }
    const bow = M(sphG(0.07), 0xc8263a, 0, 0.62, -0.235, upper); bow.scale.set(1.9, 0.9, 0.5);
  } else if (st === 'jersey') {
    M(capG(0.02, 0.36), shirtAcc, 0, 0.5, -0.235, upper).rotation.z = Math.PI / 2;
  } else if (st === 'stripe') {
    for (const yy of [0.36, 0.52, 0.68]) { const band = M(capG(TW * 1.02, 0.02), shirtAcc, 0, yy, 0.02, upper); band.scale.set(1.27, 1, 0.84); }
  } else if (st === 'tank') {
    for (const sx of [-1, 1]) { const sp = M(capG(0.03, 0.12), shirt, sx * 0.17, 0.86, 0.02, upper); sp.scale.z = 0.6; }
    const hem = M(capG(TW * 1.02, 0.02), shirtAcc, 0, 0.84, 0.02, upper); hem.scale.set(0.9, 1, 0.84);
  } else if (st === 'puffer') {
    torso.scale.set(1.45, 1.06, 1.02);
    for (const yy of [0.32, 0.5, 0.68]) { const band = M(capG(TW * 1.18, 0.02), shirtAcc, 0, yy, 0.02, upper); band.scale.set(1.25, 1, 0.88); }
    const col = M(new THREE.TorusGeometry(0.16, 0.06, 8, 18), shirt, 0, 0.92, 0.02, upper); col.rotation.x = Math.PI / 2;
    M(capG(0.016, 0.5), shirtAcc, 0, 0.52, -0.27, upper);
  }
  if (isDress || isSkirt) {                                      // váy loe (lathe) — đứng + ngồi
    const gown = top.style === 'gown', maxi = bot.style === 'maxi', pleat = bot.style === 'pleat';
    const dc = isDress ? shirt : pants, h2 = gown ? 1.05 : isDress ? 0.62 : maxi ? 0.9 : 0.42, r2 = gown ? 0.62 : isDress ? 0.5 : maxi ? 0.48 : 0.42;
    const prof = [new THREE.Vector2(0.001, 0), new THREE.Vector2(TW * 1.2, 0), new THREE.Vector2(r2 * 0.92, -h2 * 0.75), new THREE.Vector2(r2, -h2)];
    const sk = new THREE.Mesh(cachedGeo('skirt' + h2 + r2 + TW + pleat, () => new THREE.LatheGeometry(prof, pleat ? 14 : 24)), tmat(dc, { side: THREE.DoubleSide, flatShading: pleat })); sk.position.set(0, 1.18, 0.02); standG.add(sk);
    if (isDress || pleat || maxi) { const tr = M(new THREE.TorusGeometry(r2, 0.022, 6, 28), isDress ? shirtAcc : pantsAcc, 0, 1.18 - h2, 0.02, standG); tr.rotation.x = Math.PI / 2; }
    const lap = M(capG(0.2, 0.3), dc, 0, 1.13, -0.28, legsUp); lap.rotation.z = Math.PI / 2; lap.scale.set(1, 1.3, 1.6);
  }
  if (bot.style === 'shorts') for (const lg of [legL, legR]) seg(lg, 0.15, 0.22, pants, 0, -0.22, 0);
  if (bot.style === 'cargo') {                                  // túi hộp 2 bên đùi
    for (const [lg, sx] of [[legL, -1], [legR, 1]]) rb(0.06, 0.16, 0.17, pantsAcc, sx * 0.13, -0.36, 0, lg, 0.02);
    for (const sx of [-1, 1]) rb(0.06, 0.15, 0.2, pantsAcc, sx * 0.28, 1.0, -0.3, legsUp, 0.02);
  }
  if (bot.style === 'jogger') {                                 // bo gấu
    for (const lg of [legL, legR]) seg(lg, 0.128, 0.04, pantsAcc, 0, -0.93, 0);
    for (const sx of [-0.15, 0.15]) seg(legsUp, 0.122, 0.03, pantsAcc, sx, 0.38, -0.56);
  }

  // Đầu: hơi bầu, có viền nét, tai, mặt anime
  const head = new THREE.Group(); head.position.set(0, HEAD_Y, 0); upper.add(head);
  const skull = new THREE.Group(); skull.scale.set(1, 0.97, 0.95); head.add(skull);
  M(sphG(HEAD_R), skin, 0, 0, 0, skull);
  const ol = new THREE.Mesh(sphG(HEAD_R), OUTLINE); ol.scale.setScalar(1.03); skull.add(ol);
  for (const sx of [-1, 1]) { const e = M(sphG(0.09), skin, sx * HEAD_R * 0.98, -0.04, 0.02, skull); e.scale.set(0.5, 1, 0.8); }
  const iris = isHex(it.face.color) ? it.face.color : '#6a4430';
  skull.add(new THREE.Mesh(FACE_GEO, new THREE.MeshBasicMaterial({ map: faceTexture(it.face.style, L0.g, iris), transparent: true, depthWrite: false })));
  const hAcc = new THREE.Group(); hAcc.scale.setScalar(HEAD_R / 0.44 * 1.14); hAcc.position.y = 0.04; head.add(hAcc);   // mũ: to hơn lớp tóc để đội trùm lên tóc

  // Tóc anime: lớp nền trùm da đầu + các lọn tóc gộp 1 mesh (màu theo đỉnh: vệt bóng + mặt trong tối) + viền nét phồng theo pháp tuyến
  const hairC = C(it.hair.color, 0x3b2a1a), hs = it.hair.style, R = HEAD_R;
  const shellGeo = cachedGeo('hshell2', () => new THREE.SphereGeometry(R * 1.05, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.53));
  const shell = new THREE.Mesh(shellGeo, tmat(new THREE.Color(hairC).multiplyScalar(0.85).getHex())); shell.position.set(0, 0.03, 0.02); shell.rotation.x = 0.62; head.add(shell);
  const hatted = !!it.hat && ['beanie', 'cap', 'bucket', 'tophat', 'beret', 'witch'].includes(it.hat.style);
  const HG = cachedGeo('hair2|' + hs + (hatted ? '|h' : ''), () => buildHairGeo(hs, hatted));
  head.add(new THREE.Mesh(HG.geo, hairMat(hairC)));
  head.add(new THREE.Mesh(HG.out, OUTLINE));
  for (const tp of HG.ties) { const m = new THREE.Mesh(sphG(0.065), tmat(0xff6f9e)); m.position.copy(tp); head.add(m); }

  // Mũ / tai thú
  const hat = it.hat;
  if (hat) {
    const hc = C(hat.color, 0x202024), ha = C(hat.accent, 0xffffff), m2 = smat(hc, { roughness: 0.8 });
    const add = (geo, mm, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mm); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); hAcc.add(m); return m; };
    if (hat.style === 'beanie') { add(new THREE.SphereGeometry(0.5, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.52), m2, 0, 0.05, 0.04); add(new THREE.TorusGeometry(0.47, 0.06, 8, 24), m2, 0, 0.08, 0.04, Math.PI / 2); add(new THREE.SphereGeometry(0.1, 10, 8), m2, 0, 0.56, 0.04); }
    else if (hat.style === 'cap') { add(new THREE.SphereGeometry(0.5, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.48), m2, 0, 0.06, 0.05); add(new THREE.BoxGeometry(0.52, 0.04, 0.34), smat(ha), 0, 0.17, -0.44, 0.12); }
    else if (hat.style === 'cat_ears' || hat.style === 'bear_ears' || hat.style === 'bunny_ears') {
      add(new THREE.TorusGeometry(0.47, 0.03, 6, 24, Math.PI), m2, 0, 0.04, 0.02);
      for (const sx of [-1, 1]) {
        if (hat.style === 'cat_ears') { add(new THREE.ConeGeometry(0.13, 0.26, 4), m2, sx * 0.28, 0.46, 0.02, 0, Math.PI / 4, -sx * 0.35); add(new THREE.ConeGeometry(0.07, 0.15, 4), smat(ha), sx * 0.27, 0.45, -0.04, 0, Math.PI / 4, -sx * 0.35); }
        else if (hat.style === 'bear_ears') { add(new THREE.SphereGeometry(0.13, 12, 10), m2, sx * 0.32, 0.4, 0.04); add(new THREE.SphereGeometry(0.07, 10, 8), smat(ha), sx * 0.32, 0.4, -0.06); }
        else { const e = add(new THREE.CapsuleGeometry(0.08, 0.45, 6, 10), m2, sx * 0.17, 0.72, 0.04, 0, 0, -sx * 0.18); add(new THREE.CapsuleGeometry(0.045, 0.36, 4, 8), smat(ha), sx * 0.17, 0.72, -0.02, 0, 0, -sx * 0.18); e.scale.z = 0.6; }
      }
    }
    else if (hat.style === 'beret') { const b2 = add(new THREE.SphereGeometry(0.42, 18, 12), m2, 0.06, 0.4, 0.05, 0, 0, -0.25); b2.scale.y = 0.35; add(new THREE.CylinderGeometry(0.02, 0.03, 0.08, 6), m2, 0.1, 0.55, 0.05); }
    else if (hat.style === 'crown') { const gm = smat(hc, { metalness: 0.8, roughness: 0.3 }); add(new THREE.CylinderGeometry(0.26, 0.26, 0.14, 16, 1, true), gm, 0, 0.5, 0.04); for (let k = 0; k < 5; k++) { const a2 = k / 5 * Math.PI * 2; add(new THREE.ConeGeometry(0.06, 0.14, 4), gm, Math.cos(a2) * 0.25, 0.63, Math.sin(a2) * 0.25 + 0.04); }
      add(new THREE.SphereGeometry(0.05, 8, 6), smat(0xc8263a), 0, 0.5, -0.22); }
    else if (hat.style === 'bucket') { add(new THREE.CylinderGeometry(0.42, 0.5, 0.36, 22), m2, 0, 0.3, 0.04); add(new THREE.CylinderGeometry(0.72, 0.72, 0.03, 26), m2, 0, 0.13, 0.04, 0.06); add(new THREE.CylinderGeometry(0.505, 0.505, 0.07, 22), smat(ha), 0, 0.17, 0.04); }
    else if (hat.style === 'tophat') { add(new THREE.CylinderGeometry(0.66, 0.66, 0.04, 26), m2, 0, 0.3, 0.04); add(new THREE.CylinderGeometry(0.34, 0.36, 0.72, 22), m2, 0, 0.66, 0.04); add(new THREE.CylinderGeometry(0.365, 0.365, 0.12, 22), smat(ha), 0, 0.38, 0.04); }
    else if (hat.style === 'halo') { add(new THREE.TorusGeometry(0.28, 0.04, 8, 28), new THREE.MeshBasicMaterial({ color: hc }), 0, 0.78, 0.04, Math.PI / 2); }
    else if (hat.style === 'witch') { add(new THREE.CylinderGeometry(0.72, 0.72, 0.04, 28), m2, 0, 0.32, 0.04); const cone = add(new THREE.ConeGeometry(0.36, 0.8, 20), m2, 0.05, 0.72, 0.08, -0.15, 0, -0.15); add(new THREE.TorusGeometry(0.37, 0.04, 6, 24), smat(ha), 0, 0.37, 0.04, Math.PI / 2); cone.scale.set(1, 1, 1); }
  }
  // Kính: tâm tròng mắt trên mặt ở (±0.135, -0.04), mặt trước z≈-0.52 → đặt mắt kính sát trước mắt, gọng vòng ra tai
  const gl = it.glasses;
  if (gl) {
    const gc = C(gl.color, 0x111111), gm = smat(gc, { metalness: 0.3, roughness: 0.4 }), EX = 0.135;
    const gA = new THREE.Group(); gA.position.set(0, -0.04, -0.56); head.add(gA);
    const bar = (w, h, d, x, y, z, rz = 0, ry = 0, mm = gm) => { const m = new THREE.Mesh(cachedGeo('gbar' + w + h + d, () => new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) / 2 - 0.0005)), mm); m.position.set(x, y, z); m.rotation.set(0, ry, rz); gA.add(m); return m; };
    for (const sx of [-1, 1]) bar(0.018, 0.022, 0.6, sx * 0.39, 0.03, 0.26, 0, sx * 0.56);          // gọng ra tai
    const lensMat = (op) => new THREE.MeshBasicMaterial({ color: gc, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false });
    const flat = (shape, mm, x) => { const m = new THREE.Mesh(cachedGeo('gl_' + gl.style, () => new THREE.ShapeGeometry(shape, 12)), mm); m.position.set(x, 0, 0); gA.add(m); return m; };
    if (gl.style === 'sun') {
      for (const sx of [-1, 1]) { bar(0.2, 0.14, 0.012, sx * EX, 0, 0, 0, 0, lensMat(0.92)); bar(0.21, 0.02, 0.02, sx * EX, 0.07, 0); }
      bar(0.07, 0.02, 0.02, 0, 0.05, 0);
    } else if (gl.style === 'square') {
      for (const sx of [-1, 1]) { const cx = sx * EX; bar(0.2, 0.022, 0.02, cx, 0.075, 0); bar(0.2, 0.022, 0.02, cx, -0.075, 0); bar(0.022, 0.17, 0.02, cx - 0.1, 0, 0); bar(0.022, 0.17, 0.02, cx + 0.1, 0, 0); bar(0.19, 0.14, 0.006, cx, 0, 0.004, 0, 0, lensMat(0.12)); }
      bar(0.07, 0.02, 0.02, 0, 0.04, 0);
    } else if (gl.style === 'heart' || gl.style === 'star') {
      const sh = new THREE.Shape();
      if (gl.style === 'heart') { sh.moveTo(0, -0.1); sh.bezierCurveTo(-0.16, 0.0, -0.11, 0.13, 0, 0.05); sh.bezierCurveTo(0.11, 0.13, 0.16, 0.0, 0, -0.1); }
      else for (let k = 0; k < 10; k++) { const an = Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 0.05 : 0.115; k ? sh.lineTo(Math.cos(an) * r, Math.sin(an) * r) : sh.moveTo(Math.cos(an) * r, Math.sin(an) * r); }
      const mm = lensMat(0.9); for (const sx of [-1, 1]) flat(sh, mm, sx * EX);
      bar(0.06, 0.02, 0.02, 0, 0.03, 0);
    } else {                                                    // gọng tròn
      for (const sx of [-1, 1]) { const r = new THREE.Mesh(cachedGeo('glring', () => new THREE.TorusGeometry(0.088, 0.014, 8, 24)), gm); r.position.set(sx * EX, 0, 0); gA.add(r);
        const ln = new THREE.Mesh(cachedGeo('gllens', () => new THREE.CircleGeometry(0.085, 24)), lensMat(0.12)); ln.position.set(sx * EX, 0, 0.003); gA.add(ln); }
      bar(0.06, 0.018, 0.018, 0, 0.03, 0);
    }
  }
  // Balo / cánh (gắn sau lưng). Cánh: mỗi bên 1 nhóm xoay quanh trục dọc ở gốc cánh, vỗ ra phía sau (không chạm tay)
  let wings = null; const bk = it.back, backG = new THREE.Group(); upper.add(backG);   // đồ đeo lưng: ẩn khi ngồi ghế (khỏi xuyên lưng ghế)
  if (bk) {
    const bc = C(bk.color, 0xffffff), ba = C(bk.accent, 0x444444), ws = bk.style;
    const HZ = { f_long: 0.4, f_pony: 0.5, f_twin: 0.16, f_bob: 0.12, m_wavy: 0.08 }[hs] || 0;   // tóc dài phủ lưng → đẩy đồ ra sau lớp tóc
    if (ws === 'backpack') { rb(0.56, 0.62, 0.26 + HZ, bc, 0, 0.55, 0.36 + HZ / 2, backG, 0.1); rb(0.38, 0.22, 0.1, ba, 0, 0.4, 0.5 + HZ, backG, 0.05); for (const sx of [-0.15, 0.15]) rb(0.05, 0.6, 0.04, ba, sx, 0.56, -0.2, backG, 0.02); }
    else if (ws === 'bear_bag') { const bb = new THREE.Mesh(sphG(0.32), tmat(bc)); bb.position.set(0, 0.58, 0.42 + HZ); backG.add(bb); for (const sx of [-1, 1]) { const e = new THREE.Mesh(sphG(0.1), tmat(bc)); e.position.set(sx * 0.22, 0.86, 0.42 + HZ); backG.add(e); } const fc = new THREE.Mesh(sphG(0.1), tmat(ba)); fc.position.set(0, 0.54, 0.72 + HZ); fc.scale.z = 0.5; backG.add(fc); }
    else {
      wings = new THREE.Group(); wings.position.set(0, 0.74, 0.34 + HZ); backG.add(wings);
      wings.userData.flap = { wings_fairy: [0.35, 0.3, 9], wings_butterfly: [0.32, 0.38, 6], wings_mecha: [0.3, 0.06, 2], wings_dragon: [0.35, 0.28, 2.6], wings_bat: [0.35, 0.3, 3.6], wings_angel: [0.32, 0.22, 2.8] }[ws] || [0.3, 0.25, 3];
      const DS = THREE.DoubleSide;
      const memb = (pts, c, o = {}) => { const sh = new THREE.Shape(); pts.forEach(([px, py], k) => (k ? sh.lineTo(px, py) : sh.moveTo(px, py))); return new THREE.Mesh(new THREE.ShapeGeometry(sh), tmat(c, { side: DS, ...o })); };
      for (const sx of [-1, 1]) {
        const side = new THREE.Group(); side.userData.sx = sx; side.position.x = sx * 0.08; wings.add(side);
        const put = (m, x, y, z = 0, rz = 0) => { m.position.set(x * sx, y, z); m.rotation.z = rz * sx; side.add(m); return m; };
        if (ws === 'wings_angel') {                             // lông vũ xếp 3 lớp
          put(new THREE.Mesh(sphG(0.1), tmat(bc)), 0.38, 0.38, 0, 0.7).scale.set(3.4, 0.6, 0.35);
          for (let k = 0; k < 6; k++) { const an = 0.95 - k * 0.3, len = 0.62 + k * 0.03, r0 = 0.32;
            put(new THREE.Mesh(sphG(0.1), tmat(k % 2 ? ba : bc)), Math.cos(an) * (r0 + len / 2), 0.08 + Math.sin(an) * (r0 + len / 2), -0.01 * k, an).scale.set(len * 5, 0.75, 0.25); }
          for (let k = 0; k < 4; k++) { const an = 0.8 - k * 0.32; put(new THREE.Mesh(sphG(0.1), tmat(ba)), Math.cos(an) * 0.42, 0.12 + Math.sin(an) * 0.42, 0.03, an).scale.set(2.6, 0.7, 0.3); }
        } else if (ws === 'wings_bat' || ws === 'wings_dragon') {   // màng cánh + xương
          const big = ws === 'wings_dragon' ? 1.25 : 1;
          const P = [[0, 0], [0.55, 0.42], [1.0, 0.5], [0.86, 0.06], [0.95, -0.28], [0.62, -0.16], [0.52, -0.5], [0.24, -0.24]].map(([px, py]) => [px * big * sx, py * big]);
          side.add(memb(P, bc));
          for (const [ex, ey] of [[1.0, 0.5], [0.86, 0.06], [0.95, -0.28], [0.52, -0.5]]) { const L = Math.hypot(ex, ey) * big, bone = put(new THREE.Mesh(capG(0.025 * big, L), tmat(ba)), ex * big / 2, ey * big / 2, 0.01, Math.atan2(ey, ex) - Math.PI / 2); bone.scale.z = 0.7; }
          if (ws === 'wings_dragon') { put(new THREE.Mesh(coneG(0.05, 0.16), tmat(ba)), 1.0 * big, 0.5 * big + 0.12, 0.01, Math.PI); }
        } else if (ws === 'wings_fairy') {                      // 2 thuỳ trong suốt có viền
          const lobe = (w2, h2, x, y, rz) => { const m = put(new THREE.Mesh(cachedGeo('flobe', () => new THREE.CircleGeometry(1, 28)), new THREE.MeshToonMaterial({ color: bc, gradientMap: TOON_GRAD, transparent: true, opacity: 0.55, side: DS, depthWrite: false })), x, y, 0, rz); m.scale.set(w2, h2, 1);
            const rim = put(new THREE.Mesh(cachedGeo('frim', () => new THREE.RingGeometry(0.93, 1, 28)), new THREE.MeshBasicMaterial({ color: ba, side: DS })), x, y, 0.002, rz); rim.scale.set(w2, h2, 1); };
          lobe(0.55, 0.3, 0.5, 0.32, 0.55); lobe(0.36, 0.2, 0.38, -0.18, -0.5);
        } else if (ws === 'wings_butterfly') {                  // cánh bướm có chấm hoa văn
          const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.bezierCurveTo(0.3 * sx, 0.75, 1.05 * sx, 0.85, 0.95 * sx, 0.3); sh.bezierCurveTo(0.9 * sx, 0.05, 0.4 * sx, 0.02, 0, 0);
          side.add(new THREE.Mesh(new THREE.ShapeGeometry(sh, 16), tmat(bc, { side: DS })));
          const sh2 = new THREE.Shape(); sh2.moveTo(0, 0); sh2.bezierCurveTo(0.55 * sx, -0.05, 0.75 * sx, -0.55, 0.42 * sx, -0.62); sh2.bezierCurveTo(0.2 * sx, -0.62, 0.05 * sx, -0.3, 0, 0);
          side.add(new THREE.Mesh(new THREE.ShapeGeometry(sh2, 16), tmat(bc, { side: DS })));
          for (const [dx, dy, r] of [[0.7, 0.48, 0.1], [0.45, 0.36, 0.07], [0.42, -0.36, 0.08]]) put(new THREE.Mesh(cachedGeo('bspot', () => new THREE.CircleGeometry(1, 16)), new THREE.MeshBasicMaterial({ color: ba, side: DS })), dx, dy, 0.003).scale.set(r, r, 1);
          const edge = put(new THREE.Mesh(capG(0.02, 0.9), tmat(ba)), 0.5, 0.42, 0.004, -1.05); edge.scale.z = 0.5;
        } else {                                                // cơ giới: các tấm kim loại xoè + vạch phát sáng
          for (let k = 0; k < 4; k++) { const an = 0.7 - k * 0.38, L = 0.75 - k * 0.08;
            put(new THREE.Mesh(cachedGeo('mplate' + k, () => new RoundedBoxGeometry(L, 0.12, 0.05, 2, 0.02)), smat(bc, { metalness: 0.7, roughness: 0.3 })), Math.cos(an) * (0.15 + L / 2), 0.1 + Math.sin(an) * (0.15 + L / 2), -0.02 * k, an);
            put(new THREE.Mesh(cachedGeo('mline' + k, () => new THREE.BoxGeometry(L * 0.8, 0.025, 0.06)), new THREE.MeshBasicMaterial({ color: ba })), Math.cos(an) * (0.15 + L / 2), 0.1 + Math.sin(an) * (0.15 + L / 2), -0.02 * k + 0.005, an); }
          put(new THREE.Mesh(sphG(0.09), smat(bc, { metalness: 0.8, roughness: 0.3 })), 0.1, 0.1, 0);
        }
      }
      flapWings(wings, 0);
    }
  }
  // Thú cưỡi: chỉ hiện khi đang đi
  let mount = null, mountH = 0, mountPose = 'stand', mountBob = false; const mt = it.mount;
  if (mt) {
    mount = new THREE.Group(); mount.visible = false; g.add(mount);
    const mc = C(mt.color, 0xffffff), ma = C(mt.accent, 0x222222), mm = smat(mc);
    const add = (geo, m3, x, y, z) => { const o = new THREE.Mesh(geo, m3); o.position.set(x, y, z); mount.add(o); return o; };
    if (mt.style === 'skate') {                                     // ván trượt: mặt ván cong 2 đầu, giấy nhám, trục + 4 bánh; người đứng nghiêng ngang ván
      mountH = 0.28; mountPose = 'skate';
      const deck = (len, z, y, rx) => { const d2 = add(cachedGeo('deck' + len, () => new RoundedBoxGeometry(0.6, 0.045, len, 2, 0.022)), mm, 0, y, z); d2.rotation.x = rx; const gt = add(cachedGeo('grip' + len, () => new RoundedBoxGeometry(0.56, 0.012, len - 0.03, 1, 0.005)), smat(0x1b1b1f, { roughness: 1 }), 0, y + 0.028, z); gt.rotation.x = rx; };
      deck(1.5, 0, 0.24, 0); deck(0.34, -0.9, 0.29, 0.36); deck(0.34, 0.9, 0.29, -0.36);
      for (const z of [-0.55, 0.55]) {
        add(cachedGeo('truckb', () => new RoundedBoxGeometry(0.22, 0.05, 0.14, 1, 0.015)), smat(0xb8bec8, { metalness: 0.8, roughness: 0.3 }), 0, 0.19, z);
        const ax = add(cachedGeo('axle', () => new THREE.CylinderGeometry(0.022, 0.022, 0.62, 8)), smat(0xb8bec8, { metalness: 0.8, roughness: 0.3 }), 0, 0.1, z); ax.rotation.z = Math.PI / 2;
        for (const x of [-0.3, 0.3]) { const w = add(cachedGeo('wheel', () => new THREE.CylinderGeometry(0.085, 0.085, 0.08, 16)), smat(ma, { roughness: 0.6 }), x, 0.09, z); w.rotation.z = Math.PI / 2; }
      }
    }
    else if (mt.style === 'cloud') { mountH = 0.14; mountPose = 'sit'; mountBob = true; for (const [x, y, z, r, k] of [[0, 0.75, 0, 0.55, 0], [-0.5, 0.7, 0.2, 0.4, 1], [0.5, 0.7, -0.1, 0.42, 0], [0.1, 0.72, 0.6, 0.38, 1], [-0.1, 0.7, -0.6, 0.4, 0]]) add(new THREE.SphereGeometry(r, 14, 10), smat(k ? ma : mc, { roughness: 1 }), x, y, z); }
    else if (mt.style === 'scooter') { mountH = 0.3; mountPose = 'scooter'; add(new RoundedBoxGeometry(0.6, 0.1, 1.8, 2, 0.04), mm, 0, 0.22, 0.1); add(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 8), smat(0x333333), 0, 1.0, -0.75); const hb = add(new THREE.CylinderGeometry(0.035, 0.035, 0.8, 8), smat(0x222222), 0, 1.8, -0.75); hb.rotation.z = Math.PI / 2;
      for (const z of [-0.75, 0.85]) { const w = add(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 14), smat(0x222222), 0, 0.16, z); w.rotation.z = Math.PI / 2; }
      for (const x of [-0.42, 0.42]) { const gp = add(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 8), smat(ma), x, 1.8, -0.75); gp.rotation.z = Math.PI / 2; } }
    else if (mt.style === 'duck') { mountH = 0.05; mountPose = 'sit'; const b2 = add(new THREE.SphereGeometry(0.85, 18, 14), mm, 0, 0.55, 0.15); b2.scale.set(1, 0.7, 1.3); add(new THREE.SphereGeometry(0.42, 16, 12), mm, 0, 1.25, -0.85); const bk2 = add(new THREE.SphereGeometry(0.2, 12, 8), smat(ma), 0, 1.18, -1.25); bk2.scale.set(1.2, 0.5, 1);
      for (const sx of [-0.18, 0.18]) add(new THREE.SphereGeometry(0.06, 8, 6), smat(0x111111), sx, 1.38, -1.18); }
    else if (mt.style === 'ufo') {                                  // đĩa bay lơ lửng, người ngồi trong buồng lái kính
      mountH = 0.04; mountPose = 'sit'; mountBob = true; const Y = 0.6, mt2 = smat(mc, { metalness: 0.7, roughness: 0.3 });
      add(new THREE.CylinderGeometry(0.55, 1.05, 0.24, 28), mt2, 0, Y + 0.42, 0); add(new THREE.CylinderGeometry(1.05, 0.55, 0.16, 28), mt2, 0, Y + 0.22, 0);
      for (let k = 0; k < 10; k++) { const an = k / 10 * Math.PI * 2; add(new THREE.SphereGeometry(0.065, 8, 6), new THREE.MeshBasicMaterial({ color: ma }), Math.cos(an) * 0.94, Y + 0.32, Math.sin(an) * 0.94); }
      const dome = add(new THREE.SphereGeometry(0.62, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: ma, transparent: true, opacity: 0.22, roughness: 0.05, depthWrite: false }), 0, Y + 0.54, 0); dome.renderOrder = 3; dome.scale.y = 0.75;
      const bm = add(new THREE.CylinderGeometry(0.3, 0.75, Y + 0.1, 20, 1, true), new THREE.MeshBasicMaterial({ color: ma, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }), 0, (Y + 0.1) / 2, 0); bm.renderOrder = 2; }
  }
  let pet = null;
  if (it.pet) { pet = buildPet(it.pet.style, C(it.pet.color, 0xd9a066), C(it.pet.accent, 0xffffff)); g.add(pet); }
  const ns = nameStyleOf(u.look), name = makeNameSprite(u.name, isMe, ns); name.position.set(0, 3.35 * AV_S, 0); name.visible = labelsOn; g.add(name);
  if (ns && ns.font && !document.fonts.check(`700 30px "${ns.font}"`))                 // phông chưa tải xong → vẽ lại tên khi tải xong
    document.fonts.load(`700 30px "${ns.font}"`).then(() => { const n2 = makeNameSprite(u.name, isMe, ns); if (name.material.map) name.material.map.dispose(); name.material.map = n2.material.map; name.material.needsUpdate = true; name.scale.copy(n2.scale); }).catch(() => {});
  const seatIt = it.seat;
  return { g, body, head, name, bubble: null, timer: 0, phase: Math.random() * 6, legsUp, legsFlat, legsRide, armsSit, standG, legL, legR, armL, armR, elbowL: armL.userData.elbow, elbowR: armR.userData.elbow, upper, upArms: [upArmL, upArmR],
    seat: null, path: [], sitting: false, leaving: false, walkPhase: 0, lookKey: JSON.stringify(u.look || null),
    mount, mountH, mountPose, mountBob, curRide: null, pet, wings, backG, dances: L0.dances, bubbleSkin: it.bubble,
    seatSkin: seatIt && seatIt.style !== 'none' ? { style: seatIt.style, c: seatIt.color, a: seatIt.accent } : null,
    seatTint: seatIt && isHex(seatIt.color) ? new THREE.Color(seatIt.color) : null };
}

// ---- Thú cưng đi theo chủ: mô hình chibi nhỏ (mặt hướng -z, gốc ở chân). Chim bay cạnh vai.
function buildPet(style, c1, c2) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body); g.scale.setScalar(1.45);
  const A = (geo, col, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0, par = body) => { const m = new THREE.Mesh(geo, typeof col === 'number' ? tmat(col) : col); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.set(rx, ry, rz); par.add(m); return m; };
  const S = sphG, K = 0x18181b, W = 0xffffff, PINK = 0xffa3b8, ORG = 0xff9a2a;
  const eyes = (y, z, dx = 0.065, r = 0.028) => { for (const sx of [-1, 1]) { A(S(r), K, sx * dx, y, z); A(S(r * 0.35), W, sx * dx - 0.008, y + 0.01, z - r * 0.8); } };
  const legs = (c, y = 0.06, dx = 0.09, dz = 0.11, r = 0.045) => { for (const sx of [-1, 1]) for (const sz of [-1, 1]) A(capG(r, 0.06), c, sx * dx, y, sz * dz); };
  let flying = false, wings = [];
  switch (style) {
    case 'cat':
      A(S(0.2), c1, 0, 0.24, 0.02, 0.9, 0.85, 1.2); A(S(0.17), c1, 0, 0.45, -0.18); legs(c1);
      for (const sx of [-1, 1]) { A(coneG(0.065, 0.13), c1, sx * 0.09, 0.66, -0.17, 1, 1, 0.6, 0, 0, Math.PI + sx * 0.25); A(coneG(0.035, 0.08), PINK, sx * 0.09, 0.63, -0.2, 1, 1, 0.5, 0, 0, Math.PI + sx * 0.25); }
      A(S(0.07), c2, 0, 0.41, -0.32, 1.2, 0.8, 0.7); A(S(0.018), PINK, 0, 0.44, -0.36); eyes(0.49, -0.32);
      A(capG(0.03, 0.32), c1, 0, 0.42, 0.26, 1, 1, 1, -0.5); break;
    case 'chicken':
      A(S(0.21), c1, 0, 0.27, 0.02, 1, 1, 1.15); A(S(0.13), c1, 0, 0.5, -0.12);
      for (let k = 0; k < 3; k++) A(S(0.045), c2, 0, 0.64 - Math.abs(k - 1) * 0.02, -0.18 + k * 0.05);
      A(coneG(0.04, 0.09), ORG, 0, 0.5, -0.25, 1, 1, 1, Math.PI / 2); A(S(0.03), c2, 0, 0.43, -0.22, 1, 1.4, 1); eyes(0.53, -0.22, 0.06, 0.022);
      for (const sx of [-1, 1]) A(S(0.1), new THREE.Color(c1).multiplyScalar(0.92).getHex(), sx * 0.19, 0.28, 0.04, 0.4, 0.8, 1.2);
      A(coneG(0.09, 0.2), new THREE.Color(c1).multiplyScalar(0.9).getHex(), 0, 0.4, 0.22, 1, 1, 0.5, -2.4);
      for (const sx of [-1, 1]) A(capG(0.015, 0.1), ORG, sx * 0.07, 0.06, 0); break;
    case 'hamster':
      A(S(0.22), c1, 0, 0.21, 0, 1.1, 0.95, 1.15); A(S(0.15), c2, 0, 0.18, -0.12, 1, 0.9, 0.7);
      for (const sx of [-1, 1]) { A(S(0.05), new THREE.Color(c1).multiplyScalar(0.85).getHex(), sx * 0.13, 0.39, -0.02, 1, 1, 0.5); A(S(0.05), PINK, sx * 0.12, 0.24, -0.2, 1, 0.8, 0.5); A(S(0.03), PINK, sx * 0.07, 0.04, -0.12); }
      eyes(0.3, -0.21, 0.07, 0.024); A(S(0.017), PINK, 0, 0.26, -0.25); break;
    case 'bird':
      flying = true;
      A(S(0.13), c1, 0, 0, 0, 1, 1, 1.15); A(S(0.09), c2, 0, -0.02, -0.08, 1, 0.9, 0.6); A(S(0.09), c1, 0, 0.11, -0.08);
      A(coneG(0.025, 0.07), ORG, 0, 0.1, -0.18, 1, 1, 1, Math.PI / 2); eyes(0.13, -0.15, 0.05, 0.018);
      for (const sx of [-1, 1]) { const piv = new THREE.Group(); piv.position.set(sx * 0.1, 0.03, 0.02); body.add(piv); A(S(0.08), c1, sx * 0.08, 0, 0.02, 1.4, 0.3, 0.9, 0, 0, 0, piv); piv.userData.sx = sx; wings.push(piv); }
      A(coneG(0.06, 0.14), c1, 0, 0.0, 0.18, 1, 1, 0.4, -1.9); break;
    case 'rabbit':
      A(S(0.2), c1, 0, 0.22, 0.03, 1, 0.95, 1.15); A(S(0.15), c1, 0, 0.42, -0.14); legs(c1, 0.05, 0.09, 0.1, 0.05);
      for (const sx of [-1, 1]) { A(capG(0.045, 0.24), c1, sx * 0.06, 0.7, -0.12, 1, 1, 0.6, 0, 0, -sx * 0.15); A(capG(0.025, 0.18), c2, sx * 0.06, 0.7, -0.15, 1, 1, 0.4, 0, 0, -sx * 0.15); }
      eyes(0.46, -0.27, 0.06, 0.025); A(S(0.02), PINK, 0, 0.41, -0.29); A(S(0.07), W, 0, 0.26, 0.24); break;
    case 'penguin':
      A(capG(0.17, 0.2), c1, 0, 0.3, 0); A(S(0.14), c2, 0, 0.28, -0.08, 1, 1.3, 0.6); A(S(0.1), c2, 0, 0.5, -0.1, 1.1, 0.8, 0.6);
      A(coneG(0.035, 0.08), ORG, 0, 0.47, -0.2, 1, 1, 1, Math.PI / 2); eyes(0.53, -0.16, 0.055, 0.022);
      for (const sx of [-1, 1]) { A(S(0.08), c1, sx * 0.18, 0.3, 0, 0.35, 1.2, 0.8, 0, 0, sx * 0.25); A(S(0.05), ORG, sx * 0.07, 0.03, -0.06, 1, 0.4, 1.5); } break;
    case 'pig':
      A(S(0.22), c1, 0, 0.25, 0.02, 1, 0.9, 1.2); A(S(0.16), c1, 0, 0.42, -0.17); legs(c1, 0.06, 0.1, 0.12, 0.05);
      A(new THREE.CylinderGeometry(0.06, 0.065, 0.06, 14), c2, 0, 0.4, -0.32, 1, 1, 1, Math.PI / 2); for (const sx of [-1, 1]) A(S(0.013), 0x8a3a4a, sx * 0.022, 0.4, -0.355);
      for (const sx of [-1, 1]) A(coneG(0.05, 0.09), c1, sx * 0.1, 0.6, -0.15, 1, 1, 0.6, 0.3, 0, Math.PI + sx * 0.4);
      eyes(0.48, -0.3, 0.065, 0.022); A(new THREE.TorusGeometry(0.04, 0.012, 6, 12, Math.PI * 1.5), c2, 0, 0.32, 0.27, 1, 1, 1, 0, Math.PI / 2); break;
    default:                                                    // cún con
      A(S(0.2), c1, 0, 0.25, 0.03, 0.95, 0.85, 1.25); A(S(0.17), c1, 0, 0.46, -0.18); legs(c1);
      A(S(0.08), 0xf3e2cc, 0, 0.42, -0.32, 1.1, 0.85, 1.1); A(S(0.025), K, 0, 0.45, -0.4); eyes(0.51, -0.31);
      for (const sx of [-1, 1]) A(S(0.07), c2, sx * 0.15, 0.44, -0.15, 0.45, 1.2, 0.8, 0, 0, sx * 0.35);
      A(capG(0.03, 0.14), c2, 0, 0.38, 0.27, 1, 1, 1, -0.7);
  }
  g.userData = { flying, wings, body };
  return g;
}
// vị trí + dáng thú cưng theo trạng thái chủ: đi (chạy theo), đứng (ngồi cạnh), ngồi ghế (nằm trên đùi), nhảy (nhảy cạnh)
function updatePet(a, t, mode) {
  const p = a.pet; if (!p) return;
  const { flying, wings, body } = p.userData, ph = t * 9 + a.phase;
  p.scale.setScalar(mode === 'lap' ? 1.05 : 1.45); p.rotation.set(0, 0, 0); body.position.y = 0;
  if (flying) {
    for (const w of wings) w.rotation.z = w.userData.sx * Math.sin(t * 22) * 0.7;
    if (mode === 'lap') p.position.set(0.62, 2.9 + Math.sin(t * 3) * 0.04, 0.05);            // đậu cạnh vai khi chủ ngồi
    else p.position.set(0.95 + Math.sin(t * 1.3) * 0.1, 2.75 + Math.sin(t * 2.4 + a.phase) * 0.15, 0.25 + Math.cos(t * 1.1) * 0.15);
    return;
  }
  if (mode === 'walk') { p.position.set(0.95, 0, 0.75); body.position.y = Math.abs(Math.sin(ph * 0.8)) * 0.12; body.rotation.x = Math.sin(ph * 0.8) * 0.1; }
  else if (mode === 'lap') { p.position.set(0, 1.58, -0.55); body.rotation.x = 0; body.position.y = Math.sin(t * 1.5) * 0.01; }
  else if (mode === 'dance') { p.position.set(1.05, 0, 0.1); body.position.y = Math.max(0, Math.sin(t * 7 + 1)) * 0.25; p.rotation.y = Math.sin(t * 2) * 0.5; body.rotation.x = 0; }
  else { p.position.set(0.9, 0, 0.25); p.rotation.y = -0.5; body.rotation.x = 0; body.position.y = Math.abs(Math.sin(t * 1.6 + a.phase)) * 0.015; }
}
// dáng ngồi / đứng trên thú cưỡi
function setRide(a, on) {
  const want = on && a.mount ? a.mountPose : null;
  if (a.curRide === want) return;
  a.curRide = want;
  if (a.mount) { a.mount.visible = !!want; a.mount.position.y = 0; }
  a.body.rotation.y = want === 'skate' ? Math.PI / 2 : 0; a.head.rotation.y = want === 'skate' ? -1.0 : 0;
  a.legsRide.visible = want === 'sit';
  if (want === 'sit') { a.standG.visible = false; a.legsUp.visible = a.legsFlat.visible = false; a.armsSit.visible = true; a.upArms.forEach((m) => (m.visible = true)); a.upper.rotation.x = 0.04; }
  else if (!a.sitting) { a.standG.visible = true; a.legsUp.visible = a.legsFlat.visible = false; a.armsSit.visible = false; a.upArms.forEach((m) => (m.visible = false)); a.upper.rotation.x = 0; }
  if (!want) a.body.position.y = 0;
}
function ridePose(a, t) {
  const bob = a.mountBob ? Math.sin(t * 2 + a.phase) * 0.08 : 0;
  a.mount.position.y = bob; a.body.position.y = a.mountH + bob;
  a.armL.rotation.set(0, 0, 0); a.armR.rotation.set(0, 0, 0); a.upper.rotation.z = 0;
  if (a.mountPose === 'skate') {                              // đứng nghiêng, gối hơi khuỵu, dang tay giữ thăng bằng
    a.legL.rotation.x = 0.22; a.legR.rotation.x = -0.22;
    a.armL.rotation.z = -0.95 + Math.sin(t * 3 + a.phase) * 0.12; a.armR.rotation.z = 0.95 + Math.sin(t * 3 + a.phase) * 0.12;
    a.upper.rotation.z = Math.sin(t * 2.4 + a.phase) * 0.07; a.body.position.y -= 0.04;
  } else if (a.mountPose === 'scooter') {                     // 1 chân trước 1 chân sau, 2 tay nắm ghi-đông
    a.legL.rotation.x = 0.28; a.legR.rotation.x = -0.18; a.armL.rotation.x = a.armR.rotation.x = 1.05; a.armL.rotation.z = -0.15; a.armR.rotation.z = 0.15;
  } else { a.legL.rotation.x = a.legR.rotation.x = 0; }
}
// vỗ cánh: mỗi bên xoay quanh trục dọc ở gốc, chóp cánh luôn đưa ra sau lưng
function flapWings(w, t) {
  if (!w) return;
  const [base, amp, sp] = w.userData.flap;
  for (const sd of w.children) sd.rotation.y = -sd.userData.sx * (base + Math.sin(t * sp) * amp);
}

// ---- Các điệu nhảy (dùng chung cho sàn nhảy + xem trước trong tủ đồ). base = hướng mặt gốc, y0 = độ cao sàn
// ---- Điệu nhảy dạng keyframe: mỗi điệu có nhịp (bpm), số phách 1 vòng, các tư thế chuyển mượt (hoặc giật cục với robot).
// Trường tư thế: a* tay trái (x,y,z), b* tay phải, lx/lz chân trái, rx/rz chân phải, ux/uz thân trên, px/pz lệch hông, py nhún/nhảy,
// yaw xoay cả người, byaw xoay thân dưới đầu, hx/hy/hz đầu. Quy ước: tay x+ = giơ ra trước, tay trái z− / tay phải z+ = giơ sang ngang/lên.
const DP = (o = {}) => ({ ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, ae: 0, aez: 0, be: 0, bez: 0, lx: 0, lz: 0, rx: 0, rz: 0, ux: 0, uz: 0, px: 0, pz: 0, py: 0, yaw: 0, byaw: 0, hx: 0, hy: 0, hz: 0, ...o });
const mir = (o) => { const m = {}; for (const [k, v] of Object.entries(o)) {        // tư thế đối xứng trái ↔ phải
  const sw = { ax: 'bx', bx: 'ax', ay: 'by', by: 'ay', az: 'bz', bz: 'az', ae: 'be', be: 'ae', aez: 'bez', bez: 'aez', lx: 'rx', rx: 'lx', lz: 'rz', rz: 'lz' }[k];
  if (sw) m[sw] = k.endsWith('z') || k === 'ay' || k === 'by' ? -v : v; else m[k] = ['uz', 'px', 'yaw', 'byaw', 'hy', 'hz'].includes(k) ? -v : v; }
  return m; };
const DANCES = {
  // múa quạt: 2 tay giơ cao xoay vòng như cánh quạt, cổ tay (cẳng tay) quay liên tục, đầu lắc nhanh, nhún mạnh theo nhịp nhanh
  fan: { bpm: 140, beats: 2, bounce: 0.13, armSpin: Math.PI * 4, headShake: 0.32, keys: [
    { az: -2.3, aez: -0.9, ax: 0.3, bz: 1.6, bez: 1.2, bx: 0.5, hx: 0.25, uz: 0.09, px: -0.05, lz: -0.08, rz: 0.08 },
    { az: -1.6, aez: -1.2, ax: 0.5, bz: 2.3, bez: 0.9, bx: 0.3, hx: -0.12, uz: -0.09, px: 0.05, lz: -0.08, rz: 0.08 },
    { az: -2.6, aez: -0.4, ax: -0.2, bz: 2.0, bez: 1.4, bx: 0.8, hx: 0.3, yaw: 0.18, ux: -0.08, lx: 0.2 },
    { az: -2.0, aez: -1.4, ax: 0.8, bz: 2.6, bez: 0.4, bx: -0.2, hx: -0.15, yaw: -0.18, ux: -0.08, rx: 0.2 }] },
  bounce: { bpm: 122, beats: 2, bounce: 0.16, keys: [{ ax: 0.5, az: -0.3, ae: 1.2, bx: 0.5, bz: 0.3, be: 1.2, ux: -0.1, hx: 0.12 }, { bz: 2.7, bx: 0.15, ax: 0.4, az: -0.2, ae: 1.3, uz: -0.1, hy: -0.2 }, { ax: 0.5, az: -0.3, ae: 1.2, bx: 0.5, bz: 0.3, be: 1.2, ux: -0.1, hx: 0.12 }, { az: -2.7, ax: 0.15, bx: 0.4, bz: 0.2, be: 1.3, uz: 0.1, hy: 0.2 }] },
  wave: { bpm: 100, beats: 2, bounce: 0.05, keys: [{ az: -1.1, bz: 1.8, uz: 0.14, px: -0.07, hz: 0.12 }, { az: -1.8, bz: 1.1, uz: -0.14, px: 0.07, hz: -0.12 }] },
  spin: { bpm: 110, beats: 4, spin: Math.PI * 2, keys: [{ az: -1.5, bz: 1.5, lz: -0.12, rz: 0.12, py: 0.04 }, { az: -1.2, bz: 1.8, py: 0.1, rx: 0.4 }, { az: -1.5, bz: 1.5, py: 0.04 }, { az: -1.8, bz: 1.2, py: 0.1, lx: 0.4 }] },
  robot: { bpm: 104, beats: 4, snap: true, keys: [{ ax: 1.57, ae: 1.57, bz: 1.57, be: 1.57, hy: -0.45 }, { az: -1.57, ae: 1.57, bx: 1.57, be: 1.57, hy: 0.45, yaw: 0.3 }, { az: -2.9, bx: 1.57, be: 0, uz: 0.1 }, { az: -1.57, aez: -1.57, bz: 2.9, uz: -0.1, yaw: -0.3 }, { ax: 0.9, ae: 1.57, az: -0.6, bx: 0.9, be: 1.57, bz: 0.6, ux: -0.12, hx: 0.3 }, { az: -1.57, aez: 1.57, bz: 1.57, bez: -1.57, hy: 0.6 }, { ax: 1.57, bx: 1.57, hy: 0 }, {}] },
  hop: { bpm: 120, beats: 4, keys: [{ rx: -1.0, py: 0.38, ax: 0.7, ae: 0.9, bx: -0.6, be: 0.9, az: -0.3, bz: 0.3 }, { rx: -0.8, py: 0, ax: -0.5, bx: 0.6, ae: 0.9, be: 0.9 }, { rx: -1.0, py: 0.38, ax: 0.7, bx: -0.6, ae: 0.9, be: 0.9 }, { rx: 0, py: 0, ae: 0.9, be: 0.9 }, { lx: -1.0, py: 0.38, bx: 0.7, ax: -0.6, az: -0.3, bz: 0.3, ae: 0.9, be: 0.9 }, { lx: -0.8, py: 0, bx: -0.5, ax: 0.6, ae: 0.9, be: 0.9 }, { lx: -1.0, py: 0.38, bx: 0.7, ax: -0.6, ae: 0.9, be: 0.9 }, { lx: 0, py: 0, ae: 0.9, be: 0.9 }] },
  disco: { bpm: 118, beats: 4, bounce: 0.06, keys: [{ bz: 2.4, bx: 0.3, az: -0.4, ax: 0.3, uz: -0.14, px: 0.07, hy: -0.35, rx: 0.25 }, { bz: 0.6, bx: 1.0, az: -0.3, uz: 0.1, px: -0.07, hy: 0.2 },
    mir({ bz: 2.4, bx: 0.3, az: -0.4, ax: 0.3, uz: -0.14, px: 0.07, hy: -0.35, rx: 0.25 }), mir({ bz: 0.6, bx: 1.0, az: -0.3, uz: 0.1, px: -0.07, hy: 0.2 })] },
  shuffle: { bpm: 128, beats: 2, keys: [{ lx: 0.7, rx: -0.25, px: -0.09, ax: -0.5, bx: 0.5, ae: 1.1, be: 1.1, py: 0.07, yaw: 0.2 }, { lx: -0.1, rx: 0.15, px: 0, py: 0, ae: 1.1, be: 1.1 }, { rx: 0.7, lx: -0.25, px: 0.09, ax: 0.5, bx: -0.5, ae: 1.1, be: 1.1, py: 0.07, yaw: -0.2 }, { rx: -0.1, lx: 0.15, py: 0, ae: 1.1, be: 1.1 }] },
  clap: { bpm: 116, beats: 2, keys: [{ ax: 1.0, az: -0.6, ae: 0.6, bx: 1.0, bz: 0.6, be: 0.6 }, { ax: 1.1, az: -0.05, ae: 0.7, aez: 0.4, bx: 1.1, bz: 0.05, be: 0.7, bez: -0.4, py: 0.08, hx: 0.1 }, { ax: 1.0, az: -0.6, ae: 0.6, bx: 1.0, bz: 0.6, be: 0.6, uz: 0.08 }, { az: -2.75, ax: 0.25, aez: -0.5, bz: 2.75, bx: 0.25, bez: 0.5, py: 0.14, hx: -0.15 }] },
  cheer: { bpm: 112, beats: 2, keys: [{ py: -0.04, ux: -0.18, ax: 0.6, bx: 0.6, hx: 0.2 }, { py: 0.6, az: -2.6, bz: 2.6, lz: -0.28, rz: 0.28, hx: -0.2 }, { py: 0.02, az: -2.2, bz: 2.2 }, { bz: 2.85, bx: 0.2, az: -0.3, ax: 0.4, uz: -0.12 }] },
  sway: { bpm: 88, beats: 2, keys: [{ uz: 0.18, px: -0.09, az: -0.7, ax: 0.2, ae: 0.5, bz: 0.35, be: 0.5, hz: 0.16, yaw: 0.16 }, { uz: -0.18, px: 0.09, az: -0.35, ae: 0.5, bz: 0.7, bx: 0.2, be: 0.5, hz: -0.16, yaw: -0.16 }] },
  floss: { bpm: 132, beats: 2, bounce: 0.04, keys: [{ ax: 0.6, az: 0.5, bx: -0.6, bz: 0.75, px: -0.13, uz: -0.06 }, { ax: -0.6, az: -0.75, bx: 0.6, bz: -0.5, px: 0.13, uz: 0.06 },
    { ax: -0.6, az: 0.5, bx: 0.6, bz: 0.75, px: -0.13, uz: -0.06 }, { ax: 0.6, az: -0.75, bx: -0.6, bz: -0.5, px: 0.13, uz: 0.06 }] },
  dab: { bpm: 108, beats: 4, snap: true, keys: [{ ax: 0.3, bx: 0.3, ae: 0.8, be: 0.8, py: 0.05 }, { az: -2.2, ax: -0.2, bx: 1.3, bz: -0.35, be: 1.95, hx: 0.5, hz: -0.3, hy: -0.25, uz: -0.16, ux: -0.15 }, { az: -2.2, ax: -0.2, bx: 1.3, bz: -0.35, be: 1.95, hx: 0.5, hz: -0.3, hy: -0.25, uz: -0.16, ux: -0.15 }, { py: 0.06, ae: 0.8, be: 0.8 }, { ax: 0.3, bx: 0.3, ae: 0.8, be: 0.8 }, mir({ az: -2.2, ax: -0.2, bx: 1.3, bz: -0.35, be: 1.95, hx: 0.5, hz: -0.3, hy: -0.25, uz: -0.16, ux: -0.15 }), mir({ az: -2.2, ax: -0.2, bx: 1.3, bz: -0.35, be: 1.95, hx: 0.5, hz: -0.3, hy: -0.25, uz: -0.16, ux: -0.15 }), { ae: 0.8, be: 0.8 }] },
  moonwalk: { bpm: 100, beats: 8, keys: [
    { byaw: 1.57, px: -0.32, lx: -0.5, ax: 0.3, bx: -0.25, hy: -0.7 }, { byaw: 1.57, px: -0.1, rx: -0.5, ax: -0.25, bx: 0.3, hy: -0.7 }, { byaw: 1.57, px: 0.12, lx: -0.5, ax: 0.3, bx: -0.25, hy: -0.7 }, { byaw: 1.57, px: 0.32, rx: -0.5, ax: -0.25, bx: 0.3, hy: -0.7, py: 0.06 },
    { byaw: -1.57, px: 0.32, rx: -0.5, bx: 0.3, ax: -0.25, hy: 0.7 }, { byaw: -1.57, px: 0.1, lx: -0.5, bx: -0.25, ax: 0.3, hy: 0.7 }, { byaw: -1.57, px: -0.12, rx: -0.5, bx: 0.3, ax: -0.25, hy: 0.7 }, { byaw: -1.57, px: -0.32, lx: -0.5, bx: -0.25, ax: 0.3, hy: 0.7, py: 0.06 }] },
  runningman: { bpm: 128, beats: 2, keys: [{ lx: 1.15, rx: -0.35, ax: -0.7, bx: 0.85, ae: 1.4, be: 1.4, py: 0.08, ux: -0.1 }, { lx: 0.2, rx: -0.1, py: 0, ae: 1.4, be: 1.4 }, { rx: 1.15, lx: -0.35, ax: 0.85, bx: -0.7, ae: 1.4, be: 1.4, py: 0.08, ux: -0.1 }, { rx: 0.2, lx: -0.1, py: 0, ae: 1.4, be: 1.4 }] },
  kpopheart: { bpm: 110, beats: 4, keys: [{ ax: 1.0, ae: 0.9, az: 0.25, bx: 1.0, be: 0.9, bz: -0.25, hz: 0.16, uz: 0.08, px: -0.05 }, { az: -2.5, aez: -1.25, ax: 0.15, bz: 2.5, bez: 1.25, bx: 0.15, hz: -0.12, py: 0.06 }, { az: -2.45, aez: -1.3, ax: 0.25, bz: 2.45, bez: 1.3, bx: 0.25, hz: 0.12, uz: -0.07, py: 0.02 }, { ax: 0.5, ae: 2.3, az: 0.25, bx: 0.5, be: 2.3, bz: -0.25, hx: -0.12, hz: 0.22, px: 0.05 }] },
  zombie: { bpm: 80, beats: 4, keys: [{ ax: 1.5, bx: 1.5, az: 0.1, bz: -0.1, hz: 0.38, uz: 0.09, lx: 0.22, px: -0.06 }, { ax: 1.38, bx: 1.6, hz: -0.22, uz: -0.09, rx: 0.22, px: 0.06 },
    { ax: 1.6, bx: 1.38, hz: 0.42, hx: 0.3, ux: -0.14, lx: 0.26 }, { ax: 1.5, bx: 1.5, hz: -0.3, rx: 0.22 }] },
  horse: { bpm: 132, beats: 4, keys: [{ ax: 0.9, ae: 0.9, az: 0.5, bx: 0.9, be: 0.9, bz: -0.5, lx: 0.55, py: 0.14, hx: 0.1 }, { ax: 0.9, ae: 0.9, az: 0.5, bx: 0.9, be: 0.9, bz: -0.5, py: 0 }, { ax: 0.9, ae: 0.9, az: 0.5, bx: 0.9, be: 0.9, bz: -0.5, rx: 0.55, py: 0.14 }, { ax: 0.9, ae: 0.9, az: 0.5, bx: 0.9, be: 0.9, bz: -0.5, py: 0 }, { ax: 0.9, ae: 0.9, az: 0.45, bz: 2.8, bez: 0.6, by: 0, lx: 0.55, py: 0.14, uz: -0.1 }, { ax: 0.9, ae: 0.9, az: 0.45, bz: 2.8, bez: 0.6, by: 1.6, py: 0 }, { ax: 0.9, ae: 0.9, az: 0.45, bz: 2.8, bez: 0.6, by: 3.1, rx: 0.55, py: 0.14, uz: -0.1 }, { ax: 0.9, ae: 0.9, az: 0.45, bz: 2.8, bez: 0.6, by: 4.7, py: 0 }] },
  arms: { bpm: 104, beats: 8, keys: [{ bx: 1.57 }, { bx: 1.57, ax: 1.57 }, { bx: 1.3, bz: -0.5, be: 1.7, ax: 1.57 }, { ax: 1.3, az: 0.5, ae: 1.7, bx: 1.3, bz: -0.5, be: 1.7 }, { bz: 2.5, bez: 1.4, ax: 1.3, az: 0.5, ae: 1.7 }, { az: -2.5, aez: -1.4, bz: 2.5, bez: 1.4 }, { az: -0.5, aez: 1.7, bz: 0.5, bez: -1.7, px: -0.09, uz: 0.12 }, { az: -0.5, aez: 1.7, bz: 0.5, bez: -1.7, px: 0.09, uz: -0.12, py: 0.18, yaw: 1.2 }] },
  charleston: { bpm: 120, beats: 2, bounce: 0.05, keys: [{ lx: 0.65, yaw: 0.3, ax: 0.6, az: -0.6, bx: -0.4, bz: 0.6 }, { lx: -0.45, yaw: -0.3, ax: -0.4, bx: 0.6, az: -0.6, bz: 0.6 },
    { rx: 0.65, yaw: -0.3, bx: 0.6, bz: 0.6, ax: -0.4, az: -0.6 }, { rx: -0.45, yaw: 0.3, bx: -0.4, ax: 0.6, az: -0.6, bz: 0.6 }] },
  hiphop: { bpm: 96, beats: 2, keys: [{ ux: -0.16, py: -0.05, ax: 0.5, ae: 1.3, az: -0.35, bx: 0.5, be: 1.3, bz: 0.35, hx: 0.22 }, { ux: 0.05, py: 0.03, ax: 0.1, ae: 0.6, az: -0.2, bx: 1.1, be: 1.5, bz: 0.2, hx: -0.06, uz: 0.1, px: 0.06 }, { ux: -0.16, py: -0.05, ax: 0.5, ae: 1.3, az: -0.35, bx: 0.5, be: 1.3, bz: 0.35, hx: 0.22 }, { ux: 0.05, py: 0.03, ax: 1.1, ae: 1.5, az: -0.2, bx: 0.1, be: 0.6, bz: 0.2, hx: -0.06, uz: -0.1, px: -0.06 }] },
  salsa: { bpm: 112, beats: 4, keys: [{ lx: 0.32, px: -0.09, uz: 0.12, az: -1.0, ax: 0.3, ae: 0.7, bz: 0.8, bx: 0.5, be: 0.7, hy: 0.2 }, { lx: 0, rx: -0.22, px: 0, uz: 0, az: -0.9, bz: 0.9, ae: 0.7, be: 0.7 }, { rx: 0.32, px: 0.09, uz: -0.12, bz: 1.0, bx: 0.3, be: 0.7, az: -0.8, ax: 0.5, ae: 0.7, hy: -0.2 }, { rx: 0, lx: -0.22, az: -0.9, bz: 0.9, ae: 0.7, be: 0.7, yaw: 0.25 }] },
  twist: { bpm: 126, beats: 2, bounce: 0.04, keys: [{ yaw: 0.45, hy: -0.45, ax: 0.55, ae: 1.3, bx: -0.55, be: 1.3, az: -0.4, bz: 0.4, py: -0.03, lz: -0.1, rz: 0.1 }, { yaw: -0.45, hy: 0.45, ax: -0.55, ae: 1.3, bx: 0.55, be: 1.3, az: -0.4, bz: 0.4, py: -0.03, lz: -0.1, rz: 0.1 }] },
};
for (const D of Object.values(DANCES)) D.keys = D.keys.map(DP);
const DANCE_STYLES = Object.keys(DANCES);
const DANCE_FIELDS = Object.keys(DP());
function danceStep(a, style, t, base, y0) {
  const D = DANCES[style] || DANCES.bounce, g = a.g, bpm = D.bpm * (partyOn ? 1.2 : 1);
  const beat = t * bpm / 60 + a.phase * 0.15, ph = beat / D.beats, n = D.keys.length, u = (ph - Math.floor(ph)) * n, i = Math.floor(u), f = u - i;
  const e = D.snap ? Math.min(1, f / 0.3) * (2 - Math.min(1, f / 0.3)) : f * f * (3 - 2 * f);
  const A = D.keys[i], B = D.keys[(i + 1) % n], P = {};
  for (const k of DANCE_FIELDS) P[k] = A[k] + (B[k] - A[k]) * e;
  const sp = D.armSpin ? ph * D.armSpin : 0;                       // tay quay vòng liên tục (múa quạt)
  a.armL.rotation.set(P.ax, P.ay + sp, P.az); a.armR.rotation.set(P.bx, P.by - sp, P.bz);
  if (a.elbowL) { a.elbowL.rotation.set(P.ae, 0, P.aez); a.elbowR.rotation.set(P.be, 0, P.bez); }
  a.legL.rotation.set(P.lx, 0, P.lz); a.legR.rotation.set(P.rx, 0, P.rz);
  a.upper.rotation.x = P.ux; a.upper.rotation.z = P.uz;
  a.body.position.x = P.px; a.body.position.z = P.pz; a.body.rotation.y = P.byaw;
  a.head.rotation.set(P.hx, P.hy + (D.headShake ? Math.sin(beat * Math.PI * 4) * D.headShake : 0), P.hz);
  g.rotation.y = base + P.yaw + (D.spin ? ph * D.spin : 0);
  g.position.y = y0 + P.py + (D.bounce ? Math.abs(Math.sin(beat * Math.PI)) * D.bounce : 0);
  a.head.position.y = HEAD_Y + Math.sin(beat * Math.PI * 2) * 0.025;
  a.wasDancing = true;
}
// trả nhân vật về dáng thường sau khi nhảy (đi bộ / ngồi / xem trước)
function resetDancePose(a) {
  if (!a.wasDancing) return; a.wasDancing = false;
  a.armL.rotation.set(0, 0, 0); a.armR.rotation.set(0, 0, 0); a.legL.rotation.set(0, 0, 0); a.legR.rotation.set(0, 0, 0);
  if (a.elbowL) { a.elbowL.rotation.set(0, 0, 0); a.elbowR.rotation.set(0, 0, 0); }
  a.upper.rotation.z = 0; if (!a.sitting || a.dancing) a.upper.rotation.x = 0;
  a.body.position.x = a.body.position.z = 0; a.body.rotation.y = 0; a.head.rotation.set(0, 0, 0);
}
const DEFAULT_RECLINE = 0.3;
function reclineAngle(T, v) { return T.rMin + v * (T.rMax - T.rMin); }
function setSitting(a, sit) {
  a.curRide = null; a.body.rotation.y = 0; a.head.rotation.y = 0; a.body.position.y = 0; a.legsRide.visible = false; if (a.mount) { a.mount.visible = false; a.mount.position.y = 0; }
  if (sit && isDance(a.seat)) {                               // lên sàn nhảy: đứng, nhảy
    a.sitting = true; a.dancing = true; a.standG.visible = true; a.armsSit.visible = false;
    a.legsUp.visible = a.legsFlat.visible = false; a.upper.rotation.x = 0; a.upArms.forEach((m) => (m.visible = false)); a.backG.visible = true;
    return;
  }
  a.dancing = false;
  const T = sit && a.seat != null ? seatType(a.seat) : null;
  a.backG.visible = !T;
  const v = a.recline ?? DEFAULT_RECLINE;
  const flat = !!T && (T.legs === 'flat' || (T.legrest && v >= 0.25));   // gác chân bật lên → duỗi chân
  a.sitting = !!T; a.standG.visible = !T; a.armsSit.visible = !!T;
  a.legsUp.visible = !!T && !flat; a.legsFlat.visible = flat;
  a.upper.rotation.x = T ? reclineAngle(T, v) : 0;          // ngả lưng theo mức người dùng chỉnh
  a.upArms.forEach((m) => (m.visible = !!T));
}
function placeAtSeat(a, seat, snap) {
  const p = seatPos(seat); a.g.position.set(p.x, floorY(p.z), p.z); if (snap) a.g.rotation.y = isDance(seat) ? Math.PI : 0;
  a.seat = seat; a.path = []; setSitting(a, true);
  for (const [uid, av] of avatars) if (av === a && !pendingFood.has(uid)) showFood(seat, lastFood.get(uid));
}
function removeAvatar(a) {
  clearTimeout(a.timer); disposeSprite(a.bubble); disposeSprite(a.name); scene.remove(a.g); walkers.delete(a);
}
function showBubble(id, text) {
  const a = avatars.get(id); if (!a) return;
  disposeSprite(a.bubble); clearTimeout(a.timer);
  a.bubble = makeBubbleSprite(text, a.bubbleSkin); a.bubble.position.set(0, 3.35 * AV_S, 0); a.g.add(a.bubble);
  a.name.visible = false;                                   // bong bóng thế chỗ nhãn tên khi đang hiện
  a.timer = setTimeout(() => { disposeSprite(a.bubble); a.bubble = null; a.name.visible = labelsOn; }, 8000);
}

// Đứng dậy (nếu đang ngồi) và trả về điểm xuất phát trên đường đi
function standUpStart(a) {
  if (a.sitting) { setSitting(a, false); return gapPoint(a.seat); }      // bước ra khe cạnh ghế
  const p = a.g.position;
  if (a.seat != null && !a.leaving && !isDance(a.seat)) {                  // đang bước vào ghế cũ → lùi ra khe trước
    const sp = seatPos(a.seat);
    if (Math.abs(p.z - LANE(seatRow(a.seat))) > 0.2 && Math.hypot(p.x - sp.x, p.z - sp.z) < 1.6) return gapPoint(a.seat);
  }
  return null;
}
function retarget(a, seat) {
  const start = standUpStart(a);
  a.path = start ? [start, ...routeFrom(start, seat)] : routeFrom(a.g.position, seat);
  a.seat = seat; a.leaving = false;
}
function sendOut(a) {
  const start = standUpStart(a);
  a.path = start ? [start, ...routeToExit(start)] : routeToExit(a.g.position);
  a.leaving = true; a.seat = null;
}
function onArrive(a) {
  if (a.leaving) return removeAvatar(a);
  if (a.seat != null) placeAtSeat(a, a.seat, false);
}
function updateAvatars(dt, t) {
  for (const a of [...walkers]) {
    const g = a.g;
    if (a.wings) flapWings(a.wings, t + a.phase);
    if (a.path.length) {
      const tp = a.path[0], dx = tp.x - g.position.x, dz = tp.z - g.position.z, d = Math.hypot(dx, dz), step = WALK_SPEED * dt;
      if (d > 0.001) {
        let df = Math.atan2(-dx, -dz) - g.rotation.y; df = Math.atan2(Math.sin(df), Math.cos(df));
        g.rotation.y += df * Math.min(1, dt * 14);
      }
      if (d <= step) { g.position.x = tp.x; g.position.z = tp.z; a.path.shift(); if (!a.path.length) onArrive(a); }
      else { g.position.x += (dx / d) * step; g.position.z += (dz / d) * step; }
      g.position.y += (floorY(g.position.z, g.position.x) - g.position.y) * Math.min(1, dt * 12);   // lên/xuống bậc thang
      resetDancePose(a); a.walkPhase += dt * 9; a.body.position.x = 0; a.upper.rotation.z = 0; a.armL.rotation.z = a.armR.rotation.z = 0;
      const sw = Math.sin(a.walkPhase), riding = !!a.mount && !a.sitting;
      setRide(a, riding);
      if (riding) ridePose(a, t);                                 // dáng riêng theo từng thú cưỡi
      else { a.legL.rotation.x = sw * 0.65; a.legR.rotation.x = -sw * 0.65; a.armL.rotation.x = -sw * 0.55; a.armR.rotation.x = sw * 0.55; }
      updatePet(a, t, 'walk');
      a.head.position.y = HEAD_Y + (riding ? 0 : Math.abs(sw) * 0.05);
    } else if (a.dancing) {                                   // nhảy theo combo điệu đã chọn (mỗi điệu 4 giây)
      const sp = seatPos(a.seat);
      setRide(a, false);
      if (isDJ(a.seat)) djStep(a, t, floorY(sp.z));             // DJ: tay trên đĩa, gật đầu theo nhịp
      else danceStep(a, a.dances[Math.floor(t / 4) % a.dances.length], t, Math.PI, floorY(sp.z));
      updatePet(a, t, 'dance');
    } else {
      if (a.sitting) { let df = -g.rotation.y; df = Math.atan2(Math.sin(df), Math.cos(df)); g.rotation.y += df * Math.min(1, dt * 10); }
      a.legL.rotation.x = a.legR.rotation.x = a.armL.rotation.x = a.armR.rotation.x = 0;
      a.armL.rotation.z = a.armR.rotation.z = 0; a.upper.rotation.z = 0; a.body.position.x = 0;
      resetDancePose(a); setRide(a, false);
      updatePet(a, t, a.sitting ? 'lap' : 'idle');
      a.head.position.y = HEAD_Y + Math.sin(t * 1.6 + a.phase) * 0.025;
    }
  }
}

let myId = null, mySeat = null;
const taken = new Map();      // seat -> socket id
const seatOwner = new Map();  // seat -> tên người ngồi
let onSeatsChanged = () => {};
// =====================================================================
//  Căn tin: chọn món → nhân viên từ quầy (cuối rạp) bưng khay đúng món tới ghế → đặt lên tay vịn / khay
// =====================================================================
const MENU = [
  { id: 'popcorn',        kind: 'food',  name: 'Bắp rang bơ',      desc: 'Xô lớn, giòn thơm',     sw: '#f3c64b' },
  { id: 'popcorn_cheese', kind: 'food',  name: 'Bắp phô mai',      desc: 'Phủ phô mai cam',       sw: '#f09a2a' },
  { id: 'hotdog',         kind: 'food',  name: 'Hotdog',           desc: 'Xúc xích nướng, mù tạt', sw: '#c0623a' },
  { id: 'fries',          kind: 'food',  name: 'Khoai tây chiên',  desc: 'Hộp vừa',               sw: '#e8b84a' },
  { id: 'nachos',         kind: 'food',  name: 'Nachos',           desc: 'Kèm sốt phô mai',       sw: '#e6a93c' },
  { id: 'soda',           kind: 'drink', name: 'Nước ngọt có ga',  desc: 'Ly lớn, nhiều đá',      sw: '#c8263a' },
  { id: 'milktea',        kind: 'drink', name: 'Trà sữa trân châu', desc: 'Size L',               sw: '#b98a5c' },
  { id: 'juice',          kind: 'drink', name: 'Nước cam',         desc: 'Cam vắt',               sw: '#f28c28' },
  { id: 'coffee',         kind: 'drink', name: 'Cà phê sữa',       desc: 'Nóng',                  sw: '#6b4a32' },
  { id: 'water',          kind: 'drink', name: 'Nước suối',        desc: 'Chai 500ml',            sw: '#6fb6ff' },
];
const MENU_BY_ID = Object.fromEntries(MENU.map((m) => [m.id, m]));
const MAX_ORDER = 6;

// Mô hình 3D từng món (đơn vị thế giới, cao ~0.3–0.5)
function makeFoodProp(id) {
  const g = new THREE.Group();
  const cyl = (rt, rb, h, color, y, o) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 18), smat(color, o)); m.position.y = y; g.add(m); return m; };
  const ball = (r, color, x, y, z) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), smat(color)); m.position.set(x, y, z); g.add(m); return m; };
  const straw = (color, x = 0.03) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6), smat(color)); m.position.set(x, 0.38, 0); m.rotation.z = -0.25; g.add(m); };
  switch (id) {
    case 'popcorn': case 'popcorn_cheese': {
      cyl(0.17, 0.12, 0.36, 0xd8283a, 0.18);
      for (const y of [0.08, 0.2, 0.32]) cyl(0.12 + y * 0.14 + 0.003, 0.12 + y * 0.14 + 0.003, 0.05, 0xf4f1ea, y);   // sọc trắng
      const c = id === 'popcorn' ? 0xf6dc7a : 0xf0a030;
      for (let k = 0; k < 9; k++) { const a = k * 2.4; ball(0.055, c, Math.cos(a) * 0.09 * (k % 3) / 2, 0.39 + (k % 2) * 0.04, Math.sin(a) * 0.09 * (k % 3) / 2); }
      break;
    }
    case 'hotdog': {
      const tray = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.14), smat(0xf4f1ea)); tray.position.y = 0.015; g.add(tray);
      const bun = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.2, 4, 10), smat(0xd9a35a)); bun.rotation.z = Math.PI / 2; bun.position.y = 0.08; g.add(bun);
      const sau = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.26, 4, 10), smat(0xa0402a)); sau.rotation.z = Math.PI / 2; sau.position.y = 0.13; g.add(sau);
      const mus = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.012, 0.015), smat(0xf2c92e)); mus.position.y = 0.168; g.add(mus);
      break;
    }
    case 'fries': {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.17, 0.09), smat(0xd8283a)); box.position.y = 0.085; g.add(box);
      for (let k = 0; k < 8; k++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.14, 0.018), smat(0xf0c050)); f.position.set(-0.055 + (k % 4) * 0.037, 0.2 + (k % 3) * 0.015, -0.02 + Math.floor(k / 4) * 0.04); f.rotation.z = (k % 2 ? 0.15 : -0.12); g.add(f); }
      break;
    }
    case 'nachos': {
      const tray = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.2), smat(0x1d1d20)); tray.position.y = 0.02; g.add(tray);
      for (let k = 0; k < 6; k++) { const n = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.02, 3), smat(0xe6b04a)); n.position.set(-0.1 + (k % 3) * 0.06, 0.055, -0.04 + Math.floor(k / 3) * 0.06); n.rotation.y = k; g.add(n); }
      cyl(0.04, 0.035, 0.05, 0xf09a2a, 0.065).position.x = 0.09;
      break;
    }
    case 'soda': cyl(0.085, 0.065, 0.3, 0xc8263a, 0.15); cyl(0.088, 0.088, 0.02, 0xf4f1ea, 0.31); straw(0xf4f1ea); break;
    case 'juice': cyl(0.08, 0.062, 0.28, 0xf28c28, 0.14); cyl(0.083, 0.083, 0.02, 0xf4f1ea, 0.29); straw(0x2fbf8f); break;
    case 'milktea': {
      cyl(0.085, 0.068, 0.3, 0xead7bd, 0.15, { transparent: true, opacity: 0.55 });
      cyl(0.075, 0.06, 0.24, 0xb98a5c, 0.13);
      for (let k = 0; k < 7; k++) ball(0.02, 0x1a1210, Math.cos(k) * 0.035, 0.03, Math.sin(k) * 0.035);
      cyl(0.088, 0.088, 0.02, 0xf4f1ea, 0.31);
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.24, 8), smat(0x1d1d20)); st.position.set(0.02, 0.38, 0); st.rotation.z = -0.2; g.add(st);
      break;
    }
    case 'coffee': cyl(0.07, 0.055, 0.22, 0xf4f1ea, 0.11); cyl(0.073, 0.068, 0.08, 0x6b4a32, 0.11); cyl(0.074, 0.074, 0.025, 0x2a1d14, 0.235); break;
    case 'water': cyl(0.05, 0.05, 0.3, 0x8fcfff, 0.15, { transparent: true, opacity: 0.6 }); cyl(0.03, 0.05, 0.05, 0x8fcfff, 0.32, { transparent: true, opacity: 0.6 }); cyl(0.025, 0.025, 0.04, 0x2f6fd0, 0.36); break;
  }
  return g;
}
// Xếp danh sách món lên 1 khay / bề mặt: hàng 3 món, cách nhau 0.2
function layoutProps(ids, parent, cols = 3, dx = 0.2, dz = 0.2) {
  ids.forEach((id, k) => { const p = makeFoodProp(id); p.position.set((k % cols - (Math.min(cols, ids.length) - 1) / 2) * dx, 0, Math.floor(k / cols) * dz - 0.05); parent.add(p); });
}
function makeTray(ids) {
  const g = new THREE.Group();
  const board = new THREE.Mesh(new RoundedBoxGeometry(0.72, 0.035, 0.46, 2, 0.015), smat(0xb8bcc4, { metalness: 0.7, roughness: 0.3 }));
  g.add(board);
  const items = new THREE.Group(); items.position.y = 0.02; g.add(items);
  layoutProps(ids, items, 3, 0.22, 0.2);
  return g;
}
function disposeTree(o) { o.traverse((m) => { if (m.geometry && !rgeoCache.has(m.geometry)) m.geometry.dispose?.(); }); }

// Món đang có trên ghế (đã được mang tới)
const seatFood = new Map();   // seat -> { key, group }
function showFood(seat, ids) {
  if (!isRealSeat(seat)) return;                             // sàn nhảy không có khay đồ ăn
  const key = (ids || []).join(',');
  const cur = seatFood.get(seat);
  if (cur && cur.key === key) return;
  if (cur) { scene.remove(cur.group); disposeTree(cur.group); seatFood.delete(seat); }
  if (!key) return;
  const S = SEAT_INFO[seat], T = TRAY[S.type], g = new THREE.Group();
  g.position.set(S.x + T.x * AV_S, floorY(S.z) + (T.y + 0.035) * AV_S, S.z + T.z * AV_S);
  // xếp món lên mặt khay: tối đa 3 cột × 2 hàng, đồ uống hàng sau, đồ ăn hàng trước
  const sorted = [...ids].sort((p, q) => (MENU_BY_ID[p].kind === 'drink' ? 0 : 1) - (MENU_BY_ID[q].kind === 'drink' ? 0 : 1));
  const cols = Math.min(3, sorted.length), rows = Math.ceil(sorted.length / 3);
  const dx = (T.w * AV_S - 0.08) / 3, dz = (T.d * AV_S - 0.06) / 2;
  sorted.forEach((id, k) => {
    const pr = makeFoodProp(id); pr.scale.setScalar(S.type === 'bed' ? 0.95 : 0.8);
    const r = Math.floor(k / 3), c = k % 3, inRow = Math.min(3, sorted.length - r * 3);
    pr.position.set((c - (inRow - 1) / 2) * dx, 0, (r - (rows - 1) / 2) * dz * (rows > 1 ? 1 : 0) + (rows > 1 ? 0 : 0));
    g.add(pr);
  });
  scene.add(g); seatFood.set(seat, { key, group: g });
}

// ---- Quầy căn tin ở góc trái sàn sau + 2 nhân viên đứng quầy
const COUNTER = new THREE.Vector3(-(HALL_X - 5.5), 0, HALL_BACK - 5);      // tâm quầy
const COUNTER_FRONT = TPLC.decor === 'cinema' ? new THREE.Vector3(COUNTER.x + 1.5, 0, COUNTER.z - 2.2) : new THREE.Vector3(ENTRANCE.x + 0.8, 0, ENTRANCE.z);  // chỗ nhân viên bước ra / quay về
if (TPLC.decor === 'cinema') {
  const y0 = TOP_H;
  rb(7, 1.4, 1.5, 0x2a1b13, COUNTER.x, y0 + 0.7, COUNTER.z, scene, 0.08, { roughness: 0.5 });                // quầy gỗ
  box(7.1, 0.08, 1.6, 0xc9a24a, COUNTER.x, y0 + 1.44, COUNTER.z, scene, { metalness: 0.7, roughness: 0.35 }); // mặt quầy viền vàng
  rb(7.4, 5, 0.6, 0x151517, COUNTER.x, y0 + 2.5, COUNTER.z + 2.4, scene, 0.06);                               // tủ sau quầy
  // bảng tên CĂN TIN phát sáng
  const c = document.createElement('canvas'); c.width = 768; c.height = 180; const x = c.getContext('2d');
  x.fillStyle = '#0d0d0f'; x.fillRect(0, 0, 768, 180); x.strokeStyle = '#c9a24a'; x.lineWidth = 6; x.strokeRect(8, 8, 752, 164);
  x.font = '800 92px system-ui,"Segoe UI",sans-serif'; x.fillStyle = '#e8c27a'; x.textAlign = 'center'; x.textBaseline = 'middle';
  if ('letterSpacing' in x) x.letterSpacing = '14px';
  x.fillText('CĂN TIN', 384, 96);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.08), new THREE.MeshBasicMaterial({ map: t }));
  sign.position.set(COUNTER.x, y0 + 4.2, COUNTER.z + 2.08); sign.rotation.y = Math.PI; scene.add(sign);
  // máy bắp rang (hộp kính) + vài món trưng bày trên quầy
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 0.9), smat(0xfff2c4, { transparent: true, opacity: 0.35, roughness: 0.1 }));
  glass.position.set(COUNTER.x - 2.3, y0 + 2.05, COUNTER.z); scene.add(glass);
  const corn = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.35, 0.8), smat(0xf6dc7a)); corn.position.set(COUNTER.x - 2.3, y0 + 1.68, COUNTER.z); scene.add(corn);
  const lamp = new THREE.PointLight(0xffd59a, 40, 12, 1.6); lamp.position.set(COUNTER.x, y0 + 3.6, COUNTER.z - 1); scene.add(lamp);
  ['soda', 'milktea', 'popcorn', 'juice'].forEach((id, k) => { const p = makeFoodProp(id); p.scale.setScalar(1.3); p.position.set(COUNTER.x + 0.2 + k * 0.7, y0 + 1.48, COUNTER.z - 0.2); scene.add(p); });
  // nhân viên đứng quầy (đứng yên)
  for (const dx of [-0.8, 1.6]) {
    const a = createAvatar({ name: 'Nhân viên' }, false, { shirt: 0x1d1d22 });
    a.g.position.set(COUNTER.x + dx, y0, COUNTER.z + 1.2); setSitting(a, false); scene.add(a.g);
  }
}

// ---- Nhân viên giao món: đi từ quầy → lối đi → làn sau ghế → đưa khay → quay về quầy
const staffList = [];
const pendingFood = new Set();     // uid đang chờ giao (chưa hiện món trên ghế)
const lastFood = new Map();        // uid -> danh sách món mới nhất từ server
const STAFF_SPEED = 6.5;
function routeTo(p, dest) {        // từ làn / lối đi về một điểm trên sàn sau (quầy)
  const pts = [], pa = aisleOf(p.x);
  if (p.z < CROSS_Z - 0.3) { if (Math.abs(p.x - pa) > 0.05) pts.push(V3(pa, p.z)); pts.push(V3(pa, CROSS_Z)); }
  pts.push(V3(dest.x, dest.z));
  return pts;
}
function spawnDelivery(uid, seat, items) {
  const a = createAvatar({ name: 'Nhân viên' }, false, { shirt: 0x1d1d22 });
  setSitting(a, false);
  a.g.position.set(COUNTER_FRONT.x, TOP_H, COUNTER_FRONT.z);
  const tray = makeTray(items); tray.position.set(0, 1.95 * AV_S, -0.55 * AV_S); a.g.add(tray);
  a.armL.rotation.x = a.armR.rotation.x = -1.2;                // 2 tay bưng khay
  const route = routeFrom(a.g.position, seat); route.pop();    // dừng ở khe cạnh ghế (không bước vào ghế)
  const st = { a, uid, seat, items, tray, path: route, state: 'go', wait: 0 };
  scene.add(a.g); staffList.push(st); pendingFood.add(uid);
}
function stepToward(a, path, speed, dt) {
  const g = a.g;
  if (!path.length) return true;
  const tp = path[0], dx = tp.x - g.position.x, dz = tp.z - g.position.z, d = Math.hypot(dx, dz), step = speed * dt;
  if (d > 0.001) { let df = Math.atan2(-dx, -dz) - g.rotation.y; df = Math.atan2(Math.sin(df), Math.cos(df)); g.rotation.y += df * Math.min(1, dt * 14); }
  if (d <= step) { g.position.x = tp.x; g.position.z = tp.z; path.shift(); }
  else { g.position.x += (dx / d) * step; g.position.z += (dz / d) * step; }
  g.position.y += (floorY(g.position.z, g.position.x) - g.position.y) * Math.min(1, dt * 12);
  a.walkPhase += dt * 9; const sw = Math.sin(a.walkPhase);
  a.legL.rotation.x = sw * 0.6; a.legR.rotation.x = -sw * 0.6;
  return !path.length;
}
function updateStaff(dt) {
  for (const st of [...staffList]) {
    const a = st.a;
    if (st.state === 'go') {
      if (stepToward(a, st.path, STAFF_SPEED, dt)) {
        const owner = avatars.get(st.uid);
        if (owner && isRealSeat(owner.seat) && owner.seat !== st.seat) {    // khách đã đổi chỗ → đi tới chỗ mới
          st.seat = owner.seat; st.path = routeFrom(a.g.position, st.seat); st.path.pop();
        } else { st.state = 'serve'; st.wait = 1.2; a.legL.rotation.x = a.legR.rotation.x = 0; }
      }
    } else if (st.state === 'serve') {
      const S = SEAT_INFO[st.seat];
      let df = Math.atan2(-(S.x - a.g.position.x), -(S.z - a.g.position.z)) - a.g.rotation.y; df = Math.atan2(Math.sin(df), Math.cos(df));
      a.g.rotation.y += df * Math.min(1, dt * 8);
      st.wait -= dt;
      if (st.wait <= 0) {
        const owner = avatars.get(st.uid);
        pendingFood.delete(st.uid);
        if (owner && owner.seat === st.seat) showFood(st.seat, lastFood.get(st.uid) || st.items);   // đặt đúng món lên ghế
        a.g.remove(st.tray); disposeTree(st.tray);
        a.armL.rotation.x = a.armR.rotation.x = 0;
        st.state = 'back'; st.path = routeTo(a.g.position, COUNTER_FRONT);
      }
    } else if (stepToward(a, st.path, STAFF_SPEED, dt)) {                 // về tới quầy → biến mất
      scene.remove(a.g); disposeSprite(a.name); staffList.splice(staffList.indexOf(st), 1);
    }
  }
}

// ---- Ảnh món ăn: chụp mô hình 3D của chính món đó (giống hệt món nhân viên bưng ra), lưu cache
const foodThumbs = new Map();
let ftR = null, ftScene = null, ftCam = null;
function foodThumb(id) {
  if (foodThumbs.has(id)) return foodThumbs.get(id);
  if (!ftR) {
    ftR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); ftR.setPixelRatio(1); ftR.setSize(128, 128);
    ftR.outputColorSpace = THREE.SRGBColorSpace;
    ftScene = new THREE.Scene();
    ftScene.add(new THREE.HemisphereLight(0xffffff, 0x50443a, 1.7));
    const d = new THREE.DirectionalLight(0xffffff, 1.6); d.position.set(1.5, 2.5, 2); ftScene.add(d);
    ftCam = new THREE.PerspectiveCamera(30, 1, 0.01, 20);
  }
  const prop = makeFoodProp(id); ftScene.add(prop);
  const box = new THREE.Box3().setFromObject(prop), c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
  const r = Math.max(sz.x, sz.y, sz.z) * 0.5, dist = r / Math.sin(THREE.MathUtils.degToRad(15)) * 0.95;
  ftCam.position.set(c.x + dist * 0.45, c.y + dist * 0.42, c.z + dist * 0.79); ftCam.lookAt(c);
  ftR.setClearColor(0x000000, 0); ftR.clear(); ftR.render(ftScene, ftCam);
  const url = ftR.domElement.toDataURL('image/png');
  ftScene.remove(prop); prop.traverse((o) => o.geometry && o.geometry.dispose());
  foodThumbs.set(id, url); return url;
}
// ---- Bảng căn tin (trong menu bên phải)
const orderQty = {};
function renderMenu() {
  const list = $('menuList'); list.textContent = '';
  for (const kind of ['food', 'drink']) {
    const h = document.createElement('div'); h.className = 'menu-h'; h.textContent = kind === 'food' ? 'Đồ ăn' : 'Đồ uống'; list.appendChild(h);
    for (const m of MENU.filter((x) => x.kind === kind)) {
      const row = document.createElement('div'); row.className = 'menu-row';
      const sw = document.createElement('i'); sw.className = 'sw'; sw.style.setProperty('--fc', m.sw); const im = document.createElement('img'); im.src = foodThumb(m.id); im.alt = m.name; im.draggable = false; sw.appendChild(im);
      const txt = document.createElement('div'); txt.className = 'mt';
      const nm = document.createElement('b'); nm.textContent = m.name; const ds = document.createElement('small'); ds.textContent = m.desc; txt.append(nm, ds);
      const qty = orderQty[m.id] || 0;
      const minus = document.createElement('button'); minus.textContent = '−'; minus.disabled = !qty;
      const q = document.createElement('span'); q.className = 'q'; q.textContent = qty;
      const plus = document.createElement('button'); plus.textContent = '+'; plus.disabled = totalOrder() >= MAX_ORDER;
      minus.onclick = () => { orderQty[m.id] = Math.max(0, qty - 1); renderMenu(); };
      plus.onclick = () => { if (totalOrder() < MAX_ORDER) { orderQty[m.id] = qty + 1; renderMenu(); } };
      const st = document.createElement('div'); st.className = 'step'; st.append(minus, q, plus);
      row.append(sw, txt, st); list.appendChild(row);
    }
  }
  const n = totalOrder();
  $('menuSum').textContent = n ? `Đã chọn ${n}/${MAX_ORDER} món` : `Chọn tối đa ${MAX_ORDER} món`;
  $('btnOrder').disabled = !n || !isRealSeat(mySeat);
}
function totalOrder() { return Object.values(orderQty).reduce((a, b) => a + b, 0); }
function orderList() { const out = []; for (const m of MENU) for (let k = 0; k < (orderQty[m.id] || 0); k++) out.push(m.id); return out; }
function describeItems(ids) {
  const cnt = {}; ids.forEach((id) => (cnt[id] = (cnt[id] || 0) + 1));
  return Object.entries(cnt).map(([id, n]) => `${n} ${MENU_BY_ID[id].name}`).join(', ');
}

// ---- Ngả lưng: người ngồi tự chỉnh (gửi lên server để mọi người cùng thấy)
let myReclineLocal = null, reclineSendT = 0;
function setMyRecline(v) {
  v = Math.round(THREE.MathUtils.clamp(v, 0, 1) * 100) / 100;
  myReclineLocal = v; localStorage.setItem('rc_recline', v);
  const a = myAvatar(); if (a) { a.recline = v; if (a.sitting) setSitting(a, true); }
  if (isRealSeat(mySeat)) setSeatPose(mySeat, v);
  seatFitKey = '';                                             // góc nhìn từ ghế cập nhật theo độ ngả
  clearTimeout(reclineSendT); reclineSendT = setTimeout(() => socket.emit('seat:recline', v), 120);
}
// Chỉ khi đã có ghế mới hiện nút "góc nhìn từ ghế" + thanh ngả lưng; rạp đầy thì vẫn xem bằng các góc khác
function updateSeatUI() {
  const seated = isRealSeat(mySeat);                           // đang nhảy thì không có góc nhìn ghế / ngả lưng / căn tin
  $('dLeave').querySelector('.lbl').textContent = isDJ(mySeat) ? 'Rời bàn DJ' : isDance(mySeat) ? 'Rời sàn nhảy' : 'Rời ghế';
  document.querySelector('#bl [data-cam=seat]').classList.toggle('hidden', !seated);
  $('reclineBox').classList.toggle('hidden', !seated || camMode !== 'seat');   // ngả lưng chỉ chỉnh ở góc nhìn từ ghế
  updateFeedUI();
  $('dCanteen').classList.toggle('hidden', !seated); $('dLeave').classList.toggle('hidden', mySeat == null);
  if (!seated && panel === 'canteen') openPanel('canteen');
  if (panel === 'canteen') renderMenu();
  if (seated) $('recline').value = Math.round((myReclineLocal ?? DEFAULT_RECLINE) * 100);
  if (!seated && camMode === 'seat') setCamMode('audience', true);
}
function rebuildAvatar(id, u) {
  const old = avatars.get(id), a = createAvatar(u, u.id === myId);
  a.g.position.copy(old.g.position); a.g.rotation.copy(old.g.rotation);
  a.seat = old.seat; a.path = old.path; a.leaving = old.leaving; a.recline = old.recline;
  removeAvatar(old); avatars.set(id, a); walkers.add(a); scene.add(a.g);
  setSitting(a, old.sitting);
  refreshChairs(hoverSeat);                                  // màu + skin ghế theo đồ mới
  return a;
}
function syncAvatars(users, first) {
  const seen = new Set(); taken.clear(); seatOwner.clear(); mySeat = null;
  if (first) { for (const a of [...walkers]) removeAvatar(a); avatars.clear(); }
  for (const u of users) {
    if (u.seat == null) continue;
    seen.add(u.id); taken.set(u.seat, u.id); seatOwner.set(u.seat, u.name); if (u.id === myId) mySeat = u.seat;
    let a = avatars.get(u.id);
    if (!a) {
      a = createAvatar(u, u.id === myId); avatars.set(u.id, a); walkers.add(a); scene.add(a.g);
      if (first) placeAtSeat(a, u.seat, true);                        // người có sẵn trong rạp: đã ngồi
      else {                                                           // người mới vào: đi từ cửa tới ghế
        a.g.position.copy(ENTRANCE); a.g.rotation.y = Math.PI; a.seat = u.seat; setSitting(a, false);
        a.path = routeFrom(ENTRANCE, u.seat);
      }
    } else if (a.seat !== u.seat) retarget(a, u.seat);               // đổi ghế: đứng dậy, đi bộ tới ghế mới
    if (a.lookKey !== JSON.stringify(u.look || null)) a = rebuildAvatar(u.id, u);
    lastFood.set(u.id, u.food || []);
    const rv = u.id === myId && myReclineLocal != null ? myReclineLocal : (u.recline ?? DEFAULT_RECLINE);
    if (a.recline !== rv) { a.recline = rv; if (a.sitting) setSitting(a, true); }
  }
  for (const [id, a] of avatars) if (!seen.has(id)) { avatars.delete(id); sendOut(a); }  // rời rạp: đi ra cửa
  refreshChairs(-1);
  // ghế có người → ngả theo người đó; ghế trống → dựng thẳng, gập gác chân
  for (let i = 0; i < SEATS; i++) {
    const uid = taken.get(i), a = avatars.get(uid);
    setSeatPose(i, a ? a.recline ?? DEFAULT_RECLINE : 0);
    if (!uid) showFood(i, []);                                   // ghế trống → dọn món
    else if (!pendingFood.has(uid) && a && a.seat === i && !a.path.length) showFood(i, lastFood.get(uid));   // món đã giao (hoặc người vào sau thấy luôn)
  }
  $('seatLbl').textContent = mySeat != null ? seatName(mySeat) : 'Đứng';
  updateSeatUI();
  if (leaveWait && mySeat == null) { clearTimeout(leaveWait); leaveWait = 0; toast('Bạn đã rời ghế — vẫn xem được, chọn ghế để ngồi lại'); }
  onSeatsChanged();
}

// ---- Skin ghế theo chủ đề: trang trí gắn lên ghế của người ngồi (base = theo ghế, back = theo lưng ghế khi ngả).
// Toạ độ theo ghế thường chưa scale: mặt ngồi y≈0.95, tay vịn x=±0.58 y≈1.3; lưng: tính từ khớp, cao 0.05→1.42, mặt sau z≈0.25
const SEAT_SKIN_ICON = { dragon: '🐉', princess: '🎀', knight: '🛡️', royal: '👑', skeleton: '💀', candy: '🍭', gaming: '🎮', ice: '❄️', flower: '🌻', cat: '🐱', rocket: '🚀', shell: '🐚', pumpkin: '🎃', cloud: '☁️' };
function buildSeatSkin(style, c1, c2) {
  // Trang trí chủ yếu ở MẶT SAU lưng ghế (người ngồi sau nhìn thấy). Toạ độ lưng: tính từ khớp, cao 0.05→1.42, mặt sau z≈0.28
  const base = new THREE.Group(), back = new THREE.Group(); back.position.copy(HINGE.back); base.add(back);
  const MT = (c) => (typeof c === 'number' ? tmat(c) : c);
  const A = (par, geo, col, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(geo, MT(col)); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz); par.add(m); return m; };
  const G = (k, f) => cachedGeo('sk_' + k, f);
  const S = (r) => sphG(r), CN = (r, h, n = 12) => G('cn' + r + h + n, () => new THREE.ConeGeometry(r, h, n)), CY = (r1, r2, h, n = 20) => G('cy' + r1 + r2 + h + n, () => new THREE.CylinderGeometry(r1, r2, h, n));
  const BX = (w, h, d, r = 0.03) => G('bx' + w + h + d + r, () => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)));
  const TO = (R, r, arc = Math.PI * 2) => G('to' + R + r + arc, () => new THREE.TorusGeometry(R, r, 8, 28, arc));
  const glow = (c) => new THREE.MeshBasicMaterial({ color: c }), metal = (c) => smat(c, { metalness: 0.75, roughness: 0.3 });
  const shapeM = (pts, c) => { const sh = new THREE.Shape(); pts.forEach(([x, y], k) => (k ? sh.lineTo(x, y) : sh.moveTo(x, y))); return new THREE.Mesh(new THREE.ShapeGeometry(sh), tmat(c, { side: THREE.DoubleSide })); };
  const disc = (r, col, x, y, z, sx = 1, sy = 1) => A(back, CY(r, r, 0.04, 28), col, x, y, z, Math.PI / 2, 0, 0, sx, 1, sy);   // đĩa phẳng úp vào mặt sau
  const Z = 0.3;                                              // mặt sau lưng ghế
  const plate = (col) => A(back, BX(0.98, 1.36, 0.05, 0.06), col, 0, 0.74, Z - 0.01);   // ốp lưng sau theo màu chủ đề
  switch (style) {
    case 'dragon': {
      plate(c1);
      for (const sx of [-1, 1]) {                             // đôi cánh rồng xoè ra sau lưng
        const w = shapeM([[0, 0], [0.45, 0.5], [0.95, 0.62], [0.8, 0.2], [0.9, -0.15], [0.6, -0.05], [0.55, -0.42], [0.25, -0.25]].map(([x, y]) => [x * sx, y]), c1);
        w.position.set(sx * 0.12, 0.95, Z + 0.06); w.rotation.y = -sx * 0.35; back.add(w);
        for (const [ex, ey] of [[0.95, 0.62], [0.8, 0.2], [0.9, -0.15], [0.55, -0.42]]) A(w, capG(0.022, Math.hypot(ex, ey)), c2, ex * sx / 2, ey / 2, 0.012, 0, 0, Math.atan2(ey, ex * sx) - Math.PI / 2);
      }
      for (let k = 0; k < 5; k++) A(back, CN(0.06, 0.2), c2, 0, 1.3 - k * 0.27, Z + 0.1, Math.PI / 2);      // gai sống lưng
      for (let k = 0; k < 8; k++) A(back, S(0.08), new THREE.Color(c1).multiplyScalar(0.7).getHex(), k % 2 ? 0.2 : -0.2, 0.3 + Math.floor(k / 2) * 0.27, Z + 0.03, 0, 0, 0, 1, 0.8, 0.35);   // vảy
      for (const sx of [-1, 1]) A(back, CN(0.07, 0.42), c2, sx * 0.3, 1.58, 0.2, 0.7, 0, -sx * 0.4);   // sừng trên đỉnh
      break;
    }
    case 'princess': {
      plate(c1);
      for (const sx of [-1, 1]) A(back, S(0.22), c2, sx * 0.16, 0.95, Z + 0.06, 0, 0, 0, 1, 1, 0.35);   // trái tim lớn
      A(back, CN(0.3, 0.42, 4), c2, 0, 0.7, Z + 0.06, 0, Math.PI / 4, Math.PI, 1, 1, 0.3);
      for (const sx of [-1, 1]) A(back, S(0.08), 0xff6f9e, sx * 0.1, 1.22, Z + 0.1, 0, 0, sx * 0.5, 1.5, 0.8, 0.5);   // nơ
      A(back, S(0.05), 0xff6f9e, 0, 1.22, Z + 0.12);
      for (let k = 0; k <= 10; k++) { A(back, S(0.03), 0xffffff, -0.46 + k * 0.092, 1.42, Z + 0.03); A(back, S(0.03), 0xffffff, -0.46 + k * 0.092, 0.07, Z + 0.03); }   // viền ngọc trai
      for (let k = 1; k < 14; k++) for (const sx of [-1, 1]) A(back, S(0.03), 0xffffff, sx * 0.47, 0.07 + k * 0.1, Z + 0.03);
      A(back, CY(0.13, 0.13, 0.1, 16), metal(0xe8c24a), 0, 1.52, 0.12);                                    // vương miện nhỏ trên đỉnh
      for (let k = 0; k < 5; k++) { const an = k / 5 * Math.PI * 2; A(back, CN(0.03, 0.09), metal(0xe8c24a), Math.cos(an) * 0.13, 1.61, 0.12 + Math.sin(an) * 0.13); }
      break;
    }
    case 'knight': {
      plate(new THREE.Color(c1).multiplyScalar(0.6).getHex());
      for (const sx of [-1, 1]) { const sw = new THREE.Group(); sw.position.set(0, 0.8, Z + 0.06); sw.rotation.z = sx * 0.62; back.add(sw);   // 2 thanh kiếm bắt chéo
        A(sw, BX(0.07, 1.25, 0.02, 0.01), metal(c2), 0, 0.15, 0); A(sw, BX(0.32, 0.05, 0.05), metal(0xc9a24a), 0, -0.48, 0); A(sw, CY(0.03, 0.03, 0.22, 8), 0x3a2818, 0, -0.62, 0); A(sw, S(0.04), metal(0xc9a24a), 0, -0.75, 0); }
      disc(0.36, metal(c1), 0, 0.8, Z + 0.1, 1, 1.25);                                                      // khiên
      A(back, BX(0.08, 0.6, 0.03), metal(c2), 0, 0.8, Z + 0.13); A(back, BX(0.46, 0.08, 0.03), metal(c2), 0, 0.88, Z + 0.13);
      A(back, TO(0.36, 0.03), metal(c2), 0, 0.8, Z + 0.12, 0, 0, 0, 1, 1.25, 1);
      A(back, S(0.16), 0xc8263a, 0, 1.56, 0.12, 0, 0, 0, 0.5, 1.2, 1.8);                                     // chùm lông mũ giáp
      break;
    }
    case 'royal': {
      A(back, BX(1.1, 1.0, 0.16, 0.08), c1, 0, 1.8, 0.14);                                                  // lưng ngai cao
      plate(c1);
      for (const sx of [-1, 1]) A(back, BX(0.06, 2.2, 0.08), metal(c2), sx * 0.52, 1.2, Z + 0.02);       // khung vàng mặt sau
      A(back, BX(1.1, 0.06, 0.08), metal(c2), 0, 2.3, Z - 0.08); A(back, BX(1.04, 0.06, 0.08), metal(c2), 0, 0.08, Z + 0.02);
      disc(0.24, metal(c2), 0, 1.1, Z + 0.05); disc(0.17, c1, 0, 1.1, Z + 0.075);                              // huy hiệu hoàng gia
      A(back, S(0.07), glow(0xd02a4a), 0, 1.1, Z + 0.1);
      for (const [x, y] of [[0, 1.75], [-0.3, 0.45], [0.3, 0.45]]) A(back, S(0.05), glow(0x3a7bd5), x, y, Z + 0.05);
      A(back, CY(0.2, 0.2, 0.16, 16), metal(c2), 0, 2.42, 0.14);
      for (let k = 0; k < 5; k++) { const an = k / 5 * Math.PI * 2; A(back, CN(0.05, 0.14), metal(c2), Math.cos(an) * 0.2, 2.56, 0.14 + Math.sin(an) * 0.2); }
      break;
    }
    case 'skeleton': {
      plate(c1);
      A(back, S(0.25), c2, 0, 1.12, Z + 0.1, 0, 0, 0, 1, 0.95, 0.6);                                        // đầu lâu nhìn ra sau
      A(back, BX(0.26, 0.11, 0.1, 0.04), c2, 0, 0.9, Z + 0.1);
      for (const sx of [-1, 1]) A(back, S(0.06), 0x111114, sx * 0.09, 1.14, Z + 0.24, 0, 0, 0, 1, 1, 0.5);
      A(back, CN(0.03, 0.07), 0x111114, 0, 1.03, Z + 0.24, 0, 0, Math.PI);
      for (let k = 0; k < 4; k++) A(back, TO(0.32 - k * 0.03, 0.026, Math.PI), c2, 0, 0.2 + k * 0.15, Z + 0.03, 0, 0, Math.PI, 1, 0.6, 1);   // xương sườn
      A(back, G('spine', () => new THREE.CapsuleGeometry(0.035, 0.5, 4, 8)), c2, 0, 0.45, Z + 0.05);
      for (const sx of [-1, 1]) { const bn = A(back, G('bone', () => new THREE.CapsuleGeometry(0.035, 0.7, 4, 8)), c2, 0, 0.8, Z + 0.04, 0, 0, sx * 0.7); for (const e of [-1, 1]) for (const d of [-0.035, 0.035]) A(bn, S(0.045), c2, d, e * 0.4, 0); }
      break;
    }
    case 'candy': {
      plate(0xffffff);
      for (let k = 0; k < 6; k++) A(back, BX(0.98, 0.08, 0.02, 0.01), c1, 0, 0.15 + k * 0.23, Z + 0.025, 0, 0, 0.3);   // sọc kẹo
      A(back, CY(0.025, 0.025, 0.7, 8), 0xffffff, 0, 0.55, Z + 0.06);                                                 // que kẹo mút
      disc(0.34, c1, 0, 1.0, Z + 0.08);
      for (const [r, c] of [[0.27, c2], [0.19, 0xffffff], [0.11, c2]]) A(back, TO(r, 0.025), c, 0, 1.0, Z + 0.11);
      A(back, G('wrap', () => new THREE.CapsuleGeometry(0.1, 0.3, 6, 12)), c2, 0, 1.52, 0.12, 0, 0, Math.PI / 2);   // kẹo gói trên đỉnh
      for (const sx of [-1, 1]) A(back, CN(0.09, 0.14), c1, sx * 0.32, 1.52, 0.12, 0, 0, sx * Math.PI / 2);
      break;
    }
    case 'gaming': {
      plate(c1);
      for (const sx of [-1, 1]) { A(back, BX(0.16, 1.1, 0.34, 0.06), c1, sx * 0.53, 0.75, 0.08, 0, -sx * 0.35); A(back, BX(0.03, 1.2, 0.03, 0.01), glow(c2), sx * 0.47, 0.75, Z + 0.03); }
      A(back, BX(0.5, 0.2, 0.14, 0.06), c1, 0, 1.52, 0.04); A(back, BX(0.52, 0.03, 0.15, 0.01), glow(c2), 0, 1.62, 0.04);
      const hex = G('hexr', () => new THREE.TorusGeometry(0.22, 0.025, 6, 6));
      A(back, hex, glow(c2), 0, 0.95, Z + 0.04, 0, 0, Math.PI / 6);
      A(back, shapeM([[-0.08, -0.1], [0.12, 0], [-0.08, 0.1]], c2).geometry, glow(c2), 0, 0.95, Z + 0.045);         // logo tam giác "play"
      for (let k = 0; k < 3; k++) A(back, BX(0.6 - k * 0.12, 0.025, 0.02, 0.01), glow(c2), 0, 0.42 - k * 0.1, Z + 0.035);
      break;
    }
    case 'ice': {
      plate(new THREE.Color(c1).multiplyScalar(0.85).getHex());
      const im = smat(c1, { transparent: true, opacity: 0.85, roughness: 0.1, metalness: 0.1, emissive: c2, emissiveIntensity: 0.3 });
      const oct = G('oct', () => new THREE.OctahedronGeometry(0.15, 0));
      for (const [x, y, sc, rz] of [[0, 0.95, 2.0, 0], [-0.24, 0.8, 1.4, 0.4], [0.26, 0.78, 1.35, -0.4], [-0.36, 0.45, 1.0, 0.6], [0.37, 0.48, 1.0, -0.6], [0.12, 0.42, 0.9, -0.2], [-0.1, 1.32, 0.9, 0.2]])
        A(back, oct, im, x, y, Z + 0.08, 0, 0.4, rz, sc * 0.6, sc * 1.3, sc * 0.45);
      for (const sx of [-1, 1]) A(back, oct, im, sx * 0.3, 1.55, 0.12, 0, 0, -sx * 0.3, 0.5, 1.0, 0.5);
      break;
    }
    case 'flower': {
      plate(c1);
      disc(0.22, 0x5a3a1a, 0, 0.92, Z + 0.07);
      for (let k = 0; k < 16; k++) { const an = k / 16 * Math.PI * 2; A(back, S(0.11), c2, Math.cos(an) * 0.36, 0.92 + Math.sin(an) * 0.36, Z + 0.05, 0, 0, an, 1.9, 0.75, 0.25); }   // hoa hướng dương
      for (let k = 0; k < 10; k++) { const an = k / 10 * Math.PI * 2; A(back, S(0.025), 0x3a2410, Math.cos(an) * 0.12, 0.92 + Math.sin(an) * 0.12, Z + 0.1); }
      A(back, CY(0.025, 0.025, 0.4, 8), c1, 0, 0.35, Z + 0.06);
      for (const sx of [-1, 1]) A(back, S(0.1), new THREE.Color(c1).multiplyScalar(1.25).getHex(), sx * 0.13, 0.3, Z + 0.06, 0, 0, sx * 0.6, 1.6, 0.6, 0.3);
      break;
    }
    case 'cat': {
      plate(c1);
      A(back, S(0.36), c1, 0, 0.92, Z + 0.06, 0, 0, 0, 1.1, 0.95, 0.35);                                // mặt mèo nhìn ra sau
      for (const sx of [-1, 1]) { A(back, CN(0.14, 0.26, 4), c1, sx * 0.25, 1.26, Z + 0.06, 0, Math.PI / 4, -sx * 0.35, 1, 1, 0.5); A(back, CN(0.07, 0.15, 4), 0xffb3c6, sx * 0.25, 1.24, Z + 0.1, 0, Math.PI / 4, -sx * 0.35, 1, 1, 0.4);
        A(back, S(0.055), 0x1b1b1f, sx * 0.13, 0.98, Z + 0.17, 0, 0, 0, 1, 1.3, 0.5); A(back, S(0.018), 0xffffff, sx * 0.13 - 0.015, 1.01, Z + 0.2);
        for (const d of [-1, 1]) A(back, capG(0.008, 0.22), 0x1b1b1f, sx * 0.3, 0.86 + d * 0.04, Z + 0.17, 0, 0, Math.PI / 2 + sx * d * 0.15); }
      A(back, S(0.12), c2, 0, 0.83, Z + 0.15, 0, 0, 0, 1.3, 0.8, 0.5); A(back, S(0.03), 0xff8fa3, 0, 0.88, Z + 0.21);
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0.3, 0.2, Z + 0.04), new THREE.Vector3(0.5, 0.35, Z + 0.15), new THREE.Vector3(0.55, 0.75, Z + 0.15), new THREE.Vector3(0.45, 1.05, Z + 0.12), new THREE.Vector3(0.5, 1.2, Z + 0.1)]);
      A(back, G('ctail2', () => new THREE.TubeGeometry(curve, 24, 0.05, 8)), c1, 0, 0, 0);
      break;
    }
    case 'rocket': {
      plate(c1);
      A(back, G('rbody', () => new THREE.CapsuleGeometry(0.22, 0.6, 8, 16)), c1, 0, 0.8, Z + 0.14, 0, 0, 0, 1, 1, 0.6);
      A(back, CN(0.22, 0.32), c2, 0, 1.38, Z + 0.14, 0, 0, 0, 1, 1, 0.6);
      A(back, TO(0.11, 0.025), metal(0xc9ced6), 0, 0.95, Z + 0.28); disc(0.1, glow(0x7ad7f0), 0, 0.95, Z + 0.26);
      for (const sx of [-1, 1]) { const f = shapeM([[0, 0], [0.22 * sx, -0.12], [0.22 * sx, -0.42], [0, -0.25]], c2); f.position.set(sx * 0.2, 0.62, Z + 0.14); back.add(f); }
      A(back, CN(0.14, 0.32), glow(0xff8a2a), 0, 0.22, Z + 0.14, 0, 0, Math.PI); A(back, CN(0.08, 0.22), glow(0xfff0a0), 0, 0.25, Z + 0.15, 0, 0, Math.PI);
      for (const [x, y] of [[-0.35, 1.2], [0.36, 1.05], [-0.3, 0.45], [0.33, 0.3]]) A(back, S(0.025), glow(0xffffff), x, y, Z + 0.03);
      break;
    }
    case 'shell': {
      for (let k = 0; k < 9; k++) { const an = -1.05 + k * 0.2625;                                   // vỏ sò xoè lớn sau lưng
        A(back, S(0.12), k % 2 ? c1 : new THREE.Color(c1).multiplyScalar(1.15).getHex(), Math.sin(an) * 0.4, 0.42 + Math.cos(an) * 0.52, Z + 0.06, 0, 0, -an, 0.75, 4.6, 0.35); }
      A(back, S(0.13), smat(c2, { metalness: 0.4, roughness: 0.15 }), 0, 0.38, Z + 0.14);
      for (const sx of [-1, 1]) A(back, S(0.1), c1, sx * 0.14, 0.3, Z + 0.08, 0, 0, 0, 1.2, 0.6, 0.4);
      break;
    }
    case 'pumpkin': {
      for (let k = 0; k < 5; k++) A(back, S(0.25), k % 2 ? c1 : new THREE.Color(c1).multiplyScalar(0.9).getHex(), -0.34 + k * 0.17, 0.85, Z + 0.06, 0, 0, 0, 0.75, 1.25, 0.45);   // bí ngô
      const dark = 0x2a1206;
      for (const sx of [-1, 1]) A(back, shapeM([[-0.08, -0.05], [0.08, -0.05], [0, 0.08]], dark).geometry, glow(0xffb040), sx * 0.15, 0.98, Z + 0.18);   // mắt khắc phát sáng
      A(back, shapeM([[-0.22, 0.04], [-0.12, -0.04], [-0.04, 0.03], [0.04, -0.04], [0.12, 0.03], [0.22, -0.02], [0.12, -0.12], [-0.12, -0.12]], dark).geometry, glow(0xffb040), 0, 0.72, Z + 0.18);
      A(back, CY(0.04, 0.05, 0.2, 8), c2, 0, 1.38, Z + 0.06, 0, 0, 0.2); A(back, S(0.1), c2, 0.14, 1.36, Z + 0.06, 0, 0, 0.5, 1.6, 0.25, 1);
      break;
    }
    case 'cloud': {
      plate(c1);
      const rb2 = [0xff5a5a, 0xffa53a, 0xffe14a, 0x6ad66a, 0x5aa8ff, 0xa77bff];
      rb2.forEach((c, k) => A(back, TO(0.42 - k * 0.04, 0.022, Math.PI), c, 0, 0.62, Z + 0.04));                 // cầu vồng
      for (const [x, y, r, k] of [[-0.36, 0.6, 0.15, 0], [-0.22, 0.56, 0.12, 1], [0.36, 0.6, 0.15, 0], [0.22, 0.56, 0.12, 1], [0, 1.3, 0.18, 0], [-0.2, 1.25, 0.13, 1], [0.2, 1.26, 0.14, 0]])
        A(back, S(r), k ? c2 : 0xffffff, x, y, Z + 0.07, 0, 0, 0, 1, 1, 0.6);
      break;
    }
  }
  // Tựa đầu cao cấp riêng cho ghế có skin: cao hơn ghế thường ~0.5, bọc nệm màu chủ đề + viền kim loại màu phụ + huy hiệu sau lưng.
  // Đặt lùi ra sau đầu người ngồi (không chạm tóc); đồ trang trí trên đỉnh được đẩy lên theo.
  if (style !== 'royal') {
    const HR = 0.5;
    for (const ch of back.children) if (ch.position.y > 1.44) ch.position.y += HR + 0.12;   // sừng, vương miện, tai mèo… lên đỉnh tựa đầu mới
    const pad = new THREE.Color(c1), padDark = pad.clone().multiplyScalar(0.72).getHex(), trim = metal(c2), zc = 0.34;
    for (const sx of [-1, 1]) A(back, CY(0.035, 0.035, 0.42, 10), trim, sx * 0.2, 1.47, zc - 0.02);                 // 2 trụ đỡ
    for (const y of [1.47, 2.09]) A(back, BX(0.86, 0.05, 0.27, 0.02), trim, 0, y, zc);                                // viền khung trên / dưới
    for (const sx of [-1, 1]) A(back, BX(0.05, 0.66, 0.27, 0.02), trim, sx * 0.42, 1.78, zc);                          // viền khung 2 bên
    A(back, BX(0.8, 0.6, 0.24, 0.11), c1, 0, 1.78, zc);                                                                  // gối tựa đầu
    for (const sx of [-1, 1]) A(back, BX(0.14, 0.5, 0.3, 0.06), padDark, sx * 0.43, 1.76, zc - 0.03, 0, sx * 0.35);     // 2 cánh ôm đầu
    A(back, BX(0.62, 0.028, 0.02, 0.01), trim, 0, 1.9, zc - 0.125); A(back, BX(0.62, 0.028, 0.02, 0.01), trim, 0, 1.66, zc - 0.125);   // đường chỉ viền mặt trước
    for (const [x, y] of [[-0.18, 1.78], [0, 1.78], [0.18, 1.78]]) A(back, S(0.025), trim, x, y, zc - 0.12);              // nút bọc nệm
    A(back, BX(0.5, 0.06, 0.2, 0.03), trim, 0, 2.15, zc);                                                                // nẹp đỉnh
    disc(0.11, trim, 0, 1.8, zc + 0.13); A(back, S(0.05), glow(c2), 0, 1.8, zc + 0.155);                                // huy hiệu mặt sau
  }
  return { base, back };
}
function syncSeatSkin(i, occ) {
  const sk = occ && occ.seatSkin, key = sk ? sk.style + sk.c + sk.a : '', cur = seatSkins[i];
  if ((cur ? cur.key : '') === key) return;
  if (cur) { scene.remove(cur.root); seatSkins[i] = null; }
  if (!sk) return;
  const S = SEAT_INFO[i], hx = (h, d) => (isHex(h) ? parseInt(h.slice(1), 16) : d);
  const b = buildSeatSkin(sk.style, hx(sk.c, 0x888888), hx(sk.a, 0xffffff));
  b.base.position.set(S.x, floorY(S.z), S.z); b.base.scale.setScalar(AV_S); b.back.rotation.x = seatBackAng[i];
  scene.add(b.base); seatSkins[i] = { key, root: b.base, back: b.back };
}
let hoverSeat = -1;
function refreshChairs(hover) {
  hoverSeat = hover;
  for (let i = 0; i < SEATS; i++) {
    const occ = taken.has(i) ? avatars.get(taken.get(i)) : null;
    const c = i === hover && !taken.has(i) ? CH.hover : occ && occ.seatTint ? occ.seatTint : i === mySeat ? CH.mine : taken.has(i) ? seatColors[i].taken : seatColors[i].free;
    for (const p of seatParts[i]) if (p.state) p.mesh.setColorAt(p.k, c);
    syncSeatSkin(i, occ);
  }
  stateMeshes.forEach((m) => (m.instanceColor.needsUpdate = true));
  danceRings.forEach((r, k) => r.material.color.setHex(SEATS + k === mySeat ? 0xf5c04a : taken.has(SEATS + k) ? 0x8a3a5c : 0xff5fa2));
}

// Ghế trong cảnh 3D không bấm được nữa: chỉ đổi chỗ qua nút "Chọn chỗ ngồi" ở thanh bên phải.

// =====================================================================
//  3 góc nhìn: 'seat' = từ ghế của mình, 'screen' = sát màn hình, 'audience' = ghế khán giả (xoay tự do)
// =====================================================================
const SCR_CENTER = new THREE.Vector3(0, SCR_Y, SCR_Z);
const camGoalPos = new THREE.Vector3(), camGoalLook = new THREE.Vector3(), camLook = new THREE.Vector3().copy(CAM_TARGET);
let camMode = localStorage.getItem('rc_cam') || 'seat';
let camBlend = 0;            // > 0 khi đang chuyển cảnh mượt giữa 2 góc nhìn
let lookYaw = 0, lookPitch = 0; // kéo chuột để liếc quanh (chỉ ở góc nhìn từ màn ảnh)
let baseFov = 42, camGoalFov = 42;

// Khoảng cách để màn hình vừa khít khung hình (chừa ~4% viền)
function screenFitDistance() {
  const tv = Math.tan(THREE.MathUtils.degToRad(baseFov / 2));
  return Math.max((SCR_H / 2) * 1.04 / tv, (SCR_W / 2) * 1.04 / (tv * camera.aspect));
}
function myAvatar() { return myId ? avatars.get(myId) : null; }

// Đặt hướng nhìn = hướng tới `base` + phần liếc bằng chuột (lookYaw/lookPitch)
function aimFrom(base, extraPitch = 0) {
  const dir = base.clone().sub(camGoalPos);
  const dist = dir.length();
  const yaw = Math.atan2(dir.x, -dir.z) + lookYaw;
  const pitch = THREE.MathUtils.clamp(Math.asin(dir.y / dist) + extraPitch + lookPitch, -1.45, 1.2);   // cúi được gần thẳng xuống (xem khay đồ ăn)
  camGoalLook.set(
    camGoalPos.x + Math.sin(yaw) * Math.cos(pitch) * dist,
    camGoalPos.y + Math.sin(pitch) * dist,
    camGoalPos.z - Math.cos(yaw) * Math.cos(pitch) * dist);
}
// ---- Góc nhìn từ ghế: đứng yên ở đúng ghế, nhìn thẳng vào tâm màn hình, không lắc theo nhân vật.
// Đảm bảo thấy TRỌN màn hình (cả 4 góc): trước tiên mở rộng góc nhìn (fov) tới SEAT_MAX_FOV;
// nếu vẫn chưa đủ (hàng đầu, ghế sát mép) thì lùi mắt ra sau một chút theo hướng ghế→màn.
const SEAT_MAX_FOV = 68, SEAT_MARGIN = 1.08;
const SCR_CORNERS = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) => new THREE.Vector3(sx * (SCR_W / 2 + 0.3), SCR_Y + sy * (SCR_H / 2 + 0.3), SCR_Z));
const probeCam = new THREE.PerspectiveCamera(), tmpV = new THREE.Vector3();
let seatFitKey = '', seatFitPos = new THREE.Vector3(), seatFitFov = 42;

// fov dọc (độ) cần để thấy cả 4 góc màn hình từ vị trí `pos`
function fovNeeded(pos, target = SCR_CENTER) {
  probeCam.position.copy(pos); probeCam.lookAt(target); probeCam.updateMatrixWorld(true);
  let t = 0;
  for (const c of SCR_CORNERS) {
    tmpV.copy(c).applyMatrix4(probeCam.matrixWorldInverse);
    const z = Math.max(0.01, -tmpV.z);
    t = Math.max(t, Math.abs(tmpV.y) / z, Math.abs(tmpV.x) / z / camera.aspect);
  }
  return THREE.MathUtils.radToDeg(2 * Math.atan(t * SEAT_MARGIN));
}
function seatEye(out) {
  // mắt khi nằm ngả: đầu lùi ra sau + thấp hơn lúc ngồi thẳng
  if (isRealSeat(mySeat)) {
    const T = seatType(mySeat), rc = reclineAngle(T, myReclineLocal ?? DEFAULT_RECLINE), p = seatPos(mySeat);
    const ey = (1.08 + (HEAD_Y + 0.05) * Math.cos(rc)) * AV_S, ez = (HEAD_Y * Math.sin(rc) - 0.3) * AV_S;
    const lift = seatType(mySeat).legs === 'flat' ? 1.1 : 0;   // giường: như đang tựa gối ngồi dậy, khỏi bị chăn che tầm nhìn
    return out.set(p.x, floorY(p.z) + ey + lift, p.z + ez - lift * 0.4);
  }
  const z = LAND_Z0 + 2; return out.set(0, floorY(z) + 3.9, z);           // chưa có ghế: đứng xem ở sàn sau           // chưa có ghế: đứng xem ở cuối lối đi
}
// Ngả lưng càng sâu thì đầu càng ngửa ra sau → tầm nhìn ngước lên theo (giường nằm ngửa nhiều nhất)
let seatFitPitch = 0;
function seatReclinePitch() {
  if (!isRealSeat(mySeat)) return 0;
  const T = seatType(mySeat), v = myReclineLocal ?? DEFAULT_RECLINE;
  return (reclineAngle(T, v) - T.rMin) * 0.3;
}
function seatView() {
  const key = mySeat + '|' + camera.aspect.toFixed(3) + '|' + baseFov + '|' + (myReclineLocal ?? DEFAULT_RECLINE);
  if (key !== seatFitKey) {
    seatFitKey = key;
    const eye = seatEye(new THREE.Vector3());
    // điểm nhìn khi đầu ngả theo lưng ghế (chưa tính kéo chuột); nếu ngước quá làm màn bị cắt thì giảm bớt độ ngước
    camGoalPos.copy(eye); const lp = lookPitch, ly = lookYaw; lookPitch = lookYaw = 0;
    let need = 0;
    for (seatFitPitch = seatReclinePitch(); ; seatFitPitch = Math.max(0, seatFitPitch - 0.02)) {
      aimFrom(SCR_CENTER, seatFitPitch); need = fovNeeded(eye, camGoalLook);
      if (need <= 72 || seatFitPitch <= 0) break;
    }
    lookPitch = lp; lookYaw = ly;
    seatFitPos.copy(eye);
    seatFitFov = THREE.MathUtils.clamp(need, baseFov, 75);
  }
  // mặc định: hướng về màn nhưng ngước lên theo độ ngả lưng (như đầu đang tựa vào ghế); kéo chuột để quay đầu
  camGoalPos.copy(seatFitPos); aimFrom(SCR_CENTER, seatFitPitch); camGoalFov = seatFitFov;
}
const AUDIENCE_CENTER = new THREE.Vector3(0, 4.5, LAND_Z0 / 2);

function computeCamGoal() {
  camGoalFov = baseFov;
  if (camMode === 'screen') {
    camGoalPos.set(0, SCR_Y, SCR_Z + screenFitDistance());
    camGoalLook.copy(SCR_CENTER);
  } else if (camMode === 'stage') {
    // đứng trước màn ảnh, nhìn xuống khán giả
    camGoalPos.set(0, SCR_Y - 2.2, SCR_Z + 1.4);
    aimFrom(AUDIENCE_CENTER);
  } else if (camMode === 'seat') {
    seatView();
  } else {
    camGoalPos.copy(CAM_POS); camGoalLook.copy(CAM_TARGET); camGoalFov = audFov();
  }
}

function setCamMode(m, silent) {
  if (!['seat', 'screen', 'stage', 'audience'].includes(m)) m = 'seat';
  camMode = m; localStorage.setItem('rc_cam', m);
  lookYaw = lookPitch = 0; viewZoom = 1; camBlend = 1; audZoom = AUD_ZOOM0;
  controls.enabled = false;
  document.querySelectorAll('#bl [data-cam]').forEach((b) => b.classList.toggle('on', b.dataset.cam === m));
  $('reclineBox').classList.toggle('hidden', !(isRealSeat(mySeat) && m === 'seat'));
  updateFeedUI();
  const a = myAvatar(); if (a) a.g.visible = true;
}

// Góc khán giả: rộng hơn một chút (đứng trong rạp vẫn thấy được nhiều)
function audFov() { return Math.min(80, baseFov * 58 / 42); }
// Giữ camera khán giả luôn ở TRONG phòng chiếu (không bay ra ngoài tường / lên trên trần)
const HALL_MIN = new THREE.Vector3(), HALL_MAX = new THREE.Vector3();
function keepInsideHall() {
  HALL_MIN.set(-HALL_X + 0.8, 0, HALL_FRONT + Math.min(6, HALL_D * 0.25)); HALL_MAX.set(HALL_X - 0.8, HALL_H - 0.8, HALL_BACK - 0.8);
  const c = camera.position; c.clamp(HALL_MIN, HALL_MAX);
  const minY = floorY(c.z, c.x) + 2.2; if (c.y < minY) c.y = minY;
}
// Thu phóng bằng lăn chuột cho 3 góc nhìn còn lại (ghế / sát màn / từ màn ảnh): đổi độ rộng ống kính
let viewZoom = 1;
function zoomedFov(fov) {
  const t = Math.tan(THREE.MathUtils.degToRad(fov / 2)) / viewZoom;
  return THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(t)), 12, 90);
}
// Góc khán giả: zoom bằng ống kính; càng zoom càng hướng về màn hình, và ống kính không bao giờ hẹp tới mức cắt mất màn hình
const AUD_ZOOM0 = 1.45;
let audZoom = AUD_ZOOM0;
const _scA = new THREE.Vector3(), _look = new THREE.Vector3();
function audienceFrame() {
  const t = THREE.MathUtils.clamp((audZoom - 1) / 1.6, 0, 1) * 0.75;                   // zoom vào → nhìn dần về giữa màn hình
  _look.copy(controls.target).lerp(SCR_CENTER, t); camera.lookAt(_look); camera.updateMatrixWorld();
  const want = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(audFov() / 2)) / audZoom);
  let need = 0;
  for (const c of SCR_CORNERS) {                                                         // góc tối thiểu để thấy trọn 4 góc màn hình (chừa 6% lề)
    _scA.copy(c).applyMatrix4(camera.matrixWorldInverse); if (_scA.z > -0.5) { need = Math.PI; break; }
    need = Math.max(need, 2 * Math.atan(Math.max(Math.abs(_scA.y) / -_scA.z, Math.abs(_scA.x) / (-_scA.z * camera.aspect)) / 0.94));
  }
  const fov = THREE.MathUtils.radToDeg(Math.min(THREE.MathUtils.degToRad(88), Math.max(want, need)));
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov > camera.fov && need >= THREE.MathUtils.degToRad(camera.fov) ? fov : camera.fov + (fov - camera.fov) * 0.2; camera.updateProjectionMatrix(); }   // mượt khi zoom; cần rộng để khỏi cắt màn thì mở ngay
}
// chụm / mở 2 ngón tay: phóng to / thu nhỏ y như lăn chuột (mọi góc nhìn); lúc 2 ngón thì tạm khoá xoay
const touchPts = new Map(); let pinch = null;
const pinchDist = () => { const [a2, b2] = [...touchPts.values()]; return Math.hypot(a2.x - b2.x, a2.y - b2.y) || 1; };
glR.domElement.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch') return;
  touchPts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touchPts.size === 2) { pinch = { d: pinchDist(), aud: audZoom, view: viewZoom }; controls.enabled = false; }
}, true);
glR.domElement.addEventListener('pointermove', (e) => {
  if (!touchPts.has(e.pointerId)) return;
  touchPts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && touchPts.size === 2) {
    const k = pinchDist() / pinch.d;
    if (camMode === 'audience') audZoom = THREE.MathUtils.clamp(pinch.aud * k, 0.8, 4);
    else viewZoom = THREE.MathUtils.clamp(pinch.view * k, 0.7, 3.5);
  }
}, true);
const endTouch = (e) => {
  if (!touchPts.delete(e.pointerId)) return;
  if (touchPts.size < 2 && pinch) { pinch = null; setTimeout(() => { if (!pinch && camMode === 'audience' && camBlend <= 0) controls.enabled = true; }, 60); }
};
addEventListener('pointerup', endTouch, true); addEventListener('pointercancel', endTouch, true);
glR.domElement.addEventListener('wheel', (e) => {
  if (camMode === 'audience') { audZoom = THREE.MathUtils.clamp(audZoom * Math.exp(-e.deltaY * 0.0012), 0.8, 4); return; }
  viewZoom = THREE.MathUtils.clamp(viewZoom * Math.exp(-e.deltaY * 0.0012), 0.7, 3.5);
}, { passive: true });

function updateCamera(dt) {
  // ẩn nhân vật của mình khi nhìn từ ghế để khỏi thấy "trong đầu"
  const me = myAvatar(); if (me) me.g.visible = camMode !== 'seat';
  glR.domElement.style.cursor = camMode === 'screen' ? 'default' : 'grab';
  cssObj.visible = camMode !== 'stage';   // màn hình nằm sau lưng camera → ẩn iframe khỏi bị méo hình
  BEAM_MAT.visible = partyOn || camMode === 'audience' || camMode === 'stage'; if (BEAM_MAT2) BEAM_MAT2.visible = BEAM_MAT.visible;   // đèn bar bật thì đèn quét ở mọi góc   // đang xem phim (ghế / sát màn) thì tắt luồng đèn cho khỏi chói
  if (camMode === 'audience' && camBlend <= 0) { controls.update(); keepInsideHall(); audienceFrame(); return; }
  computeCamGoal();
  if (camMode !== 'audience') camGoalFov = zoomedFov(camGoalFov);   // lăn chuột để thu phóng
  const k = 1 - Math.exp(-dt * (camBlend > 0 ? 6.5 : 12));
  camera.position.lerp(camGoalPos, k);
  camLook.lerp(camGoalLook, k);
  camera.lookAt(camLook);
  if (Math.abs(camera.fov - camGoalFov) > 0.01) { camera.fov += (camGoalFov - camera.fov) * k; camera.updateProjectionMatrix(); }
  if (camBlend > 0 && camera.position.distanceTo(camGoalPos) < 0.05 && camLook.distanceTo(camGoalLook) < 0.05) {
    camBlend = 0;
    if (camMode === 'audience') {               // tới nơi → trả quyền xoay/zoom cho OrbitControls
      camera.position.copy(CAM_POS); controls.target.copy(CAM_TARGET); controls.enabled = true; controls.update();
      camera.fov = audFov(); camera.updateProjectionMatrix();
    }
  }
}

// Góc nhìn khán giả: nếu người dùng bấm/lăn chuột khi camera còn đang lướt tới thì dừng lướt và
// trao quyền xoay ngay (chạy ở pha capture để OrbitControls nhận được luôn cú kéo này).
function takeOverAudience() {
  if (camMode !== 'audience' || camBlend <= 0) return;
  camBlend = 0; camera.fov = audFov(); camera.updateProjectionMatrix();
  controls.target.copy(camLook); controls.enabled = true; controls.update();
}
stageEl.addEventListener('pointerdown', takeOverAudience, true);
stageEl.addEventListener('wheel', takeOverAudience, { capture: true, passive: true });

// Kéo chuột ở góc nhìn ghế / từ màn ảnh = quay đầu nhìn xung quanh (nháy đúp để nhìn thẳng lại)
{
  let last = null;
  glR.domElement.addEventListener('pointerdown', (e) => { last = { x: e.clientX, y: e.clientY }; });
  addEventListener('pointerup', () => { last = null; });
  glR.domElement.addEventListener('pointermove', (e) => {
    if (!last || !e.buttons || pinch || touchPts.size > 1 || (camMode !== 'stage' && camMode !== 'seat')) return;
    lookYaw = THREE.MathUtils.clamp(lookYaw + (e.clientX - last.x) * 0.004, -2.4, 2.4);   // quay gần hết nửa vòng mỗi bên
    lookPitch = THREE.MathUtils.clamp(lookPitch - (e.clientY - last.y) * 0.004, -1.6, 0.8);
    last = { x: e.clientX, y: e.clientY };
  });
  glR.domElement.addEventListener('dblclick', () => { lookYaw = lookPitch = 0; viewZoom = 1; audZoom = AUD_ZOOM0; });
}

// ---- Resize + vòng lặp render
// Chỉnh điểm nhìn của góc khán giả để mép trên màn hình luôn nằm trong khung (theo tỉ lệ cửa sổ hiện tại)
const CAM_TARGET0 = CAM_TARGET.clone();
function fitAudienceTarget() {
  const half = THREE.MathUtils.degToRad(audFov() / 2), dist = CAM_POS.z - CAM_TARGET0.z;
  const top = Math.atan2(SCR_TOP + 0.4 - CAM_POS.y, CAM_POS.z - SCR_Z);                  // góc tới mép trên màn
  let pitch = Math.atan2(CAM_TARGET0.y - CAM_POS.y, dist);
  pitch = Math.max(pitch, top - half * 0.9);                                            // ngước lên đủ để thấy mép trên
  CAM_TARGET.y = CAM_POS.y + Math.tan(pitch) * dist;
}
function resize() {
  const w = innerWidth, h = innerHeight, asp = w / h;
  baseFov = asp < 1.7 ? Math.min(75, 42 * (1.7 / asp) ** 0.9) : 42;
  camera.aspect = asp; camera.fov = camMode === 'audience' && camBlend <= 0 ? audFov() : baseFov; camera.updateProjectionMatrix(); seatFitKey = '';
  fitAudienceTarget();
  glR.setSize(w, h); cssR.setSize(w, h);
}
addEventListener('resize', resize); resize();
cssR.render(cssScene, camera); // đưa iframe vào DOM ngay lập tức
let lastT = performance.now();
function frame() {
  const now = performance.now(), dt = Math.min(0.05, (now - lastT) / 1000), t = now / 1000; lastT = now;
  updateAvatars(dt, t);
  updateStaff(dt);
  updateCamera(dt);
  updateHallCutaway();
  if (discoBall) discoBall.rotation.y += dt * (partyOn ? 1.6 : 0.35);
  for (const o of MYSTIC_SPIN) {                              // ấn chú xoay, pha lê nổi, bụi phép trôi
    if (o.userData.update) o.userData.update(dt, t);            // hiệu ứng riêng của phong cách (cánh hoa rơi, hành tinh trôi...)
    else if (o.userData.motes) { o.visible = camMode === 'audience' || camMode === 'stage'; o.rotation.y += dt * 0.01; o.position.y = Math.sin(performance.now() / 4000) * 0.6; }
    else if (o.userData.bob) { o.rotation.y += dt * o.userData.spin; o.position.y = o.userData.bob + Math.sin(performance.now() / 700 + o.parent.position.x) * 0.12; }
    else o.rotation.z += dt * o.userData.spin;
  }
  updateParty(t, dt);
  if (starPts) starPts.material.opacity = 0.65 + 0.35 * Math.sin(t * 1.7);
  for (const c of candles) { const k = 0.85 + 0.15 * Math.sin(t * 9 + c.ph) * Math.sin(t * 3.7 + c.ph * 2); c.f.scale.set(k, 1.8 * k, k); c.halo.material.opacity = 0.35 * k; if (c.l) c.l.intensity = 2.2 * k; }
  // luồng sáng nghiêng về phía cuối rạp (x âm → hướng +z), quét nhẹ, không bao giờ hắt lên màn chiếu
  glR.render(scene, camera);
  cssR.render(cssScene, camera);
  tryBootPlayer();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

document.querySelectorAll('#bl [data-cam]').forEach((b) => (b.onclick = () => setCamMode(b.dataset.cam)));
setCamMode(camMode, true);
// ---- Ẩn / hiện toàn bộ giao diện (nút con mắt hoặc phím H)
function setUIHidden(h) {
  document.body.classList.toggle('ui-hidden', h);
  if (!h) closeQuickChat();
  if (h) { if (panel) openPanel(panel); toast('Đã ẩn giao diện · phím Enter để nhắn tin nhanh · phím H để hiện lại'); }
}
$('btnHideUI').onclick = () => setUIHidden(true);
$('btnShowUI').onclick = () => setUIHidden(false);
addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() !== 'h' || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  if (!document.body.classList.contains('in-room') || document.querySelector('.overlay:not(.hidden)')) return;
  setUIHidden(!document.body.classList.contains('ui-hidden'));
});
$('recline').addEventListener('input', (e) => setMyRecline(e.target.value / 100));
{ const v = parseFloat(localStorage.getItem('rc_recline')); if (!isNaN(v)) myReclineLocal = v; }
$('btnOrder').onclick = () => {
  const items = orderList();
  if (!items.length || mySeat == null) return;
  socket.emit('order', items);
  for (const k of Object.keys(orderQty)) delete orderQty[k];
  renderMenu(); openPanel('canteen');
};
// Rời ghế: chỉ báo thành công khi server xác nhận (trạng thái mới không còn ghế của mình)
let leaveWait = 0;
$('dLeave').onclick = () => {
  if (mySeat == null) return;
  socket.emit('seat:leave');
  clearTimeout(leaveWait);
  leaveWait = setTimeout(() => {
    leaveWait = 0;
    if (mySeat != null) toast('Chưa rời được ghế: server đang chạy bản cũ — hãy tắt server và chạy lại npm start');
  }, 2500);
};
if (!TPLC.party) $('dParty').classList.add('hidden');
$('seated').parentElement.lastChild.textContent = ` / ${SEATS} chỗ`;   // số chỗ theo loại phòng
$('dParty').onclick = () => { socket.emit('party'); toast(partyMine ? 'Đã rút vote đèn bar' : 'Đã vote bật đèn bar — đủ 1/3 phòng sẽ bật trong 1 phút'); };
// Bấm vào vòng tròn trên bục để lên sàn nhảy
{
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let down = null;
  glR.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  glR.domElement.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return; down = null;
    const r = glR.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(danceRings)[0]; if (!hit) return;
    const idx = SEATS + danceRings.indexOf(hit.object);
    if (idx === mySeat) return toast('Bạn đang ở ' + seatName(idx));
    if (taken.has(idx)) return toast(seatName(idx) + ' có người nhảy rồi');
    socket.emit('seat:take', idx); toast('Đang lên ' + seatName(idx) + '...');
  });
}
$('btnNames').onclick = () => { labelsOn = !labelsOn; avatars.forEach((a) => (a.name.visible = labelsOn && !a.bubble)); $('btnNames').classList.toggle('off', !labelsOn); $('btnNames').title = labelsOn ? 'Ẩn tên' : 'Hiện tên'; };
// ---- Khung chat nổi mờ góc trên bên trái: hiện tin mới ở mọi góc nhìn (tắt được, nhớ lựa chọn)
var feedOn = localStorage.getItem('rc_feed') !== '0';   // var: setCamMode có thể gọi updateFeedUI trước dòng này
function updateFeedUI() {
  const b = $('btnFeed'); b.classList.toggle('off', !feedOn); b.title = feedOn ? 'Tắt khung chat nổi góc trái' : 'Bật khung chat nổi góc trái';
  $('chatFeed').classList.toggle('hidden', !feedOn);                // hiện ở mọi góc nhìn (kể cả ghế khán giả)
}
function feedPush(m) {
  const box = $('chatFeed'), el = document.createElement('div');
  if (m.system) { el.className = 'fl sys'; el.textContent = m.text; }
  else {
    el.className = 'fl' + (m.id === myId ? ' me' : '');
    const w = chatWho(m), av = document.createElement('span'); av.className = 'cav'; setAvatarEl(av, m.name, w.av);
    const b = document.createElement('b'); b.append(nameEl(m.name, w.look), genderTag(w.g));
    el.append(av, b, document.createTextNode(m.text));
  }
  box.appendChild(el);
  while (box.children.length > 6) box.removeChild(box.firstChild);
  setTimeout(() => el.classList.add('fade'), 12000);              // mờ dần sau 12 giây
  setTimeout(() => el.remove(), 13000);
}
$('btnFeed').onclick = () => { feedOn = !feedOn; localStorage.setItem('rc_feed', feedOn ? '1' : '0'); updateFeedUI(); toast(feedOn ? 'Đã bật khung chat nổi góc trái' : 'Đã tắt khung chat nổi góc trái'); };
updateFeedUI();

// =====================================================================
//  Trình phát nhiều nguồn: YouTube, Vimeo, Dailymotion, Twitch, SoundCloud, file video / HLS.
//  Mỗi nguồn là 1 "adapter" cùng giao diện: load / play / pause / seek / time / duration / isPlaying / stop / volume
// =====================================================================
let player = null, ytReady = false;
let cur = null, loadedToken = -1, ignoreUntil = 0, expectPlaying = false, myVote = false;
let vol = Number(localStorage.getItem('rc_vol') ?? 100), roomType = 'public', roomId = 'main', inRoom = false;
const isPrivate = () => roomType === 'private';
const quiet = (ms = 1500) => { ignoreUntil = Date.now() + ms; };
let media = null;                                                // adapter đang phát
const altEl = $('altPlayer');
const scriptCache = new Map();
function loadScript(src) {
  if (!scriptCache.has(src)) scriptCache.set(src, new Promise((ok, bad) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => { scriptCache.delete(src); bad(new Error('load')); }; document.head.appendChild(s); }));
  return scriptCache.get(src);
}
function altReset() { altEl.textContent = ''; }
function mediaFail(msg) { toast(msg || 'Không phát được video này'); }
// sự kiện chung từ mọi trình phát
function mediaEvent(type, A) {
  if (A && A !== media) return;
  if (type === 'ended') { if (cur && cur.current && !cur.current.live) socket.emit('ended', { token: cur.token }); return; }
  if (type === 'blocked') { $('tapPlay').classList.add('show'); return; }
  if (type === 'playing') { $('tapPlay').classList.remove('show'); applyVolume(); }
  if (Date.now() < ignoreUntil || !isPrivate() || !cur || !cur.current || cur.current.live) return;
  if (type === 'playing') socket.emit('control', { action: 'play', time: media.time() });
  else if (type === 'paused') socket.emit('control', { action: 'pause', time: media.time() });
}
// đồng hồ ước lượng cho nguồn chỉ báo thời gian theo sự kiện
const clockMix = { t: 0, tAt: 0, playing: false, dur: 0,
  mark(t) { this.t = t; this.tAt = performance.now(); },
  est() { return this.playing ? this.t + (performance.now() - this.tAt) / 1000 : this.t; } };

// ---- YouTube (IFrame API) ----
const ytTag = document.createElement('script'); ytTag.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(ytTag);
window.onYouTubeIframeAPIReady = () => { ytReady = true; };
function tryBootPlayer() {
  if (player || !ytReady || !$('player') || !ytWrap.isConnected || ytWrap.parentElement === stageEl) return;
  player = new YT.Player('player', {
    width: 1920, height: 1080,
    playerVars: { autoplay: 1, controls: 0, disablekb: 1, fs: 0, rel: 0, modestbranding: 1, iv_load_policy: 3, playsinline: 1, origin: location.origin },
    events: {
      onReady: () => { applyVolume(); if (cur && (!cur.current || (cur.current.src || 'yt') === 'yt')) applyState(cur, true); },
      onStateChange: (e) => {
        const S = YT.PlayerState;
        if (e.data === S.ENDED) return mediaEvent('ended', YTA);
        if (e.data === S.PLAYING) mediaEvent('playing', YTA);
        else if (e.data === S.PAUSED) mediaEvent('paused', YTA);
        if (expectPlaying && media === YTA && (e.data === S.UNSTARTED || e.data === S.CUED)) setTimeout(() => { const st = player.getPlayerState(); if (expectPlaying && media === YTA && (st === S.UNSTARTED || st === S.CUED)) mediaEvent('blocked', YTA); }, 1800);
      },
      onError: () => { if (media === YTA) mediaFail('Video YouTube này không cho phát nhúng hoặc đã bị xoá'); },
    },
  });
}
const YTA = {
  ready: () => !!(player && player.loadVideoById),
  load(it, start, paused) { const a = { videoId: it.vid, startSeconds: start }; paused ? player.cueVideoById(a) : player.loadVideoById(a); },
  play() { player.playVideo(); }, pause() { player.pauseVideo(); }, seek(t) { player.seekTo(t, true); },
  time() { return (player && player.getCurrentTime && player.getCurrentTime()) || 0; }, duration() { return (player && player.getDuration && player.getDuration()) || 0; },
  isPlaying() { return player.getPlayerState() === YT.PlayerState.PLAYING; }, isBuffering() { return player.getPlayerState() === YT.PlayerState.BUFFERING; },
  stop() { if (player && player.stopVideo) player.stopVideo(); },
  volume(v) { if (player && player.setVolume) { player.setVolume(v); v === 0 ? player.mute() : player.unMute(); } },
};

// ---- Vimeo (Player.js) ----
const VimeoA = { ...clockMix, p: null, ready: () => true,
  async load(it, start, paused) {
    altReset(); const div = document.createElement('div'); div.className = 'alt-fill'; altEl.appendChild(div);
    try { await loadScript('https://player.vimeo.com/api/player.js'); } catch { return mediaFail('Không tải được trình phát Vimeo'); }
    if (media !== this) return;
    const opt = { autoplay: !paused, controls: false, dnt: true, playsinline: true, width: 1920, height: 1080, title: false, byline: false, portrait: false };
    if (it.h) opt.url = `https://vimeo.com/${it.vid}/${it.h}`; else opt.id = Number(it.vid);
    const p = this.p = new Vimeo.Player(div, opt); this.mark(start); this.playing = false; this.dur = 0;
    p.on('timeupdate', (d) => { if (p === this.p) { this.mark(d.seconds); this.dur = d.duration || this.dur; } });
    p.on('play', () => { if (p === this.p) { this.playing = true; this.tAt = performance.now(); } });
    p.on('playing', () => p === this.p && mediaEvent('playing', this));
    p.on('pause', () => { if (p === this.p) { this.playing = false; mediaEvent('paused', this); } });
    p.on('ended', () => { if (p === this.p) { this.playing = false; mediaEvent('ended', this); } });
    p.on('error', () => p === this.p && mediaFail('Video Vimeo này không cho phát nhúng'));
    p.ready().then(() => { if (p !== this.p) return; p.getDuration().then((d) => (this.dur = d)).catch(() => {}); if (start > 1) p.setCurrentTime(start).catch(() => {}); applyVolume(); if (!paused) p.play().catch(() => mediaEvent('blocked', this)); }).catch(() => mediaFail('Không mở được video Vimeo'));
  },
  play() { this.p && this.p.play().catch(() => mediaEvent('blocked', this)); }, pause() { this.p && this.p.pause().catch(() => {}); },
  seek(t) { this.mark(t); this.p && this.p.setCurrentTime(t).catch(() => {}); },
  time() { return this.est(); }, duration() { return this.dur; }, isPlaying() { return this.playing; }, isBuffering() { return false; },
  stop() { if (this.p) { this.p.destroy().catch(() => {}); this.p = null; } altReset(); },
  volume(v) { this.p && this.p.setVolume(v / 100).catch(() => {}); },
};

// ---- Dailymotion (iframe + postMessage) ----
const DmA = { ...clockMix, f: null, ready: () => true,
  load(it, start, paused) {
    altReset(); const f = this.f = document.createElement('iframe'); f.className = 'alt-fill'; f.allow = 'autoplay; fullscreen; encrypted-media';
    f.src = `https://www.dailymotion.com/embed/video/${encodeURIComponent(it.vid)}?api=postMessage&id=dmp&autoplay=${paused ? 0 : 1}&controls=0&queue-enable=0&sharing-enable=0&ui-start-screen-info=0&start=${Math.floor(start)}&origin=${encodeURIComponent(location.origin)}`;
    altEl.appendChild(f); this.mark(start); this.playing = !paused; this.dur = 0;
  },
  cmd(c) { try { this.f && this.f.contentWindow.postMessage(c, '*'); } catch {} },
  onMsg(e) {
    if (!/dailymotion\.com$/.test(new URL(e.origin).hostname) || typeof e.data !== 'string') return;
    const q = new URLSearchParams(e.data), ev = q.get('event');
    if (ev === 'timeupdate') this.mark(Number(q.get('time')) || this.t);
    else if (ev === 'durationchange') this.dur = Number(q.get('duration')) || this.dur;
    else if (ev === 'apiready') applyVolume();
    else if (ev === 'playing' || ev === 'play') { this.playing = true; this.tAt = performance.now(); if (ev === 'playing') mediaEvent('playing', this); }
    else if (ev === 'pause') { this.playing = false; mediaEvent('paused', this); }
    else if (ev === 'end' || ev === 'ended' || ev === 'video_end') { this.playing = false; mediaEvent('ended', this); }
  },
  play() { this.cmd('play'); this.playing = true; this.tAt = performance.now(); }, pause() { this.cmd('pause'); this.playing = false; },
  seek(t) { this.mark(t); this.cmd('seek=' + t); },
  time() { return this.est(); }, duration() { return this.dur; }, isPlaying() { return this.playing; }, isBuffering() { return false; },
  stop() { this.f = null; altReset(); }, volume(v) { this.cmd('volume=' + v / 100); this.cmd('muted=' + (v === 0 ? 1 : 0)); },
};
addEventListener('message', (e) => { try { if (media === DmA) DmA.onMsg(e); } catch {} });

// ---- Twitch (VOD + kênh live) ----
const TwA = { p: null, live: false, ready: () => true,
  async load(it, start, paused) {
    altReset(); const div = document.createElement('div'); div.className = 'alt-fill'; div.id = 'twp' + Date.now(); altEl.appendChild(div);
    try { await loadScript('https://player.twitch.tv/js/embed/v1.js'); } catch { return mediaFail('Không tải được trình phát Twitch'); }
    if (media !== this) return;
    this.live = it.kind === 'channel';
    const opt = { width: '100%', height: '100%', parent: [location.hostname], autoplay: !paused, muted: false };
    if (this.live) opt.channel = it.vid; else { opt.video = 'v' + it.vid; opt.time = Math.floor(start) + 's'; }
    const p = this.p = new Twitch.Player(div.id, opt);
    p.addEventListener(Twitch.Player.READY, () => { if (p === this.p) applyVolume(); });
    p.addEventListener(Twitch.Player.PLAYING, () => p === this.p && mediaEvent('playing', this));
    p.addEventListener(Twitch.Player.PAUSE, () => p === this.p && mediaEvent('paused', this));
    p.addEventListener(Twitch.Player.ENDED, () => p === this.p && mediaEvent('ended', this));
    p.addEventListener(Twitch.Player.PLAYBACK_BLOCKED, () => p === this.p && mediaEvent('blocked', this));
    p.addEventListener(Twitch.Player.OFFLINE, () => p === this.p && toast('Kênh Twitch này đang không live'));
  },
  play() { try { this.p.play(); } catch {} }, pause() { try { this.p.pause(); } catch {} },
  seek(t) { if (!this.live) try { this.p.seek(t); } catch {} },
  time() { try { return this.p.getCurrentTime() || 0; } catch { return 0; } }, duration() { try { return this.live ? 0 : this.p.getDuration() || 0; } catch { return 0; } },
  isPlaying() { try { return !this.p.isPaused(); } catch { return false; } }, isBuffering() { return false; },
  stop() { this.p = null; altReset(); },
  volume(v) { try { this.p.setVolume(v / 100); this.p.setMuted(v === 0); } catch {} },
};

// ---- SoundCloud (Widget API) ----
const ScA = { ...clockMix, w: null, ready: () => true,
  async load(it, start, paused) {
    altReset(); const f = document.createElement('iframe'); f.className = 'alt-fill'; f.allow = 'autoplay';
    f.src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(it.url)}&auto_play=${!paused}&visual=true&hide_related=true&show_comments=false&show_reposts=false&show_teaser=false&buying=false&sharing=false&download=false`;
    altEl.appendChild(f); this.mark(start); this.playing = false; this.dur = 0;
    try { await loadScript('https://w.soundcloud.com/player/api.js'); } catch { return mediaFail('Không tải được trình phát SoundCloud'); }
    if (media !== this) return;
    const w = this.w = SC.Widget(f), E = SC.Widget.Events;
    w.bind(E.READY, () => { if (w !== this.w) return; w.getDuration((d) => (this.dur = d / 1000)); if (start > 1) w.seekTo(start * 1000); applyVolume(); if (!paused) w.play(); });
    w.bind(E.PLAY_PROGRESS, (e) => w === this.w && this.mark(e.currentPosition / 1000));
    w.bind(E.PLAY, () => { if (w === this.w) { this.playing = true; this.tAt = performance.now(); mediaEvent('playing', this); } });
    w.bind(E.PAUSE, () => { if (w === this.w) { this.playing = false; mediaEvent('paused', this); } });
    w.bind(E.FINISH, () => { if (w === this.w) { this.playing = false; mediaEvent('ended', this); } });
    w.bind(E.ERROR, () => w === this.w && mediaFail('Bài SoundCloud này không cho phát nhúng'));
  },
  play() { this.w && this.w.play(); }, pause() { this.w && this.w.pause(); }, seek(t) { this.mark(t); this.w && this.w.seekTo(t * 1000); },
  time() { return this.est(); }, duration() { return this.dur; }, isPlaying() { return this.playing; }, isBuffering() { return false; },
  stop() { this.w = null; altReset(); }, volume(v) { this.w && this.w.setVolume(v); },
};

// ---- File video / âm thanh trực tiếp + luồng HLS (.m3u8) ----
const FileA = { v: null, hls: null, ready: () => true,
  async load(it, start, paused) {
    this.stop();
    const v = this.v = document.createElement('video'); v.className = 'alt-fill'; v.playsInline = true; v.preload = 'auto'; v.controls = false; altEl.appendChild(v);
    v.addEventListener('playing', () => v === this.v && mediaEvent('playing', this));
    v.addEventListener('pause', () => v === this.v && !v.ended && mediaEvent('paused', this));
    v.addEventListener('ended', () => v === this.v && mediaEvent('ended', this));
    v.addEventListener('error', () => v === this.v && mediaFail('Không phát được file này (link hỏng, sai định dạng hoặc máy chủ chặn phát ở web khác)'));
    v.addEventListener('loadedmetadata', () => { if (v !== this.v) return; if (start > 0.5 && isFinite(v.duration)) v.currentTime = start; applyVolume(); if (!paused) v.play().catch(() => mediaEvent('blocked', this)); }, { once: true });
    if (it.src === 'hls' && !v.canPlayType('application/vnd.apple.mpegurl')) {
      try {
        const { default: Hls } = await import('https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.mjs');
        if (v !== this.v) return;
        if (!Hls.isSupported()) return mediaFail('Trình duyệt này không phát được luồng HLS');
        const h = this.hls = new Hls({ startPosition: start || -1 }); h.loadSource(it.url); h.attachMedia(v);
        h.on(Hls.Events.ERROR, (e, d) => { if (d.fatal && h === this.hls) mediaFail('Không phát được luồng HLS (link hỏng hoặc máy chủ chặn phát ở web khác)'); });
      } catch { return mediaFail('Không tải được bộ phát HLS'); }
    } else v.src = it.url;
  },
  play() { this.v && this.v.play().catch(() => mediaEvent('blocked', this)); }, pause() { this.v && this.v.pause(); }, seek(t) { if (this.v) this.v.currentTime = t; },
  time() { return (this.v && this.v.currentTime) || 0; }, duration() { const d = this.v && this.v.duration; return d && isFinite(d) ? d : 0; },
  isPlaying() { return !!this.v && !this.v.paused && !this.v.ended; }, isBuffering() { return !!this.v && this.v.readyState < 3 && !this.v.paused; },
  stop() { if (this.hls) { this.hls.destroy(); this.hls = null; } if (this.v) { this.v.pause(); this.v.removeAttribute('src'); this.v.load(); this.v = null; } altReset(); },
  volume(v) { if (this.v) { this.v.volume = v / 100; this.v.muted = v === 0; } },
};

const ADAPTERS = { yt: YTA, vimeo: VimeoA, dm: DmA, twitch: TwA, sc: ScA, file: FileA, hls: FileA };
const adapterFor = (it) => ADAPTERS[(it && it.src) || 'yt'] || YTA;
function showLayer(A) {
  const yt = A === YTA; altEl.style.display = yt ? 'none' : 'block';
  const ifr = player && player.getIframe && player.getIframe(); if (ifr) ifr.style.visibility = yt ? 'visible' : 'hidden';
}
function stopMedia() { if (media) { try { media.stop(); } catch {} } media = null; showLayer(YTA); }

function applyVolume() {
  $('vol').value = vol; $('volPct').textContent = vol + '%'; $('btnVol').replaceChildren(icon(vol === 0 ? 'vol-x' : vol < 50 ? 'vol-low' : 'vol'));
  if (media) try { media.volume(vol); } catch {}
  if (shareVid && !shareStream) { shareVid.volume = vol / 100; shareVid.muted = vol === 0; }
}
$('vol').oninput = (e) => { vol = Number(e.target.value); localStorage.setItem('rc_vol', vol); applyVolume(); };
$('btnVol').onclick = () => { vol = vol === 0 ? 100 : 0; localStorage.setItem('rc_vol', vol); applyVolume(); };
$('btnTap').onclick = () => {
  $('tapPlay').classList.remove('show');
  if (shareVid && shareVid.srcObject) { shareVid.play().catch(() => {}); return; }
  if (!media || !cur || !cur.current) return;
  quiet(); applyVolume(); if (!cur.current.live) media.seek(cur.position); cur.paused ? media.pause() : media.play();
};

function applyState(s, force) {
  const prevToken = loadedToken;
  cur = s; renderUI(s);
  if (!s.current) { expectPlaying = false; loadedToken = s.token; $('idle').style.display = ''; quiet(); stopMedia(); return; }
  if (shareVid && shareVid.srcObject) { if (media) try { media.pause(); } catch {} return; }   // đang xem chia sẻ màn hình → video hàng chờ tạm dừng
  const A = adapterFor(s.current);
  if (!A.ready()) return;                                        // YouTube chưa sẵn sàng → onReady sẽ gọi lại
  $('idle').style.display = 'none';
  expectPlaying = !s.paused;
  if (force || prevToken !== s.token || media !== A) {
    loadedToken = s.token; myVote = false; quiet(3000);
    if (media && media !== A) { try { media.stop(); } catch {} }
    media = A; showLayer(A);
    try { A.load(s.current, s.current.live ? 0 : s.position, s.paused); } catch { mediaFail(); }
    return;
  }
  quiet();
  if (s.current.live) { s.paused ? A.pause() : A.play(); return; }
  setMediaRate(s.rate || 1);
  const playing = A.isPlaying(), t = A.time();
  if (s.paused) { if (playing) A.pause(); if (Math.abs(t - s.position) > 1) A.seek(s.position); }
  else { if (Math.abs(t - s.position) > 2) A.seek(s.position); if (!playing && !A.isBuffering()) A.play(); }
}

// Thanh tiến trình
setInterval(() => {
  const fill = $('bar').firstElementChild;
  if (!media || !cur || !cur.current) { fill.style.width = '0'; $('nowTime').textContent = '0:00 / 0:00'; return; }
  if (cur.current.live) { fill.style.width = '100%'; $('nowTime').textContent = '● LIVE'; return; }
  const d = media.duration() || 0, t = media.time() || 0;
  fill.style.width = d ? Math.min(100, (t / d) * 100) + '%' : '0';
  $('nowTime').textContent = fmt(t) + ' / ' + fmt(d);
}, 500);

// Điều khiển phòng riêng
function seekTo(t) {
  if (!media || !cur || !cur.current || cur.current.live) return;
  t = Math.max(0, t); quiet(900); media.seek(t);
  socket.emit('control', { action: cur.paused ? 'pause' : 'play', time: t });
}
$('pBack').onclick = () => media && seekTo(media.time() - 10);
$('pFwd').onclick = () => media && seekTo(media.time() + 10);
$('pPlay').onclick = () => {
  if (!media || !cur || !cur.current) return;
  const playing = media.isPlaying(); quiet(900);
  if (playing) { media.pause(); socket.emit('control', { action: 'pause', time: media.time() }); }
  else { media.play(); socket.emit('control', { action: 'play', time: media.time() }); }
};
$('bar').addEventListener('click', (e) => {
  if (!isPrivate() || !media) return;
  const r = $('bar').getBoundingClientRect(); seekTo(((e.clientX - r.left) / r.width) * (media.duration() || 0));
});


// =====================================================================
//  HUD
// =====================================================================
let unread = 0, panel = null;
const SRC_LABEL = { yt: 'YouTube', vimeo: 'Vimeo', dm: 'Dailymotion', twitch: 'Twitch', sc: 'SoundCloud', file: 'Video', hls: 'HLS' };
let lastState = null;
function renderUI(s) {
  lastState = s; if (!$('peopleOv').classList.contains('hidden')) renderPeople();
  $('online').textContent = s.online;
  $('seated').textContent = s.users.filter((u) => u.seat != null && !isDance(u.seat)).length;
  $('nowTitle').textContent = s.current ? s.current.title : 'Chưa có video';
  $('nowBy').textContent = s.current ? 'Đề xuất bởi ' + s.current.by + ' · ' : '';
  if (isPrivate()) { $('skipLbl').textContent = 'Bỏ qua'; $('skipCount').textContent = ''; $('skipTxt').textContent = ''; }
  else {
    $('skipLbl').textContent = myVote ? 'Rút phiếu skip' : 'Vote bỏ qua'; $('skipCount').textContent = `${s.votes}/${s.need}`;
    $('skipTxt').innerHTML = `${s.votes}/${s.online} người đồng ý · Đủ 30% thì chuyển bài`;
    $('btnSkip').classList.toggle('voted', myVote);
  }
  const q = $('queue'); q.textContent = '';
  if (!s.queue.length) { const d = document.createElement('div'); d.className = 'empty'; d.textContent = 'Hàng chờ trống'; q.appendChild(d); }
  s.queue.forEach((it, i) => {
    const row = document.createElement('div'); row.className = 'qitem';
    const n = document.createElement('div'); n.className = 'n'; n.textContent = i + 1;
    const box = document.createElement('div'); box.style.cssText = 'min-width:0;flex:1';
    const t = document.createElement('div'); t.className = 't'; t.textContent = it.title;
    const sl = SRC_LABEL[it.src || 'yt']; if (sl) { const c = document.createElement('span'); c.className = 'srcchip src-' + (it.src || 'yt'); c.textContent = it.live ? sl + ' · LIVE' : sl; t.prepend(c); }
    const u = document.createElement('div'); u.className = 'u'; u.textContent = it.by;
    box.append(t, u); row.append(n, box); q.appendChild(row);
  });
  const qb = $('qBadge'); qb.textContent = s.queueLength > 99 ? '99+' : s.queueLength; qb.classList.toggle('show', s.queueLength > 0);
  if (isPrivate()) {
    const v = $('vusers'); v.textContent = '';
    s.users.forEach((u) => {
      const sp = document.createElement('span'); sp.textContent = u.name + (u.id === myId ? ' (bạn)' : ''); if (u.voice) sp.prepend(icon('mic'), ' ');
      if (u.voice) sp.className = 'live'; v.appendChild(sp);
    });
  }
}
// ---- Drawer
const TITLES = { send: 'Gửi video', queue: 'Đang chiếu & hàng chờ', chat: 'Trò chuyện', voice: 'Voice phòng riêng', canteen: 'Căn tin' };
function openPanel(name) {
  panel = panel === name ? null : name;
  $('drawer').classList.toggle('show', !!panel);
  document.querySelectorAll('.dbtn[data-panel]').forEach((b) => b.classList.toggle('active', b.dataset.panel === panel));
  document.querySelectorAll('.dp').forEach((p) => p.classList.toggle('active', p.id === 'p-' + panel));
  if (panel) $('dTitle').textContent = TITLES[panel];
  if (panel === 'chat') { unread = 0; $('cBadge').classList.remove('show'); $('p-chat').scrollTop = 1e9; setTimeout(() => $('chatIn').focus(), 50); }
  if (panel === 'send') setTimeout(() => $('urlIn').focus(), 50);
  if (panel === 'canteen') renderMenu();
}
document.querySelectorAll('.dbtn[data-panel]').forEach((b) => (b.onclick = () => openPanel(b.dataset.panel)));
$('dClose').onclick = () => { if (panel) openPanel(panel); };

function addVideo() { const v = $('urlIn').value.trim(); if (!v) return; socket.emit('add', v); $('urlIn').value = ''; toast('Đang lấy video từ link…'); }
$('btnAdd').onclick = addVideo;
$('urlIn').addEventListener('keydown', (e) => e.key === 'Enter' && addVideo());
$('btnSkip').onclick = () => { if (!isPrivate()) myVote = !myVote; socket.emit('skip'); if (cur) renderUI(cur); };

// ---- Chat
function addMsg(m, live) {
  const box = $('msgs'), p = $('p-chat');
  const atBottom = p.scrollHeight - p.scrollTop - p.clientHeight < 60;
  const el = document.createElement('div');
  if (m.system) { el.className = 'msg sys'; el.textContent = m.text; }
  else {
    el.className = 'msg' + (m.id === myId ? ' me' : '');
    const w = chatWho(m), av = document.createElement('span'); av.className = 'cav'; setAvatarEl(av, m.name, w.av);
    const body = document.createElement('div'); body.className = 'mbody';
    const b = document.createElement('b'); b.append(nameEl(m.name, w.look), genderTag(w.g));
    body.append(b, document.createTextNode(m.text)); el.append(av, body);
  }
  box.appendChild(el);
  while (box.children.length > 200) box.removeChild(box.firstChild);
  if (atBottom) p.scrollTop = p.scrollHeight;
  if (live && !m.system && panel !== 'chat' && m.id !== myId) {
    unread++; const b = $('cBadge'); b.textContent = unread > 99 ? '99+' : unread; b.classList.add('show');
  }
}
function sendChat() { const v = $('chatIn').value.trim(); if (!v) return; socket.emit('chat', v); $('chatIn').value = ''; $('chatCnt').textContent = 0; }
$('btnSend').onclick = sendChat;
$('chatIn').addEventListener('keydown', (e) => e.key === 'Enter' && sendChat());
// Phím Enter ở ngoài ô nhập = mở khung Trò chuyện để gõ luôn
addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || panel === 'chat') return;
  const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'BUTTON')) return;
  if (!document.body.classList.contains('in-room') || document.querySelector('.overlay:not(.hidden)')) return;
  e.preventDefault();
  if (document.body.classList.contains('ui-hidden')) return openQuickChat();     // đang ẩn giao diện: mở ô nhắn nhanh, không bật lại giao diện
  openPanel('chat');
});
// ---- Ô nhắn nhanh khi đang ẩn giao diện: Enter để mở / gửi, Esc để đóng; tin mới vẫn hiện ở khung chat nổi góc trái
function openQuickChat() { $('quickChat').classList.add('show'); $('qcIn').value = ''; $('qcCnt').textContent = '0'; setTimeout(() => $('qcIn').focus(), 0); }
function closeQuickChat() { $('quickChat').classList.remove('show'); $('qcIn').blur(); }
$('qcIn').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); closeQuickChat(); }
  else if (e.key === 'Enter') { e.preventDefault(); const v = $('qcIn').value.trim(); if (v && socket) socket.emit('chat', v); closeQuickChat(); }
  e.stopPropagation();                                                           // gõ chữ "h" không bật lại giao diện
});
$('qcIn').addEventListener('input', () => ($('qcCnt').textContent = $('qcIn').value.length));
$('qcIn').addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== $('qcIn')) $('quickChat').classList.remove('show'); }, 150));
$('btnQuickChat').onclick = () => openQuickChat();
$('chatIn').addEventListener('input', () => ($('chatCnt').textContent = $('chatIn').value.length));

// ---- Toàn màn hình, menu
$('btnFs').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}));
// ===================== Hồ sơ người dùng =====================
// Thời trang của mình: { gender, skin, equip{}, paint{} } (lấy từ /api/me)
let myFashion = { gender: 'm', skin: '#f1c9a5', equip: {}, paint: {} }, myAvatarVer = 0, myCreatedAt = null, myBg = null;
let previewLook = null;                                         // look đang xem trước (hồ sơ / tủ đồ)
const SKIN_COLORS = ['#f8dcc4', '#f1c9a5', '#e0ac82', '#c68863', '#8d5a3b', '#5e3a24'];
const ACCENTS = [['Vàng', '#e8b45e'], ['Tím', '#a77bff'], ['Hồng', '#ff6fa8'], ['Xanh dương', '#5aa8ff'], ['Xanh ngọc', '#3fd6b0'], ['Cam', '#ff8a4a']];
function applyAccent(c) { document.documentElement.style.setProperty('--accent', c); localStorage.setItem('rc_accent', c); }
{ const c = localStorage.getItem('rc_accent'); if (c) applyAccent(c); }
function avatarUrl(name, ver) { return ver ? `/api/avatar/${encodeURIComponent(name)}?v=${ver}` : ''; }
function renderAvatarBtn() {
  const b = $('avatarBtn'), url = avatarUrl(username, myAvatarVer);
  b.style.backgroundImage = url ? `url("${url}")` : ''; b.classList.toggle('has-img', !!url);
  b.textContent = url ? '' : (username || '?')[0].toUpperCase();
  const pa = $('profAvatar'); pa.style.backgroundImage = url ? `url("${url}")` : ''; pa.textContent = url ? '' : (username || '?')[0].toUpperCase();
  const fr = lookItem(myLookObj(), 'avframe'); applyAvFrame(b, fr); applyAvFrame(pa, fr);
}
function setFashion(f) { if (f && f.gender) myFashion = { gender: f.gender, skin: f.skin, equip: f.equip || {}, paint: f.paint || {}, pose: f.pose === 'dance' ? 'dance' : 'static' }; }
const myLookObj = (equip, paint) => ({ gender: myFashion.gender, skin: myFashion.skin, equip: equip || myFashion.equip, paint: paint || myFashion.paint });

// ---- Xem trước nhân vật 3D (dùng chung cho hồ sơ + tủ đồ). Kéo chuột / vuốt để xoay; chế độ: đứng, ngồi ghế (xem skin ghế), nhảy
let pvR = null, pvScene = null, pvCam = null, pvAv = null, pvRaf = 0, pvRoot = null, pvChair = null, pvYaw = 0, pvMode = 'stand', pvDances = null;
function ensurePreview(host) {
  if (!pvR) {
    pvR = new THREE.WebGLRenderer({ antialias: true, alpha: true }); pvR.setPixelRatio(Math.min(devicePixelRatio, 2)); pvR.setSize(220, 280);
    pvScene = new THREE.Scene();
    pvScene.add(new THREE.HemisphereLight(0xffffff, 0x404050, 1.6));
    const d = new THREE.DirectionalLight(0xffffff, 1.4); d.position.set(2, 4, -3); pvScene.add(d);
    const d2 = new THREE.DirectionalLight(0xffffff, 0.6); d2.position.set(-2, 3, 4); pvScene.add(d2);
    pvCam = new THREE.PerspectiveCamera(32, 220 / 280, 0.1, 50); pvCam.position.set(0, 2.9, -10.2); pvCam.lookAt(0, 2.55, 0);   // đủ khung cho tai thỏ / mũ cao / thú cưỡi
    pvRoot = new THREE.Group(); pvScene.add(pvRoot);
    const cv = pvR.domElement; cv.style.cursor = 'grab'; cv.style.touchAction = 'none'; cv.title = 'Kéo để xoay nhân vật';
    let drag = null;
    cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, yaw: pvYaw }; cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing'; });
    cv.addEventListener('pointermove', (e) => { if (drag) pvYaw = drag.yaw + (e.clientX - drag.x) * 0.012; });
    const end = () => { drag = null; cv.style.cursor = 'grab'; };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  }
  if (host && pvR.domElement.parentElement !== host) host.appendChild(pvR.domElement);
}
// giải phóng hình học riêng của 1 nhân vật / ghế xem trước (giữ lại hình dùng chung trong cache + ghế của rạp)
function disposeOwnGeo(obj) {
  const keep = new Set();
  for (const v of geoCache.values()) { if (v && v.isBufferGeometry) keep.add(v); else if (v && v.geo) { keep.add(v.geo); keep.add(v.out); } }
  for (const parts of Object.values(SEAT_MODELS)) for (const pt of parts) keep.add(pt.geo);
  obj.traverse((o) => { if (o.geometry && !keep.has(o.geometry)) o.geometry.dispose(); });
}
function buildPreviewChair(av) {
  const g = new THREE.Group(); g.scale.setScalar(AV_S);
  const T = SEAT_TYPES.regular, ang = reclineAngle(T, DEFAULT_RECLINE), tint = av.seatTint ? av.seatTint.getHex() : T.color;
  const hg = new THREE.Group(); hg.position.copy(HINGE.back); hg.rotation.x = ang; g.add(hg);
  for (const part of SEAT_MODELS.regular) { if (part.hinge === 'leg') continue; (part.hinge === 'back' ? hg : g).add(new THREE.Mesh(part.geo, smat(part.color === 'state' ? tint : part.color, { roughness: 0.85, ...(part.o || {}) }))); }
  const sk = av.seatSkin;
  if (sk) { const hx = (h, d) => (isHex(h) ? parseInt(h.slice(1), 16) : d); const b = buildSeatSkin(sk.style, hx(sk.c, 0x888888), hx(sk.a, 0xffffff)); b.back.rotation.x = ang; g.add(b.base); }
  return g;
}
function rebuildPreview(host) {
  ensurePreview(host);
  if (pvAv) { pvRoot.remove(pvAv.g); disposeSprite(pvAv.name); disposeOwnGeo(pvAv.g); }
  if (pvChair) { pvRoot.remove(pvChair); disposeOwnGeo(pvChair); pvChair = null; }
  pvAv = createAvatar({ name: username, look: previewLook || myLookObj() }, false); pvAv.name.visible = false;
  if (pvMode === 'seat') {                                    // ngồi trên ghế có skin
    pvChair = buildPreviewChair(pvAv); pvRoot.add(pvChair);
    pvAv.sitting = true; pvAv.standG.visible = false; pvAv.armsSit.visible = true; pvAv.legsUp.visible = true; pvAv.legsFlat.visible = false;
    pvAv.upper.rotation.x = reclineAngle(SEAT_TYPES.regular, DEFAULT_RECLINE); pvAv.upArms.forEach((m) => (m.visible = true)); pvAv.backG.visible = false;
  } else {
    setSitting(pvAv, false);
    if (pvAv.mount && pvMode === 'stand') setRide(pvAv, true);
  }
  pvRoot.add(pvAv.g);
  if (!pvRaf) pvRaf = requestAnimationFrame(previewLoop);
}
let pvPending = 0, pvLastBuild = 0;
function schedulePreview() {                                   // gộp nhiều lần đổi màu liên tiếp thành 1 lần dựng lại
  if (pvPending) return;
  const wait = Math.max(0, 70 - (performance.now() - pvLastBuild));
  pvPending = setTimeout(() => { pvPending = 0; pvLastBuild = performance.now(); previewLook = myLookObj(wd.equip, wd.paint); rebuildPreview(); }, wait);
}
let pvLblText = '';
function previewLoop(t) {
  if ($('profOv').classList.contains('hidden') && $('shopOv').classList.contains('hidden') && $('peopleOv').classList.contains('hidden')) { pvRaf = 0; return; }
  const ts = t / 1000;
  if (pvAv) {
    pvRoot.rotation.y = pvYaw;
    let lbl = 'Kéo để xoay nhân vật';
    if (pvMode === 'dance') {
      const ds = pvDances && pvDances.length ? pvDances : pvAv.dances, cur = ds[Math.floor(ts / 4) % ds.length];
      danceStep(pvAv, cur, ts, 0, 0);
      const it = CATALOG.items.find((x2) => x2.slot === 'dance' && x2.style === cur); lbl = '♪ ' + (it ? it.name : cur) + (ds.length > 1 ? ` (${ds.indexOf(cur) + 1}/${ds.length})` : '');
      updatePet(pvAv, ts, 'dance');
    } else if (pvMode === 'stand') {
      resetDancePose(pvAv); pvAv.g.rotation.y = 0; pvAv.g.position.y = 0;
      if (pvAv.curRide) { ridePose(pvAv, ts); updatePet(pvAv, ts, 'walk'); }
      else { pvAv.armL.rotation.x = Math.sin(t / 500) * 0.15; pvAv.armR.rotation.x = -Math.sin(t / 500) * 0.15; updatePet(pvAv, ts, 'idle'); }
    } else { lbl = 'Skin ghế trang trí ở lưng ghế — kéo để xoay'; updatePet(pvAv, ts, 'lap'); }
    flapWings(pvAv.wings, ts);
    if (lbl !== pvLblText) { pvLblText = lbl; const el = $('wardStageLbl'); if (el) el.textContent = lbl; }
  }
  pvR.render(pvScene, pvCam); pvRaf = requestAnimationFrame(previewLoop);
}

// ---- Hồ sơ > Nhân vật: chỉ chọn giới tính + màu da (quần áo mua ở Cửa hàng, mặc ở Tủ đồ)
let draftBasic = null;
function renderBasicOpts() {
  const box = $('lookOpts'); box.textContent = '';
  const group = (label, el) => { const g = document.createElement('div'); g.className = 'lgrp'; const l = document.createElement('small'); l.textContent = label; g.append(l, el); box.appendChild(g); };
  const gw = document.createElement('div'); gw.className = 'chips gender';
  for (const [v, t] of [['m', 'Nam'], ['f', 'Nữ']]) { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.classList.toggle('on', draftBasic.gender === v); b.onclick = () => { draftBasic.gender = v; renderBasicOpts(); previewLook = { gender: v, skin: draftBasic.skin, equip: v === myFashion.gender ? myFashion.equip : {} }; rebuildPreview(); }; gw.appendChild(b); }
  group('Giới tính', gw);
  const sw = document.createElement('div'); sw.className = 'swatches';
  for (const c of SKIN_COLORS) { const b = document.createElement('button'); b.type = 'button'; b.style.background = c; b.classList.toggle('on', draftBasic.skin === c); b.onclick = () => { draftBasic.skin = c; renderBasicOpts(); previewLook = { ...(previewLook || myLookObj()), skin: c }; rebuildPreview(); }; sw.appendChild(b); }
  group('Màu da', sw);
  const note = document.createElement('p'); note.className = 'hint'; note.style.margin = '6px 0 0';
  note.textContent = 'Quần áo, tóc, biểu cảm, phụ kiện, thú cưỡi, skin ghế, bong bóng chat và điệu nhảy: chọn và tự sơn màu trong Tủ đồ. Đồ nam và đồ nữ tách riêng; đổi giới tính thì đồ không hợp sẽ được thay bằng đồ cơ bản.';
  box.appendChild(note);
}
function profTab(name) {
  document.querySelectorAll('#profOv [data-pt]').forEach((b) => b.classList.toggle('active', b.dataset.pt === name));
  document.querySelectorAll('#profOv .pt').forEach((p) => p.classList.toggle('hidden', p.id !== 'pt-' + name));
}
function openProfile() {
  draftBasic = { gender: myFashion.gender, skin: myFashion.skin }; previewLook = null; pvMode = 'stand'; pvYaw = 0;
  $('profName').textContent = username;
  $('profSince').textContent = myCreatedAt ? 'Tham gia từ ' + new Date(myCreatedAt).toLocaleDateString('vi-VN') : '';
  $('profRoom').textContent = 'Đang ở: ' + (roomType === 'private' ? `${roomName} (${TPLC.name})` : 'Rạp công cộng') + (mySeat != null ? ' · ' + seatName(mySeat) : ' · đứng xem');
  $('avErr').textContent = $('pwErr').textContent = ''; $('pwOld').value = $('pwNew').value = $('pwNew2').value = '';
  const acc = $('accents'); acc.textContent = '';
  const cur = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  for (const [n, c] of ACCENTS) { const b = document.createElement('button'); b.type = 'button'; b.innerHTML = `<i style="background:${c}"></i>`; b.append(n); b.classList.toggle('on', cur === c); b.onclick = () => { applyAccent(c); openProfileTheme(); }; acc.appendChild(b); }
  $('profOv').classList.remove('hidden'); renderAvatarBtn(); renderBasicOpts(); rebuildPreview($('lookPreview'));
}
function openProfileTheme() { const keep = document.querySelector('#profOv [data-pt].active').dataset.pt; openProfile(); profTab(keep); }
$('avatarBtn').onclick = () => { openProfile(); profTab('look'); };
$('profClose').onclick = () => $('profOv').classList.add('hidden');
document.querySelectorAll('#profOv [data-pt]').forEach((b) => (b.onclick = () => profTab(b.dataset.pt)));
$('btnSaveLook').onclick = async () => {
  try { setFashion(await api('/api/profile', draftBasic)); previewLook = null; rebuildPreview(); socket && socket.emit('profile:changed'); toast('Đã lưu nhân vật — mọi người trong phòng sẽ thấy ngay'); }
  catch (e) { toast(e.message); }
};
$('btnOpenWardrobe').onclick = () => { $('profOv').classList.add('hidden'); openWardrobe(); };

// ===================== Tủ đồ: mọi món đều có sẵn, kéo thả để mặc, tự sơn màu, combo điệu nhảy =====================
const thumbCache = new Map();
const DANCE_ICON = { fan: '🪭', bounce: '🎶', wave: '👋', spin: '🌀', robot: '🤖', hop: '🐰', disco: '🕺', shuffle: '👟', clap: '👏', cheer: '🙌', sway: '🌊', floss: '💃', dab: '😎', moonwalk: '🌙', runningman: '🏃', kpopheart: '🫶', zombie: '🧟', horse: '🐎', arms: '🙆', charleston: '🎩', hiphop: '🧢', salsa: '🌶️', twist: '🌀' };
// Ảnh nhỏ minh hoạ món đồ (vẽ 2D theo loại + kiểu, theo màu đã sơn)
function itemThumb(it) {
  const key = it.id + '|' + it.color + '|' + it.accent + '|' + myFashion.gender;
  if (thumbCache.has(key)) return thumbCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = 120; const x = c.getContext('2d');
  const col = it.color || '#cccccc', acc = it.accent || '#888888', st = it.style; let noCache = false;
  const bgl = x.createRadialGradient(60, 60, 4, 60, 60, 62); bgl.addColorStop(0, 'rgba(255,255,255,.34)'); bgl.addColorStop(1, 'rgba(255,255,255,0)');   // nền sáng để đồ màu tối vẫn rõ
  x.fillStyle = bgl; x.fillRect(0, 0, 120, 120);
  x.lineJoin = x.lineCap = 'round'; x.fillStyle = col; x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 3;
  const path = (pts, fill = col) => { x.fillStyle = fill; x.beginPath(); pts.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py))); x.closePath(); x.fill(); x.stroke(); };
  const emoji = (e, px = 60, py = 64, sz = 54) => { x.font = `${sz}px "Segoe UI Emoji","Apple Color Emoji",sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(e, px, py); };
  switch (it.slot) {
    case 'top':
      if (st === 'dress' || st === 'gown') { const L = st === 'gown' ? 112 : 96; path([[48, 18], [72, 18], [76, 46], [st === 'gown' ? 92 : 98, L], [st === 'gown' ? 28 : 22, L], [44, 46]]); x.fillStyle = acc; x.fillRect(st === 'gown' ? 32 : 28, L - 6, st === 'gown' ? 56 : 64, 5); x.fillRect(46, 44, 28, 4); }
      else if (st === 'tank') { path([[44, 20], [54, 20], [60, 32], [66, 20], [76, 20], [82, 46], [84, 100], [36, 100], [38, 46]]); x.fillStyle = acc; x.fillRect(38, 94, 46, 5); }
      else {
        const crop = st === 'crop', wide = st === 'puffer' ? 6 : 0, bot = crop ? 78 : 100;
        path([[40 - wide, 22], [80 + wide, 22], [102 + wide, 40], [92 + wide, 56], [84 + wide, 50], [84 + wide, bot], [36 - wide, bot], [36 - wide, 50], [28 - wide, 56], [18 - wide, 40]]);
        x.fillStyle = acc;
        if (st === 'stripe') for (const yy of [44, 62, 80]) x.fillRect(36, yy, 48, 7);
        else if (st === 'puffer') { for (const yy of [46, 66, 86]) x.fillRect(30, yy, 60, 4); x.fillRect(58, 22, 4, 78); }
        else if (st === 'jacket') { x.fillRect(18, 38, 16, 16); x.fillRect(86, 38, 16, 16); x.fillRect(58, 24, 4, 76); }
        else if (st === 'hoodie') { x.beginPath(); x.arc(60, 26, 14, 0, Math.PI); x.fill(); x.fillRect(46, 70, 28, 14); }
        else if (st === 'shirt' || st === 'suit') { path([[56, 24], [64, 24], [66, 70], [60, 80], [54, 70]], acc); }
        else if (st === 'sailor') { path([[42, 22], [78, 22], [70, 44], [60, 34], [50, 44]], acc); }
        else if (st === 'jersey') { x.font = 'bold 30px sans-serif'; x.textAlign = 'center'; x.fillText('23', 60, 74); }
        else if (st === 'sweater') { x.fillRect(36, 92, 48, 8); }
      }
      break;
    case 'bottom':
      if (st === 'skirt' || st === 'pleat' || st === 'maxi') { const L = st === 'maxi' ? 108 : 86; path([[40, 26], [80, 26], [st === 'maxi' ? 94 : 100, L], [st === 'maxi' ? 26 : 20, L]]);
        x.strokeStyle = acc; if (st === 'pleat') { x.lineWidth = 3; for (const px of [44, 52, 60, 68, 76]) { x.beginPath(); x.moveTo(60 + (px - 60) * 0.6, 30); x.lineTo(px + (px - 60) * 0.4, L - 2); x.stroke(); } }
        if (st !== 'skirt') { x.fillStyle = acc; x.fillRect(st === 'maxi' ? 28 : 22, L - 6, st === 'maxi' ? 64 : 76, 5); } }
      else if (st === 'shorts') path([[34, 28], [86, 28], [90, 72], [64, 72], [60, 48], [56, 72], [30, 72]]);
      else { path([[36, 20], [84, 20], [88, 104], [66, 104], [60, 48], [54, 104], [32, 104]]); x.fillStyle = acc;
        if (st === 'cargo') { x.fillRect(30, 60, 10, 18); x.fillRect(80, 60, 10, 18); } if (st === 'jogger') { x.fillRect(32, 96, 22, 8); x.fillRect(66, 96, 22, 8); } }
      break;
    case 'shoes': {                                             // dáng giày nhìn ngang
      const H = { hightop: 46, boots: 60, rain: 66 }[st] || (st === 'fluffy' || st === 'clog' || st === 'charm' ? 34 : 26);
      if (st === 'heels') { path([[18, 76], [70, 54], [96, 52], [100, 68], [92, 72], [92, 92], [86, 92], [84, 74], [24, 86]]); x.fillStyle = acc; x.fillRect(86, 72, 6, 22); }
      else if (st === 'sandal') { x.fillStyle = acc; x.fillRect(14, 84, 92, 8); x.strokeStyle = col; x.lineWidth = 7; for (const px of [40, 72]) { x.beginPath(); x.arc(px, 84, 16, Math.PI, 0); x.stroke(); } }
      else { path([[14, 88], [14, 70], [40, 62], [70, 88 - H], [100, 88 - H], [104, 88]]); x.fillStyle = acc; x.fillRect(12, 84, 94, st === 'vans' ? 10 : 7);
        if (st === 'vans') { x.fillStyle = acc; x.fillRect(14, 70, 18, 14); } if (st === 'hightop' || st === 'rain') { x.fillRect(70, 88 - H, 32, 6); }
        if (st === 'loafer' || st === 'oxford') x.fillRect(42, 64, 22, 5); if (st === 'charm') { for (const [px, cc] of [[30, '#ffd23a'], [46, '#ff6fa8'], [62, '#5aa8ff']]) { x.fillStyle = cc; x.beginPath(); x.arc(px, 66, 6, 0, Math.PI * 2); x.fill(); } }
        if (st === 'clog') { x.fillStyle = 'rgba(0,0,0,.35)'; for (const px of [34, 48, 62]) { x.beginPath(); x.arc(px, 70, 3.5, 0, Math.PI * 2); x.fill(); } } }
      break;
    }
    case 'hair':
      x.fillStyle = '#f1c9a5'; x.beginPath(); x.arc(60, 66, 30, 0, Math.PI * 2); x.fill(); x.fillStyle = col;
      x.beginPath(); x.arc(60, 60, 34, Math.PI, 0); x.fill();
      for (let k = 0; k < 6; k++) { x.beginPath(); x.moveTo(30 + k * 11, 52); x.lineTo(36 + k * 11, 72 - (k % 2) * 8); x.lineTo(42 + k * 11, 52); x.fill(); }
      if (st.startsWith('f_') && st !== 'f_bob') { x.fillRect(26, 58, 14, st === 'f_long' ? 50 : 26); x.fillRect(80, 58, 14, st === 'f_long' ? 50 : 26); }
      if (st === 'f_bob') { x.fillRect(26, 56, 14, 30); x.fillRect(80, 56, 14, 30); }
      if (st === 'f_twin') { x.beginPath(); x.ellipse(18, 84, 9, 24, 0.2, 0, Math.PI * 2); x.ellipse(102, 84, 9, 24, -0.2, 0, Math.PI * 2); x.fill(); }
      if (st === 'f_pony') { x.beginPath(); x.ellipse(98, 70, 9, 28, -0.4, 0, Math.PI * 2); x.fill(); }
      if (st.endsWith('bun')) { x.beginPath(); x.arc(60, 22, 12, 0, Math.PI * 2); x.fill(); }
      if (st === 'm_spiky') path([[30, 46], [40, 16], [50, 40], [60, 12], [70, 40], [80, 16], [90, 46]]);
      if (st === 'm_wavy') { x.strokeStyle = col; x.lineWidth = 5; x.beginPath(); x.moveTo(60, 26); x.quadraticCurveTo(62, 8, 76, 12); x.stroke(); }
      break;
    case 'face': { x.fillStyle = '#f1c9a5'; x.beginPath(); x.arc(60, 60, 46, 0, Math.PI * 2); x.fill(); const fc = faceTexture(st, myFashion.gender, isHex(col) ? col : '#6a4430').image; x.drawImage(fc, 4, 14, 112, 84); break; }
    case 'hat':
      if (st.endsWith('ears')) { x.strokeStyle = col; x.lineWidth = 8; x.beginPath(); x.arc(60, 80, 34, Math.PI * 1.05, Math.PI * 1.95); x.stroke(); x.fillStyle = col;
        if (st === 'bunny_ears') { x.beginPath(); x.ellipse(46, 30, 9, 26, -0.2, 0, Math.PI * 2); x.ellipse(74, 30, 9, 26, 0.2, 0, Math.PI * 2); x.fill(); }
        else if (st === 'bear_ears') { x.beginPath(); x.arc(34, 52, 13, 0, Math.PI * 2); x.arc(86, 52, 13, 0, Math.PI * 2); x.fill(); }
        else { path([[30, 58], [36, 26], [52, 48]]); path([[90, 58], [84, 26], [68, 48]]); } }
      else if (st === 'crown') { path([[28, 84], [28, 40], [44, 60], [60, 34], [76, 60], [92, 40], [92, 84]]); x.fillStyle = acc; x.beginPath(); x.arc(60, 70, 7, 0, Math.PI * 2); x.fill(); }
      else if (st === 'halo') { x.strokeStyle = col; x.lineWidth = 9; x.beginPath(); x.ellipse(60, 60, 38, 14, 0, 0, Math.PI * 2); x.stroke(); }
      else if (st === 'witch') { path([[60, 12], [82, 78], [38, 78]]); x.beginPath(); x.ellipse(60, 80, 46, 10, 0, 0, Math.PI * 2); x.fill(); x.fillStyle = acc; x.fillRect(42, 66, 36, 7); }
      else if (st === 'tophat') { path([[40, 24], [80, 24], [80, 82], [40, 82]]); x.fillRect(20, 80, 80, 8); x.fillStyle = acc; x.fillRect(40, 68, 40, 9); }
      else if (st === 'bucket') { path([[38, 40], [82, 40], [90, 78], [30, 78]]); x.beginPath(); x.ellipse(60, 80, 48, 10, 0, 0, Math.PI * 2); x.fill(); x.fillStyle = acc; x.fillRect(34, 66, 52, 8); }
      else if (st === 'beret') { x.beginPath(); x.ellipse(60, 64, 44, 20, -0.15, 0, Math.PI * 2); x.fill(); x.stroke(); x.fillRect(60, 38, 4, 10); }
      else { x.beginPath(); x.arc(60, 72, 34, Math.PI, 0); x.closePath(); x.fill(); x.stroke(); if (st === 'cap') { x.fillStyle = acc; x.fillRect(60, 68, 44, 9); } if (st === 'beanie') { x.fillRect(24, 68, 72, 10); x.beginPath(); x.arc(60, 36, 8, 0, Math.PI * 2); x.fill(); } }
      break;
    case 'glasses': x.strokeStyle = col; x.fillStyle = col; x.lineWidth = 7;
      if (st === 'sun') { x.fillRect(18, 46, 36, 24); x.fillRect(66, 46, 36, 24); }
      else if (st === 'square') { x.strokeRect(18, 46, 36, 26); x.strokeRect(66, 46, 36, 26); }
      else if (st === 'heart' || st === 'star') { emoji(st === 'heart' ? '❤' : '★', 36, 60, 40); emoji(st === 'heart' ? '❤' : '★', 84, 60, 40); }
      else { x.beginPath(); x.arc(38, 60, 18, 0, Math.PI * 2); x.stroke(); x.beginPath(); x.arc(82, 60, 18, 0, Math.PI * 2); x.stroke(); }
      x.beginPath(); x.moveTo(54, 56); x.lineTo(66, 56); x.stroke(); break;
    case 'back':
      if (st === 'wings_bat' || st === 'wings_dragon') { for (const sx of [-1, 1]) path([[60, 50], [60 + sx * 26, 26], [60 + sx * 52, 30], [60 + sx * 44, 52], [60 + sx * 50, 74], [60 + sx * 30, 64], [60 + sx * 22, 84]]); }
      else if (st === 'wings_butterfly') { for (const sx of [-1, 1]) { x.beginPath(); x.ellipse(60 + sx * 26, 44, 26, 20, sx * 0.5, 0, Math.PI * 2); x.fill(); x.stroke(); x.beginPath(); x.ellipse(60 + sx * 20, 80, 16, 14, -sx * 0.4, 0, Math.PI * 2); x.fill(); x.stroke(); x.fillStyle = acc; x.beginPath(); x.arc(60 + sx * 32, 40, 6, 0, Math.PI * 2); x.fill(); x.fillStyle = col; } }
      else if (st === 'wings_mecha') { for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) { x.save(); x.translate(60 + sx * 8, 54 + k * 6); x.rotate(sx * (-0.5 + k * 0.4)); x.fillStyle = col; x.fillRect(sx > 0 ? 0 : -46 + k * 6, -5, 46 - k * 6, 10); x.fillStyle = acc; x.fillRect(sx > 0 ? 4 : -40 + k * 6, -1, 36 - k * 6, 2); x.restore(); } }
      else if (st.startsWith('wings')) { for (const sx of [-1, 1]) { x.globalAlpha = st === 'wings_fairy' ? 0.7 : 1; x.beginPath(); x.ellipse(60 + sx * 28, 50, 28, 16, sx * 0.5, 0, Math.PI * 2); x.fill(); x.stroke(); x.fillStyle = acc; x.beginPath(); x.ellipse(60 + sx * 24, 78, 18, 10, sx * 0.3, 0, Math.PI * 2); x.fill(); x.stroke(); x.fillStyle = col; x.globalAlpha = 1; } }
      else { x.beginPath(); x.roundRect ? x.roundRect(30, 26, 60, 74, 18) : x.rect(30, 26, 60, 74); x.fill(); x.stroke(); if (st === 'bear_bag') { x.beginPath(); x.arc(34, 30, 12, 0, Math.PI * 2); x.arc(86, 30, 12, 0, Math.PI * 2); x.fill(); x.fillStyle = acc; x.beginPath(); x.ellipse(60, 70, 14, 10, 0, 0, Math.PI * 2); x.fill(); } else { x.fillStyle = acc; x.fillRect(40, 64, 40, 22); } }
      break;
    case 'mount':
      if (st === 'cloud') { x.beginPath(); for (const [px, py, r] of [[40, 70, 22], [62, 60, 28], [86, 70, 20], [60, 80, 22]]) x.arc(px, py, r, 0, Math.PI * 2); x.fill(); }
      else if (st === 'duck') { x.beginPath(); x.ellipse(64, 76, 40, 24, 0, 0, Math.PI * 2); x.arc(36, 46, 18, 0, Math.PI * 2); x.fill(); x.fillStyle = acc; x.fillRect(12, 44, 14, 7); }
      else if (st === 'ufo') { x.fillStyle = acc; x.globalAlpha = 0.6; x.beginPath(); x.arc(60, 56, 20, Math.PI, 0); x.fill(); x.globalAlpha = 1; x.fillStyle = col; x.beginPath(); x.ellipse(60, 66, 48, 14, 0, 0, Math.PI * 2); x.fill(); x.stroke(); x.fillStyle = acc; for (const px of [30, 50, 70, 90]) { x.beginPath(); x.arc(px, 68, 4, 0, Math.PI * 2); x.fill(); } }
      else { x.beginPath(); x.roundRect ? x.roundRect(14, 64, 92, 12, 6) : x.rect(14, 64, 92, 12); x.fill(); x.fillStyle = acc; x.beginPath(); x.arc(30, 84, 8, 0, Math.PI * 2); x.arc(90, 84, 8, 0, Math.PI * 2); x.fill(); if (st === 'scooter') { x.fillRect(84, 20, 6, 46); x.fillRect(74, 18, 26, 6); } }
      break;
    case 'seat': { const sc = isHex(it.color) ? col : '#5a5f6a'; x.fillStyle = sc; x.fillRect(32, 22, 56, 50); x.fillRect(28, 66, 64, 22); x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(22, 56, 10, 34); x.fillRect(88, 56, 10, 34);
      if (SEAT_SKIN_ICON[st]) { x.fillStyle = '#000'; emoji(SEAT_SKIN_ICON[st], 60, 44, 40); } break; }
    case 'bubble': x.fillStyle = col;
      if (st === 'spike') { const pts = []; for (let k = 0; k < 20; k++) { const an = k / 20 * Math.PI * 2, r = k % 2 ? 0.8 : 1; pts.push([60 + Math.cos(an) * 48 * r, 52 + Math.sin(an) * 32 * r]); } x.strokeStyle = it.border || 'rgba(0,0,0,.35)'; path(pts, col); }
      else { const r = st === 'square' ? 4 : st === 'cloud' ? 28 : 18; x.beginPath(); x.roundRect ? x.roundRect(14, 24, 92, 56, r) : x.rect(14, 24, 92, 56); x.fill(); if (it.border) { x.strokeStyle = it.border; x.lineWidth = 5; x.stroke(); } x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 3;
        if (st === 'cloud') { x.beginPath(); x.arc(52, 90, 6, 0, Math.PI * 2); x.arc(44, 102, 4, 0, Math.PI * 2); x.fill(); } else path([[52, 78], [68, 78], [60, 94]], col); }
      x.fillStyle = acc; x.font = 'bold 26px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'alphabetic'; x.fillText('Hi!', 60, 62); break;
    case 'dance': emoji(DANCE_ICON[st] || '🎵', 60, 62, 58); break;
    case 'avframe': x.fillStyle = '#5a5248'; x.beginPath(); x.arc(60, 64, 30, 0, Math.PI * 2); x.fill();
      { const gr = x.createLinearGradient(20, 20, 100, 100); gr.addColorStop(0, col); gr.addColorStop(1, acc); x.strokeStyle = gr; x.lineWidth = 8; x.beginPath(); x.arc(60, 64, 36, 0, Math.PI * 2); x.stroke(); }
      x.fillStyle = '#000'; emoji(it.ico || '✨', 92, 30, 30); break;
    case 'nameplate': { const gr = x.createLinearGradient(10, 0, 110, 0); gr.addColorStop(0, 'rgba(40,40,46,.9)'); gr.addColorStop(0.45, col); gr.addColorStop(1, acc); x.fillStyle = gr; x.beginPath(); x.roundRect ? x.roundRect(8, 40, 104, 40, 12) : x.rect(8, 40, 104, 40); x.fill();
      x.fillStyle = '#d9cbb0'; x.beginPath(); x.arc(28, 60, 11, 0, Math.PI * 2); x.fill(); x.fillStyle = 'rgba(255,255,255,.85)'; x.fillRect(44, 55, 34, 9); x.fillStyle = '#000'; emoji(it.ico || '✨', 96, 60, 24); break; }
    case 'pfx': x.fillStyle = 'rgba(30,34,32,.95)'; x.beginPath(); x.roundRect ? x.roundRect(22, 12, 76, 96, 12) : x.rect(22, 12, 76, 96); x.fill(); x.fillStyle = '#000';
      for (const [px, py, sz] of [[40, 34, 20], [78, 50, 16], [52, 72, 24], [82, 92, 14], [36, 96, 14]]) emoji(it.ico || '✨', px, py, sz); break;
    case 'cardframe': x.fillStyle = 'rgba(30,34,32,.95)'; x.beginPath(); x.roundRect ? x.roundRect(24, 16, 72, 92, 12) : x.rect(24, 16, 72, 92); x.fill();
      x.strokeStyle = col; x.lineWidth = 7; x.stroke(); x.strokeStyle = acc; x.lineWidth = 2; x.beginPath(); x.roundRect ? x.roundRect(31, 23, 58, 78, 8) : x.rect(31, 23, 58, 78); x.stroke();
      x.fillStyle = '#000'; emoji(it.ico || '✨', 60, 18, 26); break;
    case 'namefont': {
      const fam = `"${it.font}", system-ui, sans-serif`;
      if (!document.fonts.check(`700 40px "${it.font}"`)) { document.fonts.load(`700 40px "${it.font}"`).catch(() => {}); noCache = true; }
      x.fillStyle = '#f2efe8'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `700 46px ${fam}`; x.fillText('Aa', 60, 52); x.font = `700 20px ${fam}`; x.fillStyle = '#e8b45e'; x.fillText('Tên', 60, 92); break;
    }
    case 'nameeffect': {
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '800 38px system-ui, sans-serif';
      const gr = x.createLinearGradient(20, 0, 100, 0);
      const stops = { rainbow: ['#ff4d4d', '#ffe94a', '#5ee07a', '#3fd6ff', '#ff4dd8'], fire: ['#ff3d00', '#ffea00'], gold: ['#9a6a1a', '#fff3c4', '#e8c24a'], ice: ['#ffffff', col], shine: [col, '#ffffff', col], gradient: [col, acc] }[st] || [col, col];
      stops.forEach((cc, k) => gr.addColorStop(k / Math.max(1, stops.length - 1), cc));
      if (st === 'glow' || st === 'neon') { x.shadowColor = acc; x.shadowBlur = 12; }
      if (st === 'outline') { x.strokeStyle = acc; x.lineWidth = 5; x.strokeText('Tên', 60, 60); }
      if (st === '3d') { x.fillStyle = acc; x.fillText('Tên', 63, 63); }
      x.fillStyle = gr; x.fillText('Tên', 60, 60); x.shadowBlur = 0; break;
    }
    case 'pet': x.fillStyle = col; x.beginPath(); x.arc(60, 62, 44, 0, Math.PI * 2); x.fill(); x.fillStyle = '#000';
      emoji({ dog: '🐶', cat: '🐱', chicken: '🐔', hamster: '🐹', bird: '🐦', rabbit: '🐰', penguin: '🐧', pig: '🐷' }[st] || '🐾', 60, 64, 58); break;
  }
  const url = c.toDataURL(); if (!noCache) thumbCache.set(key, url); return url;
}

// ---- bản nháp trong tủ đồ: đồ đang mặc + màu sơn (chưa lưu)
const WARD_LEFT = ['hat', 'hair', 'glasses', 'top', 'bottom', 'shoes', 'back'], WARD_RIGHT = ['face', 'pet', 'mount', 'seat', 'bubble', 'dance'];
const WARD_SHORT = { hat: 'Mũ', hair: 'Tóc', top: 'Áo', bottom: 'Quần', shoes: 'Giày', back: 'Lưng', glasses: 'Kính', face: 'Mặt', mount: 'Thú cưỡi', pet: 'Thú cưng', seat: 'Ghế', bubble: 'Chat', dance: 'Nhảy', avframe: 'Khung ảnh', nameplate: 'Bảng tên', pfx: 'Hiệu ứng', cardframe: 'Khung HS', namefont: 'Phông tên', nameeffect: 'Màu tên' };
const PAINT_LABEL = { hair: ['Màu tóc'], face: ['Màu mắt'], bubble: ['Nền', 'Chữ'], seat: ['Màu ghế', 'Trang trí'], mount: ['Màu chính', 'Màu phụ'] };
const SWATCHES = ['#ffffff', '#1b1b1f', '#8a8f99', '#c8263a', '#e8573a', '#f2c24a', '#9be37a', '#2f7a4a', '#3fd6b0', '#5aa8ff', '#1f2f5a', '#a77bff', '#ff6fa8', '#f4a6b8', '#6b4a32', '#d9cbb0'];
const WARD_PER_PAGE = 30, MAX_DANCES = CATALOG.maxDances || 4;
let wd = { equip: {}, paint: {} };
let wardPage = 0, wardFilter = 'all', wardSearch = '', wardSorted = false, wardSel = null, dragSlot = null, wardFocus = 'top', paintTarget = 0;
const danceList = (v) => (Array.isArray(v) ? v : v ? [v] : []).filter((id) => ITEM.get(id));
const allowed = (it) => it.g === 'u' || it.g === myFashion.gender;
function normEquip(eq) {                                       // bỏ món không còn trong danh mục / sai giới tính, thiếu thì lấy đồ cơ bản
  const o = {};
  for (const [sl, id] of Object.entries(eq || {})) { if (sl === 'dance') continue; const it = ITEM.get(id); if (it && it.slot === sl && allowed(it)) o[sl] = id; }
  for (const id of CATALOG.starter[myFashion.gender]) { const it = ITEM.get(id); if (it.slot !== 'dance' && !o[it.slot]) o[it.slot] = id; }
  o.dance = danceList(eq && eq.dance).filter((id) => ITEM.get(id).slot === 'dance' && allowed(ITEM.get(id)));
  if (!o.dance.length) o.dance = ['dance_bounce'];
  return o;
}
const isWorn = (it) => (it.slot === 'dance' ? wd.equip.dance.includes(it.id) : wd.equip[it.slot] === it.id);
const draftColors = (it) => { const pc = wd.paint[it.id]; return [(pc && pc[0]) || it.color || null, (pc && pc[1]) || it.accent || null]; };
const shown = (it) => paintItem(it, wd.paint);
function setPvMode(m) { if (m === pvMode) return; pvMode = m; pvDances = null; pvYaw = m === 'seat' ? Math.PI * 0.82 : 0; }
function refreshPreview() { previewLook = myLookObj(wd.equip, wd.paint); rebuildPreview(); }
function setFocus(slot) {
  wardFocus = slot; paintTarget = 0;
  setPvMode(slot === 'seat' ? 'seat' : slot === 'dance' ? 'dance' : 'stand');
  refreshPreview();
}
function equipDraft(id) {
  const it = ITEM.get(id); if (!it || !allowed(it)) return;
  if (it.slot === 'dance') {
    if (wd.equip.dance.includes(id)) return toast('Điệu này đã có trong combo');
    if (wd.equip.dance.length >= MAX_DANCES) return toast(`Combo tối đa ${MAX_DANCES} điệu — bỏ bớt 1 điệu trước`);
    wd.equip.dance = [...wd.equip.dance, id]; pvDances = null;
  } else wd.equip[it.slot] = id;
  wardSel = id; wardFocus = it.slot; paintTarget = 0;
  setPvMode(it.slot === 'seat' ? 'seat' : it.slot === 'dance' ? 'dance' : 'stand');
  refreshPreview(); renderWardrobe();
}
function unequipDraft(slot, id) {
  if (slot === 'dance') {
    if (wd.equip.dance.length <= 1) return toast('Combo phải có ít nhất 1 điệu nhảy');
    wd.equip.dance = wd.equip.dance.filter((x2) => x2 !== (id || wd.equip.dance[wd.equip.dance.length - 1])); pvDances = null;
  } else if (!OPTIONAL_SLOTS.includes(slot)) return toast(`Ô "${SLOT_NAME[slot]}" luôn phải mặc 1 món — kéo món khác vào để thay`);
  else delete wd.equip[slot];
  refreshPreview(); renderWardrobe();
}
function highlightSlot(slot) { document.querySelectorAll('#wardBody .wslot').forEach((el) => el.classList.toggle('can', el.dataset.slot === slot)); $('wardPreview').classList.toggle('can', !!slot); }
function wardSlotEl(slot) {
  const el = document.createElement('div'); el.className = 'wslot' + (slot === wardFocus ? ' focus' : ''); el.dataset.slot = slot;
  const id = slot === 'dance' ? wd.equip.dance[0] : wd.equip[slot], it = id && ITEM.get(id);
  if (it) {
    const img = document.createElement('img'); img.src = itemThumb(shown(it)); img.alt = ''; img.draggable = false; el.appendChild(img);
    el.title = slot === 'dance' ? 'Combo: ' + wd.equip.dance.map((d) => ITEM.get(d).name).join(' → ') : it.name + (OPTIONAL_SLOTS.includes(slot) ? ' — kéo ra ngoài / nháy đúp để tháo' : '');
    if (slot === 'dance') { const n = document.createElement('i'); n.textContent = wd.equip.dance.length + '/' + MAX_DANCES; el.appendChild(n); }
    el.draggable = OPTIONAL_SLOTS.includes(slot);
    el.ondragstart = (e) => { e.dataTransfer.setData('text/plain', 'slot:' + slot); e.dataTransfer.effectAllowed = 'move'; };
  } else { el.classList.add('empty'); el.title = 'Trống — kéo ' + SLOT_NAME[slot].toLowerCase() + ' vào đây'; }
  const lb = document.createElement('span'); lb.textContent = WARD_SHORT[slot]; el.appendChild(lb);
  el.ondragover = (e) => { if (dragSlot === slot) { e.preventDefault(); el.classList.add('over'); } };
  el.ondragleave = () => el.classList.remove('over');
  el.ondrop = (e) => { e.preventDefault(); el.classList.remove('over'); const d = e.dataTransfer.getData('text/plain'); if (d && !d.startsWith('slot:')) equipDraft(d); };
  el.ondblclick = () => it && slot !== 'dance' && unequipDraft(slot);
  el.oncontextmenu = (e) => { e.preventDefault(); if (it && slot !== 'dance') unequipDraft(slot); };
  el.onclick = () => { wardFilter = slot; wardPage = 0; setFocus(slot); renderWardrobe(); };   // bấm ô → sơn màu món đó + lọc kho
  return el;
}
function wardItems() {
  const q = wardSearch.trim().toLowerCase();
  let list = CATALOG.items.filter((it) => allowed(it) && (wardFilter === 'all' || it.slot === wardFilter) && (!q || it.name.toLowerCase().includes(q)));
  if (wardSorted) list = [...list].sort((a2, b2) => a2.name.localeCompare(b2.name, 'vi'));
  return list;
}

// ---- bảng sơn màu (ô vuông độ đậm/sáng + thanh màu + mã HEX + màu nhanh) hoặc combo điệu nhảy
const hsvToHex = (h, s2, v) => { const f = (n) => { const k = (n + h / 60) % 6; return v - v * s2 * Math.max(0, Math.min(k, 4 - k, 1)); }; return '#' + [f(5), f(3), f(1)].map((c2) => Math.round(c2 * 255).toString(16).padStart(2, '0')).join(''); };
function hexToHsv(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0; if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: mx ? d / mx : 0, v: mx };
}
let pk = { h: 0, s: 1, v: 1 };
function focusItem() { const id = wardFocus === 'dance' ? null : wd.equip[wardFocus]; return id ? ITEM.get(id) : null; }
function drawSV() {
  const cv = $('pkSV'), x = cv.getContext('2d'), w = cv.width, h = cv.height;
  x.fillStyle = `hsl(${pk.h},100%,50%)`; x.fillRect(0, 0, w, h);
  const g1 = x.createLinearGradient(0, 0, w, 0); g1.addColorStop(0, '#fff'); g1.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g1; x.fillRect(0, 0, w, h);
  const g2 = x.createLinearGradient(0, 0, 0, h); g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(1, '#000'); x.fillStyle = g2; x.fillRect(0, 0, w, h);
  $('pkSVKnob').style.left = pk.s * 100 + '%'; $('pkSVKnob').style.top = (1 - pk.v) * 100 + '%';
  $('pkHueKnob').style.left = pk.h / 360 * 100 + '%';
}
function applyPaint(hex, commit) {
  const it = focusItem(); if (!it) return;
  const cur = draftColors(it), arr = [wd.paint[it.id] ? wd.paint[it.id][0] : null, wd.paint[it.id] ? wd.paint[it.id][1] : null];
  arr[paintTarget] = hex; wd.paint[it.id] = arr;
  $('pkHex').value = hex; $('pkCur').style.background = hex;
  if (cur[paintTarget] === hex && !commit) return;
  if (PROFILE_SLOTS.includes(it.slot)) renderCardPreview();
  else if (commit || it.slot !== 'face') schedulePreview();    // biểu cảm: chỉ vẽ lại mắt khi thả chuột
  if (commit) renderWardrobe(true);
}
function bindDrag(el, onMove) {
  el.onpointerdown = (e) => { el.setPointerCapture(e.pointerId); onMove(e, false); el.onpointermove = (ev) => onMove(ev, false); };
  el.onpointerup = el.onpointercancel = (e) => { el.onpointermove = null; onMove(e, true); };
}
function renderPanel() {
  const P = $('wardPanel'); P.textContent = '';
  if (wardFocus === 'bg') return renderBgPanel(P);
  const head = document.createElement('div'); head.className = 'wp-head'; P.appendChild(head);
  if (wardFocus === 'dance') {
    head.innerHTML = `<b>Combo điệu nhảy</b><small>${wd.equip.dance.length}/${MAX_DANCES} điệu · mỗi điệu 4 giây, lặp lại</small>`;
    const box = document.createElement('div'); box.className = 'wp-combo';
    wd.equip.dance.forEach((id, k) => {
      const it = ITEM.get(id), ch = document.createElement('div'); ch.className = 'wp-dance';
      ch.innerHTML = `<i>${k + 1}</i><span>${DANCE_ICON[it.style] || '🎵'} ${it.name}</span>`;
      const play = document.createElement('button'); play.type = 'button'; play.textContent = '▶'; play.title = 'Xem thử điệu này'; play.onclick = () => { pvDances = [it.style]; setPvMode('dance'); };
      const up = document.createElement('button'); up.type = 'button'; up.textContent = '↑'; up.title = 'Đưa lên trước'; up.disabled = k === 0;
      up.onclick = () => { const d = [...wd.equip.dance]; [d[k - 1], d[k]] = [d[k], d[k - 1]]; wd.equip.dance = d; pvDances = null; refreshPreview(); renderWardrobe(); };
      const rm = document.createElement('button'); rm.type = 'button'; rm.textContent = '✕'; rm.title = 'Bỏ khỏi combo'; rm.onclick = () => unequipDraft('dance', id);
      ch.append(play, up, rm); box.appendChild(ch);
    });
    P.appendChild(box);
    const all = document.createElement('button'); all.type = 'button'; all.className = 'wp-play'; all.textContent = '▶ Xem cả combo'; all.onclick = () => { pvDances = null; setPvMode('dance'); };
    const tip = document.createElement('p'); tip.className = 'hint'; tip.textContent = 'Bấm 1 điệu trong kho để xem thử; kéo vào ô "Nhảy" hoặc nháy đúp để thêm vào combo.';
    P.append(all, tip);
    return;
  }
  const it = focusItem();
  if (!it) { head.innerHTML = `<b>${SLOT_NAME[wardFocus]}</b><small>Chưa đeo món nào — kéo 1 món trong kho vào ô "${WARD_SHORT[wardFocus]}"</small>`; return; }
  const cols = draftColors(it), labels = PAINT_LABEL[it.slot] || ['Màu chính', 'Màu phụ'], n = it.accent || (labels.length > 1 && it.slot !== 'hair' && it.slot !== 'face') ? 2 : 1;
  if (!it.color && !it.accent && it.slot !== 'seat') { head.innerHTML = `<b>${it.name}</b><small>Món này không sơn màu được</small>`; if (OPTIONAL_SLOTS.includes(it.slot)) { const off = document.createElement('button'); off.type = 'button'; off.className = 'wp-off'; off.textContent = 'Tháo ra'; off.onclick = () => unequipDraft(it.slot); head.appendChild(off); } return; }
  if (paintTarget >= n) paintTarget = 0;
  head.innerHTML = `<b>Sơn màu · ${it.name}</b>`;
  if (OPTIONAL_SLOTS.includes(it.slot)) { const off = document.createElement('button'); off.type = 'button'; off.className = 'wp-off'; off.textContent = 'Tháo ra'; off.onclick = () => unequipDraft(it.slot); head.appendChild(off); }
  const tg = document.createElement('div'); tg.className = 'wp-tg';
  for (let k = 0; k < n; k++) {
    const b = document.createElement('button'); b.type = 'button'; b.className = k === paintTarget ? 'on' : '';
    b.innerHTML = `<i style="background:${cols[k] || '#888888'}"></i>${labels[k] || 'Màu phụ'}`;
    b.onclick = () => { paintTarget = k; renderPanel(); }; tg.appendChild(b);
  }
  const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'wp-reset'; reset.textContent = 'Màu gốc';
  reset.onclick = () => { wd.paint[it.id] = [null, null]; schedulePreview(); renderWardrobe(true); };
  tg.appendChild(reset); P.appendChild(tg);
  const cur = cols[paintTarget] || '#888888'; pk = hexToHsv(cur);
  const row = document.createElement('div'); row.className = 'wp-pick';
  row.innerHTML = `<div class="pk-left"><div class="pk-sv"><canvas id="pkSV" width="176" height="96"></canvas><b id="pkSVKnob"></b></div><div class="pk-hue" id="pkHue"><b id="pkHueKnob"></b></div></div>
    <div class="pk-right"><div class="pk-hexrow"><span id="pkCur"></span><input id="pkHex" maxlength="7" spellcheck="false"></div><div class="pk-sw" id="pkSw"></div></div>`;
  P.appendChild(row);
  $('pkHex').value = cur; $('pkCur').style.background = cur;
  for (const c2 of SWATCHES) { const b = document.createElement('button'); b.type = 'button'; b.style.background = c2; b.title = c2; b.onclick = () => { pk = hexToHsv(c2); drawSV(); applyPaint(c2, true); }; $('pkSw').appendChild(b); }
  drawSV();
  bindDrag($('pkSV').parentElement, (e, end) => {
    const r = $('pkSV').getBoundingClientRect(); pk.s = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); pk.v = 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    drawSV(); applyPaint(hsvToHex(pk.h, pk.s, pk.v), end);
  });
  bindDrag($('pkHue'), (e, end) => {
    const r = $('pkHue').getBoundingClientRect(); pk.h = Math.min(359.9, Math.max(0, (e.clientX - r.left) / r.width * 360));
    drawSV(); applyPaint(hsvToHex(pk.h, pk.s, pk.v), end);
  });
  $('pkHex').onchange = () => { let v = $('pkHex').value.trim(); if (!v.startsWith('#')) v = '#' + v; if (!isHex(v)) { $('pkHex').value = cur; return toast('Mã màu dạng #RRGGBB, ví dụ #eb4034'); } v = v.toLowerCase(); pk = hexToHsv(v); drawSV(); applyPaint(v, true); };
}
function wardChanged() {
  const a2 = normEquip(myFashion.equip), b2 = wd.equip;
  if (CATALOG.slots.some((s2) => JSON.stringify(b2[s2.id] ?? null) !== JSON.stringify(a2[s2.id] ?? null))) return true;
  const np = (pc) => (pc ? [pc[0] || null, pc[1] || null] : [null, null]);
  return Object.keys(wd.paint).some((id) => JSON.stringify(np(wd.paint[id])) !== JSON.stringify(np(myFashion.paint[id])));
}
function renderWardrobe(keepPanel) {
  const L = $('wardColL'), R = $('wardColR'); L.textContent = R.textContent = '';
  WARD_LEFT.forEach((sl) => L.appendChild(wardSlotEl(sl))); WARD_RIGHT.forEach((sl) => R.appendChild(wardSlotEl(sl)));
  const PP = $('wardColP'); PP.textContent = ''; PROFILE_SLOTS.forEach((sl) => PP.appendChild(wardSlotEl(sl)));
  { const bt = document.createElement('div'); bt.className = 'wslot' + (wardFocus === 'bg' ? ' focus' : ''); bt.title = 'Nền sau lưng nhân vật: màu hoặc ảnh';
    const sw = document.createElement('i'); sw.className = 'bgsw'; applyBg(sw, username, bgShown()); if (!bgShown()) sw.classList.add('none');
    const lb = document.createElement('span'); lb.textContent = 'Nền'; bt.append(sw, lb);
    bt.onclick = () => { wardFocus = 'bg'; setPvMode('stand'); refreshPreview(); renderWardrobe(); }; PP.appendChild(bt); }
  applyWardBg();
  const f = $('wardFilter');
  if (!f.options.length) { f.add(new Option('Toàn bộ', 'all')); for (const sl of CATALOG.slots) f.add(new Option(sl.name, sl.id)); }
  f.value = wardFilter;
  const list = wardItems(), pages = Math.max(1, Math.ceil(list.length / WARD_PER_PAGE));
  wardPage = Math.min(wardPage, pages - 1);
  const grid = $('wardGrid'); grid.textContent = '';
  const pageItems = list.slice(wardPage * WARD_PER_PAGE, (wardPage + 1) * WARD_PER_PAGE);
  for (let k = 0; k < WARD_PER_PAGE; k++) {
    const it = pageItems[k], cell = document.createElement('div'); cell.className = 'witem';
    if (!it) { cell.classList.add('void'); grid.appendChild(cell); continue; }
    const img = document.createElement('img'); img.src = itemThumb(shown(it)); img.alt = ''; img.draggable = false; cell.appendChild(img);
    if (isWorn(it)) { cell.classList.add('worn'); const t = document.createElement('i'); t.textContent = it.slot === 'dance' ? String(wd.equip.dance.indexOf(it.id) + 1) : 'E'; cell.appendChild(t); }
    if (wardSel === it.id) cell.classList.add('sel');
    cell.title = `${it.name} · ${SLOT_NAME[it.slot]}${it.g === 'm' ? ' · Nam' : it.g === 'f' ? ' · Nữ' : ''}`;
    cell.draggable = true;
    cell.ondragstart = (e) => { e.dataTransfer.setData('text/plain', it.id); e.dataTransfer.effectAllowed = 'copy'; dragSlot = it.slot; highlightSlot(it.slot); };
    cell.ondragend = () => { dragSlot = null; highlightSlot(null); };
    cell.onclick = () => {
      if (IS_TOUCH) { if (it.slot === 'dance' && !wd.equip.dance.includes(it.id)) { wardFocus = 'dance'; setPvMode('dance'); pvDances = [it.style]; } equipDraft(it.id); return; }   // cảm ứng: chạm = mặc luôn
      wardSel = it.id;
      if (it.slot === 'dance') { wardFocus = 'dance'; setPvMode('dance'); pvDances = [it.style]; if (pvAv && pvAv.mount) refreshPreview(); }   // xem thử điệu nhảy
      renderWardrobe();
    };
    cell.ondblclick = () => equipDraft(it.id);                                     // nháy đúp = mặc / thêm vào combo
    grid.appendChild(cell);
  }
  $('wardPage').textContent = `${wardPage + 1}/${pages}`;
  $('wardPrev').disabled = wardPage === 0; $('wardNext').disabled = wardPage >= pages - 1;
  const sel = wardSel && ITEM.get(wardSel);
  $('wardInfo').textContent = sel ? `${sel.name} — ${SLOT_NAME[sel.slot]}${sel.slot === 'dance' ? ' (đang xem thử)' : ''}` : `${list.length} vật phẩm`;
  $('wardSort').classList.toggle('on2', wardSorted);
  const changed = wardChanged();
  $('btnWardSave').disabled = !changed; $('btnWardReset').disabled = !changed;
  renderCardPreview();
  if (!keepPanel || !$('pkSV')) renderPanel();
  else { const it = focusItem(); if (it) { const cols = draftColors(it); document.querySelectorAll('#wardPanel .wp-tg button i').forEach((el, k) => (el.style.background = cols[k] || '#888888')); } }
}
// xem trước thẻ hồ sơ (khung ảnh + bảng tên + khung hồ sơ + hiệu ứng) khi đang chọn các ô hồ sơ
function renderCardPreview() {
  const box = $('wardCardPv'), show = PROFILE_SLOTS.includes(wardFocus);
  box.classList.toggle('hidden', !show); if (!show) return;
  const look = myLookObj(wd.equip, wd.paint), fr = lookItem(look, 'avframe');
  box.innerHTML = '<div class="mc-av"></div><div class="mc-np"><span class="pa"></span><b></b></div><small class="hint" style="margin:0">Xem trước hồ sơ của bạn</small>';
  applyBg(box, username, bgShown());
  const av = box.querySelector('.mc-av'); setAvatarEl(av, username, myAvatarVer); applyAvFrame(av, fr);
  const np = box.querySelector('.mc-np'), pa = np.querySelector('.pa'); setAvatarEl(pa, username, myAvatarVer); applyAvFrame(pa, fr);
  np.querySelector('b').textContent = ''; np.querySelector('b').append(nameEl(username, look), genderTag(look)); applyNameplate(np, lookItem(look, 'nameplate'));
  applyCard(box, lookItem(look, 'cardframe'), lookItem(look, 'pfx'));
}
// ---- Nền sau lưng nhân vật (thẻ hồ sơ + khung xem trước): 2 màu chuyển hoặc ảnh tải lên — lưu ngay, không cần bấm "Lưu trang phục"
let bgDraft = null, bgMode = null;
const bgShown = () => bgDraft || myBg;
const BG_PRESETS = [['#ff9a8b', '#ff6a88'], ['#a18cd1', '#fbc2eb'], ['#84fab0', '#8fd3f4'], ['#fccb90', '#d57eeb'], ['#30cfd0', '#330867'], ['#0f2027', '#2c5364'], ['#f6d365', '#fda085'], ['#232526', '#414345'], ['#ff512f', '#dd2476'], ['#1d976c', '#93f9b9']];
function applyWardBg() { applyBg($('wardPreview').parentElement, username, bgShown()); }
async function saveBg(body, msg) {
  try { const r = await api('/api/profilebg', body); myBg = r.bg; bgDraft = null; socket && socket.emit('profile:changed'); toast(msg); renderWardrobe(); }
  catch (e) { toast(e.message || 'Không lưu được nền'); }
}
function renderBgPanel(P) {
  const cur = bgShown(); if (!bgMode) bgMode = cur && cur.type === 'image' ? 'image' : 'color';
  const head = document.createElement('div'); head.className = 'wp-head'; head.innerHTML = '<b>Nền sau lưng nhân vật</b><small>Hiện ở thẻ hồ sơ khi người khác bấm vào bạn</small>'; P.appendChild(head);
  const tabs = document.createElement('div'); tabs.className = 'wp-tg';
  for (const [m, t] of [['color', 'Màu'], ['image', 'Ảnh']]) { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.className = bgMode === m ? 'on' : ''; b.onclick = () => { bgMode = m; renderPanel(); }; tabs.appendChild(b); }
  const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'wp-reset'; rm.textContent = 'Bỏ nền'; rm.disabled = !myBg; rm.onclick = () => saveBg({ reset: true }, 'Đã bỏ nền'); tabs.appendChild(rm);
  P.appendChild(tabs);
  if (bgMode === 'color') {
    const d = bgDraft && bgDraft.type === 'color' ? bgDraft : cur && cur.type === 'color' ? { ...cur } : { type: 'color', c1: '#a18cd1', c2: '#fbc2eb', ang: 160 };
    const set = (k, v) => { bgDraft = { ...d, [k]: v }; Object.assign(d, bgDraft); applyWardBg(); prev.style.background = bgCss(username, bgDraft); };
    const row = document.createElement('div'); row.className = 'bg-row';
    row.innerHTML = `<label>Màu 1<input type="color" value="${d.c1}"></label><label>Màu 2<input type="color" value="${d.c2}"></label><label class="ang">Góc chuyển<input type="range" min="0" max="360" value="${d.ang ?? 160}"></label>`;
    const [i1, i2, ia] = row.querySelectorAll('input');
    i1.oninput = () => set('c1', i1.value); i2.oninput = () => set('c2', i2.value); ia.oninput = () => set('ang', +ia.value);
    P.appendChild(row);
    const pr = document.createElement('div'); pr.className = 'bg-presets';
    for (const [a, b] of BG_PRESETS) { const x = document.createElement('button'); x.type = 'button'; x.style.background = `linear-gradient(160deg, ${a}, ${b})`; x.onclick = () => { bgDraft = { type: 'color', c1: a, c2: b, ang: d.ang ?? 160 }; renderPanel(); applyWardBg(); }; pr.appendChild(x); }
    P.appendChild(pr);
    const act = document.createElement('div'); act.className = 'bg-act';
    const prev = document.createElement('i'); prev.className = 'bg-prev'; prev.style.background = bgCss(username, d);
    const ok = document.createElement('button'); ok.type = 'button'; ok.className = 'primary'; ok.textContent = 'Lưu nền màu'; ok.onclick = () => saveBg({ color: [d.c1, d.c2], angle: d.ang ?? 160 }, 'Đã lưu nền màu');
    act.append(prev, ok); P.appendChild(act);
  } else {
    const box = document.createElement('div'); box.className = 'bg-act';
    const prev = document.createElement('i'); prev.className = 'bg-prev'; if (cur && cur.type === 'image') prev.style.background = bgCss(username, cur);
    const pick = document.createElement('button'); pick.type = 'button'; pick.className = 'primary'; pick.textContent = cur && cur.type === 'image' ? 'Đổi ảnh nền…' : 'Chọn ảnh nền…';
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.hidden = true;
    pick.onclick = () => inp.click();
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      try {
        const img = await createImageBitmap(f), k = Math.min(1, 900 / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        let data = c.toDataURL('image/jpeg', 0.86); if (data.length > 1_100_000) data = c.toDataURL('image/jpeg', 0.7);
        toast('Đang tải ảnh nền…'); await saveBg({ data }, 'Đã đặt ảnh làm nền');
      } catch { toast('Không đọc được ảnh'); }
    };
    box.append(prev, pick, inp); P.appendChild(box);
    if (cur && cur.type === 'image') {                           // thanh chỉnh độ sáng ảnh nền: xem ngay khi kéo, lưu khi thả
      const row = document.createElement('div'); row.className = 'bg-bright';
      const b0 = Math.round((cur.bright ?? 1) * 100);
      row.innerHTML = `<span>Độ sáng</span><input type="range" min="30" max="160" step="5" value="${b0}"><b>${b0}%</b><button type="button">Mặc định</button>`;
      const [rg, lb, df] = [row.querySelector('input'), row.querySelector('b'), row.querySelector('button')];
      const live = (v) => { lb.textContent = v + '%'; bgDraft = { ...cur, bright: v / 100 }; applyWardBg(); prev.style.background = bgCss(username, bgDraft); };
      rg.oninput = () => live(+rg.value);
      rg.onchange = () => saveBg({ brightness: +rg.value / 100 }, 'Đã chỉnh độ sáng ảnh nền');
      df.onclick = () => { rg.value = 100; live(100); saveBg({ brightness: 1 }, 'Độ sáng về mặc định'); };
      P.appendChild(row);
    }
    const tip = document.createElement('p'); tip.className = 'hint'; tip.style.margin = '0'; tip.textContent = 'Ảnh tự thu nhỏ còn tối đa 900px và phủ kín khung (căn giữa).'; P.appendChild(tip);
  }
}
document.fonts.addEventListener('loadingdone', () => { if (!$('shopOv').classList.contains('hidden')) renderWardrobe(true); });   // phông tải xong → vẽ lại ảnh mẫu
// ---- Hiển thị trên hồ sơ: Tĩnh (đứng yên) / Động (nhảy combo điệu nhảy) — lưu ngay, người khác bấm vào bạn sẽ thấy đúng kiểu này
function renderPoseToggle() {
  document.querySelectorAll('#poseTg button').forEach((b) => b.classList.toggle('on', b.dataset.pose === myFashion.pose));
}
document.querySelectorAll('#poseTg button').forEach((b) => (b.onclick = async () => {
  const pose = b.dataset.pose;
  if (pose === myFashion.pose && !(pose === 'dance' && pvMode !== 'dance')) return;
  try {
    if (pose !== myFashion.pose) { setFashion(await api('/api/profile', { pose })); socket && socket.emit('profile:changed'); toast(pose === 'dance' ? 'Hồ sơ: hiển thị nhân vật đang nhảy' : 'Hồ sơ: hiển thị nhân vật đứng yên'); }
    renderPoseToggle();
    if (!['seat'].includes(wardFocus) && !PROFILE_SLOTS.includes(wardFocus)) { setPvMode(pose === 'dance' ? 'dance' : 'stand'); if (pose === 'static') refreshPreview(); }
  } catch (e) { toast(e.message); }
}));
function openWardrobe() {
  wd = { equip: normEquip(myFashion.equip), paint: JSON.parse(JSON.stringify(myFashion.paint || {})) };
  wardPage = 0; wardSel = null; wardFocus = 'top'; paintTarget = 0; pvMode = 'stand'; pvDances = null; pvYaw = 0; bgDraft = null; bgMode = null;
  if (myFashion.pose === 'dance') pvMode = 'dance';
  $('shopOv').classList.remove('hidden'); ensurePreview($('wardPreview')); renderWardrobe(); renderPoseToggle(); refreshPreview();
}
// thả lên nhân vật = mặc vào đúng ô của món đó
$('wardPreview').ondragover = (e) => { if (dragSlot) e.preventDefault(); };
$('wardPreview').ondrop = (e) => { e.preventDefault(); const d = e.dataTransfer.getData('text/plain'); if (d && !d.startsWith('slot:')) equipDraft(d); };
// kéo đồ đang mặc thả về kho = tháo ra
$('wardGridWrap').ondragover = (e) => { if (!dragSlot) e.preventDefault(); };
$('wardGridWrap').ondrop = (e) => { e.preventDefault(); const d = e.dataTransfer.getData('text/plain'); if (d && d.startsWith('slot:')) unequipDraft(d.slice(5)); };
$('wardFilter').onchange = (e) => { wardFilter = e.target.value; wardPage = 0; if (wardFilter !== 'all') setFocus(wardFilter); renderWardrobe(); };
$('wardSearch').oninput = (e) => { wardSearch = e.target.value; wardPage = 0; renderWardrobe(); };
$('wardSort').onclick = () => { wardSorted = !wardSorted; renderWardrobe(); };
$('wardPrev').onclick = () => { wardPage = Math.max(0, wardPage - 1); renderWardrobe(); };
$('wardNext').onclick = () => { wardPage++; renderWardrobe(); };
$('btnWardReset').onclick = () => { wd = { equip: normEquip(myFashion.equip), paint: JSON.parse(JSON.stringify(myFashion.paint || {})) }; pvDances = null; refreshPreview(); renderWardrobe(); };
$('shopClose').onclick = () => { $('shopOv').classList.add('hidden'); previewLook = null; pvMode = 'stand'; bgDraft = null; };
$('btnWardSave').onclick = async () => {
  const eq = { ...wd.equip }; for (const sl of OPTIONAL_SLOTS) if (!eq[sl]) eq[sl] = null;
  const paint = {}; for (const [id, pc] of Object.entries(wd.paint)) paint[id] = [(pc && pc[0]) || null, (pc && pc[1]) || null];
  try {
    setFashion(await api('/api/wardrobe', { equip: eq, paint }));
    wd = { equip: normEquip(myFashion.equip), paint: JSON.parse(JSON.stringify(myFashion.paint || {})) };
    socket && socket.emit('profile:changed'); toast('Đã lưu trang phục — mọi người trong phòng sẽ thấy ngay'); renderWardrobe(); renderAvatarBtn();
  } catch (e) { toast(e.message); }
};
$('dWardrobe').onclick = () => openWardrobe();

// ảnh đại diện: cắt vuông giữa, thu về 160px, nén JPG rồi gửi
// ảnh đại diện: mở khung cắt (kéo để chọn vùng, lăn / thanh trượt để phóng) → xuất 256px JPG rồi gửi
const crop = { img: null, scale: 1, base: 1, ox: 0, oy: 0 }, CROP_V = 560;     // CROP_V = cỡ canvas (hiển thị 280px, nét gấp đôi)
function cropClamp() {
  const w = crop.img.width * crop.scale, h = crop.img.height * crop.scale;
  crop.ox = Math.min(0, Math.max(CROP_V - w, crop.ox)); crop.oy = Math.min(0, Math.max(CROP_V - h, crop.oy));
}
function cropDraw() { const x = $('cropCv').getContext('2d'); x.fillStyle = '#111'; x.fillRect(0, 0, CROP_V, CROP_V); x.drawImage(crop.img, crop.ox, crop.oy, crop.img.width * crop.scale, crop.img.height * crop.scale); }
function cropZoomTo(z, cx = CROP_V / 2, cy = CROP_V / 2) {             // phóng quanh điểm (cx, cy) của khung
  const ns = crop.base * Math.min(4, Math.max(1, z)), k = ns / crop.scale;
  crop.ox = cx - (cx - crop.ox) * k; crop.oy = cy - (cy - crop.oy) * k; crop.scale = ns;
  $('cropZoom').value = ns / crop.base; cropClamp(); cropDraw();
}
$('avFile').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  if (!/^image\//.test(f.type)) return ($('avErr').textContent = 'Hãy chọn file ảnh');
  try { crop.img = await createImageBitmap(f); } catch { return ($('avErr').textContent = 'Không đọc được ảnh'); }
  crop.base = crop.scale = Math.max(CROP_V / crop.img.width, CROP_V / crop.img.height);
  crop.ox = (CROP_V - crop.img.width * crop.scale) / 2; crop.oy = (CROP_V - crop.img.height * crop.scale) / 2;
  $('cropZoom').value = 1; $('avErr').textContent = ''; $('cropOv').classList.remove('hidden'); cropDraw();
};
{
  const box = $('cropBox'); let drag = null;
  const k = () => CROP_V / box.clientWidth;
  box.onpointerdown = (e) => { if (!crop.img) return; box.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, ox: crop.ox, oy: crop.oy }; };
  box.onpointermove = (e) => { if (!drag) return; crop.ox = drag.ox + (e.clientX - drag.x) * k(); crop.oy = drag.oy + (e.clientY - drag.y) * k(); cropClamp(); cropDraw(); };
  box.onpointerup = box.onpointercancel = () => (drag = null);
  box.onwheel = (e) => { e.preventDefault(); if (!crop.img) return; const r = box.getBoundingClientRect(); cropZoomTo(crop.scale / crop.base * (e.deltaY < 0 ? 1.1 : 1 / 1.1), (e.clientX - r.left) * k(), (e.clientY - r.top) * k()); };
  $('cropZoom').oninput = (e) => crop.img && cropZoomTo(+e.target.value);
  const close = () => { $('cropOv').classList.add('hidden'); crop.img = null; };
  $('cropClose').onclick = $('cropCancel').onclick = close;
  $('cropOk').onclick = async () => {
    if (!crop.img) return;
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'), f2 = S / CROP_V;
    x.fillStyle = '#fff'; x.fillRect(0, 0, S, S);
    x.drawImage(crop.img, crop.ox * f2, crop.oy * f2, crop.img.width * crop.scale * f2, crop.img.height * crop.scale * f2);
    try {
      const r = await api('/api/avatar', { data: c.toDataURL('image/jpeg', 0.88) });
      myAvatarVer = r.avatarVer; renderAvatarBtn(); socket && socket.emit('profile:changed'); toast('Đã cập nhật ảnh đại diện'); close();
    } catch (err) { toast(err.message || 'Không tải được ảnh'); }
  };
}

// ---- Danh sách người trong phòng (bấm vào ô "đang online") → xem ảnh đại diện + nhân vật của từng người
let peopleSel = null;
// ký hiệu giới tính cạnh tên: ♂ xanh / ♀ hồng — vẽ bằng SVG để luôn nằm chính giữa vòng tròn (ký tự font bị lệch)
const G_ICON = { m: '<svg viewBox="0 0 24 24"><circle cx="10" cy="14" r="5.2"/><path d="M14 10 20 4M14.5 4H20v5.5"/></svg>', f: '<svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="5.2"/><path d="M12 14.2V22M8.5 18.5h7"/></svg>' };
function genderTag(lookOrG) {
  const f = lookOrG === 'f' || (lookOrG && lookOrG.gender === 'f'), t = document.createElement('span');
  t.className = 'gtag ' + (f ? 'f' : 'm'); t.innerHTML = G_ICON[f ? 'f' : 'm']; t.title = f ? 'Nữ' : 'Nam'; return t;
}
// ảnh + giới tính người gửi: lấy từ tin (server mới gửi kèm), tin cũ thì tra theo người đang trong phòng
function chatWho(m) { const u = lastState && lastState.users.find((x) => x.name === m.name); return { av: m.av ?? (u ? u.av : 0), g: m.g || (u && u.look && u.look.gender) || 'm', look: m.ns ? chatLook(m) : u && u.look }; }
function personSeatText(u) { return u.seat == null ? 'Đang đứng xem' : isDJ(u.seat) ? '🎧 Đang chơi DJ' : isDance(u.seat) ? 'Trên sàn nhảy' : 'Ghế ' + seatName(u.seat); }
function setAvatarEl(el, name, ver) { const url = avatarUrl(name, ver); el.style.backgroundImage = url ? `url("${url}")` : ''; el.textContent = url ? '' : (name || '?')[0].toUpperCase(); }
function renderPeople() {
  const users = (lastState && lastState.users) || [], box = $('peopleList'); box.textContent = '';
  $('peopleCount').textContent = `(${lastState ? lastState.online : users.length})`;
  const list = [...users].sort((a2, b2) => (b2.id === myId) - (a2.id === myId) || (a2.seat == null) - (b2.seat == null) || a2.name.localeCompare(b2.name, 'vi'));   // mình → người ngồi → người đứng xem
  if (!list.some((u) => u.id === peopleSel)) peopleSel = list.length ? list[0].id : null;
  for (const u of list) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'prow' + (u.id === peopleSel ? ' on' : '');
    const av = document.createElement('span'); av.className = 'pa'; setAvatarEl(av, u.name, u.av); applyAvFrame(av, lookItem(u.look, 'avframe'));
    const tx = document.createElement('span'); const nm = document.createElement('b'); nm.append(nameEl(u.name, u.look), genderTag(u.look)); const st = document.createElement('small'); st.textContent = personSeatText(u); tx.append(nm, st);
    b.append(av, tx);
    if (u.id === myId) { const t = document.createElement('span'); t.className = 'me-tag'; t.textContent = 'Bạn'; b.appendChild(t); }
    applyNameplate(b, lookItem(u.look, 'nameplate'));
    b.onclick = () => { peopleSel = u.id; pvYaw = 0; renderPeople(); };
    box.appendChild(b);
  }
  if (lastState && lastState.online > list.length) {
    const n = document.createElement('p'); n.className = 'hint'; n.textContent = `Còn ${lastState.online - list.length} người đứng xem nữa (rạp quá đông nên chỉ hiện 150 người đứng).`; box.appendChild(n);
  }
  const u = list.find((x2) => x2.id === peopleSel);
  $('personView').classList.toggle('hidden', !u);
  if (!u) return;
  setAvatarEl($('pvAvatar'), u.name, u.av); applyAvFrame($('pvAvatar'), lookItem(u.look, 'avframe')); $('pvName').textContent = ''; $('pvName').append(nameEl(u.name, u.look), genderTag(u.look)); $('pvSeat').textContent = personSeatText(u);
  const cf = lookItem(u.look, 'cardframe'), fx = lookItem(u.look, 'pfx'), dk = u.id + JSON.stringify([cf, fx]);
  if ($('personView').dataset.deco !== dk) { $('personView').dataset.deco = dk; applyCard($('personView'), cf, fx); }
  applyBg($('personView'), u.name, u.bg);
  const key = u.id + JSON.stringify(u.look || null);
  if ($('personPreview').dataset.key !== key) {
    $('personPreview').dataset.key = key;
    pvMode = u.look && u.look.pose === 'dance' ? 'dance' : 'stand'; pvDances = null; pvYaw = 0; previewLook = u.look || { gender: 'm', equip: {} }; rebuildPreview($('personPreview'));
  }
}
function openPeople() { $('peopleOv').classList.remove('hidden'); $('personPreview').dataset.key = ''; $('personView').dataset.deco = ''; renderPeople(); }
$('pill').onclick = openPeople;
$('pill').onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPeople(); } };
$('peopleClose').onclick = () => { $('peopleOv').classList.add('hidden'); previewLook = null; };
$('btnRmAv').onclick = async () => { try { await api('/api/avatar', { data: null }); myAvatarVer = 0; renderAvatarBtn(); socket && socket.emit('profile:changed'); } catch (e) { $('avErr').textContent = e.message; } };
$('btnChangePw').onclick = async () => {
  const o = $('pwOld').value, n = $('pwNew').value, n2 = $('pwNew2').value;
  if (n !== n2) return ($('pwErr').textContent = 'Mật khẩu nhập lại không khớp');
  try { const r = await api('/api/password', { oldPassword: o, newPassword: n }); token = r.token; localStorage.setItem('rc_token', token); $('pwErr').textContent = ''; $('pwOld').value = $('pwNew').value = $('pwNew2').value = ''; toast('Đã đổi mật khẩu. Các thiết bị khác sẽ phải đăng nhập lại.'); }
  catch (e) { $('pwErr').textContent = e.message; }
};
$('btnLogout2').onclick = () => logout();
$('btnCopy').onclick = () => navigator.clipboard.writeText(location.origin + location.pathname + '?room=' + roomId).then(() => toast('Đã copy link phòng'));

// =====================================================================
//  Voice (WebRTC mesh, chỉ phòng riêng)
// =====================================================================
let ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
fetch('/api/ice').then((r) => r.json()).then((j) => { if (j && Array.isArray(j.iceServers)) ICE = j; }).catch(() => {});   // thêm TURN nếu máy chủ có cấu hình
let localStream = null, muted = false;
const peers = {};
function makePeer(id) {
  const pc = new RTCPeerConnection(ICE);
  localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
  const audio = document.createElement('audio'); audio.autoplay = true; audio.playsInline = true; $('audios').appendChild(audio);
  pc.ontrack = (e) => { audio.srcObject = e.streams[0]; audio.play().catch(() => {}); };
  pc.onicecandidate = (e) => e.candidate && socket.emit('voice:signal', { to: id, data: { candidate: e.candidate } });
  pc.onconnectionstatechange = () => { if (['failed', 'closed'].includes(pc.connectionState)) dropPeer(id); };
  peers[id] = { pc, audio }; return pc;
}
function dropPeer(id) { const p = peers[id]; if (!p) return; try { p.pc.close(); } catch {} p.audio.remove(); delete peers[id]; }
async function startVoice() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)                 // trình duyệt trong app (Zalo, Facebook, Messenger…) hoặc trang không HTTPS
    return toast(isSecureContext ? 'Trình duyệt này không hỗ trợ mic — hãy mở link bằng Chrome / Safari / Cốc Cốc (không mở trong Zalo, Facebook)' : 'Voice cần trang chạy HTTPS');
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      .catch((e) => (e && e.name === 'OverconstrainedError' ? navigator.mediaDevices.getUserMedia({ audio: true }) : Promise.reject(e)));
  } catch (e) {
    const n = e && e.name;
    return toast(n === 'NotAllowedError' || n === 'SecurityError' ? 'Mic đang bị chặn — bấm biểu tượng bên trái thanh địa chỉ → Quyền → Micrô → Cho phép, rồi tải lại trang. Nếu vẫn bị: vào Cài đặt điện thoại → Ứng dụng → trình duyệt → Quyền → Micrô → Cho phép'
      : n === 'NotFoundError' ? 'Không tìm thấy micrô trên thiết bị này'
      : n === 'NotReadableError' || n === 'AbortError' ? 'Micrô đang bị ứng dụng khác dùng (cuộc gọi, ghi âm…) — tắt ứng dụng đó rồi thử lại'
      : 'Không mở được mic (' + (n || 'lỗi không rõ') + ')');
  }
  muted = false;
  socket.emit('voice:join', async (ids) => {
    for (const id of ids) {
      const pc = makePeer(id), offer = await pc.createOffer(); await pc.setLocalDescription(offer);
      socket.emit('voice:signal', { to: id, data: { sdp: pc.localDescription } });
    }
  });
  $('btnVoice').textContent = 'Rời voice'; $('btnVoice').classList.add('danger');
  $('btnMute').classList.remove('hidden'); $('btnMute').textContent = 'Tắt mic'; $('btnMute').classList.remove('on');
}
function teardownVoice() {
  Object.keys(peers).forEach(dropPeer);
  if (localStream) localStream.getTracks().forEach((t) => t.stop()); localStream = null;
  $('btnVoice').textContent = 'Bật voice'; $('btnVoice').classList.remove('danger'); $('btnMute').classList.add('hidden');
}
function stopVoice() { socket.emit('voice:leave'); teardownVoice(); }
$('btnVoice').onclick = () => (localStream ? stopVoice() : startVoice());
$('btnMute').onclick = () => {
  if (!localStream) return; muted = !muted; localStream.getAudioTracks().forEach((t) => (t.enabled = !muted));
  $('btnMute').textContent = muted ? 'Bật mic' : 'Tắt mic'; $('btnMute').classList.toggle('on', muted);
};
async function onVoiceSignal({ from, data }) {
  if (!localStream) return;
  let p = peers[from];
  if (data.sdp) {
    if (!p) makePeer(from); p = peers[from];
    await p.pc.setRemoteDescription(data.sdp);
    if (data.sdp.type === 'offer') {
      const ans = await p.pc.createAnswer(); await p.pc.setLocalDescription(ans);
      socket.emit('voice:signal', { to: from, data: { sdp: p.pc.localDescription } });
    }
  } else if (data.candidate && p) { try { await p.pc.addIceCandidate(data.candidate); } catch {} }
}

// =====================================================================
//  Chia sẻ màn hình (phòng riêng): 1 người phát màn hình / tab (kèm âm thanh) → hiện lên màn chiếu của cả phòng
// =====================================================================
let shareStream = null, shareInfo = null;                          // shareStream: luồng mình đang phát; shareInfo: { id, name } từ máy chủ
const sharePeers = {};                                             // người chia sẻ: kết nối tới từng người xem
let viewPeer = null, viewFrom = null;                              // người xem: kết nối tới người chia sẻ
const shareVid = $('shareVideo');
function showShare(stream, label, mutedSelf) {
  $('shareLayer').classList.toggle('show', !!stream);
  if (shareVid.srcObject !== stream) shareVid.srcObject = stream || null;
  shareVid.muted = !!mutedSelf || vol === 0; shareVid.volume = vol / 100;
  $('shareLbl').textContent = label || '';
  if (stream) shareVid.play().catch(() => $('tapPlay').classList.add('show'));
  // đang chia sẻ: tạm dừng video hàng chờ ở máy mình (khỏi lẫn tiếng); hết chia sẻ thì đồng bộ lại
  if (stream && media) { try { media.pause(); } catch {} }
  else if (!stream && cur) applyState(cur, true);
}
function closeView() { if (viewPeer) { try { viewPeer.close(); } catch {} } viewPeer = null; viewFrom = null; }
function dropSharePeer(id) { const pc = sharePeers[id]; if (pc) { try { pc.close(); } catch {} delete sharePeers[id]; } }
async function startShare() {
  if (!isPrivate()) return toast('Chỉ phòng riêng mới chia sẻ màn hình được');
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) return toast('Thiết bị / trình duyệt này không hỗ trợ chia sẻ màn hình (điện thoại vẫn xem được người khác chia sẻ)');
  let st;
  try { st = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30, max: 30 }, width: { max: 1920 }, height: { max: 1080 } }, audio: true }); }
  catch { return toast('Đã huỷ chia sẻ màn hình'); }
  socket.emit('share:start', (r) => {
    if (!r || r.error) { st.getTracks().forEach((t) => t.stop()); return toast((r && r.error) || 'Không chia sẻ được'); }
    shareStream = st;
    const v = st.getVideoTracks()[0]; if (v) { v.contentHint = 'motion'; v.onended = () => stopShare(); }
    if (!st.getAudioTracks().length) toast('Đang chia sẻ (không có tiếng — muốn có tiếng hãy chọn "Tab" và bật "Chia sẻ âm thanh")');
    showShare(st, 'Bạn đang chia sẻ màn hình', true); renderShareBtn();
  });
}
function stopShare(silent) {
  Object.keys(sharePeers).forEach(dropSharePeer);
  if (shareStream) { shareStream.getTracks().forEach((t) => t.stop()); shareStream = null; if (!silent) socket.emit('share:stop'); }
  showShare(null); renderShareBtn();
}
async function onShareWant({ from }) {                             // người chia sẻ: có người xin xem → gửi luồng hình
  if (!shareStream) return;
  dropSharePeer(from);
  const pc = sharePeers[from] = new RTCPeerConnection(ICE);
  shareStream.getTracks().forEach((t) => pc.addTrack(t, shareStream));
  for (const sd of pc.getSenders()) if (sd.track && sd.track.kind === 'video') { const p = sd.getParameters(); p.encodings = [{ ...(p.encodings && p.encodings[0]), maxBitrate: 2_500_000 }]; sd.setParameters(p).catch(() => {}); }
  pc.onicecandidate = (e) => e.candidate && socket.emit('share:signal', { to: from, data: { candidate: e.candidate } });
  pc.onconnectionstatechange = () => { if (['failed', 'closed'].includes(pc.connectionState)) dropSharePeer(from); };
  const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
  socket.emit('share:signal', { to: from, data: { sdp: pc.localDescription } });
}
async function onShareSignal({ from, data }) {
  if (shareStream && sharePeers[from]) {                           // người chia sẻ nhận trả lời / ICE từ người xem
    const pc = sharePeers[from];
    if (data.sdp) await pc.setRemoteDescription(data.sdp).catch(() => {});
    else if (data.candidate) await pc.addIceCandidate(data.candidate).catch(() => {});
    return;
  }
  if (!shareInfo || from !== shareInfo.id) return;                 // người xem nhận lời mời từ người chia sẻ
  if (data.sdp && data.sdp.type === 'offer') {
    closeView(); viewFrom = from;
    const pc = viewPeer = new RTCPeerConnection(ICE);
    pc.ontrack = (e) => { if (pc === viewPeer) showShare(e.streams[0], '🖥 ' + shareInfo.name + ' đang chia sẻ màn hình'); };
    pc.onicecandidate = (e) => e.candidate && socket.emit('share:signal', { to: from, data: { candidate: e.candidate } });
    pc.onconnectionstatechange = () => { if (pc === viewPeer && pc.connectionState === 'failed') { closeView(); socket.emit('share:want'); } };
    await pc.setRemoteDescription(data.sdp);
    const ans = await pc.createAnswer(); await pc.setLocalDescription(ans);
    socket.emit('share:signal', { to: from, data: { sdp: pc.localDescription } });
  } else if (data.candidate && viewPeer) await viewPeer.addIceCandidate(data.candidate).catch(() => {});
}
// trạng thái phòng thay đổi: bắt đầu xem / ngừng xem
function applyShare(s) {
  const prev = shareInfo; shareInfo = s && s.share;
  if (shareInfo && shareInfo.id === myId) return renderShareBtn();
  if (!shareInfo) { if (prev) { closeView(); if (!shareStream) showShare(null); } return renderShareBtn(); }
  if (!prev || prev.id !== shareInfo.id || !viewPeer) { closeView(); socket.emit('share:want'); $('shareLbl').textContent = 'Đang kết nối tới màn hình của ' + shareInfo.name + '…'; $('shareLayer').classList.add('show'); }
  renderShareBtn();
}
function renderShareBtn() {
  const b = $('dShare'); if (!b) return;
  b.classList.toggle('hidden', !isPrivate());
  b.classList.toggle('active', !!shareStream);
  $('shareBtnLbl').textContent = shareStream ? 'Dừng chia sẻ' : 'Chia sẻ MH';
  b.title = shareStream ? 'Dừng chia sẻ màn hình' : shareInfo ? shareInfo.name + ' đang chia sẻ màn hình' : 'Chia sẻ màn hình / tab cho cả phòng xem';
}
$('dShare').onclick = () => (shareStream ? stopShare() : startShare());

// =====================================================================
//  Phòng + Chọn ghế + Tài khoản + Socket
// =====================================================================
let token = localStorage.getItem('rc_token'), username = null, socket = null, authMode = 'login', isAdmin = false;
let roomName = 'Rạp công cộng', roomPass = '', needFirst = false;
const q = new URLSearchParams(location.search);

async function api(url, body) {
  const r = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Có lỗi xảy ra');
  return j;
}
function showOnly(which) {
  $('authOv').classList.toggle('hidden', which !== 'auth');
  document.body.classList.toggle('in-room', which === 'room');
}
function logout() { localStorage.removeItem('rc_token'); token = null; location.href = location.pathname; }
// bị khoá: đăng xuất, hiện lý do ở màn đăng nhập
function bannedOut(msg) {
  inRoom = false; if (socket) socket.disconnect();
  localStorage.removeItem('rc_token'); token = null; sessionStorage.setItem('rc_ban', msg);
  location.href = location.pathname;
}
{ const b = sessionStorage.getItem('rc_ban'); if (b) { sessionStorage.removeItem('rc_ban'); $('auErr').textContent = b; } }
$('btnLogout').onclick = logout;

// ---- Đăng nhập / đăng ký
document.querySelectorAll('#authForm .tabs button').forEach((b) => {
  b.onclick = () => {
    authMode = b.dataset.mode;
    document.querySelectorAll('#authForm .tabs button').forEach((x) => x.classList.toggle('active', x === b));
    $('auPass2').classList.toggle('hidden', authMode !== 'register'); $('auPass2').required = authMode === 'register';
    $('auPass').autocomplete = authMode === 'register' ? 'new-password' : 'current-password';
    $('auSubmit').textContent = authMode === 'register' ? 'Tạo tài khoản' : 'Đăng nhập'; $('auErr').textContent = '';
  };
});
$('authForm').addEventListener('submit', async (e) => {
  e.preventDefault(); $('auErr').textContent = '';
  const u = $('auUser').value.trim(), p = $('auPass').value;
  if (authMode === 'register' && p !== $('auPass2').value) return ($('auErr').textContent = 'Hai mật khẩu không khớp');
  $('auSubmit').disabled = true;
  try {
    const r = await api('/api/' + authMode, { username: u, password: p });
    token = r.token; username = r.username; localStorage.setItem('rc_token', token); $('auPass').value = $('auPass2').value = '';
    api('/api/me').then((m) => { isAdmin = !!m.admin; myRoles = m.roles || []; $('btnAdmin').classList.toggle('hidden', !isAdmin); updateDJBtn(); }).catch(() => {});
    afterAuth();
  } catch (err) { $('auErr').textContent = err.message; }
  $('auSubmit').disabled = false;
});

// ---- Chọn ghế (bảng sơ đồ)
function openSeat() { $('seatOv').classList.remove('hidden'); renderSeatModal(); }
function closeSeat() { $('seatOv').classList.add('hidden'); }
function renderSeatModal() {
  if ($('seatOv').classList.contains('hidden')) return;
  $('seatInfo').textContent = mySeat != null
    ? `Ghế của bạn: ${seatName(mySeat)}. Bấm một ghế trống, nhân vật sẽ đứng dậy và đi bộ tới đó.`
    : 'Rạp đang đầy, bạn đứng xem. Khi có ghế trống, bấm vào ghế đó để ngồi.';
  const grid = $('seatGrid'); grid.textContent = '';
  const mk = (i) => {
    const b = document.createElement('button'); b.type = 'button';
    const mine = i === mySeat, tk = taken.has(i) && !mine;
    b.className = 'seat' + (mine ? ' mine' : tk ? ' taken' : '');
    b.textContent = mine ? '✓' : isDance(i) ? 'N' + (i - SEATS + 1) : seatName(i).slice(1);
    b.title = tk ? `${seatName(i)} · ${seatOwner.get(i) || 'đã có người'}` : `Ghế ${seatName(i)}`;
    b.onclick = () => {
      if (mine) return closeSeat();
      if (tk) return toast(`Ghế ${seatName(i)} có ${seatOwner.get(i)} ngồi rồi`);
      socket.emit('seat:take', i); closeSeat(); toast(`Đang đi tới ghế ${seatName(i)}...`);
    };
    return b;
  };
  if (DANCE_N) {                                               // sàn nhảy trên bục
    const h = document.createElement('div'); h.className = 'zone-h z-dance'; h.textContent = 'Sàn nhảy (trên bục)'; grid.appendChild(h);
    const row = document.createElement('div'); row.className = 'srow z-dance';
    const d = document.createElement('div'); d.className = 'sblock';
    for (let k = 0; k < DANCE_N; k++) d.appendChild(mk(SEATS + k));
    row.appendChild(d); grid.appendChild(row);
  }
  let lastType = '';
  for (let r = 0; r < ROWS; r++) {
    const R = ROW_INFO[r];
    if (R.type !== lastType) {                                  // tiêu đề khu
      lastType = R.type;
      const h = document.createElement('div'); h.className = 'zone-h z-' + R.type; h.textContent = SEAT_TYPES[R.type].name; grid.appendChild(h);
    }
    const row = document.createElement('div'); row.className = 'srow z-' + R.type;
    const lab = () => { const l = document.createElement('span'); l.className = 'lab'; l.textContent = R.letter; return l; };
    const block = (b) => {
      const d = document.createElement('div'); d.className = 'sblock';
      const ids = SEAT_INFO.map((s, i) => (s.row === r && s.block === b ? i : -1)).filter((i) => i >= 0);
      if (!ids.length) d.classList.add('empty-b');
      for (let k = 0; k < ids.length; k++) {
        const s = SEAT_INFO[ids[k]];
        if (s.half) {                                           // ghế đôi / giường đôi: 2 chỗ dính nhau
          const p = document.createElement('div'); p.className = 'pair'; p.append(mk(ids[k]), mk(ids[k + 1])); d.appendChild(p); k++;
        } else d.appendChild(mk(ids[k]));
      }
      return d;
    };
    const gap = () => { const g = document.createElement('div'); g.className = 'sgap'; return g; };
    row.append(lab(), block(0), gap(), block(1), gap(), block(2), lab()); grid.appendChild(row);
  }
}
onSeatsChanged = renderSeatModal;
$('dSeat').onclick = openSeat;
$('seatClose').onclick = closeSeat;

// ---- Danh sách phòng + tạo phòng
let roomsTimer = 0;
function openRooms() {
  $('roomsOv').classList.remove('hidden'); $('createBox').classList.add('hidden'); $('rmErr').textContent = '';
  refreshRooms(); clearInterval(roomsTimer); roomsTimer = setInterval(refreshRooms, 4000);
}
function closeRooms() { $('roomsOv').classList.add('hidden'); clearInterval(roomsTimer); }
function refreshRooms() {
  if (!socket) return;
  socket.emit('rooms:list', (list) => {
    const box = $('roomList'); box.textContent = '';
    list.forEach((r) => {
      const row = document.createElement('div'); row.className = 'rrow' + (r.id === roomId ? ' here' : '');
      const grow = document.createElement('div'); grow.className = 'grow';
      const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = r.name; if (r.locked) nm.prepend(icon('lock'), ' ');
      const sub = document.createElement('div'); sub.className = 'sub';
      const tn = ROOM_TEMPLATES[r.tpl] ? ROOM_TEMPLATES[r.tpl].name : 'Rạp lớn';
      sub.textContent = (r.type === 'public' ? 'Rạp lớn · chỉ chat · mọi người cùng xem' : tn + ' · Mã ' + r.id) + (r.title ? ' · ▶ ' + r.title : '');
      grow.append(nm, sub);
      const cnt = document.createElement('div'); cnt.className = 'cnt'; cnt.append(icon('users'), ' ' + r.online + (r.cap ? '/' + r.cap : ''));
      const btn = document.createElement('button');
      if (r.id === roomId) { btn.textContent = 'Đang ở đây'; btn.disabled = true; }
      else { btn.textContent = 'Vào'; btn.className = 'primary'; btn.onclick = () => { closeRooms(); doJoin(r.id); }; }
      row.append(grow, cnt, btn); box.appendChild(row);
    });
  });
}
$('dRooms').onclick = openRooms;
$('roomsClose').onclick = closeRooms;
// Chọn loại phòng khi tạo
let pickedTpl = 'couple2';
document.querySelectorAll('#tplPick [data-tpl]').forEach((b) => (b.onclick = () => {
  pickedTpl = b.dataset.tpl;
  document.querySelectorAll('#tplPick [data-tpl]').forEach((x) => x.classList.toggle('on', x === b));
}));
$('btnShowCreate').onclick = () => { $('createBox').classList.toggle('hidden'); $('rmErr').textContent = ''; if (!$('createBox').classList.contains('hidden')) $('rmName').focus(); };
$('btnMakeRoom').onclick = () => {
  const name = $('rmName').value.trim(), password = $('rmPass').value;
  socket.emit('room:create', { name, password, tpl: pickedTpl }, (r) => {
    if (r.error) return ($('rmErr').textContent = r.error);
    $('rmName').value = ''; $('rmPass').value = ''; closeRooms();
    doJoin(r.code, password);
    toast('Đã tạo phòng ' + r.code + (password ? ' (có mật khẩu)' : '') + '. Bấm "Link phòng" để mời bạn bè.');
  });
};
$('rmPass').addEventListener('keydown', (e) => e.key === 'Enter' && $('btnMakeRoom').click());
$('btnLeaveRoom').onclick = () => { if (TPL_ID !== 'cinema') { location.href = location.pathname; return; } doJoin('main'); toast('Đã thoát phòng, quay về rạp công cộng'); };

// Đóng modal: bấm nền tối hoặc phím Esc
for (const [id, close] of [['roomsOv', closeRooms], ['seatOv', closeSeat]]) $(id).addEventListener('mousedown', (e) => e.target === $(id) && close());
addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeRooms(); closeSeat(); } });

// ---- Hộp nhập mật khẩu phòng
function askPassword(name) {
  return new Promise((resolve) => {
    $('pwTitle').textContent = `Phòng “${name}” có mật khẩu`; $('pwIn').value = ''; $('pwOv').classList.remove('hidden'); $('pwIn').focus();
    const done = (v) => { $('pwOv').classList.add('hidden'); resolve(v); };
    $('pwOk').onclick = () => done($('pwIn').value);
    $('pwCancel').onclick = () => done(null);
    $('pwIn').onkeydown = (e) => { if (e.key === 'Enter') done($('pwIn').value); else if (e.key === 'Escape') done(null); };
  });
}

// ---- Vào phòng
function updateRoomUI() {
  const priv = roomType === 'private';
  $('roomLbl').textContent = priv ? roomId : 'Phòng';
  $('btnCopy').style.display = priv ? '' : 'none';
  $('btnLeaveRoom').classList.toggle('hidden', !priv);
  $('dVoice').classList.toggle('hidden', !priv); renderShareBtn(); $('pctl').classList.toggle('hidden', !priv); $('bar').classList.toggle('seekable', priv);
  if (!priv && panel === 'voice') openPanel('voice');
  history.replaceState(null, '', priv ? '?room=' + roomId + (TPL_ID !== 'cinema' ? '&tpl=' + TPL_ID : '') : location.pathname);
  if (mySeat == null) toast(`Rạp đã đủ ${SEATS} chỗ, bạn đang đứng xem (vẫn chat được).`);
}
let redirecting = false;
function doJoin(room, password, rejoin) {
  socket.emit('join', { room, password }, async (res) => {
    if (res && res.needPassword) {
      if (res.wrong) toast(res.error);
      const pw = await askPassword(res.name || room);
      if (pw == null) { if (!inRoom || rejoin) { inRoom = false; doJoin('main'); } return; }
      return doJoin(room, pw, rejoin);
    }
    if (!res || res.error) {
      toast((res && res.error) || 'Không vào được phòng');
      if ((!inRoom || rejoin) && room !== 'main') { inRoom = false; doJoin('main'); }
      return;
    }
    // phòng khác loại (cảnh khác) → nạp lại trang với ?tpl= để dựng đúng phòng (giữ mật khẩu để vào lại ngay)
    const tpl = res.tpl && ROOM_TEMPLATES[res.tpl] ? res.tpl : 'cinema';
    if (tpl !== TPL_ID) {
      redirecting = true;                                      // bỏ qua dữ liệu phòng mới cho tới khi trang nạp lại
      if (password) sessionStorage.setItem('rc_pw_' + res.id, password);
      const qs = new URLSearchParams();                        // rạp công cộng: bố cục mặc định đọc từ /api/config nên không cần ?tpl
      if (res.id !== 'main') qs.set('room', res.id);
      if (tpl !== (res.id === 'main' ? MAIN_TPL : 'cinema')) qs.set('tpl', tpl);
      location.href = location.pathname + (qs.toString() ? '?' + qs : '');
      return;
    }
    teardownVoice();
    myId = res.me; roomType = res.type; roomId = res.id; roomName = res.name || ''; roomPass = password || ''; inRoom = true;
    needFirst = true; loadedToken = -1; myVote = false; cur = null; mySeat = res.seat; unread = 0; $('cBadge').classList.remove('show');
    showOnly('room'); updateRoomUI();
  });
}

function afterAuth() {
  $('umName').textContent = 'Đăng nhập: ' + username;
  $('btnAdmin').classList.toggle('hidden', !isAdmin);
  updateDJBtn();
  renderAvatarBtn();
  if (myCreatedAt == null) api('/api/me').then((r) => { setFashion(r); myAvatarVer = r.avatarVer || 0; myCreatedAt = r.createdAt; myBg = r.bg || null; renderAvatarBtn(); }).catch(() => {});
  connectSocket();
  const rid = (q.get('room') || 'main').toUpperCase(), spw = sessionStorage.getItem('rc_pw_' + rid);
  if (spw != null) sessionStorage.removeItem('rc_pw_' + rid);
  doJoin(q.get('room') || 'main', spw || undefined);   // mới vào luôn ở rạp công cộng (hoặc phòng theo link mời)
}

function connectSocket() {
  if (socket) socket.disconnect();
  socket = io({ auth: { token } });
  socket.on('connect_error', (err) => { if (err.message === 'unauthorized') logout(); else if (err.message === 'banned') bannedOut('Tài khoản hoặc mạng của bạn đã bị khoá'); });
  // ---- lệnh từ trang quản trị
  socket.on('banned', (d) => bannedOut((d && d.message) || 'Tài khoản đã bị khoá'));
  socket.on('admin:kicked', (d) => { inRoom = false; toast((d && d.message) || 'Bạn đã bị mời ra khỏi rạp'); socket.disconnect(); setTimeout(() => (location.href = location.pathname), 2500); });
  socket.on('room:closed', (d) => { inRoom = false; toast((d && d.message) || 'Phòng đã đóng'); setTimeout(() => (location.href = location.pathname), 1800); });
  socket.on('announce', (d) => d && d.text && toast('📢 ' + d.text));
  socket.on('server:reload', (d) => {
    if (d && d.what === 'theme' && TPLC.decor !== 'cinema') return;      // đổi màu rạp lớn: phòng loại khác không cần tải lại
    redirecting = true; toast((d && d.message) || 'Đang tải lại…');
    if (roomPass && roomId) sessionStorage.setItem('rc_pw_' + roomId, roomPass);
    setTimeout(() => location.reload(), 1500);
  });
  socket.on('connect', () => { if (inRoom) { teardownVoice(); doJoin(roomId, roomPass, true); } });
  socket.on('disconnect', () => toast('Mất kết nối, đang thử kết nối lại...'));
  socket.on('kicked', () => { toast('Tài khoản này vừa vào phòng ở nơi khác'); inRoom = false; socket.disconnect(); setTimeout(() => (location.href = location.pathname), 1500); });
  socket.on('state', (s) => {
    if (redirecting) return;
    const first = needFirst; needFirst = false; syncAvatars(s.users, first); applyState(s, first); applyParty(s.party); applyShare(s); djOnState(s);
    if (first && myReclineLocal != null) socket.emit('seat:recline', myReclineLocal);
  });
  socket.on('sync', (d) => {                                     // máy chủ gửi mốc thời gian định kỳ → lệch quá 2.5s thì tua cho khớp
    if (!media || !cur || !cur.current || cur.current.live || d.token !== cur.token || cur.paused || Date.now() < ignoreUntil) return;
    if (!media.isPlaying()) return;
    if (Math.abs(media.time() - d.position) > 2.5) { quiet(); media.seek(d.position); }
  });
  socket.on('toast', toast);
  socket.on('dj:fx', onDJFx);
  socket.on('roles', (d) => { myRoles = (d && d.roles) || []; updateDJBtn(); if (myRoles.includes('dj')) toast('🎧 Bạn vừa được cấp vai trò DJ'); });
  socket.on('order', (o) => {                                  // ai đó gọi món → nhân viên bưng ra
    if (!o || !Array.isArray(o.items)) return;
    const items = o.items.filter((id) => MENU_BY_ID[id]);
    if (!items.length || o.seat == null || o.seat < 0 || o.seat >= SEATS) return;
    lastFood.set(o.uid, items);
    spawnDelivery(o.uid, o.seat, items);
    if (o.uid === myId) toast('Nhân viên đang mang tới: ' + describeItems(items));
  });
  socket.on('chat', (m) => { addMsg(m, true); if (!m.system) showBubble(m.id, m.text); feedPush(m); });   // khung nổi luôn hiện tin mới (kể cả khi đang mở bảng Trò chuyện)
  socket.on('chat:history', (list) => { $('msgs').textContent = ''; list.forEach((m) => addMsg(m, false)); });
  socket.on('voice:signal', onVoiceSignal);
  socket.on('share:want', (d) => onShareWant(d).catch(() => {}));
  socket.on('share:signal', (d) => onShareSignal(d).catch(() => {}));
  socket.on('share:ended', () => { closeView(); if (!shareStream) showShare(null); });
  socket.on('voice:left', dropPeer);
}

// ---- Khởi động: kiểm tra token cũ
(async () => {
  if (!token) return showOnly('auth');
  try { const r = await api('/api/me'); username = r.username; setFashion(r); myAvatarVer = r.avatarVer || 0; myCreatedAt = r.createdAt; myBg = r.bg || null; isAdmin = !!r.admin; myRoles = r.roles || []; afterAuth(); }
  catch (e) { localStorage.removeItem('rc_token'); token = null; if (/khoá|chặn/.test(e.message)) $('auErr').textContent = e.message; showOnly('auth'); }
})();
applyVolume();

// =====================================================================
//  BÀN DJ — người có vai trò DJ lên sân khấu, chà đĩa, đổi tốc độ / tua / phanh video chung, bắn hiệu ứng âm thanh + ánh sáng
// =====================================================================
var myRoles = [];                                               // vai trò của mình (vd 'dj'), lấy từ /api/me
var djFx = { laserUntil: 0, pumpUntil: 0, scratchUntil: 0, brakeUntil: 0, braking: false, cutOn: false, cutT: 0, duckT: 0, deckV: [0, 0] };
let djPanelOpen = false;
const canDJme = () => DJ_IDX >= 0 && (myRoles.includes('dj') || isAdmin);
const amDJ = () => !!(cur && cur.dj && cur.dj.id === myId);
function updateDJBtn() { $('dDJ').classList.toggle('hidden', !canDJme()); }

// tốc độ phát của trình phát (YouTube / file video); nền tảng khác giữ nguyên tốc độ
function setMediaRate(r) {
  if (djFx.braking) return;
  try {
    if (media === YTA && player && player.getPlaybackRate) { if (player.getPlaybackRate() !== r) player.setPlaybackRate(r); }
    else if (media === FileA && FileA.v && FileA.v.playbackRate !== r) FileA.v.playbackRate = r;
  } catch {}
}
setInterval(() => { if (cur && cur.current && media) setMediaRate(cur.rate || 1); }, 1000);   // YouTube đôi khi tự trả về x1 khi nạp lại

// ---- bàn DJ 3D giữa sân khấu (chỉ hiện khi có DJ)
const djBooth = new THREE.Group(), djPlatters = [], djBars = [];
if (DJ_IDX >= 0) {
  djBooth.position.set(0, STAGE_H, DJ_SPOT.z + 1.25); djBooth.visible = false; scene.add(djBooth);
  const ADDB = { transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor };
  const accA = new THREE.MeshBasicMaterial({ color: CT.a }), accB = new THREE.MeshBasicMaterial({ color: CT.b }); PARTY_TINT.push(accA);
  rb(4.8, 1.15, 1.15, 0x111116, 0, 0.575, 0, djBooth, 0.08, { metalness: 0.45, roughness: 0.4 });           // thân bàn
  {                                                                                                         // mặt trước: chữ neon XCVN DJ
    const c = document.createElement('canvas'); c.width = 1024; c.height = 220; const x = c.getContext('2d');
    x.fillStyle = '#07070a'; x.fillRect(0, 0, 1024, 220);
    const g = x.createLinearGradient(0, 0, 1024, 0); g.addColorStop(0, cssHex(CT.a)); g.addColorStop(1, cssHex(CT.b));
    x.strokeStyle = g; x.lineWidth = 6; x.strokeRect(12, 12, 1000, 196);
    x.font = '900 110px system-ui, "Segoe UI", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = g; x.shadowColor = cssHex(CT.a); x.shadowBlur = 30;
    x.fillText('XCVN  DJ', 512, 104);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 0.97), new THREE.MeshBasicMaterial({ map: t })); m.position.set(0, 0.62, 0.581); djBooth.add(m);
  }
  for (let j = 0; j < 18; j++) {                                                                            // cột sóng nhạc nhảy theo nhịp
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1, 0.02), j % 2 ? accB : accA);
    b.geometry.translate(0, 0.5, 0); b.position.set(-2.04 + j * 0.24, 0.06, 0.59); b.scale.y = 0.1; djBooth.add(b); djBars.push(b);
  }
  const edge = new THREE.Mesh(new THREE.BoxGeometry(4.86, 0.04, 0.04), accA); edge.position.set(0, 1.15, 0.585); djBooth.add(edge);
  const vinyl = (() => {                                                                                    // mặt đĩa than: rãnh + nhãn giữa
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
    x.fillStyle = '#0b0b0d'; x.beginPath(); x.arc(128, 128, 128, 0, Math.PI * 2); x.fill();
    x.strokeStyle = 'rgba(255,255,255,.07)'; for (let r = 40; r < 126; r += 3) { x.beginPath(); x.arc(128, 128, r, 0, Math.PI * 2); x.stroke(); }
    x.fillStyle = cssHex(CT.a); x.beginPath(); x.arc(128, 128, 36, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#fff'; x.fillRect(126, 96, 4, 26); x.beginPath(); x.arc(128, 128, 4, 0, Math.PI * 2); x.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const vinylMat = new THREE.MeshStandardMaterial({ map: vinyl, roughness: 0.35, metalness: 0.3 }), sideMat = smat(0x2a2a30, { metalness: 0.8 });
  for (const sx of [-1, 1]) {
    rb(1.5, 0.1, 1.0, 0x1c1c24, sx * 1.48, 1.2, 0, djBooth, 0.03, { metalness: 0.5 });                         // mâm đĩa
    const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 40), [sideMat, vinylMat, vinylMat]); pl.position.set(sx * 1.48 - 0.1, 1.28, 0); djBooth.add(pl); djPlatters.push(pl);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.62), smat(0xc8c8d0, { metalness: 0.9 })); arm.position.set(sx * 1.48 + 0.45, 1.33, -0.05); arm.rotation.y = 0.35; djBooth.add(arm);
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.06), accB); led.position.set(sx * 1.48 + 0.6, 1.26, 0.38); djBooth.add(led);
  }
  rb(1.0, 0.12, 0.9, 0x24242c, 0, 1.21, 0, djBooth, 0.03, { metalness: 0.5 });                                // bàn trộn
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { const k = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 12), smat(0xdedee6, { metalness: 0.7 })); k.position.set(-0.3 + i * 0.3, 1.3, -0.28 + j * 0.18); djBooth.add(k); }
  for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.05), i === 1 ? accB : accA); f.position.set(-0.3 + i * 0.3, 1.29, 0.12 + (i % 2) * 0.08); djBooth.add(f); }
  const xf = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.06), accB); xf.position.set(0, 1.29, 0.36); djBooth.add(xf);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.52, 0.03), smat(0x1a1a20, { metalness: 0.6 })); lid.position.set(0, 1.55, -0.42); lid.rotation.x = 0.28; djBooth.add(lid);   // laptop (mặt lưng hướng khán giả)
  const logo = new THREE.Mesh(new THREE.CircleGeometry(0.1, 24), accA); logo.position.set(0, 1.56, -0.4); logo.rotation.x = 0.28; djBooth.add(logo);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(2.6, 40), new THREE.MeshBasicMaterial({ color: CT.a, opacity: 0.22, ...ADDB })); pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.03, -1.0); djBooth.add(pool);   // vũng sáng dưới chân DJ
  djBooth.userData.update = (dt, t) => {
    if (!djBooth.visible) return;
    const now = performance.now(), playing = !!(cur && cur.current && !cur.paused);
    const base = playing ? (cur.rate || 1) * 3.5 * (now < djFx.brakeUntil ? Math.max(0, (djFx.brakeUntil - now - 1000) / 1000) : 1) : 0;
    for (let i = 0; i < 2; i++) {
      djFx.deckV[i] *= Math.pow(0.03, dt);
      const w = base + djFx.deckV[i]; djPlatters[i].rotation.y -= w * dt;
      if (djPanel && amDJ()) djPanel.spin(i, w * dt);
    }
    const beat = t * BPM / 60, k = Math.exp(-(beat % 1) * 5);
    djBars.forEach((b, j) => { b.scale.y = playing ? 0.12 + (0.5 + 0.5 * Math.sin(t * (5 + j * 1.3) + j * 2.1)) * 0.75 * (0.45 + 0.55 * k) : 0.06; });
  };
  MYSTIC_SPIN.push(djBooth);
}

// ---- loa cảm nhận âm lượng (khi có DJ)
// YouTube không cho đọc âm thanh video → video: nhảy theo nhịp giả lập (theo tốc độ phát); tiếng hiệu ứng DJ: đo thật bằng analyser
const spk = { lvl: 0, prev: 0, obj: new THREE.Object3D() };
spk.obj.userData.update = (dt, t) => {
  if (!SPEAKERS.length) return;
  const on = !!(cur && cur.dj);
  let L = 0;
  if (on) {
    const playing = !!(cur.current && !cur.paused) && !djFx.cutOn && performance.now() > djFx.brakeUntil - 1000;
    const beat = t * BPM / 60 * (cur.rate || 1), k = Math.exp(-(beat % 1) * 6), hh = Math.exp(-((beat + 0.5) % 1) * 9);
    const bar = Math.floor(beat / 4), vari = 0.72 + 0.28 * Math.abs(Math.sin(bar * 1.73 + Math.floor(beat) * 0.61));
    const fake = playing ? Math.min(1, (0.9 * k + 0.25 * hh) * vari) : 0;
    L = Math.max(fake, djLevel());
  }
  spk.lvl += (L - spk.lvl) * Math.min(1, dt * (L > spk.lvl ? 35 : 7));                    // lên nhanh, xuống chậm như đồng hồ VU
  const v = spk.lvl, peak = v > 0.62 && spk.prev <= 0.62; spk.prev = v; djFx.level = v;
  for (const S of SPEAKERS) {
    S.g.visible = S.base || on;
    S.vu.visible = on; S.edges.forEach((e) => (e.visible = !on));
    S.up.position.y = 0.55 + v * 0.65; S.up.scale.y = 1 + v * 0.07; S.up.scale.x = S.up.scale.z = 1 - v * 0.02;   // thân loa nảy lên theo xung
    for (const w of S.woofers) { w.cone.position.z = 1.0 + v * 0.2; w.cap.position.z = 0.98 + v * 0.26; w.cap.scale.set(1 + v * 0.25, 1 + v * 0.25, 0.5 + v * 0.4); w.halo.scale.setScalar(1 + v * 0.16); }
    const lit = Math.round(v * S.VU_N * 1.05);
    for (const sg of S.segs) sg.m.material.color.copy(sg.col).multiplyScalar(sg.i < lit ? 1 : 0.12);
    S.top.material.opacity = Math.max(0, v - 0.45) * 1.4;
    S.arr.rotation.x = Math.sin(t * 2 + S.sx) * 0.02 + v * 0.04;
    if (on && peak) S.waveT = 0;                                                            // xung mạnh → bắn vòng sóng
    if (S.waveT < 1) { S.waveT = Math.min(1, S.waveT + dt * 1.6); S.wave.scale.setScalar(1 + S.waveT * 3.2); S.wave.material.opacity = (1 - S.waveT) * 0.75; }
    else S.wave.material.opacity = 0;
  }
};
MYSTIC_SPIN.push(spk.obj);

// dáng DJ: tay đặt trên 2 đĩa, chà thì tay phải lắc, đầu gật theo nhịp; lúc drop giơ tay trái; thỉnh thoảng 1 tay giữ tai nghe
function djStep(a, t, y0) {
  const g = a.g, now = performance.now(), beat = t * BPM / 60, k = Math.exp(-(beat % 1) * 5);
  const scratching = now < djFx.scratchUntil, pump = now < djFx.pumpUntil, phones = !scratching && !pump && Math.floor(beat / 8) % 2 === 1;
  g.rotation.y = Math.PI; g.position.y = y0 + Math.abs(Math.sin(beat * Math.PI)) * 0.04;
  a.armR.rotation.set(0.55, scratching ? Math.sin(t * 32) * 0.45 : 0, 0.16);
  if (pump) a.armL.rotation.set(0.2, 0, -2.75 + k * 0.35);
  else if (phones) a.armL.rotation.set(0.2, 0, -2.2);
  else a.armL.rotation.set(0.55, 0, -0.16);
  if (a.elbowL) { a.elbowL.rotation.set(pump ? 0.2 : phones ? 0 : 1.05, 0, phones ? -1.9 : 0); a.elbowR.rotation.set(1.05, 0, 0); }
  a.legL.rotation.set(0, 0, 0); a.legR.rotation.set(0, 0, 0);
  a.upper.rotation.x = -0.08 - 0.05 * k; a.upper.rotation.z = 0;
  a.body.position.x = a.body.position.z = 0; a.body.rotation.y = 0;
  a.head.rotation.set(0.1 + 0.14 * k, 0, phones ? 0.22 : 0); a.head.position.y = HEAD_Y;
  a.wasDancing = true;
}

// ---- bảng điều khiển
const djPanel = DJ_IDX >= 0 ? buildPanel({
  $, volume: () => vol,
  emit: (k, v, deck) => socket && socket.emit('dj:fx', { k, v, deck }),
  onScratch: (v, i) => { djFx.scratchUntil = performance.now() + 250; djFx.deckV[i] += v * 14; duckVideo(0.35, 160); },
  onClose: () => { djPanelOpen = false; djPanel.show(false); socket && socket.emit('dj:close'); },
}) : null;
$('dDJ').onclick = () => {
  sfx('init', vol);                                              // mở khoá âm thanh trong lúc bấm
  if (amDJ()) { djPanelOpen = !djPanelOpen; djPanel.show(djPanelOpen); return; }
  if (cur && cur.dj) return toast(`DJ ${cur.dj.name} đang chơi`);
  socket.emit('dj:open', (r) => {
    if (!r || r.error) return toast((r && r.error) || 'Không mở được bàn DJ');
    djPanelOpen = true; if (amDJ()) djPanel.show(true);         // trạng thái phòng thường tới trước lời đáp này
    toast('🎧 Đang đi lên bàn DJ…');
  });
};
function djOnState(s) {
  if (DJ_IDX < 0) return;
  djBooth.visible = !!s.dj;
  const me = !!(s.dj && s.dj.id === myId);
  djPanel.show(me && djPanelOpen);
  if (!me) djPanelOpen = false;
  djPanel.setRate(s.rate || 1); djPanel.setParty(s.party && s.party.dj);
  $('djLbl').textContent = me ? 'Bảng DJ' : 'Bàn DJ';
  $('dDJ').classList.toggle('active', me);
  $('djBadge').classList.toggle('hidden', !s.dj);
  if (s.dj) $('djBadge').textContent = `🎧 DJ ${s.dj.name}${(s.rate || 1) !== 1 ? ' · x' + s.rate : ''}`;
}

// ---- hiệu ứng cho cả rạp
function videoVol() { return djFx.cutOn ? 0 : vol; }
function duckVideo(f, ms) {                                      // hạ nhỏ tiếng video một chút cho nghe rõ tiếng chà
  if (!media || vol === 0 || djFx.cutOn) return;
  try { media.volume(Math.round(vol * f)); } catch {}
  clearTimeout(djFx.duckT); djFx.duckT = setTimeout(() => { if (!djFx.cutOn) applyVolume(); }, ms);
}
function djFlash(kind) {
  const el = $('djFlash');
  if (kind === 'strobe') { el.className = 'strobe'; clearTimeout(el._t); el._t = setTimeout(() => (el.className = ''), 1500); }
  else if (kind === 'blackout') { el.className = 'black'; clearTimeout(el._t); el._t = setTimeout(() => (el.className = ''), 1700); }
  else if (kind === 'laser') djFx.laserUntil = performance.now() + 7000;
  else if (kind === 'color') { LED_BASE.setHSL(Math.random(), 1, 0.55); }
}
function djStutter() {                                           // lặp lại 1 nhịp ngắn 4 lần rồi chạy tiếp
  if (!media || !cur || !cur.current || cur.current.live || (media !== YTA && media !== FileA)) return;
  const t0 = media.time(); quiet(2000);
  [0, 150, 300, 450].forEach((d) => setTimeout(() => { try { media.seek(Math.max(0, t0)); } catch {} }, d));
  setTimeout(() => { try { media.seek(t0 + 0.6 * (cur.rate || 1)); } catch {} }, 600);
}
function djBrakeMedia() {                                        // chậm dần trước khi server dừng video 1 giây
  if (!media || (media !== YTA && media !== FileA)) return;
  const set = (r) => { try { if (media === YTA) player.setPlaybackRate(r); else if (FileA.v) FileA.v.playbackRate = r; } catch {} };
  djFx.braking = true; set(0.75); setTimeout(() => set(0.5), 300); setTimeout(() => set(0.25), 600);
  setTimeout(() => { djFx.braking = false; setMediaRate((cur && cur.rate) || 1); }, 2300);
}
function onDJFx(d) {
  if (!d) return;
  const now = performance.now();
  switch (d.k) {
    case 'scratch':
      if (!amDJ()) { scratchSound(d.v, vol); djFx.deckV[d.deck === 1 ? 1 : 0] += d.v * 14; duckVideo(0.35, 160); }
      djFx.scratchUntil = now + 250; break;
    case 'pad':
      sfx(d.v, vol);
      if (d.v === 'drop') { setTimeout(() => djFlash('strobe'), 550); djFx.pumpUntil = now + 2600; }
      else if (d.v === 'airhorn' || d.v === 'yeah' || d.v === 'siren') djFx.pumpUntil = now + 1500;
      break;
    case 'light': djFlash(d.v); break;
    case 'cut':
      djFx.cutOn = !!d.v; clearTimeout(djFx.cutT);
      if (djFx.cutOn) { try { media && media.volume(0); } catch {} djFx.cutT = setTimeout(() => { djFx.cutOn = false; applyVolume(); }, 4000); }
      else applyVolume();
      break;
    case 'stutter': djStutter(); break;
    case 'rewind': sfx('rewind', vol); djFx.deckV[0] = djFx.deckV[1] = -30; quiet(1200); break;
    case 'brake': sfx('brake', vol); djFx.brakeUntil = now + 2100; djBrakeMedia(); break;
    case 'rate': if (!amDJ()) toast(`🎧 DJ đổi tốc độ: x${d.v}`); break;
  }
}


