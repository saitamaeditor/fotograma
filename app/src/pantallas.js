import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, Image, ScrollView, FlatList, Pressable, TextInput, RefreshControl, StyleSheet, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, miLista, progreso, siguienteEpisodio, urlApi, cambiarUrlApi } from './api';
import { Fila, Tarjeta, Boton, Cargando, Vacio } from './componentes';
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
export function Inicio({ nav }) {
  const { width, height } = useWindowDimensions();
  const ins = useSafeAreaInsets();
  const { datos, error, cargando, recargar } = useDatos(async () => {
    const [inicio, prog] = await Promise.all([api('/inicio'), progreso.todo()]);
    return { ...inicio, prog };
  });

  if (error) return <ErrorConexion error={error} recargar={recargar} nav={nav} />;
  if (!datos) return <Cargando />;
  const { destacado, filas, prog } = datos;
  if (!filas.length) return <Vacio titulo="Catálogo vacío" texto="Añade títulos desde el panel /admin de la web." />;

  const todos = new Map(filas.flatMap((f) => f.items).map((t) => [t.id, t]));
  const seguir = Object.entries(prog).sort((a, b) => b[1].fecha - a[1].fecha).map(([id]) => todos.get(id)).filter(Boolean);
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
        {seguir.length > 0 && <Fila titulo="Seguir viendo" items={seguir} onPress={abrir} />}
        {filas.map((f) => <Fila key={f.titulo} titulo={f.titulo} items={f.items} onPress={abrir} />)}
      </View>
    </ScrollView>
  );
}

// ---------- Explorar (películas, series y búsqueda) ----------
export function Explorar({ nav }) {
  const ins = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [tipo, setTipo] = useState('');
  const [q, setQ] = useState('');
  const [buscado, setBuscado] = useState('');
  useEffect(() => { const t = setTimeout(() => setBuscado(q.trim()), 350); return () => clearTimeout(t); }, [q]);

  const { datos, error, recargar } = useDatos(
    () => api(`/titulos?${new URLSearchParams({ ...(tipo && { tipo }), ...(buscado && { q: buscado }) })}`),
    [tipo, buscado],
  );
  const columnas = Math.max(3, Math.floor(width / 140));
  const ancho = (width - 32 - (columnas - 1) * 10) / columnas;

  return (
    <View style={{ flex: 1, paddingTop: ins.top + 10 }}>
      <View style={{ paddingHorizontal: 16, gap: 12, marginBottom: 12 }}>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Buscar películas y series"
          placeholderTextColor={c.texto3}
          style={e.entrada}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[['', 'Todo'], ['pelicula', 'Películas'], ['serie', 'Series']].map(([v, txt]) => (
            <Pressable key={v} onPress={() => setTipo(v)} style={[e.chip, tipo === v && e.chipActivo]}>
              <Text style={{ color: tipo === v ? c.fondo : c.texto2, fontWeight: '600', fontSize: 13 }}>{txt}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {error ? <ErrorConexion error={error} recargar={recargar} nav={nav} /> : !datos ? <Cargando /> : (
        <FlatList
          key={columnas}
          data={datos}
          numColumns={columnas}
          keyExtractor={(t) => t.id}
          columnWrapperStyle={{ gap: 10 }}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 16, paddingBottom: 30 }}
          renderItem={({ item }) => <Tarjeta t={item} ancho={ancho} onPress={(t) => nav.ir('ficha', { id: t.id })} />}
          ListEmptyComponent={<Vacio titulo="Sin resultados" texto="Prueba con otro título." />}
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
    const [t, prog, ids] = await Promise.all([api(`/titulos/${params.id}`), progreso.todo(), miLista.ids()]);
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
        <Pressable onPress={nav.atras} style={[e.atras, { top: ins.top + 8 }]} hitSlop={10}>
          <Text style={{ color: c.texto, fontSize: 22 }}>‹</Text>
        </Pressable>
      </View>
      <View style={{ paddingHorizontal: 16, marginTop: -40 }}>
        <Text style={e.h1}>{t.titulo}</Text>
        <Text style={e.meta}>
          {[t.valoracion && `★ ${t.valoracion}`, t.anio, t.tipo === 'serie' ? `${t.temporadas?.length ?? 0} temporadas` : t.duracion && `${t.duracion} min`, ...(t.generos ?? []).slice(0, 2)].filter(Boolean).join('  ·  ')}
        </Text>
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
                <Pressable key={x.numero} onPress={() => setTemporada(x.numero)} style={[e.chip, temporada === x.numero && e.chipActivo]}>
                  <Text style={{ color: temporada === x.numero ? c.fondo : c.texto2, fontWeight: '600' }}>Temporada {x.numero}</Text>
                </Pressable>
              ))}
            </ScrollView>
            {s?.episodios.map((ep) => (
              <Pressable
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
              </Pressable>
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
      <TextInput
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
        En desarrollo usa la IP de tu ordenador en la red local (no «localhost»), p. ej. http://192.168.1.10:4000
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
