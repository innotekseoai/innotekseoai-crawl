#!/bin/bash
# InnotekSEO Crawl — Startup Script
#
# Starts the GPU inference server and Next.js web app.
# Run from the project root: ./start.sh
#
# Options:
#   --model <path>   Override default model (default: qwen2.5-1.5b-instruct-q4_0.gguf)
#   --no-gpu         Skip GPU server, use CPU subprocess fallback
#   --port <port>    Next.js port (default: 3000)
#   --gpu-port <p>   GPU server port (default: 8012)

set -e

# --- Config ---
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
MODELS_DIR="$PROJECT_DIR/data/models"
DEFAULT_MODEL="$MODELS_DIR/qwen2.5-1.5b-instruct-q4_0.gguf"
LLAMA_SERVER="$HOME/repos/innotekseo/llama-cpp-opencl/build/bin/llama-server"
GPU_PORT="${GPU_PORT:-8012}"
APP_PORT="${APP_PORT:-3000}"
LOG_DIR="$PROJECT_DIR/data/logs"
NO_GPU=false

# --- Parse args ---
while [[ $# -gt 0 ]]; do
  case $1 in
    --model) DEFAULT_MODEL="$2"; shift 2 ;;
    --no-gpu) NO_GPU=true; shift ;;
    --port) APP_PORT="$2"; shift 2 ;;
    --gpu-port) GPU_PORT="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

cd "$PROJECT_DIR"
mkdir -p "$LOG_DIR"

echo "╔══════════════════════════════════════╗"
echo "║   InnotekSEO Crawl                   ║"
echo "╚══════════════════════════════════════╝"
echo ""

# --- Cleanup function ---
cleanup() {
  echo ""
  echo "Shutting down..."
  [ -n "$GPU_PID" ] && kill "$GPU_PID" 2>/dev/null && echo "  Stopped GPU server (PID $GPU_PID)"
  [ -n "$APP_PID" ] && kill "$APP_PID" 2>/dev/null && echo "  Stopped Next.js (PID $APP_PID)"
  exit 0
}
trap cleanup SIGINT SIGTERM

# --- Start GPU server ---
GPU_PID=""
if [ "$NO_GPU" = false ] && [ -f "$LLAMA_SERVER" ]; then
  MODEL_NAME=$(basename "$DEFAULT_MODEL")

  # Check if already running
  if curl -s "http://127.0.0.1:$GPU_PORT/health" 2>/dev/null | grep -q ok; then
    CURRENT=$(curl -s "http://127.0.0.1:$GPU_PORT/v1/models" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)['data'][0]['id'])" 2>/dev/null)
    if [ "$CURRENT" = "$MODEL_NAME" ]; then
      echo "✓ GPU server already running: $CURRENT"
    else
      echo "→ GPU server running $CURRENT, switching to $MODEL_NAME..."
      pkill -f llama-server 2>/dev/null || true
      sleep 2
    fi
  fi

  # Start if not running
  if ! curl -s "http://127.0.0.1:$GPU_PORT/health" 2>/dev/null | grep -q ok; then
    if [ ! -f "$DEFAULT_MODEL" ]; then
      echo "✗ Model not found: $DEFAULT_MODEL"
      echo "  Available models:"
      ls -1 "$MODELS_DIR"/*.gguf 2>/dev/null | while read f; do echo "    $(basename "$f")"; done
      echo ""
      echo "  Starting without GPU server (CPU fallback)..."
    else
      echo "→ Starting GPU server: $MODEL_NAME"
      echo "  Port: $GPU_PORT"

      LD_LIBRARY_PATH=/system/lib64:/vendor/lib64 "$LLAMA_SERVER" \
        -m "$DEFAULT_MODEL" -ngl 99 \
        --host 127.0.0.1 --port "$GPU_PORT" \
        -n 300 --temp 0.1 --ctx-size 2048 --threads 4 \
        > "$LOG_DIR/llama-server.log" 2>&1 &
      GPU_PID=$!

      echo -n "  Waiting for server"
      for i in $(seq 1 200); do
        if curl -s "http://127.0.0.1:$GPU_PORT/health" 2>/dev/null | grep -q ok; then
          echo ""
          echo "✓ GPU server ready ($((i*2))s) — $MODEL_NAME"
          break
        fi
        if ! kill -0 "$GPU_PID" 2>/dev/null; then
          echo ""
          echo "✗ GPU server failed to start. Check $LOG_DIR/llama-server.log"
          GPU_PID=""
          break
        fi
        echo -n "."
        sleep 2
      done
    fi
  fi
else
  if [ "$NO_GPU" = true ]; then
    echo "→ GPU server disabled (--no-gpu)"
  else
    echo "→ GPU server binary not found, using CPU fallback"
  fi
fi

echo ""

# --- Start Next.js ---
echo "→ Starting Next.js on port $APP_PORT"
npm run dev -- --port "$APP_PORT" > "$LOG_DIR/nextjs.log" 2>&1 &
APP_PID=$!

# Wait for app to be ready
for i in $(seq 1 30); do
  if curl -s "http://localhost:$APP_PORT" > /dev/null 2>&1; then
    echo "✓ App ready: http://localhost:$APP_PORT"
    break
  fi
  sleep 2
done

echo ""
echo "════════════════════════════════════════"
if [ -n "$GPU_PID" ]; then
  echo "  GPU Server : http://127.0.0.1:$GPU_PORT ($MODEL_NAME)"
fi
echo "  Web App    : http://localhost:$APP_PORT"
echo "  Logs       : $LOG_DIR/"
echo "════════════════════════════════════════"
echo ""
echo "Press Ctrl+C to stop all services."
echo ""

# Keep script alive
wait
