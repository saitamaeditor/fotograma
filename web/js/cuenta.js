// Cuenta del espectador. Sin sesión, mi lista, el progreso y las plataformas elegidas se
// guardan solo en este navegador. Con sesión, además se guardan en la cuenta: así son
// privados de cada usuario y se ven igual en la web, el móvil y la tele.
import { api } from './api.js';

const SINCRONIZADAS = /^fg-(lista|progreso|plataformas(-[a-z]+)?)$/;
const ESPERA_MS = 1500; // agrupa cambios seguidos (p. ej. el progreso del vídeo) en un solo envío

let sesion = leerSesion();
let pendientes = {};
let temporizador = null;
const oyentes = new Set();

function leerSesion() {
  try { return JSON.parse(localStorage.getItem('fg-sesion')); } catch { return null; }
}
function guardarSesion(s) {
  sesion = s;
  try { s ? localStorage.setItem('fg-sesion', JSON.stringify(s)) : localStorage.removeItem('fg-sesion'); } catch { /* modo privado */ }
  oyentes.forEach((fn) => fn(usuario()));
}

export const usuario = () => sesion?.usuario ?? null;
export const alCambiar = (fn) => oyentes.add(fn);

const clavesLocales = () => Object.keys(localStorage).filter((k) => SINCRONIZADAS.test(k));
const leerLocal = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const escribirLocal = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* modo privado */ } };

// Une lo que había en el navegador con lo de la cuenta: la lista se suma, del progreso se
// queda lo más reciente y las plataformas elegidas de la cuenta mandan.
function unir(local, cuenta) {
  const datos = { ...cuenta };
  const lista = [...new Set([...(cuenta['fg-lista'] ?? []), ...(local['fg-lista'] ?? [])])];
  if (lista.length) datos['fg-lista'] = lista;
  const progreso = { ...(cuenta['fg-progreso'] ?? {}) };
  for (const [id, p] of Object.entries(local['fg-progreso'] ?? {})) {
    if (!progreso[id] || (p.fecha ?? 0) > (progreso[id].fecha ?? 0)) progreso[id] = p;
  }
  if (Object.keys(progreso).length) datos['fg-progreso'] = progreso;
  for (const [k, v] of Object.entries(local)) if (k.startsWith('fg-plataformas') && !(k in cuenta)) datos[k] = v;
  return datos;
}

async function abrirSesion(r) {
  const local = Object.fromEntries(clavesLocales().map((k) => [k, leerLocal(k)]));
  const datos = unir(local, r.datos ?? {});
  for (const [k, v] of Object.entries(datos)) escribirLocal(k, v);
  guardarSesion({ token: r.token, usuario: r.usuario });
  await api('/cuenta/datos', { metodo: 'PUT', cuerpo: { claves: datos }, token: r.token }).catch(() => {});
}

export async function entrar(email, contrasena) {
  await abrirSesion(await api('/cuenta/entrar', { metodo: 'POST', cuerpo: { email, contrasena } }));
}

export async function entrarGoogle(credencial) {
  await abrirSesion(await api('/cuenta/google', { metodo: 'POST', cuerpo: { credencial } }));
}

// Botón oficial «Continuar con Google» (Google Identity Services) dentro de `contenedor`.
// No pinta nada si el acceso con Google aún no está configurado en el servidor.
let gsi = null;
export async function botonGoogle(contenedor, alEntrar, alFallar) {
  const { google: clientId } = await api('/cuenta/config').catch(() => ({}));
  if (!clientId) return;
  gsi ??= new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = ok;
    s.onerror = ko;
    document.head.append(s);
  });
  await gsi;
  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: async ({ credential }) => {
      try { await entrarGoogle(credential); alEntrar(); } catch (err) { alFallar(err); }
    },
  });
  window.google.accounts.id.renderButton(contenedor, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', width: Math.min(contenedor.clientWidth || 360, 400), locale: 'es' });
  contenedor.hidden = false;
}

export async function registrar(nombre, email, contrasena) {
  await abrirSesion(await api('/cuenta/registro', { metodo: 'POST', cuerpo: { nombre, email, contrasena } }));
}

// Al cerrar sesión se borran del navegador los datos de la cuenta, para que el siguiente
// que use este ordenador no vea la lista ni el progreso de otro
export async function salir() {
  await enviarPendientes();
  for (const k of clavesLocales()) localStorage.removeItem(k);
  guardarSesion(null);
}

export const cambiarContrasena = (actual, nueva) =>
  api('/cuenta/contrasena', { metodo: 'PUT', cuerpo: { actual, nueva }, token: sesion?.token });

// Al abrir la web: trae lo último de la cuenta (por si cambió en el móvil o la tele)
export async function refrescar() {
  if (!sesion) return false;
  try {
    const r = await api('/cuenta', { token: sesion.token });
    for (const [k, v] of Object.entries(r.datos)) escribirLocal(k, v);
    guardarSesion({ ...sesion, usuario: r.usuario });
    return true;
  } catch (err) {
    if (err.status === 401) await salir();
    return false;
  }
}

// La web llama a esto cada vez que guarda algo en el navegador
export function alEscribir(clave, valor) {
  if (!sesion || !SINCRONIZADAS.test(clave)) return;
  pendientes[clave] = valor;
  clearTimeout(temporizador);
  temporizador = setTimeout(enviarPendientes, ESPERA_MS);
}

async function enviarPendientes() {
  clearTimeout(temporizador);
  if (!sesion || !Object.keys(pendientes).length) return;
  const claves = pendientes;
  pendientes = {};
  try {
    await api('/cuenta/datos', { metodo: 'PUT', cuerpo: { claves }, token: sesion.token });
  } catch (err) {
    if (err.status === 401) return salir();
    pendientes = { ...claves, ...pendientes }; // se reintenta con el siguiente cambio
  }
}

// Que no se pierda lo último al cerrar la pestaña
addEventListener('pagehide', () => {
  if (!sesion || !Object.keys(pendientes).length) return;
  fetch(`${window.FOTOGRAMA_API ?? ''}/api/cuenta/datos`, {
    method: 'PUT',
    keepalive: true,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sesion.token}` },
    body: JSON.stringify({ claves: pendientes }),
  });
});
