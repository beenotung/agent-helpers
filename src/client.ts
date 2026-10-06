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
import { Stream } from 'openai/streaming'
import { ChatCompletionUserMessageParam } from 'openai/resources'

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
  ToolCallGuard & {
    callbacks?: CompletionLoopEventListeners
  }

export type StreamWithToolsArgs = CompleteArgs &
  ToolCallGuard & { callbacks?: CompleteStreamLoopEventListeners }

/**
 * Decide whether a tool call may run.
 *
 * - return `true` to allow the call
 * - return a reason string to reject it: the reason becomes the tool result, so
 *   the model sees it and can try another tool or stop
 * - throwing means an unrecoverable error (e.g. a database connection failure):
 *   the run stops and the error is not caught, it propagates to the caller
 *   (so it is never passed to the model)
 *
 * Note: `tool_call.function.arguments` is a raw JSON string, not a parsed object.
 */
export type ToolCallGuard = {
  guardToolCall: (
    args: ReceivedCompletionLoopContext & { tool_call: ToolCall },
  ) => Result<true | RejectReason>
}

export type RejectReason = string

export type Result<T> = T | Promise<T>

export type CompletionLoopEventListeners = {
  onResponse?: (
    args: ReceivedCompletionLoopContext<ChatCompletionMessage | undefined>,
  ) => EventListenerResult
  onMessage?: (args: ReceivedCompletionLoopContext) => EventListenerResult
  onToolCallResult?: (
    args: ReceivedCompletionLoopContext & {
      tool_call: ToolCall
      tool_call_result: ChatCompletionToolMessageParam
    },
  ) => EventListenerResult
}

/**
 * Remark: delta event is fired before the *_acc value being updated.
 *
 * List of events (in chronological order):
 *
 * - Stream Start
 *   - Chunk (in Stream)
 *     - Delta (in Chunk's first choice)
 *     - Role
 *     - Part Start
 *       - Part Delta
 *       - Reasoning Content Start
 *         - Reasoning Content Delta
 *       - Reasoning Content End
 *       - Content Start
 *         - Content Delta
 *       - Content End
 *       - Refusal Start
 *         - Refusal Delta
 *       - Refusal End
 *       - Tool Call Start
 *         - Tool Call Delta
 *         - Tool Call Name Start
 *           - Tool Call Name Delta
 *         - Tool Call Name End
 *         - Tool Call Arguments Start
 *           - Tool Call Arguments Delta
 *         - Tool Call Arguments End
 *       - Tool Call End
 *     - Part End
 *   - Finish (in Chunk)
 * - Stream End
 */
export type CompleteStreamLoopEventListeners = CompletionLoopEventListeners & {
  // Stream Callbacks
  onStreamStart?: (args: StreamCompletionLoopContext) => EventListenerResult
  onChunk?: (args: CompletionStreamChunkContext) => EventListenerResult
  onStreamEnd?: (
    args: StreamCompletionLoopContext & { response: StreamResponse },
  ) => EventListenerResult

  // Chunk's first Choice Callbacks
  onChunkDelta?: (
    args: CompletionStreamChunkContext & {
      delta: ChatCompletionChunk['choices'][number]['delta']
    },
  ) => EventListenerResult
  onPartStart?: (
    args: CompletionStreamChunkContext & { part: CompletionStreamPart },
  ) => EventListenerResult
  /** when the part of response is changed, e.g. reasoning, content, tool calls, etc. */
  onPartEnd?: (
    args: CompletionStreamChunkContext & { part: CompletionStreamPart },
  ) => EventListenerResult
  /** for each chunk's first choice's finish reason */
  onFinish?: (
    args: CompletionStreamChunkContext & {
      finish_reason: ChatCompletion['choices'][number]['finish_reason']
    },
  ) => EventListenerResult

  // Role Callbacks
  onRole?: (
    args: CompletionStreamChunkContext & {
      role: Required<Delta>['role']
    },
  ) => EventListenerResult

  // Reasoning Content Callbacks
  onReasoningContentStart?: (
    args: CompletionStreamChunkContext,
  ) => EventListenerResult
  onReasoningContentDelta?: (
    args: CompletionStreamChunkContext & {
      reasoning_content_acc: string
      reasoning_content_delta: string
    },
  ) => EventListenerResult
  onReasoningContentEnd?: (
    args: CompletionStreamChunkContext & {
      reasoning_content: string
    },
  ) => EventListenerResult

  // Content Callbacks
  onContentStart?: (args: CompletionStreamChunkContext) => EventListenerResult
  onContentDelta?: (
    args: CompletionStreamChunkContext & {
      content_acc: string
      content_delta: string
    },
  ) => EventListenerResult
  onContentEnd?: (
    args: CompletionStreamChunkContext & {
      content: string
    },
  ) => EventListenerResult

  // Refusal Callbacks
  onRefusalStart?: (args: CompletionStreamChunkContext) => EventListenerResult
  onRefusalDelta?: (
    args: CompletionStreamChunkContext & {
      refusal_acc: string
      refusal_delta: string
    },
  ) => EventListenerResult
  onRefusalEnd?: (
    args: CompletionStreamChunkContext & {
      refusal: string
    },
  ) => EventListenerResult

  // Tool Calls Callbacks
  onToolCallsStart?: (args: CompletionStreamChunkContext) => EventListenerResult
  onToolCallsDelta?: (
    args: CompletionStreamChunkContext & {
      tool_calls_acc: (ToolCall & { type: 'function' })[]
      tool_calls_delta: ChatCompletionChunk['choices'][number]['delta']['tool_calls']
    },
  ) => EventListenerResult
  onToolCallsEnd?: (
    args: CompletionStreamChunkContext & {
      tool_calls: (ToolCall & { type: 'function' })[]
    },
  ) => EventListenerResult

  // Each Tool Call Callbacks
  onToolCallStart?: (
    args: CompletionStreamChunkContext & {
      tool_call: ToolCall
    },
  ) => EventListenerResult
  onToolCallDelta?: (
    args: CompletionStreamChunkContext & {
      tool_call_acc: ToolCall
      tool_call_delta: ChatCompletionChunk.Choice.Delta.ToolCall
    },
  ) => EventListenerResult
  onToolCallEnd?: (
    args: CompletionStreamChunkContext & {
      tool_call: ToolCall
    },
  ) => EventListenerResult

  // Tool Call Name Callbacks
  onToolCallNameStart?: (
    args: CompletionStreamChunkContext & {
      tool_call: ToolCall
    },
  ) => EventListenerResult
  onToolCallNameDelta?: (
    args: CompletionStreamChunkContext & {
      tool_call: ToolCall
      function_name_acc: string
      function_name_delta: string
    },
  ) => EventListenerResult
  onToolCallNameEnd?: (
    args: CompletionStreamChunkContext & {
      tool_call: ToolCall
      function_name: string
    },
  ) => EventListenerResult

  // Tool Call Arguments Callbacks
  onToolCallArgumentsStart?: (
    args: CompletionStreamChunkContext & {
      tool_call: ToolCall
    },
  ) => EventListenerResult
  onToolCallArgumentsDelta?: (
    args: CompletionStreamChunkContext & {
      tool_call: ToolCall
      function_arguments_acc: string
      function_arguments_delta: string
    },
  ) => EventListenerResult
  onToolCallArgumentsEnd?: (
    args: CompletionStreamChunkContext & {
      tool_call: ToolCall
      function_arguments: string
    },
  ) => EventListenerResult

  // Ending Callbacks
}

export type EventListenerResult = void | Promise<void>

// export type CompletionLoopContext <MessageType = ChatCompletionMessage> = {}

export type CreateCompletionLoopContext = {
  create_args: CompleteArgs
  /** accumulated responses in the loop */
  new_responses: CompletionResponse[]
  /** accumulated new messages in the loop (from model response and tool call result) */
  new_messages: ChatMessage[]
}

export type ReceivedCompletionLoopContext<MessageType = ChatCompletionMessage> =
  CreateCompletionLoopContext & {
    /** currently received response */
    response: CompletionResponse
    /** currently received message (from model response) */
    new_message: MessageType
  }

/** same as CreateCompletionLoopContext */
export type StreamCompletionLoopContext = CreateCompletionLoopContext

export type CompletionStreamChunkContext = StreamCompletionLoopContext & {
  /** accumulated response */
  response: StreamResponse
  /** currently received chunk from response stream */
  chunk_index: number
  chunk: StreamChunk
}

export type CompletionStreamPart =
  | 'reasoning'
  | 'content'
  | 'tool_calls'
  | 'refusal'

type CompletionStreamToolCallPart = 'name' | 'arguments' | 'idle'

export type ChatMessage =
  /** received from the model */
  | CompletionMessage
  /** send to the model */
  | ToolCallResult

export function alwaysAllow(): true {
  return true
}

export function alwaysReject(): string {
  return 'always reject'
}

export function noop(): void {
  // no operation, as a placeholder for callback function
}

/**
 * The known field names a provider may use for the reasoning trace. There is no
 * standard, so both are checked; see `docs/reasoning-recall.md` for which
 * providers use which.
 */
export type ReasoningField = 'reasoning_content' | 'reasoning'

/**
 * Read the reasoning trace from a response message, whichever field name the
 * provider used. See {@link ReasoningField}.
 */
export function getReasoning(message: {
  [key in ReasoningField]?: string | null
}): string | null {
  return message.reasoning_content || message.reasoning || null
}

/**
 * Which field name the reasoning arrived under. A model reads back only the key
 * it wrote itself, so this is what to echo when replaying the message.
 */
export function getReasoningField(message: {
  [key in ReasoningField]?: string | null
}): ReasoningField | null {
  if (message.reasoning_content) return 'reasoning_content'
  if (message.reasoning) return 'reasoning'
  return null
}

export type CompleteWithToolsResult = {
  responses: CompletionResponse[]
  messages: CompletionMessage[]
  last_response: CompletionResponse
  last_message: CompletionMessage
  finish_reason: ChatCompletion['choices'][number]['finish_reason']
  logprobs: ChatCompletionChunk.Choice.Logprobs | null
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
    // The provider's response is returned as-is: the reasoning arrives under
    // whichever field name that provider uses, and is left untouched so replaying
    // the message echoes the same key back. Read it with `getReasoning(message)`.
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

  async collectStream(args: {
    context: CreateCompletionLoopContext
    callbacks?: CompleteStreamLoopEventListeners
    stream: Stream<StreamChunk>
  }): Promise<StreamResponse> {
    let { callbacks, stream } = args
    let creation_context = args.context

    // expand all event listeners, so it is easy to spot out missing invokes
    let {
      // Stream Callbacks
      onStreamStart,
      onChunk,
      onChunkDelta,
      onFinish,
      onStreamEnd,

      // Part Callbacks
      onPartStart,
      onPartEnd,

      // Role Callbacks
      onRole,

      // Reasoning Content Callbacks
      onReasoningContentStart,
      onReasoningContentDelta,
      onReasoningContentEnd,

      // Content Callbacks
      onContentStart,
      onContentDelta,
      onContentEnd,

      // Refusal Callbacks
      onRefusalStart,
      onRefusalDelta,
      onRefusalEnd,

      // Tool Calls Callbacks
      onToolCallsStart,
      onToolCallsDelta,
      onToolCallsEnd,
      // Each Tool Call Callbacks
      onToolCallStart,
      onToolCallDelta,
      onToolCallEnd,
      // Tool Call Name Callbacks
      onToolCallNameStart,
      onToolCallNameDelta,
      onToolCallNameEnd,
      // Tool Call Arguments Callbacks
      onToolCallArgumentsStart,
      onToolCallArgumentsDelta,
      onToolCallArgumentsEnd,
    } = callbacks ?? {}

    let response = new StreamResponse()

    let last_context: CompletionStreamChunkContext | undefined
    let last_part: CompletionStreamPart | undefined
    let last_tool_call: (ToolCall & { type: 'function' }) | undefined
    let last_tool_call_mode: CompletionStreamToolCallPart = 'idle'

    async function startPart(
      context: CompletionStreamChunkContext,
      part: CompletionStreamPart,
    ) {
      if (last_part) {
        await endPart(context, last_part)
      }
      if (onPartStart) {
        await onPartStart({ ...context, part })
      }
      last_context = context
      last_part = part
    }

    /**
     * End a part: first its typed callback (e.g. onContentEnd), then the generic
     * onPartEnd, matching the event order in the type docs.
     */
    async function endPart(
      context: CompletionStreamChunkContext,
      part: CompletionStreamPart,
    ) {
      if (part === 'reasoning' && onReasoningContentEnd) {
        await onReasoningContentEnd({
          ...context,
          reasoning_content: response.reasoning_content,
        })
      }
      if (part === 'content' && onContentEnd) {
        await onContentEnd({
          ...context,
          content: response.content,
        })
      }
      if (part === 'refusal' && onRefusalEnd) {
        await onRefusalEnd({
          ...context,
          refusal: response.refusal,
        })
      }
      if (part === 'tool_calls' && last_tool_call) {
        await endToolCall(context, last_tool_call)
        if (onToolCallsEnd) {
          await onToolCallsEnd({
            ...context,
            tool_calls: response.tool_calls,
          })
        }
        last_tool_call = undefined
      }
      if (onPartEnd) {
        await onPartEnd({ ...context, part })
      }
    }

    /** End the current part, if any. Clears it so it is not reported twice. */
    async function flushPart(context: CompletionStreamChunkContext) {
      if (last_part) {
        await endPart(context, last_part)
        last_part = undefined
      }
    }

    async function endToolCall(
      context: CompletionStreamChunkContext,
      last_tool_call: ToolCall & { type: 'function' },
    ) {
      if (last_tool_call_mode === 'name' && onToolCallNameEnd) {
        await onToolCallNameEnd({
          ...context,
          tool_call: last_tool_call,
          function_name: last_tool_call.function.name,
        })
      }
      if (last_tool_call_mode === 'arguments' && onToolCallArgumentsEnd) {
        await onToolCallArgumentsEnd({
          ...context,
          tool_call: last_tool_call,
          function_arguments: last_tool_call.function.arguments,
        })
      }
      last_tool_call_mode = 'idle'
      if (onToolCallEnd) {
        await onToolCallEnd({
          ...context,
          tool_call: last_tool_call,
        })
      }
    }

    if (onStreamStart) {
      await onStreamStart(creation_context)
    }

    let index = -1
    for await (const chunk of stream) {
      index++
      let context: CompletionStreamChunkContext = {
        ...creation_context,
        response,
        chunk_index: index,
        chunk,
      }
      if (onChunk) {
        await onChunk(context)
      }

      // copy fields from response chunk
      if (chunk.id) {
        response.id = chunk.id
      }
      if (chunk.created) {
        response.created = chunk.created
      }
      if (chunk.model) {
        response.model = chunk.model
      }
      if (chunk.moderation) {
        response.moderation = chunk.moderation
      }
      if (chunk.service_tier) {
        response.service_tier = chunk.service_tier
      }
      if (chunk.system_fingerprint) {
        response.system_fingerprint = chunk.system_fingerprint
      }
      if (chunk.usage) {
        response.usage = chunk.usage
      }
      if (chunk.cost !== undefined) {
        response.cost = chunk.cost
      }
      if (chunk.normalizedUsage) {
        response.normalizedUsage = chunk.normalizedUsage
      }

      let choice = chunk.choices[0]
      if (!choice) {
        continue
      }

      let { delta, finish_reason } = choice

      if (finish_reason) {
        response.finish_reason = finish_reason
      }
      if (choice.logprobs) {
        response.logprobs = choice.logprobs
      }

      if (delta && onChunkDelta) {
        await onChunkDelta({
          ...context,
          delta,
        })
      }

      if (delta.role && delta.role !== response.role) {
        if (onRole) {
          await onRole({ ...context, role: delta.role })
        }
        response.role = delta.role
      }

      let reasoning_delta = getReasoning(delta)
      if (reasoning_delta) {
        response.reasoning_field ??= getReasoningField(delta)
        if (last_part !== 'reasoning') {
          await startPart(context, 'reasoning')
          if (onReasoningContentStart) {
            await onReasoningContentStart(context)
          }
        }
        if (onReasoningContentDelta) {
          await onReasoningContentDelta({
            ...context,
            reasoning_content_acc: response.reasoning_content,
            reasoning_content_delta: reasoning_delta,
          })
        }
        response.reasoning_content += reasoning_delta
      }

      if (delta.content) {
        if (last_part !== 'content') {
          await startPart(context, 'content')
          if (onContentStart) {
            await onContentStart(context)
          }
        }
        if (onContentDelta) {
          await onContentDelta({
            ...context,
            content_acc: response.content,
            content_delta: delta.content,
          })
        }
        response.content += delta.content
      }

      if (delta.refusal) {
        if (last_part !== 'refusal') {
          await startPart(context, 'refusal')
          if (onRefusalStart) {
            await onRefusalStart(context)
          }
        }
        if (onRefusalDelta) {
          await onRefusalDelta({
            ...context,
            refusal_acc: response.refusal,
            refusal_delta: delta.refusal,
          })
        }
        response.refusal += delta.refusal
      }

      if (delta.tool_calls) {
        if (last_part !== 'tool_calls') {
          await startPart(context, 'tool_calls')
          if (onToolCallsStart) {
            await onToolCallsStart(context)
          }
        }
        if (onToolCallsDelta) {
          await onToolCallsDelta({
            ...context,
            tool_calls_acc: response.tool_calls,
            tool_calls_delta: delta.tool_calls,
          })
        }
        for (let tool_call_delta of delta.tool_calls) {
          // FIXME check if it is possible to stream multiple tool calls in parallel (if it is not always in serial, we will need to track the delta and end of each tool call with overlapping storyline)
          if (
            last_tool_call &&
            last_tool_call.index !== tool_call_delta.index
          ) {
            await endToolCall(context, last_tool_call)
            last_tool_call = undefined
          }

          let function_delta = tool_call_delta.function
          if (!function_delta) {
            continue
          }

          let tool_call_acc = (response.tool_calls[tool_call_delta.index] ||= {
            index: tool_call_delta.index,
            id: '',
            type: 'function',
            function: {
              name: '',
              arguments: '',
            },
          })
          let function_acc = tool_call_acc.function

          if (tool_call_delta.id) {
            tool_call_acc.id = tool_call_delta.id
          }

          if (tool_call_delta.type) {
            tool_call_acc.type = tool_call_delta.type
          }

          if (last_tool_call !== tool_call_acc) {
            if (onToolCallStart) {
              await onToolCallStart({ ...context, tool_call: tool_call_acc })
            }
          }

          if (function_delta.name) {
            if (
              last_tool_call &&
              last_tool_call_mode === 'arguments' &&
              onToolCallArgumentsEnd
            ) {
              await onToolCallArgumentsEnd({
                ...context,
                tool_call: last_tool_call,
                function_arguments: last_tool_call.function.arguments,
              })
            }
            last_tool_call_mode = 'name'
            if (!function_acc.name && onToolCallNameStart) {
              await onToolCallNameStart({
                ...context,
                tool_call: tool_call_acc,
              })
            }
            if (onToolCallNameDelta) {
              await onToolCallNameDelta({
                ...context,
                tool_call: tool_call_acc,
                function_name_acc: function_acc.name,
                function_name_delta: function_delta.name,
              })
            }
            function_acc.name += function_delta.name
          }

          if (function_delta.arguments) {
            if (
              last_tool_call &&
              last_tool_call_mode === 'name' &&
              onToolCallNameEnd
            ) {
              await onToolCallNameEnd({
                ...context,
                tool_call: last_tool_call,
                function_name: last_tool_call.function.name,
              })
            }
            last_tool_call_mode = 'arguments'
            if (!function_acc.arguments && onToolCallArgumentsStart) {
              await onToolCallArgumentsStart({
                ...context,
                tool_call: tool_call_acc,
              })
            }
            if (onToolCallArgumentsDelta) {
              await onToolCallArgumentsDelta({
                ...context,
                tool_call: tool_call_acc,
                function_arguments_acc: function_acc.arguments,
                function_arguments_delta: function_delta.arguments,
              })
            }
            function_acc.arguments += function_delta.arguments
          }

          if (onToolCallDelta) {
            await onToolCallDelta({
              ...context,
              tool_call_acc,
              tool_call_delta,
            })
          }

          last_tool_call = tool_call_acc
        }
      }

      if (finish_reason) {
        await flushPart(context)
        if (onFinish) {
          await onFinish({
            ...context,
            finish_reason,
          })
        }
      }
    }

    // close any part left open when the stream ended without a finish_reason
    if (last_part && last_context) {
      await endPart(last_context, last_part)
      last_part = undefined
    }

    if (onStreamEnd) {
      await onStreamEnd({ ...creation_context, response })
    }

    return response
  }

  /**
   * @description guard and call the tool, also push the result to `context.newMessages`.
   * Rejected calls get the rejection reason as their tool result, so the model can
   * react to it; see {@link ToolCallGuard}.
   */
  private async callTool(
    args: ReceivedCompletionLoopContext & {
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
   * @description helper function to loop until all tool calls are completed.
   *
   * Remark: only handling the first choice of the response message at the moment.
   */
  private async loopWithTools(
    create_args: CompleteWithToolsArgs & {
      complete(args: {
        context: CreateCompletionLoopContext
        complete_args: CompleteArgs
      }): Promise<CompletionResponse>
    },
  ): Promise<CompleteWithToolsResult> {
    let { guardToolCall, callbacks, complete } = create_args

    // expand all event listeners, so it is easy to spot out missing invokes
    let { onResponse, onMessage, onToolCallResult } = callbacks ?? {}

    let new_responses: CompletionResponse[] = []
    let new_messages: CompletionMessage[] = []

    let create_context: CreateCompletionLoopContext = {
      create_args,
      new_responses,
      new_messages,
    }

    for (;;) {
      let new_response = await complete({
        context: create_context,
        complete_args: {
          ...create_args,
          messages: [...create_args.messages, ...new_messages],
        },
      })
      new_responses.push(new_response)

      let choice = new_response.choices[0]
      if (!choice) {
        throw new Error('no choice in the response')
      }

      let new_message = choice.message
      new_messages.push(new_message)

      let context: ReceivedCompletionLoopContext = {
        create_args,
        new_responses,
        new_messages,
        response: new_response,
        new_message: new_message,
      }

      if (onResponse) {
        await onResponse(context)
      }
      if (onMessage) {
        await onMessage(context)
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
    let last_choice = last_response.choices[0]

    return {
      responses: new_responses,
      messages: new_messages,
      last_response,
      finish_reason: last_choice?.finish_reason,
      logprobs: last_choice?.logprobs,
      last_message: last_choice.message,
    } satisfies CompleteWithToolsResult
  }

  /**
   * @description helper function to loop until all tool calls are completed.
   *
   * Remark: only handling the first choice of the response message at the moment.
   */
  async completeWithTools(
    create_args: CompleteWithToolsArgs,
  ): Promise<CompleteWithToolsResult> {
    return await this.loopWithTools({
      ...create_args,
      complete: args => this.complete(args.complete_args),
    })
  }

  /**
   * @description streaming version of looping with tool calling, using collectStream internally.
   */
  async streamWithTools(
    create_args: StreamWithToolsArgs,
  ): Promise<CompleteWithToolsResult> {
    let { callbacks } = create_args
    return await this.loopWithTools({
      ...create_args,
      complete: async args => {
        let stream = await this.stream(args.complete_args)
        let result = await this.collectStream({
          context: args.context,
          callbacks,
          stream,
        })
        return result.toCompletionResponse()
      },
    })
  }
}

export class StreamResponse {
  // from response chunk
  id: string | undefined = undefined
  created: number | undefined = undefined
  model: string | undefined = undefined
  moderation: ChatCompletionChunk.Moderation | undefined = undefined
  service_tier: ChatCompletion['service_tier'] | undefined = undefined
  system_fingerprint: ChatCompletion['system_fingerprint'] | undefined =
    undefined
  usage: ChatCompletion['usage'] | undefined = undefined
  cost: number | string | undefined = undefined
  normalizedUsage: StreamChunk['normalizedUsage'] = undefined

  // from delta in first choice
  role: ChatCompletionMessageParam['role'] | undefined = undefined
  // normalized from either `reasoning_content` or `reasoning`, see getReasoning
  reasoning_content: string = ''
  // which provider key the reasoning arrived under, echoed back on replay
  reasoning_field: ReasoningField | null = null
  // TODO consider content as Array<Text|Refusal> for partially masked content
  content: string = ''
  refusal: string = ''
  tool_calls: (ToolCall & { type: 'function' })[] = []
  // TODO support annotations, audio, etc.
  finish_reason: ChatCompletionChunk['choices'][number]['finish_reason'] = null
  logprobs: ChatCompletionChunk.Choice.Logprobs | null = null

  toCompletionResponse(): CompletionResponse {
    // check fields in response chunk
    if (!this.id) {
      throw new Error('no yet received response chunk (no id)')
    }
    if (!this.created) {
      throw new Error('no yet received response chunk (no created)')
    }
    if (!this.model) {
      throw new Error('no yet received response chunk (no model)')
    }

    return {
      id: this.id,
      choices: [this.toChoice()],
      created: this.created,
      model: this.model,
      object: 'chat.completion',
      moderation: this.moderation,
      service_tier: this.service_tier,
      system_fingerprint: this.system_fingerprint,
      usage: this.usage,
    } satisfies CompletionResponse
  }

  toChoice(): CompletionChoice {
    if (!this.finish_reason) {
      throw new Error('not yet received message finish reason')
    }
    return {
      finish_reason: this.finish_reason,
      index: 0,
      logprobs: this.logprobs,
      message: this.toMessage(),
    } satisfies CompletionChoice
  }

  toMessage(): CompletionMessage {
    if (!this.role) {
      throw new Error('no yet received message (no role)')
    }
    if (this.role !== 'assistant') {
      throw new Error('only assistant role is supported')
    }
    let reasoning = this.reasoning_content.trim() || null
    // echo the provider's own key so the model reads it back on replay; do not
    // rewrite it to a single canonical name (a model reads only the key it wrote)
    let message: CompletionMessage = {
      role: this.role,
      content: this.content.trim() || null,
      refusal: this.refusal.trim() || null,
      annotations: undefined, // not supported yet
      audio: undefined, // not supported yet
      function_call: undefined, // replaced by tool_calls
      tool_calls: this.tool_calls.length > 0 ? this.tool_calls : undefined,
    }
    if (reasoning) {
      message[this.reasoning_field ?? 'reasoning_content'] = reasoning
    } else {
      message.reasoning_content = null
    }
    return message satisfies CompletionMessage
  }
}

export type CompletionResponse = ChatCompletion & {
  choices: Array<
    ChatCompletion['choices'][number] & {
      message: ChatCompletionMessageParam & {
        // some provider name it as `reasoning_content`, some as `reasoning`
        reasoning_content?: string | null
        reasoning?: string | null
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
        // some provider name it as `reasoning_content`, some as `reasoning`
        reasoning_content?: string | null
        reasoning?: string | null
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

export type Delta = StreamChunk['choices'][number]['delta']
