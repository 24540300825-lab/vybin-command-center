// Plain-language labels. Buttons and messages use these words; technical detail stays in Settings > Troubleshooting.
export const BRIEF_STATUS = {
  draft: 'Draft',
  ready: 'Ready to send',
  submitted: 'Waiting for Claude',
  in_review: 'Needs your review',
  done: 'Done',
  archived: 'Archived',
};
export const PRIORITY = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' };
export const ASSET_STATUS = {
  planned: 'Planned',
  placeholder: 'Placeholder',
  in_progress: 'In progress',
  available: 'Available',
  integrated: 'In the scene',
  needs_revision: 'Needs revision',
};
export const TEMPLATES = {
  general: { label: 'General task', sections: ['Overview', 'What done looks like'] },
  map: { label: 'New map or environment', sections: ['Overview', 'Visual direction', 'Objects and layout', 'Technical requirements', 'What done looks like'] },
  character: { label: 'Character creation', sections: ['Overview', 'Visual direction', 'Technical requirements', 'What done looks like'] },
  animation: { label: 'Character animation', sections: ['Overview', 'Animation requirements', 'References', 'What done looks like'] },
  asset: { label: 'Asset creation', sections: ['Overview', 'Visual direction', 'Technical requirements', 'What done looks like'] },
  asset_change: { label: 'Asset change', sections: ['Overview', 'What to change', 'What must stay the same', 'What done looks like'] },
  ui: { label: 'Interface design', sections: ['Overview', 'Behaviour', 'What done looks like'] },
  feature: { label: 'New feature', sections: ['Overview', 'How it should behave', 'Technical requirements', 'What done looks like'] },
  bug: { label: 'Something is broken', sections: ['What happens', 'What should happen', 'How to see it'] },
  performance: { label: 'Make it faster', sections: ['Overview', 'Where it feels slow', 'What done looks like'] },
  art: { label: 'Art direction', sections: ['Overview', 'Visual direction', 'References'] },
};
export function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
