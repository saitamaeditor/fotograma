// Cuenta del espectador en la app. Sin sesión, mi lista, el progreso y las plataformas
// elegidas se guardan solo en el dispositivo. Con sesión, además van a la cuenta: son
// privados de cada usuario y se ven igual en todos sus dispositivos (web, móvil y tele),
// que pueden usarse a la vez sin pisarse los cambios.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';

const BASE = (Constants.expoConfig?.extra?.apiUrl ?? 'https://morvehtv.es').replace(/\/$/, '');

const SINCRONIZADAS = /^fg-(lista|progreso|plataformas(-[a-z]+)?)$/;
const ESPERA_MS = 1500; // agrupa cambios seguidos (p. ej. el progreso del vídeo)
const CADA_MS = 60_000; // con la app abierta, trae cada minuto lo hecho en otros dispositivos

let sesion = null;
// Lo último que se sabe de la cuenta: la lista tal como estaba y cuándo. Con eso se
// calcula qué ha cambiado aquí y se manda solo eso, sin pisar lo de otros dispositivos.
let sinc = { lista: [], desde: 0 };
let lista = []; // la lista de este dispositivo
let pendientes = {};
let listaCambiada = false;
let temporizador = null;
let enCurso = null;
const oyentes = new Set();
const oyentesDatos = new Set();

const DISPOSITIVO = Platform.isTV ? 'App · Android TV' : Platform.OS === 'ios' ? 'App · iPhone' : 'App · Android';

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
function fijarSinc(s) {
  sinc = s;
  AsyncStorage.setItem('fg-sinc', JSON.stringify(s)).catch(() => {});
}

export const usuario = () => sesion?.usuario ?? null;
// El vídeo solo se da con sesión: { tipo: 'hls' | 'mp4', url }
export const pedirVideo = (ruta) => pedir(ruta, { token: sesion?.token });
// Devuelven la función para dejar de escuchar
export const alCambiar = (fn) => { oyentes.add(fn); return () => oyentes.delete(fn); };
// Avisa cuando llegan cambios de otro dispositivo (para recargar la pantalla)
export const alLlegarDatos = (fn) => { oyentesDatos.add(fn); return () => oyentesDatos.delete(fn); };

async function clavesLocales() {
  return (await AsyncStorage.getAllKeys()).filter((k) => SINCRONIZADAS.test(k));
}
async function leerTodas() {
  const pares = await AsyncStorage.multiGet(await clavesLocales());
  return Object.fromEntries(pares.map(([k, v]) => { try { return [k, JSON.parse(v)]; } catch { return [k, null]; } }));
}
const escribirTodas = (datos) => AsyncStorage.multiSet(Object.entries(datos).map(([k, v]) => [k, JSON.stringify(v)]));

// Pone en el dispositivo lo que dice la cuenta y apunta el punto de sincronización
async function aplicar(datos, ahora) {
  const antes = JSON.stringify(await leerTodas());
  const propias = Object.fromEntries(Object.entries(datos).filter(([k]) => SINCRONIZADAS.test(k)));
  await escribirTodas(propias);
  lista = propias['fg-lista'] ?? [];
  fijarSinc({ lista, desde: ahora ?? Date.now() });
  if (JSON.stringify(await leerTodas()) !== antes) oyentesDatos.forEach((fn) => fn());
}

// Al entrar: lo que hubiera en el dispositivo se suma a la cuenta (lista y progreso)
async function abrirSesion(r) {
  const local = await leerTodas();
  fijarSesion({ token: r.token, usuario: r.usuario });
  await aplicar(r.datos ?? {}, r.ahora);
  const anadir = (local['fg-lista'] ?? []).filter((id) => !sinc.lista.includes(id));
  if (anadir.length) {
    lista = [...anadir, ...sinc.lista];
    await AsyncStorage.setItem('fg-lista', JSON.stringify(lista));
    listaCambiada = true;
  }
  for (const [k, v] of Object.entries(local)) {
    if (k === 'fg-progreso') pendientes[k] = { ...(r.datos[k] ?? {}), ...v };
    else if (k.startsWith('fg-plataformas') && !(k in r.datos)) pendientes[k] = v;
  }
  await enviarPendientes();
}

export const entrar = async (email, contrasena) =>
  abrirSesion(await pedir('/cuenta/entrar', { metodo: 'POST', cuerpo: { email, contrasena, dispositivo: DISPOSITIVO } }));

export const registrar = async (nombre, email, contrasena) =>
  abrirSesion(await pedir('/cuenta/registro', { metodo: 'POST', cuerpo: { nombre, email, contrasena, dispositivo: DISPOSITIVO } }));

export async function cambiarNombre(nombre) {
  const r = await pedir('/cuenta/perfil', { metodo: 'PUT', cuerpo: { nombre }, token: sesion?.token });
  fijarSesion({ ...sesion, usuario: r.usuario });
}

export const cambiarContrasena = (actual, nueva) =>
  pedir('/cuenta/contrasena', { metodo: 'PUT', cuerpo: { actual, nueva }, token: sesion?.token });

// Dispositivos con la sesión abierta
export const dispositivos = () => pedir('/cuenta/sesiones', { token: sesion?.token });
export const cerrarDispositivo = (id) => pedir(`/cuenta/sesiones/${id}`, { metodo: 'DELETE', token: sesion?.token });
export const cerrarOtros = () => pedir('/cuenta/sesiones/cerrar-otras', { metodo: 'POST', token: sesion?.token });

// Al cerrar sesión se borran del dispositivo los datos de la cuenta y se quita de su lista
export async function salir({ avisarServidor = true } = {}) {
  await enviarPendientes().catch(() => {});
  if (avisarServidor && sesion?.token) await pedir('/cuenta/sesiones/actual', { metodo: 'DELETE', token: sesion.token }).catch(() => {});
  await AsyncStorage.multiRemove([...(await clavesLocales()), 'fg-sinc']);
  sinc = { lista: [], desde: 0 };
  lista = [];
  pendientes = {};
  listaCambiada = false;
  fijarSesion(null);
}

// Trae lo último de la cuenta; si aquí hay cambios sin mandar, se mandan antes
export async function refrescar() {
  if (!sesion) return;
  try {
    if (listaCambiada || Object.keys(pendientes).length) return await enviarPendientes();
    const r = await pedir('/cuenta', { token: sesion.token });
    fijarSesion({ ...sesion, usuario: r.usuario });
    await aplicar(r.datos, r.ahora);
  } catch (err) {
    if (err.status === 401) await salir({ avisarServidor: false });
  }
}

// Al abrir la app: recupera la sesión y trae lo último de la cuenta
export async function iniciar() {
  try { sesion = JSON.parse(await AsyncStorage.getItem('fg-sesion')); } catch { sesion = null; }
  try { sinc = JSON.parse(await AsyncStorage.getItem('fg-sinc')) ?? sinc; } catch { /* sin sincronizar aún */ }
  try { lista = JSON.parse(await AsyncStorage.getItem('fg-lista')) ?? []; } catch { lista = []; }
  oyentes.forEach((fn) => fn(usuario()));
  await refrescar();
}

// La app llama a esto cada vez que guarda algo en el dispositivo
export function alEscribir(clave, valor) {
  if (!sesion || !SINCRONIZADAS.test(clave)) return;
  if (clave === 'fg-lista') { lista = valor; listaCambiada = true; }
  else pendientes[clave] = valor;
  clearTimeout(temporizador);
  temporizador = setTimeout(enviarPendientes, ESPERA_MS);
}

function enviarPendientes() {
  clearTimeout(temporizador);
  if (enCurso) return enCurso.then(() => enviarPendientes());
  if (!sesion || (!listaCambiada && !Object.keys(pendientes).length)) return Promise.resolve();
  const enviada = lista;
  const cuerpo = {
    claves: pendientes,
    desde: sinc.desde,
    ...(listaCambiada && {
      lista: { anadir: enviada.filter((id) => !sinc.lista.includes(id)), quitar: sinc.lista.filter((id) => !enviada.includes(id)) },
    }),
  };
  pendientes = {};
  listaCambiada = false;
  enCurso = (async () => {
    try {
      const r = await pedir('/cuenta/datos', { metodo: 'PUT', cuerpo, token: sesion.token });
      // Si mientras tanto se tocó la lista aquí, esos cambios se vuelven a poner encima
      const anadidos = lista.filter((id) => !enviada.includes(id));
      const quitados = enviada.filter((id) => !lista.includes(id));
      await aplicar(r.datos, r.ahora);
      if (anadidos.length || quitados.length) {
        lista = [...anadidos, ...(r.datos['fg-lista'] ?? []).filter((id) => !quitados.includes(id) && !anadidos.includes(id))];
        await AsyncStorage.setItem('fg-lista', JSON.stringify(lista));
        listaCambiada = true;
        temporizador = setTimeout(enviarPendientes, ESPERA_MS);
      }
    } catch (err) {
      if (err.status === 401) return salir({ avisarServidor: false });
      pendientes = { ...cuerpo.claves, ...pendientes }; // sin conexión: se reintenta luego
      if (cuerpo.lista) listaCambiada = true;
    } finally {
      enCurso = null;
    }
  })();
  return enCurso;
}

// Al volver a la app y cada minuto mientras está abierta: trae lo de otros dispositivos
AppState.addEventListener('change', (estado) => { if (estado === 'active') refrescar(); });
setInterval(() => { if (AppState.currentState === 'active') refrescar(); }, CADA_MS);
