export default [
  {
    ignores: [".next/**", "node_modules/**", "dist/**", ".wwebjs_auth/**", "whatsapp-sessions/**"]
  },
  {
    files: ["**/*.js", "**/*.jsx", "**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      }
    }
  }
];
