// Importa solo los vídeos nuevos que aparecen en el bucket de e2: saca el título del nombre
// del archivo, lo busca en TMDB, crea la ficha y le enlaza el vídeo. La plataforma sale de
// la carpeta (p. ej. "02 - PELICULAS PRIME VIDEO/…" → Prime Video).
//
// Nombres que entiende:
//   Películas: «Título (2024).mp4», «Título.2024.1080p.mp4», «Título.mp4»
//   Series (carpeta con «serie» en el nombre o archivo con SxxExx):
//     «SERIES NETFLIX/Stranger Things/Stranger Things S01E02.mp4»
//     «SERIES NETFLIX/Stranger Things/Temporada 1/02.mp4», «… 1x02.mp4», «… T1E02.mp4»
//   Deportes (carpeta con «deport» en el nombre; no se busca en TMDB):
//     «DEPORTES/FUTBOL/Real Madrid vs Barcelona 26-10-2026.mp4» → evento de Fútbol
//     Portada: imagen con el mismo nombre que el vídeo (.jpg/.png/.webp) o «portada.jpg» en su carpeta
import * as e2 from './e2.js';
import * as tmdb from './tmdb.js';
import { titulos } from './db.js';
import { detectar, carpeta, generosPorCarpeta, carpetaDeporte, esDeporte } from './plataformas.js';
import * as telegram from './telegram.js';
import { anotar } from './registro.js';

// Por defecto solo escanea el servidor publicado en Render (que define RENDER); en tu PC está
// apagado para que dos servidores no den de alta lo mismo a la vez
const MINUTOS = Number(process.env.E2_ESCANEO_MINUTOS ?? (process.env.RENDER ? 5 : 0));

let ultimo = { fecha: null, nuevos: [], errores: [] };
let enCurso = null;
const fallidos = new Set(); // no se reintentan solos hasta reiniciar o escanear a mano

export const estado = () => ({ ...ultimo, enCurso: Boolean(enCurso), cadaMinutos: MINUTOS });

// Quita extensión, calidad, idioma y separadores: «El.Regalo.2026.1080p.WEB-DL» → «El Regalo»
function limpiarNombre(texto) {
  return texto
    .replace(/\.[a-z0-9]{2,4}$/i, '')
    .replace(/[._]+/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\b(2160p|1080p|720p|480p|4k|uhd|hdr|web[- ]?dl|webrip|bluray|brrip|hdtv|x264|x265|h264|h265|hevc|aac|ac3|dual|castellano|español|spanish|latino|vose|subs?)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Año entre paréntesis, o el último número tipo año: «Blade Runner 2049 (2017)» → 2017
function separarAnio(base) {
  const paren = base.match(/[([]((?:19|20)\d{2})[)\]]/);
  if (paren) return { anio: paren[1], antes: base.slice(0, paren.index) };
  const ult = [...base.matchAll(/[ ._-]((?:19|20)\d{2})(?=[ ._-]|$)/g)].at(-1);
  return ult ? { anio: ult[1], antes: base.slice(0, ult.index) } : { anio: undefined, antes: base };
}

export function analizar(key) {
  const partes = key.split('/');
  const archivo = partes.at(-1);
  const carpetas = partes.slice(0, -1);
  const ep = archivo.match(/^(.*?)[ ._-]*(?<![a-z0-9])(?:S(\d{1,2})[ ._-]?E(\d{1,3})|(\d{1,2})x(\d{2,3})(?!\d)|T(\d{1,2})[ ._-]?E(\d{1,3}))/i);
  // Carpetas de series, programas de TV y novelas: sus vídeos son episodios
  const carpetaSerie = carpetas.some((c) => /serie|programa|novela|turc/i.test(c));

  if (ep || carpetaSerie) {
    // Temporada: del SxxExx o de una carpeta «Temporada 2» / «Season 2» / «T2»
    const carpetaTemp = carpetas.map((c) => c.match(/^(?:temporada|season|temp|t|s)\s*0*(\d{1,2})$/i)).find(Boolean);
    const temporada = Number(ep?.[2] ?? ep?.[4] ?? ep?.[6] ?? carpetaTemp?.[1] ?? 1);
    const episodio = Number(ep?.[3] ?? ep?.[5] ?? ep?.[7] ?? archivo.match(/(\d{1,3})/)?.[1]);
    // Nombre de la serie: lo que va antes del SxxExx, o la carpeta que no sea de plataforma ni de temporada
    const nombreCarpeta = [...carpetas].reverse().find((c) => !/serie|programa|novela|turc/i.test(c) && !/^(?:temporada|season|temp|t|s)\s*\d+$/i.test(c));
    const { anio, antes } = separarAnio(ep?.[1] || nombreCarpeta || '');
    const nombre = limpiarNombre(antes);
    if (!nombre || !episodio) return null;
    return { tipo: 'serie', nombre, anio, temporada, episodio };
  }

  const { anio, antes } = separarAnio(archivo.replace(/\.[a-z0-9]{2,4}$/i, ''));
  const nombre = limpiarNombre(antes) || limpiarNombre(archivo);
  return nombre ? { tipo: 'pelicula', nombre, anio } : null;
}

// ---------- Deportes ----------
const IMAGEN = /\.(jpe?g|png|webp)$/i;
const sinExtension = (k) => k.replace(/\.[^./]+$/, '').toLowerCase();
const DEPORTES = {
  futbol: 'Fútbol', baloncesto: 'Baloncesto', basket: 'Baloncesto', tenis: 'Tenis', padel: 'Pádel',
  'formula 1': 'Fórmula 1', f1: 'Fórmula 1', motogp: 'MotoGP', motos: 'Motociclismo', ciclismo: 'Ciclismo',
  boxeo: 'Boxeo', ufc: 'UFC', mma: 'MMA', nba: 'NBA', nfl: 'NFL', rugby: 'Rugby', golf: 'Golf', balonmano: 'Balonmano',
};
// «FUTBOL» → «Fútbol»; lo que no conoce lo pone con mayúscula inicial («VOLEY PLAYA» → «Voley Playa»)
function nombreDeporte(texto) {
  const limpio = texto.replace(/^\d+\s*[-.]\s*/, '').trim();
  const clave = limpio.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return DEPORTES[clave] ?? limpio.toLowerCase().replace(/(^|\s)\p{L}/gu, (l) => l.toUpperCase());
}

// Imágenes que hay justo en una carpeta (se guardan por escaneo para no listar dos veces)
async function imagenesDe(dir, cache) {
  if (!cache.has(dir)) {
    const keys = (await e2.listar(`${dir}/`)).map((o) => o.key);
    cache.set(dir, keys.filter((k) => IMAGEN.test(k) && carpeta(k) === dir));
  }
  return cache.get(dir);
}
function portadaPara(key, imagenes) {
  return imagenes.find((k) => sinExtension(k) === sinExtension(key))
    ?? imagenes.find((k) => /\/(portada|poster|cover)\.[a-z]+$/i.test(k)) ?? null;
}

async function importarDeporte(key, cache) {
  const partes = key.split('/');
  const i = partes.findIndex((p) => /deport/i.test(p));
  const sub = partes.slice(i + 1, -1)[0];
  const deporte = sub ? nombreDeporte(sub) : null;
  const archivo = partes.at(-1);
  const sinExt = archivo.replace(/\.[a-z0-9]{2,4}$/i, '');
  const titulo = limpiarNombre(archivo) || sinExt;
  const t = titulos.crear({
    tipo: 'pelicula',
    titulo,
    anio: separarAnio(sinExt).anio,
    sinopsis: '',
    generos: ['Deportes', ...(deporte ? [deporte] : [])],
    deporte,
    reparto: [],
    importado: true,
    videoKey: key,
    portadaKey: portadaPara(key, await imagenesDe(carpeta(key), cache)),
  });
  return { key, id: t.id, titulo: t.titulo, tipo: t.tipo };
}

// Si se sube la imagen después que el vídeo, en el siguiente escaneo se le pone a su evento
async function completarPortadas(cache) {
  for (const t of titulos.todos()) {
    if (!esDeporte(t) || !t.videoKey || t.portadaKey || t.poster) continue;
    const p = portadaPara(t.videoKey, await imagenesDe(carpeta(t.videoKey), cache));
    if (p) titulos.actualizar(t.id, { portadaKey: p });
  }
}

async function buscarEnTmdb({ nombre, tipo, anio }) {
  const conAnio = anio ? await tmdb.buscar(nombre, tipo, anio) : [];
  return conAnio[0] ?? (await tmdb.buscar(nombre, tipo))[0] ?? null;
}

async function importar(key, cache) {
  if (carpetaDeporte(key)) return importarDeporte(key, cache);
  const datos = analizar(key);
  if (!datos) throw new Error('No se entiende el nombre del archivo');
  const encontrado = await buscarEnTmdb(datos);
  if (!encontrado) throw new Error(`«${datos.nombre}» no aparece en TMDB`);
  const enCarpeta = detectar(carpeta(key), datos.tipo);

  let t = titulos.porTmdb(encontrado.tmdbId, datos.tipo);
  if (!t) {
    const ficha = await tmdb.ficha(encontrado.tmdbId, datos.tipo);
    // La carpeta manda: si el vídeo está en «PELICULAS PRIME VIDEO», va a Prime Video
    if (enCarpeta.length) ficha.plataformas = enCarpeta;
    t = titulos.crear({ ...ficha, importado: true });
  }
  // La carpeta del vídeo decide la categoría (documental, anime, programa de TV, novela turca)
  const generos = generosPorCarpeta(t, key);
  if (generos) t = titulos.actualizar(t.id, { generos });

  if (datos.tipo === 'pelicula') {
    titulos.actualizar(t.id, { videoKey: key });
    return { key, id: t.id, titulo: t.titulo, tipo: t.tipo };
  }

  const temporadas = t.temporadas ?? [];
  let s = temporadas.find((x) => x.numero === datos.temporada);
  if (!s) {
    s = { numero: datos.temporada, nombre: `Temporada ${datos.temporada}`, episodios: [] };
    temporadas.push(s);
    temporadas.sort((a, b) => a.numero - b.numero);
  }
  let ep = s.episodios.find((x) => x.numero === datos.episodio);
  if (!ep) {
    ep = { numero: datos.episodio, titulo: `Episodio ${datos.episodio}`, sinopsis: '', imagen: null };
    s.episodios.push(ep);
    s.episodios.sort((a, b) => a.numero - b.numero);
  }
  ep.videoKey = key;
  titulos.actualizar(t.id, { temporadas });
  return { key, id: t.id, titulo: `${t.titulo} T${datos.temporada}:E${datos.episodio}`, tipo: t.tipo, temporada: datos.temporada, episodio: datos.episodio };
}

// Vídeos del bucket que ya están enlazados a alguna película o episodio
function enlazados() {
  return new Set(titulos.todos().flatMap((t) =>
    t.tipo === 'pelicula' ? [t.videoKey] : (t.temporadas ?? []).flatMap((s) => s.episodios.map((e) => e.videoKey)),
  ).filter(Boolean));
}

// Revisa el bucket e importa lo nuevo. `manual` reintenta también los que fallaron antes.
export function escanear({ manual = false } = {}) {
  if (!e2.configurado || !tmdb.configurado) return Promise.resolve(estado());
  if (enCurso) return enCurso;
  if (manual) fallidos.clear();
  enCurso = (async () => {
    const nuevos = [];
    const errores = [];
    const cache = new Map();
    try {
      const ya = enlazados();
      // Los episodios de una misma serie van seguidos para crear la ficha una sola vez
      const pendientes = (await e2.listarVideos()).filter((v) => !ya.has(v.key) && !fallidos.has(v.key));
      for (const { key } of pendientes) {
        try {
          nuevos.push(await importar(key, cache));
        } catch (err) {
          fallidos.add(key);
          errores.push({ key, error: err.message });
        }
      }
      await completarPortadas(cache);
    } catch (err) {
      errores.push({ key: null, error: err.message });
    }
    ultimo = { fecha: new Date().toISOString(), nuevos, errores };
    // Aviso en Telegram de lo que ya se puede ver (si está configurado en el panel)
    telegram.avisar(nuevos).catch((err) => console.error('Telegram:', err.message));
    for (const n of nuevos) anotar('importado', `Importado del bucket: ${n.titulo}`);
    for (const e of errores) if (e.key) anotar('error', `No se pudo importar ${e.key}: ${e.error}`);
    if (nuevos.length || errores.length) {
      console.log(`Importador: ${nuevos.length} nuevos, ${errores.length} con error`);
      for (const e of errores) console.log(`  ✗ ${e.key}: ${e.error}`);
    }
    return estado();
  })().finally(() => { enCurso = null; });
  return enCurso;
}

// Escanea al arrancar, cada MINUTOS y, como Render duerme el servidor gratis, también
// cuando alguien entra y hace más de MINUTOS desde la última vez.
export function iniciar() {
  if (!MINUTOS) return;
  escanear();
  setInterval(escanear, MINUTOS * 60_000).unref();
}

export function siHaceFalta() {
  if (!MINUTOS) return;
  const hace = ultimo.fecha ? Date.now() - Date.parse(ultimo.fecha) : Infinity;
  if (hace > MINUTOS * 60_000) escanear();
}
