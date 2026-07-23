// Dynamic Expo config.
//
// The static config lives in app.json; this wrapper injects the Mapbox
// build-time DOWNLOAD token (an `sk.` *secret*) from the environment so it
// never has to live in tracked source. Expo loads .env/.env.local into
// process.env when it evaluates this file, so `RNMAPBOX_MAPS_DOWNLOAD_TOKEN`
// resolves locally; in CI it comes from an EAS secret of the same name.
//
// See .env.example for the full list of required variables.

const base = require('./app.json').expo;

module.exports = () => {
  const downloadToken = process.env.RNMAPBOX_MAPS_DOWNLOAD_TOKEN;

  if (!downloadToken) {
    // A prebuild/native build without the token will fail to fetch the
    // Mapbox SDK — warn loudly rather than produce a broken binary.
    console.warn(
      '[app.config] RNMAPBOX_MAPS_DOWNLOAD_TOKEN is not set. ' +
        'Native Mapbox builds will fail. Set it in .env.local or an EAS secret.',
    );
  }

  return {
    ...base,
    plugins: (base.plugins ?? []).map((plugin) => {
      const name = Array.isArray(plugin) ? plugin[0] : plugin;
      if (name === '@rnmapbox/maps') {
        return ['@rnmapbox/maps', { RNMAPBOX_MAPS_DOWNLOAD_TOKEN: downloadToken }];
      }
      return plugin;
    }),
  };
};
