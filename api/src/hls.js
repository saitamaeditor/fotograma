// Vídeos cifrados (HLS con AES-128). Cada vídeo está en e2 como _hls/<id>/index.m3u8 y
// sus trozos .ts cifrados; la clave está en la base de datos y nunca en el bucket.
// Para verlo hace falta un «permiso»: un texto firmado que liga usuario y vídeo y caduca.
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import * as e2 from './e2.js';
import { usuarios } from './db.js';

const HORAS = 6; // lo que dura un permiso: da para ver una película entera con pausas
const SECRETO = process.env.SESSION_SECRET || createHash('sha256').update(`hls:${process.env.ADMIN_KEY ?? ''}`).digest('hex');
const firma = (texto) => createHmac('sha256', SECRETO).update(texto).digest('base64url');

export function crearPermiso({ usuario, prefijo }) {
  const cuerpo = Buffer.from(JSON.stringify({ u: usuario, p: prefijo, c: Date.now() + HORAS * 3600e3 })).toString('base64url');
  return `${cuerpo}.${firma(cuerpo)}`;
}

// { usuario, prefijo } o null si es falso, ha caducado o la cuenta ya no puede entrar
export function leerPermiso(tk) {
  const [cuerpo, f] = String(tk ?? '').split('.');
  if (!cuerpo || !f) return null;
  const esperada = Buffer.from(firma(cuerpo));
  const dada = Buffer.from(f);
  if (esperada.length !== dada.length || !timingSafeEqual(esperada, dada)) return null;
  let d;
  try { d = JSON.parse(Buffer.from(cuerpo, 'base64url').toString()); } catch { return null; }
  if (!d.c || d.c < Date.now()) return null;
  const u = usuarios.obtener(d.u);
  if (!u || u.suspendido) return null;
  return { usuario: d.u, prefijo: d.p };
}

// La lista del vídeo, con la clave y los trozos apuntando a este servidor (rutas relativas
// al permiso: «clave» y «s/trozo00001.ts»). Se guarda en memoria porque no cambia.
const cache = new Map();
export async function lista(prefijo) {
  if (!cache.has(prefijo)) {
    const original = await e2.leerTexto(`${prefijo}/index.m3u8`);
    if (!original) throw Object.assign(new Error('Vídeo cifrado no encontrado'), { status: 404 });
    const reescrita = original.split(/\r?\n/).map((linea) => {
      if (linea.startsWith('#EXT-X-KEY')) return linea.replace(/URI="[^"]*"/, 'URI="clave"');
      if (linea && !linea.startsWith('#')) return `s/${linea.trim().split('/').pop()}`;
      return linea;
    }).join('\n');
    cache.set(prefijo, reescrita);
  }
  return cache.get(prefijo);
}

export const olvidarLista = (prefijo) => cache.delete(prefijo);
