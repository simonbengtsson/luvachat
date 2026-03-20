---
name: react-best-practices
description: Use when writing or reviewing React code in react codebases.
---

# React Best Practices

Apply when authoring or reviewing React components in React 19 + React Compiler codebases.

## Rules

1. **Imports** — Prefer named imports from `react`. Avoid `import React from "react"` unless required by a legacy pattern.

2. **Memoization** — Skip `useMemo` and `useCallback` by default. Add them only when measurement or an API contract requires stable identity.

3. **Refs** — Accept `ref` as a normal prop; do not wrap in `forwardRef` for simple pass-throughs.

4. **Derived values & handlers** — Keep derived values and handlers inline when they are cheap. Avoid premature optimization.

## Review checklist

- [ ] Flag default React imports
- [ ] Flag new `useMemo`/`useCallback` without justification
- [ ] Flag unnecessary `forwardRef` wrappers
- [ ] Prefer small, simpler components over extra abstractions
