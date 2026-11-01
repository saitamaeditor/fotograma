// Comprueba que las credenciales de IDrive e2 funcionan listando el bucket.
import { configurado, listar, bucket } from '../src/e2.js';

if (!configurado) {
  console.error('Rellena las variables E2_* del archivo .env antes de ejecutar esto.');
  process.exit(1);
}
try {
  const objetos = await listar('');
  const total = objetos.reduce((s, o) => s + o.tamano, 0);
  console.log(`Conexión correcta con el bucket "${bucket}": ${objetos.length} objetos, ${(total / 1e9).toFixed(2)} GB`);
} catch (err) {
  console.error(`No se pudo conectar con e2: ${err.message}`);
  process.exit(1);
}
