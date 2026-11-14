// Suit-aware traversal model. Turns a pixel path into mission numbers.

export function evaluate(path, ctx) {
  const { W, cell, elev, cost, temp8, slope8, tempMin, tempMax, p10, cfg } = ctx;
  const coldLine = typeof p10 === "number" ? p10 : -Infinity;
  const budgetMin = cfg.eva_budget_min;
  const rate = cfg.dose_rate_mSv_day;

  let dist = 0;
  let time = 0;
  let ascent = 0;
  let descent = 0;
  let maxSlope = 0;
  let maxGrade = 0;
  let wasted = 0; // time spent on bad ground, for the "why this route" line

  const cum = new Float64Array(path.length);
  const samples = [];

  let prevX = path[0] % W;
  let prevY = (path[0] / W) | 0;
  let prevZ = elev[path[0]];

  const push = (i, d, t, z) => {
    const temp = tempMin + (temp8[i] / 255) * (tempMax - tempMin);
    samples.push({ d, t, z, temp, cold: temp < coldLine });
  };
  push(path[0], 0, 0, prevZ);

  for (let n = 1; n < path.length; n++) {
    const i = path[n];
    const x = i % W;
    const y = (i / W) | 0;
    const z = elev[i];

    const diag = x !== prevX && y !== prevY;
    const d = cell * (diag ? Math.SQRT2 : 1);

    const dz = z - prevZ;
    const tan = Math.abs(dz) / d;
    const slopeDeg = (Math.atan(tan) * 180) / Math.PI;
    if (slopeDeg > maxGrade) maxGrade = slopeDeg;
    if (slope8) {
      const ts = (slope8[i] / 255) * 90;
      if (ts > maxSlope) maxSlope = ts;
    }
    if (dz > 0) ascent += dz;
    else descent -= dz;

    const fSlope = dz >= 0 ? 1 / (1 + 1.5 * tan) : 1 / (1 + 0.5 * tan);
    const c = Math.max(1, Math.min(254, cost[i]));
    const fTerrain = 1 / (1 + 0.012 * (c - 1));

    const v = Math.max(0.15, cfg.v0_mps * fSlope * fTerrain);
    const dt = d / v;

    dist += d;
    time += dt;
    if (fTerrain < 0.7) wasted += dt * (1 - fTerrain);
    cum[n] = time;

    push(i, dist, time, z);

    prevX = x;
    prevY = y;
    prevZ = z;
  }

  // point of no return: farthest point from which a return is still possible
  const budgetS = budgetMin * 60;
  let pnrIdx = path.length;
  for (let n = 0; n < path.length; n++) {
    if (2 * cum[n] > budgetS) {
      pnrIdx = n;
      break;
    }
  }

  const temps = samples.map((s) => s.temp);
  const hours = time / 3600;
  const coldCount = samples.reduce((n, s) => n + (s.cold ? 1 : 0), 0);

  return {
    distance_m: dist,
    time_s: time,
    ascent_m: ascent,
    descent_m: descent,
    max_slope_deg: maxSlope || maxGrade,
    max_grade_deg: maxGrade,
    dose_mSv: rate * (hours / 24),
    temp_min: Math.min(...temps),
    temp_max: Math.max(...temps),
    temp_end: samples[samples.length - 1].temp,
    cold_fraction: samples.length ? coldCount / samples.length : 0,
    pnr_index: pnrIdx,
    pnr_distance_m: pnrIdx < path.length ? samples[pnrIdx].d : null,
    over_budget: time > budgetS,
    budget_min: budgetMin,
    remaining_min: budgetMin - time / 60,
    wasted_s: wasted,
    samples,
  };
}
