import { Link } from 'react-router-dom';
import { useProject } from '../lib/project.jsx';
import { useTable } from '../lib/useTable.js';
import { BRIEF_STATUS, timeAgo } from '../lib/plain.js';
import ActivityList from '../components/ActivityList.jsx';

function Stat({ label, value, hint, to }) {
  const body = (
    <>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </>
  );
  return to ? <Link to={to} className="stat">{body}</Link> : <div className="stat">{body}</div>;
}

export default function Overview() {
  const { projectId, name } = useProject();
  const briefs = useTable('cc_briefs', projectId);
  const assets = useTable('cc_assets', projectId);
  const scenes = useTable('cc_scenes', projectId);
  const activity = useTable('cc_activity_events', projectId, { order: 'created_at', limit: 12 });

  const ready = briefs.state === 'ready';
  const active = briefs.rows.filter((b) => ['draft', 'ready', 'submitted', 'in_review'].includes(b.status));
  const toSend = briefs.rows.filter((b) => b.status === 'ready');
  const toReview = briefs.rows.filter((b) => b.status === 'in_review');
  const missing = assets.rows.filter((a) => ['planned', 'placeholder', 'in_progress'].includes(a.status));

  // The one thing to do next, in plain words.
  let next;
  if (!ready) next = null;
  else if (briefs.rows.length === 0)
    next = { title: 'Start with your first brief', body: 'A brief is a plain description of what you want made or changed. Everything else (files, scenes, notes) attaches to it.', to: '/briefs?new=1', cta: 'Create a brief' };
  else if (toReview.length)
    next = { title: `${toReview.length} ${toReview.length === 1 ? 'result needs' : 'results need'} your review`, body: toReview[0].title, to: `/briefs/${toReview[0].id}`, cta: 'Review result' };
  else if (toSend.length)
    next = { title: `${toSend.length} ${toSend.length === 1 ? 'brief is' : 'briefs are'} ready to send`, body: 'Sending to Claude needs Claude on your computer to be connected first. That setup comes in a later step.', to: '/settings', cta: 'See connections' };
  else
    next = { title: 'Keep shaping your briefs', body: active.length ? `${active.length} in progress. Open one to add detail.` : 'No briefs are open right now.', to: '/briefs', cta: 'Open briefs' };

  return (
    <div className="page">
      <h1>{name}</h1>

      {next && (
        <section className="next" aria-label="Next step">
          <div>
            <h2>{next.title}</h2>
            <p>{next.body}</p>
          </div>
          <Link className="btn primary" to={next.to}>{next.cta}</Link>
        </section>
      )}

      <section aria-label="Your project" className="stats">
        <Stat label="Open briefs" value={ready ? active.length : '–'} to="/briefs" />
        <Stat label="Waiting for your review" value={ready ? toReview.length : '–'} to="/briefs" />
        <Stat label="Assets still to deliver" value={assets.state === 'ready' ? missing.length : '–'} hint={assets.state === 'ready' ? `${assets.rows.length} tracked in total` : undefined} to="/assets" />
        <Stat label="Scenes in the 3D editor" value={scenes.state === 'ready' ? scenes.rows.length : '–'} to="/scenes" />
      </section>

      <div className="cols">
        <section className="panel">
          <h2>What's happening</h2>
          <ActivityList rows={activity.rows} state={activity.state} empty="Nothing has happened yet. Create a brief and it shows up here." />
          {activity.rows.length > 0 && <Link className="more" to="/activity">See all activity</Link>}
        </section>

        <section className="panel">
          <h2>Connections</h2>
          <ul className="conn">
            <li><i className="dot ok" /> <span><strong>Your project data</strong><small>Saved and updating live</small></span></li>
            <li><i className="dot off" /> <span><strong>Claude on your computer</strong><small>Not connected. Usage limits can't be shown until it is.</small></span></li>
            <li><i className="dot off" /> <span><strong>Website and code</strong><small>Latest update and publishing status aren't connected yet.</small></span></li>
          </ul>
          <Link className="more" to="/settings">Open setup</Link>
        </section>
      </div>

      {ready && briefs.rows.length > 0 && (
        <section className="panel">
          <h2>Recently changed briefs</h2>
          <ul className="rows">
            {briefs.rows.slice(0, 5).map((b) => (
              <li key={b.id}>
                <Link to={`/briefs/${b.id}`}>
                  <span className="num">BR-{String(b.number).padStart(3, '0')}</span>
                  <span className="grow">{b.title}</span>
                  <span className={`chip s-${b.status}`}>{BRIEF_STATUS[b.status]}</span>
                  <span className="muted when">{timeAgo(b.updated_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
