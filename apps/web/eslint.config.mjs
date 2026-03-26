import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    settings: {
      react: { version: "19.0" },
    },
  },
  {
    ignores: [".next/**", "out/**", "next-env.d.ts", "eslint.config.mjs"],
  },
];

export default config;
