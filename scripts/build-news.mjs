import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'https://daw.looplicator.com';
const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function buildNews(output, { includeDrafts = false } = {}) {
  const newsRoot = resolve(root, 'web/news');
  const load = (directory, draft = false) => readdirSync(directory).filter(file => file.endsWith('.json')).map(file => ({ ...JSON.parse(readFileSync(resolve(directory, file), 'utf8')), draft }));
  const published = load(newsRoot);
  const posts = [...published, ...(includeDrafts && existsSync(resolve(newsRoot, 'drafts')) ? load(resolve(newsRoot, 'drafts'), true) : [])].sort((a,b) => b.date.localeCompare(a.date) || b.version.localeCompare(a.version, undefined, {numeric:true}));
  const postPath = post => `/news/${post.draft ? 'drafts/' : ''}${post.slug}/`;
  const slugs = new Set();
  for (const post of posts) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug) || slugs.has(post.slug) || !/^\d{4}-\d{2}-\d{2}$/.test(post.date) || !post.title || !post.summary || !post.body || !/^\d+\.\d+\.\d+$/.test(post.version)) throw new Error(`Invalid or duplicate news post: ${post.slug}`);
    slugs.add(post.slug);
  }
  const files = new Map();
  const write = (path, content) => { files.set(path, content); if (output) { const file=resolve(output,path); mkdirSync(dirname(file),{recursive:true}); writeFileSync(file,content); } };
  function page({title, description, path, body, post}) {
    const url = origin + path;
    const data = post && !post.draft ? `<script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@type':'BlogPosting',headline:post.title,description:post.summary,datePublished:post.date,author:{'@type':'Organization',name:'Looplicator'},publisher:{'@type':'Organization',name:'Looplicator'},mainEntityOfPage:url}).replace(/</g,'\\u003c')}</script>` : '';
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#15191f"><title>${escape(title)} | Looplicator DAW</title><meta name="description" content="${escape(description)}">${post?.draft ? '<meta name="robots" content="noindex,nofollow">' : `<link rel="canonical" href="${url}">`}<meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${url}"><meta property="og:type" content="${post?'article':'website'}"><link rel="icon" href="/looplicator.png"><link rel="stylesheet" href="/news/style.css"><link rel="alternate" type="application/rss+xml" title="Looplicator DAW news" href="/news/feed.xml">${data}</head><body><header><a class="brand" href="/">Looplicator <span>DAW</span></a><nav aria-label="Main"><a href="/news/">News</a><a class="button" href="/">Open the DAW ↗</a></nav></header><main>${body}</main><footer><span>Feed the loop. Fuel the machine.</span><a href="/news/feed.xml">RSS feed</a></footer></body></html>`;
  }
  const cards = entries => entries.map(post=>`<article class="card"><p class="meta">${post.draft ? 'DRAFT · ' : ''}<time datetime="${post.date}">${post.date}</time> · v${escape(post.version)}</p><h2><a href="${postPath(post)}">${escape(post.title)}</a></h2><p>${escape(post.summary)}</p><a class="read" href="${postPath(post)}">${post.draft ? 'Review draft' : 'Read the release note'} →</a></article>`).join('');
  const drafts = posts.filter(post=>post.draft);
  write('news/index.html', page({title:'News & release notes',description:'New mixers, features, and improvements in Looplicator DAW. Follow the move from the legacy loop engine to an evolving browser-based loop machine.',path:'/news/',body:`<p class="eyebrow">THE MACHINE KEEPS MOVING</p><h1>News & release notes</h1><p class="intro">New mixers. New possibilities. A record of what’s changing inside Looplicator.</p><div class="posts">${cards(posts.filter(post=>!post.draft))}</div>${drafts.length ? `<h2>Drafts for review</h2><p>Local previews only. These posts have not been published.</p><div class="posts">${cards(drafts)}</div>` : ''}`}));
  for(const post of posts) write(`${postPath(post).slice(1)}index.html`,page({title:post.title,description:post.summary,path:postPath(post),post,body:`<a class="back" href="/news/">← All news</a><article>${post.draft ? '<p class="eyebrow">DRAFT · FOR REVIEW ONLY · NOT PUBLISHED</p>' : ''}<p class="meta"><time datetime="${post.date}">${post.date}</time> · v${escape(post.version)}</p><h1>${escape(post.title)}</h1><p class="intro">${escape(post.summary)}</p><div class="prose">${post.body}</div><a class="button" href="/">Make your next loop ↗</a></article>`}));
  write('news/style.css',readFileSync(resolve(root,'web/news/style.css'),'utf8'));
  write('news/feed.xml',`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Looplicator DAW news</title><link>${origin}/news/</link><description>New mixers, features, and release notes.</description><language>en</language>${posts.filter(post=>!post.draft).map(post=>`<item><title>${escape(post.title)}</title><link>${origin}/news/${post.slug}/</link><guid>${origin}/news/${post.slug}/</guid><pubDate>${new Date(post.date+'T12:00:00Z').toUTCString()}</pubDate><description>${escape(post.summary)}</description></item>`).join('')}</channel></rss>`);
  const urls = ['/', '/news/', ...posts.filter(post=>!post.draft).map(post=>postPath(post))];
  write('sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(path=>`<url><loc>${origin}${path}</loc></url>`).join('')}</urlset>`);
  write('robots.txt',`User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`);
  return files;
}
