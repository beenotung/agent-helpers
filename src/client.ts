import { OpenAI } from 'openai'
import { env } from './env'
import {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions'
import { AddFunctionArgs, ToolRegistry } from './tool'
import { Tool } from 'openai/resources/responses/responses.js'
import { ChatCompletionToolChoiceOption } from 'openai/resources'

export function createClient(args: {
  baseURL: string
  apiKey: string
  defaultModel: string
  tools?: ToolRegistry
}) {
  return new Client({
    client: new OpenAI({
      baseURL: args.baseURL,
      apiKey: args.apiKey,
    }),
    defaultModel: args.defaultModel,
    tools: args.tools,
  })
}

export class Client {
  client: OpenAI
  defaultModel: string
  tools: ToolRegistry

  constructor(args: {
    client: OpenAI
    defaultModel: string
    tools?: ToolRegistry
  }) {
    this.client = args.client
    this.defaultModel = args.defaultModel
    this.tools = args.tools ?? new ToolRegistry()
  }

  addFunction<T>(args: AddFunctionArgs<T>) {
    this.tools.addFunction(args)
  }

  async complete(args: {
    messages: ChatCompletionMessageParam[]
    model?: string
    tools?: ChatCompletionTool[]
    tool_choice?: ChatCompletionToolChoiceOption
    parallel_tool_calls?: boolean
  }): Promise<CompleteResponse> {
    const response = await this.client.chat.completions.create({
      model: args.model || this.defaultModel,
      messages: args.messages,
      tools: args.tools || this.tools.tools,
      tool_choice: args.tool_choice || 'auto',
      parallel_tool_calls: args.parallel_tool_calls ?? true,
    })
    return response as CompleteResponse
  }

  async *stream(args: {
    messages: ChatCompletionMessageParam[]
    model?: string
    tools?: ChatCompletionTool[]
    tool_choice?: ChatCompletionToolChoiceOption
    parallel_tool_calls?: boolean
  }): AsyncGenerator<StreamChunk> {
    const stream = await this.client.chat.completions.create({
      model: args.model || this.defaultModel,
      messages: args.messages,
      stream: true,
      tool_choice: args.tool_choice || 'auto',
      tools: args.tools || this.tools.tools,
      parallel_tool_calls: args.parallel_tool_calls ?? true,
    })
    for await (const chunk of stream) {
      yield chunk as StreamChunk
    }
  }
}

export type CompleteResponse = ChatCompletion & {
  choices: Array<
    ChatCompletion['choices'][number] & {
      message: ChatCompletionMessageParam & {
        reasoning_content: string | null
      }
    }
  >
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
