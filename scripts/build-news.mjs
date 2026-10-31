import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'https://daw.looplicator.com';
const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function buildNews(output) {
  const posts = readdirSync(resolve(root, 'web/news')).filter(file => file.endsWith('.json')).map(file => JSON.parse(readFileSync(resolve(root, 'web/news', file), 'utf8'))).sort((a,b) => b.date.localeCompare(a.date) || b.version.localeCompare(a.version, undefined, {numeric:true}));
  const slugs = new Set();
  for (const post of posts) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug) || slugs.has(post.slug) || !/^\d{4}-\d{2}-\d{2}$/.test(post.date) || !post.title || !post.summary || !post.body || !/^\d+\.\d+\.\d+$/.test(post.version)) throw new Error(`Invalid or duplicate news post: ${post.slug}`);
    slugs.add(post.slug);
  }
  const write = (path, content) => { const file=resolve(output,path); mkdirSync(dirname(file),{recursive:true}); writeFileSync(file,content); };
  function page({title, description, path, body, post}) {
    const url = origin + path;
    const data = post ? `<script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@type':'BlogPosting',headline:post.title,description:post.summary,datePublished:post.date,author:{'@type':'Organization',name:'Looplicator'},publisher:{'@type':'Organization',name:'Looplicator'},mainEntityOfPage:url}).replace(/</g,'\\u003c')}</script>` : '';
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#15191f"><title>${escape(title)} | Looplicator DAW</title><meta name="description" content="${escape(description)}"><link rel="canonical" href="${url}"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${url}"><meta property="og:type" content="${post?'article':'website'}"><link rel="icon" href="/looplicator.png"><link rel="stylesheet" href="/news/style.css"><link rel="alternate" type="application/rss+xml" title="Looplicator DAW news" href="/news/feed.xml">${data}</head><body><header><a class="brand" href="/">Looplicator <span>DAW</span></a><nav aria-label="Main"><a href="/news/">News</a><a class="button" href="/">Open the DAW ↗</a></nav></header><main>${body}</main><footer><span>Feed the loop. Fuel the machine.</span><a href="/news/feed.xml">RSS feed</a></footer></body></html>`;
  }
  write('news/index.html', page({title:'News & release notes',description:'New mixers, features, and improvements in Looplicator DAW. Follow the move from the legacy loop engine to an evolving browser-based loop machine.',path:'/news/',body:`<p class="eyebrow">THE MACHINE KEEPS MOVING</p><h1>News & release notes</h1><p class="intro">New mixers. New possibilities. A record of what’s changing inside Looplicator.</p><div class="posts">${posts.map(post=>`<article class="card"><p class="meta"><time datetime="${post.date}">${post.date}</time> · v${escape(post.version)}</p><h2><a href="/news/${post.slug}/">${escape(post.title)}</a></h2><p>${escape(post.summary)}</p><a class="read" href="/news/${post.slug}/">Read the release note →</a></article>`).join('')}</div>`}));
  for(const post of posts) write(`news/${post.slug}/index.html`,page({title:post.title,description:post.summary,path:`/news/${post.slug}/`,post,body:`<a class="back" href="/news/">← All news</a><article><p class="meta"><time datetime="${post.date}">${post.date}</time> · v${escape(post.version)}</p><h1>${escape(post.title)}</h1><p class="intro">${escape(post.summary)}</p><div class="prose">${post.body}</div><a class="button" href="/">Make your next loop ↗</a></article>`}));
  write('news/style.css',readFileSync(resolve(root,'web/news/style.css'),'utf8'));
  write('news/feed.xml',`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Looplicator DAW news</title><link>${origin}/news/</link><description>New mixers, features, and release notes.</description><language>en</language>${posts.map(post=>`<item><title>${escape(post.title)}</title><link>${origin}/news/${post.slug}/</link><guid>${origin}/news/${post.slug}/</guid><pubDate>${new Date(post.date+'T12:00:00Z').toUTCString()}</pubDate><description>${escape(post.summary)}</description></item>`).join('')}</channel></rss>`);
  const urls = ['/', '/news/', ...posts.map(post=>`/news/${post.slug}/`)];
  write('sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(path=>`<url><loc>${origin}${path}</loc></url>`).join('')}</urlset>`);
  write('robots.txt',`User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`);
}
