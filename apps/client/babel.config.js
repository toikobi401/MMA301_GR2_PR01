// babel-preset-expo covers Expo Router, React Native, and react-native-web.
// jsxImportSource routes JSX through NativeWind so className works on native.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
  };
};
