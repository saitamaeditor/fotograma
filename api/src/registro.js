// Estadísticas de reproducción y registro de actividad para el panel. Se acumulan en
// memoria y se guardan con el catálogo como mucho una vez por minuto, para no escribir
// en el bucket con cada reproducción.
import { ajustes } from './db.js';

const DIAS = 90; // reproducciones por día que se conservan
const MAX_ACTIVIDAD = 200;
const GUARDAR_MS = 60_000;

let stats = null;
let actividad = null;
let pendiente = false;

function cargar() {
  stats ??= ajustes.obtener('estadisticas') ?? { dias: {}, titulos: {} };
  actividad ??= ajustes.obtener('actividad') ?? [];
}

function marcar() {
  if (pendiente) return;
  pendiente = true;
  setTimeout(() => {
    pendiente = false;
    // Se borran los días más antiguos que DIAS
    const limite = new Date(Date.now() - DIAS * 864e5).toISOString().slice(0, 10);
    for (const dia of Object.keys(stats.dias)) if (dia < limite) delete stats.dias[dia];
    ajustes.guardar('estadisticas', stats);
    ajustes.guardar('actividad', actividad);
  }, GUARDAR_MS).unref();
}

// Una reproducción de un título (película o episodio)
export function reproduccion(id) {
  cargar();
  const dia = new Date().toISOString().slice(0, 10);
  stats.dias[dia] = (stats.dias[dia] ?? 0) + 1;
  stats.titulos[id] = (stats.titulos[id] ?? 0) + 1;
  marcar();
}

// Algo que ha pasado: «usuario», «importado», «titulo», «video», «aviso»…
export function anotar(tipo, texto) {
  cargar();
  actividad.unshift({ fecha: new Date().toISOString(), tipo, texto: String(texto).slice(0, 200) });
  actividad.length = Math.min(actividad.length, MAX_ACTIVIDAD);
  marcar();
}

export function resumen() {
  cargar();
  const dias = [];
  for (let i = 29; i >= 0; i--) {
    const dia = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    dias.push({ dia, total: stats.dias[dia] ?? 0 });
  }
  return {
    dias,
    total30: dias.reduce((s, d) => s + d.total, 0),
    hoy: dias.at(-1).total,
    porTitulo: Object.entries(stats.titulos).sort((a, b) => b[1] - a[1]),
    actividad: actividad.slice(0, 30),
  };
}
