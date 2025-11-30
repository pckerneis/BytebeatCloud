export default {
  root: true,
  env: {
    browser: true,
    node: true,
    es2020: true,
  },
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: "module",
  },
  extends: [
    "eslint:recommended",
    "next/core-web-vitals"
  ],
  ignorePatterns: [
    "node_modules/",
    ".next/",
    "dist/"
  ],
};
