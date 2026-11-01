// Publica en morvehtv.es al momento: sube los commits a GitHub, ordena a Render que
// despliegue (Deploy Hook guardado en .deploy-hook, que no se sube al repositorio) y
// espera hasta que la web sirve ese commit.
//
//   node scripts/publicar.mjs
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const WEB = process.env.WEB ?? 'https://morvehtv.es';
const raiz = new URL('..', import.meta.url);
const sh = (cmd) => execSync(cmd, { cwd: raiz, encoding: 'utf8' }).trim();

let hook;
try {
  hook = readFileSync(new URL('.deploy-hook', raiz), 'utf8').trim();
} catch {
  console.error('Falta el archivo .deploy-hook con la URL del Deploy Hook de Render.');
  process.exit(1);
}

sh('git push -q');
const commit = sh('git rev-parse --short=7 HEAD');
const r = await fetch(hook, { method: 'POST' });
if (!r.ok) throw new Error(`Render no aceptó el despliegue (${r.status})`);
console.log(`Publicando ${commit} en ${WEB}…`);

const inicio = Date.now();
for (;;) {
  await new Promise((ok) => setTimeout(ok, 10_000));
  const segundos = Math.round((Date.now() - inicio) / 1000);
  try {
    const estado = await (await fetch(`${WEB}/api/estado`, { cache: 'no-store' })).json();
    if (estado.version === commit) {
      console.log(`✓ En línea tras ${segundos} s`);
      break;
    }
  } catch {
    // El servidor se está reiniciando
  }
  if (segundos > 900) {
    console.error('✗ Lleva más de 15 min sin publicarse: mira el panel de Render');
    process.exit(1);
  }
}
