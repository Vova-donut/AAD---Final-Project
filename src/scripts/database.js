import fs from 'node:fs';
import { spawn } from 'node:child_process';
// Project-local data avoids changing an existing system MongoDB service.
fs.mkdirSync('.local/mongodb', { recursive: true });
const child = spawn(
  'mongod',
  ['--dbpath', '.local/mongodb', '--bind_ip', '127.0.0.1', '--port', '27017'],
  { stdio: 'inherit' },
);
child.on('error', () => {
  console.error(
    'mongod not found. Install MongoDB Community or set MONGODB_URI to your existing local instance.',
  );
  process.exit(1);
});
child.on('exit', (code) => process.exit(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
