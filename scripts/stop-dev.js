const { execSync } = require('child_process');

const port = Number(process.env.PORT || 4173);

function killWindowsPort(p) {
  let out = '';
  try {
    out = execSync(`netstat -ano | findstr :${p}`, { encoding: 'utf8' });
  } catch {
    return;
  }
  const pids = new Set();
  for (const line of out.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes('LISTENING')) continue;
    const parts = trimmed.split(/\s+/);
    const pid = parts[parts.length - 1];
    if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid);
  }
  for (const pid of pids) {
    try {
      execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
    } catch {
      /* ignore */
    }
  }
}

function killUnixPort(p) {
  try {
    execSync(`lsof -ti :${p} | xargs kill -9 2>/dev/null || true`, {
      stdio: 'ignore',
      shell: true,
    });
  } catch {
    /* ignore */
  }
  if (process.platform === 'linux') {
    try {
      execSync(`fuser -k ${p}/tcp 2>/dev/null || true`, { stdio: 'ignore', shell: true });
    } catch {
      /* ignore */
    }
  }
}

if (process.platform === 'win32') {
  killWindowsPort(port);
} else {
  killUnixPort(port);
}
