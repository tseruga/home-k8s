/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        nb: { yellow: '#ffde59', pink: '#ff5c8a', cyan: '#a0e7ff', green: '#b6ff9e', cream: '#f5f0e8' }
      },
      boxShadow: { nb: '4px 4px 0 0 #000', 'nb-sm': '2px 2px 0 0 #000', 'nb-lg': '6px 6px 0 0 #000' }
    }
  },
  plugins: []
};
