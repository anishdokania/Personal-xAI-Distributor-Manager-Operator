import { dashboardData } from "@/src/db";
import DashboardControls from "./DashboardControls";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function statusClass(enabled: boolean): string {
  return `status ${enabled ? "on" : "off"}`;
}

function formatDate(value: string | null): string {
  if (!value) return "not sent";
  return new Date(value).toLocaleString();
}

function EmptyRow({ label }: { label: string }) {
  return (
    <div className="row">
      <p className="muted">{label}</p>
    </div>
  );
}

export default function DashboardPage() {
  const data = dashboardData();

  return (
    <main className="dashboard">
      <div className="topbar">
        <div>
          <h1>Personal X AI Operator</h1>
          <p className="muted">Local dashboard</p>
        </div>
        <DashboardControls
          autoPostEnabled={data.settings.autoPostEnabled}
          autoReplyEnabled={data.settings.autoReplyEnabled}
          mockAiEnabled={data.settings.mockAiEnabled}
        />
      </div>

      <section className="grid metrics">
        <div className="metric">
          <span>AI mode</span>
          <strong>
            <span className={statusClass(data.settings.mockAiEnabled)}>
              {data.settings.mockAiEnabled ? "Mock" : "OpenAI"}
            </span>
          </strong>
        </div>
        <div className="metric">
          <span>Auto-post</span>
          <strong>
            <span className={statusClass(data.settings.autoPostEnabled)}>
              {data.settings.autoPostEnabled ? "Enabled" : "Disabled"}
            </span>
          </strong>
        </div>
        <div className="metric">
          <span>Auto-reply</span>
          <strong>
            <span className={statusClass(data.settings.autoReplyEnabled)}>
              {data.settings.autoReplyEnabled ? "Enabled" : "Disabled"}
            </span>
          </strong>
        </div>
        <div className="metric">
          <span>Posts today</span>
          <strong>{data.counts.postsSentToday}</strong>
        </div>
        <div className="metric">
          <span>Replies today</span>
          <strong>{data.counts.repliesSentToday}</strong>
        </div>
        <div className="metric">
          <span>Feed scanned</span>
          <strong>{data.counts.feedItemsScannedToday}</strong>
        </div>
      </section>

      <section className="grid layout">
        <div className="grid">
          <div className="panel">
            <div className="panel-header">
              <h2>Recent Posts</h2>
            </div>
            <div className="list">
              {data.recentPosts.length === 0 ? (
                <EmptyRow label="No posts yet." />
              ) : (
                data.recentPosts.map((post) => (
                  <div className="row" key={post.id}>
                    <small>
                      {post.status} - {formatDate(post.posted_at || post.created_at)}
                    </small>
                    <p className="content">{post.content}</p>
                    {post.error ? <small className="error">{post.error}</small> : null}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h2>Recent Replies</h2>
            </div>
            <div className="list">
              {data.recentReplies.length === 0 ? (
                <EmptyRow label="No replies yet." />
              ) : (
                data.recentReplies.map((reply) => (
                  <div className="row" key={reply.id}>
                    <small>
                      {reply.status} - score {reply.score ?? "n/a"} - {reply.handle || "unknown"}
                    </small>
                    {reply.post_text ? <p className="content muted">{reply.post_text}</p> : null}
                    {reply.reply_text ? <p className="content">{reply.reply_text}</p> : null}
                    {reply.error ? <small className="warning">{reply.error}</small> : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="grid">
          <div className="panel">
            <div className="panel-header">
              <h2>Feed Items</h2>
            </div>
            <div className="list">
              {data.recentFeedItems.length === 0 ? (
                <EmptyRow label="No feed items scanned yet." />
              ) : (
                data.recentFeedItems.map((item) => (
                  <div className="row" key={item.id}>
                    <small>
                      {item.handle} - score {item.score ?? "n/a"}
                    </small>
                    <p className="content">{item.text}</p>
                    {item.score_reason ? <small>{item.score_reason}</small> : null}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h2>Logs</h2>
            </div>
            <div className="list">
              {data.recentActions.length === 0 ? (
                <EmptyRow label="No logs yet." />
              ) : (
                data.recentActions.map((action) => (
                  <div className="row" key={action.id}>
                    <small>
                      {formatDate(action.created_at)} - {action.type} - {action.status}
                    </small>
                    <p className="content">{action.message}</p>
                  </div>
                ))
              )}
              {data.recentErrors.map((error) => (
                <div className="row" key={`error-${error.id}`}>
                  <small className="error">
                    {formatDate(error.created_at)} - {error.scope}
                  </small>
                  <p className="content error">{error.message}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
