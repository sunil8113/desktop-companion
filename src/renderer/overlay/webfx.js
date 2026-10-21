// Comic-book web effects for the swing entrance: a web shot, a web splat stuck to the
// top of the screen and a "THWIP!" burst. Exposes window.WebFx.create(fx), where fx is
// the canvas engine from lightning.js.
(function () {
  const rand = (a, b) => a + Math.random() * (b - a);

  // 24-point starburst for the comic "THWIP!" bubble.
  const STAR = `polygon(${Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? 31 : 50;
    return `${(50 + r * Math.cos(a)).toFixed(1)}% ${(50 + r * Math.sin(a)).toFixed(1)}%`;
  }).join(', ')})`;

  // A spider-web disc: spokes plus sagging rings, as SVG markup.
  function splatSvg(r) {
    const n = 10;
    const angles = Array.from({ length: n }, (_, i) => (i / n) * Math.PI * 2 + rand(-0.12, 0.12));
    const pt = (a, k) => `${(Math.cos(a) * r * k).toFixed(1)} ${(Math.sin(a) * r * k).toFixed(1)}`;
    let d = angles.map((a) => `M0 0 L${pt(a, rand(0.9, 1))}`).join(' ');
    for (const k of [0.32, 0.6, 0.86]) {
      for (let i = 0; i < n; i++) {
        const a = angles[i];
        const b = i === n - 1 ? angles[0] + Math.PI * 2 : angles[i + 1];
        d += ` M${pt(a, k)} Q${pt((a + b) / 2, k * 0.82)} ${pt(b, k)}`;
      }
    }
    const s = r + 6;
    return `<svg viewBox="${-s} ${-s} ${2 * s} ${2 * s}" width="${2 * s}" height="${2 * s}">
      <path d="${d}" fill="none" stroke="rgba(15, 25, 45, 0.55)" stroke-width="4.5" stroke-linecap="round"/>
      <path d="${d}" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>
    </svg>`;
  }

  function create(fx) {
    // A web line fired from `from` that flies to `to`. Resolves when it arrives.
    function shoot(from, to, ms = 170) {
      return fx.add((c, t) => {
        if (t >= ms) return false;
        const k = t / ms;
        const x = from.x + (to.x - from.x) * k;
        const y = from.y + (to.y - from.y) * k;
        c.globalCompositeOperation = 'source-over';
        c.lineCap = 'round';
        for (const [width, color] of [[5, 'rgba(15, 25, 45, 0.5)'], [2.5, '#ffffff']]) {
          c.lineWidth = width;
          c.strokeStyle = color;
          c.beginPath();
          c.moveTo(from.x, from.y);
          c.lineTo(x, y);
          c.stroke();
        }
        c.fillStyle = '#ffffff';
        c.strokeStyle = 'rgba(15, 25, 45, 0.6)';
        c.lineWidth = 2;
        c.beginPath();
        c.arc(x, y, 6, 0, Math.PI * 2);
        c.fill();
        c.stroke();
        c.globalCompositeOperation = 'lighter';
        return true;
      });
    }

    // A web pattern stuck at (x, y). Returns { remove() } to fade it out.
    function splat(x, y, r = 58) {
      const el = document.createElement('div');
      el.className = 'web-splat';
      el.innerHTML = splatSvg(r);
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      document.body.append(el);
      el.animate(
        [
          { transform: 'translate(-50%, -50%) scale(0.2) rotate(-25deg)', opacity: 0 },
          { transform: 'translate(-50%, -50%) scale(1.12)', opacity: 1, offset: 0.7 },
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
        ],
        { duration: 260, easing: 'ease-out', fill: 'backwards' },
      );
      return {
        remove: () =>
          el
            .animate([{ opacity: 1 }, { opacity: 0, transform: 'translate(-50%, -50%) scale(0.6)' }], {
              duration: 300,
              fill: 'forwards',
            })
            .finished.then(() => el.remove()),
      };
    }

    // Comic sound-effect bubble that pops in and fades out on its own.
    function burst(text, x, y, rotate = -10) {
      const el = document.createElement('div');
      el.className = 'burst';
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.clipPath = STAR;
      const fill = document.createElement('div');
      fill.className = 'burst-fill';
      fill.style.clipPath = STAR;
      const label = document.createElement('span');
      label.textContent = text;
      el.append(fill, label);
      document.body.append(el);
      const base = `translate(-50%, -50%) rotate(${rotate}deg)`;
      el.animate(
        [
          { transform: `${base} scale(0)`, opacity: 1 },
          { transform: `${base} scale(1.15)`, opacity: 1, offset: 0.2 },
          { transform: `${base} scale(1)`, opacity: 1, offset: 0.7 },
          { transform: `${base} scale(1.05)`, opacity: 0 },
        ],
        { duration: 900, easing: 'ease-out', fill: 'forwards' },
      ).finished.then(() => el.remove());
    }

    return { shoot, splat, burst };
  }

  window.WebFx = { create };
})();
