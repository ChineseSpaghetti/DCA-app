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
