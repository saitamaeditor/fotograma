// Metadatos de TMDB: títulos, sinopsis, carteles, temporadas y episodios.
import { detectar } from './plataformas.js';

const { TMDB_KEY = '', TMDB_IDIOMA = 'es-ES', TMDB_REGION = 'ES' } = process.env;
const IMG = 'https://image.tmdb.org/t/p';

export const configurado = Boolean(TMDB_KEY);

async function pedir(ruta, params = {}) {
  if (!TMDB_KEY) {
    const err = new Error('Falta TMDB_KEY en el archivo .env');
    err.status = 503;
    throw err;
  }
  const url = new URL(`https://api.themoviedb.org/3${ruta}`);
  url.searchParams.set('language', TMDB_IDIOMA);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  // Un token v4 es un JWT largo; una clave v3 son 32 caracteres hex.
  const headers = {};
  if (TMDB_KEY.length > 40) headers.Authorization = `Bearer ${TMDB_KEY}`;
  else url.searchParams.set('api_key', TMDB_KEY);

  const r = await fetch(url, { headers });
  if (!r.ok) {
    const err = new Error(`TMDB respondió ${r.status} en ${ruta}`);
    err.status = r.status === 404 ? 404 : 502;
    throw err;
  }
  return r.json();
}

const img = (ruta, tam) => (ruta ? `${IMG}/${tam}${ruta}` : null);

// `anio` (opcional) afina la búsqueda de películas y series
export async function buscar(q, tipo, anio) {
  const ruta = tipo === 'serie' ? '/search/tv' : tipo === 'pelicula' ? '/search/movie' : '/search/multi';
  const filtroAnio = anio && (tipo === 'serie' ? { first_air_date_year: anio } : tipo === 'pelicula' ? { year: anio } : {});
  const { results = [] } = await pedir(ruta, { query: q, include_adult: 'false', ...filtroAnio });
  return results
    .filter((r) => r.media_type !== 'person')
    .map((r) => {
      const esSerie = tipo === 'serie' || r.media_type === 'tv';
      return {
        tmdbId: r.id,
        tipo: esSerie ? 'serie' : 'pelicula',
        titulo: r.title ?? r.name,
        anio: (r.release_date ?? r.first_air_date ?? '').slice(0, 4),
        poster: img(r.poster_path, 'w342'),
      };
    });
}

export async function ficha(tmdbId, tipo) {
  const esSerie = tipo === 'serie';
  const d = await pedir(`/${esSerie ? 'tv' : 'movie'}/${tmdbId}`, { append_to_response: 'videos,credits,watch/providers' });
  const trailer = (d.videos?.results ?? []).find((v) => v.site === 'YouTube' && v.type === 'Trailer');
  // Películas: plataformas de suscripción donde está en España según TMDB (JustWatch).
  // Series: la cadena donde se emitió originalmente; si no se reconoce, también JustWatch.
  const proveedores = (d['watch/providers']?.results?.[TMDB_REGION]?.flatrate ?? []).map((p) => p.provider_name);
  const cadenas = esSerie ? detectar((d.networks ?? []).map((n) => n.name).join(' | '), 'serie') : [];
  const plataformas = cadenas.length ? cadenas : detectar(proveedores.join(' | '), tipo);
  const base = {
    tmdbId: d.id,
    tipo,
    titulo: d.title ?? d.name,
    tituloOriginal: d.original_title ?? d.original_name,
    sinopsis: d.overview,
    anio: (d.release_date ?? d.first_air_date ?? '').slice(0, 4),
    duracion: d.runtime ?? d.episode_run_time?.[0] ?? null,
    generos: (d.genres ?? []).map((g) => g.name),
    valoracion: d.vote_average ? Math.round(d.vote_average * 10) / 10 : null,
    poster: img(d.poster_path, 'w500'),
    fondo: img(d.backdrop_path, 'w1280'),
    reparto: (d.credits?.cast ?? []).slice(0, 8).map((c) => c.name),
    trailer: trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null,
    // Sin datos de TMDB no fijamos nada: así se deducen de la carpeta del vídeo
    ...(plataformas.length && { plataformas }),
  };
  if (!esSerie) return { ...base, videoKey: null };

  const temporadas = [];
  for (const t of d.seasons ?? []) {
    if (t.season_number === 0) continue; // especiales
    const s = await pedir(`/tv/${tmdbId}/season/${t.season_number}`);
    temporadas.push({
      numero: s.season_number,
      nombre: s.name,
      poster: img(s.poster_path, 'w342'),
      episodios: (s.episodes ?? []).map((e) => ({
        numero: e.episode_number,
        titulo: e.name,
        sinopsis: e.overview,
        imagen: img(e.still_path, 'w500'),
        duracion: e.runtime ?? null,
        videoKey: null,
      })),
    });
  }
  return { ...base, temporadas };
}
