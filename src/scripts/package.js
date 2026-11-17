import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
// Stage only portable sources; exclude secrets, dependencies and personal data.
const [studentId, name] = process.argv.slice(2);
if (!studentId || !name || ![studentId, name].every((x) => /^[\p{L}\p{N}_-]+$/u.test(x))) {
  console.error('Usage: npm run package -- StudentID Name (letters, numbers, _ or -)');
  process.exit(1);
}
const stage = path.resolve('.local/submission');
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
for (const entry of [
  'src',
  'postman',
  'docs',
  '.vscode',
  'package.json',
  'package-lock.json',
  '.prettierrc.json',
  'vite.config.js',
  'index.html',
  '.env.example',
  '.gitignore',
  'README.md',
]) {
  if (fs.existsSync(entry)) fs.cpSync(entry, path.join(stage, entry), { recursive: true });
}
fs.mkdirSync('artifacts', { recursive: true });
const zip = path.resolve(`artifacts/${studentId}-${name}.zip`);
if (fs.existsSync(zip)) fs.unlinkSync(zip);
// Python's ZIP writer marks Unicode names correctly on macOS and other platforms.
execFileSync(
  'python3',
  [
    '-c',
    [
      'import pathlib, sys, zipfile',
      'with zipfile.ZipFile(sys.argv[1], "w", zipfile.ZIP_DEFLATED) as archive:',
      '    for file in sorted(pathlib.Path(".").rglob("*")):',
      '        if file.is_file(): archive.write(file, file.as_posix())',
    ].join('\n'),
    zip,
  ],
  { cwd: stage },
);
console.log(
  'Created ' +
    zip +
    ' without .env, TLS keys, MongoDB data or node_modules. Complete the personal coversheet fields and GitHub URL before submission.',
);
