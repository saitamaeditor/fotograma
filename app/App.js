import { useEffect, useState } from 'react';
import { View, Text, BackHandler, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Inicio, Explorar, Series, MiLista, Ficha } from './src/pantallas';
import { Reproductor } from './src/Reproductor';
import { Enfocable } from './src/componentes';
import { Intro } from './src/Intro';
import { c } from './src/tema';

const PESTANAS = [
  ['inicio', 'Inicio', '⌂', Inicio],
  ['explorar', 'Películas', '⌕', Explorar],
  ['series', 'Series', '▤', Series],
  ['lista', 'Mi lista', '♡', MiLista],
];
const PANTALLAS = { ficha: Ficha, reproductor: Reproductor };

// Navegación mínima: una pestaña activa y una pila de pantallas encima.
function Navegador() {
  const ins = useSafeAreaInsets();
  const [pestana, setPestana] = useState('inicio');
  const [pila, setPila] = useState([]);

  const nav = {
    ir: (nombre, params = {}) => setPila((p) => [...p, { nombre, params, clave: Date.now() }]),
    reemplazar: (nombre, params = {}) => setPila((p) => [...p.slice(0, -1), { nombre, params, clave: Date.now() }]),
    atras: () => setPila((p) => p.slice(0, -1)),
    pestana: (n) => { setPila([]); setPestana(n); },
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!pila.length) return false;
      nav.atras();
      return true;
    });
    return () => sub.remove();
  }, [pila.length]);

  const arriba = pila.at(-1);
  if (arriba) {
    const Pantalla = PANTALLAS[arriba.nombre];
    return (
      <View style={e.raiz}>
        <StatusBar style="light" hidden={arriba.nombre === 'reproductor'} />
        <Pantalla key={arriba.clave} nav={nav} params={arriba.params} />
      </View>
    );
  }

  const [, , , Activa] = PESTANAS.find(([id]) => id === pestana);
  return (
    <View style={e.raiz}>
      <StatusBar style="light" />
      <View style={{ flex: 1 }}><Activa key={pestana} nav={nav} params={{}} /></View>
      <View style={[e.tabs, { paddingBottom: ins.bottom || 8 }]}>
        {PESTANAS.map(([id, txt, icono]) => (
          <Enfocable key={id} onPress={() => setPestana(id)} style={e.tab} accessibilityRole="tab" accessibilityState={{ selected: pestana === id }}>
            <Text style={[e.tabIcono, pestana === id && { color: c.acento }]}>{icono}</Text>
            <Text style={[e.tabTexto, pestana === id && { color: c.acento }]}>{txt}</Text>
          </Enfocable>
        ))}
      </View>
    </View>
  );
}

// La app carga por debajo mientras se ve la intro
export default function App() {
  const [intro, setIntro] = useState(true);
  return (
    <SafeAreaProvider>
      <View style={e.raiz}>
        <Navegador />
        {intro && <Intro onFin={() => setIntro(false)} />}
      </View>
    </SafeAreaProvider>
  );
}

const e = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: c.fondo },
  tabs: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: c.borde, backgroundColor: 'rgba(11,11,15,0.98)', paddingTop: 8 },
  tab: { flex: 1, alignItems: 'center', gap: 2 },
  tabIcono: { color: c.texto3, fontSize: 20 },
  tabTexto: { color: c.texto3, fontSize: 11, fontWeight: '600' },
});
