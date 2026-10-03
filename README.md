# agent-helpers

Helpers for building tool-calling agents on top of the OpenAI chat completions API.

[![npm Package Version](https://img.shields.io/npm/v/agent-helpers)](https://www.npmjs.com/package/agent-helpers)

## Features

- Tool-call loop: `completeWithTools()` and `streamWithTools()` automatically run tools until the model stops requesting them
- Fine-grained streaming callbacks: reasoning, content, refusal and tool-call parts, including per-tool-call name/argument deltas
- Reasoning field compatibility: captures multiple variants of the field name (`reasoning_content`, `reasoning`)
- Guard hook (`guardToolCall`) to allow or reject each tool call
- TypeScript typings included out of the box

## Installation

You can install this package using npm/pnpm/yarn/slnpm:

```bash
npm install agent-helpers
```

## Usage Example

```typescript
import { createClient, alwaysAllow } from 'agent-helpers'

let client = createClient({
  base_url: 'https://ollama.com/v1',
  api_key: process.env.API_KEY!,
  default_model: 'deepseek-v4.1-flash',
})

client.addFunction({
  name: 'get_date',
  description: 'Get the current date, without the time part',
  parameters: {
    type: 'object',
    properties: {
      reasoning: {
        type: 'string',
        description: 'The reasoning for getting the date',
      },
    },
  },
  callback: async () => new Date().toDateString(),
})

let result = await client.completeWithTools({
  messages: [{ role: 'user', content: 'What is the date today?' }],
  guardToolCall: alwaysAllow,
})
```

## Typescript Signature

```typescript
export function createClient(args: {
  base_url: string
  api_key: string
  default_model: string
  tools?: ToolRegistry
}): Client

export type CompleteArgs = Omit<
  ChatCompletionCreateParamsBase,
  'stream' | 'model'
> & { model?: string }

export type CompleteWithToolsArgs = CompleteArgs &
  ToolCallGuard & {
    callbacks?: CompletionLoopEventListeners
  }

export type StreamWithToolsArgs = CompleteArgs &
  ToolCallGuard & { callbacks?: CompleteStreamLoopEventListeners }

export type ToolCallGuard = {
  guardToolCall: (
    args: ReceivedCompletionLoopContext & { tool_call: ToolCall },
  ) => Result<true | RejectReason>
}

export class Client {
  client: OpenAI
  default_model: string
  tools: ToolRegistry

  addFunction<T>(args: AddFunctionArgs<T>): void

  /** wait until entire response is generated */
  complete(args: CompleteArgs): Promise<CompletionResponse>

  /** create a stream of response chunks as it is generated */
  stream(args: CompleteArgs): Promise<Stream<StreamChunk>>

  /** loop until all tool calls are completed (non-streaming) */
  completeWithTools(
    args: CompleteWithToolsArgs,
  ): Promise<CompleteWithToolsResult>

  /** loop until all tool calls are completed (streaming) */
  streamWithTools(args: StreamWithToolsArgs): Promise<CompleteWithToolsResult>
}
```

Helper functions:

```typescript
export function getReasoning(message: {
  /** some providers name it `reasoning_content`, some `reasoning` */
  reasoning_content?: string | null
  reasoning?: string | null
}): string | null

export function alwaysAllow(): true

export function alwaysReject(): string

export function noop(): void
```

## Reasoning field names (advanced)

Thinking models return a reasoning trace (also called chain-of-thought) alongside the answer. **There is no standard field name for it**, so this package does not assume one.

See [`docs/reasoning-recall.md`](./docs/reasoning-recall.md) for the per-model table, the method to test a provider, and the reliability statistics.

| provider              | field name used     |
| --------------------- | ------------------- |
| LM Studio (llama.cpp) | `reasoning_content` |
| opencode zen          | `reasoning_content` |
| DeepSeek              | `reasoning_content` |
| Ollama Cloud          | `reasoning`         |
| Poe (aggregator)      | both, identical     |

`reasoning_text` is OpenAI **Responses-API-only** and never appears over chat completions.

- **Reading** is adaptive: `getReasoning()` returns whichever of the known field names is present (`reasoning_content` / `reasoning`), so your callbacks fire without configuration.
- **Replaying** is best-effort: whether a model reads a replayed reasoning field back is per-model and unreliable, and it reads only the field name it wrote itself. Do not depend on it.
- **Authoring** a reasoning field by hand: if you are building an assistant message yourself and do not know which field name the target provider reads, see the doc above.

## License

This project is licensed with [BSD-2-Clause](./LICENSE)

This is free, libre, and open-source software. It comes down to four essential freedoms [[ref]](https://seirdy.one/2021/01/27/whatsapp-and-the-domestication-of-users.html#fnref:2):

- The freedom to run the program as you wish, for any purpose
- The freedom to study how the program works, and change it so it does your computing as you wish
- The freedom to redistribute copies so you can help others
- The freedom to distribute copies of your modified versions to others
