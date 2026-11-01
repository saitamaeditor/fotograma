import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, BackHandler, StyleSheet } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEvent } from 'expo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, progreso, siguienteEpisodio } from './api';
import { Cargando, Vacio, Boton, Enfocable } from './componentes';
import { c } from './tema';

const SALTO = 10; // segundos que avanzan o retroceden los botones
const OCULTAR_MS = 4000; // los controles se esconden solos mientras se reproduce

// Pide a la API el enlace firmado de IDrive e2 y lo reproduce directamente.
export function Reproductor({ nav, params }) {
  const { id, t: temporada, e: episodio, titulo: ficha } = params;
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setUrl(null);
    const q = temporada ? `?t=${temporada}&e=${episodio}` : '';
    api(`/titulos/${id}/reproducir${q}`).then((r) => setUrl(r.url)).catch(setError);
  }, [id, temporada, episodio]);

  if (error) return <Vacio titulo="No se puede reproducir" texto={error.message}><Boton texto="Volver" style={{ marginTop: 16 }} onPress={nav.atras} /></Vacio>;
  if (!url) return <Cargando />;
  return <Video key={url} url={url} nav={nav} params={params} ficha={ficha} />;
}

// 3725 → «1:02:05», 125 → «2:05»
function reloj(s) {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = String(Math.floor(s % 60)).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${seg}` : `${m}:${seg}`;
}

const IDIOMAS = {
  es: 'Español', en: 'Inglés', fr: 'Francés', de: 'Alemán', it: 'Italiano', pt: 'Portugués', ca: 'Catalán',
  eu: 'Euskera', gl: 'Gallego', ja: 'Japonés', ko: 'Coreano', zh: 'Chino', ru: 'Ruso', und: 'Desconocido',
};
const nombrePista = (p, i) => p.label || IDIOMAS[p.language?.slice(0, 2)] || p.language?.toUpperCase() || `Pista ${i + 1}`;

function Video({ url, nav, params, ficha }) {
  const { id, t: temporada, e: episodio } = params;
  const ins = useSafeAreaInsets();
  const reanudado = useRef(false);
  const guardado = useRef(0);
  const temporizador = useRef(null);
  const [visibles, setVisibles] = useState(true);
  const [menu, setMenu] = useState(false);
  const [anchoBarra, setAnchoBarra] = useState(1);
  const ep = temporada ? ficha.temporadas.find((s) => s.numero === temporada)?.episodios.find((x) => x.numero === episodio) : null;
  const sig = temporada ? siguienteEpisodio(ficha, temporada, episodio) : null;

  const player = useVideoPlayer(url, (p) => {
    p.timeUpdateEventInterval = 0.5;
    p.play();
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { currentTime } = useEvent(player, 'timeUpdate', { currentTime: player.currentTime, bufferedPosition: 0 });
  const { availableAudioTracks: audios } = useEvent(player, 'availableAudioTracksChange', { availableAudioTracks: player.availableAudioTracks ?? [] });
  const { availableSubtitleTracks: subtitulos } = useEvent(player, 'availableSubtitleTracksChange', { availableSubtitleTracks: player.availableSubtitleTracks ?? [] });
  const { audioTrack } = useEvent(player, 'audioTrackChange', { audioTrack: player.audioTrack });
  const { subtitleTrack } = useEvent(player, 'subtitleTrackChange', { subtitleTrack: player.subtitleTrack });
  const duracion = player.duration || 0;

  // Cada vez que se toca algo, los controles se muestran y vuelven a contar para esconderse
  const mostrar = () => {
    setVisibles(true);
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setVisibles(false), OCULTAR_MS);
  };
  useEffect(() => {
    clearTimeout(temporizador.current);
    if (!isPlaying || menu) setVisibles(true);
    else mostrar();
    return () => clearTimeout(temporizador.current);
  }, [isPlaying, menu]);

  // Atrás del mando: si el menú está abierto lo cierra; si no, sale del reproductor
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (menu) { setMenu(false); return true; }
      return false;
    });
    return () => sub.remove();
  }, [menu]);

  // Reanuda donde se quedó
  useEffect(() => {
    if (status !== 'readyToPlay' || reanudado.current) return;
    reanudado.current = true;
    progreso.todo().then((todo) => {
      const p = todo[id];
      const mismo = !temporada || (p?.t === temporada && p?.e === episodio);
      if (mismo && p?.segundo && p.segundo < player.duration - 30) player.currentTime = p.segundo;
    });
  }, [status]);

  // Guarda el progreso cada 5 s
  useEffect(() => {
    if (currentTime > 1 && Math.abs(currentTime - guardado.current) >= 5) {
      guardado.current = currentTime;
      progreso.guardar(id, { t: temporada, e: episodio, segundo: currentTime, duracion: player.duration });
    }
  }, [currentTime]);

  useEffect(() => {
    const s = player.addListener('playToEnd', () => {
      if (sig) nav.reemplazar('reproductor', { ...params, t: sig.t, e: sig.e });
    });
    return () => s.remove();
  }, [player]);

  const alternar = () => { mostrar(); isPlaying ? player.pause() : player.play(); };
  const saltar = (seg) => { mostrar(); player.seekBy(seg); };
  const irA = (x) => { mostrar(); if (duracion) player.currentTime = Math.max(0, Math.min(duracion - 1, (x / anchoBarra) * duracion)); };
  const siguiente = () => nav.reemplazar('reproductor', { ...params, t: sig.t, e: sig.e });
  const hayPistas = audios.length > 1 || subtitulos.length > 0;
  const avance = duracion ? Math.min(1, currentTime / duracion) : 0;

  return (
    <View style={e.raiz}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} allowsPictureInPicture />

      {/* Capa a pantalla completa: un toque (u OK en el mando) muestra u oculta los controles */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => (visibles ? setVisibles(false) : mostrar())}
        focusable={!visibles}
        hasTVPreferredFocus={!visibles}
        accessibilityLabel="Mostrar controles"
      />

      {(status === 'loading' || (status === 'readyToPlay' && !duracion)) && (
        <View style={e.centro} pointerEvents="none"><ActivityIndicator color="#fff" size="large" /></View>
      )}
      {status === 'error' && <Vacio titulo="Error de reproducción" texto="Comprueba que el vídeo es MP4 (H.264/AAC)." />}

      {visibles && !menu && (
        <>
          <View style={[e.arriba, { paddingTop: ins.top + 12, paddingHorizontal: Math.max(ins.left, 20) }]}>
            <Enfocable radio={22} onFocus={mostrar} onPress={nav.atras} style={e.redondo} accessibilityLabel="Volver">
              <Text style={e.icono}>‹</Text>
            </Enfocable>
            <View style={{ flex: 1 }}>
              <Text style={e.titulo} numberOfLines={1}>{ficha.titulo}</Text>
              {ep && <Text style={e.subtitulo} numberOfLines={1}>T{temporada}:E{episodio} · {ep.titulo}</Text>}
            </View>
          </View>

          <View style={e.mandos} pointerEvents="box-none">
            <Enfocable radio={36} onFocus={mostrar} onPress={() => saltar(-SALTO)} style={e.saltar} accessibilityLabel={`Retroceder ${SALTO} segundos`}>
              <Text style={e.iconoSalto}>↺</Text><Text style={e.textoSalto}>{SALTO}</Text>
            </Enfocable>
            <Enfocable radio={48} onFocus={mostrar} onPress={alternar} style={e.play} hasTVPreferredFocus accessibilityLabel={isPlaying ? 'Pausa' : 'Reproducir'}>
              <Text style={e.iconoPlay}>{isPlaying ? '❚❚' : '▶'}</Text>
            </Enfocable>
            <Enfocable radio={36} onFocus={mostrar} onPress={() => saltar(SALTO)} style={e.saltar} accessibilityLabel={`Avanzar ${SALTO} segundos`}>
              <Text style={e.iconoSalto}>↻</Text><Text style={e.textoSalto}>{SALTO}</Text>
            </Enfocable>
          </View>

          <View style={[e.abajo, { paddingBottom: ins.bottom + 16, paddingHorizontal: Math.max(ins.left, 20) }]}>
            <View style={e.tiempos}>
              <Text style={e.tiempo}>{reloj(currentTime)}</Text>
              <Text style={e.tiempo}>-{reloj(duracion - currentTime)}</Text>
            </View>
            <Pressable
              onLayout={(ev) => setAnchoBarra(ev.nativeEvent.layout.width || 1)}
              onPress={(ev) => irA(ev.nativeEvent.locationX)}
              focusable={false}
              hitSlop={{ top: 14, bottom: 14 }}
              style={e.barra}
            >
              <View style={[e.relleno, { width: `${avance * 100}%` }]} />
              <View style={[e.bolita, { left: `${avance * 100}%` }]} />
            </Pressable>
            <View style={e.acciones}>
              {hayPistas && (
                <Enfocable radio={999} onFocus={mostrar} onPress={() => setMenu(true)} style={e.accion}>
                  <Text style={e.textoAccion}>💬  Audio y subtítulos</Text>
                </Enfocable>
              )}
              {sig && (
                <Enfocable radio={999} onFocus={mostrar} onPress={siguiente} style={e.accion}>
                  <Text style={e.textoAccion}>Siguiente episodio  ›</Text>
                </Enfocable>
              )}
            </View>
          </View>
        </>
      )}

      {menu && (
        <View style={e.menuFondo}>
          <View style={[e.menu, { paddingTop: ins.top + 20, paddingBottom: ins.bottom + 20 }]}>
            <View style={e.menuCols}>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 6 }}>
                <Text style={e.menuTitulo}>Audio</Text>
                {audios.length ? audios.map((a, i) => (
                  <Opcion key={a.id} texto={nombrePista(a, i)} activa={audioTrack?.id === a.id} enfocar={i === 0} onPress={() => { player.audioTrack = a; }} />
                )) : <Text style={e.menuVacio}>Solo hay una pista</Text>}
              </ScrollView>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 6 }}>
                <Text style={e.menuTitulo}>Subtítulos</Text>
                <Opcion texto="Desactivados" activa={!subtitleTrack} onPress={() => { player.subtitleTrack = null; }} />
                {subtitulos.map((s, i) => (
                  <Opcion key={s.id} texto={nombrePista(s, i)} activa={subtitleTrack?.id === s.id} onPress={() => { player.subtitleTrack = s; }} />
                ))}
              </ScrollView>
            </View>
            <Boton texto="Cerrar" tipo="secundario" onPress={() => setMenu(false)} style={{ alignSelf: 'flex-start', marginTop: 12 }} />
          </View>
        </View>
      )}
    </View>
  );
}

function Opcion({ texto, activa, onPress, enfocar }) {
  return (
    <Enfocable radio={8} escala={1} onPress={onPress} hasTVPreferredFocus={enfocar} style={[e.opcion, activa && e.opcionActiva]}>
      <Text style={[e.opcionCheck, !activa && { opacity: 0 }]}>✓</Text>
      <Text style={[e.opcionTexto, activa && { fontWeight: '800' }]} numberOfLines={1}>{texto}</Text>
    </Enfocable>
  );
}

const sombra = { textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6 };
const e = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: '#000' },
  centro: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  arriba: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 14, paddingBottom: 30, backgroundColor: 'rgba(0,0,0,0.55)' },
  redondo: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  icono: { color: '#fff', fontSize: 28, lineHeight: 30, marginTop: -3 },
  titulo: { color: '#fff', fontSize: 18, fontWeight: '800', ...sombra },
  subtitulo: { color: c.texto2, fontSize: 13, marginTop: 2 },
  mandos: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 48 },
  saltar: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  iconoSalto: { color: '#fff', fontSize: 34, lineHeight: 38, ...sombra },
  textoSalto: { position: 'absolute', color: '#fff', fontSize: 11, fontWeight: '800', top: 29 },
  play: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)' },
  iconoPlay: { color: '#fff', fontSize: 36, fontWeight: '900', marginLeft: 2, ...sombra },
  abajo: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 30, backgroundColor: 'rgba(0,0,0,0.55)' },
  tiempos: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  tiempo: { color: '#fff', fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  barra: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', justifyContent: 'center' },
  relleno: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 2, backgroundColor: c.acento },
  bolita: { position: 'absolute', width: 14, height: 14, borderRadius: 7, marginLeft: -7, backgroundColor: c.acento },
  acciones: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 14, minHeight: 8 },
  accion: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.16)' },
  textoAccion: { color: '#fff', fontWeight: '700', fontSize: 13 },
  menuFondo: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'flex-end' },
  menu: { width: '62%', minWidth: 300, maxWidth: 620, height: '100%', backgroundColor: 'rgba(20,20,20,0.97)', paddingHorizontal: 22 },
  menuCols: { flex: 1, flexDirection: 'row', gap: 22 },
  menuTitulo: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 8 },
  menuVacio: { color: c.texto3, fontSize: 13 },
  opcion: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8 },
  opcionActiva: { backgroundColor: 'rgba(255,255,255,0.1)' },
  opcionCheck: { color: '#fff', fontSize: 15, fontWeight: '900', width: 16 },
  opcionTexto: { color: '#fff', fontSize: 15, flexShrink: 1 },
});
