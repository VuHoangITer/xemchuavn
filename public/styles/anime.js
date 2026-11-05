// Phong cách ANIME HOA ANH ĐÀO: tường vẽ trời hoàng hôn hồng tím có trăng, núi, chùa và cành anh đào,
// cột sơn mài đỏ treo đèn lồng, dây đèn lồng ngang trần, cổng torii ôm màn chiếu, 2 cây anh đào hai bên sân khấu, cánh hoa rơi.
import { canvasTex, glowPlane, onWall, rng } from './kit.js';

export default async function anime(c) {
  const { THREE, scene, HALL_X, HALL_H, HALL_FRONT, HALL_BACK, HALL_D, HALL_ZC, SCR_W, SCR_H, SCR_Y, SCR_Z, STAGE_H, STAGE_Z0, STAGE_Z1, TOP_H, LAND_Z0, floorY } = c;
  const R = rng(39);

  // ---------- tranh tường: trời hoàng hôn anime ----------
  const blossom = (x, cx, cy, r, rr) => {                                                    // 1 chùm hoa anh đào
    for (let i = 0; i < 26; i++) {
      const a = rr() * Math.PI * 2, d = rr() * r;
      x.fillStyle = ['#ffd1e3', '#ffb3cf', '#ff9cc2', '#fff0f6'][Math.floor(rr() * 4)];
      x.beginPath(); x.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, 5 + rr() * 9, 0, Math.PI * 2); x.fill();
    }
  };
  const branch = (x, x0, y0, len, ang, depth, rr) => {                                       // cành cây phân nhánh có hoa
    const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
    x.strokeStyle = '#3a2230'; x.lineWidth = Math.max(2, depth * 4); x.lineCap = 'round';
    x.beginPath(); x.moveTo(x0, y0); x.quadraticCurveTo((x0 + x1) / 2 + (rr() - 0.5) * 30, (y0 + y1) / 2 + (rr() - 0.5) * 30, x1, y1); x.stroke();
    if (depth <= 1) { blossom(x, x1, y1, 46, rr); return; }
    for (let k = 0; k < 2 + (rr() < 0.4); k++) branch(x, x1, y1, len * (0.62 + rr() * 0.15), ang + (rr() - 0.5) * 1.3, depth - 1, rr);
    if (rr() < 0.6) blossom(x, x1, y1, 34, rr);
  };
  const mural = (flip) => canvasTex(THREE, 2048, 1536, (x, w, h) => {
    const rr = rng(flip ? 77 : 41);
    const sky = x.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#141238'); sky.addColorStop(0.35, '#3d2a72'); sky.addColorStop(0.62, '#a0559e'); sky.addColorStop(0.8, '#ff9eb5'); sky.addColorStop(1, '#ffd2b8');
    x.fillStyle = sky; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 380; i++) { x.fillStyle = '#fff'; x.globalAlpha = (1 - rr() * rr()) * 0.8 * (1 - 0); const yy = rr() * h * 0.5; x.globalAlpha = 0.25 + rr() * 0.75 * (1 - yy / (h * 0.5)); x.fillRect(rr() * w, yy, 2, 2); }
    x.globalAlpha = 1;
    const mx = flip ? w * 0.28 : w * 0.72, my = h * 0.24;                                  // trăng tròn
    const mg = x.createRadialGradient(mx, my, 60, mx, my, 360); mg.addColorStop(0, 'rgba(255,240,220,.55)'); mg.addColorStop(1, 'rgba(255,240,220,0)');
    x.fillStyle = mg; x.fillRect(0, 0, w, h); x.fillStyle = '#fff4e2'; x.beginPath(); x.arc(mx, my, 120, 0, Math.PI * 2); x.fill();
    x.fillStyle = 'rgba(255,255,255,.28)';                                                 // mây mỏng
    for (let i = 0; i < 6; i++) { const cy = h * (0.3 + rr() * 0.25), cx = rr() * w; for (let k = 0; k < 7; k++) { x.beginPath(); x.ellipse(cx + k * 60, cy + Math.sin(k) * 8, 90, 20, 0, 0, Math.PI * 2); x.fill(); } }
    const ridge = (base, amp, col, step) => { x.fillStyle = col; x.beginPath(); x.moveTo(0, h); for (let px = 0; px <= w; px += step) x.lineTo(px, base - Math.abs(Math.sin(px / 380 + base)) * amp - rr() * amp * 0.15); x.lineTo(w, h); x.fill(); };
    ridge(h * 0.8, 220, '#6a3f86', 40); ridge(h * 0.86, 160, '#4a2c68', 30);
    const px0 = flip ? w * 0.7 : w * 0.25, py0 = h * 0.86;                                 // chùa nhiều tầng (bóng)
    x.fillStyle = '#2c1a44';
    for (let k = 0; k < 4; k++) { const ww = 260 - k * 48, yy = py0 - k * 95; x.beginPath(); x.moveTo(px0 - ww / 2 - 30, yy); x.quadraticCurveTo(px0, yy - 40, px0 + ww / 2 + 30, yy); x.lineTo(px0 + ww / 2, yy + 14); x.lineTo(px0 - ww / 2, yy + 14); x.fill(); x.fillRect(px0 - ww / 2 + 30, yy + 14, ww - 60, 70); }
    x.fillRect(px0 - 4, py0 - 470, 8, 110);
    ridge(h * 0.95, 70, '#2a1a3d', 20);
    x.fillStyle = '#ffd9a0';                                                               // đèn nhà xa
    for (let i = 0; i < 40; i++) x.fillRect(rr() * w, h * 0.9 + rr() * h * 0.08, 4, 4);
    branch(x, flip ? w : 0, h * 0.05, 300, flip ? Math.PI - 0.35 : 0.35, 5, rr);            // cành anh đào từ góc trên
    branch(x, flip ? w : 0, h * 0.42, 220, flip ? Math.PI + 0.2 : -0.2, 4, rr);
    for (let i = 0; i < 70; i++) { x.fillStyle = '#ffc4dc'; x.globalAlpha = 0.8; x.beginPath(); x.ellipse(rr() * w, rr() * h, 6, 3.5, rr() * 3, 0, Math.PI * 2); x.fill(); }   // cánh hoa bay
    x.globalAlpha = 1;
  });
  for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(HALL_D, HALL_H), new THREE.MeshBasicMaterial({ map: mural(sx > 0), color: 0xd8d0dc }));
    onWall(c, m, sx, HALL_H / 2, HALL_ZC, 0.05);
  }
  { const m = new THREE.Mesh(new THREE.PlaneGeometry(HALL_X * 2, HALL_H), new THREE.MeshBasicMaterial({ map: mural(false), color: 0xbdb3c4 })); m.position.set(0, HALL_H / 2, HALL_BACK - 0.05); m.rotation.y = Math.PI; scene.add(m); }

  // ---------- trần: tím đêm + dây đèn lồng ----------
  const lanternMat = (col, em) => new THREE.MeshStandardMaterial({ color: col, emissive: em, emissiveIntensity: 1.1, roughness: 0.6 });
  const LR = lanternMat(0xe2453c, 0xff5a3c), LW = lanternMat(0xfff1e0, 0xffd6a8), LP = lanternMat(0xffb3d1, 0xff8fc0);
  const capMat = c.smat(0x1a1214);
  const lanternGeo = new THREE.SphereGeometry(1, 16, 12), capGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.18, 12);
  const lantern = (parent, x, y, z, s, m) => {
    const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
    const b = new THREE.Mesh(lanternGeo, m); b.scale.set(s, s * 1.25, s); g.add(b);
    for (const dy of [-1, 1]) { const cp = new THREE.Mesh(capGeo, capMat); cp.scale.set(s * 1.1, 1, s * 1.1); cp.position.y = dy * s * 1.25; g.add(cp); }
    return g;
  };
  const wireMat = new THREE.LineBasicMaterial({ color: 0x2a1d24 });
  for (let k = 0; k < 5; k++) {                                                              // 5 dây ngang trần, võng xuống
    const z = HALL_FRONT + 5 + k * (HALL_D * 0.5) / 4, yTop = HALL_H - 1.5, sag = 2.4, pts = [];   // chỉ nửa trước rạp, treo cao → không che camera khán giả
    for (let i = 0; i <= 40; i++) { const t = i / 40, xx = -HALL_X + 0.5 + t * (HALL_X * 2 - 1); pts.push(new THREE.Vector3(xx, yTop - sag * 4 * t * (1 - t), z)); }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
    for (let i = 2; i < 40; i += 3) lantern(scene, pts[i].x, pts[i].y - 0.55, z, 0.38, [LR, LW, LP][(i + k) % 3]);
  }

  // ---------- cột sơn mài đỏ + đèn lồng lớn dọc tường ----------
  const red = c.smat(0xb82632, { roughness: 0.35, metalness: 0.15 }), gold = c.smat(0xd9a441, { metalness: 0.8, roughness: 0.3 });
  for (const sx of [-1, 1]) for (let z = HALL_FRONT + 3, i = 0; z < HALL_BACK - 1; z += 6.5, i++) {
    const x0 = sx * (HALL_X - 0.6);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, HALL_H, 16), red); col.position.set(x0, HALL_H / 2, z); scene.add(col);
    for (const y of [floorY(z, x0) + 0.3, HALL_H - 1.2]) { const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.4, 16), gold); ring.position.set(x0, y, z); scene.add(ring); }
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.12), capMat); arm.position.set(x0 - sx * 0.8, floorY(z, x0) + 10, z); scene.add(arm);
    lantern(scene, x0 - sx * 1.5, floorY(z, x0) + 8.8, z, 0.7, i % 2 ? LW : LR);
    const gl = glowPlane(c, 4, 4, 0xff9a6a, 0.45); onWall(c, gl, sx, floorY(z, x0) + 8.8, z, 0.15);
  }

  // ---------- cổng torii ôm màn chiếu ----------
  {
    const px = SCR_W / 2 + 0.9, topY = SCR_Y + SCR_H / 2;
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, topY + 2.8 - STAGE_H, 20), red); p.position.set(sx * px, STAGE_H + (topY + 2.8 - STAGE_H) / 2, SCR_Z + 0.4); scene.add(p);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.8, 20), capMat); base.position.set(sx * px, STAGE_H + 0.4, SCR_Z + 0.4); scene.add(base);
    }
    const nuki = new THREE.Mesh(new THREE.BoxGeometry(SCR_W + 4.5, 0.7, 0.6), red); nuki.position.set(0, topY + 1.3, SCR_Z + 0.4); scene.add(nuki);
    const kasagi = new THREE.Mesh(new THREE.BoxGeometry(SCR_W + 8, 0.9, 1.0), red); kasagi.position.set(0, topY + 3.0, SCR_Z + 0.4); scene.add(kasagi);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(SCR_W + 9, 0.35, 1.3), capMat); roof.position.set(0, topY + 3.6, SCR_Z + 0.4); scene.add(roof);
    for (const sx of [-1, 1]) { const tip = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 1.3), capMat); tip.position.set(sx * (SCR_W / 2 + 4.9), topY + 3.85, SCR_Z + 0.4); tip.rotation.z = sx * 0.28; scene.add(tip); }
    const plaque = canvasTex(THREE, 256, 384, (x, w, h) => { x.fillStyle = '#1a1214'; x.fillRect(0, 0, w, h); x.strokeStyle = '#d9a441'; x.lineWidth = 10; x.strokeRect(10, 10, w - 20, h - 20); x.fillStyle = '#ffd36b'; x.font = '800 92px system-ui, sans-serif'; x.textAlign = 'center'; x.fillText('X', w / 2, 140); x.fillText('C', w / 2, 230); x.font = '700 60px system-ui, sans-serif'; x.fillText('VN', w / 2, 320); });
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.1), new THREE.MeshBasicMaterial({ map: plaque })); pl.position.set(0, topY + 2.15, SCR_Z + 0.95); scene.add(pl);
  }

  // ---------- cây anh đào hai bên sân khấu ----------
  const pinkA = new THREE.MeshToonMaterial({ color: 0xffb7d5, emissive: 0x5a1f3a }), pinkB = new THREE.MeshToonMaterial({ color: 0xff9cc6, emissive: 0x4a1530 }), pinkC = new THREE.MeshToonMaterial({ color: 0xffe0ee, emissive: 0x5a2a40 });
  const bark = c.smat(0x4a2c2a, { roughness: 0.9 });
  const tree = (x, y, z, s) => {
    const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s); scene.add(g);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 5, 10), bark); trunk.position.y = 2.5; trunk.rotation.z = 0.08; g.add(trunk);
    for (const [a, l] of [[0.7, 3], [-0.6, 2.8], [0.1, 2.6]]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.25, l, 8), bark); b.position.set(Math.sin(a) * l / 2, 5 + Math.cos(a) * l / 2 - 0.3, 0); b.rotation.z = -a; g.add(b); }
    const geo = new THREE.IcosahedronGeometry(1, 1);
    for (let i = 0; i < 30; i++) {
      const a = R() * Math.PI * 2, r = R() * 2.6, m = new THREE.Mesh(geo, [pinkA, pinkB, pinkC][i % 3]);
      m.position.set(Math.cos(a) * r, 6 + R() * 2.6 - r * 0.25, Math.sin(a) * r * 0.8); m.scale.setScalar(0.9 + R() * 0.9); g.add(m);
    }
    const under = glowPlane(c, 9, 9, 0xff8fc0, 0.3); under.position.y = 0.05; under.rotation.x = -Math.PI / 2; g.add(under);
    return g;
  };
  for (const sx of [-1, 1]) tree(sx * (SCR_W / 2 + 4.2), STAGE_H,   // đủ xa mép màn để tán cây không che hình
    (STAGE_Z0 + STAGE_Z1) / 2 + 0.6, 1.35);
  if (TOP_H > 0) for (const sx of [-1, 1]) tree(sx * (HALL_X - 4), TOP_H, LAND_Z0 + 8, 1.1);

  // ---------- cánh hoa rơi ----------
  {
    const N = 520, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), cols = [0xffc4dc, 0xff9cc6, 0xfff0f6].map((h) => new THREE.Color(h));
    const spd = new Float32Array(N), ph = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos.set([(R() * 2 - 1) * (HALL_X - 1), R() * HALL_H, HALL_FRONT + R() * HALL_D], i * 3); col.set(cols[i % 3].toArray(), i * 3); spd[i] = 0.7 + R() * 1.1; ph[i] = R() * 6.28; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const petalTex = canvasTex(THREE, 64, 64, (x) => { x.fillStyle = '#fff'; x.beginPath(); x.ellipse(32, 32, 26, 14, 0.6, 0, Math.PI * 2); x.fill(); });
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.34, map: petalTex, vertexColors: true, transparent: true, alphaTest: 0.3, depthWrite: false }));
    pts.frustumCulled = false; scene.add(pts);
    pts.userData.update = (dt) => {
      const a = geo.attributes.position.array, t = performance.now() / 1000;
      for (let i = 0; i < N; i++) {
        a[i * 3 + 1] -= dt * spd[i]; a[i * 3] += Math.sin(t * 0.9 + ph[i]) * dt * 0.6; a[i * 3 + 2] += Math.cos(t * 0.7 + ph[i]) * dt * 0.25;
        if (a[i * 3 + 1] < 0) { a[i * 3 + 1] = HALL_H - 1; a[i * 3] = (Math.random() * 2 - 1) * (HALL_X - 1); }
      }
      geo.attributes.position.needsUpdate = true;
    };
    c.SPIN.push(pts);
  }

  // ---------- ánh sáng ----------
  for (const [x, z, col] of [[-HALL_X + 4, HALL_FRONT + 6, 0xff8fc0], [HALL_X - 4, HALL_FRONT + 6, 0xffb08a], [-HALL_X + 4, HALL_ZC + 8, 0xffb08a], [HALL_X - 4, HALL_ZC + 8, 0xff8fc0]]) {
    const l = new THREE.PointLight(col, 70, 30, 1.8); l.position.set(x, 15, z); scene.add(l);
  }
  return { speakers: false };
}
