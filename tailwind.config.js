/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Warm "Clay & Cream" palette — deliberately not blue/navy.
        cream: {
          DEFAULT: "#faf7f2",
          100: "#f4efe6",
          200: "#ebe3d6",
          300: "#ded3c1",
        },
        ink: {
          DEFAULT: "#17150f",
          soft: "#36312a",
          muted: "#595247",
          faint: "#857d70",
        },
        clay: {
          DEFAULT: "#d97757",
          600: "#c45f3d",
          700: "#a84e30",
          100: "#f6e4da",
          50: "#fbf1ea",
        },
        sage: "#5c6f5a",
      },
      fontFamily: {
        display: ['"Fraunces"', "Georgia", "serif"],
        body: ['"Inter"', "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl2: "18px",
        "3xl": "26px",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(28,26,23,0.04), 0 10px 30px -14px rgba(28,26,23,0.14)",
        lift: "0 2px 6px rgba(28,26,23,0.05), 0 24px 50px -20px rgba(28,26,23,0.22)",
        clay: "0 10px 30px -10px rgba(217,119,87,0.45)",
      },
      backgroundImage: {
        "clay-gradient": "linear-gradient(135deg, #e68a67 0%, #d97757 55%, #c45f3d 120%)",
        "cream-canvas":
          "radial-gradient(900px 600px at 88% -8%, rgba(217,119,87,0.10), transparent 60%), radial-gradient(800px 600px at -6% 108%, rgba(92,111,90,0.08), transparent 60%), linear-gradient(180deg, #faf7f2 0%, #f6f1e8 100%)",
      },
      keyframes: {
        rise: { from: { opacity: "0", transform: "translateY(14px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        fade: { from: { opacity: "0" }, to: { opacity: "1" } },
      },
      animation: {
        rise: "rise 0.5s cubic-bezier(0.22,1,0.36,1) both",
        fade: "fade 0.4s ease-out both",
      },
    },
  },
  plugins: [],
};
