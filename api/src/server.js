import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as e2 from './e2.js';
import * as tmdb from './tmdb.js';
import { titulos, usuarios, ajustes, exportar, claves, iniciar as iniciarDb } from './db.js';
import * as importador from './importador.js';
import * as telegram from './telegram.js';
import * as cuentas from './cuentas.js';
import * as registro from './registro.js';
import * as hls from './hls.js';
import { deTipo, deTitulo, limpiar, detectar, carpeta, CATEGORIAS, TIPO_BASE, categoriaDe, esDocumental, carpetaDocumental, conDocumental } from './plataformas.js';

const { PORT = 4000, ADMIN_KEY = '', CORS_ORIGINS = '*' } = process.env;
const WEB = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'web');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Render va detrás de un proxy: así req.ip es la del espectador
app.use(express.json({ limit: '2mb' }));

// CORS para la web servida desde otro dominio y para la app móvil en desarrollo
const origenes = CORS_ORIGINS.split(',').map((o) => o.trim());
app.use((req, res, next) => {
  const origen = req.headers.origin;
  if (origen && (origenes.includes('*') || origenes.includes(origen))) {
    res.setHeader('Access-Control-Allow-Origin', origenes.includes('*') ? '*' : origen);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const asinc = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------- Vista pública ----------
// Nunca enseñamos las claves de e2 al público, solo si hay vídeo disponible.
function publico(t, completo = false) {
  const base = {
    id: t.id,
    tipo: t.tipo,
    titulo: t.titulo,
    anio: t.anio,
    generos: t.generos ?? [],
    valoracion: t.valoracion,
    poster: t.poster,
    fondo: t.fondo,
    sinopsis: t.sinopsis,
    plataformas: deTitulo(t),
    disponible: t.tipo === 'pelicula' ? Boolean(t.videoKey) : (t.temporadas ?? []).some((s) => s.episodios.some((e) => e.videoKey)),
  };
  if (!completo) return base;
  return {
    ...base,
    tituloOriginal: t.tituloOriginal,
    duracion: t.duracion,
    reparto: t.reparto ?? [],
    trailer: t.trailer,
    temporadas: (t.temporadas ?? []).map((s) => ({
      numero: s.numero,
      nombre: s.nombre,
      poster: s.poster,
      episodios: s.episodios.map(({ videoKey, hls: _hls, ...e }) => ({ ...e, disponible: Boolean(videoKey) })),
    })),
  };
}

app.get('/api/estado', (req, res) => {
  // `version` es el commit publicado (Render lo da en RENDER_GIT_COMMIT): así se sabe cuándo ya está en línea
  const version = process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? 'local';
  res.set('Cache-Control', 'no-store').json({ ok: true, e2: e2.configurado, tmdb: tmdb.configurado, titulos: titulos.todos().length, version });
});

// La web lo consulta cada poco: si cambia `version`, repinta la vista con lo nuevo.
// `recientes` son los últimos añadidos, para avisar al espectador de qué ha llegado.
app.get('/api/novedades', (req, res) => {
  importador.siHaceFalta();
  const lista = titulos.todos();
  const ultima = lista.reduce((max, t) => Math.max(max, Date.parse(t.actualizado ?? t.creado ?? 0) || 0), 0);
  const recientes = [...lista].sort((a, b) => (b.creado ?? '').localeCompare(a.creado ?? '')).slice(0, 10)
    .map((t) => ({ id: t.id, titulo: t.titulo, tipo: t.tipo }));
  res.set('Cache-Control', 'no-store').json({ version: `${lista.length}-${ultima}`, recientes });
});

app.get('/api/titulos', (req, res) => {
  importador.siHaceFalta();
  const { tipo, categoria, genero, q, disponibles, plataformas } = req.query;
  const texto = q?.toString().toLowerCase();
  let lista = titulos.todos();
  if (tipo) lista = lista.filter((t) => t.tipo === tipo);
  if (categoria) lista = lista.filter((t) => categoriaDe(t) === categoria);
  if (genero) lista = lista.filter((t) => t.generos?.includes(genero));
  if (texto) lista = lista.filter((t) => `${t.titulo} ${t.tituloOriginal ?? ''}`.toLowerCase().includes(texto));
  let res2 = lista.map((t) => publico(t));
  if (disponibles === '1') res2 = res2.filter((t) => t.disponible);
  if (plataformas) {
    const elegidas = String(plataformas).split(',');
    res2 = res2.filter((t) => t.plataformas.some((p) => elegidas.includes(p)));
  }
  res.json(res2);
});

// ?tipo=pelicula|serie|documental|docuserie (por defecto películas)
const categoriaPedida = (req) => (CATEGORIAS.includes(req.query.tipo) ? req.query.tipo : 'pelicula');

// Portada de una categoría: una fila por cada plataforma elegida (?plataformas=netflix,prime).
// Sin el parámetro salen todas. Web y app usan lo mismo.
app.get('/api/inicio', (req, res) => {
  importador.siHaceFalta();
  const cat = categoriaPedida(req);
  const disponibles = deTipo(TIPO_BASE[cat]);
  const elegidas = req.query.plataformas ? limpiar(String(req.query.plataformas).split(',')) : disponibles.map((p) => p.id);
  const lista = titulos.todos().filter((t) => categoriaDe(t) === cat).map((t) => publico(t));
  const filas = disponibles.filter((p) => elegidas.includes(p.id))
    .map(({ id, nombre, color }) => ({ id, titulo: nombre, color, items: lista.filter((t) => t.plataformas.includes(id)) }))
    .filter((f) => f.items.length);
  const visibles = filas.flatMap((f) => f.items);
  const elegidos = visibles.filter((t) => t.fondo && titulos.obtener(t.id)?.destacado);
  const destacado = elegidos[Math.floor(Math.random() * elegidos.length)]
    ?? visibles.find((t) => t.disponible && t.fondo) ?? visibles.find((t) => t.fondo) ?? null;
  res.json({ destacado, filas });
});

// Plataformas de una categoría con cuántos títulos tiene cada una
app.get('/api/plataformas', (req, res) => {
  const cat = categoriaPedida(req);
  const vistas = titulos.todos().filter((t) => categoriaDe(t) === cat).map(deTitulo);
  res.json(deTipo(TIPO_BASE[cat]).map(({ id, nombre, color }) => ({ id, nombre, color, total: vistas.filter((p) => p.includes(id)).length })));
});

// Aviso del panel para la web (o null si no hay ninguno activo)
app.get('/api/aviso', (req, res) => {
  const a = ajustes.obtener('aviso');
  res.set('Cache-Control', 'no-store').json(a?.activo ? { texto: a.texto, tipo: a.tipo, enlace: a.enlace, fecha: a.fecha } : null);
});

app.get('/api/generos', (req, res) => {
  res.json([...new Set(titulos.todos().flatMap((t) => t.generos ?? []))].sort());
});

app.get('/api/titulos/:id', (req, res) => {
  const t = titulos.obtener(req.params.id);
  if (!t) return res.status(404).json({ error: 'No existe ese título' });
  res.json(publico(t, true));
});

function buscarVideo(t, temporada, episodio) {
  if (t.tipo === 'pelicula') return t.videoKey;
  const s = t.temporadas?.find((x) => x.numero === Number(temporada));
  return s?.episodios.find((e) => e.numero === Number(episodio))?.videoKey;
}

// Carpeta cifrada (HLS) de una película o episodio, si ya se ha cifrado
function buscarHls(t, temporada, episodio) {
  if (t.tipo === 'pelicula') return t.hls;
  const s = t.temporadas?.find((x) => x.numero === Number(temporada));
  return s?.episodios.find((e) => e.numero === Number(episodio))?.hls;
}

// ---------- Administración (cabecera x-api-key) ----------
const admin = express.Router();
admin.use((req, res, next) => {
  const dada = Buffer.from(String(req.headers['x-api-key'] ?? ''));
  const real = Buffer.from(ADMIN_KEY);
  if (!ADMIN_KEY || dada.length !== real.length || !timingSafeEqual(dada, real)) {
    return res.status(401).json({ error: 'Clave de administración incorrecta' });
  }
  next();
});

admin.get('/comprobar', (req, res) => res.json({ ok: true }));

// Importador: vídeos nuevos del bucket → fichas de TMDB, sin tocar nada a mano
admin.get('/escaneo', (req, res) => res.json(importador.estado()));
admin.post('/escaneo', asinc(async (req, res) => res.json(await importador.escanear({ manual: true }))));

admin.get('/titulos', (req, res) => res.json(titulos.todos().map((t) => ({ ...t, plataformasVistas: deTitulo(t), categoria: categoriaDe(t), disponible: publico(t).disponible }))));

// Resumen para la portada del panel: catálogo, almacenamiento, usuarios y servicios
admin.get('/resumen', asinc(async (req, res) => {
  const todos = titulos.todos();
  const ahora = Date.now();
  const porCategoria = { pelicula: 0, serie: 0, documental: 0, docuserie: 0 };
  for (const t of todos) porCategoria[categoriaDe(t)] = (porCategoria[categoriaDe(t)] ?? 0) + 1;
  const episodios = todos.filter((t) => t.tipo === 'serie').flatMap((t) => (t.temporadas ?? []).flatMap((s) => s.episodios));
  const cuentas_ = usuarios.todos();
  const veces = (clave) => {
    const n = new Map();
    for (const u of cuentas_) {
      const ids = clave === 'fg-lista' ? (u.datos?.[clave] ?? []) : Object.keys(u.datos?.[clave] ?? {});
      for (const id of ids) n.set(id, (n.get(id) ?? 0) + 1);
    }
    return [...n].sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([id, total]) => ({ id, titulo: titulos.obtener(id)?.titulo, total })).filter((x) => x.titulo);
  };
  let almacenamiento = null;
  if (e2.configurado) {
    try {
      const videos = await e2.listarVideos();
      almacenamiento = { videos: videos.length, bytes: videos.reduce((s, v) => s + (v.tamano ?? 0), 0) };
    } catch { /* e2 no responde: se muestra sin esos datos */ }
  }
  res.json({
    catalogo: {
      total: todos.length,
      porCategoria,
      sinVideo: todos.filter((t) => !publico(t).disponible).map((t) => ({ id: t.id, titulo: t.titulo })),
      episodios: episodios.length,
      episodiosConVideo: episodios.filter((e) => e.videoKey).length,
      destacados: todos.filter((t) => t.destacado).length,
      ultimos: [...todos].sort((a, b) => (b.creado ?? '').localeCompare(a.creado ?? '')).slice(0, 5).map((t) => ({ id: t.id, titulo: t.titulo, creado: t.creado, poster: t.poster })),
    },
    almacenamiento,
    usuarios: {
      total: cuentas_.length,
      nuevos7: cuentas_.filter((u) => ahora - Date.parse(u.creado) < 7 * 864e5).length,
      activos24: cuentas_.filter((u) => (u.sesiones ?? []).some((s) => ahora - Date.parse(s.ultimo) < 864e5) || ahora - Date.parse(u.ultimo ?? 0) < 864e5).length,
      dispositivos: cuentas_.reduce((s, u) => s + (u.sesiones ?? []).length, 0),
      enListas: veces('fg-lista'),
      masVistos: veces('fg-progreso'),
    },
    reproducciones: (() => {
      const r = registro.resumen();
      return {
        dias: r.dias,
        total30: r.total30,
        hoy: r.hoy,
        top: r.porTitulo.slice(0, 5).map(([id, total]) => ({ id, titulo: titulos.obtener(id)?.titulo, total })).filter((x) => x.titulo),
      };
    })(),
    actividad: registro.resumen().actividad,
    servicios: {
      e2: e2.configurado,
      tmdb: tmdb.configurado,
      telegram: telegram.estado().configurado && telegram.estado().activo,
      importador: importador.estado(),
      version: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? 'local',
    },
  });
}));

// Aviso que sale arriba en la web (novedades, mantenimiento…)
admin.get('/aviso', (req, res) => res.json(ajustes.obtener('aviso') ?? { activo: false, texto: '', tipo: 'info', enlace: '' }));
admin.put('/aviso', (req, res) => {
  const { activo, texto, tipo, enlace } = req.body ?? {};
  const aviso = {
    activo: Boolean(activo) && Boolean(String(texto ?? '').trim()),
    texto: String(texto ?? '').trim().slice(0, 240),
    tipo: ['info', 'novedad', 'importante'].includes(tipo) ? tipo : 'info',
    enlace: /^https?:\/\//.test(String(enlace ?? '')) ? String(enlace).slice(0, 300) : '',
    fecha: new Date().toISOString(),
  };
  ajustes.guardar('aviso', aviso);
  registro.anotar('aviso', aviso.activo ? `Aviso en la web: «${aviso.texto}»` : 'Aviso de la web quitado');
  res.json(aviso);
});

// Copia de seguridad completa (catálogo, cuentas y ajustes) en un .json
admin.get('/copia', (req, res) => {
  res.attachment(`morvehtv-copia-${new Date().toISOString().slice(0, 10)}.json`);
  res.send(JSON.stringify(exportar(), null, 2));
});

admin.get('/tmdb/buscar', asinc(async (req, res) => {
  const resultados = await tmdb.buscar(String(req.query.q ?? ''), req.query.tipo);
  res.json(resultados.map((r) => ({ ...r, yaAnadido: Boolean(titulos.porTmdb(r.tmdbId, r.tipo)) })));
}));

admin.post('/titulos', asinc(async (req, res) => {
  const { tmdbId, tipo, manual } = req.body;
  if (tipo !== 'pelicula' && tipo !== 'serie') return res.status(400).json({ error: 'tipo debe ser pelicula o serie' });
  if (manual) {
    if (!manual.titulo) return res.status(400).json({ error: 'Falta el título' });
    const base = { tipo, generos: [], reparto: [], ...manual };
    if (tipo === 'serie') base.temporadas = manual.temporadas ?? [{ numero: 1, nombre: 'Temporada 1', episodios: [] }];
    const nuevo = titulos.crear(base);
    registro.anotar('titulo', `Añadido a mano: ${nuevo.titulo}`);
    return res.status(201).json(nuevo);
  }
  if (titulos.porTmdb(Number(tmdbId), tipo)) return res.status(409).json({ error: 'Ese título ya está en el catálogo' });
  const nuevo = titulos.crear(await tmdb.ficha(Number(tmdbId), tipo));
  registro.anotar('titulo', `Añadido desde TMDB: ${nuevo.titulo}`);
  res.status(201).json(nuevo);
}));

admin.patch('/titulos/:id', (req, res) => {
  const { id, creado, ...cambios } = req.body;
  if ('plataformas' in cambios) cambios.plataformas = limpiar(cambios.plataformas);
  const t = titulos.actualizar(req.params.id, cambios);
  if (!t) return res.status(404).json({ error: 'No existe ese título' });
  res.json(t);
});

// ---------- Cifrado (lo usa la herramienta scripts/cifrar.mjs) ----------
// Vídeos enlazados que aún no están cifrados
admin.get('/hls/pendientes', (req, res) => {
  const lista = [];
  for (const t of titulos.todos()) {
    if (t.tipo === 'pelicula') { if (t.videoKey && !t.hls) lista.push({ videoKey: t.videoKey, titulo: t.titulo }); continue; }
    for (const s of t.temporadas ?? []) for (const e of s.episodios) {
      if (e.videoKey && !e.hls) lista.push({ videoKey: e.videoKey, titulo: `${t.titulo} T${s.numero}:E${e.numero}` });
    }
  }
  res.json(lista);
});
// Guarda la clave y marca como cifrado todo lo que use ese vídeo
admin.put('/hls', (req, res) => {
  const { videoKey, prefijo, clave } = req.body ?? {};
  if (!videoKey || !/^_hls\/[\w-]+$/.test(String(prefijo)) || !/^[0-9a-f]{32}$/.test(String(clave))) {
    return res.status(400).json({ error: 'Datos de cifrado no válidos' });
  }
  claves.guardar(prefijo, clave);
  let usados = 0;
  for (const t of titulos.todos()) {
    if (t.tipo === 'pelicula' && t.videoKey === videoKey) { titulos.actualizar(t.id, { hls: prefijo }); usados++; }
    if (t.tipo === 'serie') {
      let cambia = false;
      for (const s of t.temporadas ?? []) for (const e of s.episodios) if (e.videoKey === videoKey) { e.hls = prefijo; cambia = true; usados++; }
      if (cambia) titulos.actualizar(t.id, { temporadas: t.temporadas });
    }
  }
  hls.olvidarLista(prefijo);
  registro.anotar('titulo', `Vídeo cifrado: ${videoKey}`);
  res.json({ ok: true, usados });
});

// Acciones sobre varios títulos a la vez: destacar, quitar de destacados o borrar
admin.post('/titulos/lote', asinc(async (req, res) => {
  const { ids = [], accion } = req.body ?? {};
  const lista = ids.map((id) => titulos.obtener(id)).filter(Boolean);
  if (!lista.length) return res.status(400).json({ error: 'No has elegido ningún título' });
  if (accion === 'destacar' || accion === 'quitar-destacado') {
    for (const t of lista) titulos.actualizar(t.id, { destacado: accion === 'destacar' });
  } else if (accion === 'borrar') {
    for (const t of lista) titulos.borrar(t.id);
  } else {
    return res.status(400).json({ error: 'Acción desconocida' });
  }
  const verbo = { destacar: 'Destacados', 'quitar-destacado': 'Quitados de destacados', borrar: 'Borrados' }[accion];
  registro.anotar('titulo', `${verbo} ${lista.length}: ${lista.map((t) => t.titulo).join(', ')}`);
  res.json({ ok: true, total: lista.length });
}));

// Vuelve a pedir los datos a TMDB conservando los vídeos ya enlazados
admin.post('/titulos/:id/refrescar', asinc(async (req, res) => {
  const t = titulos.obtener(req.params.id);
  if (!t?.tmdbId) return res.status(404).json({ error: 'Título sin ficha de TMDB' });
  const nueva = await tmdb.ficha(t.tmdbId, t.tipo);
  if (Array.isArray(t.plataformas)) nueva.plataformas = t.plataformas;
  // Si ya era documental (por su carpeta o a mano), TMDB no se lo quita
  if (esDocumental(t)) nueva.generos = conDocumental(nueva.generos);
  if (t.tipo === 'pelicula') nueva.videoKey = t.videoKey;
  else for (const s of nueva.temporadas) for (const e of s.episodios) e.videoKey = buscarVideo(t, s.numero, e.numero) ?? null;
  res.json(titulos.actualizar(t.id, nueva));
}));

admin.delete('/titulos/:id', asinc(async (req, res) => {
  const t = titulos.borrar(req.params.id);
  if (!t) return res.status(404).json({ error: 'No existe ese título' });
  registro.anotar('titulo', `Borrado: ${t.titulo}${req.query.borrarVideos === '1' ? ' (con sus vídeos)' : ''}`);
  if (req.query.borrarVideos === '1' && e2.configurado) {
    const keys = t.tipo === 'pelicula' ? [t.videoKey] : (t.temporadas ?? []).flatMap((s) => s.episodios.map((e) => e.videoKey));
    await Promise.all(keys.filter(Boolean).map((k) => e2.borrar(k)));
  }
  res.json({ ok: true });
}));

// Enlaza un vídeo de e2 a una película o a un episodio (temporada + episodio)
admin.put('/titulos/:id/video', asinc(async (req, res) => {
  const { key, temporada, episodio } = req.body;
  const t = titulos.obtener(req.params.id);
  if (!t) return res.status(404).json({ error: 'No existe ese título' });
  if (key && !(await e2.existe(key))) return res.status(400).json({ error: 'Ese archivo no existe en el bucket' });
  if (t.tipo === 'pelicula') {
    const cambios = { videoKey: key || null };
    // Si ya tiene plataformas elegidas, sumamos la que indique la carpeta del vídeo
    if (key && Array.isArray(t.plataformas)) cambios.plataformas = limpiar([...t.plataformas, ...detectar(carpeta(key), 'pelicula')]);
    if (key && carpetaDocumental(key) && !esDocumental(t)) cambios.generos = conDocumental(t.generos);
    const nuevo = key && !t.videoKey;
    res.json(titulos.actualizar(t.id, cambios));
    if (nuevo) telegram.avisar([{ id: t.id }]).catch(() => {});
    return;
  }
  const temporadas = t.temporadas ?? [];
  let s = temporadas.find((x) => x.numero === Number(temporada));
  if (!s) {
    s = { numero: Number(temporada), nombre: `Temporada ${temporada}`, episodios: [] };
    temporadas.push(s);
    temporadas.sort((a, b) => a.numero - b.numero);
  }
  let ep = s.episodios.find((x) => x.numero === Number(episodio));
  if (!ep) {
    ep = { numero: Number(episodio), titulo: `Episodio ${episodio}`, sinopsis: '', imagen: null };
    s.episodios.push(ep);
    s.episodios.sort((a, b) => a.numero - b.numero);
  }
  const nuevo = key && !ep.videoKey;
  ep.videoKey = key || null;
  const cambios = { temporadas };
  if (key && Array.isArray(t.plataformas)) cambios.plataformas = limpiar([...t.plataformas, ...detectar(carpeta(key), 'serie')]);
  if (key && carpetaDocumental(key) && !esDocumental(t)) cambios.generos = conDocumental(t.generos);
  res.json(titulos.actualizar(t.id, cambios));
  if (nuevo) telegram.avisar([{ id: t.id, temporada: s.numero, episodio: ep.numero }]).catch(() => {});
}));

// Avisos de contenido nuevo en un grupo de Telegram
admin.get('/telegram', (req, res) => res.json({ ...telegram.estado(), secciones: telegram.SECCIONES }));
admin.put('/telegram', asinc(async (req, res) => res.json(await telegram.configurar(req.body ?? {}))));
admin.get('/telegram/grupos', asinc(async (req, res) => res.json(await telegram.buscarGrupos())));
admin.get('/telegram/temas', asinc(async (req, res) => res.json(await telegram.buscarTemas())));
admin.post('/telegram/temas', asinc(async (req, res) => res.json(await telegram.crearTemas())));
// Vuelve a publicar en Telegram el aviso de un título (por ejemplo, si fue al tema equivocado)
admin.post('/telegram/avisar/:id', asinc(async (req, res) => {
  const t = titulos.obtener(req.params.id);
  if (!t) return res.status(404).json({ error: 'No existe ese título' });
  if (!telegram.estado().configurado) return res.status(400).json({ error: 'Telegram no está configurado (mira Notificaciones)' });
  if (!telegram.estado().activo) return res.status(400).json({ error: 'Los avisos de Telegram están en pausa' });
  await telegram.avisar([{ id: t.id }]);
  const ultimo = telegram.estado().historial[0];
  if (!ultimo?.ok) return res.status(502).json({ error: ultimo?.error ?? 'No se pudo enviar' });
  res.json({ ok: true });
}));
admin.post('/telegram/prueba', asinc(async (req, res) => { await telegram.probar(); res.json({ ok: true }); }));

// Subida multiparte: el navegador sube los trozos directamente a e2 con URLs firmadas
admin.post('/subidas/iniciar', asinc(async (req, res) => {
  const { nombre, tipo, tamano } = req.body;
  if (!nombre || !tamano) return res.status(400).json({ error: 'Faltan nombre o tamano' });
  res.json(await e2.iniciarSubida({ nombre, tipo, tamano }));
}));

admin.post('/subidas/completar', asinc(async (req, res) => {
  const { key, uploadId, partes } = req.body;
  if (!key || !uploadId || !Array.isArray(partes)) return res.status(400).json({ error: 'Faltan datos de la subida' });
  res.json(await e2.completarSubida({ key, uploadId, partes }));
}));

admin.post('/subidas/abortar', asinc(async (req, res) => {
  await e2.abortarSubida(req.body);
  res.json({ ok: true });
}));

admin.get('/almacenamiento', asinc(async (req, res) => {
  const enlazados = new Set(
    titulos.todos().flatMap((t) => [t.videoKey, ...(t.temporadas ?? []).flatMap((s) => s.episodios.map((e) => e.videoKey))]).filter(Boolean),
  );
  const objetos = await e2.listarVideos();
  res.json(objetos.map((o) => ({ ...o, enlazado: enlazados.has(o.key) })));
}));

admin.delete('/almacenamiento', asinc(async (req, res) => {
  const key = String(req.query.key ?? '');
  if (!e2.esVideo(key)) return res.status(400).json({ error: 'Solo se pueden borrar vídeos' });
  await e2.borrar(key);
  res.json({ ok: true });
}));

// Usuarios registrados
admin.get('/usuarios', (req, res) => res.json(cuentas.resumen()));
admin.post('/usuarios/:id/contrasena', asinc(async (req, res) => {
  const r = await cuentas.restablecer(req.params.id);
  registro.anotar('usuario', `Contraseña provisional para ${r.email}`);
  res.json(r);
}));
admin.get('/usuarios/:id', (req, res) => res.json(cuentas.detalle(req.params.id)));
admin.patch('/usuarios/:id', (req, res) => res.json(cuentas.suspender(req.params.id, Boolean(req.body?.suspendido))));
admin.delete('/usuarios/:id', (req, res) => {
  const u = usuarios.borrar(req.params.id);
  if (!u) return res.status(404).json({ error: 'No existe ese usuario' });
  registro.anotar('usuario', `Cuenta borrada: ${u.email}`);
  res.json({ ok: true });
});

app.use('/api/admin', admin);

// ---------- Cuentas de los espectadores ----------
// La sesión va en la cabecera «Authorization: Bearer <token>»
const conCuenta = (req, res, next) => {
  const r = cuentas.deToken(req.get('authorization')?.replace(/^Bearer\s+/i, ''));
  if (!r) return res.status(401).json({ error: 'Inicia sesión de nuevo' });
  req.usuario = r.usuario;
  req.sesion = r.sesion;
  next();
};
// ---------- Reproducción protegida ----------
// Solo con cuenta. Si el vídeo está cifrado, se da una lista HLS cuyos trozos y clave solo
// se sirven con un permiso firmado para ese usuario que caduca en 6 h; cada trozo sale de
// e2 con un enlace de 2 minutos. Si aún no está cifrado, enlace firmado al MP4.
app.get('/api/titulos/:id/reproducir', conCuenta, asinc(async (req, res) => {
  const t = titulos.obtener(req.params.id);
  if (!t) return res.status(404).json({ error: 'No existe ese título' });
  const key = buscarVideo(t, req.query.t, req.query.e);
  if (!key) return res.status(404).json({ error: 'Este contenido todavía no tiene vídeo' });
  registro.reproduccion(t.id);
  const marca = req.usuario.email;
  const prefijo = buscarHls(t, req.query.t, req.query.e);
  if (prefijo && claves.obtener(prefijo)) {
    const tk = hls.crearPermiso({ usuario: req.usuario.id, prefijo });
    return res.json({ tipo: 'hls', url: `${req.protocol}://${req.get('host')}/api/hls/${tk}/index.m3u8`, marca });
  }
  res.json({ tipo: 'mp4', url: await e2.urlReproduccion(key), marca });
}));

app.get('/api/hls/:tk/index.m3u8', asinc(async (req, res) => {
  const p = hls.leerPermiso(req.params.tk);
  if (!p) return res.status(403).send('Permiso caducado');
  res.set({ 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-store' }).send(await hls.lista(p.prefijo));
}));
app.get('/api/hls/:tk/clave', (req, res) => {
  const p = hls.leerPermiso(req.params.tk);
  const hex = p && claves.obtener(p.prefijo);
  if (!hex) return res.status(403).send('Permiso caducado');
  res.set({ 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store, private' }).send(Buffer.from(hex, 'hex'));
});
app.get('/api/hls/:tk/s/:trozo', asinc(async (req, res) => {
  const p = hls.leerPermiso(req.params.tk);
  if (!p || !/^[\w-]+\.ts$/.test(req.params.trozo)) return res.status(403).send('Permiso caducado');
  res.set('Cache-Control', 'no-store').redirect(302, await e2.urlCorta(`${p.prefijo}/${req.params.trozo}`, 120));
}));

app.post('/api/cuenta/registro', asinc(async (req, res) => res.status(201).json(await cuentas.registrar(req.body ?? {}, req.ip))));
app.post('/api/cuenta/entrar', asinc(async (req, res) => res.json(await cuentas.entrar(req.body ?? {}, req.ip))));
app.get('/api/cuenta', conCuenta, (req, res) => {
  const { id, email, nombre, creado, datos } = req.usuario;
  res.set('Cache-Control', 'no-store').json({ usuario: { id, email, nombre, creado }, datos: datos ?? {}, ahora: Date.now() });
});
app.put('/api/cuenta/datos', conCuenta, (req, res) => res.json({ datos: cuentas.guardarDatos(req.usuario, req.body?.claves, req.body ?? {}), ahora: Date.now() }));
// Dispositivos con la sesión abierta
app.get('/api/cuenta/sesiones', conCuenta, (req, res) => res.json(cuentas.sesiones(req.usuario, req.sesion)));
// «actual» = la de este dispositivo (al pulsar Cerrar sesión)
app.delete('/api/cuenta/sesiones/:id', conCuenta, (req, res) => { cuentas.cerrarSesion(req.usuario, req.params.id === 'actual' ? req.sesion : req.params.id); res.json({ ok: true }); });
app.post('/api/cuenta/sesiones/cerrar-otras', conCuenta, (req, res) => { cuentas.cerrarOtras(req.usuario, req.sesion); res.json({ ok: true }); });
app.put('/api/cuenta/perfil', conCuenta, (req, res) => res.json({ usuario: cuentas.cambiarNombre(req.usuario, req.body ?? {}) }));
app.put('/api/cuenta/contrasena', conCuenta, asinc(async (req, res) => { await cuentas.cambiarContrasena(req.usuario, req.body ?? {}); res.json({ ok: true }); }));
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// ---------- Web ----------
// morvehtv.es abre la bienvenida (comienza.html); el catálogo vive en /ver
app.get(['/', '/comienza'], (req, res) => res.sendFile(join(WEB, 'comienza.html')));
app.get('/ver', (req, res) => res.sendFile(join(WEB, 'index.html')));
app.use(express.static(WEB, { extensions: ['html'], index: false }));

app.use((err, req, res, next) => {
  const status = err.status ?? err.$metadata?.httpStatusCode ?? 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message ?? 'Error interno' });
});

const origenCatalogo = await iniciarDb();
importador.iniciar();
app.listen(PORT, () => {
  console.log(`Fotograma en http://localhost:${PORT}`);
  console.log(`  IDrive e2: ${e2.configurado ? `bucket "${e2.bucket}"` : 'SIN CONFIGURAR (rellena .env)'}`);
  console.log(`  Catálogo:  ${titulos.todos().length} títulos (cargado de ${origenCatalogo})`);
  console.log(`  TMDB:      ${tmdb.configurado ? 'ok' : 'SIN CONFIGURAR'}`);
  if (!ADMIN_KEY) console.log('  Aviso: falta ADMIN_KEY, el panel de administración está bloqueado');
});
