// Cuenta del espectador en la app. Sin sesión, mi lista, el progreso y las plataformas
// elegidas se guardan solo en el dispositivo. Con sesión, además van a la cuenta: son
// privados de cada usuario y se ven igual en la web, el móvil y la tele.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const BASE = (Constants.expoConfig?.extra?.apiUrl ?? 'https://morvehtv.es').replace(/\/$/, '');

const SINCRONIZADAS = /^fg-(lista|progreso|plataformas(-[a-z]+)?)$/;
const ESPERA_MS = 1500; // agrupa cambios seguidos (p. ej. el progreso del vídeo)

let sesion = null;
let pendientes = {};
let temporizador = null;
const oyentes = new Set();

async function pedir(ruta, { metodo = 'GET', cuerpo, token } = {}) {
  const r = await fetch(`${BASE}/api${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: cuerpo && JSON.stringify(cuerpo),
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(datos.error ?? `Error ${r.status}`), { status: r.status });
  return datos;
}

function fijarSesion(s) {
  sesion = s;
  (s ? AsyncStorage.setItem('fg-sesion', JSON.stringify(s)) : AsyncStorage.removeItem('fg-sesion')).catch(() => {});
  oyentes.forEach((fn) => fn(usuario()));
}

export const usuario = () => sesion?.usuario ?? null;
// Devuelve la función para dejar de escuchar
export const alCambiar = (fn) => { oyentes.add(fn); return () => oyentes.delete(fn); };

async function clavesLocales() {
  return (await AsyncStorage.getAllKeys()).filter((k) => SINCRONIZADAS.test(k));
}
async function leerTodas() {
  const pares = await AsyncStorage.multiGet(await clavesLocales());
  return Object.fromEntries(pares.map(([k, v]) => { try { return [k, JSON.parse(v)]; } catch { return [k, null]; } }));
}
const escribirTodas = (datos) => AsyncStorage.multiSet(Object.entries(datos).map(([k, v]) => [k, JSON.stringify(v)]));

// Une lo del dispositivo con lo de la cuenta: la lista se suma, del progreso se queda lo
// más reciente y las plataformas elegidas de la cuenta mandan
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
  const datos = unir(await leerTodas(), r.datos ?? {});
  await escribirTodas(datos);
  fijarSesion({ token: r.token, usuario: r.usuario });
  await pedir('/cuenta/datos', { metodo: 'PUT', cuerpo: { claves: datos }, token: r.token }).catch(() => {});
}

export const entrar = async (email, contrasena) =>
  abrirSesion(await pedir('/cuenta/entrar', { metodo: 'POST', cuerpo: { email, contrasena } }));

export const registrar = async (nombre, email, contrasena) =>
  abrirSesion(await pedir('/cuenta/registro', { metodo: 'POST', cuerpo: { nombre, email, contrasena } }));

// Al cerrar sesión se borran del dispositivo los datos de la cuenta
export async function cambiarNombre(nombre) {
  const r = await pedir('/cuenta/perfil', { metodo: 'PUT', cuerpo: { nombre }, token: sesion?.token });
  fijarSesion({ ...sesion, usuario: r.usuario });
}

export const cambiarContrasena = (actual, nueva) =>
  pedir('/cuenta/contrasena', { metodo: 'PUT', cuerpo: { actual, nueva }, token: sesion?.token });

export async function salir() {
  await enviarPendientes();
  await AsyncStorage.multiRemove(await clavesLocales());
  fijarSesion(null);
}

// Al abrir la app: recupera la sesión y trae lo último de la cuenta
export async function iniciar() {
  try { sesion = JSON.parse(await AsyncStorage.getItem('fg-sesion')); } catch { sesion = null; }
  oyentes.forEach((fn) => fn(usuario()));
  if (!sesion) return;
  try {
    const r = await pedir('/cuenta', { token: sesion.token });
    await escribirTodas(r.datos);
    fijarSesion({ ...sesion, usuario: r.usuario });
  } catch (err) {
    if (err.status === 401) await salir();
  }
}

// La app llama a esto cada vez que guarda algo en el dispositivo
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
    await pedir('/cuenta/datos', { metodo: 'PUT', cuerpo: { claves }, token: sesion.token });
  } catch (err) {
    if (err.status === 401) return salir();
    pendientes = { ...claves, ...pendientes }; // se reintenta con el siguiente cambio
  }
}
