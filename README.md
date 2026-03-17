# InnotekSEO Crawl

Standalone web crawler with **on-device GPU-accelerated AI analysis**. Crawls websites, converts pages to markdown, and runs GEO (Generative Engine Optimization) scoring using local GGUF models on Qualcomm Adreno GPUs via OpenCL. No cloud AI required.

## Quick Start

```bash
# Start GPU server + web app
./start.sh

# Or start manually
npm run dev                    # Web UI at http://localhost:3000
npm run crawl -- https://example.com --limit 10 --model data/models/qwen2.5-1.5b-instruct-q4_0.gguf
```

## Features

- **GPU-accelerated inference** — Adreno 840 via OpenCL, 3.4x faster than CPU
- **Three-tier inference fallback** — GPU server → CPU subprocess → in-process node-llama-cpp
- **Automatic model switching** — UI model selection restarts GPU server with chosen model
- **robots.txt & sitemap** — respects crawl directives, discovers pages from XML sitemaps
- **Crash-safe pipeline** — per-page DB checkpointing, resume from last successful state
- **GEO scoring** — 10 metrics per page (entity clarity, content quality, trust signals, etc.)
- **Structured outputs** — JSON-LD schema, llms.txt directory, priority recommendations
- **Real-time progress** — SSE streaming to web UI with terminal console

## Requirements

- **Node.js** 20+
- **Termux** on Android (tested on Samsung Galaxy S25 Ultra, Snapdragon 8 Elite)
- **llama.cpp** built with OpenCL for GPU acceleration (optional — CPU fallback available)
- **GGUF model** in `data/models/` (Q4_0 quantization recommended for Adreno GPUs)

## Installation

```bash
git clone <repo>
cd innotekseo-crawl
npm install

# Create data directories
mkdir -p data/models data/mirrors data/logs
```

### Download Models

Q4_0 is the **only optimized quantization** for the Adreno OpenCL backend. Other quants (Q4_K_M, Q8_0) fall back to CPU.

```bash
# Recommended: Qwen2.5-1.5B Q4_0 (1 GB) — best quality, 100% parse rate
curl -L -o data/models/qwen2.5-1.5b-instruct-q4_0.gguf \
  "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_0.gguf"

# Fast alternative: Qwen2.5-0.5B Q4_0 (409 MB) — 80% parse rate, 2x faster
curl -L -o data/models/qwen2.5-0.5b-instruct-q4_0.gguf \
  "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_0.gguf"
```

### Build llama.cpp with OpenCL (for GPU)

See the [llama.cpp OpenCL docs](https://github.com/ggml-org/llama.cpp/blob/master/docs/backend/OPENCL.md) for build instructions. The key binary needed is `llama-server`.

## Usage

### Web UI

```bash
./start.sh              # Starts GPU server + Next.js
# Open http://localhost:3000
```

The web interface provides:
- URL input with page limit slider
- Model selection dropdown (GPU-optimized models marked with ⚡)
- Real-time crawl terminal with progress
- GEO score dashboard, grade breakdown, metric bars
- JSON-LD and llms.txt output with copy buttons

### CLI

```bash
# Crawl and analyze
npm run crawl -- https://example.com --limit 50 --model data/models/qwen2.5-1.5b-instruct-q4_0.gguf

# Crawl only (no AI analysis)
npm run crawl -- https://example.com --limit 50 --no-analyze
```

### Startup Script Options

```bash
./start.sh                                    # Default (Qwen2.5-1.5B Q4_0)
./start.sh --model data/models/other.gguf     # Override model
./start.sh --no-gpu                           # CPU-only mode
./start.sh --port 4000                        # Custom web port
./start.sh --gpu-port 9000                    # Custom GPU server port
```

## Model Benchmarks (Adreno 840 GPU, Q4_0)

| Model | Prompt (tok/s) | Generate (tok/s) | Per Page | Parse Rate | Size |
|-------|---------------|------------------|----------|------------|------|
| Qwen2.5-1.5B Q4_0 | 245 | 30 | 7.0s | **100%** | 1.0 GB |
| Qwen2.5-0.5B Q4_0 | 1,668 | 73 | 3.2s | 80% | 409 MB |
| SmolLM2-135M Q8_0 | 3,757 | 131 | 3.4s | 0% | 139 MB |

**Parse rate** = percentage of pages where the model produces parseable structured scores (vs. falling back to defaults).

## GEO Metrics

Each page is scored on 10 dimensions (1-10 scale):

| Metric | What it measures |
|--------|-----------------|
| Entity Clarity | How clearly the page identifies its subject |
| Content Quality | Overall writing and information quality |
| Semantic Structure | Heading hierarchy, markup, organization |
| Entity Richness | Named entities, relationships, context |
| Citation Readiness | Verifiable facts, dates, statistics |
| Technical SEO | Meta tags, schema, crawlability |
| User Intent Alignment | Match between content and search intent |
| Trust Signals | Authorship, credentials, transparency |
| Authority | Domain expertise, external validation |
| Fact Density | Count of verifiable claims |

Site-level aggregation produces:
- **Overall Grade** (A-F) based on entity clarity, fact density, schema completeness
- **Premium Score** (0-100) weighted average of all metrics
- **JSON-LD** schema markup for the site
- **llms.txt** machine-readable content directory

## Data Storage

```
data/
  crawl.db          # SQLite database (crawls, pages, analyses)
  models/           # GGUF model files
  mirrors/          # Crawled markdown: {crawlId}/{index}.md
  logs/             # Server and app logs
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LLAMA_SERVER_URL` | `http://127.0.0.1:8012` | GPU server URL |
| `LLAMA_SERVER_BIN_PATH` | Auto-detected | Path to llama-server binary |
| `LLAMA_BIN_PATH` | Auto-detected | Path to llama-completion binary |

## License

Private — InnotekSEO
