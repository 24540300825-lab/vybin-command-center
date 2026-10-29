import { Link } from 'react-router-dom';
import { timeAgo } from '../lib/plain.js';

const target = (e) => (e.subject_type === 'brief' && e.subject_id ? `/briefs/${e.subject_id}` : null);

export default function ActivityList({ rows, state, empty }) {
  if (state === 'loading') return <p className="muted">Loading…</p>;
  if (state === 'error') return <p className="error">We couldn't load the activity. Reload the page to try again.</p>;
  if (!rows.length) return <p className="muted">{empty}</p>;
  return (
    <ul className="feed">
      {rows.map((e) => {
        const to = target(e);
        return (
          <li key={e.id}>
            {to ? <Link to={to}>{e.summary}</Link> : <span>{e.summary}</span>}
            <time className="muted" dateTime={e.created_at}>{timeAgo(e.created_at)}</time>
          </li>
        );
      })}
    </ul>
  );
}
