// Cuenta del espectador. Sin sesión, mi lista, el progreso y las plataformas elegidas se
// guardan solo en este navegador. Con sesión, además se guardan en la cuenta: así son
// privados de cada usuario y se ven igual en todos sus dispositivos (web, móvil y tele),
// que pueden usarse a la vez sin pisarse los cambios.
import { api } from './api.js';

const SINCRONIZADAS = /^fg-(lista|progreso|plataformas(-[a-z]+)?)$/;
const ESPERA_MS = 1500; // agrupa cambios seguidos (p. ej. el progreso del vídeo) en un solo envío
const CADA_MS = 60_000; // con la pestaña a la vista, trae cada minuto lo hecho en otros dispositivos

let sesion = leerLocal('fg-sesion');
// Lo último que se sabe de la cuenta: la lista tal como estaba y cuándo. Con eso se
// calcula qué ha cambiado aquí y se manda solo eso, sin pisar lo hecho en otro dispositivo.
let sinc = leerLocal('fg-sinc') ?? { lista: [], desde: 0 };
let pendientes = {};
let listaCambiada = false;
let temporizador = null;
let enCurso = null;
const oyentes = new Set();
const oyentesDatos = new Set();

function leerLocal(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
function escribirLocal(k, v) {
  try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* modo privado */ }
}

function guardarSesion(s) {
  sesion = s;
  escribirLocal('fg-sesion', s);
  oyentes.forEach((fn) => fn(usuario()));
}
function guardarSinc(s) {
  sinc = s;
  escribirLocal('fg-sinc', s);
}

export const usuario = () => sesion?.usuario ?? null;
export const token = () => sesion?.token ?? null;
export const alCambiar = (fn) => oyentes.add(fn);
// Avisa cuando llegan cambios de otro dispositivo (para repintar la vista)
export const alLlegarDatos = (fn) => oyentesDatos.add(fn);

const clavesLocales = () => Object.keys(localStorage).filter((k) => SINCRONIZADAS.test(k));

// «Chrome en Windows», «Safari en iPhone»… para reconocer el dispositivo en Mi cuenta
function nombreDispositivo() {
  const ua = navigator.userAgent;
  const nav = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  const so = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? (/Mobile/.test(ua) ? 'Android' : 'tablet o TV Android') : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'otro sistema';
  return `Web · ${nav} en ${so}`;
}

// Pone en el navegador lo que dice la cuenta y apunta el punto de sincronización
function aplicar(datos, ahora) {
  const antes = JSON.stringify([leerLocal('fg-lista'), leerLocal('fg-progreso')]);
  for (const [k, v] of Object.entries(datos)) if (SINCRONIZADAS.test(k)) escribirLocal(k, v);
  guardarSinc({ lista: datos['fg-lista'] ?? [], desde: ahora ?? Date.now() });
  if (JSON.stringify([leerLocal('fg-lista'), leerLocal('fg-progreso')]) !== antes) oyentesDatos.forEach((fn) => fn());
}

// Al entrar: lo que hubiera en el navegador se suma a la cuenta (lista y progreso)
async function abrirSesion(r) {
  const local = Object.fromEntries(clavesLocales().map((k) => [k, leerLocal(k)]));
  guardarSesion({ token: r.token, usuario: r.usuario });
  aplicar(r.datos ?? {}, r.ahora);
  // Lo de este navegador que la cuenta no tenía se manda como cambios propios
  const anadir = (local['fg-lista'] ?? []).filter((id) => !sinc.lista.includes(id));
  if (anadir.length) escribirLocal('fg-lista', [...anadir, ...sinc.lista]);
  for (const [k, v] of Object.entries(local)) {
    if (k === 'fg-progreso') pendientes[k] = { ...(r.datos[k] ?? {}), ...v };
    else if (k.startsWith('fg-plataformas') && !(k in r.datos)) pendientes[k] = v;
  }
  listaCambiada = anadir.length > 0;
  await enviarPendientes();
}

export async function entrar(email, contrasena) {
  await abrirSesion(await api('/cuenta/entrar', { metodo: 'POST', cuerpo: { email, contrasena, dispositivo: nombreDispositivo() } }));
}

export async function registrar(nombre, email, contrasena) {
  await abrirSesion(await api('/cuenta/registro', { metodo: 'POST', cuerpo: { nombre, email, contrasena, dispositivo: nombreDispositivo() } }));
}

// Al cerrar sesión se borran del navegador los datos de la cuenta, para que el siguiente
// que use este ordenador no vea la lista ni el progreso de otro. También se quita este
// dispositivo de la lista de la cuenta.
export async function salir({ avisarServidor = true } = {}) {
  await enviarPendientes().catch(() => {});
  if (avisarServidor && sesion?.token) {
    await api('/cuenta/sesiones/actual', { metodo: 'DELETE', token: sesion.token }).catch(() => {});
  }
  for (const k of clavesLocales()) localStorage.removeItem(k);
  escribirLocal('fg-sinc', null);
  sinc = { lista: [], desde: 0 };
  pendientes = {};
  listaCambiada = false;
  guardarSesion(null);
}

export async function cambiarNombre(nombre) {
  const r = await api('/cuenta/perfil', { metodo: 'PUT', cuerpo: { nombre }, token: sesion?.token });
  guardarSesion({ ...sesion, usuario: r.usuario });
}

export const cambiarContrasena = (actual, nueva) =>
  api('/cuenta/contrasena', { metodo: 'PUT', cuerpo: { actual, nueva }, token: sesion?.token });

// Dispositivos con la sesión abierta
export const dispositivos = () => api('/cuenta/sesiones', { token: sesion?.token });
export const cerrarDispositivo = (id) => api(`/cuenta/sesiones/${id}`, { metodo: 'DELETE', token: sesion?.token });
export const cerrarOtros = () => api('/cuenta/sesiones/cerrar-otras', { metodo: 'POST', token: sesion?.token });

// Trae lo último de la cuenta (lo hecho en el móvil o la tele). Si aquí hay cambios sin
// mandar, se mandan antes y la respuesta ya trae lo de todos.
export async function refrescar() {
  if (!sesion) return false;
  try {
    if (listaCambiada || Object.keys(pendientes).length) {
      await enviarPendientes();
    } else {
      const r = await api('/cuenta', { token: sesion.token });
      guardarSesion({ ...sesion, usuario: r.usuario });
      aplicar(r.datos, r.ahora);
    }
    return true;
  } catch (err) {
    if (err.status === 401) await salir({ avisarServidor: false });
    return false;
  }
}

// La web llama a esto cada vez que guarda algo en el navegador
export function alEscribir(clave, valor) {
  if (!sesion || !SINCRONIZADAS.test(clave)) return;
  if (clave === 'fg-lista') listaCambiada = true;
  else pendientes[clave] = valor;
  clearTimeout(temporizador);
  temporizador = setTimeout(enviarPendientes, ESPERA_MS);
}

// Lo cambiado aquí: de la lista, solo lo añadido y quitado desde la última sincronización
function cuerpoPendiente() {
  const lista = leerLocal('fg-lista') ?? [];
  return {
    claves: pendientes,
    desde: sinc.desde,
    ...(listaCambiada && {
      lista: { anadir: lista.filter((id) => !sinc.lista.includes(id)), quitar: sinc.lista.filter((id) => !lista.includes(id)) },
    }),
  };
}

function enviarPendientes() {
  clearTimeout(temporizador);
  if (enCurso) return enCurso.then(() => enviarPendientes());
  if (!sesion || (!listaCambiada && !Object.keys(pendientes).length)) return Promise.resolve();
  const cuerpo = cuerpoPendiente();
  const listaEnviada = leerLocal('fg-lista') ?? [];
  pendientes = {};
  listaCambiada = false;
  enCurso = (async () => {
    try {
      const r = await api('/cuenta/datos', { metodo: 'PUT', cuerpo, token: sesion.token });
      // Si mientras tanto se tocó la lista aquí, esos cambios se vuelven a poner encima
      const ahora = leerLocal('fg-lista') ?? [];
      const anadidos = ahora.filter((id) => !listaEnviada.includes(id));
      const quitados = listaEnviada.filter((id) => !ahora.includes(id));
      aplicar(r.datos, r.ahora);
      if (anadidos.length || quitados.length) {
        escribirLocal('fg-lista', [...anadidos, ...(r.datos['fg-lista'] ?? []).filter((id) => !quitados.includes(id) && !anadidos.includes(id))]);
        listaCambiada = true;
        temporizador = setTimeout(enviarPendientes, ESPERA_MS);
      }
    } catch (err) {
      if (err.status === 401) return salir({ avisarServidor: false });
      // Sin conexión: se reintenta con el siguiente cambio o al volver a la pestaña
      pendientes = { ...cuerpo.claves, ...pendientes };
      if (cuerpo.lista) listaCambiada = true;
    } finally {
      enCurso = null;
    }
  })();
  return enCurso;
}

// Que no se pierda lo último al cerrar la pestaña
addEventListener('pagehide', () => {
  if (!sesion || (!listaCambiada && !Object.keys(pendientes).length)) return;
  fetch(`${window.FOTOGRAMA_API ?? ''}/api/cuenta/datos`, {
    method: 'PUT',
    keepalive: true,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sesion.token}` },
    body: JSON.stringify(cuerpoPendiente()),
  });
});

// Al volver a la pestaña y cada minuto mientras se ve: trae lo hecho en otros dispositivos
document.addEventListener('visibilitychange', () => { if (!document.hidden) refrescar(); });
setInterval(() => { if (!document.hidden) refrescar(); }, CADA_MS);
