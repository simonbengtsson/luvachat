# Luvachat best practices

- Verify changes with bun run check (never bun run build)
- Don't normalize input unnecessarily such as ids with trim for example (only normalize user entered text)
- Avoid too many error checks. Prefer shorter code for and don't rethrow exceptions for exceptional cases (global error handling is enough for the rest)
