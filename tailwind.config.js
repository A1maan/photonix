/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        carbon: "#081113",
        panel: "#101b1f",
        line: "#223136",
        signal: "#36f2c0",
        amber: "#ffb84d",
        danger: "#ff6b5f",
      },
      boxShadow: {
        glow: "0 0 32px rgba(54, 242, 192, 0.18)",
      },
    },
  },
  plugins: [],
};
