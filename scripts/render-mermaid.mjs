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

/** Fullwidth brackets — beautiful-mermaid truncates ASCII `]` inside labels. */
const FW_OPEN = "\uFF3B"; // ［
const FW_CLOSE = "\uFF3D"; // ］

/** Quote a node label when Mermaid rectangle syntax needs it. */
function formatRectLabel(label) {
  // Keep [] out of the Mermaid source; restore to ASCII after SVG render.
  const safe = label.replace(/\[/g, FW_OPEN).replace(/\]/g, FW_CLOSE);
  if (/["\[\]]/.test(safe) || /[←→]/.test(safe)) {
    return `["${safe.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`;
  }
  return `[${safe}]`;
}

/** Put ASCII brackets back into SVG text / data-label after render. */
function restoreLabelBrackets(svg) {
  return svg.replaceAll(FW_OPEN, "[").replaceAll(FW_CLOSE, "]");
}

/**
 * Map Mermaid parallelogram syntax to temporary rectangles.
 * Returns rewritten source + Map<id, 'forward'|'backward'>.
 *   forward  = [/label/]  (classic flowchart I/O lean)
 *   backward = [\label\]
 */
function preprocessParallelograms(source) {
  const lean = new Map();

  // Labels may contain `]` (e.g. OUTPUT values[i]). Match until the
  // delimiter `/]` or `\]`, not the first bare `]`.
  let out = source.replace(
    /\b([\w-]+)\[\/([\s\S]*?)\/\]/g,
    (_, id, label) => {
      lean.set(id, "forward");
      return `${id}${formatRectLabel(label)}`;
    },
  );

  out = out.replace(/\b([\w-]+)\[\\([\s\S]*?)\\\]/g, (_, id, label) => {
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
        // Expand by the lean skew so labels (e.g. OUTPUT values[i]) are not
        // clipped by the slanted faces.
        const hh = Number(h);
        const skew = hh * 0.25;
        const points = parallelogramPoints(
          Number(x) - skew,
          Number(y),
          Number(w) + 2 * skew,
          hh,
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
 * beautiful-mermaid paints opaque --bg pills behind every edge label (Yes/No…)
 * and sets label text to font-weight 400. Make label chrome transparent, inherit
 * page text color, and bump weight for light/dark readability without shifting
 * the nudged near-diamond position.
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
        .replace(/(<text\b[^>]*)>/g, (_, open) => {
          let next = open
            .replace(/\sfill="[^"]*"/g, ' fill="currentColor"')
            .replace(/\sfont-weight="[^"]*"/g, ' font-weight="700"');
          if (!/\sfill=/.test(next)) next += ' fill="currentColor"';
          if (!/\sfont-weight=/.test(next)) next += ' font-weight="700"';
          return `${next}>`;
        }),
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

function diamondVertices(pointsAttr) {
  const pts = parsePoints(pointsAttr);
  if (pts.length < 4) return null;
  const byY = [...pts].sort((a, b) => a.y - b.y);
  const byX = [...pts].sort((a, b) => a.x - b.x);
  return {
    top: byY[0],
    bottom: byY[byY.length - 1],
    left: byX[0],
    right: byX[byX.length - 1],
    cx: (byX[0].x + byX[byX.length - 1].x) / 2,
    cy: (byY[0].y + byY[byY.length - 1].y) / 2,
  };
}

/**
 * Short outward stub along the rhombus diagonal so Yes/No leaves follow the
 * tip a few pixels before turning (avoids a T/L glued to the vertex).
 */
const DIAMOND_EXIT_STUB_PX = 10;

function diamondExitStub(d, side) {
  const v = d[side];
  const dx = v.x - d.cx;
  const dy = v.y - d.cy;
  const half = Math.hypot(dx, dy) || 1;
  const stub = Math.min(DIAMOND_EXIT_STUB_PX, half * 0.22);
  return {
    x: v.x + (dx / half) * stub,
    y: v.y + (dy / half) * stub,
  };
}

/** Visual midpoints of a parallelogram's faces (skew shifts top/bottom). */
function parallelogramPorts(pointsAttr) {
  const pts = parsePoints(pointsAttr);
  if (pts.length < 4) return null;
  const ys = pts.map((p) => p.y);
  const xs = pts.map((p) => p.x);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const top = pts.filter((p) => Math.abs(p.y - minY) < 0.5);
  const bot = pts.filter((p) => Math.abs(p.y - maxY) < 0.5);
  if (top.length < 2 || bot.length < 2) return null;
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  // Slanted left/right faces: endpoints are the max/min-X corners of the
  // top and bottom edges (not "two rightmost by x", which is ambiguous when
  // skew is small). Midpoint of top-right↔bottom-right = mid of right lean.
  const topLeft = top.reduce((a, b) => (a.x < b.x ? a : b));
  const topRight = top.reduce((a, b) => (a.x > b.x ? a : b));
  const botLeft = bot.reduce((a, b) => (a.x < b.x ? a : b));
  const botRight = bot.reduce((a, b) => (a.x > b.x ? a : b));
  return {
    top: mid(top[0], top[1]),
    bottom: mid(bot[0], bot[1]),
    left: mid(topLeft, botLeft),
    right: mid(topRight, botRight),
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
}

function formatPoints(points) {
  return points
    .map(
      (p) =>
        `${Math.round(p.x * 1000) / 1000},${Math.round(p.y * 1000) / 1000}`,
    )
    .join(" ");
}

function dedupePoints(points) {
  const out = [];
  for (const p of points) {
    const prev = out[out.length - 1];
    if (!prev || Math.hypot(prev.x - p.x, prev.y - p.y) > 0.5) out.push(p);
  }
  return out;
}

/**
 * Pull the last vertex back along the final segment so a marker-end arrowhead
 * sits on the target border. Chromium paints markers above later siblings, so
 * an endpoint flush with a node face otherwise shows the arrow through the fill.
 */
const ARROWHEAD_INSET_PX = 10;

function insetEndpoint(points, dist = ARROWHEAD_INSET_PX) {
  if (!points || points.length < 2) return points;
  const pts = points.map((p) => ({ ...p }));
  const a = pts[pts.length - 2];
  const b = pts[pts.length - 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const d = Math.min(dist, Math.max(0, len - 0.5));
  pts[pts.length - 1] = {
    x: b.x - (dx / len) * d,
    y: b.y - (dy / len) * d,
  };
  return dedupePoints(pts);
}

/**
 * After rectangles become parallelograms, edge stubs still sit on the old
 * axis-aligned top/bottom centers. Snap vertical landings onto the visual mid
 * of each slanted face so Yes/No drops look centered on I/O nodes.
 * Outgoing stubs are left alone so TB spines into a diamond stay vertical.
 */
function retargetParallelogramPorts(svg) {
  /** @type {Map<string, ReturnType<typeof parallelogramPorts>>} */
  const ports = new Map();
  for (const m of svg.matchAll(
    /<g class="node" data-id="([^"]+)"[^>]*data-shape="parallelogram"[^>]*>([\s\S]*?)<\/g>/g,
  )) {
    const poly = /<polygon points="([^"]+)"/.exec(m[2]);
    if (!poly) continue;
    const p = parallelogramPorts(poly[1]);
    if (p) ports.set(m[1], p);
  }
  if (ports.size === 0) return svg;

  return svg.replace(/<polyline class="edge"([^>]*)\/>/g, (full, attrs) => {
    const to = /data-to="([^"]*)"/.exec(attrs)?.[1];
    const pointsAttr = /points="([^"]+)"/.exec(attrs)?.[1];
    if (!to || !ports.has(to) || !pointsAttr) return full;

    let pts = parsePoints(pointsAttr);
    if (pts.length < 2) return full;

    const p = ports.get(to);
    const prev = pts[pts.length - 2];
    const end = pts[pts.length - 1];
    const vertical =
      Math.abs(prev.x - end.x) <= 1 && Math.abs(prev.y - end.y) > 1;
    const horizontal =
      Math.abs(prev.y - end.y) <= 1 && Math.abs(prev.x - end.x) > 1;
    if (!vertical && !horizontal) return full;

    const target = vertical
      ? prev.y <= end.y
        ? p.top
        : p.bottom
      : prev.x <= end.x
        ? p.left
        : p.right;
    if (Math.hypot(target.x - end.x, target.y - end.y) <= 0.5) return full;

    pts[pts.length - 1] = { ...target };
    if (vertical) {
      pts[pts.length - 2] = { x: target.x, y: prev.y };
    } else {
      pts[pts.length - 2] = { x: prev.x, y: target.y };
    }
    pts = dedupePoints(pts);
    return `<polyline class="edge"${attrs.replace(
      /points="[^"]+"/,
      `points="${formatPoints(pts)}"`,
    )}/>`;
  });
}

/**
 * Translate a node group's geometry (polygon/rect/text) by (dx, dy).
 */
function translateNodeGroup(groupInner, dx, dy) {
  // Translate every vertex by the same (dx, dy) — preserves parallelogram
  // lean. Must keep the leading "<" on <polygon> (regression in 754a5b9).
  // Multi-line labels use absolute <tspan x="…">; shift those too or the
  // text stays behind after a polygon-only move (REPEAT diamond).
  const shiftXY = (attrs) => {
    let out = attrs;
    out = out.replace(/(^|\s)x="([^"]+)"/, (_, sp, v) => `${sp}x="${Number(v) + dx}"`);
    out = out.replace(/(^|\s)y="([^"]+)"/, (_, sp, v) => `${sp}y="${Number(v) + dy}"`);
    return out;
  };
  let next = groupInner.replace(
    /<polygon points="([^"]+)"/g,
    (_, pts) =>
      `<polygon points="${formatPoints(
        parsePoints(pts).map((p) => ({ x: p.x + dx, y: p.y + dy })),
      )}"`,
  );
  next = next.replace(/<rect\b([^>]*?)\/>/g, (_, attrs) => `<rect${shiftXY(attrs)}/>`);
  next = next.replace(/<text\b([^>]*)>/g, (_, attrs) => `<text${shiftXY(attrs)}>`);
  next = next.replace(/<tspan\b([^>]*)>/g, (_, attrs) => `<tspan${shiftXY(attrs)}>`);
  return next;
}

/**
 * Pin diamond label on the rhombus centre.
 * Horizontal: text-anchor=middle at cx.
 * Vertical: centre the multi-line ink bbox (tspan/dy stack) on cy.
 * Ink extents match Chromium getBBox for this font stack
 * (~1.08·fs above / ~0.31·fs below each baseline). First-line dy bias
 * from beautiful-mermaid is folded into <text y> so the stack is even.
 */
function centerDiamondLabel(groupInner, cx, cy) {
  return groupInner.replace(
    /<text\b([^>]*)>([\s\S]*?)<\/text>/g,
    (_, attrs, inner) => {
      const fs = Number(/font-size="([^"]+)"/.exec(attrs)?.[1] ?? 13);
      const inkAbove = fs * 1.08;
      const inkBelow = fs * 0.31;
      let textY = Number(/(?:^|\s)y="([^"]+)"/.exec(attrs)?.[1] ?? cy);

      /** @type {{absY: number|null, dy: number|null}[]} */
      const spans = [];
      const tspanRe = /<tspan\b([^>]*)>/g;
      let m;
      while ((m = tspanRe.exec(inner))) {
        const a = m[1];
        const abs = /(?:^|\s)y="([^"]+)"/.exec(a);
        const dy = /(?:^|\s)dy="([^"]+)"/.exec(a);
        spans.push({
          absY: abs ? Number(abs[1]) : null,
          dy: dy ? Number(dy[1]) : null,
        });
      }

      // Absolute baselines before rewrite (SVG dy is cumulative).
      let yCursor = textY;
      const baselines = [];
      if (spans.length === 0) {
        baselines.push(textY);
      } else {
        for (const sp of spans) {
          if (sp.absY != null) yCursor = sp.absY;
          if (sp.dy != null) yCursor += sp.dy;
          baselines.push(yCursor);
        }
      }

      const top = baselines[0] - inkAbove;
      const bottom = baselines[baselines.length - 1] + inkBelow;
      const mid = (top + bottom) / 2;
      const delta = cy - mid;

      // Rebase: fold first dy into textY, keep inter-line steps.
      /** @type {(number|null)[]} */
      let newDys = spans.map((sp) => sp.dy);
      if (spans.length > 0 && spans.every((sp) => sp.absY == null)) {
        textY = baselines[0] + delta; // first baseline after shift
        newDys = spans.map((sp, i) => (i === 0 ? 0 : sp.dy));
      } else {
        textY += delta;
      }

      let outAttrs = attrs;
      if (/(?:^|\s)x="/.test(outAttrs)) {
        outAttrs = outAttrs.replace(/(^|\s)x="[^"]+"/, `$1x="${cx}"`);
      } else {
        outAttrs = ` x="${cx}"${outAttrs}`;
      }
      if (/(?:^|\s)y="/.test(outAttrs)) {
        outAttrs = outAttrs.replace(/(^|\s)y="[^"]+"/, `$1y="${textY}"`);
      } else {
        outAttrs = ` y="${textY}"${outAttrs}`;
      }
      if (!/text-anchor=/.test(outAttrs)) {
        outAttrs += ` text-anchor="middle"`;
      }

      let spanIdx = 0;
      const newInner = inner.replace(/<tspan\b([^>]*)>/g, (_full, a) => {
        const sp = spans[spanIdx];
        const dyVal = newDys[spanIdx];
        spanIdx += 1;
        let next = a;
        if (/(?:^|\s)x="/.test(next)) {
          next = next.replace(/(^|\s)x="[^"]+"/, `$1x="${cx}"`);
        } else {
          next = ` x="${cx}"${next}`;
        }
        if (sp?.absY != null) {
          next = next.replace(/(^|\s)y="[^"]+"/, `$1y="${sp.absY + delta}"`);
        }
        if (dyVal != null) {
          if (/(?:^|\s)dy="/.test(next)) {
            next = next.replace(/(^|\s)dy="[^"]+"/, `$1dy="${dyVal}"`);
          } else {
            next += ` dy="${dyVal}"`;
          }
        }
        return `<tspan${next}>`;
      });

      return `<text${outAttrs}>${newInner}</text>`;
    },
  );
}

/** Attachment point on a node face toward a diamond exit. */
function nodeFacePort(groupInner, shape, side) {
  const poly = /<polygon points="([^"]+)"/.exec(groupInner);
  const rect = /<rect\s+x="([^"]+)"\s+y="([^"]+)"\s+width="([^"]+)"\s+height="([^"]+)"/.exec(
    groupInner,
  );
  if (shape === "parallelogram" && poly) {
    const ports = parallelogramPorts(poly[1]);
    if (!ports) return null;
    if (side === "top" || side === "bottom" || side === "left" || side === "right") {
      return ports[side];
    }
  }
  if (poly) {
    const d = diamondVertices(poly[1]);
    if (d && (side === "left" || side === "right" || side === "top" || side === "bottom")) {
      return { ...d[side] };
    }
    if (d) return { x: d.cx, y: d.cy };
  }
  if (rect) {
    const x = Number(rect[1]);
    const y = Number(rect[2]);
    const w = Number(rect[3]);
    const h = Number(rect[4]);
    const cx = x + w / 2;
    const cy = y + h / 2;
    if (side === "top") return { x: cx, y };
    if (side === "bottom") return { x: cx, y: y + h };
    if (side === "left") return { x, y: cy };
    if (side === "right") return { x: x + w, y: cy };
    return { x: cx, y: cy };
  }
  return null;
}

/**
 * beautiful-mermaid / ELK treat diamonds as rectangles, so decision exits
 * leave from a face instead of the flowchart corners.
 *
 * Convention (post-SVG, figé Sylvain):
 * - TB (haut→bas) Yes/No → coins gauche / droite (côté selon biais horizontal)
 * - LR (gauche→droite) Yes/No → coins haut / bas (côté selon biais vertical)
 * - Sortie Yes/No : court stub dans l'axe de la diagonale, puis virage
 * - Branch targets (OUTPUT…) are shifted onto that post-stub axis
 *   → descente verticale TB / traverse horizontale LR, pas un T collé à la pointe
 * - Entrée losange : arrive droit sur le vertex « en face » (LR → gauche /
 *   TB → haut), sans stub ni petit segment collé à l'arrivée
 * - WHILE loop return → coin bas (approche par le bas)
 * - Autres extrémités losange → snap au coin le plus proche / selon direction
 *
 * Mermaid source stays simple: `C -->|Yes| D` / `C -->|No| E`.
 */
function rewireDiamondPorts(svg) {
  /** @type {Map<string, {shape:string, inner:string, verts:ReturnType<typeof diamondVertices>|null}>} */
  const nodes = new Map();
  for (const m of svg.matchAll(
    /<g class="node" data-id="([^"]+)"[^>]*data-shape="([^"]+)"[^>]*>([\s\S]*?)<\/g>/g,
  )) {
    const poly = /<polygon points="([^"]+)"/.exec(m[3]);
    nodes.set(m[1], {
      shape: m[2],
      inner: m[3],
      verts: m[2] === "diamond" && poly ? diamondVertices(poly[1]) : null,
    });
  }

  /** @type {Map<string, ReturnType<typeof diamondVertices>>} */
  const diamonds = new Map();
  for (const [id, n] of nodes) {
    if (n.verts) diamonds.set(id, n.verts);
  }
  if (diamonds.size === 0) return svg;

  /** @type {Map<string, 'left'|'right'|'top'|'bottom'>} */
  const portAssign = new Map();
  /** @type {Map<string, {label:string, bias:number, axis:'tb'|'lr', to:string}[]>} */
  const decisionEdges = new Map();

  for (const m of svg.matchAll(/<polyline class="edge"([^>]*)\/>/g)) {
    const attrs = m[1];
    const from = /data-from="([^"]*)"/.exec(attrs)?.[1];
    const to = /data-to="([^"]*)"/.exec(attrs)?.[1];
    const label = (/data-label="([^"]*)"/.exec(attrs)?.[1] ?? "")
      .trim()
      .toLowerCase();
    const pointsAttr = /points="([^"]+)"/.exec(attrs)?.[1];
    if (!from || !to || !diamonds.has(from) || !pointsAttr) continue;
    if (label !== "yes" && label !== "no") continue;
    const pts = parsePoints(pointsAttr);
    if (pts.length < 2) continue;
    const d = diamonds.get(from);
    const end = pts[pts.length - 1];
    const verticalExit =
      Math.abs(pts[1].y - pts[0].y) >= Math.abs(pts[1].x - pts[0].x);
    const axis = verticalExit ? "tb" : "lr";
    let bias = 0;
    if (axis === "tb") {
      for (const p of pts) bias += p.x - d.cx;
      bias += 2 * (end.x - d.cx);
    } else {
      for (const p of pts) bias += p.y - d.cy;
      bias += 2 * (end.y - d.cy);
    }
    if (!decisionEdges.has(from)) decisionEdges.set(from, []);
    decisionEdges.get(from).push({ label, bias, axis, to });
  }

  for (const [id, edges] of decisionEdges) {
    const axis = edges[0]?.axis ?? "tb";
    const yes = edges.find((e) => e.label === "yes");
    const no = edges.find((e) => e.label === "no");
    const pair =
      axis === "tb"
        ? /** @type {const} */ (["right", "left"])
        : /** @type {const} */ (["bottom", "top"]);
    const [pos, neg] = pair;
    if (yes && no) {
      if (yes.bias >= no.bias) {
        portAssign.set(`${id}\0yes`, pos);
        portAssign.set(`${id}\0no`, neg);
      } else {
        portAssign.set(`${id}\0yes`, neg);
        portAssign.set(`${id}\0no`, pos);
      }
    } else {
      for (const e of edges) {
        portAssign.set(`${id}\0${e.label}`, e.bias >= 0 ? pos : neg);
      }
    }
  }

  // Incoming edges per node. Skip shifting shared spine / loop-back targets
  // (e.g. REPEAT No → INPUT that START already feeds) — that pulls the column
  // off-axis and clips the diagram.
  /** @type {Map<string, string[]>} */
  const incomingFrom = new Map();
  for (const m of svg.matchAll(/<polyline class="edge"([^>]*)\/>/g)) {
    const from = /data-from="([^"]*)"/.exec(m[1])?.[1];
    const to = /data-to="([^"]*)"/.exec(m[1])?.[1];
    if (!from || !to) continue;
    if (!incomingFrom.has(to)) incomingFrom.set(to, []);
    incomingFrom.get(to).push(from);
  }

  // Shift non-diamond Yes/No targets so their face centre sits on the exit axis.
  /** @type {Map<string, {dx:number, dy:number}>} */
  const shifts = new Map();
  for (const [from, edges] of decisionEdges) {
    const d = diamonds.get(from);
    for (const e of edges) {
      const assigned = portAssign.get(`${from}\0${e.label}`);
      if (!assigned) continue;
      const target = nodes.get(e.to);
      if (!target || target.shape === "diamond") continue;
      if (shifts.has(e.to)) continue;
      const others = (incomingFrom.get(e.to) || []).filter((src) => src !== from);
      if (others.length > 0) continue;
      const face =
        assigned === "left" || assigned === "right" ? "top" : "left";
      const port = nodeFacePort(target.inner, target.shape, face);
      if (!port) continue;
      const stub = diamondExitStub(d, assigned);
      if (assigned === "left" || assigned === "right") {
        shifts.set(e.to, { dx: stub.x - port.x, dy: 0 });
      } else {
        shifts.set(e.to, { dx: 0, dy: stub.y - port.y });
      }
    }
  }

  // Cascade the same shift to exclusive descendants (e.g. OUTPUT↑ then END),
  // so LR/TB branch tails stay attached after the Yes/No target moves.
  let cascaded = true;
  while (cascaded) {
    cascaded = false;
    for (const [to, parents] of incomingFrom) {
      if (shifts.has(to) || diamonds.has(to)) continue;
      if (parents.length === 0) continue;
      if (!parents.every((p) => shifts.has(p))) continue;
      const s0 = shifts.get(parents[0]);
      if (
        !parents.every((p) => {
          const s = shifts.get(p);
          return s && s.dx === s0.dx && s.dy === s0.dy;
        })
      ) {
        continue;
      }
      shifts.set(to, { ...s0 });
      cascaded = true;
    }
  }

  let next = svg;
  for (const [id, { dx, dy }] of shifts) {
    if (Math.hypot(dx, dy) < 0.5) continue;
    const idAttr = escapeAttr(id);
    next = next.replace(
      new RegExp(
        `(<g class="node" data-id="${idAttr}"[^>]*>)([\\s\\S]*?)(<\\/g>)`,
      ),
      (_, open, inner, close) =>
        `${open}${translateNodeGroup(inner, dx, dy)}${close}`,
    );
    // Move every edge endpoint that touches this node. Do not drag the other
    // end when that neighbour is also shifted (avoids double-applying dy on
    // OUTPUT→END after cascade).
    next = next.replace(/<polyline class="edge"([^>]*)\/>/g, (full, attrs) => {
      const from = /data-from="([^"]*)"/.exec(attrs)?.[1];
      const to = /data-to="([^"]*)"/.exec(attrs)?.[1];
      const pointsAttr = /points="([^"]+)"/.exec(attrs)?.[1];
      if (!pointsAttr || (from !== id && to !== id)) return full;
      const pts = parsePoints(pointsAttr);
      if (from === id) {
        const old = { ...pts[0] };
        pts[0] = { x: old.x + dx, y: old.y + dy };
        if (pts.length > 1 && !shifts.has(to)) {
          if (Math.abs(pts[1].x - old.x) < 1) {
            pts[1] = { x: pts[0].x, y: pts[1].y };
          }
          if (Math.abs(pts[1].y - old.y) < 1) {
            pts[1] = { x: pts[1].x, y: pts[0].y };
          }
        }
      }
      if (to === id) {
        const last = pts.length - 1;
        const old = { ...pts[last] };
        pts[last] = { x: old.x + dx, y: old.y + dy };
        if (last >= 1 && !shifts.has(from)) {
          if (Math.abs(pts[last - 1].x - old.x) < 1) {
            pts[last - 1] = { x: pts[last].x, y: pts[last - 1].y };
          }
          if (Math.abs(pts[last - 1].y - old.y) < 1) {
            pts[last - 1] = { x: pts[last - 1].x, y: pts[last].y };
          }
        }
      }
      return `<polyline class="edge"${attrs.replace(
        /points="[^"]+"/,
        `points="${formatPoints(dedupePoints(pts))}"`,
      )}/>`;
    });
    // Refresh cached inner for later face lookups.
    const refreshed = new RegExp(
      `<g class="node" data-id="${idAttr}"[^>]*data-shape="([^"]+)"[^>]*>([\\s\\S]*?)<\\/g>`,
    ).exec(next);
    if (refreshed) {
      nodes.set(id, {
        shape: refreshed[1],
        inner: refreshed[2],
        verts: null,
      });
    }
  }

  return next.replace(/<polyline class="edge"([^>]*)\/>/g, (full, attrs) => {
    const from = /data-from="([^"]*)"/.exec(attrs)?.[1];
    const to = /data-to="([^"]*)"/.exec(attrs)?.[1];
    const label = (/data-label="([^"]*)"/.exec(attrs)?.[1] ?? "").trim();
    const pointsAttr = /points="([^"]+)"/.exec(attrs)?.[1];
    if (!from || !to || !pointsAttr) return full;

    let pts = parsePoints(pointsAttr);
    if (pts.length < 2) return full;
    let changed = false;

    if (diamonds.has(from)) {
      const d = diamonds.get(from);
      const assigned = portAssign.get(`${from}\0${label.toLowerCase()}`);
      if (assigned) {
        const v = d[assigned];
        const stub = diamondExitStub(d, assigned);
        const targetNode = nodes.get(to);
        if (assigned === "left" || assigned === "right") {
          // TB: stub along the horizontal diagonal, then drop vertically.
          let end = { ...pts[pts.length - 1] };
          if (targetNode && targetNode.shape !== "diamond") {
            const face = nodeFacePort(targetNode.inner, targetNode.shape, "top");
            if (face) end = face;
            pts = dedupePoints([
              { ...v },
              { ...stub },
              { x: stub.x, y: end.y },
              { ...end },
            ]);
          } else if (targetNode?.verts) {
            // Enter next diamond via top tip: bend away from the tip so the
            // final segment is vertical (no horizontal stub glued to the tip).
            end = { ...targetNode.verts.top };
            const midY = (stub.y + end.y) / 2;
            pts = dedupePoints([
              { ...v },
              { ...stub },
              { x: stub.x, y: midY },
              { x: end.x, y: midY },
              { ...end },
            ]);
          } else {
            pts = dedupePoints([
              { ...v },
              { ...stub },
              { x: stub.x, y: end.y },
              { ...end },
            ]);
          }
        } else {
          // LR: stub along the vertical diagonal, then run horizontally.
          let end = { ...pts[pts.length - 1] };
          if (targetNode && targetNode.shape !== "diamond") {
            const face = nodeFacePort(
              targetNode.inner,
              targetNode.shape,
              "left",
            );
            if (face) end = face;
            pts = dedupePoints([
              { ...v },
              { ...stub },
              { x: end.x, y: stub.y },
              { ...end },
            ]);
          } else if (targetNode?.verts) {
            // Enter next diamond via left tip: bend away from the tip so the
            // final segment is horizontal (no vertical stub glued to the tip).
            end = { ...targetNode.verts.left };
            const midX = (stub.x + end.x) / 2;
            pts = dedupePoints([
              { ...v },
              { ...stub },
              { x: midX, y: stub.y },
              { x: midX, y: end.y },
              { ...end },
            ]);
          } else {
            pts = dedupePoints([
              { ...v },
              { ...stub },
              { x: end.x, y: stub.y },
              { ...end },
            ]);
          }
        }
        changed = true;
      } else {
        const verts = [d.top, d.right, d.bottom, d.left];
        let best = verts[0];
        let bestD = Infinity;
        for (const vert of verts) {
          const dist = Math.hypot(vert.x - pts[0].x, vert.y - pts[0].y);
          if (dist < bestD) {
            bestD = dist;
            best = vert;
          }
        }
        if (bestD > 0.75) {
          pts[0] = { ...best };
          changed = true;
        }
      }
    }

    if (diamonds.has(to)) {
      const d = diamonds.get(to);
      const end = pts[pts.length - 1];
      const corners = [
        ["top", d.top],
        ["right", d.right],
        ["bottom", d.bottom],
        ["left", d.left],
      ];
      let corner = corners.find(
        ([, v]) => Math.hypot(v.x - end.x, v.y - end.y) <= 0.75,
      )?.[0];
      if (!corner) {
        const prev = pts[pts.length - 2];
        const dx = end.x - prev.x;
        const dy = end.y - prev.y;
        corner =
          Math.abs(dy) >= Math.abs(dx)
            ? dy < 0
              ? "bottom"
              : "top"
            : dx < 0
              ? "right"
              : "left";
      }
      const target = d[corner];
      const prev = pts[pts.length - 2];
      // Final approach must follow the facing axis: left/right → horizontal,
      // top/bottom → vertical. No stub glued to the tip on arrival.
      if (corner === "left" || corner === "right") {
        if (
          Math.abs(prev.y - target.y) > 0.5 ||
          Math.hypot(target.x - end.x, target.y - end.y) > 0.75
        ) {
          if (Math.abs(prev.x - target.x) <= 0.5) {
            // Vertical stub into the tip: bend earlier, then arrive horizontally.
            const back =
              pts.length >= 3 ? pts[pts.length - 3] : { x: prev.x - 24, y: prev.y };
            const midX = (back.x + target.x) / 2;
            pts = dedupePoints([
              ...pts.slice(0, -2),
              { x: midX, y: prev.y },
              { x: midX, y: target.y },
              { ...target },
            ]);
          } else {
            pts[pts.length - 2] = { x: prev.x, y: target.y };
            pts[pts.length - 1] = { ...target };
            pts = dedupePoints(pts);
          }
          changed = true;
        }
      } else if (
        Math.abs(prev.x - target.x) > 0.5 ||
        Math.hypot(target.x - end.x, target.y - end.y) > 0.75
      ) {
        if (Math.abs(prev.y - target.y) <= 0.5) {
          // Horizontal stub into the tip: bend earlier, then arrive vertically.
          const back =
            pts.length >= 3 ? pts[pts.length - 3] : { x: prev.x, y: prev.y - 24 };
          const midY = (back.y + target.y) / 2;
          pts = dedupePoints([
            ...pts.slice(0, -2),
            { x: prev.x, y: midY },
            { x: target.x, y: midY },
            { ...target },
          ]);
        } else {
          pts[pts.length - 2] = { x: target.x, y: prev.y };
          pts[pts.length - 1] = { ...target };
          pts = dedupePoints(pts);
        }
        changed = true;
      }
    }

    if (!changed) return full;
    return `<polyline class="edge"${attrs.replace(
      /points="[^"]+"/,
      `points="${formatPoints(pts)}"`,
    )}/>`;
  });
}

/**
 * beautiful-mermaid places edge labels at the path midpoint. On long Yes/No
 * branches (esp. LR cascades), that puts "Yes"/"No" far from the diamond.
 * Nudge each labeled edge's label near the source exit (~28px along the path).
 */
function nudgeEdgeLabelsNearSource(svg) {
  /** @type {Map<string, {x:number,y:number}>} */
  const targets = new Map();

  for (const m of svg.matchAll(/<polyline class="edge"([^>]*)\/>/g)) {
    const attrs = m[1];
    const from = /data-from="([^"]*)"/.exec(attrs)?.[1];
    const to = /data-to="([^"]*)"/.exec(attrs)?.[1];
    const label = /data-label="([^"]*)"/.exec(attrs)?.[1];
    const pointsAttr = /points="([^"]+)"/.exec(attrs)?.[1];
    if (!from || !to || !label || !pointsAttr) continue;
    if (!label.trim()) continue;
    const points = parsePoints(pointsAttr);
    if (points.length < 2) continue;
    const total = pathLength(points);
    // Stay near the diamond exit; never past ~35% of a short edge.
    const dist = Math.min(28, Math.max(14, total * 0.22));
    const pos = pointAtDistance(points, dist);
    targets.set(`${from}\0${to}\0${label}`, pos);
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
      // Park Yes/No on the diamond EXIT STUB (first segment), off the stroke —
      // not mid-path (which often already turned onto the branch drop).
      const pts = (() => {
        for (const m of svg.matchAll(/<polyline class="edge"([^>]*)\/>/g)) {
          const a = m[1];
          const f = /data-from="([^"]*)"/.exec(a)?.[1];
          const t = /data-to="([^"]*)"/.exec(a)?.[1];
          const lab = /data-label="([^"]*)"/.exec(a)?.[1];
          const p = /points="([^"]+)"/.exec(a)?.[1];
          if (f === from && t === to && lab === label && p) return parsePoints(p);
        }
        return null;
      })();
      let aimX = pos.x;
      let aimY = pos.y;
      if (pts && pts.length >= 2) {
        const stubMid = {
          x: (pts[0].x + pts[1].x) / 2,
          y: (pts[0].y + pts[1].y) / 2,
        };
        const horizontal =
          Math.abs(pts[1].y - pts[0].y) < Math.abs(pts[1].x - pts[0].x);
        if (horizontal) {
          // Below the stub; for a left exit also clear of the vertical drop
          // that starts at the stub tip (avoid "Yes" sitting on the shaft).
          const tip = pts[1];
          const leftish = tip.x < pts[0].x;
          aimX = leftish ? tip.x - 20 : stubMid.x;
          aimY = stubMid.y + 18;
        } else {
          const rightish = pts[1].x >= pts[0].x;
          aimX = stubMid.x + (rightish ? 16 : -16);
          aimY = stubMid.y;
        }
      }
      const dx = aimX - oldX;
      const dy = aimY - oldY;
      if (Math.hypot(dx, dy) < 0.5) return full;

      const shifted = inner
        .replace(/\bx="([^"]+)"/g, (_, v) => `x="${Number(v) + dx}"`)
        .replace(/\by="([^"]+)"/g, (_, v) => `y="${Number(v) + dy}"`);
      return `<g class="edge-label"${attrs}>${shifted}</g>`;
    },
  );
}

/**
 * Empty / ZWSP-only rectangle nodes are layout junctions for ELK: they break
 * bad cycles (e.g. diamond No → shared INPUT) without adding a real step.
 * After diamond rewiring, merge edges through the junction and drop the box.
 */
function isJunctionLabel(label) {
  return String(label).replace(/[\s\u200b\u200c\u200d\ufeff]/g, "") === "";
}

function nodeCenter(groupInner, shape) {
  const poly = /<polygon points="([^"]+)"/.exec(groupInner);
  const rect = /<rect\s+x="([^"]+)"\s+y="([^"]+)"\s+width="([^"]+)"\s+height="([^"]+)"/.exec(
    groupInner,
  );
  if (poly) {
    const pts = parsePoints(poly[1]);
    if (pts.length === 0) return null;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    return {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: (Math.min(...ys) + Math.max(...ys)) / 2,
    };
  }
  if (rect) {
    return {
      x: Number(rect[1]) + Number(rect[3]) / 2,
      y: Number(rect[2]) + Number(rect[4]) / 2,
    };
  }
  // stadium / circle text fallback
  const text = /<text\b[^>]*\bx="([^"]+)"[^>]*\by="([^"]+)"/.exec(groupInner);
  if (text) return { x: Number(text[1]), y: Number(text[2]) };
  void shape;
  return null;
}

function collapseJunctionNodes(svg) {
  /** @type {Map<string, {x:number,y:number}>} */
  const junctions = new Map();
  /** @type {Map<string, {shape:string, inner:string, center:{x:number,y:number}|null}>} */
  const nodes = new Map();
  for (const m of svg.matchAll(
    /<g class="node" data-id="([^"]+)"[^>]*data-label="([^"]*)"[^>]*data-shape="([^"]+)"[^>]*>([\s\S]*?)<\/g>/g,
  )) {
    const center = nodeCenter(m[4], m[3]);
    nodes.set(m[1], { shape: m[3], inner: m[4], center });
    if (!isJunctionLabel(decodeEntities(m[2]))) continue;
    if (center) junctions.set(m[1], center);
  }
  if (junctions.size === 0) return svg;

  /** @type {{from:string,to:string,label:string,points:string,attrs:string}[]} */
  const edges = [];
  let next = svg.replace(/<polyline class="edge"([^>]*)\/>/g, (full, attrs) => {
    const from = /data-from="([^"]*)"/.exec(attrs)?.[1];
    const to = /data-to="([^"]*)"/.exec(attrs)?.[1];
    const label = /data-label="([^"]*)"/.exec(attrs)?.[1] ?? "";
    const points = /points="([^"]+)"/.exec(attrs)?.[1];
    if (!from || !to || !points) return full;
    edges.push({ from, to, label, points, attrs });
    // Drop edges that touch a junction; rebuilt below.
    if (junctions.has(from) || junctions.has(to)) return "";
    return full;
  });

  const rebuilt = [];
  for (const e of edges) {
    if (junctions.has(e.to) && !junctions.has(e.from)) {
      const jid = e.to;
      const outs = edges.filter((o) => o.from === jid && !junctions.has(o.to));
      const mid = junctions.get(jid);
      const stroke = /stroke="([^"]+)"/.exec(e.attrs)?.[1] ?? "#757575";
      const sw = /stroke-width="([^"]+)"/.exec(e.attrs)?.[1] ?? "1.5";
      for (const o of outs) {
        const inbound = parsePoints(e.points);
        const outbound = parsePoints(o.points);
        if (inbound.length < 2 || outbound.length < 2) continue;
        const target = nodes.get(o.to);
        const exitCol = inbound[Math.min(1, inbound.length - 1)];
        const start = inbound[0];
        // Prefer a clear face on the real target (INPUT…), not ELK's
        // outbound stub which often lands on the spine above the node.
        let end = outbound[outbound.length - 1];
        let sideApproach = null;
        if (target?.center) {
          const upLoop = target.center.y < start.y - 8;
          const leftLoop = target.center.x < start.x - 8;
          if (upLoop) {
            // TB No→INPUT: climb outside the exit column, enter from the side.
            sideApproach =
              exitCol.x >= start.x ? "right" : "left";
            const face =
              nodeFacePort(target.inner, target.shape, sideApproach) ||
              nodeFacePort(target.inner, target.shape, "bottom");
            if (face) end = face;
          } else if (leftLoop || target.center.x > start.x + 8) {
            // LR No→INPUT: run below/above, enter from the bottom or top.
            sideApproach = exitCol.y >= start.y ? "bottom" : "top";
            const face =
              nodeFacePort(target.inner, target.shape, sideApproach) ||
              nodeFacePort(target.inner, target.shape, "left");
            if (face) end = face;
          }
        }

        let pts;
        // Keep only the diamond exit stub (vertex → outward tip). Drop the
        // long ELK run to the junction so the return stays compact.
        const stubPts =
          inbound.length >= 2 ? inbound.slice(0, 2) : [...inbound];
        if (sideApproach === "right" || sideApproach === "left") {
          // TB No→INPUT: sortie latérale, remontée directe (pas de stub vers le bas).
          const pad = 18;
          const stubY = exitCol.y;
          const colX =
            sideApproach === "right"
              ? Math.max(exitCol.x, end.x + pad)
              : Math.min(exitCol.x, end.x - pad);
          pts = dedupePoints([
            ...stubPts,
            { x: colX, y: stubY },
            { x: colX, y: end.y },
            { ...end },
          ]);
        } else if (sideApproach === "bottom" || sideApproach === "top") {
          // LR: run OUTSIDE the target face, then enter inward.
          const pad = 18;
          const stubX = exitCol.x;
          const rowY =
            sideApproach === "bottom"
              ? Math.max(exitCol.y, end.y + pad)
              : Math.min(exitCol.y, end.y - pad);
          pts = dedupePoints([
            ...stubPts,
            { x: stubX, y: rowY },
            { x: end.x, y: rowY },
            { ...end },
          ]);
        } else {
          // Fallback U-turn: keep diamond exit, loop at junction depth.
          const preEnd =
            outbound.length >= 2 ? outbound[outbound.length - 2] : mid;
          pts = dedupePoints([
            ...stubPts,
            { x: exitCol.x, y: mid.y },
            { x: end.x, y: mid.y },
            { x: end.x, y: preEnd.y },
            { ...end },
          ]);
        }
        const label = e.label || o.label;
        const marker =
          /marker-end="([^"]*)"/.exec(e.attrs)?.[1] ||
          /marker-end="([^"]*)"/.exec(o.attrs)?.[1] ||
          "url(#arrowhead)";
        rebuilt.push(
          `<polyline class="edge" fill="none" stroke="${escapeAttr(stroke)}" stroke-width="${escapeAttr(sw)}" stroke-linecap="round" stroke-linejoin="round" points="${formatPoints(pts)}" marker-end="${escapeAttr(marker)}" data-from="${escapeAttr(e.from)}" data-to="${escapeAttr(o.to)}" data-label="${escapeAttr(label)}"/>`,
        );
      }
    } else if (junctions.has(e.from) || junctions.has(e.to)) {
      // chain junction→junction or leftover: skip (handled via ins)
      continue;
    }
  }

  // Insert rebuilt edges before first remaining edge or before edge-labels.
  if (rebuilt.length > 0) {
    const insertAt = next.search(
      /<polyline class="edge"|<g class="edge-label"|<\/svg>/,
    );
    if (insertAt >= 0) {
      next = next.slice(0, insertAt) + rebuilt.join("") + next.slice(insertAt);
    }
  }

  // Retarget Yes/No labels that pointed at a junction onto the merged target.
  next = next.replace(
    /<g class="edge-label"([^>]*)>([\s\S]*?)<\/g>/g,
    (full, attrs, inner) => {
      const to = /data-to="([^"]*)"/.exec(attrs)?.[1];
      const from = /data-from="([^"]*)"/.exec(attrs)?.[1];
      if (to && junctions.has(to)) {
        const out = edges.find(
          (o) => o.from === to && from && !junctions.has(o.to),
        );
        if (!out) return "";
        const newAttrs = attrs.replace(
          /\bdata-to="[^"]*"/,
          `data-to="${escapeAttr(out.to)}"`,
        );
        return `<g class="edge-label"${newAttrs}>${inner}</g>`;
      }
      if (from && junctions.has(from)) return "";
      return full;
    },
  );

  // Remove junction node groups.
  for (const id of junctions.keys()) {
    const idAttr = escapeAttr(id);
    next = next.replace(
      new RegExp(
        `<g class="node" data-id="${idAttr}"[^>]*>[\\s\\S]*?<\\/g>`,
      ),
      "",
    );
  }

  // ELK often parks exclusive Yes/No exits (e.g. END) below the ghost
  // junction row. Pull them up under the diamond once the junction is gone.
  next = pullBranchTargetsAfterJunctions(next);
  return next;
}

/**
 * After junction collapse, close the vertical gap under a diamond when an
 * exclusive Yes/No target (and its exclusive descendants) still sit on the
 * old junction row.
 */
function pullBranchTargetsAfterJunctions(svg) {
  /** @type {Map<string, {shape:string, inner:string, verts:ReturnType<typeof diamondVertices>|null, center:{x:number,y:number}|null}>} */
  const nodes = new Map();
  for (const m of svg.matchAll(
    /<g class="node" data-id="([^"]+)"[^>]*data-shape="([^"]+)"[^>]*>([\s\S]*?)<\/g>/g,
  )) {
    const poly = /<polygon points="([^"]+)"/.exec(m[3]);
    nodes.set(m[1], {
      shape: m[2],
      inner: m[3],
      verts: m[2] === "diamond" && poly ? diamondVertices(poly[1]) : null,
      center: nodeCenter(m[3], m[2]),
    });
  }

  /** @type {Map<string, string[]>} */
  const incoming = new Map();
  /** @type {Map<string, string[]>} */
  const outgoing = new Map();
  for (const m of svg.matchAll(/<polyline class="edge"([^>]*)\/>/g)) {
    const from = /data-from="([^"]*)"/.exec(m[1])?.[1];
    const to = /data-to="([^"]*)"/.exec(m[1])?.[1];
    if (!from || !to) continue;
    if (!incoming.has(to)) incoming.set(to, []);
    incoming.get(to).push(from);
    if (!outgoing.has(from)) outgoing.set(from, []);
    outgoing.get(from).push(to);
  }

  /** @type {Map<string, number>} */
  const shiftsY = new Map();
  for (const [id, n] of nodes) {
    if (!n.verts) continue;
    const bottom = n.verts.bottom.y;
    for (const m of svg.matchAll(/<polyline class="edge"([^>]*)\/>/g)) {
      const from = /data-from="([^"]*)"/.exec(m[1])?.[1];
      const to = /data-to="([^"]*)"/.exec(m[1])?.[1];
      const label = (/data-label="([^"]*)"/.exec(m[1])?.[1] ?? "")
        .trim()
        .toLowerCase();
      if (from !== id || !to || (label !== "yes" && label !== "no")) continue;
      const target = nodes.get(to);
      if (!target?.center || target.verts) continue;
      // Shared loop targets (No → INPUT) must stay put.
      if ((incoming.get(to) || []).length > 1) continue;
      const face =
        nodeFacePort(target.inner, target.shape, "top") || {
          x: target.center.x,
          y: target.center.y - 18,
        };
      const gap = face.y - bottom;
      if (gap < 70) continue;
      const desiredTopGap = 28;
      const dy = bottom + desiredTopGap - face.y;
      if (dy >= -1) continue;
      shiftsY.set(to, dy);
    }
  }

  // Cascade to exclusive descendants (OUTPUT → END, etc.).
  let grew = true;
  while (grew) {
    grew = false;
    for (const [to, parents] of incoming) {
      if (shiftsY.has(to) || nodes.get(to)?.verts) continue;
      if (parents.length === 0) continue;
      if (!parents.every((p) => shiftsY.has(p))) continue;
      const dy0 = shiftsY.get(parents[0]);
      if (!parents.every((p) => shiftsY.get(p) === dy0)) continue;
      shiftsY.set(to, dy0);
      grew = true;
    }
  }

  if (shiftsY.size === 0) return svg;

  let next = svg;
  for (const [id, dy] of shiftsY) {
    if (Math.abs(dy) < 0.5) continue;
    const idAttr = escapeAttr(id);
    next = next.replace(
      new RegExp(
        `(<g class="node" data-id="${idAttr}"[^>]*>)([\\s\\S]*?)(<\\/g>)`,
      ),
      (_, open, inner, close) =>
        `${open}${translateNodeGroup(inner, 0, dy)}${close}`,
    );
    next = next.replace(/<polyline class="edge"([^>]*)\/>/g, (full, attrs) => {
      const from = /data-from="([^"]*)"/.exec(attrs)?.[1];
      const to = /data-to="([^"]*)"/.exec(attrs)?.[1];
      const pointsAttr = /points="([^"]+)"/.exec(attrs)?.[1];
      if (!pointsAttr || (from !== id && to !== id)) return full;
      const pts = parsePoints(pointsAttr);
      if (from === id) {
        const old = { ...pts[0] };
        pts[0] = { x: old.x, y: old.y + dy };
        if (pts.length > 1 && !shiftsY.has(to) && Math.abs(pts[1].x - old.x) < 1) {
          pts[1] = { x: pts[0].x, y: pts[1].y };
        }
      }
      if (to === id) {
        const last = pts.length - 1;
        const old = { ...pts[last] };
        pts[last] = { x: old.x, y: old.y + dy };
        if (last >= 1 && !shiftsY.has(from)) {
          if (Math.abs(pts[last - 1].x - old.x) < 1) {
            pts[last - 1] = { x: pts[last].x, y: pts[last - 1].y };
          }
          if (Math.abs(pts[last - 1].y - old.y) < 1) {
            pts[last - 1] = { x: pts[last - 1].x, y: pts[last].y };
          }
        }
      }
      return `<polyline class="edge"${attrs.replace(
        /points="[^"]+"/,
        `points="${formatPoints(dedupePoints(pts))}"`,
      )}/>`;
    });
  }

  // Rebuild Yes/No drops cleanly onto the shifted target top face.
  next = next.replace(/<polyline class="edge"([^>]*)\/>/g, (full, attrs) => {
    const from = /data-from="([^"]*)"/.exec(attrs)?.[1];
    const to = /data-to="([^"]*)"/.exec(attrs)?.[1];
    const label = (/data-label="([^"]*)"/.exec(attrs)?.[1] ?? "")
      .trim()
      .toLowerCase();
    const pointsAttr = /points="([^"]+)"/.exec(attrs)?.[1];
    if (!from || !to || !pointsAttr) return full;
    if ((label !== "yes" && label !== "no") || !shiftsY.has(to)) return full;
    if (!nodes.get(from)?.verts) return full;
    const idAttr = escapeAttr(to);
    const g = new RegExp(
      `<g class="node" data-id="${idAttr}"[^>]*data-shape="([^"]+)"[^>]*>([\\s\\S]*?)<\\/g>`,
    ).exec(next);
    if (!g) return full;
    const face = nodeFacePort(g[2], g[1], "top");
    if (!face) return full;
    const pts = parsePoints(pointsAttr);
    if (pts.length < 2) return full;
    const rebuilt = dedupePoints([
      { ...pts[0] },
      { ...pts[1] },
      { x: pts[1].x, y: face.y },
      { ...face },
    ]);
    return `<polyline class="edge"${attrs.replace(
      /points="[^"]+"/,
      `points="${formatPoints(rebuilt)}"`,
    )}/>`;
  });

  return next;
}

/**
 * After diamond stubs / node shifts, geometry can sit outside the original
 * viewBox (negative x on TB Yes/No exits). Recompute root viewBox from
 * polyline/polygon points, rects and text so nothing is clipped.
 * Marker points use "x y, x y" (not "x,y") — ignore non-finite parses.
 */
function fitSvgViewBox(svg, padding = 8) {
  const xs = [];
  const ys = [];

  const push = (x, y) => {
    if (Number.isFinite(x) && Number.isFinite(y)) {
      xs.push(x);
      ys.push(y);
    }
  };

  // Marker polygons use points="0 0, 8 2.5, 0 5" (space-separated). If those
  // pin minY to 0 while nodes were shifted down (REPEAT / nested-IF fixes),
  // the SVG keeps a huge empty band above START — the "marge vide" under
  // trace tables in exercices corrigés. Measure geometry outside <defs> only.
  const geometry = svg.replace(/<defs[\s\S]*?<\/defs>/gi, "");

  for (const m of geometry.matchAll(/\bpoints="([^"]+)"/g)) {
    const attr = m[1].trim();
    if (/^-?[\d.]+,/.test(attr)) {
      for (const p of parsePoints(attr)) push(p.x, p.y);
    } else {
      // Non-comma "x y" pairs still appear on some shapes; keep them, but
      // defs/markers are already stripped above.
      for (const pair of attr.split(/\s*,\s*/)) {
        const [x, y] = pair.trim().split(/\s+/).map(Number);
        push(x, y);
      }
    }
  }
  for (const m of geometry.matchAll(/<rect\b([^>]*)\/?>/g)) {
    const attrs = m[1];
    const x = Number(/\bx="([^"]+)"/.exec(attrs)?.[1]);
    const y = Number(/\by="([^"]+)"/.exec(attrs)?.[1]);
    const w = Number(/\bwidth="([^"]+)"/.exec(attrs)?.[1]);
    const h = Number(/\bheight="([^"]+)"/.exec(attrs)?.[1]);
    if (![x, y, w, h].every(Number.isFinite)) continue;
    push(x, y);
    push(x + w, y + h);
  }
  for (const m of geometry.matchAll(/<text\b([^>]*)>/g)) {
    const attrs = m[1];
    push(
      Number(/\bx="([^"]+)"/.exec(attrs)?.[1]),
      Number(/\by="([^"]+)"/.exec(attrs)?.[1]),
    );
  }
  for (const m of geometry.matchAll(/<ellipse\b([^>]*)\/?>/g)) {
    const attrs = m[1];
    const cx = Number(/\bcx="([^"]+)"/.exec(attrs)?.[1]);
    const cy = Number(/\bcy="([^"]+)"/.exec(attrs)?.[1]);
    const rx = Number(/\brx="([^"]+)"/.exec(attrs)?.[1]);
    const ry = Number(/\bry="([^"]+)"/.exec(attrs)?.[1]);
    if (![cx, cy, rx, ry].every(Number.isFinite)) continue;
    push(cx - rx, cy - ry);
    push(cx + rx, cy + ry);
  }

  if (xs.length === 0 || ys.length === 0) return svg;

  const minX = Math.min(...xs) - padding;
  const minY = Math.min(...ys) - padding;
  const width = Math.max(...xs) + padding - minX;
  const height = Math.max(...ys) + padding - minY;
  if (!(width > 0) || !(height > 0)) return svg;

  return svg.replace(/^<svg\b([^>]*)>/, (_, attrs) => {
    let next = attrs;
    if (/\bviewBox="/.test(next)) {
      next = next.replace(
        /\bviewBox="[^"]+"/,
        `viewBox="${minX} ${minY} ${width} ${height}"`,
      );
    } else {
      next += ` viewBox="${minX} ${minY} ${width} ${height}"`;
    }
    if (/\bwidth="/.test(next)) {
      next = next.replace(/\bwidth="[^"]+"/, `width="${width}"`);
    }
    if (/\bheight="/.test(next)) {
      next = next.replace(/\bheight="[^"]+"/, `height="${height}"`);
    }
    return `<svg${next}>`;
  });
}

/**
 * REPEAT … UNTIL TB spine: START → INPUT → diamond, No loops back to INPUT.
 * Yes may go straight to END, or Yes → OUTPUT → END (exercices). Vertically
 * stack the spine (ELK often parks the diamond above START on cycles) and
 * park the Yes column left without overlapping INPUT.
 */
function alignRepeatInputDiamond(svg) {
  /** @type {Map<string, {shape:string, inner:string, verts:ReturnType<typeof diamondVertices>|null, center:{x:number,y:number}|null}>} */
  const nodes = new Map();
  for (const m of svg.matchAll(
    /<g class="node" data-id="([^"]+)"[^>]*data-shape="([^"]+)"[^>]*>([\s\S]*?)<\/g>/g,
  )) {
    const poly = /<polygon points="([^"]+)"/.exec(m[3]);
    nodes.set(m[1], {
      shape: m[2],
      inner: m[3],
      verts: m[2] === "diamond" && poly ? diamondVertices(poly[1]) : null,
      center: nodeCenter(m[3], m[2]),
    });
  }

  /** @type {{from:string,to:string,label:string,points:string,attrs:string}[]} */
  const edges = [];
  for (const m of svg.matchAll(/<polyline class="edge"([^>]*)\/>/g)) {
    const attrs = m[1];
    const from = /data-from="([^"]*)"/.exec(attrs)?.[1];
    const to = /data-to="([^"]*)"/.exec(attrs)?.[1];
    const label = /data-label="([^"]*)"/.exec(attrs)?.[1] ?? "";
    const points = /points="([^"]+)"/.exec(attrs)?.[1];
    if (!from || !to || !points) continue;
    edges.push({ from, to, label, points, attrs });
  }

  /** @type {Map<string, string[]>} */
  const incoming = new Map();
  for (const e of edges) {
    if (!incoming.has(e.to)) incoming.set(e.to, []);
    incoming.get(e.to).push(e.from);
  }

  const GAP = 48;
  let next = svg;

  const shiftNode = (id, sdx, sdy) => {
    if (Math.abs(sdx) < 0.5 && Math.abs(sdy) < 0.5) return;
    const idAttr = escapeAttr(id);
    next = next.replace(
      new RegExp(
        `(<g class="node" data-id="${idAttr}"[^>]*>)([\\s\\S]*?)(<\\/g>)`,
      ),
      (_, open, inner, close) =>
        `${open}${translateNodeGroup(inner, sdx, sdy)}${close}`,
    );
    const g = new RegExp(
      `<g class="node" data-id="${idAttr}"[^>]*data-shape="([^"]+)"[^>]*>([\\s\\S]*?)<\\/g>`,
    ).exec(next);
    if (g) {
      const poly = /<polygon points="([^"]+)"/.exec(g[2]);
      nodes.set(id, {
        shape: g[1],
        inner: g[2],
        verts: g[1] === "diamond" && poly ? diamondVertices(poly[1]) : null,
        center: nodeCenter(g[2], g[1]),
      });
    }
  };

  const nodeTopY = (id) => {
    const n = nodes.get(id);
    if (!n) return null;
    if (n.verts) return n.verts.top.y;
    const port = nodeFacePort(n.inner, n.shape, "top");
    return port?.y ?? n.center?.y ?? null;
  };
  const nodeBotY = (id) => {
    const n = nodes.get(id);
    if (!n) return null;
    if (n.verts) return n.verts.bottom.y;
    const port = nodeFacePort(n.inner, n.shape, "bottom");
    return port?.y ?? n.center?.y ?? null;
  };

  for (const [did, dNode] of nodes) {
    if (!dNode.verts) continue;
    const drop = edges.find(
      (e) =>
        e.to === did &&
        !e.label.trim() &&
        nodes.get(e.from)?.shape === "parallelogram",
    );
    if (!drop) continue;
    const inputId = drop.from;
    const input = nodes.get(inputId);
    if (!input?.center) continue;

    const noEdge = edges.find(
      (e) =>
        e.from === did &&
        e.label.trim().toLowerCase() === "no" &&
        e.to === inputId,
    );
    const yesEdge = edges.find(
      (e) => e.from === did && e.label.trim().toLowerCase() === "yes",
    );
    // REPEAT pattern: No returns to the same INPUT.
    if (!noEdge || !yesEdge) continue;

    // Yes → END, or Yes → OUTPUT → END (never treat OUTPUT as the terminal).
    let outputId = null;
    let endId = null;
    const yesTarget = nodes.get(yesEdge.to);
    if (!yesTarget?.center || yesTarget.verts) continue;
    if (yesTarget.shape === "stadium") {
      endId = yesEdge.to;
    } else if (yesTarget.shape === "parallelogram") {
      outputId = yesEdge.to;
      if ((incoming.get(outputId) || []).length !== 1) continue;
      const outToEnd = edges.find(
        (e) =>
          e.from === outputId &&
          nodes.get(e.to)?.shape === "stadium" &&
          (incoming.get(e.to) || []).length === 1,
      );
      if (!outToEnd) continue;
      endId = outToEnd.to;
    } else {
      continue;
    }
    if (!nodes.get(endId)?.center) continue;

    const feed = edges.find(
      (e) =>
        e.to === inputId &&
        e.from !== did &&
        !nodes.get(e.from)?.verts,
    );
    const feedNode = feed ? nodes.get(feed.from) : null;
    const feedId = feed?.from ?? null;
    const spineX = feedNode?.center?.x ?? input.center.x;

    // --- Vertical TB stack: START → INPUT → diamond ---
    if (feedId) {
      shiftNode(feedId, spineX - feedNode.center.x, 0);
    }
    {
      const feedBot = feedId ? nodeBotY(feedId) : null;
      const inTop = nodeTopY(inputId);
      if (feedBot != null && inTop != null) {
        shiftNode(inputId, spineX - nodes.get(inputId).center.x, feedBot + GAP - inTop);
      } else {
        shiftNode(inputId, spineX - nodes.get(inputId).center.x, 0);
      }
    }
    {
      const inBot = nodeBotY(inputId);
      const dTop = nodeTopY(did);
      if (inBot != null && dTop != null) {
        shiftNode(did, spineX - nodes.get(did).verts.top.x, inBot + GAP - dTop);
      } else {
        shiftNode(did, spineX - nodes.get(did).verts.top.x, 0);
      }
    }

    // Recentre diamond label after moves.
    {
      const idAttr = escapeAttr(did);
      const g = new RegExp(
        `(<g class="node" data-id="${idAttr}"[^>]*>)([\\s\\S]*?)(<\\/g>)`,
      ).exec(next);
      if (g) {
        const poly = /<polygon points="([^"]+)"/.exec(g[2]);
        const verts = poly ? diamondVertices(poly[1]) : null;
        if (verts) {
          const centered = centerDiamondLabel(g[2], verts.cx, verts.cy);
          next = next.replace(g[0], `${g[1]}${centered}${g[3]}`);
          nodes.set(did, {
            shape: "diamond",
            inner: centered,
            verts,
            center: { x: verts.cx, y: verts.cy },
          });
        }
      }
    }

    const d = nodes.get(did)?.verts;
    const inputFresh = nodes.get(inputId);
    const top = nodeFacePort(inputFresh.inner, inputFresh.shape, "top");
    const bot = nodeFacePort(inputFresh.inner, inputFresh.shape, "bottom");
    const right = nodeFacePort(inputFresh.inner, inputFresh.shape, "right");
    if (!d || !top || !bot || !right) continue;

    const yesStub = diamondExitStub(d, "left");
    const noStub = diamondExitStub(d, "right");
    const yesColX = yesStub.x;

    // Yes column: stack Yes target(s) fully below the diamond so END never
    // sits on the left tip (mid-height overlap made Yes→END unreadable).
    // Path: left tip → stub → drop → top mid of first Yes target.
    const yesAnchorY = d.bottom.y + GAP;
    if (outputId) {
      const outTop = nodeTopY(outputId);
      const outNode = nodes.get(outputId);
      const outTopPort = nodeFacePort(outNode.inner, outNode.shape, "top");
      if (outTop != null && outTopPort) {
        shiftNode(outputId, yesColX - outTopPort.x, yesAnchorY - outTop);
      }
      const outBot = nodeBotY(outputId);
      const endTop = nodeTopY(endId);
      const endTopPort = nodeFacePort(
        nodes.get(endId).inner,
        nodes.get(endId).shape,
        "top",
      );
      if (outBot != null && endTop != null && endTopPort) {
        shiftNode(endId, yesColX - endTopPort.x, outBot + GAP - endTop);
      }
    } else {
      const endTop = nodeTopY(endId);
      const endTopPort = nodeFacePort(
        nodes.get(endId).inner,
        nodes.get(endId).shape,
        "top",
      );
      if (endTop != null && endTopPort) {
        shiftNode(endId, yesColX - endTopPort.x, yesAnchorY - endTop);
      }
    }

    const outFresh = outputId ? nodes.get(outputId) : null;
    const endFresh = nodes.get(endId);
    const outTop2 = outFresh
      ? nodeFacePort(outFresh.inner, outFresh.shape, "top")
      : null;
    const outBot2 = outFresh
      ? nodeFacePort(outFresh.inner, outFresh.shape, "bottom")
      : null;
    const endTop2 = nodeFacePort(endFresh.inner, endFresh.shape, "top");
    if (!endTop2) continue;
    // Keep END on OUTPUT bottom mid when lean shifts top≠bottom.
    if (outBot2) {
      shiftNode(endId, outBot2.x - endTop2.x, 0);
    }
    const endTop3 = nodeFacePort(
      nodes.get(endId).inner,
      nodes.get(endId).shape,
      "top",
    );
    if (!endTop3) continue;

    const pad = 18;
    const colX = Math.max(noStub.x, right.x + pad);
    const stroke = /stroke="([^"]+)"/.exec(drop.attrs)?.[1] ?? "#757575";
    const sw = /stroke-width="([^"]+)"/.exec(drop.attrs)?.[1] ?? "1.5";
    const marker =
      /marker-end="([^"]*)"/.exec(drop.attrs)?.[1] || "url(#arrowhead)";

    const attachTop = { x: spineX, y: top.y };
    const attachBot = { x: spineX, y: bot.y };
    const feedStart = feedId
      ? nodeFacePort(nodes.get(feedId).inner, nodes.get(feedId).shape, "bottom")
      : null;
    const feedPtsOut = feedStart
      ? dedupePoints([
          { x: spineX, y: feedStart.y },
          { ...attachTop },
        ])
      : null;
    const dropPts = dedupePoints([
      { ...attachBot },
      { x: spineX, y: d.top.y },
      { ...d.top },
    ]);
    const yesLand = outTop2 ?? endTop3;
    const yesPts = dedupePoints([
      { ...d.left },
      { ...yesStub },
      { x: yesStub.x, y: yesLand.y },
      { ...yesLand },
    ]);
    const outToEndPts =
      outBot2 && endTop3
        ? dedupePoints([
            { ...outBot2 },
            { x: outBot2.x, y: endTop3.y },
            { ...endTop3 },
          ])
        : null;
    const noPts = dedupePoints([
      { ...d.right },
      { ...noStub },
      { x: colX, y: noStub.y },
      { x: colX, y: right.y },
      { ...right },
    ]);

    const mkEdge = (from, to, label, pts) => {
      const lab = ` data-label="${escapeAttr(label ?? "")}"`;
      return `<polyline class="edge" fill="none" stroke="${escapeAttr(stroke)}" stroke-width="${escapeAttr(sw)}" stroke-linecap="round" stroke-linejoin="round" points="${formatPoints(pts)}" marker-end="${escapeAttr(marker)}" data-from="${escapeAttr(from)}" data-to="${escapeAttr(to)}"${lab}/>`;
    };

    next = next.replace(/<polyline class="edge"([^>]*)\/>/g, (full, attrs) => {
      const from = /data-from="([^"]*)"/.exec(attrs)?.[1];
      const to = /data-to="([^"]*)"/.exec(attrs)?.[1];
      if (feedId && feedPtsOut && from === feedId && to === inputId) {
        return mkEdge(feedId, inputId, "", feedPtsOut);
      }
      if (from === inputId && to === did) {
        return mkEdge(inputId, did, "", dropPts);
      }
      if (from === did && to === yesEdge.to) {
        return mkEdge(did, yesEdge.to, yesEdge.label, yesPts);
      }
      if (
        outputId &&
        outToEndPts &&
        from === outputId &&
        to === endId
      ) {
        return mkEdge(outputId, endId, "", outToEndPts);
      }
      if (from === did && to === inputId) {
        return mkEdge(did, inputId, noEdge.label, noPts);
      }
      return full;
    });
  }

  return next;
}

/**
 * TB cleanup: if a diamond sits above its unique unlabeled predecessor (ELK
 * cycle artefact — e.g. nested IF above START), shift that diamond and its
 * exclusive Yes-side chain below the predecessor.
 */
function placeDiamondsBelowPredecessors(svg) {
  /** @type {Map<string, {shape:string, inner:string, verts:ReturnType<typeof diamondVertices>|null, center:{x:number,y:number}|null}>} */
  const nodes = new Map();
  for (const m of svg.matchAll(
    /<g class="node" data-id="([^"]+)"[^>]*data-shape="([^"]+)"[^>]*>([\s\S]*?)<\/g>/g,
  )) {
    const poly = /<polygon points="([^"]+)"/.exec(m[3]);
    nodes.set(m[1], {
      shape: m[2],
      inner: m[3],
      verts: m[2] === "diamond" && poly ? diamondVertices(poly[1]) : null,
      center: nodeCenter(m[3], m[2]),
    });
  }

  /** @type {{from:string,to:string,label:string}[]} */
  const edges = [];
  for (const m of svg.matchAll(/<polyline class="edge"([^>]*)\/>/g)) {
    const attrs = m[1];
    const from = /data-from="([^"]*)"/.exec(attrs)?.[1];
    const to = /data-to="([^"]*)"/.exec(attrs)?.[1];
    const label = /data-label="([^"]*)"/.exec(attrs)?.[1] ?? "";
    if (!from || !to) continue;
    edges.push({ from, to, label });
  }

  /** @type {Map<string, string[]>} */
  const incoming = new Map();
  /** @type {Map<string, typeof edges>} */
  const outgoing = new Map();
  for (const e of edges) {
    if (!incoming.has(e.to)) incoming.set(e.to, []);
    incoming.get(e.to).push(e.from);
    if (!outgoing.has(e.from)) outgoing.set(e.from, []);
    outgoing.get(e.from).push(e);
  }

  const GAP = 48;
  let next = svg;

  const refresh = (id) => {
    const idAttr = escapeAttr(id);
    const g = new RegExp(
      `<g class="node" data-id="${idAttr}"[^>]*data-shape="([^"]+)"[^>]*>([\\s\\S]*?)<\\/g>`,
    ).exec(next);
    if (!g) return;
    const poly = /<polygon points="([^"]+)"/.exec(g[2]);
    nodes.set(id, {
      shape: g[1],
      inner: g[2],
      verts: g[1] === "diamond" && poly ? diamondVertices(poly[1]) : null,
      center: nodeCenter(g[2], g[1]),
    });
  };

  const shiftNode = (id, sdx, sdy) => {
    if (Math.abs(sdx) < 0.5 && Math.abs(sdy) < 0.5) return;
    const idAttr = escapeAttr(id);
    next = next.replace(
      new RegExp(
        `(<g class="node" data-id="${idAttr}"[^>]*>)([\\s\\S]*?)(<\\/g>)`,
      ),
      (_, open, inner, close) =>
        `${open}${translateNodeGroup(inner, sdx, sdy)}${close}`,
    );
    refresh(id);
  };

  const topY = (id) => {
    const n = nodes.get(id);
    if (!n) return null;
    if (n.verts) return n.verts.top.y;
    return nodeFacePort(n.inner, n.shape, "top")?.y ?? n.center?.y ?? null;
  };
  const botY = (id) => {
    const n = nodes.get(id);
    if (!n) return null;
    if (n.verts) return n.verts.bottom.y;
    return nodeFacePort(n.inner, n.shape, "bottom")?.y ?? n.center?.y ?? null;
  };

  for (const [did, dNode] of nodes) {
    if (!dNode.verts) continue;
    // Unique unlabeled predecessor (forward entry into the diamond).
    const preds = (incoming.get(did) || []).filter((pid) => {
      const e = edges.find((x) => x.from === pid && x.to === did);
      return e && !e.label.trim() && pid !== did;
    });
    if (preds.length !== 1) continue;
    const predId = preds[0];
    const predNode = nodes.get(predId);
    // Skip LR spines (predecessor clearly to the left) — TB-only pass.
    if (
      predNode?.center &&
      dNode.center &&
      dNode.center.x - predNode.center.x > 30 &&
      Math.abs(dNode.center.x - predNode.center.x) >
        Math.abs(dNode.center.y - predNode.center.y) + 10
    ) {
      continue;
    }
    const predBot = botY(predId);
    const dTop = topY(did);
    if (predBot == null || dTop == null) continue;
    if (dTop >= predBot + GAP - 1) continue; // already below

    const dy = predBot + GAP - dTop;

    // Exclusive Yes chain until a merge node (shared incoming).
    /** @type {string[]} */
    const moveIds = [did];
    const yes = (outgoing.get(did) || []).find(
      (e) => e.label.trim().toLowerCase() === "yes",
    );
    let cursor = yes?.to;
    while (cursor && nodes.has(cursor)) {
      const ins = incoming.get(cursor) || [];
      if (ins.length !== 1) break;
      moveIds.push(cursor);
      const outs = (outgoing.get(cursor) || []).filter((e) => e.to !== did);
      if (outs.length !== 1) break;
      cursor = outs[0].to;
    }

    for (const id of moveIds) shiftNode(id, 0, dy);

    // Merge node where Yes-chain and No meet (e.g. count+1 after IF) — pull it
    // below the shifted subgraph so No/Yes don't climb back to a stale rank.
    const no = (outgoing.get(did) || []).find(
      (e) => e.label.trim().toLowerCase() === "no",
    );
    const mergeId = no?.to;
    if (mergeId && !moveIds.includes(mergeId) && nodes.has(mergeId)) {
      const floor =
        Math.max(
          ...moveIds.map((id) => botY(id) ?? 0),
          botY(did) ?? 0,
        ) + GAP;
      const mTop = topY(mergeId);
      if (mTop != null && mTop < floor) {
        shiftNode(mergeId, 0, floor - mTop);
        moveIds.push(mergeId);
      }
    }

    // Rebuild edges that touch moved nodes (simple vertical/orthogonal).
    const stroke = "#757575";
    const sw = "1.5";
    const marker = "url(#arrowhead)";
    const mkEdge = (from, to, label, pts) => {
      const lab = ` data-label="${escapeAttr(label ?? "")}"`;
      return `<polyline class="edge" fill="none" stroke="${escapeAttr(stroke)}" stroke-width="${escapeAttr(sw)}" stroke-linecap="round" stroke-linejoin="round" points="${formatPoints(pts)}" marker-end="${escapeAttr(marker)}" data-from="${escapeAttr(from)}" data-to="${escapeAttr(to)}"${lab}/>`;
    };

    next = next.replace(/<polyline class="edge"([^>]*)\/>/g, (full, attrs) => {
      const from = /data-from="([^"]*)"/.exec(attrs)?.[1];
      const to = /data-to="([^"]*)"/.exec(attrs)?.[1];
      const label = /data-label="([^"]*)"/.exec(attrs)?.[1] ?? "";
      if (!from || !to) return full;
      if (!moveIds.includes(from) && !moveIds.includes(to)) return full;

      const a = nodes.get(from);
      const b = nodes.get(to);
      if (!a?.center || !b?.center) return full;

      // Loop return into diamond bottom, else face-to-face orth route.
      if (b.verts && a.center.y > b.verts.bottom.y) {
        const src =
          nodeFacePort(a.inner, a.shape, "bottom") ||
          nodeFacePort(a.inner, a.shape, "right") ||
          a.center;
        const pts = dedupePoints([
          { ...src },
          { x: b.verts.bottom.x, y: src.y },
          { ...b.verts.bottom },
        ]);
        return mkEdge(from, to, label, pts);
      }
      if (a.verts && label.trim()) {
        const side = label.trim().toLowerCase() === "yes" ? "left" : "right";
        const stub = diamondExitStub(a.verts, side);
        const land =
          nodeFacePort(b.inner, b.shape, "top") ||
          nodeFacePort(b.inner, b.shape, side) ||
          b.center;
        const pts = dedupePoints([
          { ...a.verts[side] },
          { ...stub },
          { x: stub.x, y: land.y },
          { ...land },
        ]);
        return mkEdge(from, to, label, pts);
      }
      const src = nodeFacePort(a.inner, a.shape, "bottom") || a.center;
      const land = nodeFacePort(b.inner, b.shape, "top") || b.center;
      if (b.verts) {
        const pts = dedupePoints([
          { ...src },
          { x: b.verts.top.x, y: src.y },
          { ...b.verts.top },
        ]);
        return mkEdge(from, to, label, pts);
      }
      const pts = dedupePoints([
        { x: land.x, y: src.y },
        { ...land },
      ]);
      // Prefer vertical drop when x already aligned.
      if (Math.abs(src.x - land.x) < 1) {
        return mkEdge(from, to, label, dedupePoints([{ ...src }, { ...land }]));
      }
      return mkEdge(
        from,
        to,
        label,
        dedupePoints([{ ...src }, { x: src.x, y: land.y }, { ...land }]),
      );
    });
  }

  return next;
}

/**
 * Sentinel (primed) layout:
 * - TB: Yes body + trailing INPUT left, No body right; return from INPUT
 *   mid-right into diamond BOTTOM tip.
 * - LR: Yes/No rows above/below (top/bottom tips); bodies to the right;
 *   return from trailing INPUT (face toward diamond) down/up the free
 *   mid band to the RIGHT tip (LR analogue of TB bottom-tip return —
 *   avoids crossing the Yes/No shafts).
 */
function alignLoopBodyColumn(svg) {
  /** @type {Map<string, {shape:string, inner:string, verts:ReturnType<typeof diamondVertices>|null, center:{x:number,y:number}|null}>} */
  const nodes = new Map();
  for (const m of svg.matchAll(
    /<g class="node" data-id="([^"]+)"[^>]*data-shape="([^"]+)"[^>]*>([\s\S]*?)<\/g>/g,
  )) {
    const poly = /<polygon points="([^"]+)"/.exec(m[3]);
    nodes.set(m[1], {
      shape: m[2],
      inner: m[3],
      verts: m[2] === "diamond" && poly ? diamondVertices(poly[1]) : null,
      center: nodeCenter(m[3], m[2]),
    });
  }

  /** @type {{from:string,to:string,label:string,points:string,attrs:string,full:string}[]} */
  const edges = [];
  for (const m of svg.matchAll(/<polyline class="edge"([^>]*)\/>/g)) {
    const attrs = m[1];
    const from = /data-from="([^"]*)"/.exec(attrs)?.[1];
    const to = /data-to="([^"]*)"/.exec(attrs)?.[1];
    const label = /data-label="([^"]*)"/.exec(attrs)?.[1] ?? "";
    const points = /points="([^"]+)"/.exec(attrs)?.[1];
    if (!from || !to || !points) continue;
    edges.push({ from, to, label, points, attrs, full: m[0] });
  }

  /** @type {Map<string, string[]>} */
  const incoming = new Map();
  for (const e of edges) {
    if (!incoming.has(e.to)) incoming.set(e.to, []);
    incoming.get(e.to).push(e.from);
  }

  let next = svg;
  for (const [did, dNode] of nodes) {
    if (!dNode.verts) continue;
    const yes = edges.find(
      (e) => e.from === did && e.label.trim().toLowerCase() === "yes",
    );
    if (!yes) continue;
    const bodyId = yes.to;
    const body = nodes.get(bodyId);
    if (!body?.center || body.verts) continue;

    // Exclusive child of the Yes body that loops back to this diamond.
    const bodyOuts = edges.filter((e) => e.from === bodyId);
    const loopChild = bodyOuts.find(
      (e) =>
        e.to !== did &&
        (incoming.get(e.to) || []).length === 1 &&
        edges.some((r) => r.from === e.to && r.to === did),
    );
    if (!loopChild) continue;
    const childId = loopChild.to;
    const child = nodes.get(childId);
    // Sentinel: trailing INPUT (parallelogram). FOR/WHILE: increment rectangle.
    if (!child?.center || child.verts) continue;
    const isSentinelReturn = child.shape === "parallelogram";
    const isIncrementReturn = child.shape === "rectangle";
    if (!isSentinelReturn && !isIncrementReturn) continue;

    const noEdge = edges.find(
      (e) => e.from === did && e.label.trim().toLowerCase() === "no",
    );
    const noBodyId = noEdge?.to;
    const noBody = noBodyId ? nodes.get(noBodyId) : null;
    // Optional exclusive No→END (or similar) under the No column / row.
    let endId = null;
    if (noBodyId) {
      const noOuts = edges.filter((e) => e.from === noBodyId);
      const endEdge = noOuts.find(
        (e) => e.to !== did && (incoming.get(e.to) || []).length === 1,
      );
      if (endEdge && nodes.get(endEdge.to)?.center) endId = endEdge.to;
    }

    const yesPts = parsePoints(yes.points);
    const noPts = noEdge ? parsePoints(noEdge.points) : [];
    // LR Yes/No leave via vertical stubs (top/bottom); TB via horizontal.
    const isLR =
      yesPts.length >= 2 &&
      Math.abs(yesPts[1].y - yesPts[0].y) >=
        Math.abs(yesPts[1].x - yesPts[0].x);
    // Sentinel LR layout only; FOR/WHILE increment uses TB stack below.
    if (isLR && !isSentinelReturn) continue;

    const d = dNode.verts;
    const stroke = /stroke="([^"]+)"/.exec(loopChild.attrs)?.[1] ?? "#757575";
    const sw = /stroke-width="([^"]+)"/.exec(loopChild.attrs)?.[1] ?? "1.5";
    const marker =
      /marker-end="([^"]*)"/.exec(loopChild.attrs)?.[1] || "url(#arrowhead)";

    const shiftNode = (id, dx, ddy) => {
      if (Math.abs(dx) < 0.5 && Math.abs(ddy) < 0.5) return;
      const idAttr = escapeAttr(id);
      next = next.replace(
        new RegExp(
          `(<g class="node" data-id="${idAttr}"[^>]*>)([\\s\\S]*?)(<\\/g>)`,
        ),
        (_, open, inner, close) =>
          `${open}${translateNodeGroup(inner, dx, ddy)}${close}`,
      );
      const g = new RegExp(
        `<g class="node" data-id="${idAttr}"[^>]*data-shape="([^"]+)"[^>]*>([\\s\\S]*?)<\\/g>`,
      ).exec(next);
      if (g) {
        nodes.set(id, {
          shape: g[1],
          inner: g[2],
          verts: null,
          center: nodeCenter(g[2], g[1]),
        });
      }
    };

    const mkEdge = (from, to, label, pts) => {
      const lab = ` data-label="${escapeAttr(label ?? "")}"`;
      return `<polyline class="edge" fill="none" stroke="${escapeAttr(stroke)}" stroke-width="${escapeAttr(sw)}" stroke-linecap="round" stroke-linejoin="round" points="${formatPoints(pts)}" marker-end="${escapeAttr(marker)}" data-from="${escapeAttr(from)}" data-to="${escapeAttr(to)}"${lab}/>`;
    };

    if (isLR) {
      const yesSide = yesPts[0].y <= d.cy ? "top" : "bottom";
      const noSide = yesSide === "top" ? "bottom" : "top";
      const yesStub = diamondExitStub(d, yesSide);
      const noStub = diamondExitStub(d, noSide);
      const GAP_X = 44;
      const GAP_ROW = 28;

      // Anchor Yes/No rows on stub Y, bodies to the right of the diamond.
      const yesRowY =
        yesSide === "top" ? yesStub.y - GAP_ROW : yesStub.y + GAP_ROW;
      const noRowY =
        noSide === "top" ? noStub.y - GAP_ROW : noStub.y + GAP_ROW;
      const branchX0 = d.right.x + GAP_X;

      const bodyLeft0 = nodeFacePort(body.inner, body.shape, "left");
      if (!bodyLeft0) continue;
      if ((incoming.get(bodyId) || []).length === 1) {
        shiftNode(bodyId, branchX0 - bodyLeft0.x, yesRowY - bodyLeft0.y);
      } else {
        shiftNode(bodyId, 0, yesRowY - bodyLeft0.y);
      }

      {
        const bodyNow = nodes.get(bodyId);
        const bodyRight = nodeFacePort(bodyNow.inner, bodyNow.shape, "right");
        const childLeft0 = nodeFacePort(child.inner, child.shape, "left");
        if (!bodyRight || !childLeft0) continue;
        shiftNode(
          childId,
          bodyRight.x + GAP_X - childLeft0.x,
          yesRowY - childLeft0.y,
        );
      }

      if (noBodyId && noBody?.center) {
        const noLeft0 = nodeFacePort(noBody.inner, noBody.shape, "left");
        if (noLeft0) {
          shiftNode(noBodyId, branchX0 - noLeft0.x, noRowY - noLeft0.y);
        }
      }
      if (endId && noBodyId) {
        const noNow = nodes.get(noBodyId);
        const noRight = noNow
          ? nodeFacePort(noNow.inner, noNow.shape, "right")
          : null;
        const endLeft0 = nodeFacePort(
          nodes.get(endId).inner,
          nodes.get(endId).shape,
          "left",
        );
        if (noRight && endLeft0) {
          shiftNode(
            endId,
            noRight.x + GAP_X - endLeft0.x,
            noRowY - endLeft0.y,
          );
        }
      }

      // Parallelogram lean: keep END on OUTPUT right-face mid (not top mid).
      if (endId && noBodyId) {
        const noNow = nodes.get(noBodyId);
        const noPoly = noNow
          ? /<polygon points="([^"]+)"/.exec(noNow.inner)?.[1]
          : null;
        const noPorts = noPoly ? parallelogramPorts(noPoly) : null;
        const endNow = nodes.get(endId);
        const endLeft = endNow
          ? nodeFacePort(endNow.inner, endNow.shape, "left")
          : null;
        if (noPorts?.right && endLeft) {
          shiftNode(endId, noPorts.right.x + GAP_X - endLeft.x, noPorts.right.y - endLeft.y);
        }
      }

      const bodyFresh = nodes.get(bodyId);
      const childFresh = nodes.get(childId);
      const noFresh = noBodyId ? nodes.get(noBodyId) : null;
      const endFresh = endId ? nodes.get(endId) : null;
      const bodyLeft = nodeFacePort(bodyFresh.inner, bodyFresh.shape, "left");
      const bodyRight = nodeFacePort(bodyFresh.inner, bodyFresh.shape, "right");
      const childPoly = /<polygon points="([^"]+)"/.exec(childFresh.inner)?.[1];
      const childPorts = childPoly ? parallelogramPorts(childPoly) : null;
      const childLeft = childPorts?.left ?? null;
      // Leave return on the face toward the diamond (not the body→INPUT left entry).
      const childReturn =
        yesSide === "top" ? childPorts?.bottom : childPorts?.top;
      const noPoly = noFresh
        ? /<polygon points="([^"]+)"/.exec(noFresh.inner)?.[1]
        : null;
      const noPorts = noPoly ? parallelogramPorts(noPoly) : null;
      const noLeft = noPorts?.left ?? null;
      const noRight = noPorts?.right ?? null;
      const endLeft = endFresh
        ? nodeFacePort(endFresh.inner, endFresh.shape, "left")
        : null;
      if (!bodyLeft || !bodyRight || !childLeft || !childReturn) continue;

      // Yes: tip → stub → elbow → body left mid (row may sit off the stub Y).
      const yesUse = dedupePoints([
        { ...d[yesSide] },
        { ...yesStub },
        { x: yesStub.x, y: bodyLeft.y },
        { ...bodyLeft },
      ]);

      const bodyChildPts =
        Math.abs(bodyRight.y - childLeft.y) <= 1.5
          ? dedupePoints([{ ...bodyRight }, { ...childLeft }])
          : dedupePoints([
              { ...bodyRight },
              { x: bodyRight.x, y: childLeft.y },
              { ...childLeft },
            ]);

      // Return: bottom/top mid of trailing INPUT → vertical into the free
      // mid band (between Yes/No rows) → horizontal into RIGHT tip.
      const returnPts = dedupePoints([
        { ...childReturn },
        { x: childReturn.x, y: d.right.y },
        { ...d.right },
      ]);

      const noEdgePts =
        noLeft != null
          ? dedupePoints([
              { ...d[noSide] },
              { ...noStub },
              { x: noStub.x, y: noLeft.y },
              { ...noLeft },
            ])
          : null;
      const endPts =
        noRight && endLeft
          ? Math.abs(noRight.y - endLeft.y) <= 1.5
            ? dedupePoints([{ ...noRight }, { ...endLeft }])
            : dedupePoints([
                { ...noRight },
                { x: noRight.x, y: endLeft.y },
                { ...endLeft },
              ])
          : null;

      next = next.replace(/<polyline class="edge"([^>]*)\/>/g, (full, attrs) => {
        const from = /data-from="([^"]*)"/.exec(attrs)?.[1];
        const to = /data-to="([^"]*)"/.exec(attrs)?.[1];
        if (from === bodyId && to === childId) {
          return mkEdge(bodyId, childId, "", bodyChildPts);
        }
        if (from === childId && to === did) {
          return mkEdge(childId, did, "", returnPts);
        }
        if (from === did && to === bodyId) {
          return mkEdge(did, bodyId, yes.label, yesUse);
        }
        if (noBodyId && from === did && to === noBodyId && noEdgePts) {
          return mkEdge(did, noBodyId, noEdge?.label ?? "No", noEdgePts);
        }
        if (endId && noBodyId && from === noBodyId && to === endId && endPts) {
          return mkEdge(noBodyId, endId, "", endPts);
        }
        return full;
      });
      continue;
    }

    // --- TB ---
    const stubYesX = yesPts.length >= 2 ? yesPts[1].x : body.center.x;
    const stubNoX =
      noPts.length >= 2 ? noPts[1].x : noBody?.center.x ?? stubYesX + 120;
    // Widen the channel between Yes/No columns so the return climb is readable.
    const SPREAD = 40;
    const yesColX = stubYesX - SPREAD;
    const noColX = stubNoX + SPREAD;

    const bodyTop0 = nodeFacePort(body.inner, body.shape, "top");
    if (!bodyTop0) continue;
    // Compress the empty band under the diamond (classic TB, less tall).
    const GAP_BELOW_DIAMOND = 40;
    const dy = d.bottom.y + GAP_BELOW_DIAMOND - bodyTop0.y;

    // FOR/WHILE: Yes → body (OUTPUT…) → increment rectangle → diamond tip.
    // Align increment under the body bottom mid so OUTPUT→i++ is a straight drop
    // (parallelogram lean makes top mid ≠ bottom mid; cascade alone zigzags).
    if (isIncrementReturn) {
      const yesSide = stubYesX <= d.cx ? "left" : "right";
      const yesStub = diamondExitStub(d, yesSide);
      const noSide = yesSide === "left" ? "right" : "left";
      const noStub = diamondExitStub(d, noSide);

      // Park the Yes column on the body BOTTOM mid (parallelogram lean:
      // top mid ≠ bottom mid). Straight OUTPUT→increment, boxes look stacked.
      const bodyBot0 =
        nodeFacePort(body.inner, body.shape, "bottom") || bodyTop0;
      if ((incoming.get(bodyId) || []).length === 1) {
        shiftNode(bodyId, yesStub.x - bodyBot0.x, dy);
      } else {
        shiftNode(bodyId, 0, dy);
      }
      {
        const bodyNow = nodes.get(bodyId);
        const bodyBot = nodeFacePort(bodyNow.inner, bodyNow.shape, "bottom");
        const childTop0 = nodeFacePort(child.inner, child.shape, "top");
        if (!bodyBot || !childTop0) continue;
        const GAP_BODY = 28;
        shiftNode(
          childId,
          bodyBot.x - childTop0.x,
          bodyBot.y + GAP_BODY - childTop0.y,
        );
      }
      if (noBodyId && noBody?.center) {
        const noTop0 = nodeFacePort(noBody.inner, noBody.shape, "top");
        const anchorX = noTop0?.x ?? noBody.center.x;
        shiftNode(noBodyId, noStub.x - anchorX, dy);
      }
      if (endId) {
        const endBefore = nodes.get(endId);
        const endTop0 = nodeFacePort(
          endBefore.inner,
          endBefore.shape,
          "top",
        );
        if (endTop0) {
          const noNow = noBodyId ? nodes.get(noBodyId) : null;
          const noBot0 = noNow
            ? nodeFacePort(noNow.inner, noNow.shape, "bottom")
            : null;
          const anchorX = noBot0?.x ?? noStub.x;
          shiftNode(endId, anchorX - endTop0.x, dy);
        }
      }

      const bodyFresh = nodes.get(bodyId);
      const childFresh = nodes.get(childId);
      const noFresh = noBodyId ? nodes.get(noBodyId) : null;
      const bodyTop2 = nodeFacePort(bodyFresh.inner, bodyFresh.shape, "top");
      const bodyBot2 = nodeFacePort(bodyFresh.inner, bodyFresh.shape, "bottom");
      const childTop2 = nodeFacePort(childFresh.inner, childFresh.shape, "top");
      const childBot2 = nodeFacePort(
        childFresh.inner,
        childFresh.shape,
        "bottom",
      );
      if (!bodyTop2 || !bodyBot2 || !childTop2 || !childBot2) continue;

      const noTop = noFresh
        ? nodeFacePort(noFresh.inner, noFresh.shape, "top")
        : null;
      const noBot = noFresh
        ? nodeFacePort(noFresh.inner, noFresh.shape, "bottom")
        : null;
      if (endId && noBot) {
        const endParked = nodes.get(endId);
        const endTop0 = endParked
          ? nodeFacePort(endParked.inner, endParked.shape, "top")
          : null;
        if (endTop0) shiftNode(endId, noBot.x - endTop0.x, 0);
      }
      const endFresh = endId ? nodes.get(endId) : null;
      const endTop = endFresh
        ? nodeFacePort(endFresh.inner, endFresh.shape, "top")
        : null;

      const dropPts = dedupePoints([
        { x: bodyBot2.x, y: bodyBot2.y },
        { x: bodyBot2.x, y: childTop2.y },
      ]);
      // Return: bottom of increment → floor → under tip → straight up.
      const CLEAR = 20;
      const floorY = childBot2.y + CLEAR;
      const returnPts = dedupePoints([
        { ...childBot2 },
        { x: childBot2.x, y: floorY },
        { x: d.bottom.x, y: floorY },
        { ...d.bottom },
      ]);
      const yesEdgePts = dedupePoints([
        { ...d[yesSide] },
        { ...yesStub },
        { x: yesStub.x, y: bodyTop2.y },
        { ...bodyTop2 },
      ]);
      const noEdgePts =
        noTop != null
          ? dedupePoints([
              { ...d[noSide] },
              { ...noStub },
              { x: noStub.x, y: noTop.y },
              { ...noTop },
            ])
          : null;
      const endDropPts =
        noBot && endTop
          ? dedupePoints([
              { ...noBot },
              { x: noBot.x, y: endTop.y },
              { ...endTop },
            ])
          : null;

      next = next.replace(/<polyline class="edge"([^>]*)\/>/g, (full, attrs) => {
        const from = /data-from="([^"]*)"/.exec(attrs)?.[1];
        const to = /data-to="([^"]*)"/.exec(attrs)?.[1];
        if (from === bodyId && to === childId) {
          return mkEdge(bodyId, childId, "", dropPts);
        }
        if (from === childId && to === did) {
          return mkEdge(childId, did, "", returnPts);
        }
        if (from === did && to === bodyId) {
          return mkEdge(did, bodyId, yes.label, yesEdgePts);
        }
        if (noBodyId && from === did && to === noBodyId && noEdgePts) {
          return mkEdge(did, noBodyId, noEdge?.label ?? "No", noEdgePts);
        }
        if (endId && noBodyId && from === noBodyId && to === endId && endDropPts) {
          return mkEdge(noBodyId, endId, "", endDropPts);
        }
        return full;
      });
      continue;
    }

    // Sentinel TB: Yes → body → trailing INPUT → diamond tip.
    // Move Yes column (sum + trailing INPUT) left + up.
    if ((incoming.get(bodyId) || []).length === 1) {
      shiftNode(bodyId, yesColX - body.center.x, dy);
    } else {
      shiftNode(bodyId, 0, dy);
    }
    const childBefore = nodes.get(childId);
    shiftNode(childId, yesColX - childBefore.center.x, dy);

    // Move No column (OUTPUT) right + up — anchor on TOP mid so the No drop
    // lands on the middle of the upper segment (not a skewed-side hit).
    if (noBodyId && noBody?.center) {
      const noTop0 = nodeFacePort(noBody.inner, noBody.shape, "top");
      const anchorX = noTop0?.x ?? noBody.center.x;
      shiftNode(noBodyId, noColX - anchorX, dy);
    }
    // Park END under OUTPUT for now; re-anchor on BOTTOM mid after ports refresh.
    if (endId) {
      const endBefore = nodes.get(endId);
      shiftNode(endId, noColX - endBefore.center.x, dy);
    }

    const bodyFresh = nodes.get(bodyId);
    const childFresh = nodes.get(childId);
    const noFresh = noBodyId ? nodes.get(noBodyId) : null;
    const bodyBot2 = nodeFacePort(bodyFresh.inner, bodyFresh.shape, "bottom");
    const bodyTop2 = nodeFacePort(bodyFresh.inner, bodyFresh.shape, "top");
    const childTop2 = nodeFacePort(childFresh.inner, childFresh.shape, "top");
    // Exit loop-return at the exact midpoint of the right slanted segment
    // (top-right ↔ bottom-right vertices) — never bottom mid / SE corner.
    const childPoly = /<polygon points="([^"]+)"/.exec(childFresh.inner)?.[1];
    const childPorts = childPoly ? parallelogramPorts(childPoly) : null;
    const childRight2 = childPorts?.right ?? null;
    if (!bodyBot2 || !bodyTop2 || !childTop2 || !childRight2) continue;

    const noTop = noFresh
      ? nodeFacePort(noFresh.inner, noFresh.shape, "top")
      : null;
    const noBot = noFresh
      ? nodeFacePort(noFresh.inner, noFresh.shape, "bottom")
      : null;

    // Parallelogram lean: top mid ≠ bottom mid. Exit OUTPUT→END from the
    // bottom-segment midpoint and keep END on that same vertical.
    if (endId && noBot) {
      const endParked = nodes.get(endId);
      const endTop0 = endParked
        ? nodeFacePort(endParked.inner, endParked.shape, "top")
        : null;
      if (endTop0) shiftNode(endId, noBot.x - endTop0.x, 0);
    }

    const endFresh = endId ? nodes.get(endId) : null;
    const endTop = endFresh
      ? nodeFacePort(endFresh.inner, endFresh.shape, "top")
      : null;

    const yesColNow = bodyTop2.x;
    const noColNow = noTop?.x ?? noColX;

    const dropPts = dedupePoints([
      { x: yesColNow, y: bodyBot2.y },
      { x: yesColNow, y: childTop2.y },
    ]);
    // Return: mid-right of INPUT → short horizontal stub into the channel →
    // straight vertical climb into the bottom tip (no late jog near the tip).
    const returnPts = dedupePoints([
      { ...childRight2 },
      { x: d.bottom.x, y: childRight2.y },
      { ...d.bottom },
    ]);
    const yesEdgePts = dedupePoints([
      { ...yesPts[0] },
      { x: yesColNow, y: yesPts[0].y },
      { x: yesColNow, y: bodyTop2.y },
      { ...bodyTop2 },
    ]);
    const noEdgePts =
      noTop && noPts.length
        ? dedupePoints([
            { ...noPts[0] },
            { x: noColNow, y: noPts[0].y },
            { x: noColNow, y: noTop.y },
            { ...noTop },
          ])
        : null;
    const endDropPts =
      noBot && endTop
        ? dedupePoints([
            { ...noBot },
            { x: noBot.x, y: endTop.y },
            { ...endTop },
          ])
        : null;

    next = next.replace(/<polyline class="edge"([^>]*)\/>/g, (full, attrs) => {
      const from = /data-from="([^"]*)"/.exec(attrs)?.[1];
      const to = /data-to="([^"]*)"/.exec(attrs)?.[1];
      if (from === bodyId && to === childId) {
        return mkEdge(bodyId, childId, "", dropPts);
      }
      if (from === childId && to === did) {
        return mkEdge(childId, did, "", returnPts);
      }
      if (from === did && to === bodyId) {
        return mkEdge(did, bodyId, yes.label, yesEdgePts);
      }
      if (noBodyId && from === did && to === noBodyId && noEdgePts) {
        return mkEdge(did, noBodyId, noEdge?.label ?? "No", noEdgePts);
      }
      if (endId && noBodyId && from === noBodyId && to === endId && endDropPts) {
        return mkEdge(noBodyId, endId, "", endDropPts);
      }
      return full;
    });
  }

  return next;
}

/**
 * Nested IF … THEN … merge (ex. 3.E): Yes → assign → merge, No → merge.
 * Stack assign above merge on the Yes column; No jogs above the merge box
 * then enters mid-right (no vertical through the merge height); loop return
 * climbs outside the boxes and meets `count = one` AT the WHILE tip — one
 * glued top entry, no floating T / inset gap.
 */
function alignIfThenMerge(svg) {
  /** @type {Map<string, {shape:string, inner:string, verts:ReturnType<typeof diamondVertices>|null, center:{x:number,y:number}|null}>} */
  const nodes = new Map();
  for (const m of svg.matchAll(
    /<g class="node" data-id="([^"]+)"[^>]*data-shape="([^"]+)"[^>]*>([\s\S]*?)<\/g>/g,
  )) {
    const poly = /<polygon points="([^"]+)"/.exec(m[3]);
    nodes.set(m[1], {
      shape: m[2],
      inner: m[3],
      verts: m[2] === "diamond" && poly ? diamondVertices(poly[1]) : null,
      center: nodeCenter(m[3], m[2]),
    });
  }

  /** @type {{from:string,to:string,label:string,attrs:string}[]} */
  const edges = [];
  for (const m of svg.matchAll(/<polyline class="edge"([^>]*)\/>/g)) {
    const attrs = m[1];
    const from = /data-from="([^"]*)"/.exec(attrs)?.[1];
    const to = /data-to="([^"]*)"/.exec(attrs)?.[1];
    const label = /data-label="([^"]*)"/.exec(attrs)?.[1] ?? "";
    if (!from || !to) continue;
    edges.push({ from, to, label, attrs });
  }

  /** @type {Map<string, string[]>} */
  const incoming = new Map();
  for (const e of edges) {
    if (!incoming.has(e.to)) incoming.set(e.to, []);
    incoming.get(e.to).push(e.from);
  }

  const GAP = 48;
  let next = svg;

  const refresh = (id) => {
    const idAttr = escapeAttr(id);
    const g = new RegExp(
      `<g class="node" data-id="${idAttr}"[^>]*data-shape="([^"]+)"[^>]*>([\\s\\S]*?)<\\/g>`,
    ).exec(next);
    if (!g) return;
    const poly = /<polygon points="([^"]+)"/.exec(g[2]);
    nodes.set(id, {
      shape: g[1],
      inner: g[2],
      verts: g[1] === "diamond" && poly ? diamondVertices(poly[1]) : null,
      center: nodeCenter(g[2], g[1]),
    });
  };

  const shiftNode = (id, sdx, sdy) => {
    if (Math.abs(sdx) < 0.5 && Math.abs(sdy) < 0.5) return;
    const idAttr = escapeAttr(id);
    next = next.replace(
      new RegExp(
        `(<g class="node" data-id="${idAttr}"[^>]*>)([\\s\\S]*?)(<\\/g>)`,
      ),
      (_, open, inner, close) =>
        `${open}${translateNodeGroup(inner, sdx, sdy)}${close}`,
    );
    refresh(id);
  };

  for (const [did, dNode] of nodes) {
    if (!dNode.verts) continue;
    const yes = edges.find(
      (e) => e.from === did && e.label.trim().toLowerCase() === "yes",
    );
    const no = edges.find(
      (e) => e.from === did && e.label.trim().toLowerCase() === "no",
    );
    if (!yes || !no) continue;

    const thenId = yes.to;
    const mergeId = no.to;
    const thenNode = nodes.get(thenId);
    const mergeNode = nodes.get(mergeId);
    // THEN is a plain box; No lands on the merge box; THEN feeds merge.
    if (!thenNode?.center || thenNode.verts) continue;
    if (!mergeNode?.center || mergeNode.verts) continue;
    if (thenId === mergeId) continue;
    if (!edges.some((e) => e.from === thenId && e.to === mergeId)) continue;
    const mergeIns = incoming.get(mergeId) || [];
    if (!mergeIns.includes(did) || !mergeIns.includes(thenId)) continue;
    // THEN exclusive from this IF (no other fan-in).
    if ((incoming.get(thenId) || []).length !== 1) continue;

    const d = dNode.verts;
    const yesStub = diamondExitStub(d, "left");
    const noStub = diamondExitStub(d, "right");
    const colX = yesStub.x;

    // Stack THEN then merge under the Yes column, fully below the diamond.
    {
      const thenTop = nodeFacePort(thenNode.inner, thenNode.shape, "top");
      if (!thenTop) continue;
      shiftNode(thenId, colX - thenTop.x, d.bottom.y + GAP - thenTop.y);
    }
    {
      const thenFresh = nodes.get(thenId);
      const thenBot = nodeFacePort(thenFresh.inner, thenFresh.shape, "bottom");
      const mergeTop0 = nodeFacePort(
        nodes.get(mergeId).inner,
        nodes.get(mergeId).shape,
        "top",
      );
      if (!thenBot || !mergeTop0) continue;
      shiftNode(mergeId, colX - mergeTop0.x, thenBot.y + GAP - mergeTop0.y);
    }

    const thenFresh = nodes.get(thenId);
    const mergeFresh = nodes.get(mergeId);
    const thenTop = nodeFacePort(thenFresh.inner, thenFresh.shape, "top");
    const thenBot = nodeFacePort(thenFresh.inner, thenFresh.shape, "bottom");
    const mergeTop = nodeFacePort(mergeFresh.inner, mergeFresh.shape, "top");
    const mergeBot = nodeFacePort(mergeFresh.inner, mergeFresh.shape, "bottom");
    const mergeRight = nodeFacePort(
      mergeFresh.inner,
      mergeFresh.shape,
      "right",
    );
    const mergeLeft = nodeFacePort(
      mergeFresh.inner,
      mergeFresh.shape,
      "left",
    );
    const thenLeft = nodeFacePort(thenFresh.inner, thenFresh.shape, "left");
    if (
      !thenTop ||
      !thenBot ||
      !mergeTop ||
      !mergeBot ||
      !mergeRight ||
      !mergeLeft
    ) {
      continue;
    }

    // Optional loop-back from merge to a diamond above (WHILE header).
    const loop = edges.find(
      (e) =>
        e.from === mergeId &&
        nodes.get(e.to)?.verts &&
        (nodes.get(e.to)?.center?.y ?? Infinity) < mergeFresh.center.y,
    );
    const loopDiamond = loop ? nodes.get(loop.to)?.verts : null;
    // Forward entry into the WHILE diamond (e.g. count = one → count < N).
    const entry =
      loop && loopDiamond
        ? edges.find(
            (e) =>
              e.to === loop.to &&
              e.from !== mergeId &&
              !e.label.trim() &&
              (nodes.get(e.from)?.center?.y ?? Infinity) <
                (nodes.get(loop.to)?.center?.y ?? 0),
          )
        : null;
    const entryPred = entry ? nodes.get(entry.from) : null;
    const entryBot = entryPred
      ? nodeFacePort(entryPred.inner, entryPred.shape, "bottom")
      : null;

    const stroke = /stroke="([^"]+)"/.exec(yes.attrs)?.[1] ?? "#757575";
    const sw = /stroke-width="([^"]+)"/.exec(yes.attrs)?.[1] ?? "1.5";
    const marker =
      /marker-end="([^"]*)"/.exec(yes.attrs)?.[1] || "url(#arrowhead)";

    const yesPts = insetEndpoint(
      dedupePoints([
        { ...d.left },
        { ...yesStub },
        { x: colX, y: thenTop.y },
        { ...thenTop },
      ]),
    );
    // Stop just short of the face (no marker): round linecaps otherwise
    // bleed a few px into the opaque merge fill and read as a ghost stem.
    const thenPts = insetEndpoint(
      dedupePoints([{ ...thenBot }, { ...mergeTop }]),
      2,
    );
    // No: drop beside the IF, stop ABOVE the merge box, then jog in at
    // mid-right — never run a vertical alongside/through the merge height.
    const CLEAR = 24;
    const aboveMergeY = mergeTop.y - CLEAR;
    const noLaneX = Math.max(noStub.x, mergeRight.x + CLEAR);
    const noPts = insetEndpoint(
      dedupePoints([
        { ...d.right },
        { ...noStub },
        { x: noLaneX, y: noStub.y },
        { x: noLaneX, y: aboveMergeY },
        { x: mergeRight.x + CLEAR, y: aboveMergeY },
        { x: mergeRight.x + CLEAR, y: mergeRight.y },
        { ...mergeRight },
      ]),
      2,
    );
    // Climb fully LEFT of THEN/merge boxes (colX-40 was still inside the
    // wide merge rect → ghost vertical through "count = count + one").
    const leftX =
      Math.min(
        mergeLeft.x,
        thenLeft?.x ?? Infinity,
        colX,
      ) - CLEAR;
    // One short stem into the WHILE tip: entry owns the final arrow;
    // loop joins the stem (no marker) so two opposing tips never open a gap.
    const tip = loopDiamond ? { ...loopDiamond.top } : null;
    const STEM = 14;
    const join =
      tip != null ? { x: tip.x, y: tip.y - STEM } : null;
    const loopPts =
      loop && tip && join
        ? dedupePoints([
            { ...mergeLeft },
            { x: leftX, y: mergeLeft.y },
            { x: leftX, y: join.y },
            { ...join },
          ])
        : null;
    // Stem into the tip vertex (+2px) so anti-aliased tip stroke doesn't
    // read as a floating gap; no marker-end (markers opened a clear gap).
    const tipLand = tip ? { x: tip.x, y: tip.y + 2 } : null;
    const entryPts =
      entry && entryBot && tipLand && join
        ? dedupePoints([
            { ...entryBot },
            { x: entryBot.x, y: join.y },
            { ...join },
            { ...tipLand },
          ])
        : null;

    const mkEdge = (from, to, label, pts, markerEnd = marker) => {
      const lab = ` data-label="${escapeAttr(label ?? "")}"`;
      const mark =
        markerEnd && markerEnd !== "none"
          ? ` marker-end="${escapeAttr(markerEnd)}"`
          : "";
      return `<polyline class="edge" fill="none" stroke="${escapeAttr(stroke)}" stroke-width="${escapeAttr(sw)}" stroke-linecap="round" stroke-linejoin="round" points="${formatPoints(pts)}"${mark} data-from="${escapeAttr(from)}" data-to="${escapeAttr(to)}"${lab}/>`;
    };

    next = next.replace(/<polyline class="edge"([^>]*)\/>/g, (full, attrs) => {
      const from = /data-from="([^"]*)"/.exec(attrs)?.[1];
      const to = /data-to="([^"]*)"/.exec(attrs)?.[1];
      if (from === did && to === thenId) {
        return mkEdge(did, thenId, yes.label, yesPts);
      }
      if (from === thenId && to === mergeId) {
        return mkEdge(thenId, mergeId, "", thenPts, "none");
      }
      if (from === did && to === mergeId) {
        return mkEdge(did, mergeId, no.label, noPts, "none");
      }
      if (loop && loopPts && from === mergeId && to === loop.to) {
        // Merge into the entry stem — no second arrowhead at the tip.
        return mkEdge(mergeId, loop.to, "", loopPts, "none");
      }
      if (entry && entryPts && from === entry.from && to === entry.to) {
        return mkEdge(entry.from, entry.to, "", entryPts, "none");
      }
      return full;
    });
  }

  return next;
}

/**
 * Nested FOR loops (TB) — same primitives as S3 WHILE / rewireDiamondPorts:
 * diamondExitStub, GAP_BELOW_DIAMOND, left/right Yes/No drops, bottom-tip
 * returns. No aimPast / insetEndpoint (native markers like the TB spine).
 *
 * Graph: START → i=1 → outer{i<=N} -Yes→ j=1 → inner{j<=M} -Yes→ OUTPUT → j++
 *         → inner; inner -No→ i++ → outer; outer -No→ END.
 */
function alignNestedLoopsTB(svg) {
  /** @type {Map<string, {shape:string, inner:string, verts:ReturnType<typeof diamondVertices>|null, center:{x:number,y:number}|null}>} */
  const nodes = new Map();
  for (const m of svg.matchAll(
    /<g class="node" data-id="([^"]+)"[^>]*data-shape="([^"]+)"[^>]*>([\s\S]*?)<\/g>/g,
  )) {
    const poly = /<polygon points="([^"]+)"/.exec(m[3]);
    nodes.set(m[1], {
      shape: m[2],
      inner: m[3],
      verts: m[2] === "diamond" && poly ? diamondVertices(poly[1]) : null,
      center: nodeCenter(m[3], m[2]),
    });
  }

  /** @type {{from:string,to:string,label:string,points:string,attrs:string}[]} */
  const edges = [];
  for (const m of svg.matchAll(/<polyline class="edge"([^>]*)\/>/g)) {
    const attrs = m[1];
    const from = /data-from="([^"]*)"/.exec(attrs)?.[1];
    const to = /data-to="([^"]*)"/.exec(attrs)?.[1];
    const label = /data-label="([^"]*)"/.exec(attrs)?.[1] ?? "";
    const points = /points="([^"]+)"/.exec(attrs)?.[1];
    if (!from || !to || !points) continue;
    edges.push({ from, to, label, points, attrs });
  }

  /** @type {Map<string, string[]>} */
  const outgoing = new Map();
  for (const e of edges) {
    if (!outgoing.has(e.from)) outgoing.set(e.from, []);
    outgoing.get(e.from).push(e.to);
  }

  const lab = (e) => e.label.trim().toLowerCase();
  const findEdge = (from, to) =>
    edges.find((e) => e.from === from && e.to === to);

  let match = null;
  for (const [oid, oNode] of nodes) {
    if (!oNode.verts) continue;
    const oYes = edges.find((e) => e.from === oid && lab(e) === "yes");
    const oNo = edges.find((e) => e.from === oid && lab(e) === "no");
    if (!oYes || !oNo) continue;
    const initId = oYes.to;
    const init = nodes.get(initId);
    if (!init?.center || init.verts) continue;
    const initOuts = outgoing.get(initId) || [];
    if (initOuts.length !== 1) continue;
    const iid = initOuts[0];
    const iNode = nodes.get(iid);
    if (!iNode?.verts) continue;
    const iYes = edges.find((e) => e.from === iid && lab(e) === "yes");
    const iNo = edges.find((e) => e.from === iid && lab(e) === "no");
    if (!iYes || !iNo) continue;
    const bodyId = iYes.to;
    const body = nodes.get(bodyId);
    if (!body?.center || body.verts) continue;
    const bodyOuts = outgoing.get(bodyId) || [];
    if (bodyOuts.length !== 1) continue;
    const jIncId = bodyOuts[0];
    const jInc = nodes.get(jIncId);
    if (!jInc?.center || jInc.verts) continue;
    if (!findEdge(jIncId, iid)) continue;
    const iIncId = iNo.to;
    const iInc = nodes.get(iIncId);
    if (!iInc?.center || iInc.verts) continue;
    if (!findEdge(iIncId, oid)) continue;
    const endId = oNo.to;
    if (!nodes.get(endId)?.center) continue;
    const preds = edges.filter((e) => e.to === oid && !e.label.trim());
    if (preds.length < 1) continue;
    match = { oid, iid, initId, bodyId, jIncId, iIncId, endId };
    break;
  }
  if (!match) return svg;

  const { oid, iid, initId, bodyId, jIncId, iIncId, endId } = match;

  // Spine above outer diamond (typically START → i=1).
  const spine = [];
  let cur = oid;
  for (let guard = 0; guard < 8; guard++) {
    const ins = edges.filter(
      (e) =>
        e.to === cur &&
        !lab(e) &&
        e.from !== iIncId &&
        e.from !== jIncId,
    );
    if (ins.length !== 1) break;
    spine.unshift(ins[0].from);
    cur = ins[0].from;
  }

  // Same band as rewireDiamondPorts TB / S3 WHILE (targets on stub axis).
  const GAP = 40;

  let next = svg;
  const refresh = (id) => {
    const idAttr = escapeAttr(id);
    const g = new RegExp(
      `<g class="node" data-id="${idAttr}"[^>]*data-shape="([^"]+)"[^>]*>([\\s\\S]*?)<\\/g>`,
    ).exec(next);
    if (!g) return;
    const poly = /<polygon points="([^"]+)"/.exec(g[2]);
    nodes.set(id, {
      shape: g[1],
      inner: g[2],
      verts: g[1] === "diamond" && poly ? diamondVertices(poly[1]) : null,
      center: nodeCenter(g[2], g[1]),
    });
  };
  const shiftNode = (id, dx, dy) => {
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    const idAttr = escapeAttr(id);
    next = next.replace(
      new RegExp(
        `(<g class="node" data-id="${idAttr}"[^>]*>)([\\s\\S]*?)(<\\/g>)`,
      ),
      (_, open, inner, close) =>
        `${open}${translateNodeGroup(inner, dx, dy)}${close}`,
    );
    refresh(id);
  };
  const moveCenterTo = (id, x, y) => {
    const n = nodes.get(id);
    if (!n?.center) return;
    shiftNode(id, x - n.center.x, y - n.center.y);
  };
  const halfH = (id) => {
    const n = nodes.get(id);
    if (!n) return 18;
    if (n.verts) return (n.verts.bottom.y - n.verts.top.y) / 2;
    const T = nodeFacePort(n.inner, n.shape, "top");
    const B = nodeFacePort(n.inner, n.shape, "bottom");
    if (T && B) return (B.y - T.y) / 2;
    return 18;
  };

  // Vertical spine on a shared x; park diamonds / body below.
  const spineX =
    nodes.get(spine[0] || oid)?.center?.x ?? nodes.get(oid).center.x;
  let y = 40;
  for (const id of spine) {
    y += halfH(id);
    moveCenterTo(id, spineX, y);
    y += halfH(id) + GAP;
  }
  {
    refresh(oid);
    const d = nodes.get(oid);
    y += (d.verts.bottom.y - d.verts.top.y) / 2;
    moveCenterTo(oid, spineX, y);
    y = nodes.get(oid).verts.bottom.y + GAP;
  }

  refresh(oid);
  const o0 = nodes.get(oid).verts;
  const oYesStub0 = diamondExitStub(o0, "left");
  const oNoStub0 = diamondExitStub(o0, "right");

  // Outer Yes column: j=1 → inner diamond → OUTPUT → j++ (on Yes stub x).
  {
    const initTop = nodeFacePort(
      nodes.get(initId).inner,
      nodes.get(initId).shape,
      "top",
    );
    if (initTop) {
      shiftNode(initId, oYesStub0.x - initTop.x, y - initTop.y);
    }
    y = (nodeFacePort(
      nodes.get(initId).inner,
      nodes.get(initId).shape,
      "bottom",
    )?.y ?? y) + GAP;

    // Inner diamond centred under j=1 (entry via top tip).
    refresh(initId);
    const initCx = nodes.get(initId).center.x;
    refresh(iid);
    const iH = nodes.get(iid).verts
      ? (nodes.get(iid).verts.bottom.y - nodes.get(iid).verts.top.y) / 2
      : halfH(iid);
    moveCenterTo(iid, initCx, y + iH);
    y = nodes.get(iid).verts.bottom.y + GAP;

    refresh(iid);
    const inn0 = nodes.get(iid).verts;
    const iYesStub0 = diamondExitStub(inn0, "left");
    const iNoStub0 = diamondExitStub(inn0, "right");

    const bodyTop = nodeFacePort(
      nodes.get(bodyId).inner,
      nodes.get(bodyId).shape,
      "top",
    );
    if (bodyTop) {
      shiftNode(bodyId, iYesStub0.x - bodyTop.x, y - bodyTop.y);
    }
    y =
      (nodeFacePort(
        nodes.get(bodyId).inner,
        nodes.get(bodyId).shape,
        "bottom",
      )?.y ?? y) + GAP;

    // Align j++ under OUTPUT bottom mid (straight drop like S3 body stack).
    refresh(bodyId);
    refresh(jIncId);
    const outBot = nodeFacePort(
      nodes.get(bodyId).inner,
      nodes.get(bodyId).shape,
      "bottom",
    );
    const jTop = nodeFacePort(
      nodes.get(jIncId).inner,
      nodes.get(jIncId).shape,
      "top",
    );
    if (outBot && jTop) {
      shiftNode(jIncId, outBot.x - jTop.x, outBot.y + GAP - jTop.y);
    }

    // Inner No → i++ on No stub axis.
    refresh(iid);
    refresh(iIncId);
    const iIncTop = nodeFacePort(
      nodes.get(iIncId).inner,
      nodes.get(iIncId).shape,
      "top",
    );
    const innBot = nodes.get(iid).verts.bottom.y;
    if (iIncTop) {
      shiftNode(iIncId, iNoStub0.x - iIncTop.x, innBot + GAP - iIncTop.y);
    }

    // Outer No → END on outer No stub axis.
    refresh(endId);
    const endTop = nodeFacePort(
      nodes.get(endId).inner,
      nodes.get(endId).shape,
      "top",
    );
    if (endTop) {
      shiftNode(endId, oNoStub0.x - endTop.x, o0.right.y + GAP - endTop.y);
    }
  }

  for (const id of [
    ...spine,
    oid,
    initId,
    iid,
    bodyId,
    jIncId,
    iIncId,
    endId,
  ]) {
    refresh(id);
  }

  const o = nodes.get(oid).verts;
  const inn = nodes.get(iid).verts;
  const stroke =
    /stroke="([^"]+)"/.exec(edges[0]?.attrs ?? "")?.[1] ?? "#757575";
  const sw =
    /stroke-width="([^"]+)"/.exec(edges[0]?.attrs ?? "")?.[1] ?? "1.5";
  const marker =
    /marker-end="([^"]*)"/.exec(edges[0]?.attrs ?? "")?.[1] ||
    "url(#arrowhead)";

  // Same edge writer as alignLoopBodyColumn TB (no inset).
  const mkEdge = (from, to, label, pts) => {
    const labAttr = ` data-label="${escapeAttr(label ?? "")}"`;
    return `<polyline class="edge" fill="none" stroke="${escapeAttr(stroke)}" stroke-width="${escapeAttr(sw)}" stroke-linecap="round" stroke-linejoin="round" points="${formatPoints(dedupePoints(pts))}" marker-end="${escapeAttr(marker)}" data-from="${escapeAttr(from)}" data-to="${escapeAttr(to)}"${labAttr}/>`;
  };

  const topOf = (id) =>
    nodeFacePort(nodes.get(id).inner, nodes.get(id).shape, "top");
  const botOf = (id) =>
    nodeFacePort(nodes.get(id).inner, nodes.get(id).shape, "bottom");
  const leftOf = (id) =>
    nodeFacePort(nodes.get(id).inner, nodes.get(id).shape, "left");
  const rightOf = (id) =>
    nodeFacePort(nodes.get(id).inner, nodes.get(id).shape, "right");
  /** True leftmost ink of a node (parallelogram lean extends past top-mid). */
  const minNodeX = (id) => {
    const n = nodes.get(id);
    if (!n) return Infinity;
    if (n.verts) return n.verts.left.x;
    const poly = /<polygon points="([^"]+)"/.exec(n.inner)?.[1];
    if (poly) {
      return Math.min(...parsePoints(poly).map((p) => p.x));
    }
    const rect =
      /<rect\s+x="([^"]+)"/.exec(n.inner) ||
      /<rect\b[^>]*\sx="([^"]+)"/.exec(n.inner);
    if (rect) return Number(rect[1]);
    return leftOf(id)?.x ?? Infinity;
  };
  /** True rightmost ink of a node. */
  const maxNodeX = (id) => {
    const n = nodes.get(id);
    if (!n) return -Infinity;
    if (n.verts) return n.verts.right.x;
    const poly = /<polygon points="([^"]+)"/.exec(n.inner)?.[1];
    if (poly) {
      return Math.max(...parsePoints(poly).map((p) => p.x));
    }
    const rect =
      /<rect\s+x="([^"]+)"[^>]*width="([^"]+)"/.exec(n.inner) ||
      /<rect\b[^>]*\sx="([^"]+)"[^>]*width="([^"]+)"/.exec(n.inner);
    if (rect) return Number(rect[1]) + Number(rect[2]);
    return rightOf(id)?.x ?? -Infinity;
  };

  const oYesStub = diamondExitStub(o, "left");
  const oNoStub = diamondExitStub(o, "right");
  const iYesStub = diamondExitStub(inn, "left");
  const iNoStub = diamondExitStub(inn, "right");

  const initTop = topOf(initId);
  const initBot = botOf(initId);
  const bodyTop = topOf(bodyId);
  const bodyBot = botOf(bodyId);
  const jTop = topOf(jIncId);
  const jRight = rightOf(jIncId);
  const jBot = botOf(jIncId);
  const iIncTop = topOf(iIncId);
  const iIncBot = botOf(iIncId);
  const endTop = topOf(endId);
  const CLEAR = 24;

  /** @type {Map<string, string>} */
  const edgeMap = new Map();

  // Spine drops.
  for (let i = 0; i < spine.length; i++) {
    const from = spine[i];
    const to = i + 1 < spine.length ? spine[i + 1] : oid;
    const src = botOf(from);
    const land = nodes.get(to)?.verts
      ? nodes.get(to).verts.top
      : topOf(to);
    if (src && land) {
      edgeMap.set(
        `${from}->${to}`,
        mkEdge(from, to, "", [
          { ...src },
          { x: land.x, y: src.y },
          { ...land },
        ]),
      );
    }
  }

  // Outer Yes → j=1 (tip → stub → drop → top).
  if (initTop) {
    edgeMap.set(
      `${oid}->${initId}`,
      mkEdge(oid, initId, "Yes", [
        { ...o.left },
        { ...oYesStub },
        { x: oYesStub.x, y: initTop.y },
        { ...initTop },
      ]),
    );
  }
  // j=1 → inner top.
  if (initBot) {
    edgeMap.set(
      `${initId}->${iid}`,
      mkEdge(initId, iid, "", [
        { ...initBot },
        { x: inn.top.x, y: initBot.y },
        { ...inn.top },
      ]),
    );
  }
  // Inner Yes → OUTPUT.
  if (bodyTop) {
    edgeMap.set(
      `${iid}->${bodyId}`,
      mkEdge(iid, bodyId, "Yes", [
        { ...inn.left },
        { ...iYesStub },
        { x: iYesStub.x, y: bodyTop.y },
        { ...bodyTop },
      ]),
    );
  }
  // OUTPUT → j++ vertical.
  if (bodyBot && jTop) {
    edgeMap.set(
      `${bodyId}->${jIncId}`,
      mkEdge(bodyId, jIncId, "", [
        { x: jTop.x, y: bodyBot.y },
        { ...jTop },
      ]),
    );
  }
  // Outer return stays on a left lane. Inner return (j++) exits the
  // RIGHT face and climbs in a corridor right of OUTPUT/j++ (never
  // through those boxes, never on the same shaft as i++).
  const MARGIN = 36;
  const stem = 16;
  const inkLeft = Math.min(
    o.left.x,
    inn.left.x,
    minNodeX(initId),
    minNodeX(bodyId),
    minNodeX(jIncId),
  );
  const outerLaneX = inkLeft - MARGIN;

  // j++ → inner tip: right face → tip column → straight up into bottom
  // tip (same x as inn.bottom — no final Up→Left→Up zig-zag). Tip x
  // sits right of OUTPUT/j++ ink, so the climb does not pierce them.
  if (jRight) {
    const tipX = inn.bottom.x;
    edgeMap.set(
      `${jIncId}->${iid}`,
      mkEdge(jIncId, iid, "", [
        { ...jRight },
        { x: tipX, y: jRight.y },
        { ...inn.bottom },
      ]),
    );
  }
  // Inner No → i++.
  if (iIncTop) {
    edgeMap.set(
      `${iid}->${iIncId}`,
      mkEdge(iid, iIncId, "No", [
        { ...inn.right },
        { ...iNoStub },
        { x: iNoStub.x, y: iIncTop.y },
        { ...iIncTop },
      ]),
    );
  }
  // i++ → outer tip via outerLaneX (left). Floor below j++.
  if (iIncBot) {
    const floorY =
      Math.max(iIncBot.y, jBot?.y ?? iIncBot.y) + CLEAR;
    edgeMap.set(
      `${iIncId}->${oid}`,
      mkEdge(iIncId, oid, "", [
        { ...iIncBot },
        { x: iIncBot.x, y: floorY },
        { x: outerLaneX, y: floorY },
        { x: outerLaneX, y: o.bottom.y + stem },
        { x: o.bottom.x, y: o.bottom.y + stem },
        { ...o.bottom },
      ]),
    );
  }
  // Outer No → END.
  if (endTop) {
    edgeMap.set(
      `${oid}->${endId}`,
      mkEdge(oid, endId, "No", [
        { ...o.right },
        { ...oNoStub },
        { x: oNoStub.x, y: endTop.y },
        { ...endTop },
      ]),
    );
  }

  next = next.replace(/<polyline class="edge"([^>]*)\/>/g, (full, attrs) => {
    const from = /data-from="([^"]*)"/.exec(attrs)?.[1];
    const to = /data-to="([^"]*)"/.exec(attrs)?.[1];
    if (!from || !to) return full;
    return edgeMap.get(`${from}->${to}`) ?? full;
  });

  return next;
}

/**
 * Edges are painted before nodes by default, so opaque fills hide the first
 * pixels of tip exits (Yes/No) and make stubs look detached. Move edges +
 * labels after node groups — markers unchanged.
 */
function paintEdgesAboveNodes(svg) {
  const edges = [...svg.matchAll(/<polyline class="edge"[^>]*\/>/g)].map(
    (m) => m[0],
  );
  const labels = [...svg.matchAll(/<g class="edge-label"[\s\S]*?<\/g>/g)].map(
    (m) => m[0],
  );
  if (edges.length === 0) return svg;
  let next = svg;
  for (const e of edges) next = next.replace(e, "");
  for (const l of labels) next = next.replace(l, "");
  const block = `${edges.join("\n")}${labels.length ? `\n${labels.join("\n")}` : ""}\n`;
  return next.replace(/<\/svg>\s*$/, `${block}</svg>`);
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
  // S4 FOR = same path as S3 WHILE (rewireDiamondPorts). Nested TB uses
  // the same stubs/gaps via alignNestedLoopsTB — not a parallel LR geometry.
  return restoreLabelBrackets(
    fitSvgViewBox(
      paintEdgesAboveNodes(
        transparentizeEdgeLabels(
          nudgeEdgeLabelsNearSource(
            alignNestedLoopsTB(
              alignIfThenMerge(
                placeDiamondsBelowPredecessors(
                  alignRepeatInputDiamond(
                    alignLoopBodyColumn(
                      collapseJunctionNodes(
                        rewireDiamondPorts(
                          retargetParallelogramPorts(
                            applyParallelograms(svg, lean),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
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
