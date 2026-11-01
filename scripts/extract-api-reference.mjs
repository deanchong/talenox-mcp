import { writeFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const response = await fetch('https://talenox.github.io/api-doc/');
if (!response.ok) throw new Error('Unable to download API documentation');
const html = await response.text();
const clean = value => value.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
const sections = [...html.matchAll(/<h([12]) id="([^"]+)">([\s\S]*?)<\/h\1>/g)];
let group = '';
const operations = [];
for (let i = 0; i < sections.length; i++) {
  const match = sections[i];
  if (match[1] === '1') { group = clean(match[3]); continue; }
  const section = html.slice(match.index + match[0].length, sections[i + 1]?.index ?? html.length);
  const endpoint = section.match(/<p><code>(POST|PUT|PATCH|DELETE) https:\/\/api\.talenox\.com\/api\/v2\/([^<]+)<\/code>/);
  if (!endpoint) continue;
  const params = section.match(/<h4 id="parameters[^>]*>Parameters<\/h4>([\s\S]*?)<h3 id="response/ )?.[1] ?? '';
  const code = params.match(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/)?.[1];
  let example;
  if (code) { try { example = JSON.parse(clean(code)); } catch { example = clean(code); } }
  const fields = [...params.matchAll(/<tr>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/g)].map(m => ({ name: clean(m[1]).replace(/\s+/g, ' '), description: clean(m[2]) }));
  operations.push({ group, title: clean(match[3]), anchor: match[2], method: endpoint[1], path: clean(endpoint[2]), fields, ...(example === undefined ? {} : { example }) });
}
writeFileSync(new URL('docs/api-write-reference.json', root), JSON.stringify({ source: 'https://talenox.github.io/api-doc/', operations }, null, 2) + '\n');
console.log("Wrote API request reference to docs/api-write-reference.json");
