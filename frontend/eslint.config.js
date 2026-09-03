// ESLint 9 flat config, replacing .eslintrc.cjs.
//
// Flat config resolves plugins as real imports rather than by string name, so
// the shareable configs are spread in directly and there is no "extends".
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default tseslint.config(
  { ignores: ["dist", "src/types/database.ts"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
  {
    // Tests and Node-side scripts run outside the browser.
    files: ["**/*.test.{ts,tsx}", "scripts/**/*.{js,mjs}"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
);
