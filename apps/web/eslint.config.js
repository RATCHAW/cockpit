import react from "@cockpit/eslint-config/react"

export default [
  ...react,
  {
    // Route files export `Route`; the router plugin code-splits components for fast refresh.
    files: ["src/routes/**/*.tsx", "src/hooks/**/*.tsx"],
    rules: { "react-refresh/only-export-components": "off" },
  },
]
