import { useState } from 'react';
import { View, Text, Image, Pressable, TextInput, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { c } from './tema';

// Pressable que se ilumina al recibir el foco del mando a distancia (Android TV / cruceta).
// Dibuja un marco blanco encima; con marco={false} el hijo recibe `foco` y se pinta él mismo.
export function Enfocable({ style, children, radio = 8, escala = 1.04, marco = true, onFocus, onBlur, ...props }) {
  const [foco, setFoco] = useState(false);
  return (
    <Pressable
      {...props}
      onFocus={(ev) => { setFoco(true); onFocus?.(ev); }}
      onBlur={(ev) => { setFoco(false); onBlur?.(ev); }}
      style={(estado) => [
        typeof style === 'function' ? style({ ...estado, foco }) : style,
        foco && { transform: [{ scale: escala }], zIndex: 1 },
      ]}
    >
      {(estado) => (
        <>
          {typeof children === 'function' ? children({ ...estado, foco }) : children}
          {foco && marco && <View pointerEvents="none" style={[StyleSheet.absoluteFill, e.marco, { borderRadius: radio }]} />}
        </>
      )}
    </Pressable>
  );
}

// Campo de texto con el mismo resaltado al enfocarlo
export function Entrada({ style, onFocus, onBlur, ...props }) {
  const [foco, setFoco] = useState(false);
  return (
    <TextInput
      {...props}
      onFocus={(ev) => { setFoco(true); onFocus?.(ev); }}
      onBlur={(ev) => { setFoco(false); onBlur?.(ev); }}
      style={[style, foco && { borderColor: '#fff', borderWidth: 2 }]}
    />
  );
}

// ---------- Deportes ----------
export const esDeporte = (t) => (t.generos ?? []).includes('Deportes');
const ICONOS_DEPORTE = [
  [/f[uú]tbol|soccer|liga|champions/i, '⚽'], [/baloncesto|basket|nba/i, '🏀'], [/tenis|p[aá]del/i, '🎾'],
  [/f[oó]rmula|f1|motor|rally/i, '🏎️'], [/moto/i, '🏍️'], [/ciclismo|tour/i, '🚴'], [/boxeo|ufc|mma|lucha/i, '🥊'],
  [/nfl|americano/i, '🏈'], [/rugby/i, '🏉'], [/golf/i, '⛳'], [/balonmano/i, '🤾'],
];
export const iconoDeporte = (d = '') => ICONOS_DEPORTE.find(([re]) => re.test(d))?.[1] ?? '🏆';
// Cada deporte tiene su color (el mismo que en la web)
export function colorDeporte(d = 'Deportes', luz = 28) {
  let h = 0;
  for (const ch of d) h = (h * 31 + ch.codePointAt(0)) % 360;
  return `hsl(${h}, 70%, ${luz}%)`;
}

// Cartel dibujado para los eventos sin imagen: color del deporte, icono y título
export function CartelDeporte({ t, grande = false }) {
  const d = t.deporte ?? 'Deportes';
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colorDeporte(d), padding: grande ? 18 : 10, justifyContent: 'flex-end' }]}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colorDeporte(d, 8), opacity: 0.55, top: '45%' }]} />
      <Text style={{ position: 'absolute', top: grande ? 16 : 8, right: grande ? 18 : 8, fontSize: grande ? 54 : 28 }}>{iconoDeporte(d)}</Text>
      <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: grande ? 12 : 9, fontWeight: '800', letterSpacing: 1 }} numberOfLines={1}>{d.toUpperCase()}</Text>
      {!grande && <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }} numberOfLines={4}>{t.titulo}</Text>}
    </View>
  );
}

export function Tarjeta({ t, onPress, ancho = 120 }) {
  return (
    <Enfocable marco={false} escala={1.08} onPress={() => onPress(t)} style={({ pressed }) => [{ width: ancho, opacity: pressed ? 0.7 : 1 }]}>
      {({ foco }) => (
        <>
          <View style={[e.poster, { width: ancho, height: ancho * 1.5 }]}>
            {t.poster ? (
              <Image source={{ uri: t.poster }} style={StyleSheet.absoluteFill} />
            ) : esDeporte(t) ? (
              <CartelDeporte t={t} />
            ) : (
              <Text style={e.sinPoster}>{t.titulo}</Text>
            )}
            {!t.disponible && <Text style={e.insignia}>PRÓXIMAMENTE</Text>}
            {foco && <View pointerEvents="none" style={[StyleSheet.absoluteFill, e.marco, { borderRadius: 10 }]} />}
          </View>
          <Text style={[e.titulo, foco && { color: '#fff', fontWeight: '800' }]} numberOfLines={1}>{t.titulo}</Text>
          <Text style={e.sub}>{[t.anio, esDeporte(t) ? t.deporte ?? 'Deportes' : (t.generos ?? [])[0]].filter(Boolean).join(' · ')}</Text>
        </>
      )}
    </Enfocable>
  );
}

export function Fila({ titulo, items, onPress, onVerTodo }) {
  return (
    <View style={{ marginBottom: 26 }}>
      <View style={e.filaCab}>
        <Text style={[e.filaTitulo, { marginBottom: 0, paddingHorizontal: 0 }]}>{titulo}</Text>
        {onVerTodo
          ? <Enfocable radio={999} escala={1} onPress={onVerTodo} style={{ marginLeft: 'auto', paddingHorizontal: 8, paddingVertical: 4 }}><Text style={e.filaTotal}>{items.length} · Ver todo ›</Text></Enfocable>
          : <Text style={e.filaTotal}>{items.length}</Text>}
      </View>
      <FlatList
        horizontal
        data={items}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => <Tarjeta t={item} onPress={onPress} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 12 }}
        showsHorizontalScrollIndicator={false}
      />
    </View>
  );
}

export function Boton({ texto, onPress, tipo = 'primario', style, disabled }) {
  const primario = tipo === 'primario';
  return (
    <Enfocable radio={999}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        e.boton,
        { backgroundColor: primario ? c.acento : 'rgba(255,255,255,0.12)', opacity: disabled ? 0.4 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      <Text style={{ color: primario ? c.acentoTexto : c.texto, fontWeight: '700', fontSize: 15 }}>{texto}</Text>
    </Enfocable>
  );
}

export const Cargando = () => (
  <View style={e.centro}><ActivityIndicator color={c.acento} size="large" /></View>
);

export const Vacio = ({ titulo, texto, children }) => (
  <View style={e.centro}>
    <Text style={{ color: c.texto, fontSize: 20, fontWeight: '700', marginBottom: 6, textAlign: 'center' }}>{titulo}</Text>
    {texto ? <Text style={{ color: c.texto2, textAlign: 'center' }}>{texto}</Text> : null}
    {children}
  </View>
);

const e = StyleSheet.create({
  marco: { borderWidth: 3, borderColor: '#fff' },
  poster: { borderRadius: 10, overflow: 'hidden', backgroundColor: c.fondo3, justifyContent: 'center' },
  sinPoster: { color: c.texto2, textAlign: 'center', fontWeight: '700', padding: 8 },
  insignia: {
    position: 'absolute', top: 6, left: 6, backgroundColor: 'rgba(11,11,15,0.85)', color: c.texto2,
    fontSize: 9, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden',
  },
  titulo: { color: c.texto, fontSize: 13, fontWeight: '500', marginTop: 6 },
  sub: { color: c.texto3, fontSize: 11 },
  filaTitulo: { color: c.texto, fontSize: 18, fontWeight: '800', marginBottom: 10, paddingHorizontal: 16 },
  filaCab: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginBottom: 10 },
  filaTotal: { color: c.texto3, fontSize: 13, marginLeft: 'auto' },
  punto: { width: 10, height: 10, borderRadius: 5 },
  etiqueta: { color: '#fff', fontSize: 9, fontWeight: '800', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3, overflow: 'hidden' },
  etiquetasTarjeta: { position: 'absolute', top: 6, right: 6, left: 30, justifyContent: 'flex-end' },
  selector: { marginHorizontal: 16, marginBottom: 26, padding: 14, backgroundColor: '#1a1a22', borderWidth: 1, borderColor: '#2a2a35', borderRadius: 8 },
  selectorTitulo: { color: c.texto, fontSize: 17, fontWeight: '800' },
  selectorAyuda: { color: c.texto3, fontSize: 12, marginTop: 2 },
  selectorResumen: { color: c.texto2, fontSize: 12, marginTop: 2, marginBottom: 12 },
  casillas: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  casilla: { flexBasis: '48%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 11, backgroundColor: '#20202a', borderRadius: 6 },
  casillaActiva: { backgroundColor: '#262632' },
  check: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: '#6f6f80', alignItems: 'center', justifyContent: 'center' },
  checkActivo: { backgroundColor: '#2f6fed', borderColor: '#2f6fed' },
  checkMarca: { color: '#fff', fontSize: 12, fontWeight: '900', lineHeight: 14 },
  casillaTexto: { color: c.texto, fontWeight: '600', fontSize: 14, flexShrink: 1 },
  boton: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, minHeight: 300 },
});
