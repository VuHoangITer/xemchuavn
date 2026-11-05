// Đồ nghề dùng chung cho các phong cách rạp (public/styles/*.js)
// Mỗi phong cách là 1 module: export default async function (c) { ...dựng trang trí...; return { speakers, cab, metal } }
// c = ngữ cảnh do app.js truyền vào: THREE, scene, kích thước rạp (HALL_*, SCR_*, STAGE_*), hàm dựng khối (rb, box, smat...), bảng màu CS.

// vẽ canvas → texture
export function canvasTex(THREE, w, h, draw, o = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (o.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(o.repeat[0], o.repeat[1]); }
  return t;
}

// đốm sáng tròn mờ (dùng cho quầng đèn, ánh hắt lên tường)
let _glow = null;
export function glowTex(THREE) {
  if (_glow) return _glow;
  _glow = canvasTex(THREE, 128, 128, (x) => {
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  });
  return _glow;
}
// mặt phẳng phát sáng cộng màu (không che video vì không ghi alpha)
export function glowPlane(c, w, h, color, opacity = 0.8) {
  const { THREE } = c;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: glowTex(THREE), color, opacity, ...c.ADD }));
}

// số ngẫu nhiên cố định theo seed (mọi người thấy giống nhau)
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// đặt 1 mặt phẳng áp sát tường bên (sx = -1 trái, 1 phải), quay mặt vào trong rạp
export function onWall(c, mesh, sx, y, z, inset = 0.06) {
  mesh.position.set(sx * (c.HALL_X - inset), y, z);
  mesh.rotation.y = -sx * Math.PI / 2;
  c.scene.add(mesh); return mesh;
}

// chờ font web tải xong trước khi vẽ chữ lên canvas
export async function fontReady(spec) {
  try { await Promise.race([document.fonts.load(spec), new Promise((r) => setTimeout(r, 2500))]); } catch {}
}

// tải ảnh (logo...) → Promise<HTMLImageElement | null>
export function loadImg(src) {
  return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
}
