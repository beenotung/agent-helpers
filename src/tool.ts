import {
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
  ChatCompletionFunctionTool,
  ChatCompletionToolMessageParam,
} from 'openai/resources/chat/completions'

type FunctionTool<T> = ChatCompletionFunctionTool & {
  callback: (args: T) => Promise<string>
}

export type AddFunctionArgs<T> = {
  name: string
  description: string
  parameters: ChatCompletionFunctionTool['function']['parameters']
  callback: (args: T) => Promise<string>
}

export type ToolCall = ChatCompletionMessageToolCall & {
  index: number
}

export type ToolCallResult = ChatCompletionToolMessageParam

export class ToolRegistry {
  tools: ChatCompletionTool[] = []
  functions: Map<string, FunctionTool<any>> = new Map()

  addFunction<T>(func: AddFunctionArgs<T>) {
    if (this.functions.has(func.name)) {
      console.warn(`overriding function: ${func.name}`)
    }
    let tool: FunctionTool<T> = {
      type: 'function',
      function: {
        name: func.name,
        description: func.description,
        parameters: func.parameters,
      },
      callback: func.callback,
    }
    this.tools.push(tool)
    this.functions.set(func.name, tool)
  }

  /** @description will never throw error. Already wrapped in try-catch. */
  async callTool(tool: ToolCall): Promise<ToolCallResult> {
    let content: string
    try {
      content = await this.runToolCall(tool)
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

  private async runToolCall(tool: ToolCall): Promise<string> {
    if (tool.type !== 'function') {
      throw new Error(`unknown tool type: ${tool.type}`)
    }
    let func = this.functions.get(tool.function.name)
    if (!func) {
      throw new Error(`callback function not registered: ${tool.function.name}`)
    }
    return await func.callback(tool.function.arguments)
  }
}
