// Phong cách VŨ TRỤ: vách đá phủ tinh vân tím xanh có vân vàng, bảng hologram bản đồ sao / hệ mặt trời / tên lửa,
// khung đá vàng quanh màn, đĩa quỹ đạo phát sáng trên sân khấu, hành tinh lơ lửng, trần đầy sao, bụi sao trôi, ghế đỏ dung nham.
import { canvasTex, glowPlane, onWall, rng } from './kit.js';

export default async function cosmic(c) {
  const { THREE, scene, HALL_X, HALL_H, HALL_FRONT, HALL_BACK, HALL_D, HALL_ZC, SCR_W, SCR_H, SCR_Y, SCR_Z, STAGE_H, STAGE_Z0, STAGE_Z1, floorY } = c;
  const R = rng(2049);

  // ---------- texture tinh vân trên nền đá ----------
  const nebula = (seed) => canvasTex(THREE, 512, 2048, (x, w, h) => {
    const r = rng(seed);
    x.fillStyle = '#05060e'; x.fillRect(0, 0, w, h);
    x.globalCompositeOperation = 'lighter';
    const cols = ['#5a22c9', '#2346e0', '#a12fa8', '#1aa0d8', '#7a35ff'];
    for (let i = 0; i < 60; i++) {
      const cx = r() * w, cy = r() * h, rad = 60 + r() * 240, col = cols[i % cols.length];
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad); g.addColorStop(0, col + '66'); g.addColorStop(1, col + '00');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
    }
    x.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 40; i++) {                                                           // vân đá: các dải tối lượn chéo
      x.fillStyle = `rgba(4,5,12,${0.35 + r() * 0.4})`; x.beginPath();
      const y0 = r() * h * 1.2 - h * 0.1, amp = 20 + r() * 60, th = 10 + r() * 50;
      x.moveTo(0, y0); for (let px = 0; px <= w; px += 16) x.lineTo(px, y0 + Math.sin(px / (60 + r() * 40) + i) * amp - px * 0.25);
      for (let px = w; px >= 0; px -= 16) x.lineTo(px, y0 + th + Math.sin(px / 70 + i * 1.3) * amp * 0.8 - px * 0.25);
      x.closePath(); x.fill();
    }
    x.strokeStyle = 'rgba(217,164,65,.55)'; x.shadowColor = '#d9a441'; x.shadowBlur = 6;     // vân vàng
    for (let i = 0; i < 9; i++) { x.lineWidth = 1 + r() * 2; x.beginPath(); const y0 = r() * h; x.moveTo(0, y0); for (let px = 0; px <= w; px += 12) x.lineTo(px, y0 + Math.sin(px / 50 + i) * 18 - px * 0.25 + (r() - 0.5) * 6); x.stroke(); }
    x.shadowBlur = 0;
    for (let i = 0; i < 1100; i++) { const s = r() < 0.94 ? 1 : 2.2; x.fillStyle = r() < 0.8 ? '#ffffff' : '#9fd8ff'; x.globalAlpha = 0.4 + r() * 0.6; x.fillRect(r() * w, r() * h, s, s); }
    x.globalAlpha = 1;
  });
  const NEB = [nebula(11), nebula(23), nebula(37)];
  for (const t of NEB) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 2.6); t.offset.y = NEB.indexOf(t) * 0.37; }   // phiến cao ~36 m, rộng ~3.5 m: ảnh 1:4 lặp 2.6 lần → tinh vân giữ đúng tỉ lệ
  const slabMat = NEB.map((t) => new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.6, roughness: 0.9 }));

  // ---------- vách đá: các phiến đá nghiêng nhẹ xếp dọc 2 bên tường + tường sau ----------
  for (const sx of [-1, 1]) for (let z = HALL_FRONT + 1, i = 0; z < HALL_BACK; z += 3.1, i++) {
    const d = 0.5 + R() * 0.9, w = 3.4 + R() * 0.8;
    const m = new THREE.Mesh(new THREE.BoxGeometry(d, HALL_H + 2, w), slabMat[i % 3]);
    m.position.set(sx * (HALL_X - d / 2 - R() * 0.25), HALL_H / 2, z); m.rotation.set((R() - 0.5) * 0.05, (R() - 0.5) * 0.12, sx * (R() * 0.05)); scene.add(m);
  }
  for (let x0 = -HALL_X, i = 0; x0 < HALL_X; x0 += 3.4, i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(3.6, HALL_H + 2, 0.6 + R() * 0.6), slabMat[(i + 1) % 3]); m.position.set(x0 + 1.7, HALL_H / 2, HALL_BACK - 0.5); m.rotation.y = (R() - 0.5) * 0.1; scene.add(m);
  }
  for (const sx of [-1, 1]) {                                                              // tường trước 2 bên màn
    const wF = HALL_X - SCR_W / 2 - 0.6;
    const m = new THREE.Mesh(new THREE.BoxGeometry(wF, HALL_H + 2, 0.5), slabMat[sx > 0 ? 2 : 0]); m.position.set(sx * (SCR_W / 2 + 0.6 + wF / 2), HALL_H / 2, HALL_FRONT + 0.3); scene.add(m);
  }

  // ---------- trần sao ----------
  {
    const t = canvasTex(THREE, 2048, 1024, (x, w, h) => {
      x.fillStyle = '#03040a'; x.fillRect(0, 0, w, h);
      const g = x.createLinearGradient(0, h * 0.2, w, h * 0.8); g.addColorStop(0, 'rgba(90,40,200,0)'); g.addColorStop(0.5, 'rgba(120,80,255,.28)'); g.addColorStop(1, 'rgba(40,120,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, w, h);                                               // dải ngân hà
      const r = rng(5); for (let i = 0; i < 2600; i++) { x.fillStyle = r() < 0.85 ? '#fff' : '#b9d6ff'; x.globalAlpha = 0.3 + r() * 0.7; const s = r() < 0.97 ? 1.2 : 2.6; x.fillRect(r() * w, r() * h, s, s); }
      x.globalAlpha = 1;
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(HALL_X * 2, HALL_D), new THREE.MeshBasicMaterial({ map: t }));
    m.position.set(0, HALL_H - 0.1, HALL_ZC); m.rotation.x = Math.PI / 2; scene.add(m);
  }

  // ---------- bảng hologram trên vách ----------
  const holo = (kind) => canvasTex(THREE, 512, 640, (x, w, h) => {
    x.fillStyle = 'rgba(10,20,40,.85)'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#7fe3ff'; x.lineWidth = 3; x.strokeRect(8, 8, w - 16, h - 16); x.lineWidth = 1; x.strokeRect(18, 18, w - 36, h - 36);
    x.fillStyle = '#bff1ff'; x.font = '600 26px system-ui, sans-serif'; x.textAlign = 'center';
    x.shadowColor = '#7fe3ff'; x.shadowBlur = 8;
    const r = rng(kind.length * 31);
    if (kind === 'stars') {
      x.fillText('STAR MAP · ORION', w / 2, 56);
      for (const rad of [80, 150, 220]) { x.beginPath(); x.arc(w / 2, h / 2 + 20, rad, 0, Math.PI * 2); x.stroke(); }
      const pts = []; for (let i = 0; i < 14; i++) pts.push([w / 2 + (r() - 0.5) * 400, h / 2 + 20 + (r() - 0.5) * 400]);
      x.beginPath(); pts.slice(0, 8).forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py))); x.stroke();
      for (const [px, py] of pts) { x.beginPath(); x.arc(px, py, 4 + r() * 4, 0, Math.PI * 2); x.fill(); }
    } else if (kind === 'solar') {
      x.fillText('HỆ MẶT TRỜI', w / 2, 56);
      x.fillStyle = '#ffcc55'; x.beginPath(); x.arc(w / 2, h / 2 + 20, 26, 0, Math.PI * 2); x.fill();
      for (let i = 1; i <= 6; i++) {
        const rad = 30 + i * 32; x.beginPath(); x.ellipse(w / 2, h / 2 + 20, rad, rad * 0.9, 0, 0, Math.PI * 2); x.stroke();
        const a = r() * Math.PI * 2; x.fillStyle = ['#9fd8ff', '#ff9f6b', '#7cff9a', '#ffd36b', '#c49bff', '#ff7ab8'][i - 1];
        x.beginPath(); x.arc(w / 2 + Math.cos(a) * rad, h / 2 + 20 + Math.sin(a) * rad * 0.9, 5 + i, 0, Math.PI * 2); x.fill();
      }
    } else {
      x.fillText('TÊN LỬA · XCVN-01', w / 2, 56);
      x.beginPath(); x.moveTo(w / 2, 110); x.quadraticCurveTo(w / 2 + 60, 200, w / 2 + 50, 470); x.lineTo(w / 2 - 50, 470); x.quadraticCurveTo(w / 2 - 60, 200, w / 2, 110); x.stroke();
      x.beginPath(); x.moveTo(w / 2 - 50, 400); x.lineTo(w / 2 - 110, 520); x.lineTo(w / 2 - 50, 470); x.moveTo(w / 2 + 50, 400); x.lineTo(w / 2 + 110, 520); x.lineTo(w / 2 + 50, 470); x.stroke();
      x.beginPath(); x.arc(w / 2, 250, 26, 0, Math.PI * 2); x.stroke();
      for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(60, 140 + i * 70); x.lineTo(140, 140 + i * 70); x.stroke(); x.fillText('' + (i + 1) * 120, 100, 132 + i * 70); }
    }
    x.font = '16px monospace'; x.textAlign = 'left'; x.fillStyle = '#7fe3ff';
    for (let i = 0; i < 4; i++) x.fillText(`${(r() * 360).toFixed(2)}° · ${(r() * 99).toFixed(1)} LY`, 34, h - 90 + i * 20);
  });
  const KINDS = ['stars', 'solar', 'rocket'], HOLO = KINDS.map(holo);
  for (const sx of [-1, 1]) [HALL_FRONT + 9, HALL_FRONT + 19, HALL_FRONT + 29].forEach((z, i) => {
    if (z > HALL_BACK - 3) return;
    const k = (i + (sx > 0 ? 1 : 0)) % 3;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 5.25), new THREE.MeshBasicMaterial({ map: HOLO[k], transparent: true, opacity: 0.92, side: THREE.DoubleSide }));
    m.position.set(sx * (HALL_X - 1.9), floorY(z) + 10, z); m.rotation.y = -sx * (Math.PI / 2 - 0.3); scene.add(m);
    const fr = new THREE.Mesh(new THREE.BoxGeometry(4.5, 5.55, 0.08), c.smat(0x1a1d2c, { metalness: 0.8, roughness: 0.3 })); fr.position.copy(m.position); fr.rotation.copy(m.rotation); fr.translateZ(-0.08); scene.add(fr);
    const gl = glowPlane(c, 7, 8, 0x5fb8ff, 0.25); gl.position.copy(m.position); gl.rotation.copy(m.rotation); gl.translateZ(-0.15); scene.add(gl);
  });

  // ---------- khung đá vàng quanh màn (chỉ nằm ngoài mép màn, không che video) ----------
  {
    const rockDark = c.smat(0x2a2333, { roughness: 0.8, metalness: 0.2, flatShading: true });
    const rockGold = new THREE.MeshStandardMaterial({ color: 0xd9a441, emissive: 0x6b4a10, emissiveIntensity: 0.9, metalness: 0.85, roughness: 0.35, flatShading: true });
    const geo = new THREE.DodecahedronGeometry(1, 0);
    const hw = SCR_W / 2 + 1.7, hh = SCR_H / 2 + 1.7, edge = [];   // cách mép màn đủ xa để đá không lấn vào hình
    for (let x0 = -hw; x0 <= hw; x0 += 1.5) { edge.push([x0, SCR_Y + hh]); edge.push([x0, SCR_Y - hh]); }
    for (let y0 = SCR_Y - hh + 1.5; y0 < SCR_Y + hh; y0 += 1.5) { edge.push([-hw, y0]); edge.push([hw, y0]); }
    for (const [x0, y0] of edge) {
      const m = new THREE.Mesh(geo, R() < 0.45 ? rockGold : rockDark); const s = 0.7 + R() * 0.45;
      m.scale.set(s * (0.9 + R() * 0.3), s, s * 0.6); m.position.set(x0 + (R() - 0.5) * 0.3, y0 + (R() - 0.5) * 0.3, SCR_Z - 0.2); m.rotation.set(R() * 3, R() * 3, R() * 3); scene.add(m);
    }
    const halo = glowPlane(c, SCR_W + 10, SCR_H + 10, 0xb07cff, 0.35); halo.position.set(0, SCR_Y, SCR_Z - 0.6); scene.add(halo);
  }

  // ---------- đĩa quỹ đạo phát sáng trên sân khấu (xoay chậm) ----------
  {
    const t = canvasTex(THREE, 1024, 1024, (x, w) => {
      x.translate(w / 2, w / 2); x.strokeStyle = '#8fd8ff'; x.shadowColor = '#5fb8ff'; x.shadowBlur = 14;
      for (const [r0, lw] of [[480, 6], [400, 3], [300, 4], [200, 2], [110, 5]]) { x.lineWidth = lw; x.beginPath(); x.arc(0, 0, r0, 0, Math.PI * 2); x.stroke(); }
      for (let i = 0; i < 72; i++) { const a = i / 72 * Math.PI * 2, l = i % 6 ? 14 : 34; x.lineWidth = 2; x.beginPath(); x.moveTo(Math.cos(a) * 480, Math.sin(a) * 480); x.lineTo(Math.cos(a) * (480 - l), Math.sin(a) * (480 - l)); x.stroke(); }
      for (const [r0, a, s, col] of [[400, 0.6, 18, '#ffd36b'], [300, 2.4, 14, '#ff8a6b'], [200, 4.2, 12, '#9fffd0'], [400, 3.7, 10, '#c49bff']]) { x.fillStyle = col; x.shadowColor = col; x.beginPath(); x.arc(Math.cos(a) * r0, Math.sin(a) * r0, s, 0, Math.PI * 2); x.fill(); }
      x.fillStyle = '#ffd36b'; x.shadowColor = '#ffb020'; x.beginPath(); x.arc(0, 0, 40, 0, Math.PI * 2); x.fill();
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(13, 13), new THREE.MeshBasicMaterial({ map: t, opacity: 0.9, ...c.ADD }));
    m.position.set(0, STAGE_H + 0.03, (STAGE_Z0 + STAGE_Z1) / 2); m.rotation.x = -Math.PI / 2; m.scale.set(1, 0.42, 1); m.userData.spin = 0.06; scene.add(m); c.SPIN.push(m);
  }

  // ---------- hành tinh lơ lửng ----------
  const planetTex = (cols, seed) => canvasTex(THREE, 512, 256, (x, w, h) => {
    const r = rng(seed); x.fillStyle = cols[0]; x.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) { x.fillStyle = cols[1 + Math.floor((Math.sin(y / 9 + r() * 0.6) * 0.5 + 0.5) * (cols.length - 1)) % (cols.length - 1)]; x.globalAlpha = 0.5; x.fillRect(0, y, w, 2); }
    x.globalAlpha = 1;
  });
  const planets = [
    { pos: [-HALL_X + 5, 25, HALL_FRONT + 6], r: 2.6, tex: planetTex(['#c97a3a', '#e8b06b', '#8a4a22', '#f3d19a'], 3), ring: true },
    { pos: [HALL_X - 5, 23, HALL_FRONT + 9], r: 2.0, tex: planetTex(['#2a5fd8', '#5fb8ff', '#1a3a8a', '#9fe0ff'], 8) },
    { pos: [HALL_X - 8, 28, HALL_FRONT + 3], r: 0.8, tex: planetTex(['#9a9aa8', '#c9c9d6', '#6b6b78'], 12) },
    { pos: [-HALL_X + 9, 21, HALL_FRONT + 13], r: 1.1, tex: planetTex(['#a23aa8', '#d47ae0', '#5a1f6b'], 21) },
  ];
  for (const p of planets) {
    const g = new THREE.Group(); g.position.set(...p.pos); scene.add(g);
    const s = new THREE.Mesh(new THREE.SphereGeometry(p.r, 32, 20), new THREE.MeshStandardMaterial({ map: p.tex, emissiveMap: p.tex, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.8 }));
    s.rotation.z = 0.3; g.add(s);
    if (p.ring) { const ring = new THREE.Mesh(new THREE.RingGeometry(p.r * 1.35, p.r * 2.1, 64), new THREE.MeshBasicMaterial({ color: 0xe8c08a, transparent: true, opacity: 0.6, side: THREE.DoubleSide })); ring.rotation.x = Math.PI / 2 - 0.35; g.add(ring); }
    const halo = glowPlane(c, p.r * 4.5, p.r * 4.5, 0x7a9cff, 0.25); g.add(halo);
    const y0 = p.pos[1], ph = R() * 6;
    g.userData.update = (dt) => { s.rotation.y += dt * 0.12; g.position.y = y0 + Math.sin(performance.now() / 1600 + ph) * 0.5; halo.lookAt(0, 8, 30); };
    c.SPIN.push(g);
  }

  // ---------- bụi sao lơ lửng ----------
  {
    const N = 420, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), A = new THREE.Color(0xffffff), B = new THREE.Color(0x8fc8ff), C = new THREE.Color(0xc49bff);
    for (let i = 0; i < N; i++) { pos.set([(R() * 2 - 1) * (HALL_X - 1), 3 + R() * (HALL_H - 5), HALL_FRONT + R() * (HALL_BACK - HALL_FRONT)], i * 3); col.set([A, B, C][i % 3].toArray(), i * 3); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.13, vertexColors: true, opacity: 0.9, ...c.ADD }));
    pts.userData.motes = true; scene.add(pts); c.SPIN.push(pts);
  }

  // ---------- ánh sáng tím / xanh ----------
  for (const [x, z, col] of [[-HALL_X + 4, HALL_FRONT + 6, 0x7a5cff], [HALL_X - 4, HALL_FRONT + 6, 0x3fa8ff], [-HALL_X + 4, HALL_ZC + 8, 0x3fa8ff], [HALL_X - 4, HALL_ZC + 8, 0xa05cff]]) {
    const l = new THREE.PointLight(col, 90, 30, 1.8); l.position.set(x, 15, z); scene.add(l);
  }
  { const e = new THREE.Mesh(new THREE.BoxGeometry(SCR_W + 6, 0.06, 0.06), c.accA); e.position.set(0, STAGE_H + 0.03, STAGE_Z1 + 0.02); scene.add(e); }
  return { cab: 0x12141f, metal: 0x2a2f45 };
}
