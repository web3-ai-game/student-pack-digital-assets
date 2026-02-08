#!/usr/bin/env node
/**
 * Notion 續寫 - 從第 SKIP 條開始繼續寫入
 */
const https = require('https');
const fs = require('fs');

const NOTION_TOKEN = process.env.NOTION_TOKEN || '';
const DB_ID = '301b81f6-ba45-8100-a737-df0f9778e8e5';
const SKIP = 190; // already written
const BATCH_DELAY = 340;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function notionPost(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname: 'api.notion.com', path, method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 30000
    }, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => { try { resolve({ s: res.statusCode, d: JSON.parse(buf) }); } catch(e) { resolve({ s: res.statusCode, d: buf }); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(data);
    req.end();
  });
}

function categorize(item) {
  const t = (item.title + ' ' + (item.topics || []).join(' ')).toLowerCase();
  if (t.match(/react|vue|svelte|angular|css|html|web|next|nuxt|frontend|fullstack|rails|hotwire/)) return 'Web Development';
  if (t.match(/python|data|ml|machine|deep|ai|nlp|statistics|pandas/)) return 'Data Science';
  if (t.match(/system design|distributed|microservice|architecture/)) return 'System Design';
  if (t.match(/interview|leetcode|algorithm|grokking/)) return 'Interview Prep';
  if (t.match(/unity|unreal|game|3d/)) return 'Game Dev';
  if (t.match(/design|icon|illustration|canva|figma|ui.*ux/)) return 'Design';
  if (t.match(/docker|kubernetes|devops|ci.*cd|deploy|cloud/)) return 'DevOps';
  if (t.match(/mobile|react.*native|flutter|swift|kotlin/)) return 'Mobile';
  return 'Web Development';
}

function buildPage(item, isImage) {
  const topics = (item.topics || item.tags || []).slice(0, 10).map(t => ({ name: String(t).substring(0, 100) }));
  const desc = (item.description || '').substring(0, 2000);
  const url = item.url || '';
  const level = item.level ? String(item.level).charAt(0).toUpperCase() + String(item.level).slice(1).toLowerCase() : '';
  const validLevels = ['Beginner', 'Intermediate', 'Advanced'];

  const props = {
    'Name': { title: [{ text: { content: (item.title || item.name || 'Untitled').substring(0, 200) } }] },
    'Platform': { select: { name: item.platform || 'Unknown' } },
    'Type': { select: { name: isImage ? 'design_asset' : (item.type || 'tutorial') } },
    'Description': { rich_text: [{ text: { content: desc } }] },
    'Has Embedding': { checkbox: true },
    'Category': { select: { name: categorize(item) } },
  };
  if (topics.length > 0) props['Topics'] = { multi_select: topics };
  if (item.hours && item.hours > 0) props['Hours'] = { number: item.hours };
  if (url && url.startsWith('http')) props['URL'] = { url: url };
  if (validLevels.includes(level)) props['Level'] = { select: { name: level } };
  return { parent: { database_id: DB_ID }, properties: props };
}

async function main() {
  const tutorials = JSON.parse(fs.readFileSync('/root/student-pack-digital-assets/tutorials/catalog.json', 'utf8'));
  const images = JSON.parse(fs.readFileSync('/root/student-pack-digital-assets/images/catalog.json', 'utf8'));
  const all = [...tutorials.map(t => ({ ...t, _img: false })), ...images.map(t => ({ ...t, _img: true }))];

  console.log(`總計 ${all.length}, 跳過前 ${SKIP}, 續寫 ${all.length - SKIP} 條`);

  let ok = 0, fail = 0;
  for (let i = SKIP; i < all.length; i++) {
    try {
      const page = buildPage(all[i], all[i]._img);
      const r = await notionPost('/v1/pages', page);
      if (r.s === 200) { ok++; }
      else if (r.s === 429) {
        console.log(`  ⏳ Rate limit @${i}, wait 5s`);
        await sleep(5000);
        const retry = await notionPost('/v1/pages', page);
        if (retry.s === 200) ok++; else fail++;
      } else {
        fail++;
        if (fail <= 3) console.log(`  ❌ [${i}] ${r.s}: ${JSON.stringify(r.d).substring(0, 120)}`);
      }
      if ((ok + fail) % 100 === 0) console.log(`  [${i+1}/${all.length}] ✅${ok} ❌${fail}`);
      await sleep(BATCH_DELAY);
    } catch(e) {
      fail++;
      if (fail <= 5) console.log(`  ❌ [${i}] ${e.message}`);
      await sleep(2000);
    }
  }
  console.log(`\n✅ 完成: ${ok} 成功, ${fail} 失敗 (共 ${ok+fail})`);
  console.log(`📊 Notion 總計: ${SKIP + ok} 條`);
}

main().catch(e => { console.error(e); process.exit(1); });
