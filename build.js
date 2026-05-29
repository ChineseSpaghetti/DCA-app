import { copyFileSync, mkdirSync } from 'node:fs';

mkdirSync('dist', { recursive: true });
copyFileSync('standalone.html', 'dist/index.html');
copyFileSync('standalone.html', 'dist/standalone.html');
