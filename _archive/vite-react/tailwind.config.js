/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#060e20',
        surface: '#091328',
        'surface-container': '#0f1930',
        'surface-container-low': '#0a1426',
        'surface-container-high': '#141f38',
        'surface-container-highest': '#192540',
        primary: '#81ecff',
        secondary: '#d8e3fb',
        tertiary: '#70aaff',
        error: '#ff716c',
        'on-background': '#dee5ff',
        'on-surface': '#c9d1e8',
        'on-surface-variant': '#9aa3be',
        'on-primary': '#005762',
        'outline-variant': '#40485d',
      },
      fontFamily: {
        headline: ['Space Grotesk', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        label: ['Manrope', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
