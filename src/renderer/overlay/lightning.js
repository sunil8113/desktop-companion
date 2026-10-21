// Canvas effects for the overlay: a branching blue lightning strike, landing sparks
// and a shockwave ring. Exposes window.Lightning.createFx(canvas).
(function () {
  const rand = (a, b) => a + Math.random() * (b - a);

  // Glow is faked with stacked strokes (wide + faint -> thin + bright) using additive
  // blending, which is far cheaper than shadowBlur on a full-screen canvas.
  const BOLT_LAYERS = [
    [30, 'rgba(61, 149, 255, 0.07)'],
    [16, 'rgba(80, 160, 255, 0.16)'],
    [7, 'rgba(140, 205, 255, 0.5)'],
    [2.4, 'rgba(255, 255, 255, 1)'],
  ];

  // Midpoint displacement: split each segment and nudge the midpoint sideways.
  function displace(points, x1, y1, x2, y2, offset, minLen) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len < minLen) {
      points.push([x2, y2]);
      return;
    }
    const nx = -(y2 - y1) / len;
    const ny = (x2 - x1) / len;
    const o = rand(-offset, offset);
    const mx = (x1 + x2) / 2 + nx * o;
    const my = (y1 + y2) / 2 + ny * o;
    displace(points, x1, y1, mx, my, offset / 2, minLen);
    displace(points, mx, my, x2, y2, offset / 2, minLen);
  }

  function boltPath(x1, y1, x2, y2, roughness) {
    const points = [[x1, y1]];
    displace(points, x1, y1, x2, y2, Math.hypot(x2 - x1, y2 - y1) * roughness, 7);
    return points;
  }

  function makeStrike(from, to) {
    const main = boltPath(from.x, from.y, to.x, to.y, 0.2);
    const branches = [];
    const count = Math.round(rand(3, 6));
    for (let i = 0; i < count; i++) {
      const at = Math.floor(rand(0.08, 0.75) * main.length);
      const [bx, by] = main[at];
      const side = Math.random() < 0.5 ? -1 : 1;
      const len = rand(60, 230);
      const angle = rand(0.35, 1.15); // radians away from straight down
      const pts = boltPath(bx, by, bx + side * Math.sin(angle) * len, by + Math.cos(angle) * len, 0.32);
      branches.push({ at, pts, scale: rand(0.35, 0.6) });
    }
    return { main, branches };
  }

  function strokePolyline(ctx, pts, count, scale, alpha) {
    if (count < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < count; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.globalAlpha = alpha;
    // A deep-blue edge, drawn normally (not additive), keeps the bolt visible on light screens.
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = 9 * scale;
    ctx.strokeStyle = 'rgba(20, 60, 175, 0.5)';
    ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    for (const [width, color] of BOLT_LAYERS) {
      ctx.lineWidth = width * scale;
      ctx.strokeStyle = color;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function glow(ctx, x, y, radius, alpha) {
    if (alpha <= 0) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, `rgba(220, 240, 255, ${0.9 * alpha})`);
    g.addColorStop(0.35, `rgba(90, 170, 255, ${0.45 * alpha})`);
    g.addColorStop(1, 'rgba(61, 149, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  // Strike timeline (ms): grow to the ground, hold, dim, re-strike, fade.
  const GROW_MS = 110;
  const STRIKE_MS = 680;
  function strikeAlpha(t) {
    if (t < 200) return 1;
    if (t < 245) return 0.25;
    if (t < 330) return 1;
    if (t < 380) return 0.45;
    return Math.max(0, 0.9 * (1 - (t - 380) / (STRIKE_MS - 380)));
  }

  function createFx(canvas) {
    const ctx = canvas.getContext('2d');
    const effects = new Set();
    let raf = 0;
    let dpr = 1;

    function resize() {
      dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
    }
    resize();
    window.addEventListener('resize', resize);

    function frame(now) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const fx of effects) {
        if (fx.draw(ctx, Math.max(0, now - fx.start)) === false) {
          effects.delete(fx);
          fx.resolve();
        }
      }
      raf = effects.size ? requestAnimationFrame(frame) : 0;
    }

    // draw(ctx, elapsedMs) returns false when finished. Resolves when it ends.
    function add(draw) {
      return new Promise((resolve) => {
        effects.add({ draw, resolve, start: performance.now() });
        if (!raf) raf = requestAnimationFrame(frame);
      });
    }

    function strike(from, to) {
      const bolt = makeStrike(from, to);
      const n = bolt.main.length;
      return add((c, t) => {
        if (t > STRIKE_MS) return false;
        const shown = Math.min(n, Math.ceil((t / GROW_MS) * n));
        const alpha = strikeAlpha(t);
        for (const b of bolt.branches) {
          if (b.at < shown) strokePolyline(c, b.pts, Math.min(b.pts.length, shown - b.at), b.scale, alpha * 0.75);
        }
        strokePolyline(c, bolt.main, shown, 1, alpha);
        if (t >= GROW_MS) glow(c, to.x, to.y, 110, alpha);
        return true;
      });
    }

    function sparks(x, y, count = 34) {
      const parts = Array.from({ length: count }, () => ({
        vx: rand(-0.7, 0.7),
        vy: rand(-1.0, -0.25),
        life: rand(380, 820),
      }));
      const GRAVITY = 0.0028; // px / ms^2
      return add((c, t) => {
        let alive = false;
        c.lineWidth = 2;
        for (const p of parts) {
          if (t > p.life) continue;
          alive = true;
          const px = x + p.vx * t;
          const py = y + p.vy * t + 0.5 * GRAVITY * t * t;
          const vy = p.vy + GRAVITY * t;
          c.strokeStyle = `rgba(190, 230, 255, ${1 - t / p.life})`;
          c.beginPath();
          c.moveTo(px, py);
          c.lineTo(px - p.vx * 14, py - vy * 14);
          c.stroke();
        }
        return alive;
      });
    }

    function ring(x, y, maxRadius = 150, duration = 450) {
      return add((c, t) => {
        if (t > duration) return false;
        const k = t / duration;
        const r = maxRadius * (1 - (1 - k) * (1 - k)); // ease-out
        c.strokeStyle = `rgba(140, 205, 255, ${0.8 * (1 - k)})`;
        c.lineWidth = 4 * (1 - k) + 1;
        c.beginPath();
        c.ellipse(x, y, r, r * 0.22, 0, 0, Math.PI * 2);
        c.stroke();
        return true;
      });
    }

    return { add, strike, sparks, ring, GROW_MS };
  }

  window.Lightning = { createFx };
})();
