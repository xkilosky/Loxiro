import { cpSync, copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

// Vercel serves `dist/` (see vercel.json -> outputDirectory).
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });

copyFileSync('index.html', 'dist/index.html');
copyFileSync('loxiro-plan-preview.zip', 'dist/loxiro-plan-preview.zip');
cpSync('docs', 'dist/docs', { recursive: true });

// Small manifest so the deployed build is self-describing.
writeFileSync(
  'dist/preview.json',
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

console.log('Built Loxiro preview into dist/');
