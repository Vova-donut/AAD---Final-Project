import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import * as webpush from 'web-push';
// Setup is repeatable: existing secrets and the database are never overwritten.
fs.mkdirSync('.local', { recursive: true });
if (!fs.existsSync('.env')) {
  const keys = webpush.generateVAPIDKeys();
  let env = fs.readFileSync('.env.example', 'utf8');
  for (const [key, value] of Object.entries({
    JWT_SECRET: randomBytes(48).toString('hex'),
    SUBSCRIPTION_KEY: randomBytes(32).toString('hex'),
    VAPID_PUBLIC_KEY: keys.publicKey,
    VAPID_PRIVATE_KEY: keys.privateKey,
  }))
    env = env.replace(`${key}=generated-by-setup`, `${key}=${value}`);
  fs.writeFileSync('.env', env, { mode: 0o600 });
  console.log('Created private .env with JWT, AES and VAPID keys.');
}
if (!fs.existsSync('.local/localhost.pem')) {
  fs.writeFileSync(
    '.local/openssl.cnf',
    '[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=localhost\n[ext]\nsubjectAltName=DNS:localhost,IP:127.0.0.1\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n',
  );
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-nodes',
      '-newkey',
      'rsa:2048',
      '-days',
      '90',
      '-keyout',
      '.local/localhost-key.pem',
      '-out',
      '.local/localhost.pem',
      '-config',
      '.local/openssl.cnf',
    ],
    { stdio: 'ignore' },
  );
  fs.chmodSync('.local/localhost-key.pem', 0o600);
  console.log(
    'Created local HTTPS certificate. Trust this certificate for localhost before testing the PWA.',
  );
}
console.log(
  'Next: npm run db (separate terminal), npm run build, npm start. See docs/Объяснение-проекта.docx.',
);
