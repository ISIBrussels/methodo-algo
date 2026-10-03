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

/** Visual midpoints of a parallelogram's top/bottom faces (skew shifts them). */
function parallelogramPorts(pointsAttr) {
  const pts = parsePoints(pointsAttr);
  if (pts.length < 4) return null;
  const ys = pts.map((p) => p.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const top = pts.filter((p) => Math.abs(p.y - minY) < 0.5);
  const bot = pts.filter((p) => Math.abs(p.y - maxY) < 0.5);
  if (top.length < 2 || bot.length < 2) return null;
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  return {
    top: mid(top[0], top[1]),
    bottom: mid(bot[0], bot[1]),
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
  let next = groupInner.replace(
    /<polygon points="([^"]+)"/g,
    (_, pts) =>
      `<polygon points="${formatPoints(
        parsePoints(pts).map((p) => ({ x: p.x + dx, y: p.y + dy })),
      )}"`,
  );
  next = next.replace(/<rect\b([^>]*?)\/>/g, (_, attrs) => {
    const x = Number(/x="([^"]+)"/.exec(attrs)?.[1] ?? 0);
    const y = Number(/y="([^"]+)"/.exec(attrs)?.[1] ?? 0);
    let out = attrs
      .replace(/\sx="[^"]*"/, ` x="${x + dx}"`)
      .replace(/\sy="[^"]*"/, ` y="${y + dy}"`);
    return `<rect${out}/>`;
  });
  next = next.replace(/<text\b([^>]*)>/g, (_, attrs) => {
    const x = Number(/x="([^"]+)"/.exec(attrs)?.[1] ?? 0);
    const y = Number(/y="([^"]+)"/.exec(attrs)?.[1] ?? 0);
    let out = attrs
      .replace(/\sx="[^"]*"/, ` x="${x + dx}"`)
      .replace(/\sy="[^"]*"/, ` y="${y + dy}"`);
    return `<text${out}>`;
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
    if (side === "top" || side === "bottom") return ports[side];
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
    // Move every edge endpoint that touches this node.
    next = next.replace(/<polyline class="edge"([^>]*)\/>/g, (full, attrs) => {
      const from = /data-from="([^"]*)"/.exec(attrs)?.[1];
      const to = /data-to="([^"]*)"/.exec(attrs)?.[1];
      const pointsAttr = /points="([^"]+)"/.exec(attrs)?.[1];
      if (!pointsAttr || (from !== id && to !== id)) return full;
      const pts = parsePoints(pointsAttr);
      if (from === id) {
        const old = { ...pts[0] };
        pts[0] = { x: old.x + dx, y: old.y + dy };
        if (pts.length > 1) {
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
        if (last >= 1) {
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
          }
          pts = dedupePoints([
            { ...v },
            { ...stub },
            { x: stub.x, y: end.y },
            { ...end },
          ]);
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
          } else if (targetNode?.verts) {
            end = { ...targetNode.verts.left };
          }
          pts = dedupePoints([
            { ...v },
            { ...stub },
            { x: end.x, y: stub.y },
            { ...end },
          ]);
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
      const onCorner = [d.top, d.right, d.bottom, d.left].some(
        (v) => Math.hypot(v.x - end.x, v.y - end.y) <= 0.75,
      );
      if (!onCorner) {
        const prev = pts[pts.length - 2];
        const dx = end.x - prev.x;
        const dy = end.y - prev.y;
        const target =
          Math.abs(dy) >= Math.abs(dx)
            ? dy < 0
              ? d.bottom
              : d.top
            : dx < 0
              ? d.right
              : d.left;
        if (Math.hypot(target.x - end.x, target.y - end.y) > 0.75) {
          pts[pts.length - 1] = { ...target };
          if (Math.abs(dy) >= Math.abs(dx)) {
            pts[pts.length - 2] = { x: target.x, y: prev.y };
          } else {
            pts[pts.length - 2] = { x: prev.x, y: target.y };
          }
          pts = dedupePoints(pts);
          changed = true;
        }
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
    nudgeEdgeLabelsNearSource(
      rewireDiamondPorts(
        retargetParallelogramPorts(applyParallelograms(svg, lean)),
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
