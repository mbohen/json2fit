/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./src/**/*.{html,ts}"],
  theme: {
    extend: {
      colors: {
        canvas: "#f7f7f2",
        ink: "#1f2933",
        pine: "#1f6f61",
        ocean: "#2563eb",
        ember: "#c2410c",
        line: "#d7ddd8"
      }
    }
  },
  plugins: []
};
