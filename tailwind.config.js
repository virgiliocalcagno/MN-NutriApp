/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
        "./components/**/*.{js,ts,jsx,tsx}",
        "./views/**/*.{js,ts,jsx,tsx}",
        "./App.tsx",
    ],
    theme: {
        extend: {
            colors: {
                "primary": "#1e60f1",
                "background-light": "#f5f6f8",
                "background-dark": "#101622",
            },
            fontFamily: {
                "display": ["Manrope", "sans-serif"]
            }
        },
    },
    plugins: [],
}
