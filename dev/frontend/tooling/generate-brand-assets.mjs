import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const brand = JSON.parse(
  await readFile(path.join(root, "lib/brand-shape.json"), "utf8"),
);
const symbol = `<g fill="none" stroke-linejoin="round" stroke-width="${brand.strokeWidth}"><path d="${brand.path}" stroke="${brand.foreground}"/><g transform="${brand.offset}"><path d="${brand.path}" stroke="${brand.background}" stroke-width="10"/><path d="${brand.path}" stroke="${brand.accent}"/></g></g>`;
const svg = (size, background, rounded = false) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">${background ? `<rect width="64" height="64" rx="${rounded ? 15 : 0}" fill="${brand.background}"/>` : ""}${symbol}</svg>\n`;
const publicRoot = path.join(root, "public");
await mkdir(path.join(publicRoot, "brand"), { recursive: true });
await writeFile(path.join(publicRoot, "favicon.svg"), svg(64, true, true));
await writeFile(
  path.join(publicRoot, "brand/syncbeats-symbol.svg"),
  svg(1024, false),
);
await writeFile(
  path.join(publicRoot, "brand/syncbeats-app-icon.svg"),
  svg(1024, true),
);
for (const [filename, size] of [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
  ["brand/syncbeats-app-icon-1024.png", 1024],
]) {
  await sharp(Buffer.from(svg(size, true)))
    .png()
    .toFile(path.join(publicRoot, filename));
}
// PNG-backed ICO entries preserve crisp favicon artwork at common browser sizes.
const sizes = [16, 32, 48];
const images = await Promise.all(
  sizes.map((size) =>
    sharp(Buffer.from(svg(size, true, true)))
      .png()
      .toBuffer(),
  ),
);
const header = Buffer.alloc(6 + images.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = header.length;
images.forEach((image, i) => {
  const entry = 6 + i * 16;
  header[entry] = sizes[i];
  header[entry + 1] = sizes[i];
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(image.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += image.length;
});
await writeFile(
  path.join(root, "app/favicon.ico"),
  Buffer.concat([header, ...images]),
);

const nativeRoot = path.resolve(
  root,
  "../../Syncbeats(apple)/Syncbeats/Syncbeats",
);
await writeFile(
  path.join(nativeRoot, "Assets.xcassets/SyncBeatsLogo.imageset/mark.svg"),
  svg(1024, true, true),
);
await writeFile(
  path.join(nativeRoot, "AppIcon.icon/Assets/linked-play.svg"),
  svg(1024, true),
);
const iconPath = path.join(nativeRoot, "AppIcon.icon/icon.json");
const icon = JSON.parse(await readFile(iconPath, "utf8"));
icon.groups = [
  {
    layers: [{ "image-name": "linked-play.svg", name: "Linked Play" }],
    lighting: "individual",
    shadow: { kind: "neutral", opacity: 0.2 },
    specular: "inside",
  },
];
await writeFile(iconPath, JSON.stringify(icon, null, 2) + "\n");
for (const file of ["bars.svg", "beam.svg"])
  await rm(path.join(nativeRoot, "AppIcon.icon/Assets", file), { force: true });
console.log(
  "Generated web, favicon, 1024px app artwork, and native Mac logo assets.",
);
