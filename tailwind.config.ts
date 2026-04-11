import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        cream: {
          DEFAULT: '#FAF7F0',
          dark: '#EDE8DC',
        },
        navy: {
          DEFAULT: '#1B2B4B',
          light: '#263D6B',
          dark: '#111B30',
        },
        wheat: {
          DEFAULT: '#C8A96E',
          light: '#D4BA8A',
          dark: '#A8894E',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
