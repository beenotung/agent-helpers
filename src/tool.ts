import {
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
  ChatCompletionFunctionTool,
  ChatCompletionToolMessageParam,
} from 'openai/resources/chat/completions'
import { getParserJsonSchema, Parser } from 'cast.ts'

/**
 * The type of the value produced by a cast.ts parser.
 *
 * e.g. `object({ user_id: int() })` produces `{ user_id: number }`.
 */
export type ParserArgs<P> = P extends {
  parse: (input: unknown, context?: any) => infer R
}
  ? R
  : never

type FunctionTool<T> = ChatCompletionFunctionTool & {
  callback: (args: T) => Promise<string>
  /** the cast.ts parser, when the function was registered with one */
  parser?: Parser<any>
}

/**
 * Register a function with a cast.ts parser.
 *
 * The JSON schema of the tool definition is derived from the parser, and the
 * arguments are parsed and validated before the callback runs.
 */
export type AddFunctionArgsWithParser<P extends Parser<any>> = {
  name: string
  description: string
  parser: P
  /** receives the parsed and validated arguments */
  callback: (args: ParserArgs<P>) => Promise<string>
}

/**
 * Register a function with a hand-written JSON schema.
 *
 * The callback receives the raw JSON string of the tool call.
 */
export type AddFunctionArgsWithParameters<T = unknown> = {
  name: string
  description: string
  parameters: ChatCompletionFunctionTool['function']['parameters']
  /** receives the raw JSON string */
  callback: (args: T) => Promise<string>
}

export type AddFunctionArgs<T = unknown> =
  | AddFunctionArgsWithParser<Parser<T>>
  | AddFunctionArgsWithParameters<T>

export type ToolCall = ChatCompletionMessageToolCall & {
  index: number
}

export type ToolCallResult = ChatCompletionToolMessageParam

/**
 * The outcome of parsing the arguments of a tool call.
 *
 * `raw` is the original JSON string. `args` is the value that is passed to the
 * callback: the parsed and validated value when `parsed` is true, otherwise
 * the raw JSON string (for functions registered without a parser).
 */
export type ParsedToolCallArgs =
  | { ok: true; args: unknown; raw: string; parsed: boolean }
  | { ok: false; error: string }

/** a normalized function definition, as stored in the registry */
export type FunctionDefinition = {
  name: string
  description: string
  parameters: ChatCompletionFunctionTool['function']['parameters']
  callback: (args: any) => Promise<string>
  /** the cast.ts parser, when the function was registered with one */
  parser?: Parser<any>
}

/**
 * @description the prefix of the tool result content, when the arguments of a
 * tool call are invalid.
 *
 * The model reads this content, so it is phrased as a hint to fix the call.
 */
export const INVALID_ARGUMENTS_PREFIX = 'Error: invalid tool call arguments.'

/**
 * @description derive the JSON schema of a tool definition from a parser.
 *
 * A custom parser may not provide a JSON schema; then a generic object schema
 * is used, so the tool call can still be defined.
 */
export function toFunctionParameters(
  parser: Parser<any>,
): ChatCompletionFunctionTool['function']['parameters'] {
  try {
    return getParserJsonSchema(parser)
  } catch (error) {
    console.warn(
      `cannot derive the JSON schema from the parser: ${
        error instanceof Error ? error.message : String(error)
      }. Using { type: 'object' } instead.`,
    )
    return { type: 'object' }
  }
}

/**
 * @description normalize the arguments of `addFunction()` into a definition.
 */
export function toFunctionDefinition(
  func: AddFunctionArgs<any>,
): FunctionDefinition {
  if ('parser' in func && func.parser) {
    if ('parameters' in func && func.parameters) {
      console.warn(
        `ignoring the hand-written parameters of function "${func.name}", because a parser is given`,
      )
    }
    return {
      name: func.name,
      description: func.description,
      parameters: toFunctionParameters(func.parser),
      callback: func.callback,
      parser: func.parser,
    }
  }
  let legacy = func as AddFunctionArgsWithParameters<any>
  return {
    name: legacy.name,
    description: legacy.description,
    parameters: legacy.parameters,
    callback: legacy.callback,
  }
}

export class ToolRegistry {
  tools: ChatCompletionTool[] = []
  functions: Map<string, FunctionTool<any>> = new Map()

  /** @description register a function with a cast.ts parser */
  addFunction<P extends Parser<any>>(
    func: AddFunctionArgsWithParser<P>,
  ): void
  /** @description register a function with a hand-written JSON schema */
  addFunction<T = unknown>(func: AddFunctionArgsWithParameters<T>): void
  addFunction(func: AddFunctionArgs<any>) {
    let definition = toFunctionDefinition(func)
    if (this.functions.has(definition.name)) {
      console.warn(`overriding function: ${definition.name}`)
    }
    let tool: FunctionTool<any> = {
      type: 'function',
      function: {
        name: definition.name,
        description: definition.description,
        parameters: definition.parameters,
      },
      callback: definition.callback,
      parser: definition.parser,
    }
    this.tools.push(tool)
    this.functions.set(definition.name, tool)
  }

  /**
   * @description prepare the argument value that is passed to the callback.
   *
   * With a cast.ts parser, the raw JSON string is parsed and validated. On
   * failure, the error describes what the model has to fix.
   *
   * Without a parser, the raw JSON string is passed through unchanged, as
   * before.
   */
  prepareArgs(tool: ToolCall): ParsedToolCallArgs {
    if (tool.type !== 'function') {
      return { ok: false, error: `unknown tool type: ${tool.type}` }
    }
    let func = this.functions.get(tool.function.name)
    if (!func) {
      return {
        ok: false,
        error: `callback function not registered: ${tool.function.name}`,
      }
    }
    let raw = tool.function.arguments
    if (!func.parser) {
      // no parser: the callback receives the raw JSON string
      return { ok: true, args: raw, raw, parsed: false }
    }
    let json: unknown
    try {
      json = JSON.parse(raw)
    } catch (error) {
      let message = error instanceof Error ? error.message : String(error)
      return { ok: false, error: `Invalid JSON arguments: ${message}` }
    }
    try {
      let args = func.parser.parse(json)
      return { ok: true, args, raw, parsed: true }
    } catch (error) {
      let message = error instanceof Error ? error.message : String(error)
      return { ok: false, error: message }
    }
  }

  /**
   * @description the tool result content, when the arguments of a tool call
   * are invalid.
   *
   * The same wording is used by the client, so the model sees one consistent
   * message whichever path produced it.
   */
  invalidArgumentsContent(error: string): string {
    return INVALID_ARGUMENTS_PREFIX + ' ' + error
  }

  /**
   * @description will never throw error. Already wrapped in try-catch.
   *
   * `args` is the value passed to the callback. When it is not given, it is
   * prepared by {@link ToolRegistry.prepareArgs}.
   */
  async callTool(
    tool: ToolCall,
    args?: unknown,
  ): Promise<ToolCallResult> {
    let content: string
    try {
      if (args === undefined) {
        let prepared = this.prepareArgs(tool)
        if (!prepared.ok) {
          return {
            role: 'tool',
            tool_call_id: tool.id,
            content: this.invalidArgumentsContent(prepared.error),
          }
        }
        args = prepared.args
      }
      content = await this.runToolCall(tool, args)
    } catch (error) {
      content = String(error)
      if (!content.includes('error') && !content.includes('Error')) {
        content = 'Error: ' + content
      }
    }
    return {
      role: 'tool',
      tool_call_id: tool.id,
      content: content,
    }
  }

  private async runToolCall(tool: ToolCall, args: unknown): Promise<string> {
    if (tool.type !== 'function') {
      throw new Error(`unknown tool type: ${tool.type}`)
    }
    let func = this.functions.get(tool.function.name)
    if (!func) {
      throw new Error(`callback function not registered: ${tool.function.name}`)
    }
    return await func.callback(args)
  }
}
