import { useProject } from '../lib/project.jsx';
import { useTable } from '../lib/useTable.js';
import ActivityList from '../components/ActivityList.jsx';

export default function Activity() {
  const { projectId } = useProject();
  const { rows, state } = useTable('cc_activity_events', projectId, { order: 'created_at', limit: 100 });
  return (
    <div className="page">
      <h1>Activity</h1>
      <p className="muted lead">Everything that changed in your project, newest first. It updates by itself.</p>
      <section className="panel">
        <ActivityList rows={rows} state={state} empty="Nothing has happened yet." />
      </section>
    </div>
  );
}
