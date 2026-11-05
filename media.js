// Nhận diện mọi loại link video → mô tả nguồn phát mà trình duyệt điều khiển được (đồng bộ cả phòng).
// Nguồn hỗ trợ: YouTube, Vimeo, Dailymotion, Twitch (VOD + kênh live), SoundCloud, file video/âm thanh trực tiếp, luồng HLS (.m3u8),
// và trang web bất kỳ có CÔNG KHAI video để nhúng (thẻ og:video, oEmbed, JSON-LD VideoObject, thẻ <video>).
// Không chạy JavaScript của trang, không vượt qua chặn / khoá bản quyền: trang không công khai video thì báo lỗi.
'use strict';
const dns = require('dns').promises;
const net = require('net');

const UA = 'Mozilla/5.0 (compatible; RapChungBot/1.0; +https://localhost)';
const FILE_EXT = /\.(mp4|m4v|webm|ogv|ogg|mov|mp3|m4a|aac|wav|flac|opus)(?:$|[?#])/i;
const HLS_EXT = /\.m3u8(?:$|[?#])/i;
class LinkError extends Error {}

// ---------- chặn link trỏ vào mạng nội bộ (SSRF) ----------
function privateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const s = ip.toLowerCase();
  if (s.startsWith('::ffff:')) return privateIp(s.slice(7));
  return s === '::1' || s === '::' || s.startsWith('fc') || s.startsWith('fd') || s.startsWith('fe8') || s.startsWith('fe9') || s.startsWith('fea') || s.startsWith('feb');
}
async function assertPublic(u) {
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new LinkError('Chỉ nhận link http / https');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new LinkError('Không nhận link trong mạng nội bộ');
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }).catch(() => { throw new LinkError('Không tìm thấy trang này'); });
  if (!addrs.length || addrs.some((x) => privateIp(x.address))) throw new LinkError('Không nhận link trong mạng nội bộ');
}
// tải có giới hạn: tự theo chuyển hướng (kiểm tra từng bước), tối đa maxBytes
async function safeFetch(url, { maxBytes = 1_500_000, accept = 'text/html,application/json;q=0.9,*/*;q=0.5', head = false } = {}) {
  let u = new URL(url);
  for (let hop = 0; hop < 5; hop++) {
    await assertPublic(u);
    const r = await fetch(u, { redirect: 'manual', method: head ? 'GET' : 'GET', headers: { 'user-agent': UA, accept, 'accept-language': 'vi,en;q=0.8' }, signal: AbortSignal.timeout(7000) });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { u = new URL(r.headers.get('location'), u); continue; }
    const type = (r.headers.get('content-type') || '').toLowerCase();
    if (head || /^(video|audio)\//.test(type) || type.includes('mpegurl')) { try { r.body && r.body.cancel(); } catch {} return { ok: r.ok, status: r.status, url: u.href, type, text: '' }; }
    let text = '', size = 0; const dec = new TextDecoder();
    if (r.body) for await (const chunk of r.body) { size += chunk.length; text += dec.decode(chunk, { stream: true }); if (size > maxBytes) break; }
    return { ok: r.ok, status: r.status, url: u.href, type, text };
  }
  throw new LinkError('Trang chuyển hướng quá nhiều lần');
}
async function oembedTitle(endpoint) {
  try { const r = await safeFetch(endpoint, { maxBytes: 200_000, accept: 'application/json' }); if (!r.ok) return null; const j = JSON.parse(r.text); return typeof j.title === 'string' ? j.title.slice(0, 150) : null; } catch { return null; }
}
const fileName = (u) => { try { const p = decodeURIComponent(new URL(u).pathname.split('/').pop() || ''); return p.slice(0, 120) || 'Video'; } catch { return 'Video'; } };

// ---------- nhận diện các nguồn quen thuộc (không cần tải trang) ----------
const TWITCH_RESERVED = new Set(['directory', 'videos', 'p', 'settings', 'search', 'downloads', 'jobs', 'turbo', 'prime', 'friends', 'subscriptions', 'inventory', 'wallet']);
function known(input) {
  let u; try { u = new URL(input); } catch { return null; }
  const host = u.hostname.replace(/^(www|m)\./, '');
  const path = u.pathname;
  let m;
  // YouTube
  if (host === 'youtu.be') { const id = path.slice(1).split('/')[0]; if (/^[\w-]{11}$/.test(id)) return { src: 'yt', vid: id }; }
  if (host === 'youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
    const id = path === '/watch' ? u.searchParams.get('v') : (path.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/) || [])[1];
    if (id && /^[\w-]{11}$/.test(id)) return { src: 'yt', vid: id };
  }
  // Vimeo (kể cả link không công khai dạng vimeo.com/ID/HASH)
  if (host === 'vimeo.com' && (m = path.match(/^\/(?:channels\/[\w-]+\/|groups\/[\w-]+\/videos\/|video\/)?(\d+)(?:\/([0-9a-f]{6,}))?/))) return { src: 'vimeo', vid: m[1], h: m[2] || u.searchParams.get('h') || null };
  if (host === 'player.vimeo.com' && (m = path.match(/^\/video\/(\d+)/))) return { src: 'vimeo', vid: m[1], h: u.searchParams.get('h') || null };
  // Dailymotion
  if ((host === 'dailymotion.com' || host === 'geo.dailymotion.com') && (m = path.match(/\/(?:embed\/)?video\/(x[0-9a-z]+)/i))) return { src: 'dm', vid: m[1] };
  if (host === 'dai.ly' && (m = path.match(/^\/(x[0-9a-z]+)/i))) return { src: 'dm', vid: m[1] };
  // Twitch: video đã phát (VOD) hoặc kênh đang live
  if (host === 'twitch.tv' && (m = path.match(/^\/videos\/(\d+)/))) return { src: 'twitch', kind: 'video', vid: m[1] };
  if (host === 'twitch.tv' && (m = path.match(/^\/([a-z0-9_]{3,25})\/?$/i)) && !TWITCH_RESERVED.has(m[1].toLowerCase())) return { src: 'twitch', kind: 'channel', vid: m[1].toLowerCase(), live: true };
  if (host === 'player.twitch.tv') { const v = u.searchParams.get('video'), c = u.searchParams.get('channel'); if (v) return { src: 'twitch', kind: 'video', vid: v.replace(/^v/, '') }; if (c) return { src: 'twitch', kind: 'channel', vid: c.toLowerCase(), live: true }; }
  if (host === 'clips.twitch.tv' || (host === 'twitch.tv' && path.includes('/clip/'))) throw new LinkError('Clip Twitch không điều khiển được — hãy dùng link video (twitch.tv/videos/...) hoặc link kênh');
  // SoundCloud
  if ((host === 'soundcloud.com' || host === 'on.soundcloud.com') && path.split('/').filter(Boolean).length >= 1) return { src: 'sc', url: u.href.split('?')[0] };
  // file trực tiếp / HLS
  if (HLS_EXT.test(path)) return { src: 'hls', url: u.href };
  if (FILE_EXT.test(path)) return { src: 'file', url: u.href };
  // các web có khoá bản quyền: báo rõ, không thử
  if (/(^|\.)(netflix\.com|disneyplus\.com|primevideo\.com|max\.com|hbomax\.com|fptplay\.vn|vieon\.vn|tv360\.vn|galaxyplay\.vn|iq\.com|wetv\.vip|tiktok\.com|instagram\.com)$/.test(host))
    throw new LinkError('Web này có khoá bản quyền hoặc không cho nhúng điều khiển — không phát chung được');
  return null;
}
async function titleFor(item, input) {
  switch (item.src) {
    case 'yt': return (await oembedTitle('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + item.vid))) || 'YouTube ' + item.vid;
    case 'vimeo': return (await oembedTitle('https://vimeo.com/api/oembed.json?url=' + encodeURIComponent('https://vimeo.com/' + item.vid + (item.h ? '/' + item.h : '')))) || 'Vimeo ' + item.vid;
    case 'dm': return (await oembedTitle('https://www.dailymotion.com/services/oembed?format=json&url=' + encodeURIComponent('https://www.dailymotion.com/video/' + item.vid))) || 'Dailymotion ' + item.vid;
    case 'sc': return (await oembedTitle('https://soundcloud.com/oembed?format=json&url=' + encodeURIComponent(item.url))) || 'SoundCloud';
    case 'twitch': return item.kind === 'channel' ? 'Twitch live · ' + item.vid : 'Twitch VOD ' + item.vid;
    default: return fileName(item.url || input);
  }
}

// ---------- trang bất kỳ: đọc video được trang CÔNG KHAI để nhúng ----------
const attr = (tag, name) => { const m = tag.match(new RegExp('\\b' + name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i')); return m ? (m[2] ?? m[3] ?? m[4] ?? '').replace(/&amp;/g, '&').trim() : null; };
function metaMap(html) {
  const map = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const k = (attr(tag, 'property') || attr(tag, 'name') || '').toLowerCase(), v = attr(tag, 'content');
    if (k && v && !(k in map)) map[k] = v;
  }
  return map;
}
function fromCandidate(raw, base, typeHint = '') {
  if (!raw) return null;
  let abs; try { abs = new URL(raw, base).href; } catch { return null; }
  const k = known(abs); if (k) return k;
  if (/mpegurl/i.test(typeHint)) return { src: 'hls', url: abs };
  if (/^(video|audio)\//i.test(typeHint)) return { src: 'file', url: abs };
  return null;
}
async function fromPage(input) {
  const page = await safeFetch(input);
  if (/^(video|audio)\//.test(page.type)) return { item: { src: 'file', url: page.url }, title: fileName(page.url) };
  if (page.type.includes('mpegurl')) return { item: { src: 'hls', url: page.url }, title: fileName(page.url) };
  if (!page.ok) throw new LinkError('Không mở được trang (lỗi ' + page.status + ')');
  const html = page.text, meta = metaMap(html), base = page.url;
  const title = (meta['og:title'] || meta['twitter:title'] || (html.match(/<title[^>]*>([^<]{1,200})<\/title>/i) || [])[1] || '').replace(/\s+/g, ' ').trim().slice(0, 150);
  const cands = [];
  // 1. thẻ Open Graph / Twitter
  for (const k of ['og:video:secure_url', 'og:video:url', 'og:video', 'twitter:player:stream', 'twitter:player']) if (meta[k]) cands.push([meta[k], meta['og:video:type'] || meta['twitter:player:stream:content_type'] || '']);
  // 2. JSON-LD VideoObject
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const walk = (o) => { if (!o || typeof o !== 'object') return; if (Array.isArray(o)) return o.forEach(walk); const t = [].concat(o['@type'] || []); if (t.includes('VideoObject')) { if (o.contentUrl) cands.push([o.contentUrl, o.encodingFormat || '']); if (o.embedUrl) cands.push([o.embedUrl, '']); } Object.values(o).forEach((v) => typeof v === 'object' && walk(v)); };
      walk(JSON.parse(m[1]));
    } catch {}
  }
  // 3. thẻ <video> / <source> / iframe nhúng sẵn của các nguồn quen thuộc
  for (const tag of html.match(/<(?:video|source)\b[^>]*>/gi) || []) { const s = attr(tag, 'src'); if (s) cands.push([s, attr(tag, 'type') || '']); }
  for (const tag of html.match(/<iframe\b[^>]*>/gi) || []) { const s = attr(tag, 'src') || attr(tag, 'data-src'); if (s) cands.push([s, '']); }
  for (const [raw, type] of cands) { const it = fromCandidate(raw, base, type); if (it) return { item: it, title }; }
  // 4. oEmbed do trang khai báo
  const link = (html.match(/<link\b[^>]*application\/json\+oembed[^>]*>/i) || [])[0];
  const href = link && attr(link, 'href');
  if (href) {
    try {
      const o = JSON.parse((await safeFetch(new URL(href, base).href, { maxBytes: 300_000, accept: 'application/json' })).text);
      const src = o && typeof o.html === 'string' && attr((o.html.match(/<iframe\b[^>]*>/i) || [''])[0], 'src');
      const it = fromCandidate(src, base); if (it) return { item: it, title: (o.title || title || '').slice(0, 150) };
    } catch {}
  }
  throw new LinkError('Trang này không công khai video để nhúng — hãy dán link YouTube / Vimeo / Dailymotion / Twitch / SoundCloud hoặc link file .mp4 / .m3u8');
}

// Đầu vào: chuỗi người dùng dán. Đầu ra: { src, vid?, url?, h?, kind?, live?, title }
async function resolveLink(input) {
  if (typeof input !== 'string') throw new LinkError('Link không hợp lệ');
  let s = input.trim().slice(0, 2000);
  if (/^[\w-]{11}$/.test(s)) s = 'https://youtu.be/' + s;                 // dán mỗi ID YouTube
  if (!/^https?:\/\//i.test(s) && /^[\w.-]+\.[a-z]{2,}\//i.test(s)) s = 'https://' + s;
  let u; try { u = new URL(s); } catch { throw new LinkError('Link không hợp lệ'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new LinkError('Chỉ nhận link http / https');
  const k = known(u.href);
  if (k) { if (k.src === 'file' || k.src === 'hls') await assertPublic(new URL(k.url)); return { ...k, title: await titleFor(k, u.href) }; }
  const { item, title } = await fromPage(u.href);
  return { ...item, title: title || (await titleFor(item, u.href)) };
}

module.exports = { resolveLink, LinkError };
