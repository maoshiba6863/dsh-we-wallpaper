export function clipRect(rect, bounds) {
  const x1 = Math.max(rect[0], bounds[0]);
  const y1 = Math.max(rect[1], bounds[1]);
  const x2 = Math.min(rect[0] + rect[2], bounds[0] + bounds[2]);
  const y2 = Math.min(rect[1] + rect[3], bounds[1] + bounds[3]);
  const w = x2 - x1;
  const h = y2 - y1;
  if (w <= 0 || h <= 0) return null;
  return [x1, y1, w, h];
}
function clipRectsToBounds(rects, bounds) {
  const out = [];
  for (const r of rects) {
    const clipped = clipRect(r, bounds);
    if (clipped) out.push(clipped);
  }
  return out;
}
export function rectsArea(rects) {
  let sum = 0;
  for (const r of rects) sum += r[2] * r[3];
  return sum;
}
function mergeRects(rects) {
  const merged = [];
  for (const r of rects) {
    let cur = r.slice();
    let didMerge = true;
    while (didMerge) {
      didMerge = false;
      for (let i = 0; i < merged.length; i++) {
        if (intersectsOrTouches(cur, merged[i])) {
          cur = unionRect(cur, merged[i]);
          merged.splice(i, 1);
          didMerge = true;
          break;
        }
      }
    }
    merged.push(cur);
  }
  return merged;
}
function intersectsOrTouches(a, b) {
  const xOverlap = a[0] < b[0] + b[2] && b[0] < a[0] + a[2];
  const yOverlap = a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
  const xTouch = a[0] <= b[0] + b[2] && b[0] <= a[0] + a[2];
  const yTouch = a[1] <= b[1] + b[3] && b[1] <= a[1] + a[3];
  return (xOverlap && yTouch) || (yOverlap && xTouch);
}
function unionRect(a, b) {
  const x1 = Math.min(a[0], b[0]);
  const y1 = Math.min(a[1], b[1]);
  const x2 = Math.max(a[0] + a[2], b[0] + b[2]);
  const y2 = Math.max(a[1] + a[3], b[1] + b[3]);
  return [x1, y1, x2 - x1, y2 - y1];
}
export function cleanOccluders(rawRects, ownRect) {
  return mergeRects(clipRectsToBounds(rawRects, ownRect));
}