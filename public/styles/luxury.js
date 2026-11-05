// Phong cách SANG TRỌNG: tường ốp gỗ nan + vải tối viền vàng, nẹp LED hổ phách, trần gỗ có vòm tròn phát sáng + logo play,
// bảng logo XCVN + chữ viết tay hai bên tường, rèm nhung cạnh màn, chậu cây hai góc sân khấu, đèn hắt tường.
import { canvasTex, glowPlane, onWall, rng, fontReady, loadImg } from './kit.js';

export default async function luxury(c) {
  const { THREE, scene, HALL_X, HALL_H, HALL_FRONT, HALL_BACK, HALL_D, HALL_ZC, SCR_W, STAGE_H, STAGE_Z1, floorY } = c;
  const R = rng(7);
  const AMBER = '#ffb347', AMBER_CORE = '#fff0d0';

  // ---------- tường: 1 ô 6.3 m = nan gỗ | LED | vải tối có đường vàng (lặp dọc tường) ----------
  const UNIT = 6.3, TW = 512, TH = 2048;
  const wood = (x, x0, x1) => {
    const g = x.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, '#5b3b22'); g.addColorStop(0.5, '#6e4829'); g.addColorStop(1, '#4a2f1b');
    x.fillStyle = g; x.fillRect(x0, 0, x1 - x0, TH);
    for (let sx = x0; sx < x1; sx += 20) { x.fillStyle = '#1a0f08'; x.fillRect(sx, 0, 4, TH); }                    // khe giữa các nan
    x.globalAlpha = 0.18;
    for (let i = 0; i < 260; i++) { x.strokeStyle = R() < 0.5 ? '#2c1a0e' : '#8a5e37'; x.lineWidth = 1; const px = x0 + R() * (x1 - x0); x.beginPath(); x.moveTo(px, R() * TH); x.lineTo(px + (R() - 0.5) * 3, R() * TH); x.stroke(); }
    x.globalAlpha = 1;
  };
  const fabric = (x, x0, x1) => {
    x.fillStyle = '#1a1817'; x.fillRect(x0, 0, x1 - x0, TH);
    x.globalAlpha = 0.07; for (let i = 0; i < 3000; i++) { x.fillStyle = R() < 0.5 ? '#000' : '#fff'; x.fillRect(x0 + R() * (x1 - x0), R() * TH, 1.5, 1.5); } x.globalAlpha = 1;
    x.save(); x.beginPath(); x.rect(x0, 0, x1 - x0, TH); x.clip();                                              // các đường vàng uốn lượn
    for (let k = 0; k < 4; k++) {
      x.strokeStyle = `rgba(232,180,94,${0.18 + k * 0.06})`; x.lineWidth = 1.5 + k * 0.6; x.shadowColor = '#e8b45e'; x.shadowBlur = 6;
      x.beginPath();
      for (let y = TH * 0.45; y <= TH * 0.95; y += 8) { const px = x0 + (x1 - x0) * (0.15 + 0.7 * ((y - TH * 0.45) / (TH * 0.5))) + Math.sin(y / 90 + k) * 30; y === TH * 0.45 ? x.moveTo(px, y) : x.lineTo(px, y); }
      x.stroke();
    }
    x.restore();
  };
  const led = (x, x0, x1) => {
    const g = x.createLinearGradient(x0 - 8, 0, x1 + 8, 0);
    g.addColorStop(0, 'rgba(255,179,71,0)'); g.addColorStop(0.4, AMBER); g.addColorStop(0.5, AMBER_CORE); g.addColorStop(0.6, AMBER); g.addColorStop(1, 'rgba(255,179,71,0)');
    x.fillStyle = g; x.fillRect(x0 - 8, 0, x1 - x0 + 16, TH);
  };
  const layout = (x, emissiveOnly) => {
    if (!emissiveOnly) { wood(x, 0, TW * 0.3); fabric(x, TW * 0.33, TW); x.fillStyle = '#0c0a09'; x.fillRect(TW * 0.3, 0, TW * 0.03, TH); }
    else { x.fillStyle = '#000'; x.fillRect(0, 0, TW, TH); }
    led(x, TW * 0.31, TW * 0.32);
  };
  const wallMap = canvasTex(THREE, TW, TH, (x) => layout(x, false), { repeat: [1, 1] });
  const wallEm = canvasTex(THREE, TW, TH, (x) => layout(x, true), { repeat: [1, 1] });
  const wallMat = (len) => {
    const m = wallMap.clone(), e = wallEm.clone(); m.needsUpdate = e.needsUpdate = true;
    m.repeat.set(len / UNIT, 1); e.repeat.set(len / UNIT, 1);
    return new THREE.MeshStandardMaterial({ map: m, emissiveMap: e, emissive: 0xffffff, emissiveIntensity: 1.1, roughness: 0.82, metalness: 0.05 });
  };
  const sideMat = wallMat(HALL_D);
  for (const sx of [-1, 1]) onWall(c, new THREE.Mesh(new THREE.PlaneGeometry(HALL_D, HALL_H), sideMat), sx, HALL_H / 2, HALL_ZC, 0.05);
  { const m = new THREE.Mesh(new THREE.PlaneGeometry(HALL_X * 2, HALL_H), wallMat(HALL_X * 2)); m.position.set(0, HALL_H / 2, HALL_BACK - 0.05); m.rotation.y = Math.PI; scene.add(m); }

  // ---------- rèm nhung 2 bên màn (tường trước) ----------
  {
    const t = canvasTex(THREE, 512, 64, (x, w) => { for (let i = 0; i < w; i++) { const v = 0.5 + 0.5 * Math.sin(i / 512 * Math.PI * 2 * 9); const k = Math.round(14 + v * 26); x.fillStyle = `rgb(${k + 4},${k},${k - 2})`; x.fillRect(i, 0, 1, 64); } });
    const wCur = HALL_X - SCR_W / 2 - 0.3;
    for (const sx of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(wCur, HALL_H), new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }));
      m.position.set(sx * (SCR_W / 2 + 0.3 + wCur / 2), HALL_H / 2, HALL_FRONT + 0.08); scene.add(m);
    }
  }

  // ---------- bảng logo + chữ viết tay (2 bên tường, gần màn) ----------
  await fontReady('700 120px "Dancing Script"');
  const logo = await loadImg('/icons/icon-512.png');
  const PW = 4.6, PH = 13, cw = 512, ch = Math.round(512 * PH / PW);
  const panelBg = (x) => {
    x.fillStyle = '#141312'; x.fillRect(0, 0, cw, ch);
    x.strokeStyle = 'rgba(232,180,94,.55)'; x.lineWidth = 3; x.strokeRect(10, 10, cw - 20, ch - 20);
    for (let k = 0; k < 5; k++) {                                                                                // sóng vàng dưới đáy
      x.strokeStyle = `rgba(232,180,94,${0.12 + k * 0.07})`; x.lineWidth = 2; x.shadowColor = '#e8b45e'; x.shadowBlur = 8; x.beginPath();
      for (let px = 0; px <= cw; px += 6) { const py = ch * 0.78 + k * 26 + Math.sin(px / 70 + k * 0.8) * 34 - px * 0.12; px ? x.lineTo(px, py) : x.moveTo(px, py); }
      x.stroke();
    }
    x.shadowBlur = 0;
  };
  const logoTex = canvasTex(THREE, cw, ch, (x) => {
    panelBg(x);
    if (logo) { const s = 380; x.drawImage(logo, (cw - s) / 2, ch * 0.18, s, s); }
    x.fillStyle = '#e8c27a'; x.font = '600 34px system-ui, "Segoe UI", sans-serif'; x.textAlign = 'center'; x.fillText('XEM CÙNG NHAU', cw / 2, ch * 0.18 + 450);
  });
  const scriptTex = (lines) => canvasTex(THREE, cw, ch, (x) => {
    panelBg(x);
    x.fillStyle = '#f4e6cc'; x.textAlign = 'center'; x.font = '700 104px "Dancing Script", cursive'; x.shadowColor = 'rgba(255,190,110,.6)'; x.shadowBlur = 12;
    lines.forEach((l, i) => x.fillText(l, cw / 2, ch * 0.24 + i * 130));
    x.strokeStyle = '#e8b45e'; x.lineWidth = 4; x.beginPath(); x.moveTo(cw * 0.3, ch * 0.24 + lines.length * 130 - 40); x.quadraticCurveTo(cw * 0.55, ch * 0.24 + lines.length * 130 - 10, cw * 0.72, ch * 0.24 + lines.length * 130 - 60); x.stroke();
  });
  const panelMat = (t) => new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.7 });
  const zLogo = HALL_FRONT + 10, zText = HALL_FRONT + 16.5;
  const PANELS = [];
  for (const sx of [-1, 1]) {
    onWall(c, new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), panelMat(logoTex)), sx, floorY(zLogo) + PH / 2 + 1.6, zLogo, 0.22);
    onWall(c, new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), panelMat(scriptTex(sx < 0 ? ['Không', 'chỉ là', 'xem'] : ['Mà là', 'cùng', 'nhau']))), sx, floorY(zText) + PH / 2 + 1.6, zText, 0.22);
    for (const z of [zLogo, zText]) {                                                                            // viền LED quanh bảng
      const fr = new THREE.Mesh(new THREE.BoxGeometry(0.06, PH + 0.3, PW + 0.3), c.accA); fr.position.set(sx * (c.HALL_X - 0.1), floorY(z) + PH / 2 + 1.6, z); scene.add(fr);
      PANELS.push(z);
    }
  }

  // ---------- đèn hắt tường (sconce) ----------
  for (const sx of [-1, 1]) for (let z = HALL_FRONT + 4; z < HALL_BACK - 2; z += 4.2) {
    if (PANELS.some((pz) => Math.abs(pz - z) < 3.2)) continue;
    const y = floorY(z, sx * (HALL_X - 1)) + 7;
    c.rb(0.3, 0.9, 0.34, 0x2e2216, sx * (HALL_X - 0.25), y, z, scene, 0.06, { metalness: 0.7, roughness: 0.35 });
    for (const dy of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.04, 0.36), c.glow(0xffe2b0)); cap.position.set(sx * (HALL_X - 0.25), y + dy * 0.47, z); scene.add(cap);
      onWall(c, glowPlane(c, 1.5, 4.2, 0xffa94a, 0.75), sx, y + dy * 2.2, z, 0.2);
    }
  }

  // ---------- trần gỗ nan + vòm tròn phát sáng có logo play ----------
  {
    const t = canvasTex(THREE, 64, 512, (x, w, h) => { x.fillStyle = '#3a2717'; x.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 16) { x.fillStyle = '#120a05'; x.fillRect(0, y, w, 4); x.fillStyle = 'rgba(120,80,45,.35)'; x.fillRect(0, y + 6, w, 2); } }, { repeat: [HALL_X / 2, HALL_D / 8] });
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(HALL_X * 2, HALL_D), new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }));
    ceil.position.set(0, HALL_H - 0.08, HALL_ZC); ceil.rotation.x = Math.PI / 2; scene.add(ceil);
    const cz = HALL_FRONT + 15, cy = HALL_H - 0.3;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(12, 64), new THREE.MeshStandardMaterial({ color: 0x0e0a07, roughness: 0.6 })); disc.position.set(0, cy + 0.1, cz); disc.rotation.x = Math.PI / 2; scene.add(disc);
    const ringMat = c.glow(0xffc07a); c.PARTY_TINT.push(ringMat);
    for (const [r, tube] of [[11.4, 0.16], [8.4, 0.13], [5.4, 0.11]]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, 96), ringMat); ring.position.set(0, cy, cz); ring.rotation.x = Math.PI / 2; scene.add(ring);
      const halo = glowPlane(c, r * 2.5, r * 2.5, 0xffa94a, 0.18); halo.position.set(0, cy - 0.05, cz); halo.rotation.x = Math.PI / 2; scene.add(halo);
    }
    const tri = new THREE.Shape(); tri.moveTo(-1.3, -1.6); tri.lineTo(-1.3, 1.6); tri.lineTo(1.7, 0); tri.closePath();
    const play = new THREE.Mesh(new THREE.ShapeGeometry(tri), c.glow(0xffb347)); play.position.set(0, cy - 0.05, cz); play.rotation.set(Math.PI / 2, 0, Math.PI / 2); scene.add(play);
    // đèn âm trần
    const dl = new THREE.CircleGeometry(0.22, 16), dlm = c.glow(0xfff1da);
    for (const x of [-HALL_X + 3, -HALL_X + 7.5, HALL_X - 7.5, HALL_X - 3]) for (let z = HALL_FRONT + 3; z < HALL_BACK - 2; z += 4.5) {
      if (Math.hypot(x, z - cz) < 13) continue;
      const m = new THREE.Mesh(dl, dlm); m.position.set(x, HALL_H - 0.12, z); m.rotation.x = Math.PI / 2; scene.add(m);
    }
    for (const sx of [-1, 1]) { const cove = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, HALL_D - 1), c.accA); cove.position.set(sx * (HALL_X - 0.4), HALL_H - 0.9, HALL_ZC); scene.add(cove); }
  }

  // ---------- chậu cây 2 góc sân khấu ----------
  const leafA = new THREE.MeshToonMaterial({ color: 0x2f6b34 }), leafB = new THREE.MeshToonMaterial({ color: 0x3f8a45 });
  for (const sx of [-1, 1]) {
    const g = new THREE.Group(); g.position.set(sx * (SCR_W / 2 - 1.2), STAGE_H, STAGE_Z1 - 0.9); scene.add(g);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.42, 1.0, 20), c.smat(0x1c1a19, { metalness: 0.5, roughness: 0.35 })); pot.position.y = 0.5; g.add(pot);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.04, 6, 24), c.smat(0xc9a24a, { metalness: 0.8, roughness: 0.3 })); rim.position.y = 1.0; rim.rotation.x = Math.PI / 2; g.add(rim);
    for (let i = 0; i < 16; i++) {
      const a = R() * Math.PI * 2, r = 0.15 + R() * 0.5, h = 1.1 + R() * 1.9;
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.28 + R() * 0.25, 8, 6), i % 2 ? leafA : leafB);
      leaf.position.set(Math.cos(a) * r, h, Math.sin(a) * r); leaf.scale.set(0.7, 1.5, 0.35); leaf.rotation.set(R() - 0.5, a, (R() - 0.5) * 1.2); g.add(leaf);
    }
    const up = glowPlane(c, 2.2, 2.2, 0xffb35a, 0.5); up.position.set(0, 0.04, 0); up.rotation.x = -Math.PI / 2; g.add(up);
  }

  // ---------- ánh sáng ấm ----------
  for (const [x, z] of [[-HALL_X + 4, HALL_FRONT + 8], [HALL_X - 4, HALL_FRONT + 8], [-HALL_X + 4, HALL_ZC + 8], [HALL_X - 4, HALL_ZC + 8]]) {
    const l = new THREE.PointLight(0xffb36a, 70, 28, 1.8); l.position.set(x, 14, z); scene.add(l);
  }
  return { cab: 0x121110, metal: 0x2c2620 };
}
