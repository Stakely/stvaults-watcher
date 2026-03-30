import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    ignores: [
      "node_modules/**",
      "grafana/dashboard.json",
      ".github/**",
      ".cursor/**",
      "package-lock.json",
      "Dockerfile",
      "example.docker-compose.yaml",
    ],
  },
  {
    files: ["**/*.{js,ts}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parser: tsParser,
      globals: {
        fetch: "readonly",
        process: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "no-console": "off",
      semi: ["error", "always"],
      eqeqeq: ["error", "always"],
      // Permite `if (x) return y;` sin llaves (lo que ya usa el código actual).
      curly: ["error", "multi-line"],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { args: "none", ignoreRestSiblings: true, varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];

