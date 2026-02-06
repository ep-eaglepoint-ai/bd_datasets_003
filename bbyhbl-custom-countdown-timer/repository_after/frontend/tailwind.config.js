/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'theme-minimal': {
          primary: '#1a1a1a',
          secondary: '#666666',
          accent: '#3b82f6',
        },
        'theme-celebration': {
          primary: '#ff6b6b',
          secondary: '#4ecdc4',
          accent: '#ffe66d',
        },
        'theme-elegant': {
          primary: '#2c3e50',
          secondary: '#95a5a6',
          accent: '#9b59b6',
        },
        'theme-neon': {
          primary: '#00ff00',
          secondary: '#ff00ff',
          accent: '#00ffff',
        },
      },
      animation: {
        'flip': 'flip 0.5s ease-in-out',
        'pulse-glow': 'pulse-glow 2s infinite',
        'float': 'float 3s ease-in-out infinite',
      },
      keyframes: {
        flip: {
          '0%': { transform: 'rotateX(0deg)' },
          '50%': { transform: 'rotateX(90deg)' },
          '100%': { transform: 'rotateX(0deg)' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.7 },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
    },
  },
  plugins: [],
}