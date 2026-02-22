/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        puyo: {
          red: '#FF6B6B',
          green: '#51CF66',
          blue: '#5C7CFA',
          yellow: '#FFD43B',
          pink: '#FF6B9D',
          bg: '#F0E6FF',
          dark: '#1A1035',
          'dark-light': '#2D1B69',
        }
      },
      fontFamily: {
        puyo: ['"M PLUS Rounded 1c"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
