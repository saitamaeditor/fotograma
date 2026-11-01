// Cuentas de los espectadores: registro libre con correo y contraseña. Cada cuenta guarda
// sus datos privados (mi lista, progreso y plataformas elegidas) para tenerlos igual en la
// web, el móvil y la tele. Las sesiones son tokens firmados que caducan a los 180 días.
import { scrypt, randomBytes, randomUUID, timingSafeEqual, createHmac, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { usuarios, titulos } from './db.js';
import { anotar } from './registro.js';

const cifrar = promisify(scrypt);
const DIAS = 180;
// Si no hay SESSION_SECRET, se deriva de ADMIN_KEY: cambiar cualquiera de las dos cierra todas las sesiones
const SECRETO = process.env.SESSION_SECRET || createHash('sha256').update(`sesiones:${process.env.ADMIN_KEY ?? ''}`).digest('hex');

// Datos que puede guardar cada cuenta: los mismos que la web y la app guardan en el dispositivo
const CLAVE_VALIDA = /^fg-(lista|progreso|plataformas(-[a-z]+)?)$/;
const MAX_DATOS = 256 * 1024;

const error = (status, mensaje) => Object.assign(new Error(mensaje), { status });

async function hashear(contrasena, sal = randomBytes(16).toString('hex')) {
  const hash = (await cifrar(contrasena, sal, 64)).toString('hex');
  return `${sal}:${hash}`;
}

async function coincide(contrasena, guardada) {
  const [sal, hash] = guardada.split(':');
  const nuevo = Buffer.from((await hashear(contrasena, sal)).split(':')[1], 'hex');
  return timingSafeEqual(nuevo, Buffer.from(hash, 'hex'));
}

const firma = (texto) => createHmac('sha256', SECRETO).update(texto).digest('base64url');

// Cada inicio de sesión es un dispositivo: la cuenta guarda la lista para poder verlos y
// cerrar la sesión de cualquiera a distancia. No hay límite de dispositivos.
const MAX_SESIONES = 30;
const ACTIVIDAD_MS = 10 * 60_000; // cada cuánto se apunta la última actividad (evita escribir en cada petición)

function crearToken(u, dispositivo) {
  const sid = randomUUID();
  const ahora = new Date().toISOString();
  const sesiones = [...(u.sesiones ?? []), { id: sid, dispositivo: String(dispositivo || 'Dispositivo').slice(0, 60), creado: ahora, ultimo: ahora }];
  usuarios.actualizar(u.id, { sesiones: sesiones.slice(-MAX_SESIONES) });
  const cuerpo = `${u.id}.${sid}.${Date.now() + DIAS * 864e5}`;
  return `${cuerpo}.${firma(cuerpo)}`;
}

// Devuelve { usuario, sesion } o null. Los tokens antiguos (sin dispositivo) siguen valiendo.
export function deToken(token) {
  const partes = String(token ?? '').split('.');
  const f = partes.pop();
  const cuerpo = partes.join('.');
  if (!f || (partes.length !== 2 && partes.length !== 3)) return null;
  const esperada = Buffer.from(firma(cuerpo));
  const dada = Buffer.from(f);
  if (esperada.length !== dada.length || !timingSafeEqual(esperada, dada)) return null;
  const [id, sid, caduca] = partes.length === 3 ? partes : [partes[0], null, partes[1]];
  if (Number(caduca) < Date.now()) return null;
  const u = usuarios.obtener(id);
  if (!u || u.suspendido) return null;
  if (!sid) return { usuario: u, sesion: null };
  const s = (u.sesiones ?? []).find((x) => x.id === sid);
  if (!s) return null; // sesión cerrada desde otro dispositivo
  if (Date.now() - Date.parse(s.ultimo) > ACTIVIDAD_MS) {
    s.ultimo = new Date().toISOString();
    usuarios.actualizar(u.id, { sesiones: u.sesiones });
  }
  return { usuario: u, sesion: sid };
}

export const sesiones = (u, actual) => (u.sesiones ?? [])
  .map((s) => ({ ...s, actual: s.id === actual }))
  .sort((a, b) => b.ultimo.localeCompare(a.ultimo));

export function cerrarSesion(u, sid) {
  usuarios.actualizar(u.id, { sesiones: (u.sesiones ?? []).filter((s) => s.id !== sid) });
}

export function cerrarOtras(u, actual) {
  usuarios.actualizar(u.id, { sesiones: (u.sesiones ?? []).filter((s) => s.id === actual) });
}

const publico = (u) => ({ id: u.id, email: u.email, nombre: u.nombre, creado: u.creado });
const respuesta = (u, dispositivo) => ({ token: crearToken(u, dispositivo), usuario: publico(u), datos: u.datos ?? {}, ahora: Date.now() });

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

export async function registrar({ email, contrasena, nombre, dispositivo }, ip) {
  frenar(ip);
  email = normalizar(email);
  nombre = String(nombre ?? '').trim().slice(0, 40);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw error(400, 'Escribe un correo válido');
  if (String(contrasena ?? '').length < 6) throw error(400, 'La contraseña debe tener al menos 6 caracteres');
  if (usuarios.porEmail(email)) throw error(409, 'Ya hay una cuenta con ese correo. Inicia sesión.');
  const u = usuarios.crear({ email, nombre: nombre || email.split('@')[0], contrasena: await hashear(contrasena) });
  anotar('usuario', `Nueva cuenta: ${u.nombre} (${u.email})`);
  return respuesta(u, dispositivo);
}

export async function entrar({ email, contrasena, dispositivo }, ip) {
  const fallo = frenar(ip);
  const u = usuarios.porEmail(normalizar(email));
  if (!u || !(await coincide(String(contrasena ?? ''), u.contrasena))) {
    fallo();
    throw error(401, 'Correo o contraseña incorrectos');
  }
  if (u.suspendido) throw error(403, 'Esta cuenta está suspendida. Escríbenos por Telegram si crees que es un error.');
  usuarios.actualizar(u.id, { ultimo: new Date().toISOString() });
  return respuesta(u, dispositivo);
}

// Guarda lo que llega de un dispositivo sin pisar lo que han hecho los demás:
//  - lista: { anadir: [ids], quitar: [ids] }, los cambios hechos en ese dispositivo
//  - fg-progreso: se queda lo más reciente de cada título; lo que el dispositivo ya no tiene
//    solo se borra si es anterior a su última sincronización (`desde`)
//  - el resto de claves (plataformas elegidas): gana la última
export function guardarDatos(u, claves, { lista, desde } = {}) {
  const nuevos = { ...u.datos };
  for (const [k, v] of Object.entries(claves ?? {})) {
    if (!CLAVE_VALIDA.test(k) || k === 'fg-lista') continue;
    if (k === 'fg-progreso' && v && typeof v === 'object') {
      // `s` es la hora del servidor al guardar cada título: no depende del reloj del dispositivo
      const servidor = nuevos[k] ?? {};
      const mezcla = {};
      for (const [id, p] of Object.entries(servidor)) {
        if (id in v || (p.s ?? 0) > (Number(desde) || 0)) mezcla[id] = p;
      }
      for (const [id, p] of Object.entries(v)) {
        const previo = mezcla[id];
        if (!previo || (p.fecha ?? 0) >= (previo.fecha ?? 0)) {
          mezcla[id] = previo && previo.fecha === p.fecha && previo.segundo === p.segundo ? previo : { ...p, s: Date.now() };
        }
      }
      nuevos[k] = mezcla;
    } else if (v === null) delete nuevos[k];
    else nuevos[k] = v;
  }
  // Compatibilidad con versiones antiguas que mandan la lista entera
  if (Array.isArray(claves?.['fg-lista']) && !lista) nuevos['fg-lista'] = claves['fg-lista'];
  if (lista) {
    const actual = (nuevos['fg-lista'] ?? []).filter((id) => !(lista.quitar ?? []).includes(id));
    const nuevosIds = (lista.anadir ?? []).filter((id) => typeof id === 'string' && !actual.includes(id));
    nuevos['fg-lista'] = [...nuevosIds, ...actual];
  }
  if (JSON.stringify(nuevos).length > MAX_DATOS) throw error(413, 'Demasiados datos guardados');
  usuarios.actualizar(u.id, { datos: nuevos, ultimo: new Date().toISOString() });
  return nuevos;
}

export function cambiarNombre(u, { nombre }) {
  nombre = String(nombre ?? '').trim().slice(0, 40);
  if (!nombre) throw error(400, 'Escribe tu nombre');
  usuarios.actualizar(u.id, { nombre });
  return publico(u);
}

// Para el panel: pone una contraseña provisional (fácil de dictar) y la devuelve
export async function restablecer(id) {
  const u = usuarios.obtener(id);
  if (!u) throw error(404, 'No existe ese usuario');
  const letras = 'abcdefghjkmnpqrstuvwxyz23456789';
  const provisional = Array.from(randomBytes(10), (b) => letras[b % letras.length]).join('');
  // Con la contraseña nueva se cierran todas sus sesiones abiertas
  usuarios.actualizar(u.id, { contrasena: await hashear(provisional), sesiones: [] });
  return { email: u.email, provisional };
}

export async function cambiarContrasena(u, { actual, nueva }) {
  if (!(await coincide(String(actual ?? ''), u.contrasena))) throw error(401, 'La contraseña actual no es correcta');
  if (String(nueva ?? '').length < 6) throw error(400, 'La contraseña nueva debe tener al menos 6 caracteres');
  usuarios.actualizar(u.id, { contrasena: await hashear(nueva) });
}

// Suspender impide entrar y cierra todas sus sesiones; reactivar la deja como estaba
export function suspender(id, suspendido) {
  const u = usuarios.obtener(id);
  if (!u) throw error(404, 'No existe ese usuario');
  usuarios.actualizar(id, suspendido ? { suspendido: true, sesiones: [] } : { suspendido: false });
  anotar('usuario', `${suspendido ? 'Cuenta suspendida' : 'Cuenta reactivada'}: ${u.email}`);
  return { ok: true };
}

// Ficha de un usuario para el panel: dispositivos, su lista y lo que está viendo
export function detalle(id) {
  const u = usuarios.obtener(id);
  if (!u) throw error(404, 'No existe ese usuario');
  const nombreDe = (tid) => titulos.obtener(tid)?.titulo ?? '(título borrado)';
  return {
    ...publico(u),
    ultimo: u.ultimo ?? null,
    suspendido: Boolean(u.suspendido),
    sesiones: (u.sesiones ?? []).map(({ dispositivo, creado, ultimo }) => ({ dispositivo, creado, ultimo })),
    lista: (u.datos?.['fg-lista'] ?? []).map((tid) => ({ id: tid, titulo: nombreDe(tid) })),
    viendo: Object.entries(u.datos?.['fg-progreso'] ?? {})
      .sort((a, b) => (b[1].fecha ?? 0) - (a[1].fecha ?? 0))
      .map(([tid, p]) => ({
        id: tid,
        titulo: nombreDe(tid) + (p.t ? ` T${p.t}:E${p.e}` : ''),
        porcentaje: p.duracion ? Math.round((p.segundo / p.duracion) * 100) : null,
        fecha: p.fecha ?? null,
      })),
  };
}

// Resumen para el panel de administración (sin contraseñas ni datos privados)
export const resumen = () => usuarios.todos().map((u) => ({
  ...publico(u),
  creado: u.creado,
  ultimo: u.ultimo ?? null,
  enLista: u.datos?.['fg-lista']?.length ?? 0,
  vistos: Object.keys(u.datos?.['fg-progreso'] ?? {}).length,
  dispositivos: (u.sesiones ?? []).length,
  suspendido: Boolean(u.suspendido),
}));
