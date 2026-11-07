import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildNews } from '../../scripts/build-news.mjs';

test('news renders crawlable HTML, discovery links, RSS, and sitemap without app JavaScript', () => {
  const dir = mkdtempSync(join(tmpdir(), 'looplicator-news-'));
  try {
    buildNews(dir);
    const index = readFileSync(join(dir, 'news/index.html'), 'utf8');
    const article = readFileSync(join(dir, 'news/looplicator-daw-3/index.html'), 'utf8');
    assert.match(index, /href="\/news\/looplicator-daw-3\/"/);
    assert.match(article, /<h1>Looplicator DAW 3:/);
    assert.match(article, /"@type":"BlogPosting"/);
    assert.match(article, /rel="canonical" href="https:\/\/daw.looplicator.com\/news\/looplicator-daw-3\/"/);
    assert.match(article, /href="\/v1.13.0\/"/);
    assert.match(article, /href="\/v3.1.0\/"/);
    for (const html of [index, article]) {
      assert.doesNotMatch(html, /<script[^>]+src=|type="module"|\.wasm|engine-worker/);
      assert.match(html, /<title>.+Looplicator DAW<\/title>/);
      assert.match(html, /name="description"/);
    }
    assert.match(readFileSync(join(dir, 'news/feed.xml'), 'utf8'), /<guid>https:\/\/daw.looplicator.com\/news\/looplicator-daw-3\/<\/guid>/);
    assert.match(readFileSync(join(dir, 'sitemap.xml'), 'utf8'), /<loc>https:\/\/daw.looplicator.com\/news\/looplicator-daw-3\/<\/loc>/);
    assert.match(readFileSync(join(dir, 'robots.txt'), 'utf8'), /Sitemap: https:\/\/daw.looplicator.com\/sitemap.xml/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});


test('local previews include drafts without publishing them to feeds or production pages', () => {
  const production = buildNews(null), local = buildNews(null, {includeDrafts:true});
  assert.doesNotMatch(production.get('news/index.html'), /Drafts for review/);
  const drafts = [...local.keys()].filter(path => path.startsWith('news/drafts/'));
  assert.equal(drafts.length, readdirSync(new URL('../news/drafts/',import.meta.url)).filter(file=>file.endsWith('.json')).length);
  for (const path of drafts) {
    assert.ok(!production.has(path));
    assert.match(local.get(path), /DRAFT · FOR REVIEW ONLY · NOT PUBLISHED/);
    assert.match(local.get(path), /name="robots" content="noindex,nofollow"/);
    const slug = path.split('/')[2];
    for (const files of [local, production]) for (const name of ['news/feed.xml', 'sitemap.xml']) assert.ok(!files.get(name).includes(slug));
  }
});
