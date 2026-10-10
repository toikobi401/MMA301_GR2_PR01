/** @type {import('tailwindcss').Config} */
// NativeWind v4 requires Tailwind 3. Do not upgrade to Tailwind 4.
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {},
  },
  plugins: [],
};
