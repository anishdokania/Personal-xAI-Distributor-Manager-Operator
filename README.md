# Personal X AI Operator MVP

A local-first personal tool for posting to X, scanning your For You feed, scoring posts, drafting replies, selectively auto-replying, and keeping a SQLite history of everything it does. It defaults to no-cost local curator mode, so OpenAI is optional.

This is intentionally not a SaaS app. There is no auth, billing, teams, hosted queue, or cloud database.

## $20 Self-Serve Product Positioning

Sell this as a simple one-time purchase:

> Personal X Operator helps builders find relevant X conversations, draft better replies, and optionally post from their own browser. It runs locally, stores history locally, and costs $20 once.

Recommended public wording:

- "$20 one-time purchase"
- "Runs locally on your machine"
- "No subscription"
- "No hosted account"
- "Draft-first by default"
- "Optional live posting/replying when you enable it"

Avoid wording like:

- "Follower bot"
- "Guaranteed growth"
- "Mass reply bot"
- "Auto-follow people"
- "Spam replies at scale"

The app does not follow or unfollow accounts.

## Self-Serve Payment Setup

Do not build billing into this app yet. Use a hosted payment link and let that provider deliver the ZIP/repo access after purchase.

Good options:

- Stripe Payment Links
- Gumroad
- Lemon Squeezy
- Polar

Set the landing-page purchase button in `.env`:

```bash
NEXT_PUBLIC_PRODUCT_PRICE=$20
NEXT_PUBLIC_PURCHASE_URL=https://your-payment-link.example
```

Then deploy the landing page or run it locally:

```bash
npm run build
npm run start
```

The root route `/` is the sales page. The app itself is still at `/dashboard`.

For a public sales deployment, set:

```bash
MARKETING_ONLY=true
```

That redirects `/dashboard` and `/api/*` back to `/`, so the hosted site behaves like a marketing page. Buyers should run the dashboard locally.

## Release ZIP

Create a buyer-ready ZIP from the latest committed code:

```bash
npm run release
```

The ZIP is created in `dist/`. It uses `git archive`, so ignored local files like `.env`, `data/`, browser sessions, SQLite files, `node_modules`, and `.next` are excluded.

Buyer-facing docs:

- `BUYER_GUIDE.md`
- `DEMO_SCRIPT.md`
- `DEPLOY.md`
- `LAUNCH.md`
- `LICENSE.md`
- `REFUND_POLICY.md`

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
npm run setup
```

OpenAI is optional. For stronger generated text, edit `.env` and add:

```bash
OPENAI_API_KEY=your_api_key
```

To stay in no-cost local curator mode, keep:

```bash
MOCK_AI=true
```

Local curator mode generates posts, replies, and scores without paid API calls. It uses deterministic local rules, topic matching, safety filters, and curated templates. OpenAI mode is still available for richer style matching, but it is optional.

The default safety posture is conservative:

- `AUTO_POST_ENABLED=false`
- `AUTO_REPLY_ENABLED=false`
- `POSTS_PER_DAY=3`
- `REPLIES_PER_DAY=5`
- `MIN_REPLY_SCORE=8`

The dashboard-launched X browser is managed by the local Next.js server so dashboard actions can reuse the same visible Playwright session instead of colliding with its profile lock. If you restart or hot-reload the dev server while that browser is open, close the Chrome for Testing window and click **Open X browser** again.

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
MOCK_AI=true
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

- Generate post draft / Run live post
- Scan and draft replies / Run live replies
- Open X browser
- Use local curator / Use OpenAI
- Enable live posting / Use post drafts
- Enable live replies / Use reply drafts

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

- Live posting and live replies are disabled by default.
- Draft mode is the recommended default for new buyers.
- The reply agent saves skipped candidates with reasons.
- The scorer blocks sensitive topics before reply generation.
- The app avoids follow/unfollow automation.
- The app does not promise follower growth or engagement outcomes.
- The app logs before and after browser actions.
- Browser failures are caught, saved to `errors`, and surfaced in the dashboard.
- X browser automation can break when X changes its UI. Review logs after every change.
- Users are responsible for actions taken through their own X account.

## TODOs

- Add a non-technical desktop installer.
- Add a review/approve queue for drafts.
- Add editable settings directly in the dashboard.
- Add a stronger "pause all automation" control.
- Add richer duplicate detection across semantic variants.
- Add better X URL discovery after posting/replying.
- Add screenshot capture for failed Playwright actions.
- Add backoff when X shows rate limits or suspicious activity warnings.
- Add feed source controls beyond For You.
- Add tests around prompts, scoring guards, and SQLite writes.
