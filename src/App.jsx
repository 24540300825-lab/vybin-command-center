import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth.jsx';
import { ProjectProvider, useProject } from './lib/project.jsx';
import { configured } from './lib/supabase.js';
import Shell from './components/Shell.jsx';
import SignIn from './pages/SignIn.jsx';
import Overview from './pages/Overview.jsx';

const Briefs = lazy(() => import('./pages/Briefs.jsx'));
const Assets = lazy(() => import('./pages/Assets.jsx'));
const Activity = lazy(() => import('./pages/Activity.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const Planned = lazy(() => import('./pages/Planned.jsx'));

function Centered({ title, children }) {
  return (
    <main className="centered">
      <div className="card narrow">
        <h1>{title}</h1>
        {children}
      </div>
    </main>
  );
}

function Gate() {
  const { user, loading, signOut } = useAuth();
  const project = useProject();
  if (loading) return <Centered title="Opening your studio…" />;
  if (!user) return <SignIn />;
  if (project.status === 'loading') return <Centered title="Getting your workspace ready…" />;
  if (project.status === 'not_allowed')
    return (
      <Centered title="This account isn't set up here">
        <p>{user.email} doesn't have a Command Center workspace. Sign in with the email address you set up the studio with.</p>
        <button className="btn" onClick={signOut}>Use a different email</button>
      </Centered>
    );
  if (project.status === 'error')
    return (
      <Centered title="Something went wrong opening your workspace">
        <p>We couldn't reach your project data. Check your internet connection and try again.</p>
        <button className="btn primary" onClick={project.retry}>Try again</button>
        <details><summary>Technical details</summary><pre>{project.error}</pre></details>
      </Centered>
    );
  return (
    <Shell>
      <Suspense fallback={<div className="page"><p className="muted">Loading…</p></div>}>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/briefs" element={<Briefs />} />
          <Route path="/briefs/:briefId" element={<Briefs />} />
          <Route path="/assets" element={<Assets />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/scenes" element={<Planned kind="scenes" />} />
          <Route path="/claude" element={<Planned kind="claude" />} />
          <Route path="/health" element={<Planned kind="health" />} />
          <Route path="/art" element={<Planned kind="art" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Shell>
  );
}

export default function App() {
  if (!configured)
    return (
      <Centered title="This site isn't connected to its database yet">
        <p>The connection details are missing from this deployment. Ask whoever set up the site to add them, then reload.</p>
      </Centered>
    );
  return (
    <AuthProvider>
      <ProjectProvider>
        <Gate />
      </ProjectProvider>
    </AuthProvider>
  );
}
