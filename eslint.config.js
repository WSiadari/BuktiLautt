// ESLint flat config: aturan rekomendasi JavaScript, TypeScript, dan React Hooks.
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    ignores: ["dist/", "coverage/", ".data/", "docs/redesign-evidence/", "node_modules/"],
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // Validasi input sengaja menolak karakter kontrol (\u0000-\u001f) pada teks dari pengguna dan AI.
      "no-control-regex": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
    },
  },
  {
    // Tes sengaja memalsukan masukan yang tidak valid untuk menguji validator.
    files: ["**/*.test.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat.recommended],
    rules: {
      // Aturan React Compiler. Temuan lama berupa setState di dalam efek dan ref yang dibaca saat
      // render. Memperbaikinya mengubah alur efek, jadi ditunda dan dicatat sebagai peringatan.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
    },
  },
);
