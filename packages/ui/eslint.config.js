import react from "@cockpit/eslint-config/react"

export default [
  ...react,
  {
    // shadcn components export variants alongside components
    rules: { "react-refresh/only-export-components": "off" },
  },
]
