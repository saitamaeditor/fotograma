import { useEffect, useMemo, useRef } from 'react';
import { View, Animated, Easing, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useAudioPlayer } from 'expo-audio';
import { c } from './tema';

const NOMBRE = 'MorvehTV';
const LEMA = 'TU CINE EN LA WEB';
const RAYOS = 28;
const CHISPAS = 26;

const t = (valor, a, ms, curva = Easing.out(Easing.cubic), retraso = 0) =>
  Animated.timing(valor, { toValue: a, duration: ms, delay: retraso, easing: curva, useNativeDriver: true });

// Intro de unos 5,5 s con sonido (assets/intro.wav, va sincronizado):
//   1. Túnel de luz: rayos rojos y blancos salen disparados desde el centro (0–1,6 s)
//   2. Impacto: fogonazo, onda expansiva, destello horizontal, temblor y el logo cae de golpe
//   3. «MorvehTV» letra a letra con un brillo que lo recorre y el lema debajo
//   4. La cámara atraviesa la M y aparece la app
// Un toque (u OK en el mando) la salta.
export function Intro({ onFin }) {
  const { width, height } = useWindowDimensions();
  const lado = Math.min(width, height);
  const diagonal = Math.hypot(width, height);
  const logo = Math.min(lado * 0.4, 230);
  const terminado = useRef(false);
  const sonido = useAudioPlayer(require('../assets/intro.wav'));

  const v = useMemo(() => ({
    tunel: new Animated.Value(0),
    fogonazo: new Animated.Value(0),
    onda: new Animated.Value(0),
    destello: new Animated.Value(0),
    temblor: new Animated.Value(0),
    logo: new Animated.Value(0),
    halo: new Animated.Value(0),
    letras: NOMBRE.split('').map(() => new Animated.Value(0)),
    brillo: new Animated.Value(0),
    raya: new Animated.Value(0),
    lema: new Animated.Value(0),
    salida: new Animated.Value(0),
    rayos: Array.from({ length: RAYOS }, (_, i) => ({
      angulo: (360 / RAYOS) * i + Math.random() * 8,
      largo: 0.35 + Math.random() * 0.5,
      grosor: 1 + Math.random() * 2.5,
      blanco: Math.random() < 0.3,
      retraso: Math.random() * 0.45,
    })),
    chispas: Array.from({ length: CHISPAS }, () => ({
      v: new Animated.Value(0),
      angulo: Math.random() * Math.PI * 2,
      distancia: 0.25 + Math.random() * 0.4,
      tam: 2 + Math.random() * 4,
    })),
  }), []);

  const fin = () => {
    if (terminado.current) return;
    terminado.current = true;
    try { sonido.pause(); } catch { /* ya liberado */ }
    onFin();
  };

  useEffect(() => {
    try { sonido.play(); } catch { /* sin sonido, la intro sigue igual */ }

    const temblor = Animated.sequence(
      [14, -12, 9, -7, 4, -2, 0].map((x) => t(v.temblor, x, 45, Easing.linear)),
    );
    const animacion = Animated.sequence([
      // 1. Túnel de luz que acelera hacia el centro
      t(v.tunel, 1, 1600, Easing.in(Easing.quad)),
      // 2. Impacto
      Animated.parallel([
        Animated.sequence([t(v.fogonazo, 1, 70, Easing.linear), t(v.fogonazo, 0, 700)]),
        t(v.onda, 1, 900, Easing.out(Easing.quad)),
        Animated.sequence([t(v.destello, 1, 90, Easing.linear), t(v.destello, 0, 900)]),
        temblor,
        Animated.spring(v.logo, { toValue: 1, friction: 5, tension: 70, useNativeDriver: true }),
        t(v.halo, 1, 1100),
        ...v.chispas.map((ch, i) => t(ch.v, 1, 800 + (i % 7) * 90, Easing.out(Easing.quad))),
      ]),
      // 3. El nombre, el brillo que lo recorre, la raya y el lema
      Animated.parallel([
        Animated.stagger(60, v.letras.map((l) => t(l, 1, 420, Easing.out(Easing.back(2.2))))),
        t(v.brillo, 1, 1100, Easing.inOut(Easing.quad), 520),
        t(v.raya, 1, 800, Easing.out(Easing.cubic), 300),
        t(v.lema, 1, 700, Easing.out(Easing.cubic), 700),
      ]),
      Animated.delay(700),
      // 4. La cámara atraviesa la M
      t(v.salida, 1, 650, Easing.in(Easing.cubic)),
    ]);
    animacion.start(({ finished }) => finished && fin());
    return () => animacion.stop();
  }, []);

  const tamLetra = Math.min(lado * 0.12, 66);
  const anchoNombre = tamLetra * NOMBRE.length * 0.62;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, e.raiz, { opacity: v.salida.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 1, 0] }) }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={fin} hasTVPreferredFocus accessibilityLabel="Saltar intro" />

      <Animated.View pointerEvents="none" style={[e.centro, {
        transform: [
          { translateX: v.temblor },
          { translateY: Animated.multiply(v.temblor, -0.6) },
          { scale: v.salida.interpolate({ inputRange: [0, 1], outputRange: [1, 9], easing: Easing.in(Easing.exp) }) },
        ],
      }]}>
        {/* 1. Túnel de rayos */}
        {v.rayos.map((r, i) => {
          const largo = diagonal * r.largo;
          const p = v.tunel.interpolate({ inputRange: [0, r.retraso, 1], outputRange: [0, 0, 1], extrapolate: 'clamp' });
          return (
            <Animated.View key={i} style={[e.rayoEje, { transform: [{ rotate: `${r.angulo}deg` }] }]}>
              <Animated.View style={[e.rayo, {
                width: largo, height: r.grosor, backgroundColor: r.blanco ? '#ffe9ea' : '#ff2d36',
                opacity: Animated.multiply(p.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0, 1, 1, 0.2] }), v.logo.interpolate({ inputRange: [0, 0.2], outputRange: [1, 0], extrapolate: 'clamp' })),
                transform: [
                  { translateX: p.interpolate({ inputRange: [0, 1], outputRange: [diagonal * 0.55, largo / 2 - 4] }) },
                  { scaleX: p.interpolate({ inputRange: [0, 1], outputRange: [0.05, 1] }) },
                ],
              }]} />
            </Animated.View>
          );
        })}

        {/* Núcleo de luz que crece en el centro antes del impacto */}
        <Animated.View style={[e.nucleo, {
          opacity: v.tunel.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.4, 1] }),
          transform: [{ scale: Animated.multiply(v.tunel.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1.4] }), v.logo.interpolate({ inputRange: [0, 0.3], outputRange: [1, 0], extrapolate: 'clamp' })) }],
        }]} />

        {/* 2. Onda expansiva */}
        <Animated.View style={[e.onda, {
          width: lado * 0.5, height: lado * 0.5, borderRadius: lado * 0.25,
          opacity: v.onda.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 0.9, 0] }),
          transform: [{ scale: v.onda.interpolate({ inputRange: [0, 1], outputRange: [0.2, 4.5] }) }],
        }]} />

        {/* Halo rojo detrás del logo */}
        <Animated.View style={[e.halo, {
          width: logo * 2.4, height: logo * 2.4, borderRadius: logo * 1.2,
          opacity: v.halo.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 0.6, 0.3] }),
          transform: [{ scale: v.halo.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }],
        }]} />

        {/* Chispas */}
        {v.chispas.map((ch, i) => (
          <Animated.View key={i} style={[e.chispa, {
            width: ch.tam, height: ch.tam, borderRadius: ch.tam,
            opacity: ch.v.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 1, 0] }),
            transform: [
              { translateX: ch.v.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(ch.angulo) * lado * ch.distancia] }) },
              { translateY: ch.v.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(ch.angulo) * lado * ch.distancia + lado * 0.06] }) },
            ],
          }]} />
        ))}

        {/* Destello horizontal de lente */}
        <Animated.View style={[e.destello, {
          width: diagonal, opacity: v.destello,
          transform: [{ scaleX: v.destello.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }, { scaleY: v.destello.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.5] }) }],
        }]} />

        {/* Logo: cae desde la cámara */}
        <Animated.Image
          source={require('../assets/logo.png')}
          style={{
            width: logo, height: logo,
            opacity: v.logo.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }),
            transform: [
              { scale: v.logo.interpolate({ inputRange: [0, 1], outputRange: [4.5, 1] }) },
              { rotate: v.logo.interpolate({ inputRange: [0, 1], outputRange: ['-14deg', '0deg'] }) },
            ],
          }}
        />

        {/* 3. Nombre letra a letra con un brillo que lo recorre */}
        <View style={[e.nombre, { width: anchoNombre }]}>
          {NOMBRE.split('').map((letra, i) => (
            <Animated.Text key={i} style={[e.letra, { fontSize: tamLetra }, i >= 6 && { color: c.acento }, {
              opacity: v.letras[i],
              transform: [
                { translateY: v.letras[i].interpolate({ inputRange: [0, 1], outputRange: [34, 0] }) },
                { scale: v.letras[i].interpolate({ inputRange: [0, 1], outputRange: [1.8, 1] }) },
              ],
            }]}>{letra}</Animated.Text>
          ))}
          <Animated.View style={[e.brillo, {
            height: tamLetra * 1.4,
            opacity: v.brillo.interpolate({ inputRange: [0, 0.1, 0.9, 1], outputRange: [0, 0.75, 0.75, 0] }),
            transform: [{ translateX: v.brillo.interpolate({ inputRange: [0, 1], outputRange: [-anchoNombre * 0.6, anchoNombre * 0.6] }) }, { rotate: '18deg' }],
          }]} />
        </View>
        <Animated.View style={[e.raya, { width: Math.min(lado * 0.55, 300), transform: [{ scaleX: v.raya }] }]} />
        <Animated.Text style={[e.lema, {
          opacity: v.lema,
          transform: [{ translateY: v.lema.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
        }]}>{LEMA}</Animated.Text>
      </Animated.View>

      {/* Fogonazo a pantalla completa */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, e.fogonazo, { opacity: v.fogonazo.interpolate({ inputRange: [0, 1], outputRange: [0, 0.9] }) }]} />
      {/* Viñeta para dar profundidad */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, e.vineta]} />
    </Animated.View>
  );
}

const e = StyleSheet.create({
  raiz: { backgroundColor: '#030305', zIndex: 100, elevation: 100, overflow: 'hidden' },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  rayoEje: { position: 'absolute', width: 0, height: 0, alignItems: 'center', justifyContent: 'center' },
  rayo: { position: 'absolute', borderRadius: 2 },
  nucleo: { position: 'absolute', width: 140, height: 140, borderRadius: 70, backgroundColor: '#ff3b45', shadowColor: '#ff1e28', shadowOpacity: 1, shadowRadius: 40, elevation: 30 },
  onda: { position: 'absolute', borderWidth: 3, borderColor: '#ffd1d3' },
  halo: { position: 'absolute', backgroundColor: '#e31b23' },
  chispa: { position: 'absolute', backgroundColor: '#ffc2c5' },
  destello: { position: 'absolute', height: 4, borderRadius: 2, backgroundColor: '#fff', shadowColor: '#ff6a70', shadowOpacity: 1, shadowRadius: 20, elevation: 20 },
  nombre: { flexDirection: 'row', justifyContent: 'center', marginTop: 20, overflow: 'hidden' },
  letra: { color: '#fff', fontWeight: '900', letterSpacing: 1 },
  brillo: { position: 'absolute', top: -10, left: '50%', width: 26, marginLeft: -13, backgroundColor: 'rgba(255,255,255,0.85)' },
  raya: { height: 3, backgroundColor: c.acento, marginTop: 12, borderRadius: 2 },
  lema: { color: '#c9c9d2', fontSize: 12, fontWeight: '800', letterSpacing: 6, marginTop: 14 },
  fogonazo: { backgroundColor: '#fff0f0' },
  vineta: { borderWidth: 80, borderColor: 'rgba(0,0,0,0.35)', margin: -40, borderRadius: 120 },
});
