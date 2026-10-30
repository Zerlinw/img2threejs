import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dist = path.resolve(root, "dist-pipi-garden");
const sourceIndex = path.join(dist, "index.html");
const output = path.join(dist, "pipi-garden.html");

const html = fs.readFileSync(sourceIndex, "utf8");
const cssMatch = html.match(/<link\s+rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/i);
const jsMatch = html.match(/<script\s+type="module"[^>]*src="([^"]+)"[^>]*><\/script>/i);
if (!cssMatch || !jsMatch) {
  throw new Error("Could not locate built CSS/JS references in dist-pipi-garden/index.html");
}

const resolveAsset = (href) => {
  const clean = href.replace(/^\.\//, "");
  return path.join(dist, clean);
};

const css = fs.readFileSync(resolveAsset(cssMatch[1]), "utf8");
let js = fs.readFileSync(resolveAsset(jsMatch[1]), "utf8");
js = js.replace(/<\/script/gi, "<\\/script");

let inlined = html
  .replace(cssMatch[0], () => `<style>\n${css}\n</style>`)
  .replace(jsMatch[0], () => `<script type="module">\n${js}\n</script>`)
  .replace(/<link\s+rel="modulepreload"[^>]*>\s*/gi, "");

fs.writeFileSync(output, inlined);
const kib = (Buffer.byteLength(inlined) / 1024).toFixed(1);
console.log(`wrote ${output} (${kib} KiB)`);
