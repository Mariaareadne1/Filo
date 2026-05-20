# Filo

**The map your friends would draw.**

Filo is a social discovery app for cities. Instead of searching Yelp or scrolling TikTok, you open Filo and see a map of everywhere your friends have actually been — their pins, their impressions, their ranked favorites. Discovery through people you trust, not algorithms you don't.

---

## What Filo Is

Filo is built around a single idea: the best way to find a place is through someone you know. The name comes from the Italian/Greek word for thread — the red thread of fate (運命の赤い糸) — which connects people to the places and people they are meant to find. Every pin is a thread. Every friend's map is a web of threads you can follow.

The product launches at Columbia University, invite-only, with email verification (@columbia.edu / @barnard.edu) required. The constraint is the moat: every user is a real verified student, every place is somewhere a real person has been, and the graph is small enough to feel personal.

---

## Core Features

### The City Map
The central screen. A live map of New York City showing pins from you and your friends. Toggle between your own map and your friends' combined map. Tap any pin to see who saved it, what they thought, and how they ranked it. Filter by category, friend, or neighborhood.

### Pins
A pin is a place you've visited or want to go. Each pin has a category, a status (visited / want to go), an optional photo, and an optional short impression. No star ratings. No 0–10 scores. Just signal.

### Rankings
For places you've visited, you can rank them within a category — a living, drag-reorderable list. Rankings are the core of the taste graph. They power the Twins feature and fuel the discovery engine over time.

### Boards
Named collections of pins. "Morningside Essentials." "Late Night Eats." "Ideal Date Spots." Shareable via link (`filo.app/b/<token>`) — from a dating profile, in a text, in a social bio. The cover is a collage of the first four pin photos.

### Discover
Six named discovery lenses:
1. **Trending near you** — what's being pinned most this week
2. **New to your network** — places pinned by friends you haven't saved yet
3. **Friends disagree on** — places where your friends' rankings diverge most
4. **Hidden gems** — high-ranked by friends, rarely pinned by others
5. **Most pinned in [category]** — the consensus favorites
6. **Saved by people like you** — taste-match recommendations

### Taste Twins
You are someone's twin in a category if your ranked overlap is ≥3 places and your Spearman correlation on those overlapping ranks is ≥0.6. The Twins screen shows your top match per category — who you are most aligned with and where you diverge.

### Feed
A chronological activity feed of what your network is pinning and saving. No infinite scroll — it stops.

---

## Design System

Filo uses a tight, opinionated design system built around three core ideas:

**The thread.** Red (`#d8423a`) is the only accent color. It appears on the FAB, active rankings, save confirmations, and brand display text — and nowhere else. One accent, used with precision.

**Sticker shadow.** Every card has a hard offset shadow (2px Y, 0 blur, ink at 100%). No soft drop shadows, no elevation blur. Cards look like they're physically stuck to the surface.

**Italic accent word.** Display titles use Fraunces serif with one italicized word in red: "different *tastes*, same map." This is the brand voice signature — it appears on every major screen.

**Type stack:**
- `Fraunces` — display titles, place names
- `Inter` — UI, body, buttons
- `DM Mono` — labels, counts, addresses, ranks

**Palettes:** Paper (default), Concrete, Midnight, Sky. All four are supported; Paper ships.

---

## Architecture

The prototype is a single-file HTML entry point (`Filo.html`) loading JSX modules in-browser via Babel standalone. The mobile app is React Native with Expo, targeting iOS first.

**Prototype files:**
| File | Role |
|---|---|
| `Filo.html` | Entry point — loads scripts, sets fonts |
| `filo-app.jsx` | Top-level layout |
| `filo-v4-screens.jsx` | Main flow screens + palette infra |
| `filo-v5-screens.jsx` | Discovery screens |
| `filo-tweaks.jsx` | Live palette/accent switching (dev only) |

**Mobile app stack:** React Native · Expo · Supabase · Mapbox GL

**Core data model:**
- `profiles` — users, handles, display names
- `pins` — the atomic unit; place, user, category, status, photo, impression
- `rankings` — ordered lists per (user, category)
- `boards` — named collections of pins
- `follows` — the social graph
- `feed_events` — denormalized for feed query speed

---

## MVP Launch Scope

Phase 1 is invite-only, Columbia/Barnard campus only. University email verification required at signup.

**Success threshold before expanding:** 200 active users + 500 pins within 30 days.

**Not in Phase 1:**
- Business dashboard (Phase 2)
- City-wide public launch
- Full recommendation engine
- DMs or messaging

**The one question Phase 1 answers:** Will Columbia students pin places, share them with friends, and come back to see what their friends have pinned?

---

## Target Categories

Filo is for businesses where word-of-mouth is already the primary growth engine:

| Category | Examples |
|---|---|
| Food & Drink | Restaurants, cafes, coffee shops, bakeries |
| Bars & Nightlife | Bars, cocktail lounges, rooftops, clubs |
| Beauty & Grooming | Hair salons, nail studios, barbershops, lash bars |
| Experiences | Yoga studios, climbing gyms, pottery classes |
| Taste Retail | Vintage stores, bookshops, boutiques, record stores |

Not included: doctor, vet, lawyer, pharmacy, dry cleaner. Nobody pins these.

---

## Anti-Patterns

Things Filo will never do:

- ❌ Public star ratings or 0–10 scores
- ❌ Sponsored or algorithmic content in the feed
- ❌ Infinite scroll
- ❌ Emoji in core UI (allowed in user-generated content only)
- ❌ Gradient backgrounds
- ❌ Beige/cream backgrounds (we tried; rejected)
- ❌ More than 4 cards visible without scroll

---

## Business Model (Phase 2)

Businesses will have a dashboard showing: who discovered them this week, where discovery came from, who their word-of-mouth superfans are, and which regulars are drifting. One AI-suggested action per week — no marketing knowledge required. Verified check-ins (location ping or receipt scan) keep signal quality high.

---

## Status

**Current:** Consumer MVP, prototype complete, React Native mobile build in progress.
**Next:** Columbia campus launch, invite-only, targeting 200 active users + 500 pins in 30 days.

---

*Filo — the thread connects everything: your people, your places, your city. The more you use it, the harder it is to leave.*
