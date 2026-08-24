import { OpenAI } from 'openai'
import {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParamsBase,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions'
import { AddFunctionArgs, ToolCall, ToolCallResult, ToolRegistry } from './tool'
import { ChatCompletionToolMessageParam } from 'openai/resources'
import { ChatCompletionMessage } from 'openai/resources'

export function createClient(args: {
  base_url: string
  api_key: string
  default_model: string
  tools?: ToolRegistry
}) {
  return new Client({
    client: new OpenAI({
      baseURL: args.base_url,
      apiKey: args.api_key,
    }),
    default_model: args.default_model,
    tools: args.tools,
  })
}

export type CompleteArgs = Omit<
  ChatCompletionCreateParamsBase,
  'stream' | 'model'
> & { model?: string }

export type CompleteWithToolsArgs = CompleteArgs &
  ToolCallGuard &
  CompletionLoopEventListeners

export type ToolCallGuard = {
  guardToolCall: (
    args: CompletionLoopContext & { tool_call: ToolCall },
  ) => Result<true | RejectReason>
}

export type RejectReason = string

export type Result<T> = T | Promise<T>

export type CompletionLoopEventListeners = {
  onResponse?: (
    args: CompletionLoopContext<ChatCompletionMessage | undefined>,
  ) => EventListenerResult
  onMessage?: (args: CompletionLoopContext) => EventListenerResult
  onToolCallResult?: (
    args: CompletionLoopContext & {
      tool_call: ToolCall
      tool_call_result: ChatCompletionToolMessageParam
    },
  ) => EventListenerResult
}

export type EventListenerResult = void | Promise<void>

export type CompletionLoopContext<MessageType = ChatCompletionMessage> = {
  create_args: CompleteArgs
  /** accumulated responses in the loop */
  responses: CompletionResponse[]
  /** currently received response */
  response: CompletionResponse
  /** accumulated new messages in the loop (from model response and tool call result) */
  new_messages: ChatMessage[]
  /** currently received message (from model response) */
  new_message: MessageType
}

export type ChatMessage =
  /** received from the model */
  | CompletionMessage
  /** send to the model */
  | ToolCallResult

export function alwaysAllow() {
  return true
}

export type CompleteWithToolsResult = {
  responses: CompletionResponse[]
  messages: CompletionMessage[]
  last_response: CompletionResponse
  last_message: CompletionMessage
  finish_reason: ChatCompletion['choices'][number]['finish_reason']
}

export class Client {
  client: OpenAI
  default_model: string
  tools: ToolRegistry

  constructor(args: {
    client: OpenAI
    default_model: string
    tools?: ToolRegistry
  }) {
    this.client = args.client
    this.default_model = args.default_model
    this.tools = args.tools ?? new ToolRegistry()
  }

  addFunction<T>(args: AddFunctionArgs<T>) {
    this.tools.addFunction(args)
  }

  private createCompletionArgs(
    args: CompleteArgs,
  ): ChatCompletionCreateParamsBase {
    return {
      ...args,
      model: args.model || this.default_model,
      tools: args.tools || this.tools.tools,
      tool_choice: args.tool_choice || 'auto',
      parallel_tool_calls: args.parallel_tool_calls ?? true,
    } satisfies ChatCompletionCreateParamsBase
  }

  /** @description wait until entire response is generated */
  async complete(args: CompleteArgs): Promise<CompletionResponse> {
    const response = await this.client.chat.completions.create(
      this.createCompletionArgs(args),
    )
    return response as CompletionResponse
  }

  /** @description create a stream of response chunks as it is generated */
  async stream(args: CompleteArgs): Promise<Stream<StreamChunk>> {
    let params: ChatCompletionCreateParamsBase = this.createCompletionArgs(args)
    params.stream = true
    const stream = await this.client.chat.completions.create(params)
    return stream as Stream<StreamChunk>
  }

  /**
   * @description guard and call the tool, also push the result to `context.newMessages`.
   * - never throw error, return error message instead.
   */
  private async callTool(
    args: CompletionLoopContext & {
      tool_call: ToolCall
    } & ToolCallGuard,
  ): Promise<ChatCompletionToolMessageParam> {
    let { guardToolCall, ...rest } = args
    let guardResult = await guardToolCall(rest)
    let result: ChatCompletionToolMessageParam
    if (guardResult === true) {
      result = await this.tools.callTool(args.tool_call)
    } else {
      result = {
        role: 'tool',
        tool_call_id: args.tool_call.id,
        content: 'Error: tool call not allowed. Reason: ' + guardResult,
      }
    }
    args.new_messages.push(result)
    return result
  }

  /**
   * @description loop until all tool calls are completed.
   *
   * Remark: only handling the first choice of the response message at the moment.
   */
  async completeWithTools(
    create_args: CompleteWithToolsArgs,
  ): Promise<CompleteWithToolsResult> {
    let { guardToolCall, onResponse, onMessage, onToolCallResult } = create_args

    let new_responses: CompletionResponse[] = []
    let new_messages: CompletionMessage[] = []

    for (;;) {
      let new_response = await this.complete({
        ...create_args,
        messages: [...create_args.messages, ...new_messages],
      })
      new_responses.push(new_response)

      let choice = new_response.choices[0]
      if (!choice) {
        throw new Error('no choice in the response')
      }

      let new_message = choice.message
      new_messages.push(new_message)

      let context: CompletionLoopContext = {
        create_args,
        responses: new_responses,
        response: new_response,
        new_messages: new_messages,
        new_message: new_message,
      }

      if (onResponse) {
        await onResponse(context)
      }

      switch (choice.finish_reason) {
        case 'length':
          throw new Error('response too long')
        case 'content_filter':
          throw new Error('response blocked/filtered by provider')
        case 'stop':
        case 'tool_calls':
        case 'function_call':
          break
        default: {
          let reason = choice.finish_reason satisfies never
          throw new Error(`unknown finish reason: ${reason}`)
        }
      }

      if (onMessage) {
        await onMessage(context)
      }

      if (!new_message.tool_calls?.length) {
        break
      }

      for (let index = 0; index < new_message.tool_calls.length; index++) {
        let toolCall = Object.assign(new_message.tool_calls[index], { index })
        let toolCallResult = await this.callTool({
          ...context,
          tool_call: toolCall,
          guardToolCall,
        })
        if (onToolCallResult) {
          await onToolCallResult({
            ...context,
            tool_call: toolCall,
            tool_call_result: toolCallResult,
          })
        }
      }
    }

    let last_response = new_responses[new_responses.length - 1]
    let last_message = last_response.choices[0]?.message
    let finish_reason = last_response.choices[0]?.finish_reason

    return {
      responses: new_responses,
      messages: new_messages,
      finish_reason,
      last_response,
      last_message,
    }
  }
}

export type CompletionResponse = ChatCompletion & {
  choices: Array<
    ChatCompletion['choices'][number] & {
      message: ChatCompletionMessageParam & {
        reasoning_content: string | null
      }
    }
  >
}

export type CompletionChoice = CompletionResponse['choices'][number]

export type CompletionMessage = CompletionChoice['message']

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
