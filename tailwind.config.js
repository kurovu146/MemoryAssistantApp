/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: '#6366f1',
        surface: '#1e1e2e',
        'surface-light': '#313244',
        'surface-lighter': '#45475a',
        'text-primary': '#cdd6f4',
        'text-secondary': '#a6adc8',
        'text-muted': '#6c7086',
        accent: '#89b4fa',
        success: '#a6e3a1',
        warning: '#f9e2af',
        danger: '#f38ba8',
      },
    },
  },
  plugins: [],
};
