import animate from "tailwindcss-animate";

// StaffTO design tokens (ink / paper / signal red / lake / brass; Instrument Serif + Geist),
// merged with the template's shadcn variables so the template's own components keep working.
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        ink: { DEFAULT: "#111417", 2: "#1C2126", 3: "#2A3138" },
        paper: { DEFAULT: "#FBFAF7", 2: "#F3F1EB", 3: "#ECE8DF" },
        line: { DEFAULT: "#E3DED3", dark: "#2E353C" },
        muted: { DEFAULT: "#646A71", dark: "#9AA1A8", foreground: "hsl(var(--muted-foreground))" },
        signal: { DEFAULT: "#D2341E", 600: "#B52B17", 50: "#FBEDEA" },
        lake: { DEFAULT: "#123A40", 600: "#0D2C31", 50: "#E7F0F0" },
        brass: { DEFAULT: "#C7962F", 50: "#F7F0DE" },
        ok: "#1F7A4D",
      },
      fontFamily: {
        display: ['"Instrument Serif"', "Georgia", "serif"],
        sans: ["Geist", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"Geist Mono"', "ui-monospace", "monospace"],
      },
      fontSize: { "2xs": ["0.6875rem", { lineHeight: "1rem" }] },
      borderRadius: { DEFAULT: "3px", sm: "2px", md: "4px", lg: "6px" },
      maxWidth: { page: "1240px" },
      keyframes: {
        rise: { "0%": { opacity: 0, transform: "translateY(8px)" }, "100%": { opacity: 1, transform: "none" } },
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
      },
      animation: { rise: "rise .5s cubic-bezier(.2,.7,.2,1) both", "accordion-down": "accordion-down 0.2s ease-out", "accordion-up": "accordion-up 0.2s ease-out" },
    },
  },
  plugins: [animate],
};
