# Renderer Worker

This worker's job is to look for public posts that need to be pre-rendered, pre-render the audio samples and store them on Supabase Storage. Posts are then updated to mark them as pre-rendered.

## Features

- Polls the database for posts that need pre-rendering
- Renders bytebeat expressions to WAV audio files using shared audio engine from main app
- Uploads rendered samples to Supabase Storage
- Updates posts with the sample URL and marks them as pre-rendered
- Configurable batch size, render duration, and polling interval

## Architecture

The renderer worker shares audio rendering code with the main application to avoid duplication:

- Audio rendering logic: `../src/utils/audio-render.ts`
- Expression types: `../src/model/expression.ts`
- WAV export wrapper: `./src/wav-export.ts` (renderer-specific, uses shared rendering)

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

Add these columns with a migration if they don't exist:

```sql
ALTER TABLE posts ADD COLUMN IF NOT EXISTS pre_rendered BOOLEAN DEFAULT FALSE;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS sample_url TEXT;
```

### 4. Storage Bucket

Create a storage bucket named `audio-samples` in Supabase:

1. Go to Storage in Supabase Dashboard
2. Create a new bucket named `audio-samples`
3. Set it to **public** (or configure appropriate policies)

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
- `POLL_INTERVAL_MS` - Time between polling cycles (default: 60000ms / 1 minute)
- `BATCH_SIZE` - Number of posts to process per cycle (default: 5)
- `RENDER_DURATION` - Duration of rendered audio in seconds (default: 30)
- `FADE_IN_SECONDS` - Fade-in duration (default: 0.1)
- `FADE_OUT_SECONDS` - Fade-out duration (default: 0.5)

## How It Works

1. Worker polls the database every `POLL_INTERVAL_MS` milliseconds
2. Fetches up to `BATCH_SIZE` posts where `pre_rendered` is `false` or `null`
3. For each post:
   - Renders the bytebeat expression to a WAV file
   - Uploads the WAV to Supabase Storage (`audio-samples` bucket)
   - Updates the post with `pre_rendered = true` and `sample_url`
4. Logs progress and errors
5. Waits for the next polling cycle

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