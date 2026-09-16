// babel-preset-expo covers Expo Router, React Native, and react-native-web.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
