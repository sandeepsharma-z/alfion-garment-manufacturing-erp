/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'Segoe UI', 'system-ui', 'sans-serif'],
        slab: ['"Roboto Slab"', 'Rockwell', 'Georgia', 'serif'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        /* brand extras (from approved demo) */
        ink: '#111827',
        brand: { DEFAULT: '#a05aff', light: '#bd8dff', soft: '#f1e8ff' },
        violet: '#9e58ff',
        pink: { DEFAULT: '#fe9496', soft: '#ffe9e9' },
        teal: { DEFAULT: '#14b39b', soft: '#dff8f3', vivid: '#1bcfb4' },
        gold: { DEFAULT: '#d97706', soft: '#fff3e2', vivid: '#f5a33c' },
        info: { DEFAULT: '#22b1d6', soft: '#e3f6fc', vivid: '#4bcbeb' },
        bad: { DEFAULT: '#ef6b6e', soft: '#ffe9e9', vivid: '#fe9496' },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 4px)',
        sm: 'calc(var(--radius) - 8px)',
      },
      boxShadow: {
        card: '0 1px 2px rgba(17,24,39,.04), 0 6px 20px -12px rgba(17,24,39,.10)',
        pop: '0 24px 60px -20px rgba(17,24,39,.25)',
      },
      keyframes: {
        rise: { from: { opacity: '0', transform: 'translateY(10px)' } },
      },
      animation: { rise: 'rise .4s cubic-bezier(.2,.8,.2,1) both' },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
