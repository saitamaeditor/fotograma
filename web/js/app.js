import { api, esc, avisar, iconos } from './api.js';
import * as cuenta from './cuenta.js';
import { mostrarAviso } from './aviso.js';

const vista = document.getElementById('vista');
const cabecera = document.getElementById('cabecera');

// ---------- Datos del espectador (mi lista y progreso) ----------
// Se guardan en el navegador y, si ha iniciado sesión, también en su cuenta
function leer(clave, def) {
  try { return JSON.parse(localStorage.getItem(clave)) ?? def; } catch { return def; }
}
function escribir(clave, valor) {
  try { localStorage.setItem(clave, JSON.stringify(valor)); } catch { /* modo privado */ }
  cuenta.alEscribir(clave, valor);
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

function tarjeta(t, { vertical = false } = {}) {
  const p = progreso.de(t.id);
  const pct = p?.duracion ? Math.min(100, (p.segundo / p.duracion) * 100) : 0;
  const imagen = vertical ? t.poster : t.fondo ?? t.poster;
  return `
    <a class="tarjeta ${vertical ? 'vertical' : 'horizontal'}" href="#/titulo/${t.id}">
      <div class="tarjeta-img">
        ${imagen ? `<img src="${esc(imagen)}" alt="" loading="lazy" />` : ''}
        ${!vertical ? `<span class="tarjeta-nombre">${esc(t.titulo)}</span>` : ''}
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

// Las categorías: documentales y docuseries llevan el género «Documental», el anime «Anime»,
// los programas «Programa de TV» y las novelas turcas «Novela turca». `ruta` es su dirección en la web (#/peliculas…).
const CATEGORIAS = {
  pelicula: { nombre: 'Películas', unidad: ['película', 'películas'], ruta: 'peliculas' },
  serie: { nombre: 'Series', unidad: ['serie', 'series'], ruta: 'series' },
  documental: { nombre: 'Documentales', unidad: ['documental', 'documentales'], ruta: 'documentales' },
  docuserie: { nombre: 'Docuseries', unidad: ['docuserie', 'docuseries'], ruta: 'docuseries' },
  'anime-pelicula': { nombre: 'Películas anime', unidad: ['película anime', 'películas anime'], ruta: 'anime' },
  'anime-serie': { nombre: 'Series anime', unidad: ['serie anime', 'series anime'], ruta: 'series-anime' },
  programa: { nombre: 'Programas de TV', unidad: ['programa de TV', 'programas de TV'], ruta: 'programas' },
  'novela-turca': { nombre: 'Novelas turcas', unidad: ['novela turca', 'novelas turcas'], ruta: 'novelas-turcas' },
};
// Texto «1 película», «3 series»…
const cuantos = (n, tipo) => `${n} ${(CATEGORIAS[tipo]?.unidad ?? ['título', 'títulos'])[n === 1 ? 0 : 1]}`;

function fila(titulo, items, tipo = 'pelicula') {
  return `
    <section class="fila">
      <div class="fila-cab">
        <h2>${esc(titulo)}</h2>
        <a class="fila-total" href="#/${CATEGORIAS[tipo]?.ruta ?? ''}">${cuantos(items.length, tipo)} · Ver todo ›</a>
      </div>
      <div class="fila-pista">
        <button class="flecha izq" aria-label="Anterior">${iconos.izq}</button>
        <div class="carrusel posters">${items.map((t) => tarjeta(t, { vertical: true })).join('')}</div>
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
// Inicio: el destacado y una fila por categoría con lo último de cada una
async function verInicio() {
  const { destacado, filas } = await api('/portada');
  const y = window.scrollY;
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
      </section>` : '<div class="pagina-cab sin-destacado"><h1>MorvehTV</h1></div>'}
    <div class="filas ${destacado ? '' : 'sin-destacado-filas'}">
      ${filas.length
        ? filas.map((f) => fila(f.titulo, f.items, f.id)).join('')
        : vacio('Todavía no hay nada', 'En cuanto se añada contenido aparecerá aquí.')}
    </div>`;
  activarCarruseles();
  window.scrollTo(0, y);
}

// Página de una categoría: todos sus títulos en una rejilla
async function verCategoria(tipo) {
  const lista = await api(`/titulos?categoria=${tipo}`);
  const c = CATEGORIAS[tipo];
  vista.innerHTML = `
    <div class="pagina">
      <div class="pagina-cab"><h1>${c.nombre}</h1><span class="texto-2">${cuantos(lista.length, tipo)}</span></div>
      ${lista.length
        ? `<div class="rejilla">${lista.map((t) => tarjeta(t, { vertical: true })).join('')}</div>`
        : vacio(`Sin ${c.unidad[1]}`, `Todavía no hay ${c.unidad[1]} en el catálogo.`)}
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

// ---------- Cuenta: entrar, registrarse y cerrar sesión ----------
const TELEGRAM = 'https://t.me/+-NkYOGhz9NMzNGI0';
const ojo = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';

// 0 = vacía … 4 = fuerte
function fuerza(c) {
  if (!c) return 0;
  let p = 0;
  if (c.length >= 6) p++;
  if (c.length >= 10) p++;
  if (/[a-z]/.test(c) && /[A-Z]/.test(c)) p++;
  if (/\d/.test(c) && /[^A-Za-z0-9]/.test(c)) p++;
  else if (/\d/.test(c) || /[^A-Za-z0-9]/.test(c)) p += 0.5;
  return Math.max(1, Math.min(4, Math.round(p)));
}
const NIVELES = ['', 'Débil', 'Aceptable', 'Buena', 'Fuerte'];

const campo = ({ nombre, etiqueta, tipo = 'text', autocompletar, ayuda = '', extra = '' }) => `
  <label class="c-campo">
    <span class="c-etiqueta">${etiqueta}</span>
    <span class="c-entrada">
      <input name="${nombre}" type="${tipo}" autocomplete="${autocompletar}" ${extra} />
      ${tipo === 'password' ? `<button type="button" class="c-ojo" data-ojo aria-label="Mostrar contraseña">${ojo}</button>` : ''}
    </span>
    <span class="c-ayuda" data-ayuda="${nombre}">${ayuda}</span>
  </label>`;

// Muestra u oculta la contraseña de su campo
function activarOjos(raiz) {
  raiz.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-ojo]');
    if (!b) return;
    const input = b.parentElement.querySelector('input');
    const ver = input.type === 'password';
    input.type = ver ? 'text' : 'password';
    b.classList.toggle('activo', ver);
    b.setAttribute('aria-label', ver ? 'Ocultar contraseña' : 'Mostrar contraseña');
  });
}

function verCuenta() {
  const u = cuenta.usuario();
  if (u) return verPerfil(u);

  const registro = new URLSearchParams(location.hash.split('?')[1]).has('nueva');
  vista.innerHTML = `
    <div class="c-pagina">
      <div class="c-caja">
        <div class="c-logo">Morveh<b>TV</b></div>
        <h1>${registro ? 'Crea tu cuenta gratis' : 'Bienvenido de nuevo'}</h1>
        <p class="c-sub">${registro ? 'Tu lista y lo que estás viendo, en la web, el móvil y la tele.' : 'Entra para seguir viendo donde lo dejaste.'}</p>
        <div class="c-pestanas" role="tablist">
          <a href="#/cuenta" role="tab" aria-selected="${!registro}" class="${registro ? '' : 'activa'}">Iniciar sesión</a>
          <a href="#/cuenta?nueva" role="tab" aria-selected="${registro}" class="${registro ? 'activa' : ''}">Crear cuenta</a>
        </div>
        <form id="form-cuenta" class="c-form" novalidate>
          ${registro ? campo({ nombre: 'nombre', etiqueta: 'Nombre', autocompletar: 'name', extra: 'maxlength="40" placeholder="Cómo quieres que te llamemos"' }) : ''}
          ${campo({ nombre: 'email', etiqueta: 'Correo electrónico', tipo: 'email', autocompletar: 'email', extra: 'placeholder="tu@correo.com" required' })}
          ${campo({ nombre: 'contrasena', etiqueta: 'Contraseña', tipo: 'password', autocompletar: registro ? 'new-password' : 'current-password', extra: `placeholder="${registro ? 'Mínimo 6 caracteres' : 'Tu contraseña'}" required` })}
          ${registro ? `
            <div class="c-fuerza" id="fuerza" data-nivel="0"><i></i><i></i><i></i><i></i><span></span></div>
            ${campo({ nombre: 'repetir', etiqueta: 'Repite la contraseña', tipo: 'password', autocompletar: 'new-password', extra: 'required' })}` : `
            <button type="button" class="c-olvido" id="olvido">¿Olvidaste tu contraseña?</button>
            <div class="c-aviso" id="olvido-info" hidden>Escríbenos por <a href="${TELEGRAM}" target="_blank" rel="noopener">Telegram</a> con el correo de tu cuenta y te daremos una contraseña nueva.</div>`}
          <p class="c-error" id="cuenta-error" role="alert"></p>
          <button class="btn btn-primario c-enviar">${registro ? 'Crear cuenta' : 'Entrar'}</button>
        </form>
        ${registro ? `
          <ul class="c-ventajas">
            <li>Tu lista privada, igual en todos tus dispositivos</li>
            <li>Sigue viendo justo donde lo dejaste</li>
            <li>Gratis y sin anuncios</li>
          </ul>` : ''}
        <p class="c-cambiar">${registro ? '¿Ya tienes cuenta? <a href="#/cuenta">Inicia sesión</a>' : '¿No tienes cuenta? <a href="#/cuenta?nueva">Créala gratis</a>'}</p>
      </div>
    </div>`;

  const form = document.getElementById('form-cuenta');
  const error = document.getElementById('cuenta-error');
  const ayuda = (nombre, texto, mal = true) => {
    const el = form.querySelector(`[data-ayuda="${nombre}"]`);
    if (!el) return;
    el.textContent = texto;
    el.classList.toggle('mal', Boolean(texto) && mal);
    el.classList.toggle('bien', Boolean(texto) && !mal);
  };
  activarOjos(form);
  form.querySelector('input').focus();

  document.getElementById('olvido')?.addEventListener('click', () => { document.getElementById('olvido-info').hidden = false; });

  if (registro) {
    const barra = document.getElementById('fuerza');
    form.contrasena.addEventListener('input', () => {
      const n = fuerza(form.contrasena.value);
      barra.dataset.nivel = n;
      barra.querySelector('span').textContent = NIVELES[n];
      if (form.repetir.value) form.repetir.dispatchEvent(new Event('input'));
    });
    form.repetir.addEventListener('input', () => {
      if (!form.repetir.value) return ayuda('repetir', '');
      const igual = form.repetir.value === form.contrasena.value;
      ayuda('repetir', igual ? '✓ Coinciden' : 'No coinciden', !igual);
    });
  }
  form.email.addEventListener('blur', () => {
    const v = form.email.value.trim();
    ayuda('email', v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? 'Revisa el correo: falta algo' : '');
  });

  form.onsubmit = async (ev) => {
    ev.preventDefault();
    error.textContent = '';
    const email = form.email.value.trim();
    const contrasena = form.contrasena.value;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { ayuda('email', 'Escribe un correo válido'); return form.email.focus(); }
    if (!contrasena) { error.textContent = 'Escribe tu contraseña'; return form.contrasena.focus(); }
    if (registro) {
      if (contrasena.length < 6) { error.textContent = 'La contraseña debe tener al menos 6 caracteres'; return form.contrasena.focus(); }
      if (form.repetir.value !== contrasena) { ayuda('repetir', 'No coinciden'); return form.repetir.focus(); }
    }
    const boton = form.querySelector('.c-enviar');
    boton.disabled = true;
    boton.classList.add('cargando');
    try {
      if (registro) await cuenta.registrar(form.nombre.value.trim(), email, contrasena);
      else await cuenta.entrar(email, contrasena);
      avisar(registro ? `¡Bienvenido, ${cuenta.usuario().nombre}!` : `Hola de nuevo, ${cuenta.usuario().nombre}`);
      location.hash = '#/';
    } catch (err) {
      error.textContent = err.message;
      boton.disabled = false;
      boton.classList.remove('cargando');
    }
  };
}

// Lista de dispositivos con la sesión abierta, con opción de cerrarlos a distancia
async function pintarDispositivos() {
  const caja = document.getElementById('dispositivos');
  if (!caja) return;
  let lista;
  try { lista = await cuenta.dispositivos(); } catch { caja.innerHTML = '<p class="c-sub">No se pudo cargar la lista.</p>'; return; }
  const hace = (f) => {
    const min = Math.round((Date.now() - Date.parse(f)) / 60000);
    if (min < 15) return 'activo ahora';
    if (min < 60) return `hace ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `hace ${h} h`;
    return `hace ${Math.round(h / 24)} días`;
  };
  const otros = lista.filter((d) => !d.actual).length;
  caja.innerHTML = `
    ${lista.map((d) => `
      <div class="c-dispositivo">
        <span class="c-disp-icono">${/TV/i.test(d.dispositivo) ? '📺' : /App|Android|iPhone/i.test(d.dispositivo) ? '📱' : '💻'}</span>
        <div><b>${esc(d.dispositivo)}</b><span>${d.actual ? 'Este dispositivo' : hace(d.ultimo)}</span></div>
        ${d.actual ? '<span class="c-este">Aquí</span>' : `<button class="btn btn-secundario btn-chico" data-cerrar="${esc(d.id)}">Cerrar</button>`}
      </div>`).join('') || '<p class="c-sub">Este navegador entró antes de que existiera la lista de dispositivos.</p>'}
    ${otros ? `<button class="btn btn-secundario c-cerrar-otros" id="cerrar-otros">Cerrar sesión en los demás (${otros})</button>` : ''}`;
  caja.onclick = async (ev) => {
    const b = ev.target.closest('[data-cerrar]');
    try {
      if (b) { await cuenta.cerrarDispositivo(b.dataset.cerrar); avisar('Sesión cerrada en ese dispositivo'); }
      else if (ev.target.closest('#cerrar-otros')) { await cuenta.cerrarOtros(); avisar('Sesión cerrada en los demás dispositivos'); }
      else return;
      pintarDispositivos();
    } catch (err) {
      avisar(err.message, true);
    }
  };
}

function verPerfil(u) {
  const enLista = miLista.ids().length;
  const empezados = Object.keys(progreso.todo()).length;
  const desde = u.creado ? new Date(u.creado).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }) : null;
  vista.innerHTML = `
    <div class="c-pagina">
      <div class="c-caja">
        <div class="c-perfil">
          <span class="c-avatar">${esc((u.nombre || u.email)[0].toUpperCase())}</span>
          <div><p class="c-nombre">${esc(u.nombre)}</p><p class="c-sub">${esc(u.email)}${desde ? ` · desde ${esc(desde)}` : ''}</p></div>
        </div>
        <div class="c-cifras">
          <a href="#/mi-lista"><b>${enLista}</b><span>en tu lista</span></a>
          <div><b>${empezados}</b><span>empezados</span></div>
        </div>
        <p class="c-sub" style="margin-bottom:6px">Tu lista y lo que estás viendo se guardan en tu cuenta. Entra con el mismo correo en el móvil o la tele para tenerlo todo igual.</p>

        <details class="c-seccion" open>
          <summary>Dispositivos conectados</summary>
          <p class="c-sub">Puedes usar tu cuenta en todos los que quieras a la vez: web, móvil y tele.</p>
          <div id="dispositivos" class="c-dispositivos"><p class="c-sub">Cargando…</p></div>
        </details>
        <details class="c-seccion">
          <summary>Cambiar nombre</summary>
          <form id="form-nombre" class="c-form">
            ${campo({ nombre: 'nombre', etiqueta: 'Nombre', autocompletar: 'name', extra: `maxlength="40" value="${esc(u.nombre)}" required` })}
            <button class="btn btn-secundario">Guardar nombre</button>
          </form>
        </details>
        <details class="c-seccion">
          <summary>Cambiar contraseña</summary>
          <form id="form-contrasena" class="c-form">
            ${campo({ nombre: 'actual', etiqueta: 'Contraseña actual', tipo: 'password', autocompletar: 'current-password', extra: 'required' })}
            ${campo({ nombre: 'nueva', etiqueta: 'Contraseña nueva', tipo: 'password', autocompletar: 'new-password', extra: 'minlength="6" placeholder="Mínimo 6 caracteres" required' })}
            ${campo({ nombre: 'repetir', etiqueta: 'Repite la contraseña nueva', tipo: 'password', autocompletar: 'new-password', extra: 'required' })}
            <p class="c-error" id="contrasena-error" role="alert"></p>
            <button class="btn btn-secundario">Cambiar contraseña</button>
          </form>
        </details>
        <button class="btn btn-peligro c-salir" id="salir">Cerrar sesión</button>
      </div>
    </div>`;
  activarOjos(vista);

  pintarDispositivos();

  document.getElementById('salir').onclick = async () => {
    await cuenta.salir();
    avisar('Has cerrado sesión');
    location.hash = '#/';
  };
  document.getElementById('form-nombre').onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      await cuenta.cambiarNombre(ev.currentTarget.nombre.value);
      avisar('Nombre guardado');
      verCuenta();
    } catch (err) {
      avisar(err.message, true);
    }
  };
  document.getElementById('form-contrasena').onsubmit = async (ev) => {
    ev.preventDefault();
    const f = ev.currentTarget;
    const error = document.getElementById('contrasena-error');
    error.textContent = '';
    if (f.nueva.value.length < 6) return (error.textContent = 'La contraseña nueva debe tener al menos 6 caracteres');
    if (f.nueva.value !== f.repetir.value) return (error.textContent = 'Las contraseñas nuevas no coinciden');
    try {
      await cuenta.cambiarContrasena(f.actual.value, f.nueva.value);
      f.reset();
      avisar('Contraseña cambiada');
    } catch (err) {
      error.textContent = err.message;
    }
  };
}

async function verMiLista() {
  const ids = miLista.ids();
  const todos = ids.length ? await api('/titulos') : [];
  const lista = ids.map((id) => todos.find((t) => t.id === id)).filter(Boolean);
  vista.innerHTML = `
    <div class="pagina">
      <div class="pagina-cab"><h1>Mi lista</h1></div>
      ${cuenta.usuario() ? '' : `<p class="aviso-cuenta">Tu lista solo está guardada en este navegador. <a href="#/cuenta">Inicia sesión o crea una cuenta</a> para tenerla también en el móvil y la tele.</p>`}
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
  document.title = `${t.titulo} · MorvehTV`;
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

// Vídeo cifrado (HLS + AES-128): Safari lo reproduce solo; el resto con hls.js, que pide
// la clave al servidor con el permiso de la sesión. Si aún no está cifrado, MP4 firmado.
let hlsJs = null;
async function cargarFuente(video, fuente) {
  if (fuente.tipo !== 'hls') { video.src = fuente.url; return; }
  if (video.canPlayType('application/vnd.apple.mpegurl')) { video.src = fuente.url; return; }
  hlsJs ??= new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js';
    s.onload = () => ok(window.Hls);
    s.onerror = ko;
    document.head.append(s);
  });
  const Hls = await hlsJs;
  const h = new Hls({ maxBufferLength: 60 });
  h.loadSource(fuente.url);
  h.attachMedia(video);
  h.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) avisar('No se pudo cargar el vídeo. Vuelve a intentarlo.', true); });
  // Al salir del reproductor se para la descarga de trozos
  addEventListener('hashchange', () => h.destroy(), { once: true });
}

// Sin menú contextual ni «Guardar vídeo como»
function protegerReproductor(video, marco) {
  video.addEventListener('contextmenu', (ev) => ev.preventDefault());
  marco.addEventListener('contextmenu', (ev) => ev.preventDefault());
}

async function verReproductor(id) {
  const params = new URLSearchParams(location.hash.split('?')[1]);
  const temporada = Number(params.get('t')) || undefined;
  const episodio = Number(params.get('e')) || undefined;
  const t = await api(`/titulos/${id}`);
  // Para ver hace falta cuenta: el servidor solo da el vídeo (cifrado) a usuarios con sesión
  if (!cuenta.usuario()) {
    vista.innerHTML = `
      <div class="c-pagina"><div class="c-caja" style="text-align:center">
        <div class="c-logo">Morveh<b>TV</b></div>
        <h1>Inicia sesión para ver «${esc(t.titulo)}»</h1>
        <p class="c-sub" style="margin:10px 0 22px">Es gratis. Con tu cuenta, además, sigues viendo donde lo dejaste en cualquier dispositivo.</p>
        <a class="btn btn-primario c-enviar" href="#/cuenta">Entrar</a>
        <p class="c-cambiar">¿No tienes cuenta? <a href="#/cuenta?nueva">Créala gratis</a></p>
      </div></div>`;
    return;
  }
  const q = t.tipo === 'serie' ? `?t=${temporada}&e=${episodio}` : '';
  let fuente;
  try {
    fuente = await api(`/titulos/${id}/reproducir${q}`, { token: cuenta.token() });
  } catch (err) {
    if (err.status === 401) { await cuenta.salir({ avisarServidor: false }); location.hash = '#/cuenta'; return; }
    throw err;
  }
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
      <div class="reproductor-video" id="marco">
        <video id="video" controls autoplay playsinline preload="metadata" controlslist="nodownload noremoteplayback" disablepictureinpicture disableremoteplayback></video>
      </div>
    </div>`;

  const video = document.getElementById('video');
  const caja = document.getElementById('reproductor');
  const marco = document.getElementById('marco');
  await cargarFuente(video, fuente);
  protegerReproductor(video, marco);
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
  [/^#\/peliculas/, () => verCategoria('pelicula'), 'peliculas'],
  [/^#\/series-anime/, () => verCategoria('anime-serie'), 'series-anime'],
  [/^#\/series/, () => verCategoria('serie'), 'series'],
  [/^#\/documentales/, () => verCategoria('documental'), 'documentales'],
  [/^#\/docuseries/, () => verCategoria('docuserie'), 'docuseries'],
  [/^#\/anime/, () => verCategoria('anime-pelicula'), 'anime'],
  [/^#\/programas/, () => verCategoria('programa'), 'programas'],
  [/^#\/novelas-turcas/, () => verCategoria('novela-turca'), 'novelas-turcas'],
  [/^#\/buscar/, verBusqueda, 'buscar'],
  [/^#\/mi-lista/, verMiLista, 'mi-lista'],
  [/^#\/cuenta/, verCuenta, 'cuenta'],
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
  document.title = 'MorvehTV';
  for (const a of document.querySelectorAll('#nav a, #nav-movil a')) {
    a.classList.toggle('activo', a.getAttribute('href') === `#/${nombre === 'inicio' ? '' : nombre}`);
  }
  document.querySelector('.nav-mas')?.classList.toggle('activo', Boolean(document.querySelector('.nav-menu a.activo')));
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
  <a href="#/anime">${iconos.peli}Anime</a>
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
mostrarAviso(window.FOTOGRAMA_API ?? '');


// Botón de la cabecera: «Entrar» o el nombre del usuario
const botonCuenta = document.getElementById('boton-cuenta');
const pintarBotonCuenta = (u) => {
  botonCuenta.textContent = u ? u.nombre : 'Entrar';
  botonCuenta.classList.toggle('conectado', Boolean(u));
};
pintarBotonCuenta(cuenta.usuario());
cuenta.alCambiar(pintarBotonCuenta);
// Cuando llegan cambios de otro dispositivo (lista o progreso), se repinta la vista
cuenta.alLlegarDatos(() => {
  const nombre = (rutas.find(([re]) => re.test(location.hash || '#/')) ?? rutas[0])[2];
  if (['inicio', 'peliculas', 'series', 'mi-lista', 'documentales', 'docuseries', 'anime', 'series-anime', 'programas', 'novelas-turcas'].includes(nombre)) {
    const y = window.scrollY;
    enrutar().then(() => window.scrollTo(0, y));
  }
});
// Trae lo último de la cuenta (por si se cambió en otro dispositivo) y repinta
cuenta.refrescar().then((ok) => {
  const nombre = (rutas.find(([re]) => re.test(location.hash || '#/')) ?? rutas[0])[2];
  if (ok && ['inicio', 'peliculas', 'series', 'mi-lista'].includes(nombre)) enrutar();
});

// ---------- Contenido nuevo en tiempo real ----------
// Cada 30 s pregunta a la API si el catálogo ha cambiado. Si sí, repinta la vista actual
// sin recargar ni mover el scroll y avisa de lo que ha llegado. En la ficha y el
// reproductor no se toca nada para no interrumpir.
const CADA_MS = 30_000;
const REPINTABLES = new Set(['inicio', 'peliculas', 'series', 'documentales', 'docuseries', 'anime', 'series-anime', 'programas', 'novelas-turcas', 'buscar', 'mi-lista']);
let version = null;
let conocidos = null;

async function comprobarNovedades() {
  if (document.hidden) return;
  try {
    const n = await api('/novedades');
    const nuevos = conocidos ? n.recientes.filter((t) => !conocidos.has(t.id)) : [];
    conocidos = new Set([...(conocidos ?? []), ...n.recientes.map((t) => t.id)]);
    if (version === null) { version = n.version; return; }
    if (n.version === version) return;
    version = n.version;
    if (nuevos.length) avisar(`Nuevo en MorvehTV: ${nuevos.map((t) => t.titulo).join(', ')}`);
    const hash = location.hash || '#/';
    const [patron, fn, nombre] = rutas.find(([re]) => re.test(hash)) ?? rutas[0];
    if (!REPINTABLES.has(nombre)) return;
    const y = window.scrollY;
    await fn(hash.match(patron)?.[1]);
    window.scrollTo(0, y);
  } catch {
    // Sin conexión o servidor dormido: se reintenta en la próxima vuelta
  }
}

comprobarNovedades();
setInterval(comprobarNovedades, CADA_MS);
document.addEventListener('visibilitychange', () => { if (!document.hidden) comprobarNovedades(); });
