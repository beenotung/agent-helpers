# cast.ts parser for tool calls

A function can now be registered with a [cast.ts](https://github.com/beenotung/cast.ts)
parser instead of a hand-written JSON schema. The tool definition is derived
from the parser, and the arguments are validated and converted before the
callback runs.

## Cause

The tool call arguments arrived as a raw JSON string and were passed to the
callback unchanged:

```ts
return await func.callback(tool.function.arguments)
```

So every function had to parse and validate its own arguments, and the model
could send anything: a missing field, a string where a number was expected, or
not even valid JSON. The error only surfaced inside the callback, by which
point the model had already been told the call succeeded.

The JSON schema was also written by hand, twice: once in `parameters` and once
in the callback's own validation. The two could drift apart.

## Fix

### Registering

`addFunction()` has two overloads:

```ts
// with a parser: the JSON schema is derived from it
client.addFunction({
  name: 'get_user',
  description: 'Get a user by id',
  parser: object({ user_id: int(), reason: optional(string()) }),
  callback: async (args) => getUser(args.user_id), // args is typed
})

// without a parser: unchanged, the callback receives the raw JSON string
client.addFunction({
  name: 'get_date',
  description: 'Get the current date',
  parameters: { type: 'object', properties: {} },
  callback: async (args) => new Date().toDateString(),
})
```

The schema comes from `getParserJsonSchema(parser)`. A custom parser without a
`jsonSchema` falls back to `{ type: 'object' }` with a warning, so registering
such a parser does not throw.

### The order of a tool call

```text
raw JSON string -> JSON.parse -> parser.parse -> guardToolCall -> callback
```

A parse failure short-circuits: neither the guard nor the callback runs, and
the validation error becomes the tool result, so the model can correct itself:

```text
Error: invalid tool call arguments. Invalid object, missing "user_id"
```

The guard now sees the parsed value as `arguments`, so it can inspect typed
fields instead of a JSON string. The property is optional, so an existing
guard keeps working unchanged.

## Notes

- The two APIs are separate on purpose. A function registered without a parser
  keeps receiving the raw JSON string, so existing code does not change
  behaviour. The `arguments` property is only set for parser-based functions.
- `cast.ts` is a runtime dependency, not a peer dependency: the parser is what
  produces the schema and validates the arguments, so it cannot be optional.
- `cast.ts` and this package are by the same author, so the dependency is
  unpinned to a major version (`^1.21.0`).
- `optional()` in cast.ts mutates the parser instance it wraps. Do not share
  one parser instance between two fields.
- `int()` produces `{ type: 'integer' }` in the JSON schema, not
  `{ type: 'number' }`. Some providers are picky about this.
- The error message of a parse failure is produced by cast.ts, e.g.
  `Invalid object, missing "user_id"`. A nested field carries its path, e.g.
  `Invalid string "user.name"`.

## Also fixed

The `build` script removed the compiled test files with a rimraf glob, but
rimraf v6 treats its arguments as literal paths unless `-g` is given. The
cleanup step threw `Illegal characters in path`, and the build failed after
`tsc` had already succeeded. This was pre-existing, and reproducible on a
clean checkout.

The build script now uses `rimraf -g "dist/*.spec.js" ...`, and the spec file
is excluded from the published package.
