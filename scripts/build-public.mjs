import { cpSync, mkdirSync, rmSync } from 'node:fs';

const publicDir = new URL('../public/', import.meta.url);
rmSync(publicDir, { recursive: true, force: true });
mkdirSync(publicDir, { recursive: true });

for (const file of ['index.html', 'app.js', 'styles.css', 'hero-training.png']) {
  cpSync(new URL(`../${file}`, import.meta.url), new URL(file, publicDir));
}
cpSync(new URL('../assets', import.meta.url), new URL('assets', publicDir), { recursive: true });

console.log('Public files prepared for Vercel.');
