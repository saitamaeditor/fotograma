// Base de datos en un archivo JSON. Suficiente para miles de títulos y sin dependencias
// nativas; si el catálogo crece mucho, se cambia por SQLite o Postgres sin tocar las rutas.
// Si IDrive e2 está configurado, el catálogo se guarda también en el bucket: así sobrevive
// a los despliegues en hostings que borran el disco (Render, Railway…).
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as e2 from './e2.js';

const RUTA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'db.json');
const CLAVE_E2 = '_fotograma/db.json';

let datos = { titulos: [] };

// Carga el catálogo: primero del bucket (la copia buena en producción) y si no, del disco.
export async function iniciar() {
  if (e2.configurado) {
    const texto = await e2.leerTexto(CLAVE_E2);
    if (texto) {
      datos = JSON.parse(texto);
      escribirDisco();
      return 'e2';
    }
  }
  if (existsSync(RUTA)) {
    datos = JSON.parse(readFileSync(RUTA, 'utf8'));
    if (e2.configurado) await e2.guardarTexto(CLAVE_E2, JSON.stringify(datos));
    return 'disco';
  }
  return 'nuevo';
}

function escribirDisco() {
  mkdirSync(dirname(RUTA), { recursive: true });
  const tmp = `${RUTA}.tmp`;
  writeFileSync(tmp, JSON.stringify(datos, null, 2));
  renameSync(tmp, RUTA);
}

// Las subidas al bucket van en cola para que nunca se pise una versión nueva con una vieja
let cola = Promise.resolve();
function guardar() {
  escribirDisco();
  if (!e2.configurado) return;
  const texto = JSON.stringify(datos);
  cola = cola
    .then(() => e2.guardarTexto(CLAVE_E2, texto))
    .catch((err) => console.error('No se pudo guardar el catálogo en e2:', err.message));
}

// Copia completa de la base de datos (catálogo, cuentas y ajustes) para el panel
export const exportar = () => datos;

// Ajustes del panel (p. ej. el bot de Telegram); van en el mismo archivo que el catálogo
export const ajustes = {
  obtener: (clave) => datos.ajustes?.[clave] ?? null,
  guardar(clave, valor) {
    datos.ajustes = { ...datos.ajustes, [clave]: valor };
    guardar();
  },
};

// Cuentas de los espectadores (contraseña cifrada y sus datos privados: lista, progreso…)
export const usuarios = {
  todos: () => (datos.usuarios ??= []),
  obtener: (id) => usuarios.todos().find((u) => u.id === id),
  porEmail: (email) => usuarios.todos().find((u) => u.email === email),
  crear(u) {
    const nuevo = { id: crypto.randomUUID(), creado: new Date().toISOString(), datos: {}, ...u };
    usuarios.todos().push(nuevo);
    guardar();
    return nuevo;
  },
  actualizar(id, cambios) {
    const u = usuarios.obtener(id);
    if (!u) return null;
    Object.assign(u, cambios);
    guardar();
    return u;
  },
  borrar(id) {
    const i = usuarios.todos().findIndex((u) => u.id === id);
    if (i === -1) return null;
    const [u] = usuarios.todos().splice(i, 1);
    guardar();
    return u;
  },
};

export const titulos = {
  todos: () => datos.titulos,
  obtener: (id) => datos.titulos.find((t) => t.id === id),
  porTmdb: (tmdbId, tipo) => datos.titulos.find((t) => t.tmdbId === tmdbId && t.tipo === tipo),
  crear(t) {
    const nuevo = { id: crypto.randomUUID(), creado: new Date().toISOString(), ...t };
    datos.titulos.unshift(nuevo);
    guardar();
    return nuevo;
  },
  actualizar(id, cambios) {
    const t = titulos.obtener(id);
    if (!t) return null;
    Object.assign(t, cambios, { id, actualizado: new Date().toISOString() });
    guardar();
    return t;
  },
  borrar(id) {
    const i = datos.titulos.findIndex((t) => t.id === id);
    if (i === -1) return null;
    const [t] = datos.titulos.splice(i, 1);
    guardar();
    return t;
  },
};
