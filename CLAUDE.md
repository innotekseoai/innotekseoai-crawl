# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Standalone web crawler with in-process local AI analysis. Crawls websites, converts to markdown, and runs GEO (Generative Engine Optimization) analysis using GGUF models loaded directly via `node-llama-cpp`. No external AI server required.

## Commands

```bash
npm run crawl -- <url> [--limit N] [--model path] [--no-analyze]   # CLI crawl
npm run dev                                                         # Next.js dev (Phase 2)
npm run build                                                       # Build
```

## Architecture

### Crawler Library (Phase 1 — current)
- **Native client** (`src/lib/crawler/native-client.ts`) — HTTP + cheerio + Readability + Turndown
- **Browser client** (`src/lib/crawler/browser-client.ts`) — Playwright (optional peer dep)
- Both respect robots.txt, discover sitemaps, produce `CrawlResult` compatible with innotekseoai

### Local AI
- `node-llama-cpp` loads GGUF models in-process — no Ollama/OpenAI dependency
- `ModelManager` singleton: `load()` → `inference()` → `unload()`
- JSON grammar enforcement via `createGrammarForJsonSchema()` + Zod validation + repair fallback

### Storage
- SQLite via `better-sqlite3` + Drizzle ORM at `data/crawl.db`
- Markdown mirrors at `data/mirrors/{crawlId}/{index}.md`
- GGUF models at `data/models/`

### Key Directories
- `src/lib/crawler/` — Native + browser crawlers, robots.txt, sitemap discovery
- `src/lib/ai/` — Model manager, GEO analyzer, prompts, JSON repair
- `src/lib/analysis/` — Grading engine (ported from innotekseoai)
- `src/lib/db/` — Drizzle schema + SQLite client
- `src/lib/storage/` — Markdown filesystem store
- `src/lib/queue/` — In-process task manager
- `src/types/` — Zod schemas for GeoPageAnalysis
- `scripts/` — CLI entry points

### Compatibility
`CrawlResult` and `GeoPageAnalysis` types match innotekseoai exactly, enabling data exchange.

## Data Directory (gitignored)
```
data/
  crawl.db          # SQLite database
  models/           # .gguf model files
  mirrors/          # {crawlId}/{index}.md
```
