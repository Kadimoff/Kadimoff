// GitHub istatistik kartları (koyu/açık) — bağımlılık yok, GitHub Actions içinde GITHUB_TOKEN ile çalışır.
// Kullanım: GITHUB_TOKEN=… node stats.mjs <kullanıcı> <çıktı-klasörü>   |   yerel önizleme: node stats.mjs <kullanıcı> <klasör> --data veri.json
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const [user = 'Kadimoff', out = 'dist'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const dataArg = process.argv.indexOf('--data');

const THEMES = {
  dark: { bg: '#0B1220', border: '#1E2A44', title: '#2DD4BF', icon: '#38BDF8', text: '#E6EDF7', muted: '#8A9BB8', track: '#14223A', a3: '#F59E0B' },
  light: { bg: '#FFFFFF', border: '#DCE4EE', title: '#0F9F8F', icon: '#0284C7', text: '#0F1B2D', muted: '#4A5B74', track: '#EAF1F8', a3: '#D97706' },
};
const SANS = "-apple-system,'Segoe UI',Inter,Helvetica,Arial,sans-serif";
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

async function fetchData() {
  const q = `query($login: String!) {
    user(login: $login) {
      name
      followers { totalCount }
      pullRequests { totalCount }
      issues { totalCount }
      contributionsCollection { totalCommitContributions restrictedContributionsCount contributionCalendar { totalContributions } }
      repositories(ownerAffiliations: OWNER, isFork: false, first: 100) {
        totalCount
        nodes { stargazerCount languages(first: 10, orderBy: { field: SIZE, direction: DESC }) { edges { size node { name color } } } }
      }
    }
  }`;
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${process.env.GITHUB_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'profile-stats' },
    body: JSON.stringify({ query: q, variables: { login: user } }),
  });
  const json = await res.json();
  if (!json.data?.user) throw new Error(JSON.stringify(json.errors || json));
  const u = json.data.user;
  const langs = new Map();
  let stars = 0;
  for (const r of u.repositories.nodes) {
    stars += r.stargazerCount;
    for (const e of r.languages.edges) {
      const cur = langs.get(e.node.name) || { size: 0, color: e.node.color || '#8A9BB8' };
      cur.size += e.size;
      langs.set(e.node.name, cur);
    }
  }
  const c = u.contributionsCollection;
  return {
    repos: u.repositories.totalCount,
    stars,
    commits: c.totalCommitContributions + c.restrictedContributionsCount,
    contributions: c.contributionCalendar.totalContributions,
    prs: u.pullRequests.totalCount,
    followers: u.followers.totalCount,
    langs: [...langs].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.size - a.size),
  };
}

const ICON = {
  commit: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 12h6M15 12h6',
  contrib: 'M4 4h4v4H4zM10 4h4v4h-4zM16 4h4v4h-4zM4 10h4v4H4zM10 10h4v4h-4zM4 16h4v4H4z',
  repo: 'M5 4h11l3 3v13H5zM9 4v6l2-1.5L13 10V4',
  pr: 'M6 3v12M6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18 21V9a3 3 0 0 0-3-3h-4M13 3l-2 3 2 3',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  people: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M17 11a3 3 0 1 0 0-6M22 21v-1a5 5 0 0 0-4-4.9',
};

function statsCard(d, c) {
  const w = 500, h = 210;
  const rows = [
    ['contrib', 'Contributions (last year)', d.contributions],
    ['commit', 'Commits (last year)', d.commits],
    ['repo', 'Public repositories', d.repos],
    ['pr', 'Pull requests', d.prs],
    ['star', 'Stars earned', d.stars],
    ['people', 'Followers', d.followers],
  ];
  const o = [`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="GitHub stats">`,
    `<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="12" fill="${c.bg}" stroke="${c.border}"/>`,
    `<text x="24" y="38" font-family="${SANS}" font-size="18" font-weight="700" fill="${c.title}">GitHub Stats</text>`];
  rows.forEach(([ic, label, val], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 24 + col * 238, y = 72 + row * 46;
    o.push(`<g opacity="0"><animate attributeName="opacity" from="0" to="1" begin="${0.15 * i}s" dur="0.5s" fill="freeze"/>`,
      `<g transform="translate(${x} ${y - 15}) scale(0.8)" fill="none" stroke="${c.icon}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${ICON[ic]}"/></g>`,
      `<text x="${x + 28}" y="${y}" font-family="${SANS}" font-size="13" fill="${c.muted}">${esc(label)}</text>`,
      `<text x="${x + 28}" y="${y + 20}" font-family="${SANS}" font-size="18" font-weight="700" fill="${c.text}">${Number(val).toLocaleString('en-US')}</text></g>`);
  });
  o.push('</svg>');
  return o.join('\n');
}

function langsCard(d, c) {
  const w = 500, h = 210;
  const top = d.langs.slice(0, 8);
  const total = top.reduce((s, l) => s + l.size, 0) || 1;
  const o = [`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Top languages">`,
    `<defs><clipPath id="bar"><rect x="24" y="56" width="${w - 48}" height="10" rx="5"/></clipPath></defs>`,
    `<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="12" fill="${c.bg}" stroke="${c.border}"/>`,
    `<text x="24" y="38" font-family="${SANS}" font-size="18" font-weight="700" fill="${c.title}">Most Used Languages</text>`,
    `<rect x="24" y="56" width="${w - 48}" height="10" rx="5" fill="${c.track}"/>`, '<g clip-path="url(#bar)">'];
  let x = 24;
  for (const l of top) {
    const lw = ((w - 48) * l.size) / total;
    o.push(`<rect x="${x.toFixed(1)}" y="56" width="0" height="10" fill="${l.color}"><animate attributeName="width" from="0" to="${lw.toFixed(1)}" dur="0.8s" fill="freeze"/></rect>`);
    x += lw;
  }
  o.push('</g>');
  top.forEach((l, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const lx = 24 + col * 238, ly = 98 + row * 28;
    o.push(`<g opacity="0"><animate attributeName="opacity" from="0" to="1" begin="${0.3 + 0.1 * i}s" dur="0.4s" fill="freeze"/>`,
      `<circle cx="${lx + 6}" cy="${ly - 5}" r="6" fill="${l.color}"/>`,
      `<text x="${lx + 20}" y="${ly}" font-family="${SANS}" font-size="14" fill="${c.text}">${esc(l.name)}</text>`,
      `<text x="${lx + 210}" y="${ly}" text-anchor="end" font-family="${SANS}" font-size="13" fill="${c.muted}">${((100 * l.size) / total).toFixed(1)}%</text></g>`);
  });
  o.push('</svg>');
  return o.join('\n');
}

const data = dataArg > 0 ? JSON.parse(readFileSync(process.argv[dataArg + 1], 'utf8')) : await fetchData();
mkdirSync(out, { recursive: true });
for (const [name, c] of Object.entries(THEMES)) {
  writeFileSync(join(out, `stats-${name}.svg`), statsCard(data, c));
  writeFileSync(join(out, `langs-${name}.svg`), langsCard(data, c));
}
console.log(`stats ok: ${data.repos} repos, ${data.contributions} contributions, ${data.langs.length} languages`);
