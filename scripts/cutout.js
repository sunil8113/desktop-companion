// Removes a plain white/light background from line art (e.g. a comic character with black
// outlines) and crops to the character. Usage: npm run cutout -- input.png output.png
// White-background removal for line art: flood-fill near-white from the image edges,
// soften the boundary, drop small stray blobs, crop to the character.
const { decode, encode } = require('./png.js');
const [src, out] = process.argv.slice(2);
const img = decode(src); const { w, h, px } = img;
const idx = (x, y) => y * w + x;
const isBg = (i) => { const r = px[i*4], g = px[i*4+1], b = px[i*4+2]; const mn = Math.min(r,g,b), mx = Math.max(r,g,b); return mn > 140 && mx - mn < 75; };

// 1. flood fill background from every edge pixel
const bg = new Uint8Array(w * h); const stack = [];
for (let x = 0; x < w; x++) { stack.push(idx(x,0), idx(x,h-1)); } for (let y = 0; y < h; y++) { stack.push(idx(0,y), idx(w-1,y)); }
while (stack.length) { const i = stack.pop(); if (bg[i] || !isBg(i)) continue; bg[i] = 1; const x = i % w, y = (i - x) / w;
  if (x > 0) stack.push(i-1); if (x < w-1) stack.push(i+1); if (y > 0) stack.push(i-w); if (y < h-1) stack.push(i+w); }

// 2. alpha: background -> 0; pixels touching background get alpha from how un-white they are, then un-blend from white
const alpha = new Float32Array(w * h);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = idx(x,y); if (bg[i]) continue;
  let edge = false; for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x+dx, yy = y+dy; if (xx>=0&&yy>=0&&xx<w&&yy<h&&bg[idx(xx,yy)]) { edge = true; break; } }
  if (!edge) { alpha[i] = 1; continue; }
  const mn = Math.min(px[i*4], px[i*4+1], px[i*4+2]);
  const a = Math.min(1, Math.max(0, (255 - mn) / 150)); alpha[i] = a;
  if (a > 0) for (let c = 0; c < 3; c++) px[i*4+c] = Math.max(0, Math.min(255, Math.round((px[i*4+c] - (1 - a) * 255) / a)));
}

// 3. keep only big connected blobs (drops specks and smudges)
const label = new Int32Array(w * h).fill(-1); const sizes = [];
for (let s = 0; s < w*h; s++) { if (alpha[s] < 0.1 || label[s] >= 0) continue; const id = sizes.length; let n = 0; const st = [s]; label[s] = id;
  while (st.length) { const i = st.pop(); n++; const x = i % w, y = (i - x) / w;
    for (const j of [x>0?i-1:-1, x<w-1?i+1:-1, y>0?i-w:-1, y<h-1?i+w:-1]) if (j >= 0 && label[j] < 0 && alpha[j] >= 0.1) { label[j] = id; st.push(j); } }
  sizes.push(n); }
const keep = new Set(sizes.map((n, id) => [n, id]).filter(([n]) => n >= 1500).map(([, id]) => id));
console.log('blobs:', sizes.length, 'kept:', [...keep].map(id => sizes[id]));
for (let i = 0; i < w*h; i++) if (!keep.has(label[i])) alpha[i] = 0;

// 4. crop to content + 4px padding
let x0 = w, x1 = 0, y0 = h, y1 = 0;
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (alpha[idx(x,y)] > 0.05) { x0 = Math.min(x0,x); x1 = Math.max(x1,x); y0 = Math.min(y0,y); y1 = Math.max(y1,y); }
x0 = Math.max(0, x0-4); y0 = Math.max(0, y0-4); x1 = Math.min(w-1, x1+4); y1 = Math.min(h-1, y1+4);
const cw = x1-x0+1, ch = y1-y0+1, o = Buffer.alloc(cw*ch*4);
for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const i = idx(x+x0, y+y0), j = (y*cw+x)*4;
  o[j] = px[i*4]; o[j+1] = px[i*4+1]; o[j+2] = px[i*4+2]; o[j+3] = Math.round(alpha[i]*255); }
encode(out, { w: cw, h: ch, px: o });
console.log('crop', { x0, y0, x1, y1 }, '->', cw + 'x' + ch);
