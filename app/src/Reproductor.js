import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEvent } from 'expo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, progreso, siguienteEpisodio } from './api';
import { Cargando, Vacio, Boton } from './componentes';
import { c } from './tema';

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

function Video({ url, nav, params, ficha }) {
  const { id, t: temporada, e: episodio } = params;
  const ins = useSafeAreaInsets();
  const reanudado = useRef(false);
  const ep = temporada ? ficha.temporadas.find((s) => s.numero === temporada)?.episodios.find((x) => x.numero === episodio) : null;
  const sig = temporada ? siguienteEpisodio(ficha, temporada, episodio) : null;

  const player = useVideoPlayer(url, (p) => {
    p.timeUpdateEventInterval = 5;
    p.play();
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });

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

  useEffect(() => {
    const s1 = player.addListener('timeUpdate', ({ currentTime }) => {
      if (currentTime > 1) progreso.guardar(id, { t: temporada, e: episodio, segundo: currentTime, duracion: player.duration });
    });
    const s2 = player.addListener('playToEnd', () => {
      if (sig) nav.reemplazar('reproductor', { ...params, t: sig.t, e: sig.e });
    });
    return () => { s1.remove(); s2.remove(); };
  }, [player]);

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" allowsFullscreen allowsPictureInPicture nativeControls />
      <View style={[e.barra, { paddingTop: ins.top + 8 }]} pointerEvents="box-none">
        <Pressable onPress={nav.atras} style={e.boton} hitSlop={10}><Text style={{ color: '#fff', fontSize: 22 }}>‹</Text></Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#fff', fontWeight: '700' }} numberOfLines={1}>{ficha.titulo}</Text>
          {ep && <Text style={{ color: c.texto2, fontSize: 12 }} numberOfLines={1}>T{temporada}:E{episodio} · {ep.titulo}</Text>}
        </View>
        {sig && (
          <Pressable onPress={() => nav.reemplazar('reproductor', { ...params, t: sig.t, e: sig.e })} style={e.sig}>
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 12 }}>Siguiente ›</Text>
          </Pressable>
        )}
      </View>
      {status === 'error' && <Vacio titulo="Error de reproducción" texto="Comprueba que el vídeo es MP4 (H.264/AAC)." />}
    </View>
  );
}

const e = StyleSheet.create({
  barra: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingBottom: 10, backgroundColor: 'rgba(0,0,0,0.45)' },
  boton: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  sig: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)' },
});
