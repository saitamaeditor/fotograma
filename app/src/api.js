// Cliente de la API de MorvehTV. La dirección sale de app.json (extra.apiUrl): https://morvehtv.es
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const base = (Constants.expoConfig?.extra?.apiUrl ?? 'https://morvehtv.es').replace(/\/$/, '');

export const urlApi = () => base;

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

// Plataformas (Netflix, Prime Video…) de películas y cadenas originales de series,
// y las que ha elegido el espectador en cada sección
const plataformas = { pelicula: [], serie: [] };
export async function cargarPlataformas(tipo = 'pelicula') {
  plataformas[tipo] = await api(tipo === 'serie' ? '/plataformas?tipo=serie' : '/plataformas');
  return plataformas[tipo];
}
export const infoPlataforma = (id) =>
  [...plataformas.pelicula, ...plataformas.serie].find((p) => p.id === id) ?? { id, nombre: id, color: '#555' };

const claveElegidas = (tipo) => (tipo === 'serie' ? 'fg-plataformas-series' : 'fg-plataformas');
export const misPlataformas = {
  // Sin elección guardada se ven todas
  async obtener(tipo = 'pelicula') {
    const guardadas = await leer(claveElegidas(tipo), null);
    return guardadas ?? plataformas[tipo].map((p) => p.id);
  },
  guardar: (tipo, ids) => AsyncStorage.setItem(claveElegidas(tipo), JSON.stringify(ids)),
};

export function siguienteEpisodio(t, temporada, episodio) {
  const lista = (t.temporadas ?? []).flatMap((s) =>
    s.episodios.filter((e) => e.disponible).map((e) => ({ t: s.numero, e: e.numero, ep: e })),
  );
  const i = lista.findIndex((x) => x.t === temporada && x.e === episodio);
  return i === -1 ? lista[0] : lista[i + 1];
}
