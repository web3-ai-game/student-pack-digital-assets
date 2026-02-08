#!/usr/bin/env node
/**
 * 深度蒸餾 + 768維向量嵌入生成
 * 
 * 1. 從爬取數據中提取圖片資源和文字教程
 * 2. 用 Grok 蒸餾為結構化 JSON
 * 3. 用 OpenAI text-embedding-3-small (dim=768) 生成向量
 * 4. 輸出到 GitHub repo 結構
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const SECRETS = JSON.parse(fs.readFileSync('/root/github-student-pack/doppler-sms-pve.json', 'utf8'));
const XAI_KEY = SECRETS.XAI_API_KEY;
const OAI_KEY = SECRETS.OPENAI_API_KEY;
const SRC = '/root/github-student-pack/digital-assets';
const REPO = '/root/student-pack-digital-assets';

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function apiCall(hostname, apiPath, headers, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname, path: apiPath, method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers, 'Content-Length': Buffer.byteLength(data) },
      timeout: 120000
    }, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch(e) { reject(new Error(buf.substring(0, 200))); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(data);
    req.end();
  });
}

async function grok(messages, maxTokens = 8000) {
  const r = await apiCall('api.x.ai', '/v1/chat/completions',
    { 'Authorization': `Bearer ${XAI_KEY}` },
    { model: 'grok-4-1-fast-non-reasoning', messages, temperature: 0.2, max_tokens: maxTokens });
  return r.choices?.[0]?.message?.content || '';
}

async function embed(texts) {
  // Batch embed, max 2048 per call
  const batches = [];
  for (let i = 0; i < texts.length; i += 100) {
    batches.push(texts.slice(i, i + 100));
  }
  const allEmbeddings = [];
  for (const batch of batches) {
    const r = await apiCall('api.openai.com', '/v1/embeddings',
      { 'Authorization': `Bearer ${OAI_KEY}` },
      { input: batch, model: 'text-embedding-3-small', dimensions: 768 });
    if (r.data) {
      allEmbeddings.push(...r.data.map(d => d.embedding));
    } else {
      console.log('  ⚠️ Embed error:', JSON.stringify(r).substring(0, 100));
      allEmbeddings.push(...batch.map(() => []));
    }
    await sleep(500);
  }
  return allEmbeddings;
}

function loadJSON(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch(e) { return []; }
}

// ============ PHASE 1: 蒸餾圖片資源 ============
async function distillImageResources() {
  console.log('\n🖼️ Phase 1: 蒸餾圖片/設計資源');
  ensureDir(path.join(REPO, 'images'));

  // Collect all image/design asset data
  const iconscoutZyte = loadJSON(path.join(SRC, 'iconscout/zyte-assets.json'));
  const iconscoutGrok = loadJSON(path.join(SRC, 'iconscout/grok-assets.json'));
  const canvaZyte = loadJSON(path.join(SRC, 'canva/zyte-resources.json'));
  const canvaGrok = loadJSON(path.join(SRC, 'canva/grok-resources.json'));
  const icons8 = loadJSON(path.join(SRC, 'icons8/assets.json'));

  console.log(`  Iconscout: ${iconscoutZyte.length} Zyte + ${iconscoutGrok.length} Grok`);
  console.log(`  Canva: ${canvaZyte.length} Zyte + ${canvaGrok.length} Grok`);
  console.log(`  Icons8: ${icons8.length}`);

  // Distill with Grok
  const imageData = await grok([
    { role: 'system', content: 'Output raw JSON array only. No markdown fences.' },
    { role: 'user', content: `Analyze these design asset sources and generate a structured catalog of image/design resources available through GitHub Student Pack.

Iconscout categories (${iconscoutGrok.length} items): ${JSON.stringify(iconscoutGrok.slice(0, 20))}
Canva resources (${canvaGrok.length} items): ${JSON.stringify(canvaGrok.slice(0, 20))}
Icons8 pages: ${JSON.stringify(icons8.slice(0, 5))}

For each resource generate: {"id","platform","category","name","type":"icon|illustration|3d|animation|photo|template|font|video","format":"svg|png|json|mp4|etc","free_tier":true/false,"student_pack":true/false,"url","description","tags":[]}
Generate at least 100 items covering all categories.` }
  ], 12000);

  let imageItems = [];
  try { imageItems = JSON.parse(imageData); } catch(e) {
    // Try to extract JSON from markdown
    const match = imageData.match(/\[[\s\S]*\]/);
    if (match) try { imageItems = JSON.parse(match[0]); } catch(e2) {}
  }
  
  fs.writeFileSync(path.join(REPO, 'images/catalog.json'), JSON.stringify(imageItems, null, 2));
  console.log(`  ✅ ${imageItems.length} image resources distilled`);

  // Also save raw Zyte links as browsable index
  const allImageLinks = [...iconscoutZyte, ...canvaZyte].filter(l => typeof l === 'string');
  fs.writeFileSync(path.join(REPO, 'images/all-links.json'), JSON.stringify(allImageLinks, null, 2));
  console.log(`  ✅ ${allImageLinks.length} raw image links saved`);

  return imageItems;
}

// ============ PHASE 2: 蒸餾文字教程 ============
async function distillTutorials() {
  console.log('\n📚 Phase 2: 蒸餾文字教程資源');
  ensureDir(path.join(REPO, 'tutorials'));

  // Load all tutorial data
  const fmCatalog = loadJSON(path.join(SRC, 'frontend-masters/grok-full-catalog.json'));
  const dcCatalog = loadJSON(path.join(SRC, 'datacamp/grok-full-catalog.json'));
  const eduCatalog = loadJSON(path.join(SRC, 'educative/grok-full-catalog.json'));
  const goRails = loadJSON(path.join(SRC, 'gorails/grok-full-catalog.json'));
  const icCatalog = loadJSON(path.join(SRC, 'interview-cake/grok-full-catalog.json'));
  const ghSkills = loadJSON(path.join(SRC, 'github-learning/skills.json'));
  const jbTutorials = loadJSON(path.join(SRC, 'jetbrains/zyte-tutorials.json'));
  const unityTuts = loadJSON(path.join(SRC, 'unity-learn/zyte-tutorials.json'));

  const platforms = [
    { name: 'Frontend Masters', data: fmCatalog, type: 'video_course' },
    { name: 'DataCamp', data: dcCatalog, type: 'interactive_course' },
    { name: 'Educative', data: eduCatalog, type: 'text_course' },
    { name: 'GoRails', data: goRails, type: 'video_tutorial' },
    { name: 'Interview Cake', data: icCatalog, type: 'practice_problem' },
    { name: 'GitHub Skills', data: ghSkills, type: 'hands_on_lab' },
    { name: 'JetBrains', data: jbTutorials, type: 'tutorial' },
    { name: 'Unity Learn', data: unityTuts, type: 'tutorial' },
  ];

  const allTutorials = [];
  for (const p of platforms) {
    console.log(`  ${p.name}: ${p.data.length} items`);
    const items = p.data.map((item, idx) => {
      const title = item.title || item.name || (typeof item === 'string' ? item.split('/').pop() : `${p.name}-${idx}`);
      const desc = item.description || item.textSnippet || '';
      const topics = item.topics || item.tags || [];
      return {
        id: `${p.name.toLowerCase().replace(/\s+/g, '-')}-${idx}`,
        platform: p.name,
        type: p.type,
        title,
        description: desc.substring(0, 300),
        topics: Array.isArray(topics) ? topics : [],
        level: item.level || '',
        hours: item.hours || item.duration_hours || item.duration_min ? (item.duration_min || 0) / 60 : 0,
        url: item.url || item.slug ? `https://${p.name.toLowerCase().replace(/\s+/g, '')}.com/${item.slug || ''}` : (typeof item === 'string' ? item : ''),
      };
    });
    allTutorials.push(...items);
  }

  fs.writeFileSync(path.join(REPO, 'tutorials/catalog.json'), JSON.stringify(allTutorials, null, 2));
  console.log(`  ✅ ${allTutorials.length} tutorials cataloged`);

  // Generate per-platform files
  for (const p of platforms) {
    const items = allTutorials.filter(t => t.platform === p.name);
    const fname = p.name.toLowerCase().replace(/\s+/g, '-');
    fs.writeFileSync(path.join(REPO, `tutorials/${fname}.json`), JSON.stringify(items, null, 2));
  }
  console.log(`  ✅ ${platforms.length} platform files generated`);

  return allTutorials;
}

// ============ PHASE 3: 768維向量嵌入 ============
async function generateEmbeddings(tutorials, imageItems) {
  console.log('\n🧮 Phase 3: 生成 768 維向量嵌入');
  ensureDir(path.join(REPO, 'embeddings'));

  // Prepare texts for embedding
  const tutorialTexts = tutorials.map(t =>
    `${t.platform} | ${t.type} | ${t.title} | ${t.description} | ${t.topics.join(', ')} | ${t.level}`
  );
  const imageTexts = imageItems.map(t =>
    `${t.platform || ''} | ${t.type || ''} | ${t.name || ''} | ${t.description || ''} | ${(t.tags || []).join(', ')}`
  );

  // Embed tutorials in batches
  console.log(`  Embedding ${tutorialTexts.length} tutorials...`);
  const tutEmbeddings = await embed(tutorialTexts);
  console.log(`  ✅ ${tutEmbeddings.filter(e => e.length > 0).length} tutorial embeddings generated`);

  // Save tutorial embeddings
  const tutorialWithEmbed = tutorials.map((t, i) => ({
    ...t,
    embedding: tutEmbeddings[i] || []
  }));
  fs.writeFileSync(path.join(REPO, 'embeddings/tutorials-768.json'), JSON.stringify(tutorialWithEmbed, null, 2));

  // Also save compact binary format (just vectors + ids)
  const tutVectors = { 
    model: 'text-embedding-3-small',
    dimensions: 768,
    count: tutorialWithEmbed.length,
    ids: tutorialWithEmbed.map(t => t.id),
    vectors: tutorialWithEmbed.map(t => t.embedding)
  };
  fs.writeFileSync(path.join(REPO, 'embeddings/tutorial-vectors.json'), JSON.stringify(tutVectors));

  // Embed images
  if (imageTexts.length > 0) {
    console.log(`  Embedding ${imageTexts.length} image resources...`);
    const imgEmbeddings = await embed(imageTexts);
    console.log(`  ✅ ${imgEmbeddings.filter(e => e.length > 0).length} image embeddings generated`);

    const imageWithEmbed = imageItems.map((t, i) => ({
      ...t,
      embedding: imgEmbeddings[i] || []
    }));
    fs.writeFileSync(path.join(REPO, 'embeddings/images-768.json'), JSON.stringify(imageWithEmbed, null, 2));

    const imgVectors = {
      model: 'text-embedding-3-small',
      dimensions: 768,
      count: imageWithEmbed.length,
      ids: imageWithEmbed.map(t => t.id),
      vectors: imageWithEmbed.map(t => t.embedding)
    };
    fs.writeFileSync(path.join(REPO, 'embeddings/image-vectors.json'), JSON.stringify(imgVectors));
  }

  return { tutorials: tutEmbeddings.length, images: imageTexts.length };
}

// ============ PHASE 4: 複製蒸餾報告 ============
async function copyDistilledReports() {
  console.log('\n📋 Phase 4: 複製蒸餾報告到 repo');
  const distilledSrc = path.join(SRC, 'distilled');
  const distilledDst = path.join(REPO, 'distilled');
  ensureDir(distilledDst);

  if (fs.existsSync(distilledSrc)) {
    const files = fs.readdirSync(distilledSrc);
    for (const f of files) {
      fs.copyFileSync(path.join(distilledSrc, f), path.join(distilledDst, f));
    }
    console.log(`  ✅ ${files.length} distilled reports copied`);
  }

  // Copy learning roadmap
  const roadmap = path.join(SRC, 'LEARNING_ROADMAP.md');
  if (fs.existsSync(roadmap)) {
    fs.copyFileSync(roadmap, path.join(REPO, 'LEARNING_ROADMAP.md'));
    console.log('  ✅ Learning roadmap copied');
  }
}

// ============ PHASE 5: 複製原始數據 ============
async function copyRawData() {
  console.log('\n📦 Phase 5: 複製原始爬取數據');
  const rawDst = path.join(REPO, 'raw-data');
  ensureDir(rawDst);

  const platforms = ['frontend-masters', 'datacamp', 'educative', 'gorails', 'interview-cake',
    'github-learning', 'jetbrains', 'unity-learn', 'unreal-engine', 'icons8', 'iconscout', 'canva'];

  let totalFiles = 0;
  for (const p of platforms) {
    const srcDir = path.join(SRC, p);
    const dstDir = path.join(rawDst, p);
    ensureDir(dstDir);
    if (fs.existsSync(srcDir)) {
      const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.json'));
      for (const f of files) {
        fs.copyFileSync(path.join(srcDir, f), path.join(dstDir, f));
        totalFiles++;
      }
    }
  }
  console.log(`  ✅ ${totalFiles} JSON files copied to raw-data/`);
}

// ============ MAIN ============
async function main() {
  console.log('🔬 GitHub Student Pack - 深度蒸餾 + 768維向量嵌入');
  console.log('='.repeat(60));

  const imageItems = await distillImageResources();
  await sleep(2000);
  const tutorials = await distillTutorials();
  await sleep(2000);
  const embedStats = await generateEmbeddings(tutorials, imageItems);
  await copyDistilledReports();
  await copyRawData();

  // Generate repo README
  const readme = `# GitHub Student Pack - 數字資產知識庫

> 自動爬取、AI蒸餾、768維向量嵌入的教育資源庫

## 📊 統計

| 類別 | 數量 |
|------|------|
| 教程資源 | ${tutorials.length} |
| 圖片/設計資源 | ${imageItems.length} |
| 768維向量嵌入 | ${embedStats.tutorials + embedStats.images} |
| 蒸餾報告 | 7 份 |
| 覆蓋平台 | 12 個 |

## 📁 目錄結構

\`\`\`
├── tutorials/          # 結構化教程目錄 (JSON)
│   ├── catalog.json    # 全量教程索引
│   ├── frontend-masters.json
│   ├── datacamp.json
│   ├── educative.json
│   ├── gorails.json
│   ├── interview-cake.json
│   └── ...
├── images/             # 圖片/設計資產目錄
│   ├── catalog.json    # 結構化圖片資源
│   └── all-links.json  # 原始連結
├── embeddings/         # 768維向量嵌入
│   ├── tutorials-768.json    # 教程+向量
│   ├── tutorial-vectors.json # 純向量 (compact)
│   ├── images-768.json       # 圖片+向量
│   └── image-vectors.json    # 純向量 (compact)
├── distilled/          # AI蒸餾分析報告
│   ├── frontend-masters-蒸餾報告.md
│   ├── datacamp-蒸餾報告.md
│   ├── educative-蒸餾報告.md
│   ├── gorails-蒸餾報告.md
│   ├── interview-cake-蒸餾報告.md
│   ├── design-assets-蒸餾報告.md
│   └── 綜合學習計劃-6個月.md
├── raw-data/           # 原始爬取數據
├── scripts/            # 爬取和蒸餾腳本
└── LEARNING_ROADMAP.md # 學習路線圖
\`\`\`

## 🛠️ 技術棧

- **爬取**: Zyte API (JS渲染) + HTTP + Grok AI
- **蒸餾**: Grok-4-1-fast (xAI)
- **向量**: OpenAI text-embedding-3-small (768維)
- **存儲**: GitHub + Google Drive

## 🔍 向量搜索用法

\`\`\`javascript
// 載入向量
const data = require('./embeddings/tutorial-vectors.json');
// data.vectors[i] = 768維 float array
// data.ids[i] = 對應的教程 ID
// 用餘弦相似度搜索最相關的教程
\`\`\`

## 📅 生成時間
${new Date().toISOString()}
`;

  fs.writeFileSync(path.join(REPO, 'README.md'), readme);

  // Summary
  const totalFiles = countFiles(REPO);
  const totalSize = getDirSize(REPO);
  console.log('\n' + '='.repeat(60));
  console.log('📊 完成:');
  console.log(`  教程: ${tutorials.length}`);
  console.log(`  圖片資源: ${imageItems.length}`);
  console.log(`  向量嵌入: ${embedStats.tutorials + embedStats.images}`);
  console.log(`  總文件: ${totalFiles}`);
  console.log(`  總大小: ${(totalSize / 1024 / 1024).toFixed(1)} MB`);
}

function countFiles(dir) {
  let count = 0;
  for (const f of fs.readdirSync(dir)) {
    const fp = path.join(dir, f);
    if (fs.statSync(fp).isDirectory()) count += countFiles(fp);
    else count++;
  }
  return count;
}

function getDirSize(dir) {
  let size = 0;
  for (const f of fs.readdirSync(dir)) {
    const fp = path.join(dir, f);
    const stat = fs.statSync(fp);
    if (stat.isDirectory()) size += getDirSize(fp);
    else size += stat.size;
  }
  return size;
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
