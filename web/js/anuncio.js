// Anuncio «Comienza ahora»: una ventana con las formas de ver MorvehTV (web, Android TV /
// Smart TV con el código de Downloader e iPhone / Mac). Sale en la portada la primera vez
// y luego una vez cada 7 días; también se abre desde el pie de la web.
const CODIGO = '4040796';
const CADA_DIAS = 7;

const iconos = {
  web: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3Z"/></svg>',
  tv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4M9 9.5l2 1.5-2 1.5"/></svg>',
  apple: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.8-3.5.8-.7 0-1.9-.8-3-.8-1.6 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2.1-1.1 2.8-2.3.9-1.3 1.3-2.6 1.3-2.6s-2.5-1-2.5-3.7ZM14.2 5.8c.6-.8 1.1-1.8 1-2.8-.9 0-2 .6-2.6 1.4-.6.7-1.1 1.7-1 2.7 1 .1 2-.5 2.6-1.3Z"/></svg>',
  abrir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  bajar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  cerrar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 6l12 12M18 6 6 18"/></svg>',
};

function leerVisto() {
  try { return Number(localStorage.getItem('fg-anuncio-visto')) || 0; } catch { return 0; }
}
function marcarVisto() {
  try { localStorage.setItem('fg-anuncio-visto', String(Date.now())); } catch { /* modo privado */ }
}

export function abrirAnuncio() {
  if (document.getElementById('anuncio-modal')) return;
  const capa = document.createElement('div');
  capa.className = 'anuncio-modal';
  capa.id = 'anuncio-modal';
  capa.innerHTML = `
    <div class="anuncio-caja" role="dialog" aria-modal="true" aria-labelledby="anuncio-titulo">
      <button class="anuncio-cerrar" aria-label="Cerrar">${iconos.cerrar}</button>
      <h2 id="anuncio-titulo">Comienza ahora</h2>
      <p class="anuncio-lema">Elige tu método de acceso y disfruta MorvehTV al instante.</p>
      <div class="anuncio-opciones">
        <a class="anuncio-opcion" href="https://morvehtv.es" data-cerrar>
          <span class="anuncio-icono">${iconos.web}</span>
          <span class="anuncio-texto"><strong>Ver en Web</strong><span>Acceso online desde cualquier dispositivo</span></span>
          <span class="anuncio-accion">${iconos.abrir}</span>
        </a>
        <a class="anuncio-opcion tv" href="https://aftv.news/${CODIGO}" target="_blank" rel="noopener" data-codigo="${CODIGO}">
          <span class="anuncio-icono">${iconos.tv}</span>
          <span class="anuncio-texto"><strong>Android TV / Smart TV</strong><span>Instala en tu Smart TV con Downloader</span><span class="anuncio-codigo">Código: ${CODIGO}</span></span>
          <span class="anuncio-accion">${iconos.bajar}</span>
        </a>
        <a class="anuncio-opcion ios" href="https://morvehtv.es" data-cerrar>
          <span class="anuncio-icono">${iconos.apple}</span>
          <span class="anuncio-texto"><strong>iPhone / Mac</strong><span>Acceso web optimizado para iOS</span></span>
          <span class="anuncio-accion">${iconos.abrir}</span>
        </a>
      </div>
      <p class="anuncio-pie">En la tele: abre la app <b>Downloader</b>, escribe el código <b>${CODIGO}</b> y pulsa <b>Go</b>.</p>
    </div>`;

  const cerrar = () => {
    marcarVisto();
    capa.classList.remove('visible');
    document.removeEventListener('keydown', alTeclear);
    setTimeout(() => capa.remove(), 200);
  };
  const alTeclear = (ev) => { if (ev.key === 'Escape') cerrar(); };

  capa.addEventListener('click', (ev) => {
    if (ev.target === capa || ev.target.closest('.anuncio-cerrar')) return cerrar();
    // Web e iPhone: ya está en la web, así que solo se cierra el anuncio
    if (ev.target.closest('[data-cerrar]')) { ev.preventDefault(); return cerrar(); }
    const tv = ev.target.closest('[data-codigo]');
    if (tv) navigator.clipboard?.writeText(tv.dataset.codigo).catch(() => {});
  });
  document.addEventListener('keydown', alTeclear);
  document.body.append(capa);
  requestAnimationFrame(() => capa.classList.add('visible'));
  capa.querySelector('.anuncio-cerrar').focus();
}

// Primera visita, o si hace más de CADA_DIAS que se vio por última vez
export function anuncioSiToca() {
  if (Date.now() - leerVisto() < CADA_DIAS * 864e5) return;
  setTimeout(abrirAnuncio, 1200);
}
