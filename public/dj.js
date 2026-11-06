// XEMCHUAVN - Bàn DJ: âm thanh hiệu ứng (tự tổng hợp bằng Web Audio, không cần file) + bảng điều khiển cho DJ.
// app.js gọi: setupDJ(ctx) → trả về { sfx, scratchSound, panel }.
// Không có file âm thanh có bản quyền: mọi tiếng (còi hơi, còi hú, trống, chà đĩa...) được tạo bằng sóng / tiếng ồn.

let ac = null, master = null, noiseBuf = null, analyser = null, abuf = null;
function audio(volume) {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ac = new AC(); master = ac.createGain(); master.connect(ac.destination);
    analyser = ac.createAnalyser(); analyser.fftSize = 512; abuf = new Float32Array(analyser.fftSize); master.connect(analyser);   // đo độ lớn tiếng hiệu ứng → loa nhảy theo
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ac.state === 'suspended') ac.resume().catch(() => {});
  master.gain.value = Math.max(0, Math.min(1, volume / 100)) * 0.55;
  return ac;
}
// trình duyệt chỉ cho phát tiếng sau khi người dùng bấm vào trang → mở khoá âm thanh ở lần bấm đầu
addEventListener('pointerdown', () => { if (ac && ac.state === 'suspended') ac.resume().catch(() => {}); }, { passive: true });

function env(g, t0, a, peak, dur) { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); }
function osc(type, f0, f1, t0, dur, peak = 0.3, dest = master) {
  const o = ac.createOscillator(), g = ac.createGain(); o.type = type;
  o.frequency.setValueAtTime(f0, t0); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
  env(g, t0, 0.005, peak, dur); o.connect(g).connect(dest); o.start(t0); o.stop(t0 + dur + 0.05); return o;
}
function noise(t0, dur, type, freq, q, peak = 0.3, freq1) {
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf; s.loop = true; f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
  if (freq1) f.frequency.exponentialRampToValueAtTime(freq1, t0 + dur);
  env(g, t0, 0.003, peak, dur); s.connect(f).connect(g).connect(master); s.start(t0); s.stop(t0 + dur + 0.05);
}

const SOUNDS = {
  kick(t) { osc('sine', 150, 42, t, 0.32, 0.9); },
  snare(t) { noise(t, 0.18, 'bandpass', 1800, 0.8, 0.45); osc('triangle', 200, 160, t, 0.1, 0.25); },
  clap(t) { for (const d of [0, 0.012, 0.024]) noise(t + d, 0.03, 'bandpass', 1500, 1.2, 0.5); noise(t + 0.036, 0.22, 'bandpass', 1400, 1, 0.3); },
  airhorn(t) {                                                   // còi hơi: 3 hồi "đa-đa-đaaa"
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600; lp.connect(master);
    for (const [d, len] of [[0, 0.13], [0.17, 0.13], [0.34, 0.75]]) for (const f of [466, 587, 698]) osc('sawtooth', f * 1.03, f, t + d, len, 0.11, lp);
  },
  siren(t) {                                                     // còi hú lên xuống
    const o = ac.createOscillator(), g = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
    o.type = 'square'; o.frequency.value = 850; lfo.frequency.value = 3; lg.gain.value = 300; lfo.connect(lg).connect(o.frequency);
    env(g, t, 0.05, 0.12, 1.7); o.connect(g).connect(master); o.start(t); lfo.start(t); o.stop(t + 1.8); lfo.stop(t + 1.8);
  },
  drop(t) {                                                      // bass drop: tiếng rít lên → bùm trầm kéo dài
    noise(t, 0.55, 'bandpass', 400, 2, 0.25, 6000);
    osc('sine', 110, 28, t + 0.55, 1.6, 1.0); osc('sawtooth', 55, 30, t + 0.55, 1.2, 0.18); noise(t + 0.55, 0.4, 'lowpass', 300, 0.7, 0.5);
  },
  zap(t) { osc('square', 1900, 70, t, 0.28, 0.16); },
  yeah(t) {                                                      // tiếng hô "ê ê" giả giọng (formant)
    const src = ac.createOscillator(); src.type = 'sawtooth'; src.frequency.setValueAtTime(230, t); src.frequency.linearRampToValueAtTime(190, t + 0.55);
    const g = ac.createGain(); env(g, t, 0.04, 0.5, 0.6);
    for (const [f, q] of [[750, 6], [1150, 7], [2500, 9]]) { const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q; src.connect(bp).connect(g); }
    g.connect(master); src.start(t); src.stop(t + 0.65);
  },
  rewind(t) { for (let k = 0; k < 3; k++) osc('sawtooth', 1300, 160, t + k * 0.17, 0.17, 0.12); noise(t, 0.55, 'bandpass', 2500, 1.5, 0.15, 400); },
  punch(t) { osc('sine', 140, 50, t, 0.18, 0.9); noise(t, 0.08, 'lowpass', 900, 0.8, 0.6); },              // đấm trúng: bịch
  block(t) { noise(t, 0.06, 'bandpass', 1300, 2, 0.45); osc('triangle', 320, 240, t, 0.07, 0.2); },     // đỡ: cộp
  whoosh(t) { noise(t, 0.16, 'bandpass', 700, 1.2, 0.18, 2600); },                                     // vung tay trượt
  bell(t) { for (const [f, g] of [[1150, 0.3], [2310, 0.12], [3460, 0.06]]) osc('sine', f, f * 0.995, t, 1.6, g); for (const [f, g] of [[1150, 0.25], [2310, 0.1]]) osc('sine', f, f, t + 0.28, 1.4, g); },   // chuông võ đài
  boom(t) {                                                      // nổ trầm ngay lập tức (tự động DJ dùng đúng phách drop)
    osc('sine', 120, 30, t, 1.4, 1.0); osc('sawtooth', 60, 32, t, 0.9, 0.16); noise(t, 0.35, 'lowpass', 320, 0.7, 0.55); noise(t, 0.12, 'highpass', 5000, 0.7, 0.18);
  },
  riser(t, o) {                                                  // tiếng rít dâng dần trong đoạn dồn (dài theo nhịp bài)
    const dur = Math.max(2, Math.min(16, (o.beats || 16) * 60 / (o.bpm || 124)));
    const s0 = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s0.buffer = noiseBuf; s0.loop = true; f.type = 'bandpass'; f.Q.value = 3; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(9000, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32, t + dur * 0.97); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    s0.connect(f).connect(g).connect(master); s0.start(t); s0.stop(t + dur + 0.1);
    osc('sawtooth', 110, 880, t, dur, 0.05);
  },
  roll(t, o) {                                                   // trống dồn: móc đơn → móc kép → móc ba theo nhịp bài
    const beat = 60 / (o.bpm || 124), beats = o.beats || 8;
    let tt = t; const end = t + beats * beat;
    while (tt < end - 0.01) {
      const prog = (tt - t) / (end - t), step = prog < 0.5 ? beat / 2 : prog < 0.8 ? beat / 4 : beat / 8;
      noise(tt, 0.09, 'bandpass', 1700 + prog * 1500, 0.9, 0.18 + prog * 0.3); osc('triangle', 190 + prog * 80, 150, tt, 0.06, 0.1 + prog * 0.1);
      tt += step;
    }
  },
  brake(t) {                                                     // phanh đĩa: tiếng chậm dần rồi tắt
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(2400, t); lp.frequency.exponentialRampToValueAtTime(120, t + 0.95); lp.connect(master);
    osc('sawtooth', 165, 18, t, 0.95, 0.3, lp); osc('sawtooth', 247, 26, t, 0.95, 0.15, lp);
  },
};
// mức âm hiện tại của các tiếng hiệu ứng DJ (0..1), không phụ thuộc nút âm lượng của người xem
export function level() {
  if (!analyser) return 0;
  analyser.getFloatTimeDomainData(abuf);
  let sum = 0; for (let i = 0; i < abuf.length; i++) sum += abuf[i] * abuf[i];
  const g = master.gain.value || 1;
  return Math.min(1, (Math.sqrt(sum / abuf.length) / g) * 3.5);
}
export function sfx(name, volume, o = {}) { if (!audio(volume) || !SOUNDS[name]) return; SOUNDS[name](ac.currentTime + 0.01, o); }
// tiếng chà đĩa: v = tốc độ kéo (-1..1), dấu = chiều kéo
export function scratchSound(v, volume) {
  if (!audio(volume)) return;
  const t = ac.currentTime + 0.005, a = Math.min(1, Math.abs(v));
  if (a < 0.03) return;
  noise(t, 0.075, 'bandpass', 500 + a * 3200 * (v > 0 ? 1 : 0.7), 5, 0.25 + a * 0.45);
  osc('sawtooth', 180 + a * 520, v > 0 ? 260 + a * 700 : 120 + a * 300, t, 0.07, 0.06 + a * 0.08);
}

// ---------- nhận diện thể loại theo tên bài ----------
// YouTube không cho đọc âm thanh video → đoán từ tên bài (và độ dài). energy: 0 nhẹ, 1 vừa, 2 sung.
const GENRES = [
  { id: 'movie', label: 'Phim / video nói', bpm: 100, energy: -1, re: /\b(tập|tap \d|full ?movie|phim|trailer|vietsub|thuyết minh|thuyet minh|review|podcast|vlog|reaction|livestream)\b/i },
  { id: 'vina', label: 'Vinahouse', bpm: 136, energy: 2, re: /vina ?house|nonstop|bay phòng|bay phong|việt mix|viet mix|nhạc sàn|nhac san|dj [\wÀ-ỹ]+ remix|htrol|orinn|đại mèo|dai meo/i },
  { id: 'phonk', label: 'Phonk', bpm: 130, energy: 2, re: /phonk|drift/i },
  { id: 'edm', label: 'EDM / House', bpm: 128, energy: 2, re: /\bedm\b|house|electro|festival|bass ?boost|dubstep|trance|techno|big room|future bass|mashup|alan walker|martin garrix|tiesto|avicii|remix/i },
  { id: 'dnb', label: 'Drum & Bass', bpm: 172, energy: 2, re: /drum ?(and|&|n) ?bass|\bdnb\b|jungle/i },
  { id: 'rap', label: 'Rap / Hip-hop', bpm: 92, energy: 1, re: /\brap\b|hip ?hop|trap|drill|freestyle|cypher|rapper|đen vâu|den vau|binz|wowy|rhymastic/i },
  { id: 'kpop', label: 'K-pop / Dance pop', bpm: 120, energy: 1, re: /k-?pop|bts|blackpink|twice|newjeans|aespa|seventeen|stray kids|dance practice|choreograph/i },
  { id: 'chill', label: 'Lofi / Chill', bpm: 78, energy: 0, re: /lo-?fi|chill|acoustic|piano|relax|sleep|study|cover|guitar|mộc|unplugged/i },
  { id: 'ballad', label: 'Ballad / Trữ tình', bpm: 70, energy: 0, re: /ballad|bolero|trữ tình|tru tinh|nhạc vàng|nhac vang|tình ca|tinh ca|buồn|buon|sad/i },
];
export function detectGenre(title, duration) {
  const t = String(title || '');
  for (const g of GENRES) if (g.re.test(t)) return g;
  if (duration > 40 * 60) return GENRES[0];                     // dài quá 40 phút → nhiều khả năng là phim
  return { id: 'pop', label: 'Pop', bpm: 118, energy: 1 };
}

// ---------- tự động đánh DJ ----------
// Chạy trên máy của DJ, bám theo phách tính từ thời gian video (mọi người cùng phách).
// Bài chia thành đoạn 32 phách (8 ô nhịp): thường → dồn → DROP → ... tuỳ độ sung; mức 1 nhẹ, 2 vừa, 3 quẩy.
// Tác động thẳng vào video ở chỗ hợp lý:
//   - tăng tốc x1.25 trong 8 phách cuối đoạn dồn, về x1 đúng phách drop
//   - bài chậm (mức quẩy): đoạn nghỉ chạy chậm x0.75 rồi trả lại
export function createAutoDJ({ emit, scratch, party, rate }) {
  let last = null, genre = { id: 'pop', energy: 1, bpm: 118 }, lvl = 2, slowP = null;
  const later = (ms, fn) => setTimeout(fn, ms);
  const PLAN = { 2: ['groove', 'build', 'drop', 'drop'], 1: ['groove', 'groove', 'build', 'drop'], 0: ['groove', 'groove', 'groove', 'break'] };
  const flurry = () => { [0.9, -0.8, 0.85, -0.9, 0.7, -0.6].forEach((v, i) => later(i * 45, () => scratch(v, i % 2))); };   // chà đĩa nhanh cuối đoạn
  const normal = () => { if (rate() !== 1) emit('rate', 1); };
  function tick(b) {
    if (last === b) return;
    if (last != null && (b < last || b - last > 8)) { last = b; return; }   // vừa tua / quay ngược → chờ phách kế tiếp
    last = b;
    const pos = ((b % 32) + 32) % 32, P = Math.floor(b / 32), E = genre.energy;
    if (E < 0) { if (pos === 0) emit('light', 'color'); return; }          // phim: chỉ đổi màu đèn nhẹ nhàng
    const sec = (PLAN[E] || PLAN[1])[((P % 4) + 4) % 4], rnd = Math.random();
    const speedUp = E >= 1 && lvl >= 2;                                       // tăng tốc đoạn dồn (mức vừa / quẩy)
    if (pos === 0) {
      if (sec === 'break' && E === 0 && lvl >= 3) { emit('rate', 0.75); slowP = P; }
      if (sec === 'groove' && E >= 1 && lvl >= 2 && P % 2 === 1) emit('combo', 'flash');   // đầu đoạn thường: flash liền   // bài chậm: đoạn nghỉ chậm lại cho "phiêu"
      else if (slowP !== P) normal();                                         // hết đoạn chậm / tăng tốc → về x1
      if (sec === 'drop') {
        const fromBuild = (PLAN[E] || PLAN[1])[(((P - 1) % 4) + 4) % 4] === 'build';
        if (!fromBuild) { emit('pad', 'boom'); emit('light', 'strobe'); }       // vào từ đoạn dồn thì combo drop đã lo phần nổ + nháy
        if (lvl >= 2) emit('light', 'laser');
        if (!party()) emit('party');
        if (lvl >= 2 && E >= 2 && rnd < 0.6) later(450, () => emit('pad', 'airhorn'));
      } else if (sec === 'break') { emit('light', 'blackout'); if (party()) emit('party'); }
      else { emit('light', 'color'); if (sec === 'groove' && party() && E < 2) emit('party'); }
      return;
    }
    if (sec === 'build') {
      if (pos === 8 && E >= 2 && lvl >= 2) emit('pad', 'siren');
      if (pos === 16) emit('pad', 'riser');                                  // rít dâng 16 phách → drop
      if (pos === 24 && lvl >= 2) { emit('pad', 'roll'); if (speedUp) emit('rate', 1.25); }   // trống dồn + tăng tốc 8 phách cuối
      if (pos === 31) emit('combo', 'blackdrop');                            // tối om 1 phách → drop nổ + nháy (chỉ đèn, không tắt tiếng)
      if (pos % 8 === 0) emit('light', 'color');
      return;
    }
    if (pos % 8 === 0) emit('light', 'color');                               // đổi màu mỗi 2 ô nhịp
    if (sec === 'drop') {
      if (pos === 16 && lvl >= 2) { emit('light', 'strobe'); if (lvl >= 3 && rnd < 0.5) emit('pad', 'airhorn'); }
      if (pos === 8 && lvl >= 3 && rnd < 0.4) emit('pad', 'yeah');
      if (pos === 14 && (lvl >= 3 || (lvl === 2 && P % 2 === 0))) { emit('combo', 'flash'); return; }  // flash liền phách 14–16 → phách 16 nháy tiếp
      if (pos === 30 && lvl >= 3 && P % 2 === 1) { emit('combo', 'flash'); return; }                   // cuối đoạn: xen kẽ flash liền / chà đĩa
    }
    if (pos === 30 && lvl >= 2 && (sec === 'drop' || E >= 1) && rnd < 0.7) flurry();
    if (pos === 16 && sec === 'groove' && lvl >= 2 && E >= 1) emit('light', 'laser');
  }
  return { tick, setGenre(g) { genre = g; last = null; slowP = null; }, setLevel(l) { lvl = l; }, reset() { last = null; } };
}

// ---------- bảng điều khiển của DJ ----------
export function buildPanel(ctx) {
  const { $, emit, volume, onClose } = ctx;
  const root = $('djPanel');
  const deck = (i) => root.querySelector(`.djDeck[data-deck="${i}"] .djVinyl`);
  // kéo vòng tròn đĩa để chà: tính góc quay giữa 2 lần di chuột
  for (const i of [0, 1]) {
    const el = deck(i); let last = null, acc = 0, lastSend = 0;
    const angleOf = (e) => { const r = el.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)); };
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch {} last = angleOf(e); el.classList.add('grab'); });
    el.addEventListener('pointermove', (e) => {
      if (last == null) return;
      const a = angleOf(e); let d = a - last; d = Math.atan2(Math.sin(d), Math.cos(d)); last = a;
      const ang = Number(el.dataset.a || 0) + d; el.dataset.a = ang; el.style.transform = `rotate(${ang}rad)`; acc += d;
      const now = performance.now();
      if (now - lastSend > 33) {
        const v = Math.max(-1, Math.min(1, acc / 0.35)); acc = 0; lastSend = now;
        if (Math.abs(v) > 0.03) { emit('scratch', v, i); scratchSound(v, volume()); ctx.onScratch(v, i); }
      }
    });
    const up = () => { last = null; el.classList.remove('grab'); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }
  root.querySelectorAll('[data-pad]').forEach((b) => b.onclick = () => emit('pad', b.dataset.pad));
  root.querySelectorAll('[data-light]').forEach((b) => b.onclick = () => emit('light', b.dataset.light));
  root.querySelectorAll('[data-rate]').forEach((b) => b.onclick = () => emit('rate', Number(b.dataset.rate)));
  root.querySelectorAll('[data-fx]').forEach((b) => b.onclick = () => emit(b.dataset.fx));
  root.querySelectorAll('[data-combo]').forEach((b) => b.onclick = () => emit('combo', b.dataset.combo));
  const cut = root.querySelector('[data-cut]');                  // giữ nút CUT = tắt tiếng video
  const cutOn = (e) => { e.preventDefault(); cut.classList.add('on'); emit('cut', true); };
  const cutOff = () => { if (!cut.classList.contains('on')) return; cut.classList.remove('on'); emit('cut', false); };
  cut.addEventListener('pointerdown', cutOn); cut.addEventListener('pointerup', cutOff); cut.addEventListener('pointerleave', cutOff); cut.addEventListener('pointercancel', cutOff);
  $('djClose').onclick = onClose;
  $('djMin').onclick = () => root.classList.toggle('mini');
  // phím tắt khi đang mở bàn DJ: 1-8 = pad, Z = phanh, X = quay ngược, C = lặp nhịp
  const PADS = [...root.querySelectorAll('[data-pad]')].map((b) => b.dataset.pad);
  addEventListener('keydown', (e) => {
    if (root.classList.contains('hidden') || e.target.closest('input,textarea,[contenteditable]') || e.ctrlKey || e.metaKey || e.altKey) return;
    const n = Number(e.key);
    if (n >= 1 && n <= PADS.length) { emit('pad', PADS[n - 1]); e.preventDefault(); }
    else if (e.key === 'z' || e.key === 'Z') emit('brake');
    else if (e.key === 'x' || e.key === 'X') emit('rewind');
    else if (e.key === 'c' || e.key === 'C') emit('stutter');
  });
  return {
    show(v) { root.classList.toggle('hidden', !v); },
    setRate(r) { root.querySelectorAll('[data-rate]').forEach((b) => b.classList.toggle('on', Number(b.dataset.rate) === r)); },
    setParty(on) { root.querySelector('[data-fx="party"]').classList.toggle('on', !!on); },
    spin(i, rad) { const el = deck(i); if (el.classList.contains('grab')) return; const cur = Number(el.dataset.a || 0) + rad; el.dataset.a = cur; el.style.transform = `rotate(${cur}rad)`; },
  };
}
