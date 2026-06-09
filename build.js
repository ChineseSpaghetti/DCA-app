import { copyFileSync, mkdirSync } from 'node:fs';

mkdirSync('dist', { recursive: true });
copyFileSync('standalone.html', 'dist/index.html');
copyFileSync('standalone.html', 'dist/standalone.html');

const lineLoginSource = 'assets/line-login';
const lineLoginDestination = `dist/${lineLoginSource}`;
mkdirSync(lineLoginDestination, { recursive: true });
['btn_login_base.png', 'btn_login_hover.png', 'btn_login_press.png'].forEach((file) => {
  copyFileSync(`${lineLoginSource}/${file}`, `${lineLoginDestination}/${file}`);
});

const logoSource = 'assets/logo';
const logoDestination = `dist/${logoSource}`;
mkdirSync(logoDestination, { recursive: true });
['logo-light-safe.png', 'logo-dark-safe.png'].forEach((file) => {
  copyFileSync(`${logoSource}/${file}`, `${logoDestination}/${file}`);
});
