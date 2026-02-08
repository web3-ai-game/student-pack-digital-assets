#!/usr/bin/env node
/**
 * 構建 RAG 友好的結構化知識庫
 * 輸出: JSON chunks + Markdown 文檔，適合向量搜索和知識檢索
 */

const fs = require('fs');
const path = require('path');

const REPO = '/root/student-pack-digital-assets';
const RAG_DIR = path.join(REPO, 'rag-knowledge');

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

function loadJSON(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch(e) { return []; } }

// Build RAG chunks from tutorials
function buildTutorialChunks(tutorials) {
  return tutorials.map((t, i) => ({
    chunk_id: `tutorial-${i}`,
    source: 'github-student-pack',
    type: 'educational_resource',
    platform: t.platform,
    resource_type: t.type,
    title: t.title,
    content: [
      `Platform: ${t.platform}`,
      `Type: ${t.type}`,
      `Title: ${t.title}`,
      t.level ? `Level: ${t.level}` : null,
      t.hours ? `Duration: ${t.hours} hours` : null,
      t.description ? `Description: ${t.description}` : null,
      t.topics?.length ? `Topics: ${t.topics.join(', ')}` : null,
      t.url ? `URL: ${t.url}` : null,
    ].filter(Boolean).join('\n'),
    metadata: {
      platform: t.platform,
      level: t.level || 'unknown',
      topics: t.topics || [],
      hours: t.hours || 0,
      url: t.url || '',
    }
  }));
}

// Build RAG chunks from images
function buildImageChunks(images) {
  return images.map((img, i) => ({
    chunk_id: `image-${i}`,
    source: 'github-student-pack',
    type: 'design_asset',
    platform: img.platform || 'unknown',
    resource_type: img.type || 'design',
    title: img.name || img.title || `Asset ${i}`,
    content: [
      `Platform: ${img.platform || 'unknown'}`,
      `Type: ${img.type || 'design'}`,
      `Name: ${img.name || img.title || ''}`,
      img.format ? `Format: ${img.format}` : null,
      img.description ? `Description: ${img.description}` : null,
      img.tags?.length ? `Tags: ${img.tags.join(', ')}` : null,
      img.url ? `URL: ${img.url}` : null,
      img.free_tier !== undefined ? `Free tier: ${img.free_tier}` : null,
      img.student_pack !== undefined ? `Student Pack: ${img.student_pack}` : null,
    ].filter(Boolean).join('\n'),
    metadata: {
      platform: img.platform || 'unknown',
      format: img.format || '',
      tags: img.tags || [],
      free_tier: img.free_tier || false,
    }
  }));
}

// Build RAG chunks from distilled reports
function buildReportChunks() {
  const distilledDir = path.join(REPO, 'distilled');
  const chunks = [];
  if (!fs.existsSync(distilledDir)) return chunks;

  const files = fs.readdirSync(distilledDir).filter(f => f.endsWith('.md'));
  for (const file of files) {
    const content = fs.readFileSync(path.join(distilledDir, file), 'utf8');
    const title = file.replace('.md', '');
    
    // Split by ## headers for granular chunks
    const sections = content.split(/^## /m);
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i].trim();
      if (!section || section.length < 50) continue;
      
      const sectionTitle = section.split('\n')[0].replace(/^#+\s*/, '');
      chunks.push({
        chunk_id: `report-${title}-${i}`,
        source: 'distilled-report',
        type: 'knowledge_summary',
        platform: title,
        resource_type: 'analysis',
        title: `${title} - ${sectionTitle}`,
        content: section.substring(0, 2000),
        metadata: {
          report: title,
          section: sectionTitle,
          section_index: i,
        }
      });
    }
  }
  return chunks;
}

// Build learning path chunks
function buildLearningPaths(tutorials) {
  const platforms = {};
  for (const t of tutorials) {
    if (!platforms[t.platform]) platforms[t.platform] = [];
    platforms[t.platform].push(t);
  }

  const paths = [];
  
  // Web Development Path
  const webCourses = tutorials.filter(t => 
    (t.topics || []).some(tp => /react|vue|javascript|typescript|css|html|node|next|web/i.test(tp)) ||
    ['Frontend Masters', 'GoRails'].includes(t.platform)
  );
  paths.push({
    chunk_id: 'path-web-dev',
    source: 'learning-path',
    type: 'learning_path',
    platform: 'Multi-platform',
    resource_type: 'roadmap',
    title: '🌐 Web 全棧開發學習路線',
    content: `Web Full-Stack Development Learning Path\n\nPlatforms: Frontend Masters (${platforms['Frontend Masters']?.length || 0} courses), GoRails (${platforms['GoRails']?.length || 0} episodes)\n\nRecommended order:\n1. HTML/CSS Fundamentals\n2. JavaScript Deep Dive\n3. TypeScript\n4. React/Vue/Svelte\n5. Node.js Backend\n6. Database & API Design\n7. Testing & DevOps\n8. System Design\n\nTotal courses available: ${webCourses.length}`,
    metadata: { path: 'web-development', course_count: webCourses.length }
  });

  // Data Science Path
  const dsCourses = tutorials.filter(t => 
    t.platform === 'DataCamp' ||
    (t.topics || []).some(tp => /python|data|ml|machine|statistics|pandas/i.test(tp))
  );
  paths.push({
    chunk_id: 'path-data-science',
    source: 'learning-path',
    type: 'learning_path',
    platform: 'Multi-platform',
    resource_type: 'roadmap',
    title: '🤖 AI/ML 數據科學學習路線',
    content: `AI/ML Data Science Learning Path\n\nPlatform: DataCamp (${platforms['DataCamp']?.length || 0} courses)\n\nRecommended order:\n1. Python Fundamentals\n2. Data Manipulation (Pandas, NumPy)\n3. Data Visualization\n4. Statistics & Probability\n5. Machine Learning\n6. Deep Learning\n7. NLP & Computer Vision\n8. MLOps & Deployment\n\nTotal courses available: ${dsCourses.length}`,
    metadata: { path: 'data-science', course_count: dsCourses.length }
  });

  // Interview Prep Path
  const interviewCourses = tutorials.filter(t =>
    t.platform === 'Interview Cake' || t.platform === 'Educative' ||
    (t.topics || []).some(tp => /interview|algorithm|system.*design|grokking/i.test(tp))
  );
  paths.push({
    chunk_id: 'path-interview',
    source: 'learning-path',
    type: 'learning_path',
    platform: 'Multi-platform',
    resource_type: 'roadmap',
    title: '💼 面試準備學習路線',
    content: `Interview Preparation Path\n\nPlatforms: Interview Cake (${platforms['Interview Cake']?.length || 0} problems), Educative (${platforms['Educative']?.length || 0} courses)\n\nRecommended order:\n1. Data Structures Review\n2. Algorithm Patterns\n3. Coding Problems (Easy → Hard)\n4. System Design Fundamentals\n5. Grokking System Design\n6. Behavioral Interview Prep\n7. Mock Interviews\n\nTotal resources: ${interviewCourses.length}`,
    metadata: { path: 'interview-prep', course_count: interviewCourses.length }
  });

  // Design Path
  const designItems = tutorials.filter(t =>
    ['Iconscout', 'Canva', 'Icons8'].includes(t.platform) ||
    (t.topics || []).some(tp => /design|ui|ux|icon|illustration/i.test(tp))
  );
  paths.push({
    chunk_id: 'path-design',
    source: 'learning-path',
    type: 'learning_path',
    platform: 'Multi-platform',
    resource_type: 'roadmap',
    title: '🎨 設計技能學習路線',
    content: `Design Skills Path\n\nPlatforms: Canva Pro, Iconscout, Icons8\n\nRecommended order:\n1. Design Fundamentals\n2. Color Theory & Typography\n3. UI/UX Basics\n4. Canva Pro Templates\n5. Icon & Illustration Usage\n6. Brand Design\n7. Prototyping\n\nDesign assets available: ${designItems.length}`,
    metadata: { path: 'design', course_count: designItems.length }
  });

  return paths;
}

// Generate platform summary chunks
function buildPlatformSummaries(tutorials, images) {
  const platforms = {};
  for (const t of tutorials) {
    if (!platforms[t.platform]) platforms[t.platform] = { tutorials: 0, topics: new Set() };
    platforms[t.platform].tutorials++;
    (t.topics || []).forEach(tp => platforms[t.platform].topics.add(tp));
  }

  return Object.entries(platforms).map(([name, data]) => ({
    chunk_id: `platform-${name.toLowerCase().replace(/\s+/g, '-')}`,
    source: 'platform-summary',
    type: 'platform_info',
    platform: name,
    resource_type: 'summary',
    title: `${name} - 平台概覽`,
    content: `Platform: ${name}\nTotal resources: ${data.tutorials}\nTopics covered: ${[...data.topics].slice(0, 20).join(', ')}\n\nThis platform is part of the GitHub Student Developer Pack, offering free or discounted access to educational content for verified students.`,
    metadata: {
      platform: name,
      resource_count: data.tutorials,
      topic_count: data.topics.size,
    }
  }));
}

function main() {
  console.log('🧠 構建 RAG 結構化知識庫');
  console.log('='.repeat(60));
  ensureDir(RAG_DIR);

  const tutorials = loadJSON(path.join(REPO, 'tutorials/catalog.json'));
  const images = loadJSON(path.join(REPO, 'images/catalog.json'));

  console.log(`  載入: ${tutorials.length} 教程, ${images.length} 圖片`);

  // Build all chunks
  const tutorialChunks = buildTutorialChunks(tutorials);
  const imageChunks = buildImageChunks(images);
  const reportChunks = buildReportChunks();
  const pathChunks = buildLearningPaths(tutorials);
  const platformChunks = buildPlatformSummaries(tutorials, images);

  const allChunks = [...tutorialChunks, ...imageChunks, ...reportChunks, ...pathChunks, ...platformChunks];

  console.log(`\n  📦 Chunks 統計:`);
  console.log(`    教程: ${tutorialChunks.length}`);
  console.log(`    圖片: ${imageChunks.length}`);
  console.log(`    蒸餾報告: ${reportChunks.length}`);
  console.log(`    學習路線: ${pathChunks.length}`);
  console.log(`    平台概覽: ${platformChunks.length}`);
  console.log(`    總計: ${allChunks.length}`);

  // Save complete RAG knowledge base
  fs.writeFileSync(path.join(RAG_DIR, 'chunks.json'), JSON.stringify(allChunks, null, 2));
  
  // Save compact version (no formatting, for production)
  fs.writeFileSync(path.join(RAG_DIR, 'chunks-compact.json'), JSON.stringify(allChunks));

  // Save content-only version (just text for embedding)
  const contentOnly = allChunks.map(c => ({
    id: c.chunk_id,
    text: c.content,
    title: c.title,
    type: c.type,
    platform: c.platform,
  }));
  fs.writeFileSync(path.join(RAG_DIR, 'content-for-embedding.json'), JSON.stringify(contentOnly, null, 2));

  // Generate Markdown index
  let md = `# RAG Knowledge Base - GitHub Student Pack\n\n`;
  md += `Generated: ${new Date().toISOString()}\n\n`;
  md += `## Statistics\n\n`;
  md += `| Type | Count |\n|------|-------|\n`;
  md += `| Tutorial chunks | ${tutorialChunks.length} |\n`;
  md += `| Image chunks | ${imageChunks.length} |\n`;
  md += `| Report chunks | ${reportChunks.length} |\n`;
  md += `| Learning paths | ${pathChunks.length} |\n`;
  md += `| Platform summaries | ${platformChunks.length} |\n`;
  md += `| **Total** | **${allChunks.length}** |\n\n`;
  
  md += `## Learning Paths\n\n`;
  for (const p of pathChunks) {
    md += `### ${p.title}\n${p.content}\n\n`;
  }

  md += `## Platform Coverage\n\n`;
  for (const p of platformChunks) {
    md += `- **${p.platform}**: ${p.metadata.resource_count} resources, ${p.metadata.topic_count} topics\n`;
  }

  fs.writeFileSync(path.join(RAG_DIR, 'INDEX.md'), md);

  // File sizes
  const files = fs.readdirSync(RAG_DIR);
  console.log(`\n  📁 輸出文件:`);
  for (const f of files) {
    const size = fs.statSync(path.join(RAG_DIR, f)).size;
    console.log(`    ${f}: ${(size / 1024).toFixed(1)} KB`);
  }

  console.log('\n✅ RAG 知識庫構建完成');
}

main();
