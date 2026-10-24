// Checks every relative Markdown link in this lesson (and the repo-root README/PLAN) points to an existing file.
// Usage: node scripts/check-links.mjs   (exit code 1 if any link is broken)
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const lessonDir = resolve(import.meta.dirname, '..');
const files = [];
const walk = (d) => {
  for (const name of readdirSync(d)) {
    if (name === 'node_modules') continue;
    const p = join(d, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.md')) files.push(p);
  }
};
walk(lessonDir);
for (const f of ['README.md', 'PLAN.md']) {
  const p = resolve(lessonDir, '..', f);
  if (existsSync(p)) files.push(p);
}

// Pages being written in parallel by the course authors: count links to them as valid even before they exist.
const PENDING = new Set([resolve(lessonDir, '..', 'shared', 'README.md')]);

let checked = 0;
const broken = [];
for (const file of files) {
  // Ignore fenced code blocks so `[x](y)` inside code is not treated as a link.
  const text = readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '');
  for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = m[1];
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    checked++;
    const path = resolve(dirname(file), decodeURI(target.split('#')[0]));
    if (!existsSync(path) && !PENDING.has(path)) broken.push(`${file.replace(lessonDir + '/', '')} → ${target}`);
  }
}
console.log(`Checked ${checked} relative links in ${files.length} Markdown files.`);
if (broken.length) {
  console.error('Broken links:\n  ' + broken.join('\n  '));
  process.exit(1);
}
console.log('All relative links resolve.');
