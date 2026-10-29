import { KIND_LABEL, formatSize, kindOf } from './files.js';
import { PERMISSIONS, PRIORITY } from './plain.js';

const code = (n) => `BR-${String(n).padStart(3, '0')}`;

// Everything that could go into the message to Claude, as separate pieces the owner can switch on or off.
// Nothing is invented: every piece is text the owner wrote or numbers read from their own data.
export function buildPieces({ brief, sections, files, scenes, sceneObjects, annotations, assets, guidelines, parent }) {
  const pieces = [];
  const mine = sections.filter((s) => s.brief_id === brief.id).sort((a, b) => a.position - b.position);
  for (const s of mine) {
    if (!s.body.trim()) continue;
    pieces.push({ id: `brief:${s.id}`, group: 'The brief', label: s.title || 'Untitled section', on: true, text: `### ${s.title || 'Untitled section'}\n${s.body.trim()}` });
  }
  const fl = files.filter((f) => f.brief_id === brief.id && !['archived', 'failed', 'uploading'].includes(f.status));
  if (fl.length) {
    const lines = fl.map((f) => {
      const m = f.meta?.model;
      const stats = m ? `; ${m.meshes} meshes, ${m.materials} materials, ${m.triangles.toLocaleString()} triangles, ${m.animations} animations, size ${m.size.join(' x ')}` : '';
      return `- ${f.name} (${KIND_LABEL[kindOf(f.name)]}, ${formatSize(f.size_bytes)}${stats})`;
    });
    pieces.push({ id: 'files', group: 'The brief', label: `List of ${fl.length} attached file${fl.length === 1 ? '' : 's'}`, on: true, text: `### Reference files attached to this brief\nThese are stored in the Command Center. Ask for any file you need to open.\n${lines.join('\n')}` });
  }
  for (const sc of scenes) {
    const objs = sceneObjects.filter((o) => o.scene_id === sc.id);
    const notes = annotations.filter((n) => n.scene_id === sc.id && n.status === 'open');
    const f3 = (v) => v.map((n) => Math.round(n * 100) / 100).join(', ');
    const lines = objs.map((o) => {
      const a = assets.find((x) => x.id === o.asset_id);
      const what = a ? `real model "${a.name}" (${a.code}, v${a.current_version})` : `stand-in ${o.shape}`;
      return `- ${o.name}: ${what}; position (${f3(o.position)}), rotation deg (${f3(o.rotation)}), size (${f3(o.scale)})${o.notes ? `; note: ${o.notes}` : ''}`;
    });
    const nl = notes.map((n) => `- ${n.title || 'Untitled note'} at (${f3(n.position)})${n.object_id ? ` on ${objs.find((o) => o.id === n.object_id)?.name ?? 'an object'}` : ''}: ${n.body || 'no text'}`);
    pieces.push({
      id: `scene:${sc.id}`, group: '3D scenes', label: `Scene "${sc.name}" (${objs.length} objects, ${notes.length} open notes)`, on: false,
      text: `### Scene: ${sc.name}\nUnits are metres. Y is up.\n${lines.join('\n') || '(no objects yet)'}${nl.length ? `\nOpen notes:\n${nl.join('\n')}` : ''}`,
    });
  }
  for (const g of guidelines) {
    if (!g.include_in_context || !g.body.trim()) continue;
    pieces.push({ id: `guide:${g.id}`, group: 'Art direction and rules', label: g.title || 'Untitled', on: true, text: `### ${g.title || 'Untitled'}\n${g.body.trim()}` });
  }
  if (parent) {
    pieces.push({
      id: 'parent', group: 'Earlier round', label: 'Your last result and feedback', on: true,
      text: `### What you answered last time\n${parent.result.trim() || '(no reply was saved)'}\n\n### Feedback on that answer\n${(parent.feedback || '').trim() || '(none)'}`,
    });
  }
  return pieces;
}

export function buildPrompt({ brief, pieces, off, permission, projectName = 'VY/BIN Studio' }) {
  const on = pieces.filter((p) => !off.has(p.id));
  const pick = (g) => on.filter((p) => p.group === g).map((p) => p.text).join('\n\n');
  const parts = [
    `# Task from the ${projectName} Command Center`,
    `${projectName} is a three.js 3D web world with two characters, Vy and Bin. The owner is a creative director, not a programmer. Explain what you did in plain words.`,
    `Brief ${code(brief.number)}: ${brief.title}\nPriority: ${PRIORITY[brief.priority] ?? brief.priority}${brief.deadline ? `\nDue: ${brief.deadline}` : ''}`,
  ];
  const sec = [pick('The brief'), pick('Earlier round')].filter(Boolean).join('\n\n');
  if (sec) parts.push(`## The task\n${sec}`);
  const sc = pick('3D scenes');
  if (sc) parts.push(`## Scenes involved\n${sc}`);
  const gd = pick('Art direction and rules');
  if (gd) parts.push(`## Art direction and rules\nFollow these. If the task conflicts with them, stop and say so.\n${gd}`);
  parts.push(`## What you may do\n${PERMISSIONS[permission].label}. ${PERMISSIONS[permission].help}\nNever delete or overwrite original files. Save changes as copies or new versions. Never print or store passwords, keys or tokens.`);
  parts.push(`## How to finish\nReply with:\n1. A short summary of what you did or found, in plain words.\n2. The exact files you created or changed (full paths).\n3. Anything the owner should check by eye.\n4. Any question or risk you noticed. If something was unclear, ask instead of guessing.`);
  return parts.join('\n\n');
}

export const roughTokens = (text) => Math.ceil(text.length / 4);
