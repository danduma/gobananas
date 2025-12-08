/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./{index,App}.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./services/**/*.{js,ts,jsx,tsx}",
    "./types.ts",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}

