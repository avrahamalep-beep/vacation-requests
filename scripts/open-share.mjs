/**
 * Copia al portapapeles la URL a compartir y abre el navegador.
 * Carga .env de la raíz: VITE_PUBLIC_APP_URL = https://xxx.onrender.com
 */
import { execFile, execFileSync } from 'node:child_process';
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
config({ path: path.join(root, '.env') });

const localUrl = 'http://127.0.0.1:5173';
const fromEnv = (process.env.VITE_PUBLIC_APP_URL || '').trim().replace(/\/$/, '');

function copyToClipboard(text) {
  try {
    if (process.platform === 'win32') {
      execFileSync('clip', { input: text, stdio: ['pipe', 'pipe', 'inherit'] });
    } else if (process.platform === 'darwin') {
      execFileSync('pbcopy', { input: text });
    } else {
      try {
        execFileSync('xclip', ['-selection', 'clipboard'], { input: text });
      } catch {
        /* xclip not installed */
      }
    }
  } catch (e) {
    console.warn('(Could not copy to clipboard)', e?.message || e);
  }
}

function openUrl(url) {
  if (process.platform === 'win32') {
    execFile('cmd', ['/c', 'start', '', url], () => {});
  } else if (process.platform === 'darwin') {
    execFile('open', [url], () => {});
  } else {
    execFile('xdg-open', [url], () => {});
  }
}

if (fromEnv) {
  copyToClipboard(fromEnv);
  console.log('Public URL to share (copied to clipboard):');
  console.log(fromEnv);
  openUrl(fromEnv);
} else {
  copyToClipboard(localUrl);
  console.log('No VITE_PUBLIC_APP_URL in .env — copied local URL (this PC / same network only):');
  console.log(localUrl);
  console.log('\nAdd to .env, e.g.:');
  console.log('VITE_PUBLIC_APP_URL=https://your-app.onrender.com');
  console.log('Then: npm run share');
  openUrl(localUrl);
}
