import { spawn } from 'node:child_process';
const children = [
  spawn(process.execPath, ['--watch', '--env-file-if-exists=.env', 'backend/src/index.js'], {
    stdio: 'inherit',
    env: { ...process.env, APP_ORIGIN: 'http://localhost:5173' },
  }),
  spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', '--config', 'frontend/vite.config.js'],
    { stdio: 'inherit' },
  ),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
for (const child of children) {
  child.on('error', () => stop(1));
  child.on('exit', (code) => stop(code || 0));
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
