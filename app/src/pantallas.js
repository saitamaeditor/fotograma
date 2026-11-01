import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, Image, ScrollView, FlatList, RefreshControl, StyleSheet, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, miLista, progreso, siguienteEpisodio, urlApi, cambiarUrlApi, cargarPlataformas, misPlataformas } from './api';
import { Fila, Tarjeta, Boton, Cargando, Vacio, SelectorPlataformas, EtiquetasPlataforma, Enfocable, Entrada } from './componentes';
import { c } from './tema';

function useDatos(cargar, deps = []) {
  const [estado, setEstado] = useState({ datos: null, error: null, cargando: true });
  const recargar = useCallback(async () => {
    setEstado((s) => ({ ...s, cargando: true }));
    try { setEstado({ datos: await cargar(), error: null, cargando: false }); }
    catch (error) { setEstado({ datos: null, error, cargando: false }); }
  }, deps);
  useEffect(() => { recargar(); }, [recargar]);
  return { ...estado, recargar };
}

function ErrorConexion({ error, recargar, nav }) {
  return (
    <Vacio titulo="No se pudo conectar" texto={`${error.message}\n\nAPI: ${urlApi()}`}>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
        <Boton texto="Reintentar" onPress={recargar} />
        <Boton texto="Ajustes" tipo="secundario" onPress={() => nav.pestana('ajustes')} />
      </View>
    </Vacio>
  );
}

// ---------- Inicio ----------
// Plataformas disponibles y las elegidas; al cambiarlas se guardan en el móvil
function usePlataformas() {
  const [estado, setEstado] = useState({ lista: null, elegidas: [], error: null });
  const [intento, setIntento] = useState(0);
  useEffect(() => {
    cargarPlataformas()
      .then(async (lista) => setEstado({ lista, elegidas: await misPlataformas.obtener(), error: null }))
      .catch((error) => setEstado({ lista: null, elegidas: [], error }));
  }, [intento]);
  const reintentar = () => setIntento((n) => n + 1);
  const cambiar = (elegidas) => {
    setEstado((s) => ({ ...s, elegidas }));
    misPlataformas.guardar(elegidas);
  };
  return { ...estado, cambiar, reintentar };
}

export function Inicio({ nav }) {
  const { width, height } = useWindowDimensions();
  const ins = useSafeAreaInsets();
  const plat = usePlataformas();
  const clave = plat.elegidas.join(',');
  const { datos, error, cargando, recargar } = useDatos(async () => {
    if (!plat.lista) return null;
    return clave ? api(`/inicio?plataformas=${clave}`) : { destacado: null, filas: [] };
  }, [plat.lista, clave]);

  if (plat.error) return <ErrorConexion error={plat.error} recargar={plat.reintentar} nav={nav} />;
  if (error) return <ErrorConexion error={error} recargar={recargar} nav={nav} />;
  if (!datos) return <Cargando />;
  const { destacado, filas } = datos;
  const abrir = (t) => nav.ir('ficha', { id: t.id });

  return (
    <ScrollView refreshControl={<RefreshControl refreshing={cargando} onRefresh={recargar} tintColor={c.acento} />}>
      {destacado && (
        <View style={{ height: Math.min(height * 0.62, 560), justifyContent: 'flex-end' }}>
          <Image source={{ uri: destacado.fondo }} style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(11,11,15,0.35)' }]} />
          <View style={e.degradado} />
          <View style={{ padding: 16, paddingTop: ins.top + 16 }}>
            <Text style={e.marca}>FOTOGRAMA</Text>
            <Text style={[e.heroTitulo, { fontSize: width > 600 ? 48 : 34 }]}>{destacado.titulo}</Text>
            <Text style={e.heroTexto} numberOfLines={3}>{destacado.sinopsis}</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              {destacado.disponible && <Boton texto="▶  Reproducir" onPress={() => nav.ir('ficha', { id: destacado.id, reproducir: true })} />}
              <Boton texto="Más información" tipo="secundario" onPress={() => abrir(destacado)} />
            </View>
          </View>
        </View>
      )}
      <View style={{ paddingTop: destacado ? 20 : ins.top + 20, paddingBottom: 30 }}>
        <SelectorPlataformas plataformas={plat.lista} elegidas={plat.elegidas} onCambiar={plat.cambiar} />
        {filas.length
          ? filas.map((f) => <Fila key={f.id} titulo={f.titulo} color={f.color} items={f.items} onPress={abrir} />)
          : <Vacio
              titulo={plat.elegidas.length ? 'Sin películas' : 'Elige una plataforma'}
              texto={plat.elegidas.length ? 'Todavía no hay películas en las plataformas elegidas.' : 'Marca arriba las plataformas que quieres ver.'}
            />}
      </View>
    </ScrollView>
  );
}

// ---------- Películas (búsqueda y filtro por plataforma) ----------
export function Explorar({ nav }) {
  const ins = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const plat = usePlataformas();
  const [q, setQ] = useState('');
  const [buscado, setBuscado] = useState('');
  useEffect(() => { const t = setTimeout(() => setBuscado(q.trim()), 350); return () => clearTimeout(t); }, [q]);

  const clave = plat.elegidas.join(',');
  const { datos, error, recargar } = useDatos(async () => {
    if (!plat.lista) return null;
    if (!clave) return [];
    return api(`/titulos?${new URLSearchParams({ tipo: 'pelicula', plataformas: clave, ...(buscado && { q: buscado }) })}`);
  }, [plat.lista, clave, buscado]);
  const columnas = Math.max(3, Math.floor(width / 140));
  const ancho = (width - 32 - (columnas - 1) * 10) / columnas;

  return (
    <View style={{ flex: 1, paddingTop: ins.top + 10 }}>
      <View style={{ paddingHorizontal: 16, gap: 12, marginBottom: 12 }}>
        <Entrada
          value={q}
          onChangeText={setQ}
          placeholder="Buscar películas"
          placeholderTextColor={c.texto3}
          style={e.entrada}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {plat.lista && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {plat.lista.map((p) => {
              const activa = plat.elegidas.includes(p.id);
              return (
                <Enfocable radio={999}
                  key={p.id}
                  onPress={() => plat.cambiar(activa ? plat.elegidas.filter((x) => x !== p.id) : [...plat.elegidas, p.id])}
                  style={[e.chip, activa && { backgroundColor: p.color, borderColor: p.color }]}
                >
                  <Text style={{ color: activa ? '#fff' : c.texto2, fontWeight: '700', fontSize: 13 }}>{p.nombre}</Text>
                </Enfocable>
              );
            })}
          </ScrollView>
        )}
      </View>
      {plat.error ? <ErrorConexion error={plat.error} recargar={plat.reintentar} nav={nav} /> : error ? <ErrorConexion error={error} recargar={recargar} nav={nav} /> : !datos ? <Cargando /> : (
        <FlatList
          key={columnas}
          data={datos}
          numColumns={columnas}
          keyExtractor={(t) => t.id}
          columnWrapperStyle={{ gap: 10 }}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 16, paddingBottom: 30 }}
          renderItem={({ item }) => <Tarjeta t={item} ancho={ancho} onPress={(t) => nav.ir('ficha', { id: t.id })} />}
          ListEmptyComponent={<Vacio titulo="Sin resultados" texto={clave ? 'Prueba con otro título o marca más plataformas.' : 'Marca alguna plataforma arriba.'} />}
        />
      )}
    </View>
  );
}

// ---------- Mi lista ----------
export function MiLista({ nav }) {
  const ins = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { datos, error, recargar } = useDatos(async () => {
    const [ids, todos] = await Promise.all([miLista.ids(), api('/titulos')]);
    return ids.map((id) => todos.find((t) => t.id === id)).filter(Boolean);
  });
  const columnas = Math.max(3, Math.floor(width / 140));
  const ancho = (width - 32 - (columnas - 1) * 10) / columnas;
  if (error) return <ErrorConexion error={error} recargar={recargar} nav={nav} />;
  if (!datos) return <Cargando />;
  return (
    <FlatList
      key={columnas}
      data={datos}
      numColumns={columnas}
      keyExtractor={(t) => t.id}
      columnWrapperStyle={{ gap: 10 }}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 16, paddingTop: ins.top + 16, paddingBottom: 30 }}
      ListHeaderComponent={<Text style={e.h1}>Mi lista</Text>}
      renderItem={({ item }) => <Tarjeta t={item} ancho={ancho} onPress={(t) => nav.ir('ficha', { id: t.id })} />}
      ListEmptyComponent={<Vacio titulo="Tu lista está vacía" texto="Guarda títulos desde su ficha." />}
    />
  );
}

// ---------- Ficha ----------
export function Ficha({ nav, params }) {
  const ins = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [temporada, setTemporada] = useState(null);
  const [enLista, setEnLista] = useState(false);
  const { datos, error, recargar } = useDatos(async () => {
    const [t, prog, ids] = await Promise.all([api(`/titulos/${params.id}`), progreso.todo(), miLista.ids(), cargarPlataformas()]);
    setEnLista(ids.includes(params.id));
    return { t, p: prog[params.id] };
  }, [params.id]);

  const ver = (tt, e) => nav.ir('reproductor', { id: params.id, t: tt, e, titulo: datos.t });

  useEffect(() => {
    if (!datos) return;
    const { t, p } = datos;
    setTemporada(p?.t ?? t.temporadas?.[0]?.numero ?? null);
    if (params.reproducir) {
      params.reproducir = false;
      if (t.tipo === 'pelicula') ver();
      else { const s = p ?? siguienteEpisodio(t); if (s) ver(s.t, s.e); }
    }
  }, [datos]);

  if (error) return <ErrorConexion error={error} recargar={recargar} nav={nav} />;
  if (!datos) return <Cargando />;
  const { t, p } = datos;
  const s = t.temporadas?.find((x) => x.numero === temporada);
  const sig = t.tipo === 'serie' ? (p?.t ? { t: p.t, e: p.e } : siguienteEpisodio(t)) : null;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={{ height: height * 0.42 }}>
        {(t.fondo || t.poster) && <Image source={{ uri: t.fondo ?? t.poster }} style={StyleSheet.absoluteFill} />}
        <View style={e.degradado} />
        <Enfocable radio={19} onPress={nav.atras} style={[e.atras, { top: ins.top + 8 }]} hitSlop={10}>
          <Text style={{ color: c.texto, fontSize: 22 }}>‹</Text>
        </Enfocable>
      </View>
      <View style={{ paddingHorizontal: 16, marginTop: -40 }}>
        <Text style={e.h1}>{t.titulo}</Text>
        <Text style={e.meta}>
          {[t.valoracion && `★ ${t.valoracion}`, t.anio, t.tipo === 'serie' ? `${t.temporadas?.length ?? 0} temporadas` : t.duracion && `${t.duracion} min`, ...(t.generos ?? []).slice(0, 2)].filter(Boolean).join('  ·  ')}
        </Text>
        <EtiquetasPlataforma ids={t.plataformas} style={{ marginTop: 8 }} />
        <View style={{ gap: 10, marginVertical: 16 }}>
          {t.disponible ? (
            <Boton
              texto={t.tipo === 'pelicula' ? (p ? '▶  Continuar' : '▶  Reproducir') : `▶  ${p ? 'Continuar' : 'Ver'} T${sig.t}:E${sig.e}`}
              onPress={() => (t.tipo === 'pelicula' ? ver() : ver(sig.t, sig.e))}
            />
          ) : <Boton texto="Próximamente" disabled />}
          <Boton
            texto={enLista ? '✓  En mi lista' : '+  Mi lista'}
            tipo="secundario"
            onPress={async () => setEnLista(await miLista.alternar(t.id))}
          />
        </View>
        <Text style={e.sinopsis}>{t.sinopsis || 'Sin sinopsis.'}</Text>
        {t.reparto?.length > 0 && <Text style={e.reparto}>Reparto: {t.reparto.join(', ')}</Text>}

        {t.tipo === 'serie' && t.temporadas?.length > 0 && (
          <View style={{ marginTop: 26 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 14 }}>
              {t.temporadas.map((x) => (
                <Enfocable radio={999} key={x.numero} onPress={() => setTemporada(x.numero)} style={[e.chip, temporada === x.numero && e.chipActivo]}>
                  <Text style={{ color: temporada === x.numero ? c.fondo : c.texto2, fontWeight: '600' }}>Temporada {x.numero}</Text>
                </Enfocable>
              ))}
            </ScrollView>
            {s?.episodios.map((ep) => (
              <Enfocable
                key={ep.numero}
                disabled={!ep.disponible}
                onPress={() => ver(s.numero, ep.numero)}
                style={({ pressed }) => [e.episodio, { opacity: !ep.disponible ? 0.45 : pressed ? 0.7 : 1 }]}
              >
                <View style={e.epImg}>{ep.imagen && <Image source={{ uri: ep.imagen }} style={StyleSheet.absoluteFill} />}</View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.texto, fontWeight: '600' }} numberOfLines={1}>{ep.numero}. {ep.titulo}</Text>
                  <Text style={{ color: c.texto3, fontSize: 12 }}>{ep.disponible ? (ep.duracion ? `${ep.duracion} min` : '') : 'Próximamente'}</Text>
                  <Text style={{ color: c.texto2, fontSize: 12, marginTop: 2 }} numberOfLines={2}>{ep.sinopsis}</Text>
                </View>
              </Enfocable>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

// ---------- Ajustes ----------
export function Ajustes() {
  const ins = useSafeAreaInsets();
  const [url, setUrl] = useState(urlApi());
  const [estado, setEstado] = useState('');

  async function probar() {
    setEstado('Probando…');
    await cambiarUrlApi(url);
    try {
      const r = await api('/estado');
      setEstado(`Conectado · ${r.titulos} títulos · e2 ${r.e2 ? 'ok' : 'sin configurar'}`);
    } catch (err) {
      setEstado(`Error: ${err.message}`);
    }
  }

  return (
    <View style={{ flex: 1, padding: 16, paddingTop: ins.top + 16, gap: 14 }}>
      <Text style={e.h1}>Ajustes</Text>
      <Text style={{ color: c.texto2 }}>URL de la API de Fotograma</Text>
      <Entrada
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder="https://api.mi-web.com"
        placeholderTextColor={c.texto3}
        style={e.entrada}
      />
      <Boton texto="Guardar y probar" onPress={probar} />
      {estado ? <Text style={{ color: estado.startsWith('Error') ? c.peligro : c.texto2 }}>{estado}</Text> : null}
      <Text style={{ color: c.texto3, fontSize: 12, marginTop: 'auto' }}>
        Normalmente es https://morvehtv.es. Para probar con tu PC usa su IP en la red local, p. ej. http://192.168.1.10:4000
      </Text>
    </View>
  );
}

const e = StyleSheet.create({
  degradado: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: '70%',
    experimental_backgroundImage: `linear-gradient(to top, ${c.fondo}, rgba(11,11,15,0))`,
  },
  marca: { color: c.acento, fontWeight: '900', letterSpacing: 2, fontSize: 12, marginBottom: 8 },
  heroTitulo: { color: c.texto, fontWeight: '900', letterSpacing: -0.5 },
  heroTexto: { color: c.texto2, marginTop: 8, fontSize: 14, lineHeight: 20 },
  h1: { color: c.texto, fontSize: 30, fontWeight: '900', letterSpacing: -0.5, marginBottom: 6 },
  meta: { color: c.texto2, fontSize: 13 },
  sinopsis: { color: c.texto2, fontSize: 15, lineHeight: 22 },
  reparto: { color: c.texto3, fontSize: 13, marginTop: 10 },
  entrada: { backgroundColor: c.fondo2, borderColor: c.borde, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, color: c.texto, fontSize: 15 },
  chip: { borderWidth: 1, borderColor: c.borde, backgroundColor: c.fondo2, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  chipActivo: { backgroundColor: c.texto, borderColor: c.texto },
  atras: { position: 'absolute', left: 12, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  episodio: { flexDirection: 'row', gap: 12, paddingVertical: 10, alignItems: 'center' },
  epImg: { width: 130, aspectRatio: 16 / 9, borderRadius: 8, overflow: 'hidden', backgroundColor: c.fondo3 },
});
