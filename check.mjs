#!/usr/bin/env node
// compute-quote-null — check that every marked claim in an answer holds.
//
// The discipline: every factual claim in an answer is one of three things, marked inline.
//   [C: 1250 * 15% = 187.5]                         COMPUTE  arithmetic the reader can redo
//   [Q: docs/terms.md:42 "refunds within 14 days"]  QUOTE    exact words from a source the reader can open
//   [N: searched docs/, README.md, CHANGELOG.md]    NULL     not found, and where it was looked for
// Prose may connect marked claims. It may dress a fact, never father one.
//
// This script checks the markers:
//   QUOTE    the words appear in the file (whitespace, quote marks and dashes normalised; case kept). With a line
//            number, the match must start within 2 lines of it. URLs are checked only with --fetch.
//   COMPUTE  the expression is recomputed by a small arithmetic parser (no eval: numbers, + - * / × ÷ ^ ( ) and
//            a % suffix) and compared with the stated result at the precision the result is written in.
//   NULL     must say where it looked.
//   Numbers outside any marker are listed as UNMARKED leads (with --strict they fail the check).
//
// Usage: node check.mjs [answer.md] [--root <dir>] [--fetch] [--strict] [--json]     (no file: read stdin)
// Exit codes: 0 every claim holds · 1 a claim failed · 2 none failed, but something was not checked
//             (a URL without --fetch, an unreadable source, unmarked numbers) · 3 the check broke.
// License: AGPL-3.0-only.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setDefaultResultOrder } from 'node:dns';
import { setDefaultAutoSelectFamily } from 'node:net';
setDefaultResultOrder('ipv4first');
setDefaultAutoSelectFamily(false);

const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const opt = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const ROOT = resolve(opt('--root') || '.');
const FETCH = flag('--fetch'), STRICT = flag('--strict'), JSON_OUT = flag('--json');
const file = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--root');

// ---------- normalising text for quote matching ----------
const norm = (s) => s
  .replace(/[‘’‚‛′]/g, "'").replace(/[“”„‟″]/g, '"')
  .replace(/[‐-―−]/g, '-').replace(/ /g, ' ').replace(/…/g, '...')
  .replace(/\s+/g, ' ').trim();
// position map: index in the normalised text -> line number in the original
function normWithLines(text) {
  let out = '', lines = [], line = 1, space = false;
  for (const ch0 of text) {
    if (ch0 === '\n') line++;
    const ch = norm(ch0) || ' ';
    if (/\s/.test(ch0)) { if (!space && out) { out += ' '; lines.push(line); } space = true; continue; }
    space = false; for (const c of ch) { out += c; lines.push(line); }
  }
  return { text: out.trimEnd(), lines };
}
const htmlToText = (h) => h.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

// ---------- arithmetic, no eval ----------
function evaluate(src) {
  const toks = []; const re = /\s*(\d[\d,]*(?:\.\d+)?|\.\d+|[-+*/×÷^()%])/y; let m, i = 0;
  while (i < src.length) {
    if (/\s/.test(src[i])) { i++; continue; }
    re.lastIndex = i; m = re.exec(src); if (!m) throw new Error(`cannot read "${src.slice(i, i + 12)}"`);
    toks.push(m[1]); i = re.lastIndex;
  }
  let p = 0; const peek = () => toks[p], take = () => toks[p++];
  const expr = () => { let v = term(); while (peek() === '+' || peek() === '-') v = take() === '+' ? v + term() : v - term(); return v; };
  const term = () => { let v = power(); while (['*', '/', '×', '÷'].includes(peek())) { const o = take(); const r = power(); if ((o === '/' || o === '÷') && r === 0) throw new Error('division by zero'); v = o === '*' || o === '×' ? v * r : v / r; } return v; };
  const power = () => { const b = unary(); return peek() === '^' ? (take(), b ** power()) : b; };
  const unary = () => (peek() === '-' ? (take(), -unary()) : peek() === '+' ? (take(), unary()) : primary());
  const primary = () => {
    const t = take();
    if (t === '(') { const v = expr(); if (take() !== ')') throw new Error('missing )'); return pct(v); }
    if (t !== undefined && /^[\d.]/.test(t)) return pct(Number(t.replace(/,/g, '')));
    throw new Error(`unexpected "${t ?? 'end'}"`);
  };
  const pct = (v) => (peek() === '%' ? (take(), v / 100) : v);
  const v = expr(); if (p !== toks.length) throw new Error(`unexpected "${toks[p]}"`);
  if (!Number.isFinite(v)) throw new Error('not a finite number');
  return v;
}
function sameAtPrecision(value, stated) {
  const s = stated.trim().replace(/,/g, ''); const isPct = s.endsWith('%');
  const n = Number(isPct ? s.slice(0, -1) : s); if (!Number.isFinite(n)) return null;
  const v = isPct ? value * 100 : value; const dp = (s.replace('%', '').split('.')[1] || '').length;
  return Math.abs(Number(v.toFixed(dp)) - n) < 10 ** -(dp + 6) || Math.abs(v - n) <= 1e-9 * Math.max(1, Math.abs(n));
}

// ---------- reading the answer ----------
let answer;
try { answer = file ? readFileSync(file, 'utf8') : readFileSync(0, 'utf8'); }
catch (e) { console.error(`compute-quote-null: broke: cannot read the answer: ${e.message}`); process.exit(3); }
const lineOf = (idx) => answer.slice(0, idx).split('\n').length;

const MARK = /\[(Q|C|N):\s*([\s\S]*?)\](?!\()/g;           // [X: ...] but not a markdown link [text](url)
const results = []; const cache = new Map();
async function source(ref) {
  if (cache.has(ref)) return cache.get(ref);
  let r;
  try {
    if (/^https?:\/\//i.test(ref)) {
      if (!FETCH) r = { unchecked: 'a URL (run with --fetch to check it)' };
      else {
        const res = await fetch(ref, { headers: { 'User-Agent': 'compute-quote-null' }, signal: AbortSignal.timeout(20000) });
        if (!res.ok) r = { unchecked: `HTTP ${res.status}` };
        else { const t = await res.text(); r = normWithLines(/html/i.test(res.headers.get('content-type') || '') ? htmlToText(t) : t); }
      }
    } else r = normWithLines(readFileSync(resolve(ROOT, ref), 'utf8'));
  } catch (e) { r = { unchecked: e.cause?.code || e.code || e.message }; }
  cache.set(ref, r); return r;
}

for (const m of answer.matchAll(MARK)) {
  const [whole, kind, body] = m; const at = lineOf(m.index);
  if (kind === 'C') {
    const eq = body.lastIndexOf('=');
    if (eq < 0) { results.push({ at, kind: 'COMPUTE', status: 'FAIL', claim: whole, why: 'no "= result"' }); continue; }
    try {
      const v = evaluate(body.slice(0, eq)); const same = sameAtPrecision(v, body.slice(eq + 1));
      if (same === null) results.push({ at, kind: 'COMPUTE', status: 'FAIL', claim: whole, why: 'the result is not a number' });
      else results.push({ at, kind: 'COMPUTE', status: same ? 'OK' : 'FAIL', claim: whole, why: same ? '' : `recomputed: ${+v.toPrecision(12)}` });
    } catch (e) { results.push({ at, kind: 'COMPUTE', status: 'FAIL', claim: whole, why: `not plain arithmetic: ${e.message}` }); }
  } else if (kind === 'N') {
    const where = body.replace(/^\s*(searched|looked in|checked)\s*:?\s*/i, '').trim();
    results.push({ at, kind: 'NULL', status: where.length >= 3 ? 'OK' : 'FAIL', claim: whole, why: where.length >= 3 ? '' : 'does not say where it looked' });
  } else {
    const q = body.match(/^(\S+?)(?::(\d+))?\s+"([\s\S]+)"\s*$/);
    if (!q) { results.push({ at, kind: 'QUOTE', status: 'FAIL', claim: whole, why: 'expected [Q: <file or URL>[:line] "exact words"]' }); continue; }
    const [, ref, wantLine, words] = q; const src = await source(ref);
    if (src.unchecked) { results.push({ at, kind: 'QUOTE', status: 'UNCHECKED', claim: whole, why: `${ref}: ${src.unchecked}` }); continue; }
    const needle = norm(words); const hits = []; let k = -1;
    while ((k = src.text.indexOf(needle, k + 1)) >= 0) hits.push(src.lines[k]);
    if (!hits.length) results.push({ at, kind: 'QUOTE', status: 'FAIL', claim: whole, why: `these words are not in ${ref}` });
    else if (wantLine && !hits.some((l) => Math.abs(l - Number(wantLine)) <= 2)) results.push({ at, kind: 'QUOTE', status: 'FAIL', claim: whole, why: `found at line ${hits.join(', ')}, not ${wantLine}` });
    else results.push({ at, kind: 'QUOTE', status: 'OK', claim: whole, why: '' });
  }
}

// numbers the answer states outside any marker, code, link target or heading
const unmarked = [];
answer.replace(/```[\s\S]*?```/g, (s) => s.replace(/[^\n]/g, ' ')).split('\n').forEach((raw, i) => {
  if (/^\s*#/.test(raw)) return;
  const line = raw.replace(MARK, ' ').replace(/`[^`]*`/g, ' ').replace(/\]\([^)]*\)/g, ']').replace(/^\s*(\d+[.)]|[-*+])\s+/, ' ');
  // a number the line restates from one of its own markers is backed by that marker
  const key = (n) => n.replace(/[,+%]/g, '');
  const backed = new Set([...raw.matchAll(MARK)].flatMap((m) => (m[2].match(/\d[\d,]*(?:\.\d+)?/g) || []).map(key)));
  const nums = (line.match(/(?<![\w./-])[-+]?\d[\d,]*(?:\.\d+)?%?(?![\w/-])/g) || []).filter((n) => !backed.has(key(n)));
  if (nums.length) unmarked.push({ at: i + 1, numbers: nums, text: raw.trim().slice(0, 120) });
});

const failed = results.filter((r) => r.status === 'FAIL'), unchecked = results.filter((r) => r.status === 'UNCHECKED');
const code = failed.length || (STRICT && unmarked.length) ? 1 : unchecked.length || unmarked.length ? 2 : 0;

if (JSON_OUT) { process.stdout.write(JSON.stringify({ claims: results, unmarked, exit: code }, null, 2) + '\n'); process.exit(code); }
const count = (k) => results.filter((r) => r.kind === k).length;
const out = [`compute-quote-null: ${results.length} marked claim(s): ${count('COMPUTE')} compute, ${count('QUOTE')} quote, ${count('NULL')} null. ${results.length - failed.length - unchecked.length} hold, ${failed.length} failed, ${unchecked.length} not checked.`];
for (const r of failed) out.push(`FAIL  line ${r.at}  ${r.claim.slice(0, 100)}\n      ${r.why}`);
for (const r of unchecked) out.push(`NOT CHECKED  line ${r.at}  ${r.claim.slice(0, 100)}\n      ${r.why}`);
if (unmarked.length) {
  out.push(`UNMARKED: ${unmarked.length} line(s) state numbers outside any marker${STRICT ? ' (fails under --strict)' : ' (leads: mark them or say why they need none)'}:`);
  unmarked.slice(0, 20).forEach((u) => out.push(`  line ${u.at}  ${u.numbers.join(' ')}  · ${u.text}`));
}
if (!failed.length && !unchecked.length && !unmarked.length) out.push('Every marked claim holds.');
process.stdout.write(out.join('\n') + '\n');
process.exit(code);
