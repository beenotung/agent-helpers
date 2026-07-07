import { OpenAI } from 'openai'
import { env } from './env'
import {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions'

let client = new OpenAI({
  baseURL: env.PROVIDER_URL,
  apiKey: env.API_KEY,
})

export type CompleteResponse = ChatCompletion & {
  choices: Array<
    ChatCompletion['choices'][number] & {
      message: ChatCompletionMessageParam & {
        reasoning_content: string | null
      }
    }
  >
}

export async function complete(
  messages: ChatCompletionMessageParam[],
  tools?: ChatCompletionTool[],
): Promise<CompleteResponse> {
  const response = await client.chat.completions.create({
    model: env.MODEL_NAME,
    messages,
    tools,
    tool_choice: 'auto',
  })
  return response as CompleteResponse
}

export type StreamChunk = ChatCompletionChunk & {
  choices: Array<
    ChatCompletionChunk['choices'][number] & {
      delta: ChatCompletionChunk['choices'][number]['delta'] & {
        reasoning_content: string | null
      }
    }
  >
  cost?: number | string
  normalizedUsage?: {
    inputTokens: number
    outputTokens: number
    reasoningTokens: number
    cacheReadTokens: number
    cacheWrite5mTokens: number
    cacheWrite1hTokens: number
  }
}

export async function* stream(
  messages: ChatCompletionMessageParam[],
  tools?: ChatCompletionTool[],
): AsyncGenerator<StreamChunk> {
  const stream = await client.chat.completions.create({
    model: env.MODEL_NAME,
    messages,
    stream: true,
    tool_choice: 'auto',
    tools,
    parallel_tool_calls: true,
  })
  for await (const chunk of stream) {
    yield chunk as StreamChunk
  }
}
