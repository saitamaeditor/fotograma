// Cliente de la API de Fotograma. La URL por defecto sale de app.json (extra.apiUrl) y se
// puede cambiar desde la pantalla Ajustes sin recompilar.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

let base = Constants.expoConfig?.extra?.apiUrl ?? 'http://localhost:4000';

export async function cargarAjustes() {
  const guardada = await AsyncStorage.getItem('fg-api');
  if (guardada) base = guardada;
  return base;
}

export const urlApi = () => base;

export async function cambiarUrlApi(url) {
  base = url.trim().replace(/\/$/, '');
  await AsyncStorage.setItem('fg-api', base);
}

export async function api(ruta) {
  const r = await fetch(`${base}/api${ruta}`);
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(datos.error ?? `Error ${r.status}`);
  return datos;
}

// Mi lista y progreso guardados en el dispositivo
async function leer(clave, def) {
  try { return JSON.parse(await AsyncStorage.getItem(clave)) ?? def; } catch { return def; }
}

export const miLista = {
  ids: () => leer('fg-lista', []),
  async alternar(id) {
    const ids = await miLista.ids();
    const i = ids.indexOf(id);
    if (i === -1) ids.unshift(id); else ids.splice(i, 1);
    await AsyncStorage.setItem('fg-lista', JSON.stringify(ids));
    return i === -1;
  },
};

export const progreso = {
  todo: () => leer('fg-progreso', {}),
  async guardar(id, datos) {
    const p = await progreso.todo();
    p[id] = { ...datos, fecha: Date.now() };
    await AsyncStorage.setItem('fg-progreso', JSON.stringify(p));
  },
};

// Plataformas (Netflix, Prime Video…) y las que ha elegido el espectador
let plataformas = [];
export async function cargarPlataformas() {
  plataformas = await api('/plataformas');
  return plataformas;
}
export const infoPlataforma = (id) => plataformas.find((p) => p.id === id) ?? { id, nombre: id, color: '#555' };

export const misPlataformas = {
  // Sin elección guardada se ven todas
  async obtener() {
    const guardadas = await leer('fg-plataformas', null);
    return guardadas ?? plataformas.map((p) => p.id);
  },
  guardar: (ids) => AsyncStorage.setItem('fg-plataformas', JSON.stringify(ids)),
};

export function siguienteEpisodio(t, temporada, episodio) {
  const lista = (t.temporadas ?? []).flatMap((s) =>
    s.episodios.filter((e) => e.disponible).map((e) => ({ t: s.numero, e: e.numero, ep: e })),
  );
  const i = lista.findIndex((x) => x.t === temporada && x.e === episodio);
  return i === -1 ? lista[0] : lista[i + 1];
}
