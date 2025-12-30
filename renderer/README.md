# Renderer Worker

This worker's job is to look for public posts that need to be pre-rendered, pre-render the audio samples and store them on Supabase Storage. Posts are then updated to mark them as pre-rendered.

## Features

- Polls the database for posts that need pre-rendering
- Renders bytebeat expressions to WAV audio files using shared audio engine from main app
- Uploads rendered samples to Supabase Storage
- Updates posts with the sample URL and marks them as pre-rendered
- Configurable batch size, render duration, and polling interval
- Smart re-rendering using SHA-256 signature-based invalidation

## Architecture

The renderer worker shares audio rendering code with the main application to avoid duplication:

- Audio rendering logic: `../src/utils/audio-render.ts`
- Expression types: `../src/model/expression.ts`
- WAV export wrapper: `./src/wav-export.ts` (renderer-specific, uses shared rendering)

### Smart Re-rendering

The worker uses SHA-256 signatures to detect when posts need re-rendering. A signature is calculated from:

- `expression` - the bytebeat code
- `mode` - audio mode (uint8, int8, float)
- `sample_rate` - sample rate in Hz
- `prerender_duration` - render duration in seconds

When any of these properties change, the signature changes and the post is automatically re-rendered on the next worker cycle.

### Timeout Protection

The worker includes timeout protection to prevent infinite loops in expressions from hanging the worker:

- Each render operation has a configurable timeout (default: 120 seconds)
- If an expression takes longer than the timeout, it's terminated with a `TimeoutError`
- The worker logs timeout errors and continues processing other posts
- Posts that timeout are skipped and will be retried on the next cycle

This ensures one problematic expression cannot block the entire rendering queue.

## Setup

### 1. Install Dependencies

```bash
cd renderer
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Edit `.env` with your Supabase credentials:

```env
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_KEY=your_service_role_key_here
```

**Important:** Use the **service role key**, not the anon key, as the worker needs elevated permissions to update posts and upload files.

### 3. Database Schema

The worker expects the following columns in the `posts` table:

- `pre_rendered` (boolean, nullable) - marks if a post has been pre-rendered
- `sample_url` (text, nullable) - stores the URL of the rendered audio sample
- `prerender_duration` (integer, nullable) - duration used for rendering (in seconds)
- `prerender_signature` (text, nullable) - SHA-256 signature of render configuration

A migration file is provided at `../supabase/migrations/054_renderer_columns.sql`

### 4. Storage Bucket

The `audio-samples` storage bucket is automatically created by the migration file. No manual setup required!

The migration sets up:
- Public bucket for audio samples
- Public read access for all users
- Service role write/update/delete permissions

## Usage

### Development Mode

```bash
npm run dev
```

### Production Mode

Build and run:

```bash
npm run build
npm start
```

## Configuration

Environment variables:

- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_KEY` - Supabase service role key (required for admin operations)
- `POLL_INTERVAL_MS` - Time between polling cycles (default: 30000ms / 30 seconds)
- `BATCH_SIZE` - Number of posts to process per cycle (default: 10)
- `RENDER_DURATION` - Duration of rendered audio in seconds (default: 120)
- `RENDER_TIMEOUT_MS` - Maximum time allowed for rendering before timeout (default: 12000ms / 120 seconds)
- `FADE_IN_SECONDS` - Fade-in duration (default: 0.0)
- `FADE_OUT_SECONDS` - Fade-out duration (default: 0.5)

## How It Works

1. Worker polls the database every `POLL_INTERVAL_MS` milliseconds
2. Fetches non-draft posts from the database
3. Filters posts that need rendering by checking:
   - Posts that have never been rendered (`pre_rendered` is `false` or `null`)
   - Posts where the render signature has changed (expression, mode, sample_rate, or prerender_duration modified)
4. For each post needing render (up to `BATCH_SIZE`):
   - Calculates the current render signature
   - Renders the bytebeat expression to a WAV file
   - Uploads the WAV to Supabase Storage (`audio-samples` bucket)
   - Updates the post with `pre_rendered = true`, `sample_url`, `prerender_signature`, and `prerender_duration`
5. Logs progress and errors
6. Waits for the next polling cycle

## Deployment

The worker can be deployed as:

- A long-running Node.js process (e.g., with PM2)
- A Docker container
- A systemd service
- A cloud function with scheduled triggers (requires modification for stateless execution)

### Example with PM2

```bash
npm install -g pm2
npm run build
pm2 start dist/renderer/src/index.js --name bytebeat-renderer
pm2 save
```

### Docker Deployment

Build and run with Docker:

```bash
# Build from project root (not renderer directory)
cd ..
docker build -f renderer/Dockerfile -t bytebeat-renderer .

# Run with environment variables
docker run -d \
  --name bytebeat-renderer \
  -e SUPABASE_URL=your_url \
  -e SUPABASE_SERVICE_KEY=your_key \
  bytebeat-renderer