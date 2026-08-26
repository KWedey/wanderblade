// Which dev server a QA tool talks to. Reading a measurement off another
// agent's branch has cost this project a round, so every tool resolves the port
// the same way and prints the one it used.
import { execFileSync } from 'node:child_process';

export const DEFAULT_PORT = 5173;

export function resolvePort(argv, env = process.env) {
  const i = argv.indexOf('--port');
  if (i !== -1 && argv[i + 1]) return Number(argv[i + 1]);
  if (env.WB_QA_PORT) return Number(env.WB_QA_PORT);
  return DEFAULT_PORT;
}

/** Vite ports currently listening, so a missed server names its neighbours. */
export function listeningPorts() {
  try {
    const out = execFileSync('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const ports = new Set();
    for (const line of out.split('\n')) {
      const m = /:(\d{4,5})\s+\(LISTEN\)/.exec(line);
      if (m && Number(m[1]) >= 5100 && Number(m[1]) <= 5999) ports.add(Number(m[1]));
    }
    return [...ports].sort((a, b) => a - b);
  } catch {
    return [];
  }
}

export async function requireServer(port) {
  const url = `http://localhost:${port}/`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(String(res.status));
  } catch {
    const others = listeningPorts().filter((p) => p !== port);
    const hint = others.length ? `Listening now: ${others.join(', ')}.` : 'Nothing is listening.';
    console.error(`no dev server on :${port} — start one with 'npm run dev'. ${hint}`);
    process.exit(1);
  }
  return url;
}
