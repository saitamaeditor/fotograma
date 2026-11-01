import { api, esc, avisar, iconos } from './api.js';

const vista = document.getElementById('vista');
const cabecera = document.getElementById('cabecera');

// ---------- Datos locales del espectador (mi lista y progreso) ----------
function leer(clave, def) {
  try { return JSON.parse(localStorage.getItem(clave)) ?? def; } catch { return def; }
}
function escribir(clave, valor) {
  try { localStorage.setItem(clave, JSON.stringify(valor)); } catch { /* modo privado */ }
}
const miLista = {
  ids: () => leer('fg-lista', []),
  tiene: (id) => miLista.ids().includes(id),
  alternar(id) {
    const ids = miLista.ids();
    const i = ids.indexOf(id);
    if (i === -1) ids.unshift(id); else ids.splice(i, 1);
    escribir('fg-lista', ids);
    return i === -1;
  },
};
// progreso[id] = { t, e, segundo, duracion, fecha }
const progreso = {
  todo: () => leer('fg-progreso', {}),
  de: (id) => progreso.todo()[id],
  guardar(id, datos) {
    const p = progreso.todo();
    p[id] = { ...datos, fecha: Date.now() };
    escribir('fg-progreso', p);
  },
};

// ---------- Plantillas ----------
// En filas: tarjeta horizontal (imagen de fondo) que se amplía con info al pasar el ratón.
// En rejillas: cartel vertical.
function tarjeta(t, { vertical = false, puesto } = {}) {
  const p = progreso.de(t.id);
  const pct = p?.duracion ? Math.min(100, (p.segundo / p.duracion) * 100) : 0;
  const imagen = vertical ? t.poster : t.fondo ?? t.poster;
  return `
    <a class="tarjeta ${vertical ? 'vertical' : 'horizontal'} ${puesto ? 'top' : ''}" href="#/titulo/${t.id}">
      ${puesto ? `<span class="puesto" aria-hidden="true">${puesto}</span>` : ''}
      <div class="tarjeta-img">
        ${imagen ? `<img src="${esc(puesto ? t.poster ?? imagen : imagen)}" alt="" loading="lazy" />` : ''}
        ${!vertical && !puesto ? `<span class="tarjeta-nombre">${esc(t.titulo)}</span>` : ''}
        ${!imagen ? `<div class="tarjeta-sin">${esc(t.titulo)}</div>` : ''}
        ${t.disponible ? '' : '<span class="insignia pronto">Próximamente</span>'}
        ${pct > 1 ? `<div class="progreso"><span style="width:${pct}%"></span></div>` : ''}
      </div>
      ${vertical ? `
        <div class="tarjeta-titulo">${esc(t.titulo)}</div>
        <div class="tarjeta-sub">${esc([t.anio, t.tipo === 'serie' ? 'Serie' : 'Película'].filter(Boolean).join(' · '))}</div>` : `
        <div class="tarjeta-info">
          <div class="tarjeta-botones">
            <span class="redondo blanco">${iconos.play}</span>
            <span class="redondo">${miLista.tiene(t.id) ? iconos.check : iconos.mas}</span>
            <span class="redondo derecha">${iconos.der}</span>
          </div>
          <div class="tarjeta-meta">
            ${t.valoracion ? `<span class="coincide">${Math.round(t.valoracion * 10)} % de valoración</span>` : ''}
            ${t.anio ? `<span>${esc(t.anio)}</span>` : ''}
            <span class="etiqueta">${t.tipo === 'serie' ? 'Serie' : 'Película'}</span>
          </div>
          <div class="tarjeta-generos">${(t.generos ?? []).slice(0, 3).map(esc).join(' <i>•</i> ')}</div>
        </div>`}
    </a>`;
}

function fila(titulo, items, top = false) {
  return `
    <section class="fila ${top ? 'fila-top' : ''}">
      <div class="fila-cab"><h2>${esc(titulo)}</h2></div>
      <div class="fila-pista">
        <button class="flecha izq" aria-label="Anterior">${iconos.izq}</button>
        <div class="carrusel">${items.map((t, i) => tarjeta(t, top ? { puesto: i + 1 } : {})).join('')}</div>
        <button class="flecha der" aria-label="Siguiente">${iconos.der}</button>
      </div>
    </section>`;
}

function meta(t) {
  return `
    <div class="meta">
      ${t.valoracion ? `<span class="nota">${iconos.estrella} ${t.valoracion}</span>` : ''}
      ${t.anio ? `<span>${esc(t.anio)}</span>` : ''}
      ${t.duracion && t.tipo === 'pelicula' ? `<span>${Math.floor(t.duracion / 60)} h ${t.duracion % 60} min</span>` : ''}
      ${t.temporadas?.length ? `<span>${t.temporadas.length} temporada${t.temporadas.length > 1 ? 's' : ''}</span>` : ''}
      <span class="etiqueta">${t.tipo === 'serie' ? 'Serie' : 'Película'}</span>
      ${(t.generos ?? []).slice(0, 3).map((g) => `<span>${esc(g)}</span>`).join('<span>·</span>')}
    </div>`;
}

const cargando = () => '<div class="cargando"><div class="spinner" aria-label="Cargando"></div></div>';
const vacio = (titulo, texto) => `<div class="vacio"><h2>${esc(titulo)}</h2><p>${esc(texto)}</p></div>`;

function activarCarruseles() {
  for (const pista of vista.querySelectorAll('.fila-pista')) {
    const c = pista.querySelector('.carrusel');
    pista.querySelector('.izq').onclick = () => c.scrollBy({ left: -c.clientWidth * 0.85, behavior: 'smooth' });
    pista.querySelector('.der').onclick = () => c.scrollBy({ left: c.clientWidth * 0.85, behavior: 'smooth' });
  }
}

// ---------- Vistas ----------
async function verInicio() {
  const { destacado, filas } = await api('/inicio');
  if (!filas.length) {
    vista.innerHTML = `<div class="pagina">${vacio('El catálogo está vacío', 'Entra en /admin para añadir películas y series.')}</div>`;
    return;
  }
  const todos = new Map(filas.flatMap((f) => f.items).map((t) => [t.id, t]));
  const seguir = Object.entries(progreso.todo())
    .sort((a, b) => b[1].fecha - a[1].fecha)
    .map(([id]) => todos.get(id))
    .filter(Boolean);

  vista.innerHTML = `
    ${destacado ? `
      <section class="hero">
        <div class="hero-fondo" style="background-image:url('${esc(destacado.fondo)}')"></div>
        <div class="hero-contenido">
          ${meta(destacado)}
          <h1>${esc(destacado.titulo)}</h1>
          <p>${esc(destacado.sinopsis)}</p>
          <div class="acciones">
            ${destacado.disponible ? `<a class="btn btn-primario" href="#/ver/${destacado.id}">${iconos.play} Reproducir</a>` : ''}
            <a class="btn btn-secundario" href="#/titulo/${destacado.id}">${iconos.info} Más información</a>
          </div>
        </div>
      </section>` : '<div style="height:90px"></div>'}
    <div class="filas">
      ${seguir.length ? fila('Seguir viendo', seguir) : ''}
      ${filas.map((f) => (f.titulo === 'Mejor valorados' ? fila('Top 10 en Fotograma', f.items.slice(0, 10), true) : fila(f.titulo, f.items))).join('')}
    </div>`;
  activarCarruseles();
}

async function verCatalogo(tipo) {
  const titulo = { pelicula: 'Películas', serie: 'Series' }[tipo];
  const params = new URLSearchParams(location.hash.split('?')[1]);
  const genero = params.get('genero') ?? '';
  const [lista, generos] = await Promise.all([
    api(`/titulos?tipo=${tipo}${genero ? `&genero=${encodeURIComponent(genero)}` : ''}`),
    api('/generos'),
  ]);
  const base = tipo === 'serie' ? '#/series' : '#/peliculas';
  vista.innerHTML = `
    <div class="pagina">
      <div class="pagina-cab">
        <h1>${titulo}</h1>
        <div class="chips">
          <a class="chip ${genero ? '' : 'activo'}" href="${base}">Todo</a>
          ${generos.map((g) => `<a class="chip ${g === genero ? 'activo' : ''}" href="${base}?genero=${encodeURIComponent(g)}">${esc(g)}</a>`).join('')}
        </div>
      </div>
      ${lista.length ? `<div class="rejilla">${lista.map((t) => tarjeta(t, { vertical: true })).join('')}</div>` : vacio('Nada por aquí', 'Todavía no hay títulos en esta sección.')}
    </div>`;
}

async function verBusqueda() {
  const q = new URLSearchParams(location.hash.split('?')[1]).get('q') ?? '';
  document.querySelector('#buscador input').value = q;
  const lista = q ? await api(`/titulos?q=${encodeURIComponent(q)}`) : [];
  vista.innerHTML = `
    <div class="pagina">
      <div class="pagina-cab"><h1>${q ? `Resultados para «${esc(q)}»` : 'Buscar'}</h1></div>
      ${lista.length ? `<div class="rejilla">${lista.map((t) => tarjeta(t, { vertical: true })).join('')}</div>` : vacio('Sin resultados', 'Prueba con otro título.')}
    </div>`;
}

async function verMiLista() {
  const ids = miLista.ids();
  const todos = ids.length ? await api('/titulos') : [];
  const lista = ids.map((id) => todos.find((t) => t.id === id)).filter(Boolean);
  vista.innerHTML = `
    <div class="pagina">
      <div class="pagina-cab"><h1>Mi lista</h1></div>
      ${lista.length ? `<div class="rejilla">${lista.map((t) => tarjeta(t, { vertical: true })).join('')}</div>` : vacio('Tu lista está vacía', 'Pulsa «Mi lista» en cualquier título para guardarlo aquí.')}
    </div>`;
}

function siguienteEpisodio(t, temporada, episodio) {
  const lista = (t.temporadas ?? []).flatMap((s) => s.episodios.filter((e) => e.disponible).map((e) => ({ t: s.numero, e: e.numero, ep: e })));
  const i = lista.findIndex((x) => x.t === temporada && x.e === episodio);
  return i === -1 ? lista[0] : lista[i + 1];
}

async function verTitulo(id) {
  const t = await api(`/titulos/${id}`);
  document.title = `${t.titulo} · Fotograma`;
  const p = progreso.de(id);
  let botonVer = '';
  if (t.tipo === 'pelicula' && t.disponible) {
    botonVer = `<a class="btn btn-primario" href="#/ver/${id}">${iconos.play} ${p ? 'Continuar' : 'Reproducir'}</a>`;
  } else if (t.tipo === 'serie' && t.disponible) {
    const sig = p ? { t: p.t, e: p.e } : siguienteEpisodio(t);
    botonVer = `<a class="btn btn-primario" href="#/ver/${id}?t=${sig.t}&e=${sig.e}">${iconos.play} ${p ? 'Continuar' : 'Ver'} T${sig.t}:E${sig.e}</a>`;
  }
  const enLista = miLista.tiene(id);

  vista.innerHTML = `
    <article class="ficha">
      <section class="ficha-hero">
        <div class="hero-fondo" style="background-image:url('${esc(t.fondo ?? t.poster ?? '')}')"></div>
        <div class="ficha-grid">
          <div class="ficha-poster">${t.poster ? `<img src="${esc(t.poster)}" alt="Cartel de ${esc(t.titulo)}" />` : ''}</div>
          <div>
            <h1>${esc(t.titulo)}</h1>
            ${t.tituloOriginal && t.tituloOriginal !== t.titulo ? `<p class="original">${esc(t.tituloOriginal)}</p>` : ''}
            ${meta(t)}
            <p class="sinopsis">${esc(t.sinopsis || 'Sin sinopsis.')}</p>
            ${t.reparto?.length ? `<p class="reparto"><b>Reparto:</b> ${esc(t.reparto.join(', '))}</p>` : ''}
            <div class="acciones">
              ${botonVer || '<span class="btn btn-secundario" aria-disabled="true">Próximamente</span>'}
              <button class="btn btn-secundario" id="btn-lista">${enLista ? iconos.check : iconos.mas} Mi lista</button>
              ${t.trailer ? `<a class="btn btn-secundario" href="${esc(t.trailer)}" target="_blank" rel="noopener">Tráiler</a>` : ''}
            </div>
          </div>
        </div>
      </section>
      ${t.tipo === 'serie' && t.temporadas?.length ? `
        <section class="temporadas">
          <div class="temporadas-cab">
            <h2>Episodios</h2>
            <select class="selector" id="sel-temporada" aria-label="Temporada">
              ${t.temporadas.map((s) => `<option value="${s.numero}">${esc(s.nombre || `Temporada ${s.numero}`)}</option>`).join('')}
            </select>
          </div>
          <div class="episodios" id="episodios"></div>
        </section>` : ''}
    </article>`;

  document.getElementById('btn-lista').onclick = (ev) => {
    const ahora = miLista.alternar(id);
    ev.currentTarget.innerHTML = `${ahora ? iconos.check : iconos.mas} Mi lista`;
    avisar(ahora ? 'Añadido a Mi lista' : 'Quitado de Mi lista');
  };

  const sel = document.getElementById('sel-temporada');
  if (sel) {
    const pintar = () => {
      const s = t.temporadas.find((x) => x.numero === Number(sel.value));
      document.getElementById('episodios').innerHTML = s.episodios.length
        ? s.episodios.map((e) => `
          <button class="episodio" ${e.disponible ? `data-ver="#/ver/${id}?t=${s.numero}&e=${e.numero}"` : 'aria-disabled="true"'}>
            <span class="episodio-num">${e.numero}</span>
            <span class="episodio-img">
              ${e.imagen ? `<img src="${esc(e.imagen)}" alt="" loading="lazy" />` : ''}
              <span class="play">${iconos.play}</span>
            </span>
            <span>
              <h3>${e.numero}. ${esc(e.titulo)}</h3>
              <p>${esc(e.disponible ? e.sinopsis || '' : 'Próximamente')}</p>
            </span>
            <span class="dur">${e.duracion ? `${e.duracion} min` : ''}</span>
          </button>`).join('')
        : vacio('Sin episodios', 'Esta temporada todavía no tiene episodios.');
      for (const b of document.querySelectorAll('[data-ver]')) b.onclick = () => (location.hash = b.dataset.ver);
    };
    if (p?.t) sel.value = p.t;
    sel.onchange = pintar;
    pintar();
  }
}

async function verReproductor(id) {
  const params = new URLSearchParams(location.hash.split('?')[1]);
  const temporada = Number(params.get('t')) || undefined;
  const episodio = Number(params.get('e')) || undefined;
  const t = await api(`/titulos/${id}`);
  const q = t.tipo === 'serie' ? `?t=${temporada}&e=${episodio}` : '';
  const { url } = await api(`/titulos/${id}/reproducir${q}`);
  const ep = t.tipo === 'serie' ? t.temporadas.find((s) => s.numero === temporada)?.episodios.find((e) => e.numero === episodio) : null;
  const sig = t.tipo === 'serie' ? siguienteEpisodio(t, temporada, episodio) : null;

  vista.innerHTML = `
    <div class="reproductor" id="reproductor">
      <div class="reproductor-barra">
        <a class="btn btn-secundario btn-icono" href="#/titulo/${id}" aria-label="Volver">${iconos.izq}</a>
        <div>
          <h2>${esc(t.titulo)}</h2>
          ${ep ? `<div class="sub">T${temporada}:E${episodio} · ${esc(ep.titulo)}</div>` : ''}
        </div>
        ${sig ? `<a class="btn btn-secundario btn-chico reproductor-sig" href="#/ver/${id}?t=${sig.t}&e=${sig.e}">Siguiente episodio ${iconos.der}</a>` : ''}
      </div>
      <video id="video" src="${esc(url)}" controls autoplay playsinline preload="metadata"></video>
    </div>`;

  const video = document.getElementById('video');
  const caja = document.getElementById('reproductor');
  const previo = progreso.de(id);
  const mismo = t.tipo === 'pelicula' || (previo?.t === temporada && previo?.e === episodio);
  video.addEventListener('loadedmetadata', () => {
    if (mismo && previo?.segundo && previo.segundo < video.duration - 30) video.currentTime = previo.segundo;
  }, { once: true });

  let ultimo = 0;
  video.addEventListener('timeupdate', () => {
    if (Date.now() - ultimo < 5000) return;
    ultimo = Date.now();
    progreso.guardar(id, { t: temporada, e: episodio, segundo: video.currentTime, duracion: video.duration });
  });
  video.addEventListener('ended', () => {
    if (sig) location.hash = `#/ver/${id}?t=${sig.t}&e=${sig.e}`;
    else {
      const p = progreso.todo();
      delete p[id];
      escribir('fg-progreso', p);
    }
  });
  video.addEventListener('error', () => avisar('No se pudo cargar el vídeo. Revisa el CORS del bucket o el formato del archivo.', true));

  let quieto;
  const mover = () => {
    caja.classList.remove('quieto');
    clearTimeout(quieto);
    quieto = setTimeout(() => !video.paused && caja.classList.add('quieto'), 2500);
  };
  caja.addEventListener('mousemove', mover);
  caja.addEventListener('touchstart', mover, { passive: true });
  mover();
}

// ---------- Enrutador ----------
const rutas = [
  [/^#?\/?$/, verInicio, 'inicio'],
  [/^#\/peliculas/, () => verCatalogo('pelicula'), 'peliculas'],
  [/^#\/series/, () => verCatalogo('serie'), 'series'],
  [/^#\/buscar/, verBusqueda, 'buscar'],
  [/^#\/mi-lista/, verMiLista, 'mi-lista'],
  [/^#\/titulo\/([\w-]+)/, verTitulo, 'titulo'],
  [/^#\/ver\/([\w-]+)/, verReproductor, 'ver'],
];

async function enrutar() {
  const hash = location.hash || '#/';
  const [patron, fn, nombre] = rutas.find(([re]) => re.test(hash)) ?? rutas[0];
  const [, param] = hash.match(patron) ?? [];
  const reproduciendo = nombre === 'ver';
  cabecera.hidden = reproduciendo;
  document.querySelector('.pie').hidden = reproduciendo;
  document.getElementById('nav-movil').hidden = reproduciendo;
  document.title = 'Fotograma';
  for (const a of document.querySelectorAll('#nav a, #nav-movil a')) {
    a.classList.toggle('activo', a.getAttribute('href') === `#/${nombre === 'inicio' ? '' : nombre}`);
  }
  vista.innerHTML = cargando();
  window.scrollTo(0, 0);
  try {
    await fn(param);
  } catch (err) {
    vista.innerHTML = `<div class="pagina">${vacio('Algo ha fallado', err.message)}</div>`;
  }
}

document.getElementById('nav-movil').innerHTML = `
  <a href="#/">${iconos.casa}Inicio</a>
  <a href="#/peliculas">${iconos.peli}Películas</a>
  <a href="#/series">${iconos.tv}Series</a>
  <a href="#/mi-lista">${iconos.lista}Mi lista</a>`;

document.getElementById('buscador').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const q = new FormData(ev.currentTarget).get('q').trim();
  location.hash = q ? `#/buscar?q=${encodeURIComponent(q)}` : '#/';
});
let tecleo;
document.querySelector('#buscador input').addEventListener('input', (ev) => {
  clearTimeout(tecleo);
  const q = ev.target.value.trim();
  if (q.length >= 2) tecleo = setTimeout(() => (location.hash = `#/buscar?q=${encodeURIComponent(q)}`), 350);
});

window.addEventListener('scroll', () => cabecera.classList.toggle('solida', window.scrollY > 40), { passive: true });
window.addEventListener('hashchange', enrutar);
enrutar();
