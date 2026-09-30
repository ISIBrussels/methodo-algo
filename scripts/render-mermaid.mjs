#!/usr/bin/env node
/**
 * Replace Mermaid code fences in built HTML with inline SVG (beautiful-mermaid).
 * Avoids client-side Mermaid inside Marp's SVG foreignObject wrapper.
 *
 * beautiful-mermaid does not parse Mermaid parallelograms (`id[/label/]`,
 * `id[\label\]`) — they fall through as rectangles with literal slashes.
 * We preprocess those nodes, then rewrite their SVG shapes to parallelograms.
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

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

/** Quote a node label when Mermaid rectangle syntax needs it. */
function formatRectLabel(label) {
  if (/["\[\]]/.test(label) || /[←→]/.test(label)) {
    return `["${label.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`;
  }
  return `[${label}]`;
}

/**
 * Map Mermaid parallelogram syntax to temporary rectangles.
 * Returns rewritten source + Map<id, 'forward'|'backward'>.
 *   forward  = [/label/]  (classic flowchart I/O lean)
 *   backward = [\label\]
 */
function preprocessParallelograms(source) {
  const lean = new Map();

  let out = source.replace(
    /\b([\w-]+)\[\/((?:\\.|[^\]\\])*?)\/\]/g,
    (_, id, label) => {
      lean.set(id, "forward");
      return `${id}${formatRectLabel(label)}`;
    },
  );

  out = out.replace(/\b([\w-]+)\[\\((?:\\.|[^\]\\])*?)\\\]/g, (_, id, label) => {
    lean.set(id, "backward");
    return `${id}${formatRectLabel(label)}`;
  });

  return { source: out, lean };
}

function parallelogramPoints(x, y, w, h, direction) {
  const skew = h * 0.25;
  if (direction === "backward") {
    return [
      `${x},${y}`,
      `${x + w - skew},${y}`,
      `${x + w},${y + h}`,
      `${x + skew},${y + h}`,
    ].join(" ");
  }
  // forward — [/label/]
  return [
    `${x + skew},${y}`,
    `${x + w},${y}`,
    `${x + w - skew},${y + h}`,
    `${x},${y + h}`,
  ].join(" ");
}

/**
 * Replace rectangle geometry for parallelogram node ids with a lean polygon.
 */
function applyParallelograms(svg, lean) {
  if (lean.size === 0) return svg;

  let next = svg;
  for (const [id, direction] of lean) {
    const idAttr = escapeAttr(id);
    const groupRe = new RegExp(
      `(<g class="node" data-id="${idAttr}" data-label="[^"]*" data-shape=")rectangle(">\\s*)` +
        `<rect\\s+x="([^"]+)"\\s+y="([^"]+)"\\s+width="([^"]+)"\\s+height="([^"]+)"` +
        `[^>]*?fill="([^"]*)"\\s+stroke="([^"]*)"\\s+stroke-width="([^"]*)"[^>]*/>`,
    );

    next = next.replace(
      groupRe,
      (_, pre, mid, x, y, w, h, fill, stroke, sw) => {
        const points = parallelogramPoints(
          Number(x),
          Number(y),
          Number(w),
          Number(h),
          direction,
        );
        return (
          `${pre}parallelogram${mid}` +
          `<polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />`
        );
      },
    );
  }
  return next;
}

/**
 * beautiful-mermaid paints opaque --bg pills behind every edge label (Yes/No…).
 * That reads as white boxes in dark slide themes. Make label chrome transparent
 * and inherit page text color for light/dark readability.
 */
function transparentizeEdgeLabels(svg) {
  return svg.replace(
    /<g class="edge-label"[^>]*>[\s\S]*?<\/g>/g,
    (group) =>
      group
        .replace(
          /<rect\b([^>]*?)\/>/g,
          (_, attrs) => {
            let next = attrs
              .replace(/\sfill="[^"]*"/g, ' fill="none"')
              .replace(/\sstroke="[^"]*"/g, ' stroke="none"')
              .replace(/\sstroke-width="[^"]*"/g, "");
            if (!/\sfill=/.test(next)) next += ' fill="none"';
            if (!/\sstroke=/.test(next)) next += ' stroke="none"';
            return `<rect${next}/>`;
          },
        )
        .replace(
          /(<text\b[^>]*?)\sfill="[^"]*"/g,
          '$1 fill="currentColor"',
        ),
  );
}

function parsePoints(pointsAttr) {
  return pointsAttr
    .trim()
    .split(/\s+/)
    .map((p) => {
      const [x, y] = p.split(",").map(Number);
      return { x, y };
    });
}

function pathLength(points) {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    len += Math.hypot(dx, dy);
  }
  return len;
}

/** Point at `distance` px along a polyline from its start. */
function pointAtDistance(points, distance) {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1 || distance <= 0) return { ...points[0] };

  let remaining = distance;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    const segLen = Math.hypot(dx, dy);
    if (remaining <= segLen || i === points.length - 1) {
      const t = segLen === 0 ? 0 : Math.min(1, remaining / segLen);
      return {
        x: points[i - 1].x + t * dx,
        y: points[i - 1].y + t * dy,
      };
    }
    remaining -= segLen;
  }
  return { ...points[points.length - 1] };
}

/**
 * beautiful-mermaid places edge labels at the path midpoint. On long Yes/No
 * branches (esp. LR cascades), that puts "Yes"/"No" far from the diamond.
 * Nudge each labeled edge's label near the source exit (~28px along the path).
 */
function nudgeEdgeLabelsNearSource(svg) {
  const EDGE_RE =
    /<polyline class="edge"[^>]*\bdata-from="([^"]*)"[^>]*\bdata-to="([^"]*)"[^>]*\bdata-label="([^"]+)"[^>]*\bpoints="([^"]+)"[^>]*\/>/g;
  const EDGE_RE_ALT =
    /<polyline class="edge"[^>]*\bpoints="([^"]+)"[^>]*\bdata-from="([^"]*)"[^>]*\bdata-to="([^"]*)"[^>]*\bdata-label="([^"]+)"[^>]*\/>/g;

  /** @type {Map<string, {x:number,y:number}>} */
  const targets = new Map();

  const collect = (from, to, label, pointsAttr) => {
    const points = parsePoints(pointsAttr);
    if (points.length < 2) return;
    const total = pathLength(points);
    // Stay near the diamond exit; never past ~35% of a short edge.
    const dist = Math.min(28, Math.max(14, total * 0.22));
    const pos = pointAtDistance(points, dist);
    targets.set(`${from}\0${to}\0${label}`, pos);
  };

  for (const m of svg.matchAll(EDGE_RE)) {
    collect(m[1], m[2], m[3], m[4]);
  }
  // Attribute order may vary; pick up any the first regex missed.
  for (const m of svg.matchAll(EDGE_RE_ALT)) {
    const key = `${m[2]}\0${m[3]}\0${m[4]}`;
    if (!targets.has(key)) collect(m[2], m[3], m[4], m[1]);
  }

  if (targets.size === 0) return svg;

  return svg.replace(
    /<g class="edge-label"([^>]*)>([\s\S]*?)<\/g>/g,
    (full, attrs, inner) => {
      const from = /data-from="([^"]*)"/.exec(attrs)?.[1];
      const to = /data-to="([^"]*)"/.exec(attrs)?.[1];
      const label = /data-label="([^"]*)"/.exec(attrs)?.[1];
      if (from == null || to == null || label == null) return full;
      const pos = targets.get(`${from}\0${to}\0${label}`);
      if (!pos) return full;

      const textMatch = /<text\b[^>]*\bx="([^"]+)"[^>]*\by="([^"]+)"/.exec(
        inner,
      );
      if (!textMatch) return full;
      const oldX = Number(textMatch[1]);
      const oldY = Number(textMatch[2]);
      const dx = pos.x - oldX;
      const dy = pos.y - oldY;
      if (Math.hypot(dx, dy) < 8) return full; // already near source

      const shifted = inner
        .replace(/\bx="([^"]+)"/g, (_, v) => `x="${Number(v) + dx}"`)
        .replace(/\by="([^"]+)"/g, (_, v) => `y="${Number(v) + dy}"`);
      return `<g class="edge-label"${attrs}>${shifted}</g>`;
    },
  );
}

function renderDiagram(source) {
  const { source: prepared, lean } = preprocessParallelograms(source);
  const svg = renderMermaidSVG(prepared, {
    transparent: true,
    padding: 8,
    bg: "#ffffff",
    fg: "#212121",
    line: "#757575",
    accent: "#0075c9",
  });
  return transparentizeEdgeLabels(
    nudgeEdgeLabelsNearSource(applyParallelograms(svg, lean)),
  );
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
      const svg = renderDiagram(source);
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
