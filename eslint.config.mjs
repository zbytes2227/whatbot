import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

const config = [
  {
    ignores: ['.next/**', 'node_modules/**', 'dist/**', '.baileys_auth/**', 'whatsapp-sessions/**', 'logs/**'],
  },
  ...nextCoreWebVitals,
];

export default config;
