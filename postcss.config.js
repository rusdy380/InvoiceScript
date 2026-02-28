module.exports = {
  plugins: {
    tailwindcss: {},
    '@csstools/postcss-oklab-function': {
      preserve: false,
      subFeatures: { displayP3: false },
    },
    autoprefixer: {},
  },
};
