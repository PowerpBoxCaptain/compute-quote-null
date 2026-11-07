// Tests for check.mjs: `node test.mjs`. Exit 0 all pass, 1 a test failed.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHECK = fileURLToPath(new URL('./check.mjs', import.meta.url));
const D = mkdtempSync(join(tmpdir(), 'cqn-test-'));
writeFileSync(join(D, 'terms.md'), [
  '# Terms', '', 'Shipping is free above 50 EUR.', '',
  'Refunds are issued within 14 days', 'of receiving the returned item.', '',
  'The “premium” plan costs 12 EUR a month — billed yearly.', '',
].join('\n'));

let fails = 0;
function run(name, answer, wantExit, extra = [], wantText = null) {
  const f = join(D, `a-${name.replace(/\W+/g, '-')}.md`); writeFileSync(f, answer);
  const r = spawnSync('node', [CHECK, f, '--root', D, ...extra], { encoding: 'utf8' });
  const ok = r.status === wantExit && (!wantText || wantText.test(r.stdout));
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: exit ${r.status} (want ${wantExit})${ok ? '' : '\n' + r.stdout + r.stderr}`);
}

// QUOTE
run('quote present', 'Refunds take two weeks [Q: terms.md "Refunds are issued within 14 days"].', 0);
run('quote across a line break', 'See [Q: terms.md "within 14 days of receiving the returned item"].', 0);
run('quote with the right line', 'See [Q: terms.md:5 "Refunds are issued within 14 days"].', 0);
run('quote with a wrong line (positive control)', 'See [Q: terms.md:1 "Refunds are issued within 14 days"].', 1, [], /found at line 5, not 1/);
run('quote not in the source (positive control)', 'See [Q: terms.md "Refunds are issued within 30 days"].', 1, [], /not in terms\.md/);
run('quote: straight quotes and a hyphen match curly quotes and a dash', 'See [Q: terms.md "The "premium" plan costs 12 EUR a month - billed yearly"].', 0);
run('quote: case is kept', 'See [Q: terms.md "refunds are issued within 14 days"].', 1);
run('quote: missing source file', 'See [Q: nope.md "anything"].', 2, [], /NOT CHECKED/);
run('quote: URL without --fetch is not checked', 'See [Q: https://example.com/x "Example Domain"].', 2, [], /--fetch/);
run('quote: malformed', 'See [Q: terms.md Refunds are issued].', 1, [], /expected/);
// COMPUTE
run('compute right', 'Total [C: 3 * 14 = 42].', 0);
run('compute wrong (positive control)', 'Total [C: 3 * 14 = 41].', 1, [], /recomputed: 42/);
run('compute at the stated precision', 'Average [C: 10 / 3 = 3.33].', 0);
run('compute: precision does not hide an error', 'Average [C: 10 / 3 = 3.34].', 1);
run('compute: percent and thousands', 'Fee [C: 1,250 * 15% = 187.5] and share [C: 45 / 180 = 25%].', 0);
run('compute: brackets, power, unicode signs', 'Area [C: (2 + 3) ^ 2 × 4 ÷ 2 = 50].', 0);
run('compute: division by zero', 'Bad [C: 5 / 0 = 0].', 1, [], /division by zero/);
run('compute: code is never run', 'X [C: process.exit(0) = 0] [C: require("fs") = 1].', 1, [], /not plain arithmetic/);
run('compute: no result', 'X [C: 3 * 14].', 1);
// NULL
run('null with where it looked', 'The warranty period [N: searched terms.md, README.md].', 0);
run('null without where (positive control)', 'The warranty period [N: ].', 1, [], /where it looked/);
// UNMARKED
run('unmarked number is a lead', 'The plan costs 12 EUR [Q: terms.md "12 EUR a month"]. Most buyers pay 40 EUR.', 2, [], /UNMARKED.*40/s);
run('a number backed only on ANOTHER line is still a lead', 'Fee [C: 2 * 30 = 60].\nWe charge 30 EUR.', 2, [], /line 2\s+30/);
run('unmarked under --strict fails', 'Most buyers pay 40 EUR.', 1, ['--strict']);
run('numbers in code, headings, list numbers, link targets are not leads', '# Step 2\n\n1. Run `node v2.js --port 8080`\n2. Read [the guide](https://x.io/v3/page-9).\n', 0);
run('markdown links are not markers', 'See [Q](https://x.io) and [N](https://y.io) for more.', 0);
// together
run('a whole answer that holds', [
  'Shipping is free above 50 EUR [Q: terms.md:3 "Shipping is free above 50 EUR."].',
  'Two items at 30 EUR come to [C: 2 * 30 = 60] EUR, so shipping is free.',
  'The return window for opened items [N: searched terms.md].',
].join('\n'), 0);

if (existsSync(D)) rmSync(D, { recursive: true, force: true });
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
