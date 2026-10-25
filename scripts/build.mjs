import { cpSync, copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

/**
 * Stage the static preview into a directory.
 * The page is fully self-contained (all assets embedded as data URIs),
 * so these companion files are only for direct-download convenience.
 */
function stage(dir) {
  mkdirSync(dir, { recursive: true });
  copyFileSync('index.html', `${dir}/index.html`);
  copyFileSync('loxiro-plan-preview.zip', `${dir}/loxiro-plan-preview.zip`);
  cpSync('docs', `${dir}/docs`, { recursive: true });
  writeFileSync(
    `${dir}/preview.json`,
    JSON.stringify(
      {
        project: 'Loxiro',
        version: '0.1.0',
        generatedFrom: 'docs/PROJECT_PLAN.md',
        files: ['index.html', 'loxiro-plan-preview.zip', 'docs/'],
      },
      null,
      2,
    ) + '\n',
  );
}

// 1) Local / generic static output (npm run build -> dist/)
rmSync('dist', { recursive: true, force: true });
stage('dist');

// 2) Vercel Build Output API v3 — this is what Vercel actually serves.
rmSync('.vercel/output', { recursive: true, force: true });
mkdirSync('.vercel/output/static', { recursive: true });
stage('.vercel/output/static');
writeFileSync('.vercel/output/config.json', JSON.stringify({ version: 3 }) + '\n');

console.log('Built Loxiro preview -> dist/ and .vercel/output/static/');
