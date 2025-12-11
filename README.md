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
- Only a subset of JS is allowed. You cannot use `for`, `if`, `while`, `switch`, `var`, `let`, `const`... ternary operations and implicit declarations with assignment are fine though.

## Features

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
- [x] Offline mode
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

**Working on**

- [x] Bytebeat of the Week theme selection
- [x] Submission mode of create page
- [x] Explore submissions
- [ ] Hall of Fame
- [ ] Top Pick badge

**Coming later**

- [ ] Report posts or users
- [ ] Block/unblock users
- [ ] Reject silent/too loud posts
- [ ] Moderator tools
- [ ] Pin posts on profile
- [ ] Search posts by name
- [ ] C-compatible badge

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
