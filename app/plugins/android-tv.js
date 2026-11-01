// Hace que la app aparezca en el menú de Android TV y se pueda instalar en teles sin pantalla táctil.
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = (config) =>
  withAndroidManifest(config, (cfg) => {
    const m = cfg.modResults.manifest;
    m['uses-feature'] = [
      ...(m['uses-feature'] ?? []).filter((f) => !['android.software.leanback', 'android.hardware.touchscreen'].includes(f.$['android:name'])),
      { $: { 'android:name': 'android.software.leanback', 'android:required': 'false' } },
      { $: { 'android:name': 'android.hardware.touchscreen', 'android:required': 'false' } },
    ];
    const app = m.application[0];
    app.$['android:banner'] = '@mipmap/ic_launcher';
    const main = app.activity.find((a) => a.$['android:name'] === '.MainActivity');
    const lanzador = main['intent-filter'].find((f) => f.action?.some((a) => a.$['android:name'] === 'android.intent.action.MAIN'));
    if (!lanzador.category.some((x) => x.$['android:name'] === 'android.intent.category.LEANBACK_LAUNCHER')) {
      lanzador.category.push({ $: { 'android:name': 'android.intent.category.LEANBACK_LAUNCHER' } });
    }
    return cfg;
  });
