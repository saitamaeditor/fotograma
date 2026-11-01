// Cifra los vídeos del catálogo para que no se puedan descargar tal cual.
// Por cada vídeo enlazado que aún no está cifrado:
//   1. lo descarga de e2 a una carpeta temporal de este PC
//   2. con ffmpeg lo parte en trozos HLS de 6 s cifrados con AES-128 (sin recomprimir si ya
//      es H.264 + AAC, así tarda poco y no pierde calidad)
//   3. sube los trozos a e2 en _hls/<id>/ (la clave NO se sube al bucket)
//   4. manda la clave al servidor (morvehtv.es), que desde ese momento lo sirve cifrado
//
//   node --env-file=.env scripts/cifrar.mjs              cifra todos los pendientes
//   node --env-file=.env scripts/cifrar.mjs --uno        solo el primero (para probar)
//   node --env-file=.env scripts/cifrar.mjs --video="carpeta/archivo.mp4"   solo ese vídeo
//   node --env-file=.env scripts/cifrar.mjs --borrar-original   además borra el MP4 original de e2
//
// Necesita ffmpeg y ffprobe instalados y el .env de la API (claves de e2 y ADMIN_KEY).
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createWriteStream, createReadStream } from 'node:fs';
import { mkdir, readdir, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';

const { E2_ENDPOINT, E2_REGION, E2_BUCKET, E2_ACCESS_KEY_ID, E2_SECRET_ACCESS_KEY, ADMIN_KEY } = process.env;
const WEB = (process.env.WEB ?? 'https://morvehtv.es').replace(/\/$/, '');
const UNO = process.argv.includes('--uno');
const BORRAR = process.argv.includes('--borrar-original');
const SOLO = process.argv.find((a) => a.startsWith('--video='))?.slice(8); // cifrar solo ese vídeo
const SUBIDAS_A_LA_VEZ = 8;

if (!E2_BUCKET || !E2_ACCESS_KEY_ID || !ADMIN_KEY) {
  console.error('Falta el .env de la API (claves de e2 y ADMIN_KEY). Ejecuta desde la carpeta api.');
  process.exit(1);
}
const s3 = new S3Client({
  endpoint: E2_ENDPOINT.startsWith('http') ? E2_ENDPOINT : `https://${E2_ENDPOINT}`,
  region: E2_REGION || 'us-east-1',
  forcePathStyle: true,
  credentials: { accessKeyId: E2_ACCESS_KEY_ID, secretAccessKey: E2_SECRET_ACCESS_KEY },
});

async function admin(ruta, opciones = {}) {
  const r = await fetch(`${WEB}/api/admin${ruta}`, {
    ...opciones,
    headers: { 'x-api-key': ADMIN_KEY, 'Content-Type': 'application/json', ...opciones.headers },
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error ?? `Error ${r.status} en ${ruta}`);
  return d;
}

function ejecutar(programa, args) {
  return new Promise((ok, ko) => {
    const p = spawn(programa, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let salida = '';
    let errores = '';
    p.stdout.on('data', (d) => { salida += d; });
    p.stderr.on('data', (d) => {
      errores += d;
      const t = String(d).match(/time=(\d+:\d+:\d+)/);
      if (t) process.stdout.write(`\r   cifrando… ${t[1]}   `);
    });
    p.on('error', (err) => ko(new Error(`No se pudo ejecutar ${programa}: ${err.message}. ¿Está instalado?`)));
    p.on('close', (codigo) => (codigo === 0 ? ok(salida) : ko(new Error(`${programa} falló:\n${errores.split('\n').slice(-8).join('\n')}`))));
  });
}

async function descargar(key, destino) {
  const r = await s3.send(new GetObjectCommand({ Bucket: E2_BUCKET, Key: key }));
  const total = Number(r.ContentLength) || 0;
  let llevado = 0;
  r.Body.on('data', (trozo) => {
    llevado += trozo.length;
    if (total) process.stdout.write(`\r   descargando… ${Math.round((llevado / total) * 100)}% de ${(total / 1e9).toFixed(2)} GB   `);
  });
  await pipeline(r.Body, createWriteStream(destino));
  process.stdout.write('\n');
}

async function subirCarpeta(carpeta, prefijo) {
  const archivos = (await readdir(carpeta)).filter((f) => f.endsWith('.ts') || f === 'index.m3u8');
  let hechos = 0;
  const cola = [...archivos];
  const subir = async () => {
    for (let f = cola.shift(); f; f = cola.shift()) {
      const ruta = join(carpeta, f);
      for (let intento = 1; ; intento++) {
        try {
          await s3.send(new PutObjectCommand({
            Bucket: E2_BUCKET,
            Key: `${prefijo}/${f}`,
            Body: createReadStream(ruta),
            ContentLength: (await stat(ruta)).size,
            ContentType: f.endsWith('.ts') ? 'video/mp2t' : 'application/vnd.apple.mpegurl',
          }));
          break;
        } catch (err) {
          if (intento >= 4) throw err;
          await new Promise((r) => setTimeout(r, 1500 * intento));
        }
      }
      process.stdout.write(`\r   subiendo… ${++hechos}/${archivos.length} trozos   `);
    }
  };
  await Promise.all(Array.from({ length: SUBIDAS_A_LA_VEZ }, subir));
  process.stdout.write('\n');
}

async function cifrar({ videoKey, titulo }) {
  console.log(`\n▶ ${titulo}\n   ${videoKey}`);
  const id = randomUUID();
  const trabajo = join(tmpdir(), 'morvehtv-cifrar', id);
  const salida = join(trabajo, 'hls');
  await mkdir(salida, { recursive: true });
  try {
    const original = join(trabajo, 'original');
    await descargar(videoKey, original);

    // ¿Se puede copiar tal cual (H.264 + AAC) o hay que recomprimir?
    const info = JSON.parse(await ejecutar('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name', '-of', 'json', original]));
    const video = info.streams.find((s) => s.codec_type === 'video')?.codec_name;
    const audios = info.streams.filter((s) => s.codec_type === 'audio').map((s) => s.codec_name);
    const copiar = video === 'h264' && audios.every((a) => a === 'aac');
    console.log(`   vídeo ${video}, audio ${audios.join(', ') || 'ninguno'} → ${copiar ? 'se copia sin recomprimir' : 'se recomprime a H.264/AAC (tarda más)'}`);

    // Clave AES-128 nueva para este vídeo. La URI «clave» la cambia el servidor por la suya.
    const clave = randomBytes(16);
    const iv = randomBytes(16).toString('hex');
    await writeFile(join(trabajo, 'clave.bin'), clave);
    await writeFile(join(trabajo, 'clave.info'), `clave\n${join(trabajo, 'clave.bin')}\n${iv}\n`);

    await ejecutar('ffmpeg', [
      '-y', '-i', original,
      '-map', '0:v:0', '-map', '0:a?',
      ...(copiar ? ['-c', 'copy'] : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-c:a', 'aac', '-b:a', '192k']),
      '-f', 'hls', '-hls_time', '6', '-hls_playlist_type', 'vod',
      '-hls_key_info_file', join(trabajo, 'clave.info'),
      '-hls_segment_filename', join(salida, 't%05d.ts'),
      join(salida, 'index.m3u8'),
    ]);
    process.stdout.write('\n');

    const prefijo = `_hls/${id}`;
    await subirCarpeta(salida, prefijo);
    const r = await admin('/hls', { method: 'PUT', body: JSON.stringify({ videoKey, prefijo, clave: clave.toString('hex') }) });
    console.log(`   ✓ cifrado (${r.usados} ${r.usados === 1 ? 'título' : 'títulos'} lo usan ya cifrado)`);

    if (BORRAR) {
      await s3.send(new DeleteObjectCommand({ Bucket: E2_BUCKET, Key: videoKey }));
      console.log('   original borrado de e2');
    }
  } finally {
    await rm(trabajo, { recursive: true, force: true });
  }
}

const pendientes = await admin('/hls/pendientes');
if (!pendientes.length) {
  console.log('No hay vídeos pendientes: todo el catálogo ya está cifrado. 🔒');
  process.exit(0);
}
const lista = SOLO ? pendientes.filter((v) => v.videoKey === SOLO) : UNO ? pendientes.slice(0, 1) : pendientes;
console.log(`Vídeos por cifrar: ${pendientes.length}${UNO ? ' (ahora solo el primero)' : ''}`);
let bien = 0;
for (const v of lista) {
  try {
    await cifrar(v);
    bien++;
  } catch (err) {
    console.error(`   ✗ ${err.message}`);
  }
}
console.log(`\nListo: ${bien} de ${lista.length} cifrados.`);
