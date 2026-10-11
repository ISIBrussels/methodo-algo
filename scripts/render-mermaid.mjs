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
  // Slanted sides: leftmost / rightmost vertices (forward lean).
  const leftPts = [...pts].sort((a, b) => a.x - b.x).slice(0, 2);
  const rightPts = [...pts].sort((a, b) => b.x - a.x).slice(0, 2);
  return {
    top: mid(top[0], top[1]),
    bottom: mid(bot[0], bot[1]),
    left: mid(leftPts[0], leftPts[1]),
    right: mid(rightPts[0], rightPts[1]),
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
    // Only vertical approaches (typical TB I/O landing).
    if (Math.abs(prev.x - end.x) > 1 && Math.abs(prev.y - end.y) <= 1) {
      return full;
    }
    if (Math.abs(prev.x - end.x) > 1) return full;

    const target = prev.y <= end.y ? p.top : p.bottom;
    if (Math.hypot(target.x - end.x, target.y - end.y) <= 0.5) return full;

    pts[pts.length - 1] = { ...target };
    pts[pts.length - 2] = { x: target.x, y: prev.y };
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

/** Pin diamond <text>/<tspan> on the rhombus centre (text-anchor=middle). */
function centerDiamondLabel(groupInner, cx, cy) {
  let next = groupInner.replace(/<text\b([^>]*)>/g, (_, attrs) => {
    let out = attrs;
    if (/\sx="[^"]*"/.test(out) || /^x="/.test(out.trim())) {
      out = out.replace(/(^|\s)x="[^"]+"/, `$1x="${cx}"`);
    } else {
      out = ` x="${cx}"${out}`;
    }
    if (/\sy="[^"]*"/.test(out) || /^y="/.test(out.trim())) {
      out = out.replace(/(^|\s)y="[^"]+"/, `$1y="${cy}"`);
    } else {
      out = ` y="${cy}"${out}`;
    }
    if (!/text-anchor=/.test(out)) {
      out += ` text-anchor="middle"`;
    }
    return `<text${out}>`;
  });
  next = next.replace(/<tspan\b([^>]*)>/g, (_, attrs) => {
    let out = attrs;
    if (/(^|\s)x="/.test(out)) {
      out = out.replace(/(^|\s)x="[^"]+"/, `$1x="${cx}"`);
    } else {
      out = ` x="${cx}"${out}`;
    }
    return `<tspan${out}>`;
  });
  return next;
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

  for (const m of svg.matchAll(/\bpoints="([^"]+)"/g)) {
    const attr = m[1].trim();
    if (/^-?[\d.]+,/.test(attr)) {
      for (const p of parsePoints(attr)) push(p.x, p.y);
    } else {
      for (const pair of attr.split(/\s*,\s*/)) {
        const [x, y] = pair.trim().split(/\s+/).map(Number);
        push(x, y);
      }
    }
  }
  for (const m of svg.matchAll(/<rect\b([^>]*)\/>/g)) {
    const attrs = m[1];
    const x = Number(/\bx="([^"]+)"/.exec(attrs)?.[1]);
    const y = Number(/\by="([^"]+)"/.exec(attrs)?.[1]);
    const w = Number(/\bwidth="([^"]+)"/.exec(attrs)?.[1]);
    const h = Number(/\bheight="([^"]+)"/.exec(attrs)?.[1]);
    if (![x, y, w, h].every(Number.isFinite)) continue;
    push(x, y);
    push(x + w, y + h);
  }
  for (const m of svg.matchAll(/<text\b([^>]*)>/g)) {
    const attrs = m[1];
    push(
      Number(/\bx="([^"]+)"/.exec(attrs)?.[1]),
      Number(/\by="([^"]+)"/.exec(attrs)?.[1]),
    );
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
 * REPEAT … UNTIL TB spine: parallelogram (INPUT) → diamond test with No looping
 * back to the same INPUT. Align START centre, INPUT centre and diamond top tip
 * on one vertical. Exit INPUT on that same X at the bottom edge (lean ⇒ this
 * is the visual mid of the shape, coinciding with bottom-segment mid only when
 * sides are vertical). Yes→END and No→INPUT (stub + climb) are rebuilt.
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

  let next = svg;
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
    // REPEAT password pattern only: No returns to the same INPUT.
    if (!noEdge || !yesEdge) continue;

    const endId = yesEdge.to;
    const endNode = nodes.get(endId);
    // Exclusive Yes target (END); skip if Yes feeds a shared body.
    if (!endNode?.center || endNode.verts) continue;
    if ((incoming.get(endId) || []).length !== 1) continue;

    // START (or other non-diamond feeder) defines the vertical spine via its centre.
    const feed = edges.find(
      (e) =>
        e.to === inputId &&
        e.from !== did &&
        !nodes.get(e.from)?.verts,
    );
    const feedNode = feed ? nodes.get(feed.from) : null;
    const top0 = nodeFacePort(input.inner, input.shape, "top");
    const bot0 = nodeFacePort(input.inner, input.shape, "bottom");
    if (!top0 || !bot0) continue;
    const feedPts = feed ? parsePoints(feed.points) : [];
    const spineX = feedNode?.center?.x ?? input.center.x;

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
          verts:
            g[1] === "diamond" && poly ? diamondVertices(poly[1]) : null,
          center: nodeCenter(g[2], g[1]),
        });
      }
    };

    // Keep INPUT centre on the START spine (do not park on bottom-mid: lean
    // would slide the parallelogram off START).
    shiftNode(inputId, spineX - input.center.x, 0);
    const inputMid = nodes.get(inputId);
    const bot = nodeFacePort(inputMid.inner, inputMid.shape, "bottom");
    const top = nodeFacePort(inputMid.inner, inputMid.shape, "top");
    const right = nodeFacePort(inputMid.inner, inputMid.shape, "right");
    if (!bot || !top || !right) continue;

    const ddx = spineX - dNode.verts.top.x;
    shiftNode(did, ddx, 0);
    shiftNode(endId, ddx, 0);

    // After the polygon move, force label anchors onto the diamond centre
    // (covers any tspan that translateNodeGroup might have missed).
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
    const endFresh = nodes.get(endId);
    if (!d || !endFresh) continue;

    const endTop = nodeFacePort(endFresh.inner, endFresh.shape, "top");
    if (!endTop) continue;

    // Fine-tune END onto the Yes stub X (stadium top mid).
    const yesStub = diamondExitStub(d, "left");
    shiftNode(endId, yesStub.x - endTop.x, 0);
    const endTop2 = nodeFacePort(
      nodes.get(endId).inner,
      nodes.get(endId).shape,
      "top",
    );
    if (!endTop2) continue;

    const noStub = diamondExitStub(d, "right");
    const pad = 18;
    const colX = Math.max(noStub.x, right.x + pad);

    const stroke = /stroke="([^"]+)"/.exec(drop.attrs)?.[1] ?? "#757575";
    const sw = /stroke-width="([^"]+)"/.exec(drop.attrs)?.[1] ?? "1.5";
    const marker =
      /marker-end="([^"]*)"/.exec(drop.attrs)?.[1] || "url(#arrowhead)";

    // Top/bottom edge hits on the shared centre axis (visual mid of INPUT).
    const attachTop = { x: spineX, y: top.y };
    const attachBot = { x: spineX, y: bot.y };
    const feedStart = feedNode
      ? nodeFacePort(feedNode.inner, feedNode.shape, "bottom")
      : null;
    const feedPtsOut =
      feedStart || feedPts.length
        ? dedupePoints([
            { x: spineX, y: feedStart?.y ?? feedPts[0].y },
            { ...attachTop },
          ])
        : null;
    const dropPts = dedupePoints([
      { ...attachBot },
      { x: spineX, y: d.top.y },
      { ...d.top },
    ]);
    const yesPts = dedupePoints([
      { ...d.left },
      { ...yesStub },
      { x: yesStub.x, y: endTop2.y },
      { ...endTop2 },
    ]);
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

    const feedFrom = feed?.from;
    next = next.replace(/<polyline class="edge"([^>]*)\/>/g, (full, attrs) => {
      const from = /data-from="([^"]*)"/.exec(attrs)?.[1];
      const to = /data-to="([^"]*)"/.exec(attrs)?.[1];
      if (feedFrom && feedPtsOut && from === feedFrom && to === inputId) {
        return mkEdge(feedFrom, inputId, "", feedPtsOut);
      }
      if (from === inputId && to === did) {
        return mkEdge(inputId, did, "", dropPts);
      }
      if (from === did && to === endId) {
        return mkEdge(did, endId, yesEdge.label, yesPts);
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
 * Sentinel (primed) TB layout: Yes body + trailing INPUT left, No body right,
 * return climbs the center channel into the diamond BOTTOM tip (no left spaghetti).
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
    // Sentinel pattern only: trailing INPUT in the Yes body (skip WHILE counter…).
    if (!child?.center || child.verts || child.shape !== "parallelogram") {
      continue;
    }

    const noEdge = edges.find(
      (e) => e.from === did && e.label.trim().toLowerCase() === "no",
    );
    const noBodyId = noEdge?.to;
    const noBody = noBodyId ? nodes.get(noBodyId) : null;
    // Optional exclusive No→END (or similar) under the No column.
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
    const stubYesX = yesPts.length >= 2 ? yesPts[1].x : body.center.x;
    const stubNoX =
      noPts.length >= 2 ? noPts[1].x : noBody?.center.x ?? stubYesX + 120;
    // Widen the channel between Yes/No columns so the return climb is readable.
    const SPREAD = 40;
    const yesColX = stubYesX - SPREAD;
    const noColX = stubNoX + SPREAD;

    const d = dNode.verts;
    const bodyTop0 = nodeFacePort(body.inner, body.shape, "top");
    if (!bodyTop0) continue;
    // Compress the empty band under the diamond (classic TB, less tall).
    const GAP_BELOW_DIAMOND = 40;
    const dy = d.bottom.y + GAP_BELOW_DIAMOND - bodyTop0.y;

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
    const childBot2 = nodeFacePort(childFresh.inner, childFresh.shape, "bottom");
    if (!bodyBot2 || !bodyTop2 || !childTop2 || !childBot2) continue;

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

    const stroke = /stroke="([^"]+)"/.exec(loopChild.attrs)?.[1] ?? "#757575";
    const sw = /stroke-width="([^"]+)"/.exec(loopChild.attrs)?.[1] ?? "1.5";
    const marker =
      /marker-end="([^"]*)"/.exec(loopChild.attrs)?.[1] || "url(#arrowhead)";

    const yesColNow = bodyTop2.x;
    const noColNow = noTop?.x ?? noColX;

    const dropPts = dedupePoints([
      { x: yesColNow, y: bodyBot2.y },
      { x: yesColNow, y: childTop2.y },
    ]);
    // Return: INPUT → horizontal under the diamond → straight vertical climb
    // into the bottom tip (no late jog near the tip).
    const returnPts = dedupePoints([
      { ...childBot2 },
      { x: d.bottom.x, y: childBot2.y },
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

    const mkEdge = (from, to, label, pts) => {
      const lab = ` data-label="${escapeAttr(label ?? "")}"`;
      return `<polyline class="edge" fill="none" stroke="${escapeAttr(stroke)}" stroke-width="${escapeAttr(sw)}" stroke-linecap="round" stroke-linejoin="round" points="${formatPoints(pts)}" marker-end="${escapeAttr(marker)}" data-from="${escapeAttr(from)}" data-to="${escapeAttr(to)}"${lab}/>`;
    };

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
  return fitSvgViewBox(
    transparentizeEdgeLabels(
      nudgeEdgeLabelsNearSource(
        alignRepeatInputDiamond(
          alignLoopBodyColumn(
            collapseJunctionNodes(
              rewireDiamondPorts(
                retargetParallelogramPorts(applyParallelograms(svg, lean)),
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
