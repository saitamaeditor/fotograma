// Cliente de la API de MorvehTV. La dirección sale de app.json (extra.apiUrl): https://morvehtv.es
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { alEscribir } from './cuenta';

const base = (Constants.expoConfig?.extra?.apiUrl ?? 'https://morvehtv.es').replace(/\/$/, '');

export const urlApi = () => base;

export async function api(ruta) {
  const r = await fetch(`${base}/api${ruta}`);
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(datos.error ?? `Error ${r.status}`);
  return datos;
}

// Mi lista y progreso: en el dispositivo y, con sesión iniciada, también en la cuenta
async function leer(clave, def) {
  try { return JSON.parse(await AsyncStorage.getItem(clave)) ?? def; } catch { return def; }
}
async function guardar(clave, valor) {
  await AsyncStorage.setItem(clave, JSON.stringify(valor));
  alEscribir(clave, valor);
}

export const miLista = {
  ids: () => leer('fg-lista', []),
  async alternar(id) {
    const ids = await miLista.ids();
    const i = ids.indexOf(id);
    if (i === -1) ids.unshift(id); else ids.splice(i, 1);
    await guardar('fg-lista', ids);
    return i === -1;
  },
};

export const progreso = {
  todo: () => leer('fg-progreso', {}),
  async guardar(id, datos) {
    const p = await progreso.todo();
    p[id] = { ...datos, fecha: Date.now() };
    await guardar('fg-progreso', p);
  },
};

export function siguienteEpisodio(t, temporada, episodio) {
  const lista = (t.temporadas ?? []).flatMap((s) =>
    s.episodios.filter((e) => e.disponible).map((e) => ({ t: s.numero, e: e.numero, ep: e })),
  );
  const i = lista.findIndex((x) => x.t === temporada && x.e === episodio);
  return i === -1 ? lista[0] : lista[i + 1];
}
