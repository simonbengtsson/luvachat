# Luvachat best practices

- Verify changes with bun run check (never bun run build)
- Don't normalize input unnecessarily such as ids with trim for example (only normalize user entered text)
- Avoid too many error checks. Prefer shorter code for and don't rethrow exceptions for exceptional cases (global error handling is enough for the rest)

<!-- intent-skills:start -->

# Skill mappings - when working in these areas, load the linked skill file into context.

skills:

- task: "adding or changing pages in src/routes, links, or navigation behavior"
  load: "/Users/simon/workspace/luvachat/node_modules/@tanstack/router-core/skills/router-core/navigation/SKILL.md"
- task: "working on typed URL search params like q, filters, or conversation/thread state"
  load: "/Users/simon/workspace/luvachat/node_modules/@tanstack/router-core/skills/router-core/search-params/SKILL.md"
- task: "creating or updating createServerFn calls and client/server data boundaries"
  load: "/Users/simon/workspace/luvachat/node_modules/@tanstack/start-client-core/skills/start-core/server-functions/SKILL.md"
- task: "building or changing API handlers under src/routes/api"
load: "/Users/simon/workspace/luvachat/node_modules/@tanstack/start-client-core/skills/start-core/server-routes/SKILL.md"
<!-- intent-skills:end -->
