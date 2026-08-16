import { OpenAI } from 'openai'
import { env } from './env'
import {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParamsBase,
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

export type ChatCompletionCreateArgs = Omit<
  ChatCompletionCreateParamsBase,
  'stream' | 'model'
> & { model?: string }

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

  private createCompletionArgs(
    args: ChatCompletionCreateArgs,
  ): ChatCompletionCreateParamsBase {
    return {
      ...args,
      model: args.model || this.defaultModel,
      tools: args.tools || this.tools.tools,
      tool_choice: args.tool_choice || 'auto',
      parallel_tool_calls: args.parallel_tool_calls ?? true,
    }
  }

  /** @description wait until entire response is generated */
  async complete(args: ChatCompletionCreateArgs): Promise<CompleteResponse> {
    const response = await this.client.chat.completions.create(
      this.createCompletionArgs(args),
    )
    return response as CompleteResponse
  }

  /** @description stream the response as it is generated */
  async *completeStream(
    args: ChatCompletionCreateArgs,
  ): AsyncGenerator<StreamChunk> {
    const stream = await this.client.chat.completions.create({
      ...this.createCompletionArgs(args),
      stream: true,
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
