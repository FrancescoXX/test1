/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}', // If using pages directory
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}', // ** Crucial for App Router **
  ],
  theme: {
    extend: {
      // Your theme extensions
    },
  },
  plugins: [],
}