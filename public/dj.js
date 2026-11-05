// XEMCHUAVN - Bàn DJ: âm thanh hiệu ứng (tự tổng hợp bằng Web Audio, không cần file) + bảng điều khiển cho DJ.
// app.js gọi: setupDJ(ctx) → trả về { sfx, scratchSound, panel }.
// Không có file âm thanh có bản quyền: mọi tiếng (còi hơi, còi hú, trống, chà đĩa...) được tạo bằng sóng / tiếng ồn.

let ac = null, master = null, noiseBuf = null;
function audio(volume) {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ac = new AC(); master = ac.createGain(); master.connect(ac.destination);
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
  brake(t) {                                                     // phanh đĩa: tiếng chậm dần rồi tắt
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(2400, t); lp.frequency.exponentialRampToValueAtTime(120, t + 0.95); lp.connect(master);
    osc('sawtooth', 165, 18, t, 0.95, 0.3, lp); osc('sawtooth', 247, 26, t, 0.95, 0.15, lp);
  },
};
export function sfx(name, volume) { if (!audio(volume) || !SOUNDS[name]) return; SOUNDS[name](ac.currentTime + 0.01); }
// tiếng chà đĩa: v = tốc độ kéo (-1..1), dấu = chiều kéo
export function scratchSound(v, volume) {
  if (!audio(volume)) return;
  const t = ac.currentTime + 0.005, a = Math.min(1, Math.abs(v));
  if (a < 0.03) return;
  noise(t, 0.075, 'bandpass', 500 + a * 3200 * (v > 0 ? 1 : 0.7), 5, 0.25 + a * 0.45);
  osc('sawtooth', 180 + a * 520, v > 0 ? 260 + a * 700 : 120 + a * 300, t, 0.07, 0.06 + a * 0.08);
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
