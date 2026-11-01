// Avisos de contenido nuevo en un grupo de Telegram. El bot (token de @BotFather) y el
// grupo se configuran desde el panel y se guardan con el catálogo; el token nunca se
// devuelve entero al navegador.
import { ajustes, titulos } from './db.js';
import { categoriaDe as seccionDe } from './plataformas.js';

const WEB = (process.env.PUBLIC_URL ?? 'https://morvehtv.es').replace(/\/$/, '');
const DOWNLOADER = '4040796'; // código de la app en Downloader (Fire TV / Android TV)
const historial = []; // últimos avisos enviados (o fallidos), para verlos en el panel

// Secciones de los avisos; en grupos con temas cada una puede ir a su tema.
// Los documentales y docuseries son películas y series con el género «Documental».
export const SECCIONES = {
  pelicula: { nombre: 'Películas', tema: '🎬 Películas', color: 16478047, cabecera: '🎬 <b>Nueva película en MorvehTV</b>' },
  serie: { nombre: 'Series', tema: '📺 Series', color: 7322096, cabecera: '📺 <b>Nueva serie en MorvehTV</b>' },
  documental: { nombre: 'Documentales', tema: '🎥 Documentales', color: 16766590, cabecera: '🎥 <b>Nuevo documental en MorvehTV</b>' },
  docuserie: { nombre: 'Docuseries', tema: '🎞 Docuseries', color: 9367192, cabecera: '🎞 <b>Nueva docuserie en MorvehTV</b>' },
  'anime-pelicula': { nombre: 'Películas anime', tema: '🍥 Películas anime', color: 16749490, cabecera: '🍥 <b>Nueva película anime en MorvehTV</b>' },
  'anime-serie': { nombre: 'Series anime', tema: '🍥 Series anime', color: 13338331, cabecera: '🍥 <b>Nueva serie anime en MorvehTV</b>' },
  programa: { nombre: 'Programas de TV', tema: '📡 Programas de TV', color: 7322096, cabecera: '📡 <b>Nuevo programa de TV en MorvehTV</b>' },
  'novela-turca': { nombre: 'Novelas turcas', tema: '🇹🇷 Novelas turcas', color: 16478047, cabecera: '🇹🇷 <b>Nueva novela turca en MorvehTV</b>' },
};
// Si una sección no tiene tema propio, usa el de su tipo (documental y anime → películas, docuserie y series anime → series)
const BASE = { documental: 'pelicula', docuserie: 'serie', 'anime-pelicula': 'pelicula', 'anime-serie': 'serie', programa: 'serie', 'novela-turca': 'serie' };

const config = () => ({ activo: true, downloader: DOWNLOADER, ...ajustes.obtener('telegram') });

async function llamar(token, metodo, cuerpo = {}) {
  const r = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  const d = await r.json().catch(() => ({}));
  if (!d.ok) throw new Error(`Telegram: ${d.description ?? `error ${r.status}`}`);
  return d.result;
}

export function estado() {
  const { token, chatId, chatNombre, bot, activo, esForo, temas, downloader } = config();
  return {
    configurado: Boolean(token && chatId),
    activo,
    bot: bot ?? null,
    token: token ? `…${token.slice(-4)}` : null,
    chatId: chatId ?? null,
    chatNombre: chatNombre ?? null,
    esForo: Boolean(esForo),
    downloader: downloader || null,
    temas: Object.fromEntries(Object.keys(SECCIONES).map((s) => [s, temas?.[s] ?? null])),
    historial,
  };
}

// Guarda lo que llegue; si cambia el token, comprueba antes que es válido
export async function configurar({ token, chatId, chatNombre, esForo, temas, activo, downloader }) {
  const actual = config();
  const nuevo = { ...actual };
  if (token && token !== actual.token) {
    const yo = await llamar(token, 'getMe');
    Object.assign(nuevo, { token, bot: yo.username, chatId: null, chatNombre: null, esForo: false, temas: null });
  }
  // Al cambiar de grupo se olvidan los temas del anterior
  if (chatId !== undefined && String(chatId || '') !== String(actual.chatId ?? '')) {
    Object.assign(nuevo, { chatId: chatId || null, chatNombre: chatNombre ?? null, esForo: Boolean(esForo), temas: null });
  }
  // temas: { pelicula: { id, nombre } | null, serie: … }; null = tema General
  if (temas !== undefined) nuevo.temas = { ...nuevo.temas, ...temas };
  if (activo !== undefined) nuevo.activo = Boolean(activo);
  // Vacío = sin botón de la app
  if (downloader !== undefined) nuevo.downloader = String(downloader).replace(/\D/g, '');
  ajustes.guardar('telegram', nuevo);
  return estado();
}

// Grupos donde está el bot, sacados de sus mensajes recientes (hay que añadirlo al
// grupo y escribir algo después para que aparezca)
export async function buscarGrupos() {
  const { token } = config();
  if (!token) throw new Error('Primero guarda el token del bot');
  const updates = await llamar(token, 'getUpdates', { allowed_updates: ['message', 'my_chat_member', 'channel_post'] });
  const grupos = new Map();
  for (const u of updates) {
    const chat = u.message?.chat ?? u.my_chat_member?.chat ?? u.channel_post?.chat;
    if (chat && chat.type !== 'private') grupos.set(String(chat.id), { id: String(chat.id), nombre: chat.title ?? String(chat.id), tipo: chat.type, esForo: Boolean(chat.is_forum) });
  }
  return [...grupos.values()];
}

// Temas del grupo que el bot ha visto en mensajes recientes (hay que escribir algo dentro
// de cada tema para que aparezca) más los que ya están guardados
export async function buscarTemas() {
  const { token, chatId, temas } = config();
  if (!token || !chatId) throw new Error('Primero elige el grupo');
  const updates = await llamar(token, 'getUpdates', { allowed_updates: ['message'] });
  const vistos = new Map();
  for (const t of Object.values(temas ?? {})) if (t) vistos.set(String(t.id), t);
  for (const { message: m } of updates) {
    if (!m || String(m.chat.id) !== String(chatId) || !m.message_thread_id) continue;
    const nombre = m.forum_topic_created?.name ?? m.reply_to_message?.forum_topic_created?.name;
    const id = String(m.message_thread_id);
    if (nombre || !vistos.has(id)) vistos.set(id, { id, nombre: nombre ?? vistos.get(id)?.nombre ?? `Tema ${id}` });
  }
  return [...vistos.values()];
}

// Crea un tema por cada sección que aún no tenga uno (el bot debe ser admin con permiso
// de gestionar temas): 🎬 Películas, 📺 Series, 🎥 Documentales y 🎞 Docuseries
export async function crearTemas() {
  const { token, chatId, temas: actuales } = config();
  if (!token || !chatId) throw new Error('Primero elige el grupo');
  const temas = {};
  for (const [clave, s] of Object.entries(SECCIONES)) {
    if (actuales?.[clave]) continue;
    const t = await llamar(token, 'createForumTopic', { chat_id: chatId, name: s.tema, icon_color: s.color });
    temas[clave] = { id: String(t.message_thread_id), nombre: t.name };
  }
  await configurar({ temas, esForo: true });
  return estado();
}

const html = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function enviar({ foto, texto, boton, seccion }) {
  const { token, chatId, temas, downloader } = config();
  // En grupos con temas, cada sección va a su tema
  const tema = (temas?.[seccion] ?? temas?.[BASE[seccion]])?.id;
  const extra = {
    // Botones: ver en la web y, debajo, la app con su código de Downloader
    ...((boton || downloader) && { reply_markup: { inline_keyboard: [
      ...(boton ? [[{ text: boton.texto, url: boton.url }]] : []),
      ...(downloader ? [[{ text: `📲 APP MOVIL/TV · Código Downloader: ${downloader}`, url: `https://aftv.news/${downloader}` }]] : []),
    ] } }),
    ...(tema && { message_thread_id: Number(tema) }),
  };
  if (foto) {
    try {
      return await llamar(token, 'sendPhoto', { chat_id: chatId, photo: foto, caption: texto, parse_mode: 'HTML', ...extra });
    } catch (err) {
      // Si el tema no existe, no tiene sentido reintentar sin foto
      if (/thread|topic/i.test(err.message)) throw err;
      // Si Telegram no puede bajar el cartel, va solo el texto
    }
  }
  return llamar(token, 'sendMessage', { chat_id: chatId, text: texto, parse_mode: 'HTML', disable_web_page_preview: true, ...extra });
}

function mensaje(t, episodios) {
  const serie = t.tipo === 'serie';
  const seccion = seccionDe(t);
  let cabecera = SECCIONES[seccion].cabecera;
  let detalle = '';
  if (serie && episodios.length) {
    const lista = episodios.map((e) => `T${e.temporada}:E${e.episodio}`);
    const yaHabia = (t.temporadas ?? []).some((s) => s.episodios.some((e) => e.videoKey && !episodios.some((n) => n.temporada === s.numero && n.episodio === e.numero)));
    if (yaHabia) cabecera = episodios.length === 1 ? '📺 <b>Nuevo episodio en MorvehTV</b>' : `📺 <b>${episodios.length} episodios nuevos en MorvehTV</b>`;
    detalle = `\n🎞 ${lista.length > 6 ? `${lista.slice(0, 6).join(', ')} y ${lista.length - 6} más` : lista.join(', ')}`;
  }
  const datos = [t.valoracion && `⭐ ${t.valoracion}`, ...(t.generos ?? []).slice(0, 3)].filter(Boolean).join(' · ');
  const sinopsis = t.sinopsis?.length > 300 ? `${t.sinopsis.slice(0, 297)}…` : t.sinopsis;
  const texto = [
    cabecera,
    '',
    `<b>${html(t.titulo)}</b>${t.anio ? ` (${html(t.anio)})` : ''}${html(detalle)}`,
    datos ? html(datos) : '',
    sinopsis ? `\n<i>${html(sinopsis)}</i>` : '',
  ].filter((l) => l !== '').join('\n');
  return { foto: t.poster, texto, seccion, boton: { texto: '▶ Ver en MorvehTV', url: `${WEB}/ver#/titulo/${t.id}` } };
}

// `novedades`: [{ id, temporada?, episodio? }]. Los episodios de una misma serie van en un solo mensaje.
export async function avisar(novedades) {
  const { token, chatId, activo } = config();
  if (!token || !chatId || !activo || !novedades.length) return;
  const porTitulo = new Map();
  for (const n of novedades) {
    if (!porTitulo.has(n.id)) porTitulo.set(n.id, []);
    if (n.temporada) porTitulo.get(n.id).push({ temporada: n.temporada, episodio: n.episodio });
  }
  for (const [id, episodios] of porTitulo) {
    const t = titulos.obtener(id);
    if (!t) continue;
    const entrada = { fecha: new Date().toISOString(), titulo: t.titulo, ok: true };
    try {
      await enviar(mensaje(t, episodios));
    } catch (err) {
      Object.assign(entrada, { ok: false, error: err.message });
      console.error('Aviso de Telegram fallido:', err.message);
    }
    historial.unshift(entrada);
    historial.length = Math.min(historial.length, 10);
  }
}

// Un mensaje de prueba por cada tema distinto (sin repetir si varias secciones comparten tema)
export async function probar() {
  const { token, chatId, temas } = config();
  if (!token || !chatId) throw new Error('Falta el token del bot o el grupo');
  const enviados = new Set();
  for (const [clave, s] of Object.entries(SECCIONES)) {
    const tema = (temas?.[clave] ?? temas?.[BASE[clave]])?.id ?? 'general';
    if (enviados.has(tema)) continue;
    enviados.add(tema);
    const ejemplo = titulos.todos().find((t) => seccionDe(t) === clave);
    const m = ejemplo ? mensaje(ejemplo, []) : { texto: `Aquí llegarán los avisos de ${s.nombre.toLowerCase()}.` };
    await enviar({ ...m, seccion: clave, texto: `🧪 <b>Prueba de avisos de ${s.nombre.toLowerCase()}</b>\n\n${m.texto}` });
  }
}
