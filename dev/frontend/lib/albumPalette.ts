type Color = { rgb: [number, number, number]; weight: number };

const distance = (a: number[], b: number[]) =>
  (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const hex = (rgb: number[]) => '#' + rgb.map(c => Math.round(c).toString(16).padStart(2, '0')).join('');

/** Cluster artwork by area, preserving muted colors instead of inventing accents. */
export function extractPaletteFromPixels(pixels: Uint8ClampedArray): [string, string] | null {
  const buckets = new Map<number, Color>();
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const [r, g, b, alpha] = pixels.subarray(i, i + 4);
    if (alpha < 128) continue;
    // Letterboxing and tiny white lettering should not replace the artwork.
    // Keep these tones available for genuinely monochrome covers.
    const weight = Math.max(r, g, b) < 12 ? 0.05 : Math.min(r, g, b) > 248 ? 0.2 : 1;
    const key = (r >> 5) * 64 + (g >> 5) * 8 + (b >> 5);
    const bucket = buckets.get(key) ?? { rgb: [0, 0, 0], weight: 0 };
    bucket.rgb[0] += r * weight;
    bucket.rgb[1] += g * weight;
    bucket.rgb[2] += b * weight;
    bucket.weight += weight;
    buckets.set(key, bucket);
  }
  const colors = [...buckets.values()].map(c => ({
    weight: c.weight,
    rgb: c.rgb.map(channel => channel / c.weight) as Color['rgb'],
  })).sort((a, b) => b.weight - a.weight);
  if (!colors.length) return null;

  const centers: Color['rgb'][] = [[...colors[0].rgb]];
  // Seed substantial, distant regions, then merge nearby gradient shades.
  while (centers.length < Math.min(4, colors.length)) {
    let candidate = colors[0];
    let best = 0;
    for (const color of colors) {
      const score = color.weight * Math.min(...centers.map(center => distance(color.rgb, center)));
      if (score > best) { best = score; candidate = color; }
    }
    if (!best) break;
    centers.push([...candidate.rgb]);
  }
  let clusters: Color[] = [];
  for (let iteration = 0; iteration < 8; iteration++) {
    clusters = centers.map(() => ({ rgb: [0, 0, 0], weight: 0 }));
    for (const color of colors) {
      let nearest = 0;
      for (let index = 1; index < centers.length; index++) {
        if (distance(color.rgb, centers[index]) < distance(color.rgb, centers[nearest])) nearest = index;
      }
      const cluster = clusters[nearest];
      cluster.weight += color.weight;
      for (let channel = 0; channel < 3; channel++) cluster.rgb[channel] += color.rgb[channel] * color.weight;
    }
    clusters.forEach((cluster, index) => {
      if (cluster.weight) {
        cluster.rgb = cluster.rgb.map(channel => channel / cluster.weight) as Color['rgb'];
        centers[index] = [...cluster.rgb];
      }
    });
  }
  clusters = clusters.filter(c => c.weight > 0).sort((a, b) => b.weight - a.weight);
  const primary = clusters[0];
  const secondary = clusters.find((c, index) => index > 0 && c.weight >= primary.weight * 0.15
    && distance(c.rgb, primary.rgb) > 24 ** 2);
  return [hex(primary.rgb), hex((secondary ?? primary).rgb)];
}
