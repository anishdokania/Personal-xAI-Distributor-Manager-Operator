# Self-Serve Launch Checklist

Use this when selling the tool as a $20 one-time product.

## Offer

Product name: Personal X Operator

Price: $20 one time

Positioning:

> A local-first X engagement assistant that scans your feed, finds relevant conversations, drafts better replies, and can post from your own browser when you enable live mode.

Do not position it as a follower bot, mass reply bot, or guaranteed growth tool.

## Payment

Use a hosted checkout instead of building billing into the app.

Recommended path:

1. Create a $20 product in Stripe Payment Links, Gumroad, Lemon Squeezy, or Polar.
2. Upload a ZIP release or add post-purchase instructions in that provider.
3. Copy the checkout URL.
4. Set `NEXT_PUBLIC_PURCHASE_URL` in `.env`.
5. Set `MARKETING_ONLY=true` on the public deployment.
6. Deploy the landing page.

## Delivery

The download should include:

- Source code
- `.env.example`
- README setup instructions
- `BUYER_GUIDE.md`
- `LICENSE.md`
- `REFUND_POLICY.md`
- `brain.md`, `ideas.md`, `style.md`, `forbidden.md`, `targets.md`

Do not include:

- `.env`
- `data/`
- Playwright browser sessions
- SQLite files
- Your X account data

Create the ZIP from a clean committed state:

```bash
npm run release
```

Upload the generated ZIP from `dist/` to your payment provider.

## Buyer Instructions

The buyer runs:

```bash
npm install
cp .env.example .env
npm run setup
npm run x:login
npm run dev
```

Then they open:

```text
http://localhost:3000/dashboard
```

## Safety Defaults

Keep these defaults for public buyers:

```bash
AUTO_POST_ENABLED=false
AUTO_REPLY_ENABLED=false
POSTS_PER_DAY=3
REPLIES_PER_DAY=5
MIN_REPLY_SCORE=8
MOCK_AI=true
```

Draft mode should be the default experience. Live mode is optional and user-controlled.

## Public Copy

Short version:

> Find better X conversations without living in the feed. Personal X Operator runs locally, drafts thoughtful replies, and keeps your actions/history on your machine. $20 once.

Boundary copy:

> This is not a follower bot. It does not follow/unfollow accounts or guarantee engagement. You are responsible for activity performed through your X account.

## Next Improvements

- Add a buyer-facing demo video.
- Add an in-dashboard settings editor.
