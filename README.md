# Fotograma

Plataforma de películas y series con tres piezas que hablan por la misma API:

| Carpeta | Qué es |
|---|---|
| `api/` | API REST en Node.js (Express). Guarda el catálogo, saca los metadatos de TMDB y gestiona los vídeos en **IDrive e2**. También sirve la web. |
| `web/` | Web pública (portada, películas, series, búsqueda, ficha, reproductor, Mi lista, Seguir viendo) y panel `/admin`. HTML, CSS y JS sin compilar. |
| `app/` | App móvil para Android e iOS hecha con Expo (React Native). |

## Cómo funciona el almacenamiento

```
Panel admin ──(1) pide URLs firmadas──▶ API ──▶ IDrive e2 (CreateMultipartUpload)
     │
     └──(2) sube los trozos de 64 MB directamente ─────────▶ IDrive e2
                                                               ▲
Web / App ──(3) pide /reproducir──▶ API ──(enlace firmado)──┘ (4) reproduce directo de e2
```

- Los vídeos **nunca pasan por tu servidor**: se suben y se reproducen directamente contra e2 con enlaces firmados y temporales. El bucket puede (y debe) ser **privado**.
- Subida multiparte con 4 trozos en paralelo y reintentos: aguanta archivos de cientos de GB.
- El reproductor salta por el vídeo con peticiones Range, que e2 soporta.

## Puesta en marcha

Necesitas Node.js 20.12 o más reciente.

### 1. IDrive e2

1. En el panel de IDrive e2 crea un **bucket** (privado), p. ej. `fotograma`.
2. En **Access Keys** crea una clave con acceso a ese bucket. Apunta el *Access Key ID* y el *Secret*.
3. Apunta el **endpoint** de la región del bucket (algo como `https://s3.eu-central-2.idrivee2.com`).

### 2. API y web

```bash
cd api
npm install
cp .env.example .env     # en Windows: copy .env.example .env
```

Rellena `.env`: `ADMIN_KEY`, las variables `E2_*` y `TMDB_KEY` (gratis en https://www.themoviedb.org/settings/api).

```bash
npm run probar-e2   # comprueba la conexión con el bucket
npm run cors        # deja al navegador subir y reproducir desde e2 (una sola vez)
npm start
```

- Web: http://localhost:4000
- Panel: http://localhost:4000/admin (entra con tu `ADMIN_KEY`)

En el panel: **Añadir título** → busca en TMDB → **Añadir**. Luego en **Catálogo → Vídeos** arrastra el archivo (en series, elige el episodio). En cuanto termina la subida ya se puede ver en la web y en la app.

En producción, limita el CORS del bucket a tu dominio: `npm run cors -- https://tu-web.com`.

### 3. App móvil

```bash
cd app
npm install
npx expo install --fix   # ajusta las versiones a tu SDK de Expo
npx expo start
```

Escanea el QR con **Expo Go**. En la pestaña **Ajustes** de la app pon la URL de la API con la IP de tu ordenador en la red local (p. ej. `http://192.168.1.10:4000`), no `localhost`. También puedes cambiar la URL por defecto en `app/app.json` → `extra.apiUrl`.

Para publicar en las tiendas: `npx eas build -p android` / `-p ios`.

## API

Pública:

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/estado` | Estado de e2, TMDB y nº de títulos |
| GET | `/api/inicio` | Destacado y filas de la portada |
| GET | `/api/titulos?tipo=&genero=&q=&disponibles=1` | Lista y búsqueda |
| GET | `/api/generos` | Géneros del catálogo |
| GET | `/api/titulos/:id` | Ficha completa con temporadas y episodios |
| GET | `/api/titulos/:id/reproducir?t=&e=` | Enlace firmado de e2 (`t`/`e` solo en series) |

Administración (cabecera `x-api-key: ADMIN_KEY`):

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/admin/tmdb/buscar?q=&tipo=` | Busca en TMDB |
| GET/POST | `/api/admin/titulos` | Lista completa / crea (`{tmdbId, tipo}` o `{tipo, manual:{…}}`) |
| PATCH/DELETE | `/api/admin/titulos/:id` | Edita / borra (`?borrarVideos=1` borra también en e2) |
| POST | `/api/admin/titulos/:id/refrescar` | Vuelve a traer datos de TMDB sin perder los vídeos |
| PUT | `/api/admin/titulos/:id/video` | Enlaza un vídeo `{key, temporada?, episodio?}` (`key: null` lo quita) |
| POST | `/api/admin/subidas/iniciar` · `completar` · `abortar` | Subida multiparte a e2 |
| GET/DELETE | `/api/admin/almacenamiento` | Lista los vídeos del bucket / borra uno sin usar |

## Notas

- **Formato de vídeo**: MP4 con H.264 y AAC funciona en todos los navegadores y móviles. MKV o HEVC pueden no reproducirse en web.
- **Datos**: el catálogo se guarda en `api/data/db.json`. Haz copia de seguridad de ese archivo (o súbelo también a e2).
- **Mi lista y Seguir viendo** se guardan en cada navegador/dispositivo. Para sincronizarlos entre dispositivos haría falta añadir cuentas de usuario.
- La reproducción es pública para quien tenga acceso a la web. Si quieres que solo entren usuarios registrados, hay que añadir login delante de `/api/titulos/:id/reproducir`.
- Solo sube contenido del que tengas los derechos.
