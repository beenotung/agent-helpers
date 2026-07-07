import {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions/index'
import { complete, stream, StreamChunk } from './llm'

async function testComplete() {
  let content = 'hi'
  content = 'what is the current date and time?'
  const response = await complete([{ role: 'user', content }], tools)
  if (response.choices[0].message.role) {
    console.log('[role]')
    console.log(response.choices[0].message.role)
    console.log('--------------------------------')
  }
  if (response.choices[0].message.content) {
    console.log('[content]')
    console.log(response.choices[0].message.content)
    console.log('--------------------------------')
  }
  if (response.choices[0].message.reasoning_content) {
    console.log('[reasoning]')
    console.log(response.choices[0].message.reasoning_content)
    console.log('--------------------------------')
  }
  if (response.choices[0].message.tool_calls) {
    for (const toolCall of response.choices[0].message.tool_calls) {
      console.log('[tool_call]')
      console.log(toolCall)
      console.log('--------------------------------')
    }
  }
  if (response.choices[0].message.annotations) {
    for (const annotation of response.choices[0].message.annotations) {
      console.log('[annotation]')
      console.log(annotation)
      console.log('--------------------------------')
    }
  }
  if (response.choices[0].message.audio) {
    console.log('[audio]')
    console.log(response.choices[0].message.audio)
    console.log('--------------------------------')
  }
  if (response.choices[0].message.refusal) {
    console.log('[refusal]')
    console.log(response.choices[0].message.refusal)
    console.log('--------------------------------')
  }
  // console.log('[response]')
  // console.log(JSON.stringify(response, null, 2))
  // console.log('--------------------------------')
}

let tools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_date',
      description: 'Get the current date',
      parameters: {
        type: 'object',
        properties: {
          reasoning: {
            type: 'string',
            description: 'The reasoning for getting the date',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_time',
      description: 'Get the current time',
      parameters: {
        type: 'object',
        properties: {
          reasoning: {
            type: 'string',
            description: 'The reasoning for getting the time',
          },
        },
      },
    },
  },
]

type ToolCall = {
  index: number
  id: string
  type: 'function' | string
  function: {
    name: string
    arguments: string
  }
}

const noop = () => {}

async function streamAndCollect(
  messages: ChatCompletionMessageParam[],
  tools?: ChatCompletionTool[],
) {
  const streamGenerator = stream(messages, tools)
  let id: string | undefined = undefined
  let tool_calls: ToolCall[] = []
  let last_tool_call_mode: 'idle' | 'name' | 'arguments' = 'idle'
  let reasoning_content = ''
  let response_content = ''
  let cost: number | string | undefined = undefined
  let normalizedUsage: StreamChunk['normalizedUsage'] = undefined
  console.log('[start of stream]')
  let i = 0
  let last_mode = ''
  let flush = noop
  for await (const chunk of streamGenerator) {
    i++
    // console.log(`[chunk ${i}]`)
    // console.log(JSON.stringify(chunk, null, 2))
    // console.log('--------------------------------')

    if (chunk.id) {
      id = chunk.id
    }

    let choice = chunk.choices[0]
    if (!choice) {
      flush()
      // console.log('[no choice]')
      // console.log(JSON.stringify(chunk, null, 2))
      // console.log('[/no choice]')
      if (chunk.cost !== undefined) {
        cost = chunk.cost
      }
      if (chunk.normalizedUsage) {
        normalizedUsage = chunk.normalizedUsage
      }
      continue
    }

    if (last_mode !== 'reasoning' && choice.delta.reasoning_content) {
      flush()
      console.log('[reasoning]')
      flush = () => {
        console.log('\n[/reasoning]')
        flush = noop
      }
      last_mode = 'reasoning'
    }
    if (choice.delta.reasoning_content) {
      process.stdout.write(choice.delta.reasoning_content)
    }

    if (last_mode !== 'content' && choice.delta.content) {
      flush()
      console.log('[content]')
      flush = () => {
        console.log('\n[/content]')
        flush = noop
      }
      last_mode = 'content'
    }
    if (choice.delta.content) {
      process.stdout.write(choice.delta.content)
    }

    if (last_mode !== 'tool_calls' && choice.delta.tool_calls) {
      flush()
      console.log('[tool_calls]')
      flush = () => {
        console.log('[/tool_calls]')
        flush = noop
      }
      last_mode = 'tool_calls'
    }
    if (choice.delta.tool_calls) {
      for (let tool_call of choice.delta.tool_calls) {
        if (tool_call.function) {
          tool_calls[tool_call.index] ||= {
            index: tool_call.index,
            id: '',
            type: '',
            function: {
              name: '',
              arguments: '',
            },
          }
          if (tool_call.id) {
            tool_calls[tool_call.index].id = tool_call.id
          }
          if (tool_call.type) {
            tool_calls[tool_call.index].type = tool_call.type
          }
          if (tool_call.function.name) {
            tool_calls[tool_call.index].function.name += tool_call.function.name
          }
          if (tool_call.function.arguments) {
            tool_calls[tool_call.index].function.arguments +=
              tool_call.function.arguments
          }

          if (last_tool_call_mode !== 'name' && tool_call.function.name) {
            if (tool_call.index > 0) {
              console.log()
            }
            if (last_tool_call_mode === 'arguments') {
              console.log('[/arguments]')
            }
            console.log('[name]')
            last_tool_call_mode = 'name'
          }
          if (tool_call.function.name) {
            process.stdout.write(tool_call.function.name)
          }

          if (
            last_tool_call_mode !== 'arguments' &&
            tool_call.function.arguments
          ) {
            console.log()
            if (last_tool_call_mode === 'name') {
              console.log('[/name]')
            }
            console.log('[arguments]')
            last_tool_call_mode = 'arguments'
          }
          if (tool_call.function.arguments) {
            process.stdout.write(tool_call.function.arguments)
          }

          if (!tool_call.function.name && !tool_call.function.arguments) {
            process.stdout.write('[both empty]')
          }
        } else {
          process.stdout.write('[no function]')
        }
      }
    }
    if (last_tool_call_mode !== 'idle' && !choice.delta.tool_calls) {
      if (last_tool_call_mode === 'name') {
        console.log()
        console.log('[/name]')
      }
      if (last_tool_call_mode === 'arguments') {
        console.log()
        console.log('[/arguments]')
      }
      last_tool_call_mode = 'idle'
    }
  }
  flush()
  console.log('[end of stream]')

  return {
    id,
    tool_calls,
    reasoning_content,
    response_content,
    cost,
    normalizedUsage,
  }
}

async function callTool(tool_call: ToolCall): Promise<string> {
  switch (tool_call.function.name) {
    case 'get_date':
      return new Date().toDateString()
    case 'get_time':
      return new Date().toTimeString()
    default:
      throw new Error(`unknown function: ${tool_call.function.name}`)
  }
}

async function testStream() {
  let content = 'hi'
  content = 'What is the syntax of tool calls?'
  content =
    'what is the current date and time? Response in format of "YYYY-MM-DD HH:MM:SS" without extra text'

  let messages: ChatCompletionMessageParam[] = [{ role: 'user', content }]

  let response = await streamAndCollect(messages, tools)

  console.log('tool_calls:', response.tool_calls)
  if (response.tool_calls.length > 0) {
    messages.push({
      role: 'assistant',
      tool_calls: response.tool_calls
        .map(tool_call => {
          if (tool_call.type !== 'function') {
            return null
          }
          return {
            id: tool_call.id,
            type: 'function' as const,
            function: {
              name: tool_call.function.name,
              arguments: tool_call.function.arguments,
            },
          }
        })
        .filter(tool_call => tool_call !== null),
    })
    for (let tool_call of response.tool_calls) {
      let content: string
      try {
        content = await callTool(tool_call)
      } catch (error) {
        content = String(error)
        if (!content.includes('error') && !content.includes('Error')) {
          content = 'Error: ' + content
        }
      }
      messages.push({
        role: 'tool',
        tool_call_id: tool_call.id,
        content,
      })
      console.log('result:', messages[messages.length - 1])
    }
    response = await streamAndCollect(messages, tools)
  }

  // TODO pass the tool call result to LLM
}

async function main() {
  // await testComplete()
  await testStream()
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
