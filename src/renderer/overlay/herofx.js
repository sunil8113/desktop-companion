// Canvas effects for the other entrances: a speed trail, jet flames, a magic portal, an
// arrow and a rope. Exposes window.HeroFx.create(fx), where fx is the canvas engine from
// lightning.js. Solid parts are drawn normally (not additive) so they show on light screens.
(function () {
  const rand = (a, b) => a + Math.random() * (b - a);

  function create(fx) {
    // A glowing streak through the recent positions of a moving point, crackling with
    // small sparks of lightning. Call push(x, y) every frame and stop() when done.
    function trail(rgb, ttl = 260) {
      const pts = [];
      let active = true;
      fx.add((c) => {
        const now = performance.now();
        while (pts.length && now - pts[0].at > ttl) pts.shift();
        if (!active && pts.length < 2) return false;
        const fade = (p) => Math.max(0, 1 - (now - p.at) / ttl);
        c.lineCap = 'round';
        for (const [width, color, mode] of [
          [26, `rgba(${rgb}, 0.18)`, 'source-over'],
          [12, `rgba(${rgb}, 0.6)`, 'source-over'],
          [4, 'rgba(255, 255, 255, 0.95)', 'lighter'],
        ]) {
          c.globalCompositeOperation = mode;
          c.lineWidth = width;
          c.strokeStyle = color;
          for (let i = 1; i < pts.length; i++) {
            c.globalAlpha = fade(pts[i]);
            c.beginPath();
            c.moveTo(pts[i - 1].x, pts[i - 1].y);
            c.lineTo(pts[i].x, pts[i].y);
            c.stroke();
          }
        }
        // Crackle: a jagged line re-drawn each frame along the trail.
        c.globalCompositeOperation = 'source-over';
        c.globalAlpha = 1;
        c.lineWidth = 2;
        c.strokeStyle = `rgb(${rgb})`;
        c.beginPath();
        pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y + rand(-16, 16) * fade(p)) : c.moveTo(p.x, p.y)));
        c.stroke();
        c.globalCompositeOperation = 'lighter';
        return true;
      });
      return {
        push: (x, y) => pts.push({ x, y, at: performance.now() }),
        stop: () => {
          active = false;
        },
      };
    }

    // Flames pointing down from each nozzle. nozzles() returns the current [{ x, y }];
    // set `power` (0..1) to throttle and call stop() to cut them.
    function flames(nozzles) {
      const jets = { power: 1, active: true, stop: () => (jets.active = false) };
      fx.add((c) => {
        if (!jets.active) return false;
        c.globalCompositeOperation = 'source-over';
        for (const n of nozzles()) {
          const len = (20 + 80 * jets.power) * rand(0.82, 1.15);
          const w = 7 + 5 * jets.power;
          const g = c.createLinearGradient(n.x, n.y, n.x, n.y + len);
          g.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
          g.addColorStop(0.2, 'rgba(140, 235, 255, 0.95)');
          g.addColorStop(0.55, 'rgba(255, 150, 40, 0.8)');
          g.addColorStop(1, 'rgba(255, 80, 20, 0)');
          c.fillStyle = g;
          c.beginPath();
          c.moveTo(n.x - w, n.y);
          c.quadraticCurveTo(n.x - w * 0.5, n.y + len * 0.6, n.x, n.y + len);
          c.quadraticCurveTo(n.x + w * 0.5, n.y + len * 0.6, n.x + w, n.y);
          c.closePath();
          c.fill();
        }
        c.globalCompositeOperation = 'lighter';
        return true;
      });
      return jets;
    }

    // A swirling oval of sparks centred on (x, y). Returns { opened, close() }: opened
    // resolves once it is fully open, close() shrinks it away and resolves when it's gone.
    function portal(x, y, rx, ry, ms = 380) {
      const sparks = Array.from({ length: 90 }, () => ({
        a: rand(0, Math.PI * 2),
        r: rand(0.9, 1.1),
        speed: rand(0.004, 0.009),
        len: rand(0.12, 0.34),
        green: Math.round(rand(120, 210)), // orange to gold
      }));
      const start = performance.now();
      let closingAt = null;
      let resolveOpened;
      let resolveClosed;
      const opened = new Promise((r) => (resolveOpened = r));
      const closed = new Promise((r) => (resolveClosed = r));
      fx.add((c) => {
        const t = performance.now() - start;
        let k = Math.min(1, t / ms);
        if (k >= 1) resolveOpened();
        if (closingAt !== null) {
          const kc = (t - closingAt) / ms;
          if (kc >= 1) {
            resolveClosed();
            return false;
          }
          k = Math.min(k, 1 - kc);
        }
        const s = 1 - (1 - k) ** 3;
        if (s <= 0) return true;
        // Dark centre and edge, so it reads on any background.
        c.globalCompositeOperation = 'source-over';
        c.save();
        c.translate(x, y);
        c.scale(1, ry / rx);
        const inner = c.createRadialGradient(0, 0, 0, 0, 0, rx * s);
        inner.addColorStop(0, 'rgba(20, 6, 40, 0.75)');
        inner.addColorStop(0.8, 'rgba(60, 20, 110, 0.55)');
        inner.addColorStop(1, 'rgba(60, 20, 110, 0)');
        c.fillStyle = inner;
        c.beginPath();
        c.arc(0, 0, rx * s, 0, Math.PI * 2);
        c.fill();
        c.lineWidth = 7;
        c.strokeStyle = 'rgba(120, 40, 0, 0.45)';
        c.stroke();
        c.restore();
        // Bright sparks circling the rim.
        c.globalCompositeOperation = 'lighter';
        c.lineWidth = 2.5;
        for (const p of sparks) {
          const a = p.a + t * p.speed;
          c.strokeStyle = `rgba(255, ${p.green}, 40, ${0.9 * s})`;
          c.beginPath();
          c.ellipse(x, y, rx * s * p.r, ry * s * p.r, 0, a, a + p.len);
          c.stroke();
        }
        return true;
      });
      return {
        opened,
        close: () => {
          if (closingAt === null) closingAt = performance.now() - start;
          return closed;
        },
      };
    }

    function drawArrow(c, x, y, angle, alpha) {
      c.save();
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = alpha;
      c.translate(x, y);
      c.rotate(angle);
      c.lineCap = 'round';
      c.strokeStyle = '#2a1a0c';
      c.lineWidth = 6;
      c.beginPath();
      c.moveTo(-50, 0);
      c.lineTo(-4, 0);
      c.stroke();
      c.strokeStyle = '#a0683a';
      c.lineWidth = 3;
      c.stroke();
      // head
      c.fillStyle = '#c9d2de';
      c.strokeStyle = '#2a1a0c';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(6, 0);
      c.lineTo(-8, -6);
      c.lineTo(-8, 6);
      c.closePath();
      c.fill();
      c.stroke();
      // fletching
      c.fillStyle = '#e8322f';
      for (const side of [-1, 1]) {
        c.beginPath();
        c.moveTo(-36, 0);
        c.lineTo(-52, side * 8);
        c.lineTo(-48, 0);
        c.closePath();
        c.fill();
        c.stroke();
      }
      c.restore();
    }

    // An arrow flying from `from` to `to`, where it sticks and wobbles.
    // Returns { hit, tip(), remove() }: hit resolves on impact, tip() is its current point.
    function arrow(from, to, ms = 230) {
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      const start = performance.now();
      let removedAt = null;
      let resolveHit;
      const hit = new Promise((r) => (resolveHit = r));
      const tipAt = (t) => {
        const k = Math.min(1, t / ms);
        return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
      };
      fx.add((c) => {
        const t = performance.now() - start;
        if (t >= ms) resolveHit();
        let alpha = 1;
        if (removedAt !== null) {
          alpha = 1 - (t - removedAt) / 250;
          if (alpha <= 0) return false;
        }
        const wobble = t > ms ? 0.12 * Math.exp(-(t - ms) / 90) * Math.sin((t - ms) / 18) : 0;
        const p = tipAt(t);
        drawArrow(c, p.x, p.y, angle + wobble, alpha);
        return true;
      });
      return {
        hit,
        tip: () => tipAt(performance.now() - start),
        remove: () => {
          if (removedAt === null) removedAt = performance.now() - start;
        },
      };
    }

    // A rope between a() and b() (functions returning the current points) until remove().
    function line(a, b) {
      let removedAt = null;
      fx.add((c) => {
        let alpha = 1;
        if (removedAt !== null) {
          alpha = 1 - (performance.now() - removedAt) / 250;
          if (alpha <= 0) return false;
        }
        const p = a();
        const q = b();
        c.globalCompositeOperation = 'source-over';
        c.globalAlpha = alpha;
        c.lineCap = 'round';
        for (const [width, color] of [[5, 'rgba(40, 25, 10, 0.6)'], [2.5, '#efe3c6']]) {
          c.lineWidth = width;
          c.strokeStyle = color;
          c.beginPath();
          c.moveTo(p.x, p.y);
          c.lineTo(q.x, q.y);
          c.stroke();
        }
        c.globalAlpha = 1;
        c.globalCompositeOperation = 'lighter';
        return true;
      });
      return {
        remove: () => {
          removedAt ??= performance.now();
        },
      };
    }

    return { trail, flames, portal, arrow, line };
  }

  window.HeroFx = { create };
})();
