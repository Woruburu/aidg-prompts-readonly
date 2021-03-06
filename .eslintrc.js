module.exports = {
  env: {
    browser: true,
    es2021: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:solid/recommended",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  plugins: ["@typescript-eslint", "solid"],
  rules: {},
  overrides: [
    {
      files: ["*"],
      rules: {
        "@typescript-eslint/no-empty-function": "off",
        "no-mixed-spaces-and-tabs": "off",
      },
    },
  ],
};
