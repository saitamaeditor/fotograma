// Cuentas de los espectadores: registro libre con correo y contraseña. Cada cuenta guarda
// sus datos privados (mi lista, progreso y plataformas elegidas) para tenerlos igual en la
// web, el móvil y la tele. Las sesiones son tokens firmados que caducan a los 180 días.
import { scrypt, randomBytes, randomUUID, timingSafeEqual, createHmac, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { usuarios } from './db.js';

const cifrar = promisify(scrypt);
const DIAS = 180;
// Si no hay SESSION_SECRET, se deriva de ADMIN_KEY: cambiar cualquiera de las dos cierra todas las sesiones
const SECRETO = process.env.SESSION_SECRET || createHash('sha256').update(`sesiones:${process.env.ADMIN_KEY ?? ''}`).digest('hex');

// Datos que puede guardar cada cuenta: los mismos que la web y la app guardan en el dispositivo
const CLAVE_VALIDA = /^fg-(lista|progreso|plataformas(-[a-z]+)?)$/;
const MAX_DATOS = 256 * 1024;

// «Continuar con Google»: ID de cliente web de Google Cloud (es público, no es una clave).
// Se puede cambiar sin tocar el código con la variable GOOGLE_CLIENT_ID.
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';

const error = (status, mensaje) => Object.assign(new Error(mensaje), { status });

async function hashear(contrasena, sal = randomBytes(16).toString('hex')) {
  const hash = (await cifrar(contrasena, sal, 64)).toString('hex');
  return `${sal}:${hash}`;
}

async function coincide(contrasena, guardada) {
  if (!guardada) return false; // cuenta creada con Google, sin contraseña
  const [sal, hash] = guardada.split(':');
  const nuevo = Buffer.from((await hashear(contrasena, sal)).split(':')[1], 'hex');
  return timingSafeEqual(nuevo, Buffer.from(hash, 'hex'));
}

const firma = (texto) => createHmac('sha256', SECRETO).update(texto).digest('base64url');

function crearToken(u) {
  const cuerpo = `${u.id}.${Date.now() + DIAS * 864e5}`;
  return `${cuerpo}.${firma(cuerpo)}`;
}

export function deToken(token) {
  const [id, caduca, f] = String(token ?? '').split('.');
  if (!id || !caduca || !f) return null;
  const esperada = Buffer.from(firma(`${id}.${caduca}`));
  const dada = Buffer.from(f);
  if (esperada.length !== dada.length || !timingSafeEqual(esperada, dada)) return null;
  if (Number(caduca) < Date.now()) return null;
  return usuarios.obtener(id) ?? null;
}

const publico = (u) => ({ id: u.id, email: u.email, nombre: u.nombre });
const respuesta = (u) => ({ token: crearToken(u), usuario: publico(u), datos: u.datos ?? {} });

// Freno sencillo contra quien prueba contraseñas: 10 intentos fallidos cada 15 min por IP
const intentos = new Map();
function frenar(ip) {
  const ahora = Date.now();
  const lista = (intentos.get(ip) ?? []).filter((t) => ahora - t < 15 * 60_000);
  intentos.set(ip, lista);
  if (lista.length >= 10) throw error(429, 'Demasiados intentos. Espera unos minutos y vuelve a probar.');
  return () => lista.push(ahora);
}

const normalizar = (email) => String(email ?? '').trim().toLowerCase();

export async function registrar({ email, contrasena, nombre }, ip) {
  frenar(ip);
  email = normalizar(email);
  nombre = String(nombre ?? '').trim().slice(0, 40);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw error(400, 'Escribe un correo válido');
  if (String(contrasena ?? '').length < 6) throw error(400, 'La contraseña debe tener al menos 6 caracteres');
  if (usuarios.porEmail(email)) throw error(409, 'Ya hay una cuenta con ese correo. Inicia sesión.');
  const u = usuarios.crear({ email, nombre: nombre || email.split('@')[0], contrasena: await hashear(contrasena) });
  return respuesta(u);
}

export async function entrar({ email, contrasena }, ip) {
  const fallo = frenar(ip);
  const u = usuarios.porEmail(normalizar(email));
  if (u && !u.contrasena) {
    fallo();
    throw error(401, 'Esta cuenta se creó con Google: pulsa «Continuar con Google»');
  }
  if (!u || !(await coincide(String(contrasena ?? ''), u.contrasena))) {
    fallo();
    throw error(401, 'Correo o contraseña incorrectos');
  }
  usuarios.actualizar(u.id, { ultimo: new Date().toISOString() });
  return respuesta(u);
}

// Guarda solo las claves que llegan (las demás se quedan como estaban)
export function guardarDatos(u, claves) {
  const nuevos = { ...u.datos };
  for (const [k, v] of Object.entries(claves ?? {})) {
    if (!CLAVE_VALIDA.test(k)) continue;
    if (v === null) delete nuevos[k]; else nuevos[k] = v;
  }
  if (JSON.stringify(nuevos).length > MAX_DATOS) throw error(413, 'Demasiados datos guardados');
  usuarios.actualizar(u.id, { datos: nuevos, ultimo: new Date().toISOString() });
  return nuevos;
}

export async function cambiarContrasena(u, { actual, nueva }) {
  // Las cuentas de Google pueden ponerse una contraseña sin dar la actual (no tienen)
  if (u.contrasena && !(await coincide(String(actual ?? ''), u.contrasena))) throw error(401, 'La contraseña actual no es correcta');
  if (String(nueva ?? '').length < 6) throw error(400, 'La contraseña nueva debe tener al menos 6 caracteres');
  usuarios.actualizar(u.id, { contrasena: await hashear(nueva) });
}

// ---------- Google ----------
// Comprueba con Google que el token es auténtico, es para MorvehTV y el correo está verificado
async function verificarGoogle(credencial) {
  if (!GOOGLE_CLIENT_ID) throw error(503, 'El acceso con Google aún no está configurado');
  const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(String(credencial ?? ''))}`);
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.aud !== GOOGLE_CLIENT_ID || !['accounts.google.com', 'https://accounts.google.com'].includes(d.iss)) {
    throw error(401, 'No se pudo comprobar tu cuenta de Google. Vuelve a intentarlo.');
  }
  if (d.email_verified !== 'true' && d.email_verified !== true) throw error(401, 'Tu correo de Google no está verificado');
  return { googleId: d.sub, email: normalizar(d.email), nombre: d.given_name || d.name || d.email.split('@')[0] };
}

// Entra con Google: si ya hay una cuenta con ese correo se une a ella; si no, se crea
export async function entrarGoogle({ credencial }, ip) {
  frenar(ip);
  const g = await verificarGoogle(credencial);
  let u = usuarios.todos().find((x) => x.googleId === g.googleId) ?? usuarios.porEmail(g.email);
  if (u) usuarios.actualizar(u.id, { googleId: g.googleId, ultimo: new Date().toISOString() });
  else u = usuarios.crear({ email: g.email, nombre: g.nombre.slice(0, 40), contrasena: null, googleId: g.googleId });
  return respuesta(u);
}

// La app entra con Google a través del navegador. Para que nadie pueda robar la sesión por
// el camino, la web solo devuelve a la app un código de un solo uso que caduca en 2 minutos
// y que únicamente sirve a quien tenga el «verificador» secreto que generó la app (PKCE).
const codigos = new Map();
const sha256 = (texto) => createHash('sha256').update(texto).digest('base64url');

export async function codigoParaApp({ credencial, reto }, ip) {
  if (!/^[\w-]{43}$/.test(String(reto ?? ''))) throw error(400, 'Falta el reto de la app');
  const sesion = await entrarGoogle({ credencial }, ip);
  const codigo = randomUUID();
  codigos.set(codigo, { sesion, reto, caduca: Date.now() + 120_000 });
  return { codigo };
}

export function canjearCodigo({ codigo, verificador }) {
  const c = codigos.get(String(codigo ?? ''));
  codigos.delete(String(codigo ?? ''));
  if (!c || c.caduca < Date.now() || sha256(String(verificador ?? '')) !== c.reto) {
    throw error(401, 'El inicio de sesión con Google ha caducado. Vuelve a intentarlo.');
  }
  return c.sesion;
}

// Resumen para el panel de administración (sin contraseñas ni datos privados)
export const resumen = () => usuarios.todos().map((u) => ({
  ...publico(u),
  creado: u.creado,
  ultimo: u.ultimo ?? null,
  google: Boolean(u.googleId),
  enLista: u.datos?.['fg-lista']?.length ?? 0,
  vistos: Object.keys(u.datos?.['fg-progreso'] ?? {}).length,
}));
