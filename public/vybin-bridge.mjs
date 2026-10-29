// VY/BIN Command Center: helper for your computer
// What it does: waits for requests you send from the Command Center website and runs them with the Claude Code
// that is already installed and signed in on THIS computer. It never asks for, reads or stores your Claude password or token.
// What it can touch: only the project folder you choose below, and only what the permission level of each request allows.
// Needs: Node.js 18 or newer, and Claude Code installed and signed in (open it once and sign in the normal way).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { spawn, spawnSync } from 'node:child_process';

// Public values of your Command Center database. They are not secrets.
const SUPABASE_URL = process.env.VYBIN_TEST_URL || 'https://fywwphdhsytiecrtmemp.supabase.co'; // the override exists only for automated tests
const PUBLIC_KEY = 'sb_publishable_UsigtYh4XA_pwO35PufHvQ_W0IQvdOz';

const CONFIG_DIR = path.join(os.homedir(), '.vybin-bridge');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const POLL_MS = 4000;
const MAX_RUN_MS = 30 * 60 * 1000;
const MAX_EVENTS = 150;
const log = (...a) => console.log(new Date().toLocaleTimeString(), ...a);

async function rpc(fn, args) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: PUBLIC_KEY, authorization: `Bearer ${PUBLIC_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text; try { msg = JSON.parse(text).message ?? text; } catch {}
    const e = new Error(msg); e.status = res.status; throw e;
  }
  return text ? JSON.parse(text) : null;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadConfig() { try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch { return {}; } }
function saveConfig(c) { fs.mkdirSync(CONFIG_DIR, { recursive: true }); fs.writeFileSync(CONFIG_FILE, JSON.stringify(c, null, 2), { mode: 0o600 }); }

// ---- finding Claude Code ----
function findClaude() {
  const finder = process.platform === 'win32' ? 'where' : 'which';
  const r = spawnSync(finder, ['claude'], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  const all = r.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  return all.find((p) => /\.exe$/i.test(p)) ?? all[0];
}
function claudeVersion(bin) {
  const needsShell = /\.(cmd|bat)$/i.test(bin);
  const r = spawnSync(needsShell ? `"${bin}"` : bin, ['--version'], { encoding: 'utf8', shell: needsShell });
  return r.status === 0 ? r.stdout.trim() : null;
}

// Asks Claude Code whether it is signed in. Returns true / false, or null when it can't tell (older versions). Never prints account details.
function claudeSignedIn(bin) {
  const needsShell = /\.(cmd|bat)$/i.test(bin);
  const r = spawnSync(needsShell ? `"${bin}"` : bin, ['auth', 'status'], { encoding: 'utf8', shell: needsShell, timeout: 20000 });
  if (r.error) return null;
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  if (/unknown command|unrecognized|did you mean/i.test(out)) return null;
  if (/"loggedIn"\s*:\s*false|not (logged|signed) in|no (active )?(account|session)/i.test(out)) return false;
  if (r.status === 0) return true;
  return null;
}

// ---- what each permission level allows ----
function claudeArgs(permission) {
  const base = ['-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'dontAsk'];
  const read = ['Read', 'Glob', 'Grep'];
  const edit = ['Edit', 'Write', 'NotebookEdit'];
  const run = ['Bash(npm run *)', 'Bash(npm test*)', 'Bash(npx vite *)', 'Bash(node --check *)', 'Bash(git status*)', 'Bash(git diff*)', 'Bash(git log*)'];
  const allowed = permission === 'edit_and_run' ? [...read, ...edit, ...run] : permission === 'edit_files' ? [...read, ...edit] : read;
  const args = [...base, '--allowedTools', ...allowed];
  if (permission !== 'edit_and_run') args.push('--disallowedTools', 'WebFetch', 'WebSearch', 'Bash');
  return args;
}

function friendly(name, input = {}) {
  const f = (p) => (p ? path.basename(String(p)) : 'a file');
  switch (name) {
    case 'Read': return `Reading ${f(input.file_path)}`;
    case 'Glob': case 'Grep': return 'Searching the project';
    case 'Edit': case 'Write': case 'NotebookEdit': return `Changing ${f(input.file_path ?? input.notebook_path)}`;
    case 'Bash': return `Running a command: ${String(input.command ?? '').slice(0, 90)}`;
    default: return `Using ${name}`;
  }
}

async function runOne(cfg, claudeBin, job) {
  log(`Request received (${job.permission}).`);
  let sent = 0, cancelled = false, finalMsg = null, stderr = '';
  const report = async (kind, text) => {
    if (sent >= MAX_EVENTS && kind !== 'status') return;
    sent++;
    try { const st = await rpc('cc_bridge_event', { p_token: cfg.token, p_run: job.id, p_kind: kind, p_text: text }); if (st !== 'running') cancelled = true; } catch (e) { log('Could not report progress:', e.message); }
  };
  const needsShell = /\.(cmd|bat)$/i.test(claudeBin);
  const args = claudeArgs(job.permission);
  const child = needsShell
    ? spawn(`"${claudeBin}"`, args.map((a) => `"${a}"`), { cwd: cfg.workDir, shell: true })
    : spawn(claudeBin, args, { cwd: cfg.workDir });
  child.stdin.write(job.prompt); child.stdin.end();
  child.on('error', (e) => { stderr += String(e); });
  child.stderr.on('data', (d) => { stderr += d.toString(); });

  const timer = setTimeout(() => { cancelled = true; stderr += '\nStopped after 30 minutes.'; }, MAX_RUN_MS);
  const watch = setInterval(() => { if (cancelled) { try { child.kill(); } catch {} } }, 1500);

  let buf = '';
  let chain = Promise.resolve();
  child.stdout.on('data', (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      let m; try { m = JSON.parse(line); } catch { continue; }
      if (m.type === 'assistant') {
        for (const c of m.message?.content ?? []) if (c.type === 'tool_use') chain = chain.then(() => report('tool', friendly(c.name, c.input)));
      } else if (m.type === 'result') finalMsg = m;
    }
  });
  await new Promise((r) => child.on('close', r));
  clearTimeout(timer); clearInterval(watch);
  await chain;

  if (cancelled && !finalMsg) { log('Stopped (cancelled or timed out).'); try { await rpc('cc_bridge_finish', { p_token: cfg.token, p_run: job.id, p_ok: false, p_result: '', p_error: 'Stopped before it finished.', p_usage: null }); } catch {} return; }
  const ok = !!finalMsg && !finalMsg.is_error && finalMsg.subtype === 'success';
  const text = finalMsg?.result ?? '';
  let error = '';
  if (!ok) {
    const blob = `${text}\n${stderr}`;
    error = /log ?in|authenticat|credential|unauthori[sz]ed/i.test(blob)
      ? 'Claude on this computer is not signed in. Open Claude Code once, sign in the normal way, then send the request again.'
      : "Claude didn't finish this request. Open the details to see what it said.";
  }
  const usage = finalMsg ? { cost_usd_estimate: finalMsg.total_cost_usd ?? null, duration_ms: finalMsg.duration_ms ?? null, turns: finalMsg.num_turns ?? null, note: 'Client-side estimate reported by Claude Code. Not a bill and not a usage limit.' } : null;
  await rpc('cc_bridge_finish', { p_token: cfg.token, p_run: job.id, p_ok: ok, p_result: ok ? text : (text || stderr.slice(-1500)), p_error: error, p_usage: usage });
  log(ok ? 'Finished. Waiting for your review on the website.' : `Did not finish. ${error}`);
}

async function pair(cfg) {
  const info = await rpc('cc_bridge_start_pairing', { p_device: cfg.deviceName });
  console.log('\n==============================================');
  console.log('  Your connection code:  ' + info.code);
  console.log('==============================================');
  console.log('Open the Command Center website, go to "Setup & connections", and type this code under');
  console.log('"Connect Claude on your computer". The code works for 10 minutes.\n');
  for (;;) {
    await sleep(3000);
    const r = await rpc('cc_bridge_poll_pairing', { p_id: info.pairing_id, p_secret: info.secret });
    if (r.status === 'approved') { cfg.token = r.token; saveConfig(cfg); console.log('Connected.\n'); return; }
    if (r.status === 'expired') throw new Error('The code expired. Start this program again to get a new one.');
  }
}

async function main() {
  console.log('VY/BIN Command Center helper\n');
  const claudeBin = findClaude();
  const version = claudeBin && claudeVersion(claudeBin);
  if (!version) {
    console.log('Claude Code was not found on this computer.');
    console.log('Install it from https://claude.com/claude-code, open it once and sign in, then run this again.');
    process.exitCode = 1; return;
  }
  console.log(`Found Claude Code ${version}`);
  const signedIn = claudeSignedIn(claudeBin);
  if (signedIn === false) {
    console.log('\nHeads up: Claude Code on this computer is NOT signed in yet, so requests will fail.');
    console.log('To fix it: close this window, open PowerShell (or Terminal), type   claude   and press Enter, then follow the sign-in steps it shows.');
    console.log('When it says you are signed in, start this helper again. (You can keep going now; the helper will still connect.)\n');
  } else if (signedIn === true) console.log('Claude Code is signed in.');

  const cfg = loadConfig();
  if (!cfg.deviceName) cfg.deviceName = os.hostname();
  if (!cfg.workDir || !fs.existsSync(cfg.workDir)) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log('\nWhich folder holds your VY/BIN project? Claude will be allowed to work ONLY inside this folder.');
    for (;;) {
      const p = (await rl.question('Full folder path: ')).trim().replace(/^"|"$/g, '');
      if (p && fs.existsSync(p) && fs.statSync(p).isDirectory()) { cfg.workDir = path.resolve(p); break; }
      console.log('That folder does not exist. Try again.');
    }
    rl.close();
    saveConfig(cfg);
  }
  console.log(`Project folder: ${cfg.workDir}`);

  if (!cfg.token) await pair(cfg);
  const infoNow = () => ({ claude: version, os: `${os.platform()} ${os.release()}`, folder: path.basename(cfg.workDir), helper: '1' });
  log('Ready. Keep this window open. Send a request from the website with "Send to Claude on my computer".');
  for (;;) {
    try {
      const job = await rpc('cc_bridge_claim_run', { p_token: cfg.token, p_info: infoNow() });
      if (job) await runOne(cfg, claudeBin, job); else await sleep(POLL_MS);
    } catch (e) {
      if (/bad_token/.test(e.message)) {
        console.log('\nThis computer was disconnected from the website. Start this program again to connect it with a new code.');
        delete cfg.token; saveConfig(cfg); process.exitCode = 1; return;
      }
      log('Connection problem, retrying:', e.message);
      await sleep(10000);
    }
  }
}
main().catch((e) => { console.error('\n' + e.message); process.exitCode = 1; });
