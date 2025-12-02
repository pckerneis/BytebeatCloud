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

- Sample rate can be switched to predefined values rather than arbitrary values.
- In float mode, `t` is a seconds counter rather than a sample counter.
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
- [x] Responsive design for all screen sizes
- [x] Progressive Web App
- [x] Offline mode
- [ ] On-the-fly update of edited expressions
- [ ] Tags
- [ ] Length categories
- [ ] Master gain
- [ ] Follow users
- [ ] Report posts or users
- [ ] Personalized feed
- [ ] Pin posts on profile
- [ ] Search posts by name and tags
