import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const SOURCE_FILES = [
  'src/platform/v2.rs',
  'src/platform/procurement.rs',
  'src/platform/store.rs',
  'static/app/main.js',
  'static/app/auth.js',
];

const MOJIBAKE_CHARS = [
  '\\u95b8',
  '\\u95b9',
  '\\u95ba',
  '\\u95bb',
  '\\u95c1',
  '\\u95c2',
  '\\u9427',
  '\\u9365',
  '\\u93cd',
  '\\u7f02',
  '\\u9856',
  '\\u9853',
  '\\u6f67',
  '\\u68c4',
  '\\u69d2',
  '\\u5aee',
  '\\u6d29',
].join('');

const BAD_PATTERNS = [
  /\?{4,}/,
  new RegExp(`[${MOJIBAKE_CHARS}]`, 'u'),
  /\u951f/u,
  /\uFFFD/u,
  /[\uE000-\uF8FF]/u,
];

function hasBadEncoding(text) {
  return BAD_PATTERNS.some((pattern) => pattern.test(text));
}

function firstBadLine(text) {
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (hasBadEncoding(lines[index])) {
      return { lineNumber: index + 1, line: lines[index].trim() };
    }
  }
  return null;
}

async function checkSourceFiles() {
  const failures = [];
  for (const file of SOURCE_FILES) {
    const absolute = resolve(file);
    const text = await readFile(absolute, 'utf8');
    const badLine = firstBadLine(text);
    if (badLine) {
      failures.push(`${file}:${badLine.lineNumber}: ${badLine.line}`);
    }
  }
  return failures;
}

async function checkApiResponse(baseUrl, path) {
  const url = new URL(path, baseUrl);
  const response = await fetch(url);
  if (!response.ok) {
    return [`${url.href}: HTTP ${response.status}`];
  }
  const text = await response.text();
  const badLine = firstBadLine(text);
  return badLine ? [`${url.href}: ${badLine.line}`] : [];
}

async function main() {
  const baseUrlArgIndex = process.argv.indexOf('--base-url');
  const baseUrl = baseUrlArgIndex >= 0 ? process.argv[baseUrlArgIndex + 1] : null;
  const failures = await checkSourceFiles();

  if (baseUrl) {
    failures.push(...await checkApiResponse(baseUrl, '/api/import/bootstrap'));
    failures.push(...await checkApiResponse(baseUrl, '/api/import/internal-sample/templates'));
  }

  if (failures.length > 0) {
    console.error('Encoding regression check failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log('Encoding regression check passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
