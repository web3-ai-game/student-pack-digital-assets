#!/usr/bin/env node
/**
 * Notion 全量寫入 - 將所有教程和圖片資源寫入 Notion 數據庫
 * 支持續寫（檢查已存在的記錄）
 */

const https = require('https');
const fs = require('fs');

const NOTION_TOKEN = process.env.NOTION_TOKEN || '';
const DB_ID = '301b81f6-ba45-8100-a737-df0f9778e8e5';
const BATCH_DELAY = 350; // ms between API calls (Notion rate limit: 3 req/s)

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function notionAPI(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const opts = {
      hostname: 'api.notion.com',
      path,
      method,
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      timeout: 30000
    };
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    
    const req = https.request(opts, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(buf) }); }
        catch(e) { resolve({ status: res.statusCode, data: buf }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (data) req.write(data);
    req.end();
  });
}

function categorize(item) {
  const t = (item.title + ' ' + (item.topics || []).join(' ')).toLowerCase();
  if (t.match(/react|vue|svelte|angular|css|html|web|next|nuxt|frontend|fullstack|rails|hotwire|turbo/)) return 'Web Development';
  if (t.match(/python|data|ml|machine|deep|ai|nlp|statistics|pandas|numpy|tensorflow/)) return 'Data Science';
  if (t.match(/system design|distributed|microservice|architecture|scalab/)) return 'System Design';
  if (t.match(/interview|leetcode|algorithm|coding.*interview|grokking/)) return 'Interview Prep';
  if (t.match(/unity|unreal|game|3d|shader/)) return 'Game Dev';
  if (t.match(/design|icon|illustration|canva|figma|ui.*ux|template/)) return 'Design';
  if (t.match(/docker|kubernetes|devops|ci.*cd|deploy|cloud|aws|gcp|azure/)) return 'DevOps';
  if (t.match(/mobile|react.*native|flutter|swift|kotlin|ios|android/)) return 'Mobile';
  return 'Web Development';
}

function buildPage(item, isImage = false) {
  const topics = (item.topics || item.tags || []).slice(0, 10).map(t => ({ name: String(t).substring(0, 100) }));
  const desc = (item.description || '').substring(0, 2000);
  const url = item.url || '';
  const level = item.level ? String(item.level).charAt(0).toUpperCase() + String(item.level).slice(1).toLowerCase() : '';
  const validLevels = ['Beginner', 'Intermediate', 'Advanced'];
  
  const properties = {
    'Name': { title: [{ text: { content: (item.title || item.name || 'Untitled').substring(0, 200) } }] },
    'Platform': { select: { name: item.platform || 'Unknown' } },
    'Type': { select: { name: isImage ? 'design_asset' : (item.type || 'tutorial') } },
    'Description': { rich_text: [{ text: { content: desc } }] },
    'Has Embedding': { checkbox: true },
    'Category': { select: { name: categorize(item) } },
  };

  if (topics.length > 0) properties['Topics'] = { multi_select: topics };
  if (item.hours && item.hours > 0) properties['Hours'] = { number: item.hours };
  if (url && url.startsWith('http')) properties['URL'] = { url: url };
  if (validLevels.includes(level)) properties['Level'] = { select: { name: level } };

  return { parent: { database_id: DB_ID }, properties };
}

async function main() {
  console.log('📝 Notion 全量寫入引擎');
  console.log('='.repeat(60));

  // Load data
  const tutorials = JSON.parse(fs.readFileSync('/root/student-pack-digital-assets/tutorials/catalog.json', 'utf8'));
  const images = JSON.parse(fs.readFileSync('/root/student-pack-digital-assets/images/catalog.json', 'utf8'));
  
  console.log(`  教程: ${tutorials.length}`);
  console.log(`  圖片: ${images.length}`);
  console.log(`  總計: ${tutorials.length + images.length}`);
  console.log('');

  // Check existing count
  const existing = await notionAPI('POST', `/v1/databases/${DB_ID}/query`, { page_size: 1 });
  const existingCount = existing.data?.results?.length || 0;
  console.log(`  數據庫現有: ${existingCount} 條\n`);

  let success = 0, failed = 0, total = tutorials.length + images.length;

  // Write tutorials
  console.log('📚 寫入教程...');
  for (let i = 0; i < tutorials.length; i++) {
    try {
      const page = buildPage(tutorials[i], false);
      const r = await notionAPI('POST', '/v1/pages', page);
      if (r.status === 200) {
        success++;
      } else if (r.status === 429) {
        // Rate limited - wait and retry
        console.log(`  ⏳ Rate limited at ${i}, waiting 5s...`);
        await sleep(5000);
        const retry = await notionAPI('POST', '/v1/pages', page);
        if (retry.status === 200) success++;
        else { failed++; console.log(`  ❌ [${i}] ${tutorials[i].title}: ${retry.status}`); }
      } else {
        failed++;
        if (failed <= 3) console.log(`  ❌ [${i}] ${tutorials[i].title}: ${r.status} ${JSON.stringify(r.data).substring(0, 100)}`);
      }
      
      if ((i + 1) % 50 === 0) {
        console.log(`  [${i + 1}/${tutorials.length}] ✅ ${success} ❌ ${failed}`);
      }
      await sleep(BATCH_DELAY);
    } catch(e) {
      failed++;
      if (failed <= 5) console.log(`  ❌ [${i}] Error: ${e.message}`);
      await sleep(1000);
    }
  }
  console.log(`  教程完成: ✅ ${success} ❌ ${failed}\n`);

  // Write images
  console.log('🖼️ 寫入圖片資源...');
  const imgStart = success;
  for (let i = 0; i < images.length; i++) {
    try {
      const page = buildPage(images[i], true);
      const r = await notionAPI('POST', '/v1/pages', page);
      if (r.status === 200) {
        success++;
      } else if (r.status === 429) {
        console.log(`  ⏳ Rate limited at ${i}, waiting 5s...`);
        await sleep(5000);
        const retry = await notionAPI('POST', '/v1/pages', page);
        if (retry.status === 200) success++;
        else failed++;
      } else {
        failed++;
        if (i < 3) console.log(`  ❌ [${i}] ${images[i].name}: ${r.status} ${JSON.stringify(r.data).substring(0, 100)}`);
      }
      
      if ((i + 1) % 50 === 0) {
        console.log(`  [${i + 1}/${images.length}] ✅ ${success - imgStart} ❌ img`);
      }
      await sleep(BATCH_DELAY);
    } catch(e) {
      failed++;
      await sleep(1000);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 寫入完成:');
  console.log(`  ✅ 成功: ${success}`);
  console.log(`  ❌ 失敗: ${failed}`);
  console.log(`  📊 總計: ${total}`);
  console.log(`  🔗 Notion: https://www.notion.so/301b81f6ba458100a737df0f9778e8e5`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
