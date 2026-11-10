#!/usr/bin/env node
/**
 * Génère docs/seances/NN/syllabus_seance_NN.md à partir des slides Marp.
 * Même contenu que les slides, forme markdown scrollable (pattern labo-info-pass).
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SEANCES = path.join(ROOT, "docs", "seances");

function stripFrontmatter(src) {
  if (!src.startsWith("---\n") && !src.startsWith("---\r\n")) {
    return { frontmatter: "", body: src };
  }
  const end = src.indexOf("\n---", 3);
  if (end === -1) return { frontmatter: "", body: src };
  const fm = src.slice(4, end);
  let body = src.slice(end + 4);
  if (body.startsWith("\n")) body = body.slice(1);
  return { frontmatter: fm, body };
}

function themeFromFrontmatter(fm, body) {
  const titleMatch = fm.match(/^title:\s*"?(?:Séance\s+\d+\s+[—\-]\s*)?([^"\n]+)"?\s*$/m);
  if (titleMatch) return titleMatch[1].trim();
  // Fallback: deuxième ligne non vide sous le H2 « Séance N »
  const lines = body.split(/\r?\n/);
  let afterTitle = false;
  for (const line of lines) {
    if (/^##\s+Séance\s+\d+/.test(line)) {
      afterTitle = true;
      continue;
    }
    if (afterTitle) {
      const t = line.trim();
      if (!t) continue;
      if (t.startsWith("[") || t.startsWith("#") || t.startsWith("<")) break;
      return t;
    }
  }
  return "Thème à définir";
}

function sessionNumFromPath(filePath) {
  const m = filePath.match(/cours_seance_(\d+)\.md$/);
  return m ? m[1] : "00";
}

function buildSyllabus({ num, theme, body }) {
  const n = Number(num);
  const pad = String(num).padStart(2, "0");
  const slidesHref = `cours_seance_${pad}.html`;
  const quizHref = `quiz_seance_${pad}.html`;
  const exoHref = `exercices_seance_${pad}.html`;

  const nav = `<nav class="page-nav">
  <a href="../../index.html">← Retour à l'accueil</a>
  <a href="${slidesHref}">Slides</a>
  <a href="${quizHref}">Quiz</a>
  <a href="${exoHref}">Exercices</a>
</nav>`;

  // Corps slides : séparateurs Marp `---` → rupture de section légère
  const slidesBody = body
    .split(/\n---\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .join("\n\n");

  return `# Séance ${n} — Syllabus

${nav}

Version texte (markdown) des slides : même contenu que les slides, forme scrollable pour chercher une information.

**Thème :** ${theme}

${slidesBody}

${nav}

<footer class="site-footer"><a href="mailto:shuraux@he2b.be">Sylvain Huraux - HE2B - ISIB</a></footer>
`;
}

function main() {
  const dirs = fs
    .readdirSync(SEANCES, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  let count = 0;
  for (const dir of dirs) {
    const cours = path.join(SEANCES, dir, `cours_seance_${dir}.md`);
    if (!fs.existsSync(cours)) continue;
    const src = fs.readFileSync(cours, "utf8");
    const { frontmatter, body } = stripFrontmatter(src);
    const theme = themeFromFrontmatter(frontmatter, body);
    const num = sessionNumFromPath(cours);
    const out = path.join(SEANCES, dir, `syllabus_seance_${dir}.md`);
    fs.writeFileSync(out, buildSyllabus({ num, theme, body }), "utf8");
    console.log(`wrote ${path.relative(ROOT, out)} (${theme})`);
    count += 1;
  }
  console.log(`done: ${count} syllabus page(s)`);
}

main();
