import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, Image, ScrollView, FlatList, RefreshControl, StyleSheet, useWindowDimensions, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, miLista, progreso, siguienteEpisodio, urlApi } from './api';
import { Fila, Tarjeta, Boton, Cargando, Vacio, Enfocable, Entrada } from './componentes';
import * as cuenta from './cuenta';
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

// Usuario con sesión (o null); se actualiza al entrar o salir
function useUsuario() {
  const [u, setU] = useState(cuenta.usuario());
  useEffect(() => cuenta.alCambiar(setU), []);
  return u;
}

// Botón «Entrar» o el nombre del usuario: abre la pantalla de cuenta
function BotonCuenta({ nav, style }) {
  const u = useUsuario();
  return (
    <Enfocable radio={999} onPress={() => nav.ir('cuenta')} style={[e.botonCuenta, u && e.botonCuentaConectado, style]}>
      <Text style={e.botonCuentaTexto} numberOfLines={1}>{u ? `👤 ${u.nombre}` : 'Entrar'}</Text>
    </Enfocable>
  );
}

// ---------- Cuenta ----------
const TELEGRAM = 'https://t.me/+-NkYOGhz9NMzNGI0';
const correoValido = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

// 0 = vacía … 4 = fuerte
function fuerza(cl) {
  if (!cl) return 0;
  let p = 0;
  if (cl.length >= 6) p++;
  if (cl.length >= 10) p++;
  if (/[a-z]/.test(cl) && /[A-Z]/.test(cl)) p++;
  if (/\d/.test(cl) && /[^A-Za-z0-9]/.test(cl)) p++;
  else if (/\d/.test(cl) || /[^A-Za-z0-9]/.test(cl)) p += 0.5;
  return Math.max(1, Math.min(4, Math.round(p)));
}
const NIVELES = [['', c.borde], ['Débil', '#ef5b5b'], ['Aceptable', '#f5a524'], ['Buena', '#a3d14f'], ['Fuerte', '#4fd18b']];

// Campo con etiqueta, y botón «Ver» en las contraseñas
function Campo({ etiqueta, ayuda, ayudaBien, contrasena, ...props }) {
  const [ver, setVer] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text style={e.etiqueta}>{etiqueta}</Text>
      <View style={{ justifyContent: 'center' }}>
        <Entrada
          {...props}
          secureTextEntry={contrasena && !ver}
          autoCapitalize={contrasena || props.keyboardType === 'email-address' ? 'none' : props.autoCapitalize}
          autoCorrect={false}
          placeholderTextColor={c.texto3}
          style={[e.entrada, contrasena && { paddingRight: 64 }]}
        />
        {contrasena && (
          <Enfocable radio={8} escala={1} onPress={() => setVer(!ver)} style={e.ver}>
            <Text style={{ color: c.texto2, fontWeight: '700', fontSize: 13 }}>{ver ? 'Ocultar' : 'Ver'}</Text>
          </Enfocable>
        )}
      </View>
      {ayuda ? <Text style={{ color: ayudaBien ? '#4fd18b' : c.peligro, fontSize: 12.5 }}>{ayuda}</Text> : null}
    </View>
  );
}

export function Cuenta({ nav }) {
  const u = useUsuario();
  return u ? <Perfil nav={nav} u={u} /> : <Acceso nav={nav} />;
}

function Acceso({ nav }) {
  const ins = useSafeAreaInsets();
  const [registro, setRegistro] = useState(false);
  const [campos, setCampos] = useState({ nombre: '', email: '', contrasena: '', repetir: '' });
  const [estado, setEstado] = useState({ cargando: false, error: '' });
  const [olvido, setOlvido] = useState(false);
  const poner = (k) => (v) => setCampos((x) => ({ ...x, [k]: v }));
  const nivel = fuerza(campos.contrasena);
  const coinciden = campos.repetir && campos.repetir === campos.contrasena;
  const correoMal = campos.email.length > 3 && campos.email.includes('@') && !correoValido(campos.email);

  async function enviar() {
    if (!correoValido(campos.email)) return setEstado({ cargando: false, error: 'Escribe un correo válido' });
    if (!campos.contrasena) return setEstado({ cargando: false, error: 'Escribe tu contraseña' });
    if (registro && campos.contrasena.length < 6) return setEstado({ cargando: false, error: 'La contraseña debe tener al menos 6 caracteres' });
    if (registro && !coinciden) return setEstado({ cargando: false, error: 'Las contraseñas no coinciden' });
    setEstado({ cargando: true, error: '' });
    try {
      if (registro) await cuenta.registrar(campos.nombre.trim(), campos.email.trim(), campos.contrasena);
      else await cuenta.entrar(campos.email.trim(), campos.contrasena);
      nav.atras();
    } catch (err) {
      setEstado({ cargando: false, error: err.message });
    }
  }

  const cambiarModo = (r) => { setRegistro(r); setEstado({ cargando: false, error: '' }); setOlvido(false); };

  return (
    <ScrollView contentContainerStyle={[e.cuentaCont, { paddingTop: ins.top + 16 }]} keyboardShouldPersistTaps="handled">
      <Enfocable radio={19} onPress={nav.atras} style={e.atrasCuenta}><Text style={{ color: c.texto, fontSize: 22 }}>‹</Text></Enfocable>
      <View style={e.cuentaCaja}>
        <Text style={e.cuentaLogo}>Morveh<Text style={{ color: c.acento }}>TV</Text></Text>
        <Text style={e.h1}>{registro ? 'Crea tu cuenta gratis' : 'Bienvenido de nuevo'}</Text>
        <Text style={{ color: c.texto2, lineHeight: 20 }}>{registro ? 'Tu lista y lo que estás viendo, en la web, el móvil y la tele.' : 'Entra para seguir viendo donde lo dejaste.'}</Text>

        <View style={e.pestanas}>
          {[['Iniciar sesión', false], ['Crear cuenta', true]].map(([txt, r]) => (
            <Enfocable key={txt} radio={9} escala={1} onPress={() => cambiarModo(r)} style={[e.pestana, registro === r && e.pestanaActiva]}>
              <Text style={{ color: registro === r ? '#fff' : c.texto2, fontWeight: '700' }}>{txt}</Text>
            </Enfocable>
          ))}
        </View>

        {registro && <Campo etiqueta="Nombre" value={campos.nombre} onChangeText={poner('nombre')} placeholder="Cómo quieres que te llamemos" autoComplete="name" maxLength={40} />}
        <Campo etiqueta="Correo electrónico" value={campos.email} onChangeText={poner('email')} placeholder="tu@correo.com" keyboardType="email-address" autoComplete="email" ayuda={correoMal ? 'Revisa el correo: falta algo' : ''} />
        <Campo etiqueta="Contraseña" contrasena value={campos.contrasena} onChangeText={poner('contrasena')} placeholder={registro ? 'Mínimo 6 caracteres' : 'Tu contraseña'} autoComplete={registro ? 'new-password' : 'password'} onSubmitEditing={registro ? undefined : enviar} />
        {registro && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: -4 }}>
              {[1, 2, 3, 4].map((i) => <View key={i} style={[e.barraFuerza, { backgroundColor: nivel >= i ? NIVELES[nivel][1] : c.borde }]} />)}
              <Text style={{ color: c.texto2, fontSize: 12, width: 70, textAlign: 'right' }}>{NIVELES[nivel][0]}</Text>
            </View>
            <Campo etiqueta="Repite la contraseña" contrasena value={campos.repetir} onChangeText={poner('repetir')} autoComplete="new-password" onSubmitEditing={enviar}
              ayuda={campos.repetir ? (coinciden ? '✓ Coinciden' : 'No coinciden') : ''} ayudaBien={coinciden} />
          </>
        )}
        {!registro && (
          <Enfocable radio={6} escala={1} onPress={() => setOlvido(!olvido)} style={{ alignSelf: 'flex-end', padding: 4 }}>
            <Text style={{ color: c.texto2, textDecorationLine: 'underline', fontSize: 13 }}>¿Olvidaste tu contraseña?</Text>
          </Enfocable>
        )}
        {olvido && (
          <View style={e.avisoCuenta}>
            <Text style={{ color: c.texto2, lineHeight: 19, fontSize: 13.5 }}>Escríbenos por Telegram con el correo de tu cuenta y te daremos una contraseña nueva.</Text>
            <Boton texto="Abrir Telegram" tipo="secundario" onPress={() => Linking.openURL(TELEGRAM)} style={{ alignSelf: 'flex-start', marginTop: 10, paddingVertical: 8 }} />
          </View>
        )}
        {estado.error ? <Text style={{ color: c.peligro }}>{estado.error}</Text> : null}
        <Boton texto={estado.cargando ? 'Un momento…' : registro ? 'Crear cuenta' : 'Entrar'} onPress={enviar} disabled={estado.cargando} style={{ marginTop: 4 }} />
        {registro && (
          <View style={{ gap: 6, marginTop: 6 }}>
            {['Tu lista privada, igual en todos tus dispositivos', 'Sigue viendo justo donde lo dejaste', 'Gratis y sin anuncios'].map((t) => (
              <Text key={t} style={{ color: c.texto2, fontSize: 13 }}><Text style={{ color: '#4fd18b', fontWeight: '900' }}>✓  </Text>{t}</Text>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

// Dispositivos con la sesión abierta, con opción de cerrarlos a distancia
function Dispositivos() {
  const [lista, setLista] = useState(null);
  const [error, setError] = useState('');
  const cargar = () => cuenta.dispositivos().then(setLista).catch((err) => setError(err.message));
  useEffect(() => { cargar(); }, []);
  const hace = (f) => {
    const min = Math.round((Date.now() - Date.parse(f)) / 60000);
    if (min < 15) return 'activo ahora';
    if (min < 60) return `hace ${min} min`;
    const h = Math.round(min / 60);
    return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`;
  };
  if (error) return <Text style={{ color: c.peligro }}>{error}</Text>;
  if (!lista) return <Text style={{ color: c.texto3 }}>Cargando…</Text>;
  const otros = lista.filter((d) => !d.actual).length;
  return (
    <View style={{ gap: 8 }}>
      {lista.map((d) => (
        <View key={d.id} style={e.dispositivo}>
          <Text style={{ fontSize: 20 }}>{/TV/i.test(d.dispositivo) ? '📺' : /App|Android|iPhone/i.test(d.dispositivo) ? '📱' : '💻'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontWeight: '700' }} numberOfLines={1}>{d.dispositivo}</Text>
            <Text style={{ color: c.texto2, fontSize: 12.5 }}>{d.actual ? 'Este dispositivo' : hace(d.ultimo)}</Text>
          </View>
          {d.actual
            ? <Text style={e.esteDisp}>Aquí</Text>
            : <Boton texto="Cerrar" tipo="secundario" onPress={async () => { await cuenta.cerrarDispositivo(d.id).catch(() => {}); cargar(); }} style={{ paddingVertical: 7, paddingHorizontal: 14 }} />}
        </View>
      ))}
      {otros > 0 && <Boton texto={`Cerrar sesión en los demás (${otros})`} tipo="secundario" onPress={async () => { await cuenta.cerrarOtros().catch(() => {}); cargar(); }} />}
    </View>
  );
}

function Perfil({ nav, u }) {
  const ins = useSafeAreaInsets();
  const [cifras, setCifras] = useState({ lista: 0, empezados: 0 });
  const [nombre, setNombre] = useState(u.nombre);
  const [claves, setClaves] = useState({ actual: '', nueva: '', repetir: '' });
  const [aviso, setAviso] = useState({ texto: '', bien: false });
  useEffect(() => {
    Promise.all([miLista.ids(), progreso.todo()]).then(([l, p]) => setCifras({ lista: l.length, empezados: Object.keys(p).length }));
  }, []);
  const desde = u.creado ? new Date(u.creado).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }) : null;

  async function guardarNombre() {
    try { await cuenta.cambiarNombre(nombre); setAviso({ texto: 'Nombre guardado', bien: true }); }
    catch (err) { setAviso({ texto: err.message, bien: false }); }
  }
  async function guardarClave() {
    if (claves.nueva.length < 6) return setAviso({ texto: 'La contraseña nueva debe tener al menos 6 caracteres', bien: false });
    if (claves.nueva !== claves.repetir) return setAviso({ texto: 'Las contraseñas nuevas no coinciden', bien: false });
    try {
      await cuenta.cambiarContrasena(claves.actual, claves.nueva);
      setClaves({ actual: '', nueva: '', repetir: '' });
      setAviso({ texto: 'Contraseña cambiada', bien: true });
    } catch (err) {
      setAviso({ texto: err.message, bien: false });
    }
  }

  return (
    <ScrollView contentContainerStyle={[e.cuentaCont, { paddingTop: ins.top + 16 }]} keyboardShouldPersistTaps="handled">
      <Enfocable radio={19} onPress={nav.atras} style={e.atrasCuenta}><Text style={{ color: c.texto, fontSize: 22 }}>‹</Text></Enfocable>
      <View style={e.cuentaCaja}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={e.avatar}><Text style={{ color: '#fff', fontSize: 26, fontWeight: '900' }}>{(u.nombre || u.email)[0].toUpperCase()}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontSize: 21, fontWeight: '800' }} numberOfLines={1}>{u.nombre}</Text>
            <Text style={{ color: c.texto2, fontSize: 13 }} numberOfLines={1}>{u.email}{desde ? ` · desde ${desde}` : ''}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={e.cifra}><Text style={e.cifraNum}>{cifras.lista}</Text><Text style={e.cifraTxt}>en tu lista</Text></View>
          <View style={e.cifra}><Text style={e.cifraNum}>{cifras.empezados}</Text><Text style={e.cifraTxt}>empezados</Text></View>
        </View>
        <Text style={{ color: c.texto2, lineHeight: 20, fontSize: 13.5 }}>Tu lista y lo que estás viendo se guardan en tu cuenta. Entra con el mismo correo en la web o la tele para tenerlo todo igual.</Text>

        <Text style={e.seccionCuenta}>Dispositivos conectados</Text>
        <Text style={{ color: c.texto2, fontSize: 13 }}>Puedes usar tu cuenta en todos los que quieras a la vez.</Text>
        <Dispositivos />

        <Text style={e.seccionCuenta}>Cambiar nombre</Text>
        <Campo etiqueta="Nombre" value={nombre} onChangeText={setNombre} maxLength={40} autoComplete="name" />
        <Boton texto="Guardar nombre" tipo="secundario" onPress={guardarNombre} />

        <Text style={e.seccionCuenta}>Cambiar contraseña</Text>
        <Campo etiqueta="Contraseña actual" contrasena value={claves.actual} onChangeText={(v) => setClaves((x) => ({ ...x, actual: v }))} autoComplete="password" />
        <Campo etiqueta="Contraseña nueva" contrasena value={claves.nueva} onChangeText={(v) => setClaves((x) => ({ ...x, nueva: v }))} placeholder="Mínimo 6 caracteres" autoComplete="new-password" />
        <Campo etiqueta="Repite la contraseña nueva" contrasena value={claves.repetir} onChangeText={(v) => setClaves((x) => ({ ...x, repetir: v }))} autoComplete="new-password" />
        <Boton texto="Cambiar contraseña" tipo="secundario" onPress={guardarClave} />

        {aviso.texto ? <Text style={{ color: aviso.bien ? '#4fd18b' : c.peligro }}>{aviso.texto}</Text> : null}
        <Boton texto="Cerrar sesión" tipo="secundario" onPress={async () => { await cuenta.salir(); nav.atras(); }} style={{ marginTop: 12, borderWidth: 1, borderColor: c.peligro }} />
      </View>
    </ScrollView>
  );
}

function ErrorConexion({ error, recargar, nav }) {
  return (
    <Vacio titulo="No se pudo conectar" texto={`${error.message}\n\nAPI: ${urlApi()}`}>
      <Boton texto="Reintentar" onPress={recargar} style={{ marginTop: 18 }} />
    </Vacio>
  );
}

// ---------- Inicio (películas) y Series ----------
// Las categorías. Documentales y docuseries llevan el género «Documental»; el anime, «Anime»;
// los programas, «Programa de TV»; las novelas turcas, «Novela turca».
const CATEGORIAS = {
  pelicula: { nombre: 'Películas', unidad: 'películas' },
  serie: { nombre: 'Series', unidad: 'series' },
  documental: { nombre: 'Documentales', unidad: 'documentales' },
  docuserie: { nombre: 'Docuseries', unidad: 'docuseries' },
  'anime-pelicula': { nombre: 'Películas anime', unidad: 'películas anime' },
  'anime-serie': { nombre: 'Series anime', unidad: 'series anime' },
  programa: { nombre: 'Programas de TV', unidad: 'programas de TV' },
  'novela-turca': { nombre: 'Novelas turcas', unidad: 'novelas turcas' },
};

// Inicio: el destacado y una fila por categoría, con «Ver todo» para abrir cada una
export function Inicio({ nav }) {
  const { width, height } = useWindowDimensions();
  const ins = useSafeAreaInsets();
  const { datos, error, cargando, recargar } = useDatos(() => api('/portada'));
  if (error) return <ErrorConexion error={error} recargar={recargar} nav={nav} />;
  if (!datos) return <Cargando />;
  const { destacado, filas } = datos;
  const abrir = (t) => nav.ir('ficha', { id: t.id });

  return (
    <View style={{ flex: 1 }}>
      <ScrollView refreshControl={<RefreshControl refreshing={cargando} onRefresh={recargar} tintColor={c.acento} />}>
        {destacado ? (
          <View style={{ height: Math.min(height * 0.62, 560), justifyContent: 'flex-end' }}>
            <Image source={{ uri: destacado.fondo }} style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(11,11,15,0.35)' }]} />
            <View style={e.degradado} />
            <View style={{ padding: 16, paddingTop: ins.top + 16 }}>
              <Text style={e.marca}>MorvehTV</Text>
              <Text style={[e.heroTitulo, { fontSize: width > 600 ? 48 : 34 }]}>{destacado.titulo}</Text>
              <Text style={e.heroTexto} numberOfLines={3}>{destacado.sinopsis}</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                {destacado.disponible && <Boton texto="▶  Reproducir" onPress={() => nav.ir('ficha', { id: destacado.id, reproducir: true })} />}
                <Boton texto="Más información" tipo="secundario" onPress={() => abrir(destacado)} />
              </View>
            </View>
          </View>
        ) : (
          <Text style={[e.h1, { paddingHorizontal: 16, paddingTop: ins.top + 16 }]}>MorvehTV</Text>
        )}
        <View style={{ paddingTop: 20, paddingBottom: 30 }}>
          {filas.length
            ? filas.map((f) => <Fila key={f.id} titulo={f.titulo} items={f.items} onPress={abrir} onVerTodo={() => nav.ir('categoria', { tipo: f.id, titulo: f.titulo })} />)
            : <Vacio titulo="Todavía no hay nada" texto="En cuanto se añada contenido aparecerá aquí." />}
        </View>
      </ScrollView>
      <BotonCuenta nav={nav} style={{ position: 'absolute', top: ins.top + 10, right: 14 }} />
    </View>
  );
}

// Una categoría: todos sus títulos en rejilla, con buscador. Sirve de pestaña y de pantalla
// (al pulsar «Ver todo» en Inicio).
function Categoria({ nav, tipo, atras, titulo }) {
  const ins = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { nombre, unidad } = CATEGORIAS[tipo] ?? { nombre: titulo ?? 'Categoría', unidad: 'títulos' };
  const [q, setQ] = useState('');
  const { datos, error, cargando, recargar } = useDatos(() => api(`/titulos?categoria=${tipo}`), [tipo]);
  const columnas = Math.max(3, Math.floor(width / 140));
  const ancho = (width - 32 - (columnas - 1) * 10) / columnas;

  if (error) return <ErrorConexion error={error} recargar={recargar} nav={nav} />;
  if (!datos) return <Cargando />;
  const texto = q.trim().toLowerCase();
  const lista = texto ? datos.filter((t) => t.titulo.toLowerCase().includes(texto)) : datos;
  return (
    <FlatList
      data={lista}
      key={columnas}
      numColumns={columnas}
      keyExtractor={(t) => t.id}
      refreshControl={<RefreshControl refreshing={cargando} onRefresh={recargar} tintColor={c.acento} />}
      ListHeaderComponent={
        <View style={{ paddingTop: ins.top + 16, paddingBottom: 16, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {atras && <Enfocable radio={19} onPress={nav.atras} style={e.atrasCuenta}><Text style={{ color: c.texto, fontSize: 22 }}>‹</Text></Enfocable>}
            <Text style={e.h1}>{nombre}</Text>
            <Text style={{ color: c.texto3, marginLeft: 'auto' }}>{datos.length}</Text>
          </View>
          {datos.length > 6 && (
            <Entrada value={q} onChangeText={setQ} placeholder={`Buscar en ${nombre.toLowerCase()}`} placeholderTextColor={c.texto3} style={e.entrada} returnKeyType="search" />
          )}
        </View>
      }
      ListEmptyComponent={<Vacio titulo={texto ? 'Sin resultados' : `Sin ${unidad}`} texto={texto ? 'Prueba con otro título.' : `Todavía no hay ${unidad} en el catálogo.`} />}
      renderItem={({ item }) => <Tarjeta t={item} ancho={ancho} onPress={(t) => nav.ir('ficha', { id: t.id })} />}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
      columnWrapperStyle={{ gap: 10, marginBottom: 14 }}
    />
  );
}

export const Peliculas = (props) => <Categoria {...props} tipo="pelicula" />;
export const Series = (props) => <Categoria {...props} tipo="serie" />;
export const Anime = (props) => <Categoria {...props} tipo="anime-pelicula" />;
// Pantalla que se abre desde «Ver todo»
export const PantallaCategoria = ({ nav, params }) => <Categoria nav={nav} tipo={params.tipo} titulo={params.titulo} atras />;

function CabeceraMiLista({ nav }) {
  const u = useUsuario();
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={e.h1}>Mi lista</Text>
        <BotonCuenta nav={nav} />
      </View>
      {!u && <Text style={{ color: c.texto2, fontSize: 13 }}>Tu lista solo está en este dispositivo. Entra o crea una cuenta para tenerla también en la web y la tele.</Text>}
    </View>
  );
}

export function MiLista({ nav }) {
  const ins = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { datos, error, recargar } = useDatos(async () => {
    const [ids, todos] = await Promise.all([miLista.ids(), api('/titulos')]);
    return ids.map((id) => todos.find((t) => t.id === id)).filter(Boolean);
  });
  useEffect(() => cuenta.alLlegarDatos(recargar), [recargar]);
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
      ListHeaderComponent={<CabeceraMiLista nav={nav} />}
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
        <Enfocable radio={19} onPress={nav.atras} style={[e.atras, { top: ins.top + 8 }]} hitSlop={10}>
          <Text style={{ color: c.texto, fontSize: 22 }}>‹</Text>
        </Enfocable>
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

const e = StyleSheet.create({
  cuentaCont: { padding: 16, paddingBottom: 40, gap: 14, alignItems: 'center' },
  cuentaCaja: { width: '100%', maxWidth: 460, gap: 14, padding: 20, borderRadius: 18, backgroundColor: '#14151d', borderWidth: 1, borderColor: '#262735' },
  cuentaLogo: { color: '#fff', fontSize: 19, fontWeight: '900' },
  pestanas: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 12, backgroundColor: '#0c0d13', borderWidth: 1, borderColor: '#22232f' },
  pestana: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 9 },
  pestanaActiva: { backgroundColor: '#262735' },
  etiqueta: { color: '#d4d6e0', fontSize: 13, fontWeight: '600' },
  ver: { position: 'absolute', right: 6, paddingHorizontal: 10, paddingVertical: 8 },
  barraFuerza: { flex: 1, height: 4, borderRadius: 2 },
  avisoCuenta: { padding: 12, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)' },
  dispositivo: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, backgroundColor: '#0c0d13', borderWidth: 1, borderColor: '#22232f' },
  esteDisp: { color: '#4fd18b', fontWeight: '700', fontSize: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(79,209,139,0.14)', overflow: 'hidden' },
  avatar: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: c.acento },
  cifra: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#0c0d13', borderWidth: 1, borderColor: '#22232f' },
  cifraNum: { color: '#fff', fontSize: 24, fontWeight: '800' },
  cifraTxt: { color: c.texto2, fontSize: 13 },
  seccionCuenta: { color: '#fff', fontWeight: '800', fontSize: 16, marginTop: 10, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#22232f' },
  botonCuenta: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: c.acento, maxWidth: 170 },
  botonCuentaConectado: { backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  botonCuentaTexto: { color: '#fff', fontWeight: '700', fontSize: 13 },
  atrasCuenta: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
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
