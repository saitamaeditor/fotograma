// Aviso que se escribe en el panel (Ajustes → Aviso en la web). Sale en una barra que el
// visitante puede cerrar; si en el panel se cambia el texto, vuelve a salir.
const COLORES = { info: '#2f6fed', novedad: '#1f9d5a', importante: '#e31b23' };
const ICONOS = { info: 'ℹ️', novedad: '🎉', importante: '⚠️' };

export async function mostrarAviso(base = '') {
  let aviso;
  try { aviso = await (await fetch(`${base}/api/aviso`)).json(); } catch { return; }
  if (!aviso) return;
  try { if (localStorage.getItem('fg-aviso-cerrado') === aviso.fecha) return; } catch { /* modo privado */ }

  const barra = document.createElement('div');
  barra.className = 'aviso-web';
  barra.setAttribute('role', 'status');
  barra.style.cssText = `position:fixed;z-index:150;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom) + 18px);
    width:min(calc(100% - 24px),720px);display:flex;align-items:center;gap:12px;padding:12px 12px 12px 16px;border-radius:14px;
    background:#14151d;border:1px solid ${COLORES[aviso.tipo] ?? COLORES.info};box-shadow:0 14px 40px rgba(0,0,0,.55);
    color:#f4f5f8;font:500 14.5px/1.45 Inter,system-ui,sans-serif`;
  const texto = document.createElement('span');
  texto.style.cssText = 'flex:1;min-width:0';
  texto.textContent = `${ICONOS[aviso.tipo] ?? ''} ${aviso.texto}`;
  barra.append(texto);
  if (aviso.enlace) {
    const a = document.createElement('a');
    a.href = aviso.enlace;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'Ver más';
    a.style.cssText = `flex:none;padding:7px 14px;border-radius:999px;background:${COLORES[aviso.tipo] ?? COLORES.info};color:#fff;font-weight:700;text-decoration:none`;
    barra.append(a);
  }
  const cerrar = document.createElement('button');
  cerrar.setAttribute('aria-label', 'Cerrar aviso');
  cerrar.textContent = '✕';
  cerrar.style.cssText = 'flex:none;width:32px;height:32px;border-radius:50%;border:0;background:rgba(255,255,255,.08);color:#fff;cursor:pointer;font-size:14px';
  cerrar.onclick = () => {
    try { localStorage.setItem('fg-aviso-cerrado', aviso.fecha); } catch { /* modo privado */ }
    barra.remove();
  };
  barra.append(cerrar);
  // En el móvil, por encima de la barra de navegación de abajo
  if (document.getElementById('nav-movil') && matchMedia('(max-width: 760px)').matches) barra.style.bottom = 'calc(env(safe-area-inset-bottom) + 76px)';
  // En la portada, por encima del botón de Telegram
  if (document.querySelector('.telegram')) barra.style.bottom = 'calc(env(safe-area-inset-bottom) + 90px)';
  document.body.append(barra);
}
