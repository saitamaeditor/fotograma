import { View, Text, Image, Pressable, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { c } from './tema';

export function Tarjeta({ t, onPress, ancho = 120 }) {
  return (
    <Pressable onPress={() => onPress(t)} style={({ pressed }) => [{ width: ancho, opacity: pressed ? 0.7 : 1 }]}>
      <View style={[e.poster, { width: ancho, height: ancho * 1.5 }]}>
        {t.poster ? (
          <Image source={{ uri: t.poster }} style={StyleSheet.absoluteFill} />
        ) : (
          <Text style={e.sinPoster}>{t.titulo}</Text>
        )}
        {!t.disponible && <Text style={e.insignia}>PRÓXIMAMENTE</Text>}
      </View>
      <Text style={e.titulo} numberOfLines={1}>{t.titulo}</Text>
      <Text style={e.sub}>{[t.anio, t.tipo === 'serie' ? 'Serie' : 'Película'].filter(Boolean).join(' · ')}</Text>
    </Pressable>
  );
}

export function Fila({ titulo, items, onPress }) {
  return (
    <View style={{ marginBottom: 26 }}>
      <Text style={e.filaTitulo}>{titulo}</Text>
      <FlatList
        horizontal
        data={items}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => <Tarjeta t={item} onPress={onPress} />}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
        showsHorizontalScrollIndicator={false}
      />
    </View>
  );
}

export function Boton({ texto, onPress, tipo = 'primario', style, disabled }) {
  const primario = tipo === 'primario';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        e.boton,
        { backgroundColor: primario ? c.acento : 'rgba(255,255,255,0.12)', opacity: disabled ? 0.4 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      <Text style={{ color: primario ? c.acentoTexto : c.texto, fontWeight: '700', fontSize: 15 }}>{texto}</Text>
    </Pressable>
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
  poster: { borderRadius: 10, overflow: 'hidden', backgroundColor: c.fondo3, justifyContent: 'center' },
  sinPoster: { color: c.texto2, textAlign: 'center', fontWeight: '700', padding: 8 },
  insignia: {
    position: 'absolute', top: 6, left: 6, backgroundColor: 'rgba(11,11,15,0.85)', color: c.texto2,
    fontSize: 9, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden',
  },
  titulo: { color: c.texto, fontSize: 13, fontWeight: '500', marginTop: 6 },
  sub: { color: c.texto3, fontSize: 11 },
  filaTitulo: { color: c.texto, fontSize: 18, fontWeight: '800', marginBottom: 10, paddingHorizontal: 16 },
  boton: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, minHeight: 300 },
});
