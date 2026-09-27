#!/usr/bin/env node
/**
 * Replace Mermaid code fences in built HTML with inline SVG (beautiful-mermaid).
 * Avoids client-side Mermaid inside Marp's SVG foreignObject wrapper.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderMermaidSVG } from "beautiful-mermaid";

const root = process.argv[2] || "dist";

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".html")) out.push(p);
  }
  return out;
}

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

const fence =
  /<pre[^>]*>\s*<code class="language-mermaid">([\s\S]*?)<\/code>\s*<\/pre>/g;

let files = 0;
let diagrams = 0;

for (const file of walk(root)) {
  const html = readFileSync(file, "utf8");
  if (!html.includes("language-mermaid")) continue;

  const next = html.replace(fence, (_, raw) => {
    const source = decodeEntities(raw).trim();
    try {
      const svg = renderMermaidSVG(source, {
        transparent: true,
        padding: 8,
        bg: "#ffffff",
        fg: "#212121",
        line: "#757575",
        accent: "#0075c9",
      });
      diagrams += 1;
      return `<div class="mermaid-diagram">${svg}</div>`;
    } catch (err) {
      console.error(`Mermaid render failed in ${file}:`, err.message);
      return `<pre><code class="language-mermaid">${raw}</code></pre>`;
    }
  });

  if (next !== html) {
    writeFileSync(file, next);
    files += 1;
  }
}

console.log(`Mermaid: rendered ${diagrams} diagram(s) in ${files} file(s)`);
