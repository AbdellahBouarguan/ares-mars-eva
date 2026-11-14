// A* over an 8-bit cost grid. 255 = impassable.

class MinHeap {
  constructor(cap = 1 << 14) {
    this.keys = new Float32Array(cap);
    this.vals = new Int32Array(cap);
    this.size = 0;
  }
  _grow() {
    const k = new Float32Array(this.keys.length * 2);
    k.set(this.keys);
    this.keys = k;
    const v = new Int32Array(this.vals.length * 2);
    v.set(this.vals);
    this.vals = v;
  }
  push(key, val) {
    if (this.size === this.keys.length) this._grow();
    let i = this.size++;
    this.keys[i] = key;
    this.vals[i] = val;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= this.keys[i]) break;
      const tk = this.keys[p];
      this.keys[p] = this.keys[i];
      this.keys[i] = tk;
      const tv = this.vals[p];
      this.vals[p] = this.vals[i];
      this.vals[i] = tv;
      i = p;
    }
  }
  pop() {
    if (this.size === 0) return -1;
    const top = this.vals[0];
    this.size--;
    if (this.size > 0) {
      this.keys[0] = this.keys[this.size];
      this.vals[0] = this.vals[this.size];
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.size && this.keys[l] < this.keys[m]) m = l;
        if (r < this.size && this.keys[r] < this.keys[m]) m = r;
        if (m === i) break;
        const tk = this.keys[m];
        this.keys[m] = this.keys[i];
        this.keys[i] = tk;
        const tv = this.vals[m];
        this.vals[m] = this.vals[i];
        this.vals[i] = tv;
        i = m;
      }
    }
    return top;
  }
}

const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];

export function nearestWalkable(cost, W, H, x, y, maxR = 25) {
  x = Math.max(0, Math.min(W - 1, Math.round(x)));
  y = Math.max(0, Math.min(H - 1, Math.round(y)));
  if (cost[y * W + x] !== 255) return [x, y];
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (cost[ny * W + nx] !== 255) return [nx, ny];
      }
    }
  }
  return null;
}

export function astar(cost, W, H, sx, sy, gx, gy, weight = 1.15) {
  const N = W * H;
  const start = sy * W + sx;
  const goal = gy * W + gx;
  if (start === goal) return [start];
  if (cost[start] === 255 || cost[goal] === 255) return null;

  const g = new Float32Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const heap = new MinHeap(1 << 16);

  const heur = (i) => {
    const x = i % W;
    const y = (i / W) | 0;
    const dx = Math.abs(x - gx);
    const dy = Math.abs(y - gy);
    return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
  };

  g[start] = 0;
  heap.push(heur(start), start);

  while (heap.size > 0) {
    const cur = heap.pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;

    const cx = cur % W;
    const cy = (cur / W) | 0;

    for (let k = 0; k < 8; k++) {
      const nx = cx + DX[k];
      const ny = cy + DY[k];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx;
      if (closed[ni] || cost[ni] === 255) continue;

      // diagonal steps may not squeeze through a blocked corner
      if (k >= 4) {
        if (cost[cy * W + nx] === 255 || cost[ny * W + cx] === 255) continue;
      }

      const step = (k < 4 ? 1 : Math.SQRT2) * cost[ni];
      const ng = g[cur] + step;
      if (ng < g[ni]) {
        g[ni] = ng;
        came[ni] = cur;
        heap.push(ng + heur(ni) * weight, ni);
      }
    }
  }

  if (came[goal] === -1) return null;

  const path = [];
  let c = goal;
  let guard = 0;
  while (c !== -1 && guard++ < N) {
    path.push(c);
    if (c === start) break;
    c = came[c];
  }
  path.reverse();
  return path[0] === start ? path : null;
}
