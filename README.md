# Personal X AI Operator MVP

A local-first personal tool for posting to X, scanning your For You feed, scoring posts, drafting replies, selectively auto-replying, and keeping a SQLite history of everything it does.

This is intentionally not a SaaS app. There is no auth, billing, teams, hosted queue, or cloud database.

## What It Does

- Generates original X posts from `brain.md`, `ideas.md`, and `style.md`.
- Saves generated posts to SQLite as drafts unless auto-post is enabled.
- Opens X with Playwright and uses a persistent browser profile.
- Scans visible For You feed posts.
- Scores posts for relevance, value-add, author fit, natural reply fit, and risk.
- Blocks replies to politics, religion, medical, legal, tragedy, adult, harassment, and drama topics.
- Generates concise replies for high-scoring posts.
- Saves feed items, drafts, sent replies, skipped candidates, actions, and errors locally.
- Shows a simple local dashboard at `/dashboard`.

## Setup

Use Node.js 24 or newer. This MVP uses Node's built-in SQLite module to avoid native SQLite addon setup.

```bash
npm install
cp .env.example .env
npm run db:init
npx playwright install chromium
```

Then edit `.env` and add:

```bash
OPENAI_API_KEY=your_api_key
```

To test the workflow without OpenAI credits, use:

```bash
MOCK_AI=true
```

Mock mode generates local placeholder posts, replies, and scores. It is for plumbing demos only, not production-quality writing.

The default safety posture is conservative:

- `AUTO_POST_ENABLED=false`
- `AUTO_REPLY_ENABLED=false`
- `POSTS_PER_DAY=3`
- `REPLIES_PER_DAY=5`
- `MIN_REPLY_SCORE=8`

The dashboard-launched X browser exposes a local debugging port (`X_CDP_PORT=9222`) so agents can reuse the visible browser instead of colliding with its profile lock.

## Local Files To Edit

- `brain.md`: account identity and worldview
- `ideas.md`: post ideas
- `style.md`: writing style
- `forbidden.md`: topics/actions to avoid
- `targets.md`: types of accounts/posts to engage with

## Configuration

Set config in `.env`:

```bash
POSTS_PER_DAY=3
REPLIES_PER_DAY=5
POSTING_TIMES=09:00,14:00,18:00
MAX_FEED_POSTS_TO_SCAN=25
MIN_REPLY_SCORE=8
AUTO_POST_ENABLED=false
AUTO_REPLY_ENABLED=false
MOCK_AI=false
TOPICS=personal AI operators,local-first automation,practical AI workflows
FORBIDDEN_TOPICS=politics,religion,medical,legal,tragedy,adult,harassment,drama
TONE_STYLE=concise,thoughtful,specific,plainspoken,curious
```

The dashboard pause/resume buttons write runtime overrides to the SQLite `settings` table.

## Log Into X With Playwright Session Persistence

Run:

```bash
npm run x:login
```

A browser opens using the persistent profile at `X_USER_DATA_DIR` from `.env` (`./data/x-session` by default). Log into X manually. Once the script detects the logged-in home UI, it saves the session and exits.

After that, agents reuse the same browser profile. If X logs you out later, run `npm run x:login` again.

## Run The Dashboard

```bash
npm run dev
```

Open:

```text
http://localhost:3000/dashboard
```

Dashboard buttons:

- Run post agent now
- Run reply agent now
- Open X browser
- Use mock AI / Use OpenAI
- Pause/resume auto-post
- Pause/resume auto-reply

## Run Agents Manually

Generate a post draft, or publish if `AUTO_POST_ENABLED=true`:

```bash
npm run agent:post
```

Scan feed, score items, generate reply drafts, or publish if `AUTO_REPLY_ENABLED=true`:

```bash
npm run agent:reply
```

## Schedule Agents

Run the local scheduler:

```bash
npm run scheduler
```

Leave it running. It checks once per minute.

- Posts run at `POSTING_TIMES` when auto-post is enabled.
- Replies run every `SCHEDULER_REPLY_INTERVAL_MINUTES` when auto-reply is enabled.
- Runs are jittered by up to `SCHEDULER_JITTER_MINUTES`.

You can also run the same commands from system cron, launchd, or another local scheduler.

## SQLite Tables

The database lives at `DATABASE_PATH` (`./data/operator.sqlite` by default).

Tables:

- `posts`
- `replies`
- `feed_items`
- `actions`
- `errors`
- `settings`

## Safety Notes

- Auto-post and auto-reply are disabled by default.
- The reply agent saves skipped candidates with reasons.
- The scorer blocks sensitive topics before reply generation.
- The app logs before and after browser actions.
- Browser failures are caught, saved to `errors`, and surfaced in the dashboard.
- X browser automation can break when X changes its UI. Review logs after every change.

## TODOs

- Add a review/approve queue for drafts.
- Add richer duplicate detection across semantic variants.
- Add better X URL discovery after posting/replying.
- Add screenshot capture for failed Playwright actions.
- Add backoff when X shows rate limits or suspicious activity warnings.
- Add feed source controls beyond For You.
- Add editable settings directly in the dashboard.
- Add tests around prompts, scoring guards, and SQLite writes.
