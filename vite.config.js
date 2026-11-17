import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
// Development uses the same local certificate as the production-style server.
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'version-service-worker',
      apply: 'build',
      closeBundle() {
        const sw = fs.readFileSync('dist/sw.js', 'utf8');
        fs.writeFileSync(
          'dist/sw.js',
          sw.replace('study-planner-shell-v1', 'study-planner-shell-' + Date.now()),
        );
      },
    },
  ],
  publicDir: 'src/client/public',
  server: {
    https: fs.existsSync('.local/localhost.pem')
      ? {
          key: fs.readFileSync('.local/localhost-key.pem'),
          cert: fs.readFileSync('.local/localhost.pem'),
        }
      : undefined,
    proxy: { '/api': { target: 'https://localhost:3443', secure: false } },
  },
  test: {
    include: ['src/tests/**/*.test.{js,jsx}'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/server/**/*.js', 'src/shared/**/*.js', 'src/client/lib/**/*.js'],
      exclude: ['src/server/index.js'],
    },
  },
});
