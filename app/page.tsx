export default function HomePage() {
  const purchaseUrl = process.env.NEXT_PUBLIC_PURCHASE_URL || "";
  const price = process.env.NEXT_PUBLIC_PRODUCT_PRICE || "$20";

  return (
    <main className="landing">
      <section className="landing-hero">
        <div className="landing-hero-overlay">
          <nav className="landing-nav" aria-label="Primary">
            <strong>Personal X Operator</strong>
            <div>
              <a href="/dashboard">Dashboard</a>
              {purchaseUrl ? <a href={purchaseUrl}>Buy</a> : null}
            </div>
          </nav>

          <div className="hero-preview" aria-hidden="true">
            <div className="preview-bar">
              <span />
              <span />
              <span />
            </div>
            <div className="preview-grid">
              <div>
                <small>Reply mode</small>
                <strong>Draft-first</strong>
              </div>
              <div>
                <small>Feed scanned</small>
                <strong>128</strong>
              </div>
              <div>
                <small>Safe replies</small>
                <strong>12</strong>
              </div>
            </div>
            <div className="preview-stream">
              <span>AI builder asking who is shipping this week</span>
              <span>Score 9: relevant, natural, low risk</span>
              <span>Draft: &quot;This is my lane too...&quot;</span>
            </div>
          </div>

          <div className="landing-copy">
            <p className="eyebrow">Local-first X engagement assistant</p>
            <h1>Find better conversations on X without living in the feed.</h1>
            <p className="lede">
              A simple desktop-style tool that scans your X feed, finds relevant posts,
              drafts thoughtful replies, and can post from your own browser when you enable it.
            </p>
            <div className="quick-steps" aria-label="Purchase flow">
              <span>Buy</span>
              <span>Download</span>
              <span>Run locally</span>
            </div>
            <div className="landing-actions">
              {purchaseUrl ? (
                <a className="button-link primary" href={purchaseUrl}>
                  Buy once for {price}
                </a>
              ) : (
                <a className="button-link primary" href="#launch">
                  Configure purchase link
                </a>
              )}
              <a className="button-link" href="/dashboard">
                Open local dashboard
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-band">
        <div className="landing-section">
          <div>
            <p className="eyebrow">What buyers get</p>
            <h2>{price} once. No subscription. No hosted account.</h2>
          </div>
          <div className="feature-grid">
            <article className="feature">
              <h3>Local dashboard</h3>
              <p>Runs on the buyer&apos;s machine with SQLite history, visible logs, and simple controls.</p>
            </article>
            <article className="feature">
              <h3>Feed scanner</h3>
              <p>Uses Playwright with a persistent X browser session to read the For You feed.</p>
            </article>
            <article className="feature">
              <h3>Reply assistant</h3>
              <p>Scores candidates, avoids sensitive topics, and creates concise replies in your style.</p>
            </article>
            <article className="feature">
              <h3>Draft-first safety</h3>
              <p>Live posting and live replies stay off until the user deliberately enables them.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="landing-section two-col" id="launch">
        <div>
          <p className="eyebrow">Simple customer flow</p>
          <h2>Buy once, download the ZIP, open the local dashboard.</h2>
          <p className="section-copy">
            The purchase button points to <code>NEXT_PUBLIC_PURCHASE_URL</code>. Use Stripe Payment Links,
            Gumroad, Lemon Squeezy, or Polar to collect the {price} payment and deliver the release ZIP.
          </p>
        </div>
        <div className="launch-list">
          <p>What the customer does:</p>
          <ol>
            <li>Click Buy once for {price}.</li>
            <li>Download the ZIP from the payment receipt.</li>
            <li>Run the setup commands from the buyer guide.</li>
            <li>Log into X once and start in draft mode.</li>
          </ol>
        </div>
      </section>

      <section className="landing-band">
        <div className="landing-section">
          <div>
            <p className="eyebrow">Buyer quickstart</p>
            <h2>Four commands after download.</h2>
          </div>
          <pre className="code-panel"><code>{`npm install
cp .env.example .env
npm run setup
npm run dev`}</code></pre>
          <p className="section-copy">
            Then open <code>http://localhost:3000/dashboard</code>, click <strong>Open X browser</strong>,
            and log into X. The first run stays in draft mode.
          </p>
        </div>
      </section>

      <section className="landing-band">
        <div className="landing-section compact">
          <p className="eyebrow">Clear boundaries</p>
          <h2>Not a follower bot.</h2>
          <p className="section-copy">
            This tool does not follow or unfollow accounts, does not promise follower growth,
            and should not be used for spammy or duplicated replies. The buyer remains responsible
            for the activity performed through their X account.
          </p>
        </div>
      </section>

      <section className="landing-section two-col">
        <div>
          <p className="eyebrow">What happens after purchase</p>
          <h2>Download, install locally, log into X once.</h2>
          <p className="section-copy">
            Buyers get the source release, setup guide, local memory files, and safety notes.
            The suggested refund policy is 7 days if the tool cannot be installed after following
            the guide.
          </p>
        </div>
        <div className="launch-list">
          <p>Included docs:</p>
          <ol>
            <li>Buyer install guide</li>
            <li>Launch checklist</li>
            <li>Deployment guide</li>
            <li>License and refund policy drafts</li>
          </ol>
        </div>
      </section>

      <section className="landing-band">
        <div className="landing-section final-cta">
          <div>
            <p className="eyebrow">Ready when your checkout link is set</p>
            <h2>{price} once. Run it locally.</h2>
          </div>
          {purchaseUrl ? (
            <a className="button-link primary" href={purchaseUrl}>
              Buy once for {price}
            </a>
          ) : (
            <a className="button-link primary" href="#launch">
              Add checkout link
            </a>
          )}
        </div>
      </section>
    </main>
  );
}
