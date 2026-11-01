import { useEffect, useMemo, useRef } from 'react';
import { View, Animated, Easing, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { c } from './tema';

const NOMBRE = 'MorvehTV';
const LEMA = 'TU CINE EN LA WEB';
const t = (v) => Animated.timing(v.valor, { toValue: v.a, duration: v.ms, delay: v.retraso ?? 0, easing: v.curva ?? Easing.out(Easing.cubic), useNativeDriver: true });

// Intro de unos 3 s al abrir la app: dos haces de luz se cruzan, fogonazo, el logo cae
// con un rebote rodeado de chispas, se escribe «MorvehTV» letra a letra y todo se
// acerca a cámara al desaparecer. Un toque (u OK en el mando) la salta.
export function Intro({ onFin }) {
  const { width, height } = useWindowDimensions();
  const lado = Math.min(width, height);
  const logo = Math.min(lado * 0.42, 240);
  const terminado = useRef(false);

  const v = useMemo(() => ({
    haz: new Animated.Value(0),
    fogonazo: new Animated.Value(0),
    logo: new Animated.Value(0),
    halo: new Animated.Value(0),
    letras: NOMBRE.split('').map(() => new Animated.Value(0)),
    raya: new Animated.Value(0),
    lema: new Animated.Value(0),
    salida: new Animated.Value(0),
    chispas: Array.from({ length: 18 }, () => ({
      v: new Animated.Value(0),
      x: (Math.random() - 0.5) * 2,
      y: (Math.random() - 0.5) * 2,
      tam: 2 + Math.random() * 4,
    })),
  }), []);

  const fin = () => {
    if (terminado.current) return;
    terminado.current = true;
    onFin();
  };

  useEffect(() => {
    const animacion = Animated.sequence([
      // 1. Haces de luz que se cruzan en el centro
      t({ valor: v.haz, a: 1, ms: 650, curva: Easing.inOut(Easing.cubic) }),
      // 2. Fogonazo + el logo cae desde cerca con rebote + chispas que salen disparadas
      Animated.parallel([
        Animated.sequence([
          t({ valor: v.fogonazo, a: 1, ms: 120, curva: Easing.linear }),
          t({ valor: v.fogonazo, a: 0, ms: 520 }),
        ]),
        Animated.spring(v.logo, { toValue: 1, friction: 6, tension: 60, useNativeDriver: true }),
        t({ valor: v.halo, a: 1, ms: 900 }),
        ...v.chispas.map((ch, i) => t({ valor: ch.v, a: 1, ms: 900 + i * 25, curva: Easing.out(Easing.quad) })),
      ]),
      // 3. El nombre letra a letra, la raya roja y el lema
      Animated.parallel([
        Animated.stagger(55, v.letras.map((l) => t({ valor: l, a: 1, ms: 380, curva: Easing.out(Easing.back(2)) }))),
        t({ valor: v.raya, a: 1, ms: 700, retraso: 250 }),
        t({ valor: v.lema, a: 1, ms: 600, retraso: 550 }),
      ]),
      Animated.delay(650),
      // 4. Todo se acerca a cámara y se funde
      t({ valor: v.salida, a: 1, ms: 520, curva: Easing.in(Easing.cubic) }),
    ]);
    animacion.start(({ finished }) => finished && fin());
    return () => animacion.stop();
  }, []);

  const largoHaz = width * 1.2;
  const salidaEscala = v.salida.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
  const salidaOpacidad = v.salida.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, e.raiz, { opacity: salidaOpacidad }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={fin} hasTVPreferredFocus accessibilityLabel="Saltar intro" />

      <Animated.View pointerEvents="none" style={[e.centro, { transform: [{ scale: salidaEscala }] }]}>
        {/* Haces de luz: uno entra por la izquierda y otro por la derecha */}
        {[-1, 1].map((lado_) => (
          <Animated.View
            key={lado_}
            style={[e.haz, {
              width: largoHaz,
              opacity: v.haz.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0.9] }),
              transform: [
                { translateX: v.haz.interpolate({ inputRange: [0, 1], outputRange: [lado_ * width, 0] }) },
                { translateY: lado_ * -logo * 0.08 },
                { scaleY: v.fogonazo.interpolate({ inputRange: [0, 1], outputRange: [1, 6] }) },
              ],
            }]}
          />
        ))}

        {/* Halo rojo que crece detrás del logo */}
        <Animated.View style={[e.halo, {
          width: logo * 2.2, height: logo * 2.2, borderRadius: logo * 1.1,
          opacity: v.halo.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.55, 0.28] }),
          transform: [{ scale: v.halo.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }],
        }]} />

        {/* Chispas */}
        {v.chispas.map((ch, i) => (
          <Animated.View key={i} style={[e.chispa, {
            width: ch.tam, height: ch.tam, borderRadius: ch.tam,
            opacity: ch.v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }),
            transform: [
              { translateX: ch.v.interpolate({ inputRange: [0, 1], outputRange: [0, ch.x * lado * 0.55] }) },
              { translateY: ch.v.interpolate({ inputRange: [0, 1], outputRange: [0, ch.y * lado * 0.45 - lado * 0.08] }) },
            ],
          }]} />
        ))}

        {/* Logo */}
        <Animated.Image
          source={require('../assets/logo.png')}
          style={{
            width: logo, height: logo,
            opacity: v.logo.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }),
            transform: [
              { scale: v.logo.interpolate({ inputRange: [0, 1], outputRange: [3.2, 1] }) },
              { rotate: v.logo.interpolate({ inputRange: [0, 1], outputRange: ['-8deg', '0deg'] }) },
            ],
          }}
        />

        {/* Nombre letra a letra */}
        <View style={e.nombre}>
          {NOMBRE.split('').map((letra, i) => (
            <Animated.Text key={i} style={[e.letra, { fontSize: Math.min(lado * 0.12, 64) }, i >= 6 && { color: c.acento }, {
              opacity: v.letras[i],
              transform: [
                { translateY: v.letras[i].interpolate({ inputRange: [0, 1], outputRange: [26, 0] }) },
                { scale: v.letras[i].interpolate({ inputRange: [0, 1], outputRange: [1.6, 1] }) },
              ],
            }]}>{letra}</Animated.Text>
          ))}
        </View>
        <Animated.View style={[e.raya, { width: Math.min(lado * 0.5, 280), transform: [{ scaleX: v.raya }] }]} />
        <Animated.Text style={[e.lema, {
          opacity: v.lema,
          transform: [{ translateY: v.lema.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
        }]}>{LEMA}</Animated.Text>
      </Animated.View>

      {/* Fogonazo blanco-rojo a pantalla completa */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, e.fogonazo, { opacity: v.fogonazo.interpolate({ inputRange: [0, 1], outputRange: [0, 0.85] }) }]} />
    </Animated.View>
  );
}

const e = StyleSheet.create({
  raiz: { backgroundColor: '#050507', zIndex: 100, elevation: 100 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  haz: { position: 'absolute', height: 3, backgroundColor: '#ff3b45', shadowColor: '#ff1e28', shadowOpacity: 1, shadowRadius: 12, elevation: 12 },
  halo: { position: 'absolute', backgroundColor: '#e31b23' },
  chispa: { position: 'absolute', backgroundColor: '#ffb3b6' },
  nombre: { flexDirection: 'row', marginTop: 18 },
  letra: { color: '#fff', fontWeight: '900', letterSpacing: 1 },
  raya: { height: 3, backgroundColor: c.acento, marginTop: 10, borderRadius: 2 },
  lema: { color: '#bdbdc6', fontSize: 12, fontWeight: '700', letterSpacing: 5, marginTop: 12 },
  fogonazo: { backgroundColor: '#ffe3e4' },
});
