// Removes the dark background from an animated image (e.g. a movie clip GIF) so only
// the bright parts float over the desktop. Decodes frames with WebCodecs' ImageDecoder,
// keys each frame once, then plays them on a canvas. Exposes window.Keyer.start().
(function () {
  const FLOOR = 18; // brightness (0-255) at or below which a pixel is fully transparent
  const GAMMA = 0.7; // < 1 keeps more of the mid-tones (the figure), > 1 keeps only highlights
  const FEATHER = 0.08; // fade out this fraction at each edge so the clip has no hard border

  async function decodeFrames({ bytes, type }) {
    if (!('ImageDecoder' in window) || !(await ImageDecoder.isTypeSupported(type))) return null;
    const decoder = new ImageDecoder({ data: bytes, type });
    await decoder.completed;
    await decoder.tracks.ready;
    const track = decoder.tracks.selectedTrack ?? decoder.tracks[0];
    const count = track ? track.frameCount : 1;
    const frames = [];
    for (let i = 0; i < count; i++) {
      const { image } = await decoder.decode({ frameIndex: i });
      frames.push(image);
    }
    decoder.close();
    return frames;
  }

  // Treat the frame as light added on top of black: alpha = brightness, colour = rgb / alpha.
  // Over a black desktop it looks identical to the original; elsewhere it reads as a glow.
  function keyFrame(frame, w, h) {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(frame, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const fx = Math.max(1, w * FEATHER);
    const fy = Math.max(1, h * FEATHER);
    for (let y = 0; y < h; y++) {
      const ey = Math.min(1, y / fy, (h - 1 - y) / fy);
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const m = Math.max(d[i], d[i + 1], d[i + 2]);
        if (m <= FLOOR) {
          d[i + 3] = 0;
          continue;
        }
        const edge = Math.min(ey, x / fx, (w - 1 - x) / fx);
        const a = Math.pow((m - FLOOR) / (255 - FLOOR), GAMMA) * edge * edge * (d[i + 3] / 255);
        if (a <= 0.004) {
          d[i + 3] = 0;
          continue;
        }
        const k = 1 / Math.max(a, m / 255);
        d[i] = Math.min(255, d[i] * k);
        d[i + 1] = Math.min(255, d[i + 1] * k);
        d[i + 2] = Math.min(255, d[i + 2] * k);
        d[i + 3] = Math.round(a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  // Resolves true once the first frame is on the canvas, false if the image can't be keyed.
  async function start(canvas, data) {
    const frames = await decodeFrames(data);
    if (!frames || frames.length === 0) return false;
    const w = frames[0].displayWidth;
    const h = frames[0].displayHeight;
    const keyed = frames.map((f) => {
      const frame = { image: keyFrame(f, w, h), ms: Math.max(20, (f.duration || 100000) / 1000) };
      f.close();
      return frame;
    });

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    let index = 0;
    (function draw() {
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(keyed[index].image, 0, 0);
      const wait = keyed[index].ms;
      index = (index + 1) % keyed.length;
      if (keyed.length > 1) setTimeout(draw, wait);
    })();
    return true;
  }

  window.Keyer = { start };
})();
