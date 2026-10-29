import { Link } from 'react-router-dom';

const COPY = {
  scenes: { title: '3D scenes', body: "Place your real models and stand-in shapes in a 3D space, leave notes right on objects, and swap a stand-in for the finished model without losing its position.", after: 'Briefs and Assets' },
  claude: { title: 'Ask Claude', body: 'Send a finished brief to Claude on your computer, watch it work, review what it made and give feedback. It needs Claude on your computer to be connected.', after: 'Briefs, Assets and 3D scenes' },
  health: { title: 'Project health', body: 'See whether your website last published successfully, what changed in your code, and any errors, using your real GitHub and Vercel accounts.', after: 'Ask Claude' },
  art: { title: 'Art direction', body: 'Write down your art style, colours, materials and camera rules once. The right rules get attached to each brief automatically.', after: '3D scenes' },
};

export default function Planned({ kind }) {
  const c = COPY[kind];
  return (
    <div className="page">
      <h1>{c.title}</h1>
      <section className="panel planned">
        <p className="lead">{c.body}</p>
        <p className="muted">This section isn't built yet. It comes after {c.after}.</p>
        <Link className="btn" to="/briefs">Go to Briefs</Link>
      </section>
    </div>
  );
}
