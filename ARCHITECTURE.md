# Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        InnotekSEO Crawl                         │
├─────────────┬───────────────────────┬───────────────────────────┤
│   Web UI    │     CLI               │     GPU Server            │
│  Next.js    │  scripts/crawl.ts     │  llama-server :8012       │
│  :3000      │                       │  OpenCL / Adreno 840      │
├─────────────┴───────────────────────┴───────────────────────────┤
│                      Crawl Pipeline                             │
│              src/lib/queue/crawl-pipeline.ts                    │
├──────────┬──────────┬──────────┬──────────┬─────────────────────┤
│ Crawler  │    AI    │ Analysis │    DB    │   Storage           │
│ native/  │ server/  │ grading  │ SQLite   │   markdown          │
│ browser  │ sub/llama│ engine   │ Drizzle  │   mirrors           │
└──────────┴──────────┴──────────┴──────────┴─────────────────────┘
```

## Directory Structure

```
src/
├── app/                          # Next.js App Router (Phase 2 UI)
│   ├── api/
│   │   ├── crawl/                # POST create, GET detail, POST start/resume
│   │   │   └── [id]/
│   │   │       ├── route.ts      # GET crawl data + analyses
│   │   │       ├── start/        # POST trigger pipeline
│   │   │       ├── resume/       # POST retry failed pages
│   │   │       └── stream/       # GET SSE event stream
│   │   └── ai/
│   │       ├── models/           # GET available GGUF models
│   │       └── analyze/          # POST manual analysis trigger
│   ├── crawl/[id]/page.tsx       # Crawl detail + results dashboard
│   ├── settings/page.tsx         # Settings UI
│   ├── layout.tsx                # Root layout
│   └── page.tsx                  # Home page with crawl form
│
├── components/
│   ├── crawl/
│   │   ├── crawl-form.tsx        # URL input, model selection, submit
│   │   └── crawl-terminal.tsx    # Real-time console log viewer
│   ├── analysis/
│   │   ├── score-chart.tsx       # Circular score visualization
│   │   ├── grade-breakdown.tsx   # A-F grade with criteria
│   │   ├── metric-bars.tsx       # Horizontal bar chart for metrics
│   │   ├── progress-steps.tsx    # Pipeline step indicators
│   │   └── recommendations.tsx   # Priority/critical issue list
│   ├── layout/
│   │   └── header.tsx
│   └── ui/                       # Reusable UI primitives
│
├── lib/
│   ├── crawler/                  # Web crawling
│   │   ├── native-client.ts      # HTTP + cheerio + Readability + Turndown
│   │   ├── browser-client.ts     # Playwright (optional peer dep)
│   │   ├── robots.ts             # robots.txt parser
│   │   ├── sitemap.ts            # XML sitemap discovery
│   │   └── types.ts              # CrawlResult, CrawlPage types
│   │
│   ├── ai/                       # Local LLM inference
│   │   ├── server-inference.ts   # GPU server client (llama-server HTTP API)
│   │   ├── subprocess-inference.ts # CPU subprocess (llama-completion per page)
│   │   ├── model-manager.ts      # In-process node-llama-cpp (fallback)
│   │   ├── analyzer.ts           # GEO analyzer orchestration + 3-tier dispatch
│   │   ├── prompts.ts            # Score format prompts + flexible regex parser
│   │   └── json-repair.ts       # JSON validation & repair
│   │
│   ├── analysis/
│   │   └── engine.ts             # Grade calculation, aggregation (ported from innotekseoai)
│   │
│   ├── db/
│   │   ├── schema.ts             # Drizzle ORM schema (crawls, crawlPages, pageAnalyses)
│   │   └── client.ts             # SQLite connection, saveDb()
│   │
│   ├── storage/
│   │   └── markdown-store.ts     # File I/O for data/mirrors/
│   │
│   └── queue/
│       ├── crawl-pipeline.ts     # Main orchestration: crawl → analyze → grade
│       └── task-manager.ts       # Event emitter for SSE + progress tracking
│
├── types/
│   ├── analysis.ts               # Zod schemas: GeoPageAnalysis, SiteMetrics
│   └── vendor.d.ts               # Third-party type declarations
│
scripts/
│   └── crawl.ts                  # CLI entry point
│
data/                             # Runtime data (gitignored)
│   ├── crawl.db                  # SQLite database
│   ├── models/                   # GGUF model files
│   ├── mirrors/                  # {crawlId}/{index}.md
│   └── logs/                     # Server and app logs
│
start.sh                          # Startup script (GPU server + Next.js)
```

## Inference Architecture

### Three-Tier Fallback

The analyzer dispatches inference through a priority chain:

```
analyzePageForGeo()
  └─ runInference()
       ├─ Priority 1: isServerHealthy() → serverInference()     [GPU, persistent]
       ├─ Priority 2: isSubprocessAvailable() → subprocessInference()  [CPU, per-page]
       └─ Priority 3: modelManager.inference()                   [CPU, in-process]
```

### GPU Server (Priority 1)

```
┌──────────────┐     HTTP POST        ┌──────────────────────┐
│  Analyzer    │ ──────────────────── │  llama-server :8012  │
│  (Node.js)   │  /v1/chat/completions│  OpenCL / Adreno 840 │
│              │ ◄─────────────────── │  Model in GPU VRAM   │
│              │     JSON response    │  Persistent process  │
└──────────────┘                      └──────────────────────┘
```

- **Startup:** `LD_LIBRARY_PATH=/system/lib64:/vendor/lib64` unlocks vendor GPU drivers in Termux
- **Model switching:** `ensureServerModel()` compares requested vs. loaded model, restarts if different
- **Kernel compilation:** ~3-9s (OpenCL driver caches compiled kernels after first run)
- **Performance:** 245-1,668 tok/s prompt eval, 30-131 tok/s generation (model dependent)

### CPU Subprocess (Priority 2)

```
┌──────────────┐     spawn + stdin    ┌──────────────────────┐
│  Analyzer    │ ──────────────────── │  llama-completion    │
│              │                      │  ARM NEON/SVE        │
│              │ ◄─────────────────── │  Model reloaded each │
│              │     stdout + stderr  │  invocation (~2s)    │
└──────────────┘                      └──────────────────────┘
```

- **Trade-off:** No startup cost, but 2s model reload per page
- **Use case:** When GPU server is unavailable

### In-Process (Priority 3)

```
┌─────────────────────────────────┐
│  Node.js Process                │
│  ├─ node-llama-cpp binding      │
│  ├─ GGUF model loaded in memory │
│  └─ getLlama("lastBuild")       │
└─────────────────────────────────┘
```

- **Trade-off:** Slowest, but no external dependencies
- **Use case:** Fallback when no llama binaries available

## Pipeline Flow

### Web UI Path

```
1. CrawlForm → POST /api/crawl
   └─ Creates DB record (status: 'pending'), stores {analyze, modelPath} in siteMetrics

2. Client navigates to /crawl/[id]?autostart=1
   └─ Opens SSE via GET /api/crawl/[id]/stream
   └─ Sends POST /api/crawl/[id]/start

3. runPipeline() executes asynchronously:

   Phase 1: Crawl
   ├─ Parse robots.txt
   ├─ Discover sitemap URLs
   ├─ BFS from homepage (respect robots, page limit)
   ├─ For each page: fetch → Readability → Turndown → save markdown
   ├─ Insert crawlPages records (status: 'crawled')
   └─ Emit SSE events: page, log, progress

   Phase 2: Analysis
   ├─ ensureServerModel(modelPath) — start/switch GPU server
   ├─ For each page (status: 'crawled'):
   │   ├─ Truncate markdown to 1500 chars
   │   ├─ Build GEO scoring prompt (simple key:value format)
   │   ├─ Run inference (GPU → CPU → in-process fallback)
   │   ├─ Parse response (score regex → JSON → number extraction → defaults)
   │   ├─ Insert pageAnalyses record
   │   ├─ Update crawlPages status to 'analyzed'
   │   └─ saveDb() after every page (crash-safe)
   ├─ Retry failed pages once
   └─ Emit SSE events: analysis, log, progress

   Phase 3: Aggregation
   ├─ aggregateResults() computes site-level metrics
   ├─ Generate overall grade (A-F), premium score (0-100)
   ├─ Generate JSON-LD schema, llms.txt directory
   ├─ Update crawls record with final results
   └─ Emit SSE: complete
```

### CLI Path

```
scripts/crawl.ts
  ├─ Parse args (url, --limit, --model, --no-analyze)
  ├─ Insert crawl record
  ├─ crawlNative() with onPage callback → save to DB + mirrors
  ├─ ensureServerModel() or modelManager.load()
  ├─ analyzePageForGeo() per page → insert pageAnalyses
  ├─ aggregateResults() → update crawls with grades
  └─ Print summary to stdout
```

## Database Schema

```
crawls (site-level)
├── id: TEXT PK
├── baseUrl: TEXT
├── status: pending | crawling | analyzing | completed | failed
├── crawlerType: native | browser
├── pagesCrawled: INTEGER
├── pageLimit: INTEGER
├── overallGrade: A | B | C | D | F
├── premiumScore: INTEGER (0-100)
├── primaryJsonLd: TEXT (generated schema)
├── llmsTxt: TEXT (generated directory)
├── siteMetrics: TEXT (JSON blob: config pre-analysis, metrics post-analysis)
└── timestamps

crawlPages (per-URL)
├── id: TEXT PK
├── crawlId: TEXT FK → crawls
├── url, title, description, markdownPath
├── charCount: INTEGER
├── status: pending | crawled | analyzed | failed
└── timestamps

pageAnalyses (per-page scores)
├── id: TEXT PK
├── crawlId, crawlPageId: TEXT FKs
├── url: TEXT
├── 9 score fields: REAL (1-10)
├── factDensityCount, wordCount: INTEGER
├── jsonLd, llmsTxtEntry: TEXT
├── geoRecommendations: TEXT (JSON array)
└── timestamps
```

## Prompt Strategy

Designed for tiny models (135M-1.5B params):

```
System: "You are a GEO scoring assistant. Reply with scores only. No explanations."

User: "Rate this webpage on 10 metrics (1-10 scale)...
       Reply in EXACTLY this format:
       entity_clarity: <score>
       facts: <count>
       words: <count>
       ...
       PAGE CONTENT:
       {truncated to 1500 chars}"
```

**Why not JSON?** Small models produce unreliable JSON. Simple `key: value` format with flexible regex parsing achieves 80-100% parse rates vs. ~20% for JSON.

### Three-Layer Parse Fallback

```
1. parseScoreResponse() — regex: "entity_clarity: 7" → {entity_clarity_score: 7}
2. safeJsonParse()      — attempt JSON parse with markdown fence cleanup
3. Number extraction    — grab any 1-10 numbers from response, map to fields
4. Defaults             — all scores = 5, facts = 0 (always passes Zod validation)
```

No page ever fails. The worst case is default scores.

## GPU / OpenCL Details

### Termux Linker Workaround

Android's linker namespace prevents Termux processes from loading vendor libraries. The fix:

```bash
LD_LIBRARY_PATH=/system/lib64:/vendor/lib64
```

Order matters — `/system/lib64` must come first because `libcdsprpc.so` depends on `/system/lib64/libbinder.so`.

### Quantization

The OpenCL backend (written by Qualcomm) only has optimized matmul kernels for **Q4_0**. Other quantizations (Q4_K_M, Q8_0, Q6_K) fall back to CPU for matrix operations.

Use `--pure` when quantizing to ensure all layers are Q4_0:

```bash
llama-quantize --pure model-f16.gguf model-q4_0.gguf Q4_0
```

### Kernel Compilation

- 96 OpenCL kernel files compiled from source on server startup
- No binary cache in the llama.cpp OpenCL backend
- Qualcomm's OpenCL driver caches compiled programs after first run
- First startup: ~5-10 minutes; subsequent: ~3-9 seconds

## Compatibility

`CrawlResult` and `GeoPageAnalysis` types match the innotekseoai main platform exactly, enabling bidirectional data exchange between the standalone crawler and the hosted SaaS.

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React 19, Tailwind CSS 4, Framer Motion |
| Backend | Next.js API Routes, Server-Sent Events |
| Database | SQLite via better-sqlite3 + Drizzle ORM |
| Crawler | HTTP + cheerio + Readability + Turndown |
| AI Inference | llama-server (OpenCL GPU), llama-completion (CPU), node-llama-cpp |
| Model Format | GGUF (Q4_0 optimized for Adreno) |
| Runtime | Node.js 20+, Termux on Android |
| Hardware | Qualcomm Snapdragon 8 Elite, Adreno 840 GPU |
