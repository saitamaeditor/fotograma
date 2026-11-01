// Plataformas en las que se agrupan las películas. Cada película guarda los id en
// `plataformas`; si no los tiene, se deducen del nombre de la carpeta de e2 donde está
// el vídeo (p. ej. "01 - PELICULAS NETFLIX/…" → netflix).
export const PLATAFORMAS = [
  { id: 'netflix', nombre: 'Netflix', color: '#e50914', patron: /netflix/i },
  { id: 'prime', nombre: 'Prime Video', color: '#00a8e1', patron: /prime|amazon/i },
  { id: 'disney', nombre: 'Disney+', color: '#113ccf', patron: /disney/i },
  { id: 'hbo', nombre: 'HBO Max', color: '#5822b4', patron: /hbo|\bmax\b/i },
  { id: 'appletv', nombre: 'Apple TV', color: '#a2aaad', patron: /apple/i },
  { id: 'movistar', nombre: 'Movistar Plus+', color: '#00a9e0', patron: /movistar/i },
  { id: 'filmin', nombre: 'Filmin', color: '#f2c94c', patron: /filmin/i },
  { id: 'skyshowtime', nombre: 'SkyShowtime', color: '#4d7cfe', patron: /sky\s*showtime/i },
];

const IDS = new Set(PLATAFORMAS.map((p) => p.id));

export const limpiar = (lista) => [...new Set((lista ?? []).filter((id) => IDS.has(id)))];

// Ids de las plataformas que aparecen en un texto (nombre de carpeta, proveedor de TMDB…)
export function detectar(texto = '') {
  return PLATAFORMAS.filter((p) => p.patron.test(texto)).map((p) => p.id);
}

export function deTitulo(t) {
  if (Array.isArray(t.plataformas)) return limpiar(t.plataformas);
  const carpeta = t.videoKey?.split('/').slice(0, -1).join('/') ?? '';
  return detectar(carpeta);
}
