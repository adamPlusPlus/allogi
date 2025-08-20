#!/usr/bin/env node
const { spawn, exec } = require('child_process');
const path = require('path');
const { promisify } = require('util');
const readline = require('readline');

const execAsync = promisify(exec);

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

const BASEDIR = __dirname;
const SERVER_DIR = path.join(BASEDIR, 'server');
const VIEWER_DIR = path.join(BASEDIR, 'viewer-app');

const ALLOG_PORT = process.env.ALLOG_PORT || '3002';
const ALLOG_VIEWER_PORT = process.env.ALLOG_VIEWER_PORT || '3001';
const ALLOG_INTERMEDIARY_URL = process.env.ALLOG_INTERMEDIARY_URL || `http://localhost:${ALLOG_PORT}`;

let processes = [];
let rl;

function logHeader(title) {
  console.log(`\n${colors.bright}${colors.blue}========================================${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}   ${title}${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}========================================${colors.reset}\n`);
}

function printUrls() {
  console.log(`${colors.green}📡 Intermediary Server:${colors.reset} http://localhost:${ALLOG_PORT}`);
  console.log(`${colors.green}🎨 Viewer (Webpack Dev):${colors.reset} http://localhost:${ALLOG_VIEWER_PORT}`);
}

async function killByPort(port) {
  try {
    const { stdout } = await execAsync(`netstat -ano | findstr :${port} | findstr LISTENING`);
    const lines = stdout.split('\n').filter(l => l.trim());
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[4];
      if (pid && pid !== '0' && pid !== process.pid.toString()) {
        try { await execAsync(`taskkill /f /pid ${pid}`); } catch {}
      }
    }
  } catch {}
}

async function killAllBash() {
  try {
    const protectedPids = new Set([String(process.pid)]);
    // Honor externally provided protected PIDs (from goi wrapper)
    if (process.env.ALLOGI_PROTECTED_PIDS) {
      for (const pid of process.env.ALLOGI_PROTECTED_PIDS.split(',').map(s => s.trim()).filter(Boolean)) {
        protectedPids.add(pid);
      }
    }
    // Include ancestor PIDs (e.g., the bash.exe that launched this Node process)
    for (const apid of await getAncestorPidsWindows(process.pid, 10)) protectedPids.add(String(apid));

    const { stdout } = await execAsync('tasklist /fi "IMAGENAME eq bash.exe" /fo csv');
    const lines = stdout.split('\n').filter(l => l.includes('bash.exe'));
    for (const line of lines) {
      const parts = line.split(',');
      if (parts.length >= 2) {
        const pid = parts[1].replace(/"/g, '');
        if (pid && pid !== 'PID' && !protectedPids.has(pid)) {
          try { await execAsync(`taskkill /f /pid ${pid}`); } catch {}
        }
      }
    }
  } catch {}
}

async function getAncestorPidsWindows(pid, maxDepth = 10) {
  const ancestors = [];
  let current = pid;
  for (let i = 0; i < maxDepth; i++) {
    try {
      const { stdout } = await execAsync(`wmic process where (ProcessId=${current}) get ParentProcessId /value | findstr ParentProcessId`);
      const line = stdout.trim();
      const match = line.match(/ParentProcessId=(\d+)/i);
      if (!match) break;
      const ppid = Number(match[1]);
      if (!ppid || ppid === current) break;
      ancestors.push(ppid);
      current = ppid;
    } catch {
      break;
    }
  }
  return ancestors;
}

async function stopAll(mode = 'basic') {
  console.log(`${colors.yellow}[allogi] Stopping services (mode=${mode})...${colors.reset}`);
  for (const p of processes) {
    try { p.child.kill('SIGTERM'); } catch {}
  }
  await new Promise(r => setTimeout(r, 800));
  for (const p of processes) {
    try { p.child.kill('SIGKILL'); } catch {}
  }
  await killByPort(ALLOG_VIEWER_PORT);
  await killByPort(ALLOG_PORT);
  if (mode === 'murder') await killAllBash();
  console.log(`${colors.green}[allogi] Services stopped${colors.reset}`);
}

function wireLogs(child, tag, color) {
  child.stdout.on('data', d => {
    const lines = d.toString().split('\n');
    lines.forEach(line => line.trim() && console.log(`${color}[${tag}]${colors.reset} ${line}`));
  });
  child.stderr.on('data', d => {
    const lines = d.toString().split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        // Filter out informational webpack-dev-server messages that aren't actual errors
        const isWebpackInfo = line.includes('[HPM] Proxy created') ||
                             line.includes('Project is running at') ||
                             line.includes('Content not from webpack is served from') ||
                             line.includes('404s will fallback to') ||
                             line.includes('webpack-dev-server') ||
                             line.includes('webpack-dev-middleware') ||
                             line.includes('wait until bundle finished');

        if (isWebpackInfo) {
          // Log as info instead of error
          console.log(`${color}[${tag}]${colors.reset} ${line}`);
        } else {
          // Log as actual error
          console.log(`${colors.red}[${tag}-ERR]${colors.reset} ${line}`);
        }
      }
    });
  });
  child.on('error', err => {
    console.log(`${colors.red}[${tag}-ERR] spawn error: ${err && err.message}${colors.reset}`);
  });
  child.on('exit', code => console.log(`${colors.yellow}[${tag}] exited with code ${code}${colors.reset}`));
}

function spawnWithAutoAnswer(command, args, options, tag, color) {
  const mergedEnv = {
    ...process.env,
    CI: 'true',
    npm_config_yes: 'true',
    YARN_ENABLE_IMMUTABLE_INSTALLS: 'false',
    FORCE_COLOR: '1',
    ...(options && options.env ? options.env : {})
  };
  const child = spawn(command, args, { ...options, env: mergedEnv, stdio: ['pipe', 'pipe', 'pipe'], shell: false });

  // Be conservative to avoid accidentally answering normal output
  const promptPatterns = [
    /press any key to continue/i,
    /terminate batch job/i,
    /(y\s*\/\s*n)/i,
    /are you sure\?\s*\(y\/n\)/i
  ];

  const autoAnswer = (data) => {
    const text = data.toString();
    for (const re of promptPatterns) {
      if (re.test(text)) {
        try { child.stdin.write('y\r'); } catch {}
        break;
      }
    }
  };

  child.stdout.on('data', autoAnswer);
  child.stderr.on('data', autoAnswer);

  if (tag) wireLogs(child, tag, color || colors.cyan);
  return child;
}

function startServer() {
  console.log(`${colors.cyan}[allogi] Starting Intermediary Server on ${ALLOG_PORT}...${colors.reset}`);
  const child = spawnWithAutoAnswer('node', ['intermediary-server.js'], {
    cwd: SERVER_DIR,
    env: { ALLOG_PORT, ALLOG_PERSIST: 'true' }
  }, 'SERVER', colors.cyan);
  processes.push({ key: 'server', child });
}

function startViewer() {
  console.log(`${colors.cyan}[allogi] Starting Viewer on ${ALLOG_VIEWER_PORT}...${colors.reset}`);
  const fs = require('fs');
  const webpackCli = path.join(VIEWER_DIR, 'node_modules', 'webpack-cli', 'bin', 'cli.js');
  let command;
  let args;
  if (fs.existsSync(webpackCli)) {
    // Preferred: node + webpack-cli
    command = process.execPath;
    args = [webpackCli, 'serve', '--mode', 'development', '--port', String(ALLOG_VIEWER_PORT)];
    console.log(`${colors.yellow}[allogi] Viewer using webpack-cli: ${webpackCli}${colors.reset}`);
  } else {
    // Fallback: npm run start in viewer-app
    if (process.platform === 'win32') {
      command = 'cmd.exe';
      args = ['/c', 'npm', 'run', 'start', '--', '--port', String(ALLOG_VIEWER_PORT)];
    } else {
      command = 'npm';
      args = ['run', 'start', '--', '--port', String(ALLOG_VIEWER_PORT)];
    }
    console.log(`${colors.yellow}[allogi] Viewer falling back to: npm run start -- --port ${ALLOG_VIEWER_PORT}${colors.reset}`);
  }
  console.log(`${colors.blue}[allogi] Spawn viewer: cmd=${command} args=${JSON.stringify(args)} cwd=${VIEWER_DIR}${colors.reset}`);
  console.log(`${colors.blue}[allogi] Env: PORT=${ALLOG_VIEWER_PORT} REACT_APP_INTERMEDIARY_URL=${ALLOG_INTERMEDIARY_URL}${colors.reset}`);
  const child = spawnWithAutoAnswer(command, args, {
    cwd: VIEWER_DIR,
    env: { PORT: ALLOG_VIEWER_PORT, REACT_APP_INTERMEDIARY_URL: ALLOG_INTERMEDIARY_URL }
  }, 'VIEW', colors.green);
  processes.push({ key: 'viewer', child });
}

function setupKeys() {
  rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.setPrompt('');
  try { process.stdin.setRawMode(true); } catch {}
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  process.stdin.on('data', async (chunk) => {
    const key = chunk.toString();
    if (key === '\u0003') { // Ctrl+C
      await stopAll();
      process.exit(0);
      return;
    }
    if (key.toLowerCase() === '\u000b') { // Ctrl+K
      console.log(`${colors.red}[allogi] Instant kill triggered${colors.reset}`);
      await stopAll('murder');
      process.exit(0);
      return;
    }

    switch (key.trim()) {
      case 'h':
        logHeader('Commands');
        console.log("u - URLs, w - Open viewer, s - Status, p - Ports, r - Restart, t - Restart server, q - Quit");
        break;
      case 'u':
        logHeader('Service URLs');
        printUrls();
        break;
      case 'w':
        (async () => {
          console.log(`${colors.green}[allogi] Opening viewer in browser...${colors.reset}`);
          try {
            if (process.platform === 'win32') {
              await execAsync('cmd.exe /c start http://localhost:3001');
            } else if (process.platform === 'darwin') {
              await execAsync('open http://localhost:3001');
            } else {
              await execAsync('xdg-open http://localhost:3001');
            }
            console.log(`${colors.green}[allogi] Browser opened to http://localhost:3001${colors.reset}`);
          } catch (error) {
            console.log(`${colors.red}[allogi] Failed to open browser: ${error?.message || error}${colors.reset}`);
            console.log(`${colors.yellow}[allogi] Please manually open: http://localhost:3001${colors.reset}`);
          }
        })();
        break;
      case 's':
        logHeader('Status');
        processes.forEach((p, idx) => console.log(`Process ${idx + 1}: ${p.key}, PID ${p.child.pid}`));
        break;
      case 'p':
        (async () => {
          logHeader('Active Ports (3001-3005)');
          const ports = ['3001','3002','3003','3004','3005'];
          for (const port of ports) {
            try {
              const { stdout } = await execAsync(`netstat -ano | findstr :${port} | findstr LISTENING`);
              if (stdout && stdout.trim()) {
                console.log(`${colors.green}Port ${port}${colors.reset}`);
                console.log(stdout.trim());
              } else {
                console.log(`Port ${port}: (no listeners)`);
              }
            } catch {
              console.log(`Port ${port}: (no listeners)`);
            }
          }
        })();
        break;
      case 'r':
        (async () => {
          console.log(`${colors.yellow}[allogi] Restarting all...${colors.reset}`);
          await stopAll();
          processes = [];
          startServer();
          startViewer();
        })();
        break;
      case 't':
        (async () => {
          console.log(`${colors.yellow}[allogi] Restarting server only...${colors.reset}`);
          await killByPort(ALLOG_PORT);
          const old = processes.find(p => p.key === 'server');
          if (old) { try { old.child.kill('SIGKILL'); } catch (error) {
            console.warn('[allogi] Failed to kill old server process:', error);
          } }
          processes = processes.filter(p => p.key !== 'server');
          startServer();
        })();
        break;
      case 'q':
        await stopAll();
        process.exit(0);
        break;
      default:
        break;
    }
  });

  console.log(`${colors.cyan}[allogi] Interactive: press 'h' for help, 'q' to quit, Ctrl+C to exit${colors.reset}`);
}

async function cmdStart(duration) {
  logHeader('allogi - Start');
  printUrls();
  // Preflight: ensure deps installed for server/viewer if node_modules missing
  try {
    const fs = require('fs');
    if (!fs.existsSync(path.join(SERVER_DIR, 'node_modules'))) {
      console.log(`${colors.yellow}[allogi] Installing server dependencies...${colors.reset}`);
      await execAsync('npm install', { cwd: SERVER_DIR });
    }
    if (!fs.existsSync(path.join(VIEWER_DIR, 'node_modules'))) {
      console.log(`${colors.yellow}[allogi] Installing viewer dependencies...${colors.reset}`);
      await execAsync('npm install', { cwd: VIEWER_DIR });
    }
  } catch (e) {
    console.log(`${colors.red}[allogi] Preflight install failed or skipped: ${e?.message || e}${colors.reset}`);
  }
  // Ensure desired ports are free before starting
  try {
    await killByPort(ALLOG_PORT);
    await killByPort(ALLOG_VIEWER_PORT);
  } catch (error) {
    console.log(`${colors.yellow}[allogi] Port cleanup failed: ${error?.message || error}${colors.reset}`);
  }
  startServer();
  startViewer();
  setupKeys();
  if (duration) {
    console.log(`${colors.yellow}[allogi] Auto-stop after ${duration}s${colors.reset}`);
    setTimeout(async () => { await stopAll(); process.exit(0); }, duration * 1000);
  }
}

async function cmdStop(mode) {
  await stopAll(mode || 'basic');
}

async function cmdStatus() {
  logHeader('Status');
  processes.forEach((p, idx) => console.log(`Process ${idx + 1}: ${p.key}, PID ${p.child.pid}`));
  console.log('(Note: status reflects processes started in this session)');
}

async function cmdPorts() {
  logHeader('Ports');
  try {
    const { stdout } = await execAsync('netstat -an | findstr "LISTENING" | findstr ":300\\|:808"');
    console.log(stdout || 'No matching ports');
  } catch (error) { 
    console.log('No matching ports');
    console.warn('[allogi] Port check failed:', error?.message || error);
  }
}

async function main() {
  const [,, command = 'start', arg1] = process.argv;
  if (command === 'start') {
    const duration = arg1 && !isNaN(Number(arg1)) ? Number(arg1) : null;
    return cmdStart(duration);
  }
  if (command === 'stop') {
    return cmdStop(arg1 && arg1.toLowerCase() === 'murder' ? 'murder' : 'basic');
  }
  if (command === 'status') {
    return cmdStatus();
  }
  if (command === 'ports') {
    return cmdPorts();
  }

  console.log(`Usage: node allogi.js <start [duration]| stop [basic|murder] | status | ports>`);
  process.exit(1);
}

main().catch(async (err) => {
  console.error(`${colors.red}[allogi] Error: ${err.message}${colors.reset}`);
  await stopAll();
  process.exit(1);
});
