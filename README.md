# GitHub Student Pack - 數字資產知識庫

> 自動爬取、AI蒸餾、768維向量嵌入的教育資源庫

## 📊 統計

| 類別 | 數量 |
|------|------|
| 教程資源 | 837 |
| 圖片/設計資源 | 105 |
| 768維向量嵌入 | 942 |
| 蒸餾報告 | 7 份 |
| 覆蓋平台 | 12 個 |

## 📁 目錄結構

```
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
```

## 🛠️ 技術棧

- **爬取**: Zyte API (JS渲染) + HTTP + Grok AI
- **蒸餾**: Grok-4-1-fast (xAI)
- **向量**: OpenAI text-embedding-3-small (768維)
- **存儲**: GitHub + Google Drive

## 🔍 向量搜索用法

```javascript
// 載入向量
const data = require('./embeddings/tutorial-vectors.json');
// data.vectors[i] = 768維 float array
// data.ids[i] = 對應的教程 ID
// 用餘弦相似度搜索最相關的教程
```

## 📅 生成時間
2026-02-08T22:44:54.028Z
