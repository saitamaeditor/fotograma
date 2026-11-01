// Plataformas en las que se agrupan películas y series. Cada título guarda los id en
// `plataformas`; si no los tiene, se deducen del nombre de la carpeta de e2 donde está
// el vídeo (p. ej. "01 - PELICULAS NETFLIX/…" → netflix).
// `tipos` dice en qué sección sale cada una: en series son las cadenas originales.
const AMBAS = ['pelicula', 'serie'];
const SERIES = ['serie'];

export const PLATAFORMAS = [
  { id: 'netflix', nombre: 'Netflix', color: '#e50914', tipos: AMBAS, patron: /netflix/i },
  { id: 'prime', nombre: 'Prime Video', color: '#00a8e1', tipos: AMBAS, patron: /prime|amazon/i },
  { id: 'disney', nombre: 'Disney+', color: '#113ccf', tipos: AMBAS, patron: /disney/i },
  { id: 'hbo', nombre: 'HBO Max', color: '#5822b4', tipos: AMBAS, patron: /hbo|\bmax\b/i },
  { id: 'appletv', nombre: 'Apple TV', color: '#a2aaad', tipos: AMBAS, patron: /apple/i },
  { id: 'hulu', nombre: 'Hulu', color: '#1ce783', tipos: SERIES, patron: /hulu/i },
  { id: 'fox', nombre: 'FOX', color: '#2f6fed', tipos: SERIES, patron: /\bfox\b/i },
  { id: 'movistar', nombre: 'Movistar Plus+', color: '#00a9e0', tipos: AMBAS, patron: /movistar/i },
  { id: 'paramount', nombre: 'Paramount+', color: '#0064ff', tipos: SERIES, patron: /paramount|\bcbs\b/i },
  { id: 'amc', nombre: 'AMC', color: '#9a9aa5', tipos: SERIES, patron: /\bamc\b/i },
  { id: 'skyshowtime', nombre: 'SkyShowtime', color: '#4d7cfe', tipos: AMBAS, patron: /sky\s*showtime|\bshowtime\b/i },
  { id: 'filmin', nombre: 'Filmin', color: '#f2c94c', tipos: AMBAS, patron: /filmin/i },
  { id: 'bbc', nombre: 'BBC', color: '#d4d4d4', tipos: SERIES, patron: /\bbbc\b/i },
  { id: 'atresplayer', nombre: 'Atresplayer', color: '#ff6b00', tipos: SERIES, patron: /atres|antena\s*3|la\s*sexta/i },
  { id: 'rtve', nombre: 'RTVE', color: '#e4002b', tipos: SERIES, patron: /rtve|\btve\b|\bla\s*1\b/i },
  { id: 'sky', nombre: 'Sky', color: '#0072c9', tipos: SERIES, patron: /\bsky\b(?!\s*showtime)/i },
];

// En películas se muestran en este orden; en series, en el de la lista de arriba
const ORDEN_PELICULAS = ['netflix', 'prime', 'disney', 'hbo', 'appletv', 'movistar', 'filmin', 'skyshowtime'];

// Categorías de la web y la app. Documentales y docuseries son películas y series con el
// género «Documental»; el anime, las que tienen el género «Anime».
export const CATEGORIAS = ['pelicula', 'serie', 'documental', 'docuserie', 'anime-pelicula', 'anime-serie', 'programa', 'novela-turca'];
export const NOMBRES_CATEGORIA = {
  pelicula: 'Películas', serie: 'Series', documental: 'Documentales', docuserie: 'Docuseries',
  'anime-pelicula': 'Películas anime', 'anime-serie': 'Series anime',
  programa: 'Programas de TV', 'novela-turca': 'Novelas turcas',
};
export const TIPO_BASE = {
  pelicula: 'pelicula', serie: 'serie', documental: 'pelicula', docuserie: 'serie',
  'anime-pelicula': 'pelicula', 'anime-serie': 'serie', programa: 'serie', 'novela-turca': 'serie',
};

// Programas de TV (realities, magacines, concursos…) y novelas turcas llevan su género
// «Programa de TV» / «Novela turca»: lo pone TMDB, la carpeta de e2 o el panel
export const esPrograma = (t) => (t.generos ?? []).some((g) => /^programa de tv$/i.test(g));
export const carpetaPrograma = (key) => /programa/i.test(carpeta(key));
export const conPrograma = (generos = []) => (esPrograma({ generos }) ? generos : ['Programa de TV', ...generos]);
export const esNovelaTurca = (t) => (t.generos ?? []).some((g) => /^novela turca$/i.test(g));
export const carpetaNovelaTurca = (key) => /turc|novela/i.test(carpeta(key));
export const conNovelaTurca = (generos = []) => (esNovelaTurca({ generos }) ? generos : ['Novela turca', ...generos]);

// Pone el género que indica la carpeta del vídeo («DOCUMENTALES», «ANIME», «PROGRAMAS DE TV»,
// «NOVELAS TURCAS»…). Devuelve los géneros nuevos o null si no cambia nada.
export function generosPorCarpeta(t, key) {
  let g = t.generos ?? [];
  if (carpetaPrograma(key) && !esPrograma({ generos: g })) g = conPrograma(g);
  else if (carpetaNovelaTurca(key) && !esNovelaTurca({ generos: g })) g = conNovelaTurca(g);
  else if (carpetaAnime(key) && !esAnime({ generos: g })) g = conAnime(g);
  else if (carpetaDocumental(key) && !esDocumental({ generos: g })) g = conDocumental(g);
  return g === (t.generos ?? []) ? null : g;
}
export const esAnime = (t) => (t.generos ?? []).some((g) => /^anime$/i.test(g));
// Un vídeo en una carpeta con «anime» en el nombre («07 - ANIME», «08 - SERIES ANIME») es anime
export const carpetaAnime = (key) => /anime/i.test(carpeta(key));
export const conAnime = (generos = []) => (esAnime({ generos }) ? generos : ['Anime', ...generos]);
export const esDocumental = (t) => (t.generos ?? []).some((g) => /documental|documentary/i.test(g));
// Un vídeo en una carpeta como «05 - DOCUMENTALES» o «06 - DOCUSERIES» es documental aunque
// TMDB no le ponga ese género (a muchos documentales no les pone ninguno)
export const carpetaDocumental = (key) => /docu/i.test(carpeta(key));
export const conDocumental = (generos = []) => (esDocumental({ generos }) ? generos : ['Documental', ...generos]);
export function categoriaDe(t) {
  const serie = t.tipo === 'serie';
  if (esPrograma(t)) return 'programa';
  if (esNovelaTurca(t)) return 'novela-turca';
  if (esAnime(t)) return serie ? 'anime-serie' : 'anime-pelicula';
  if (esDocumental(t)) return serie ? 'docuserie' : 'documental';
  return t.tipo;
}

export function deTipo(tipo) {
  if (tipo === 'pelicula') return ORDEN_PELICULAS.map((id) => PLATAFORMAS.find((p) => p.id === id));
  return tipo ? PLATAFORMAS.filter((p) => p.tipos.includes(tipo)) : PLATAFORMAS;
}

const IDS = new Set(PLATAFORMAS.map((p) => p.id));

export const limpiar = (lista) => [...new Set((lista ?? []).filter((id) => IDS.has(id)))];

// Ids de las plataformas que aparecen en un texto (nombre de carpeta, cadena de TMDB…)
export function detectar(texto = '', tipo) {
  return deTipo(tipo).filter((p) => p.patron.test(texto)).map((p) => p.id);
}

export const carpeta = (key) => key?.split('/').slice(0, -1).join('/') ?? '';

export function deTitulo(t) {
  if (Array.isArray(t.plataformas)) return limpiar(t.plataformas);
  if (t.tipo === 'serie') {
    const keys = (t.temporadas ?? []).flatMap((s) => s.episodios.map((e) => e.videoKey)).filter(Boolean);
    return detectar(keys.map(carpeta).join(' | '), 'serie');
  }
  return detectar(carpeta(t.videoKey), 'pelicula');
}
