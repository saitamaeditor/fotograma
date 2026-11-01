// Cliente de IDrive e2. e2 habla el protocolo S3, así que usamos el SDK oficial de AWS
// apuntando a su endpoint.
import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutBucketCorsCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const {
  E2_ENDPOINT,
  E2_REGION = 'us-east-1',
  E2_BUCKET,
  E2_ACCESS_KEY_ID,
  E2_SECRET_ACCESS_KEY,
  E2_URL_MINUTOS = '240',
  E2_CARPETAS = '',
  E2_CARPETA_SUBIDAS = 'videos',
} = process.env;

// Carpetas del bucket donde buscar vídeos (vacío = todo el bucket) y carpeta donde
// caen las subidas hechas desde el panel.
const carpetas = E2_CARPETAS.split(',').map((c) => c.trim().replace(/^\/+/, '')).filter(Boolean);
const carpetaSubidas = E2_CARPETA_SUBIDAS.replace(/^\/+|\/+$/g, '');

export const esVideo = (key) => /\.(mp4|m4v|mov|mkv|webm|avi|ts)$/i.test(key);

export const bucket = E2_BUCKET;
export const configurado = Boolean(E2_ENDPOINT && E2_BUCKET && E2_ACCESS_KEY_ID && E2_SECRET_ACCESS_KEY);

// Tamaño de cada trozo de una subida multiparte. S3 pide un mínimo de 5 MB y un máximo de
// 10.000 partes, así que 64 MB permite archivos de hasta ~640 GB.
export const TAM_PARTE = 64 * 1024 * 1024;

const s3 = configurado
  ? new S3Client({
      endpoint: /^https?:\/\//.test(E2_ENDPOINT) ? E2_ENDPOINT : `https://${E2_ENDPOINT}`,
      region: E2_REGION,
      forcePathStyle: true,
      credentials: { accessKeyId: E2_ACCESS_KEY_ID, secretAccessKey: E2_SECRET_ACCESS_KEY },
    })
  : null;

function cliente() {
  if (!s3) {
    const err = new Error('IDrive e2 no está configurado. Rellena las variables E2_* del archivo .env');
    err.status = 503;
    throw err;
  }
  return s3;
}

const segundos = (min) => Math.round(Number(min) * 60);

export function claveSegura(nombre) {
  const limpio = nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(-120);
  return `${carpetaSubidas}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID().slice(0, 8)}-${limpio}`;
}

export async function iniciarSubida({ nombre, tipo, tamano }) {
  const key = claveSegura(nombre);
  const { UploadId } = await cliente().send(
    new CreateMultipartUploadCommand({ Bucket: bucket, Key: key, ContentType: tipo || 'video/mp4' }),
  );
  const partes = Math.max(1, Math.ceil(Number(tamano) / TAM_PARTE));
  const urls = await Promise.all(
    Array.from({ length: partes }, (_, i) =>
      getSignedUrl(
        s3,
        new UploadPartCommand({ Bucket: bucket, Key: key, UploadId, PartNumber: i + 1 }),
        { expiresIn: 6 * 3600 },
      ),
    ),
  );
  return { key, uploadId: UploadId, tamParte: TAM_PARTE, urls };
}

export async function completarSubida({ key, uploadId, partes }) {
  const ordenadas = [...partes].sort((a, b) => a.PartNumber - b.PartNumber);
  await cliente().send(
    new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: ordenadas },
    }),
  );
  return { key };
}

export function abortarSubida({ key, uploadId }) {
  return cliente().send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: uploadId }));
}

// Enlace firmado de muy corta duración (para cada trozo cifrado del vídeo)
export function urlCorta(key, segundos_ = 120) {
  return getSignedUrl(cliente(), new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: segundos_ });
}

export function urlReproduccion(key) {
  return getSignedUrl(cliente(), new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: segundos(E2_URL_MINUTOS),
  });
}

export async function existe(key) {
  try {
    await cliente().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

// Archivos de texto pequeños (copia del catálogo). Devuelve null si no existe.
export async function leerTexto(key) {
  try {
    const r = await cliente().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return await r.Body.transformToString('utf-8');
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

export function guardarTexto(key, texto) {
  return cliente().send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: texto, ContentType: 'application/json; charset=utf-8' }),
  );
}

export function borrar(key) {
  return cliente().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

// Todos los vídeos de las carpetas configuradas (y de la carpeta de subidas)
// Carpetas de primer nivel del bucket, sin las internas que empiezan por «_» (_hls con los
// trozos cifrados, _fotograma con el catálogo): ni son vídeos nuevos ni hace falta recorrerlas
async function carpetasRaiz() {
  const r = await cliente().send(new ListObjectsV2Command({ Bucket: bucket, Delimiter: '/' }));
  return (r.CommonPrefixes ?? []).map((p) => p.Prefix).filter((p) => !p.startsWith('_'));
}

export async function listarVideos() {
  const prefijos = carpetas.length ? [...new Set([...carpetas, `${carpetaSubidas}/`])] : await carpetasRaiz();
  const listas = await Promise.all(prefijos.map((p) => listar(p)));
  const vistos = new Map();
  for (const o of listas.flat()) if (esVideo(o.key)) vistos.set(o.key, o);
  return [...vistos.values()].sort((a, b) => a.key.localeCompare(b.key, 'es', { numeric: true }));
}

export async function listar(prefijo = '') {
  const objetos = [];
  let token;
  do {
    const r = await cliente().send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefijo, ContinuationToken: token }),
    );
    for (const o of r.Contents ?? []) objetos.push({ key: o.Key, tamano: o.Size, fecha: o.LastModified });
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return objetos;
}

// El navegador sube los trozos directamente a e2, así que el bucket tiene que aceptar
// peticiones de otros orígenes y dejar leer la cabecera ETag de cada parte.
export function configurarCors(origenes = ['*']) {
  return cliente().send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: origenes,
            AllowedMethods: ['GET', 'HEAD', 'PUT'],
            AllowedHeaders: ['*'],
            ExposeHeaders: ['ETag', 'Content-Length', 'Content-Range', 'Accept-Ranges'],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  );
}
