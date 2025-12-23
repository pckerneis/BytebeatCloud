# BytebeatCloud

[BytebeatCloud](https://bytebeat.cloud/) is a modern, social, and mobile-friendly environment for experimenting with bytebeat and floatbeat audio.

It aims to go beyond traditional “paste code and play” tools by offering publishing features, user profiles, and an evolving community-driven experience.

## Why another Bytebeat app?

BytebeatCloud brings a social layer on top of bytebeat.
You can still generate a simple share link, but you can also:

- publish posts,
- browse popular or recent compositions,
- favorite works,
- fork other users’ expressions,
- and build a profile with your own creations.

This makes it closer to a creative platform than a standalone tool.

## Differences with other implementations

The audio engine and expression interpreter uses Javascript. this makes this app closer to web based implementations than the original C-based ones.

There are a few differences with other web implementations:

- Length is limited to 4096 characters.
- Only a subset of JS is allowed. You cannot use `if`, `var`, `let`, `const`... ternary operations and implicit declarations with assignment are fine though.

## Features

### Audio Engine

- **Three audio modes**: uint8 (classic bytebeat), int8 (signed), and float (-1 to 1)
- **Configurable sample rate**: 8kHz to 48kHz
- **Real-time expression editing**: hear changes as you type
- **Master gain control**: adjust output volume

### Creation & Sharing

- **Create posts**: publish your bytebeat expressions with title, description, and tags
- **Draft mode**: save work-in-progress without publishing
- **Fork posts**: remix other users' expressions with attribution
- **Share links**: generate shareable URLs for any expression
- **WAV export**: export your bytebeat as a WAV file
- **Video export**: export your bytebeat as a video with waveform visualization

### Discovery

- **Explore feed**: browse recent, trending, and weekly challenge posts
- **Personalized feed**: see posts from users you follow
- **Tags**: categorize and filter posts by tags
- **Length categories**: filter by expression complexity

### Social

- **User profiles**: customize username, bio, and social links
- **Follow system**: follow other creators
- **Favorites**: save posts you like
- **Mentions**: tag other users with @username
- **In-app notifications**: get notified of follows, favorites, forks, and mentions

### Weekly Challenges

- **Bytebeat of the Week**: themed creative challenges every Saturday
- **Hall of Fame**: browse past winners
- **Community voting**: most-favorited entry wins

### Experience

- **Dark mode**: multiple color themes
- **Responsive design**: works on desktop and mobile
- **Progressive Web App**: install on your device
- **Live waveform visualizer**: see your audio in real-time

## Run locally

First, install NPM dependencies.

```bash
npm install
```

The backend uses Supabase. To start Supabase locally, run

```bash
npx supabase start
```

This will start a local Supabase project, prepare the database, and print connection info that you'll need in next step.

Create a `.env` file at project root and put the following content, replacing URL and key with the printed info.

```
# Project URL
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321

# Publishable key
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_*****
```

Then, run the frontend.

```bash
npm run dev
```

## Test locally

### Unit tests

Install dependencies

```bash
npm install
```

Run unit tests:

```bash
npm run test:unit
```

### E2E tests

Install dependencies and browsers:

```bash
npm install
npx playwright install
```

In another terminal, run tests:

```bash
npm run test:e2e:ui
```

This command will start the Supabase local instance, the front end dev server and run the tests in UI mode.

## TODO

- [x] User registration and login
- [x] Manage profile (edit username, delete account)
- [x] Create and share musical expressions (share link)
- [x] Create posts
- [x] Edit posts
- [x] Explore posts (recent, popular)
- [x] Add to favorites
- [x] Transport controls
- [x] Visualizer
- [x] Mobile layout
- [x] Fork posts
- [x] Dark mode
- [x] Responsive design
- [x] Progressive Web App
- [x] Length categories
- [x] Arbitrary sample rate
- [x] On-the-fly update of edited expressions
- [x] Follow users
- [x] Feed (global and personalized)
- [x] Recent posts
- [x] Trending posts on last 7 days
- [x] In-app notifications
- [x] Master gain
- [x] Support SR up to 48kHz
- [x] Post description
- [x] Tags
- [x] Signed int mode
- [x] Video export
- [x] Bytebeat of the Week
- [x] Report posts or users
- [x] Block/unblock users
- [x] Comments

**Working on**

- [ ] Playlists

**Coming later**

- [ ] Change history
- [ ] Offline mode
- [ ] Reject silent/too loud posts
- [ ] Moderator tools
- [ ] Pin posts on profile
- [ ] Search posts by name
- [ ] C-compatible badge
