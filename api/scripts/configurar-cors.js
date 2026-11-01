// Configura CORS en el bucket de IDrive e2 para que la web pueda subir y reproducir vídeos.
// Uso: npm run cors              (permite cualquier origen)
//      npm run cors -- https://mi-web.com,http://localhost:4000
import { configurado, configurarCors, bucket } from '../src/e2.js';

if (!configurado) {
  console.error('Rellena las variables E2_* del archivo .env antes de ejecutar esto.');
  process.exit(1);
}
const origenes = (process.argv[2] ?? '*').split(',').map((o) => o.trim());
await configurarCors(origenes);
console.log(`CORS configurado en el bucket "${bucket}" para: ${origenes.join(', ')}`);
