import { ChatCompletionMessageParam } from 'openai/resources/chat/completions/index'
import { alwaysAllow, Client, createClient, StreamChunk } from './client'
import { ToolCall } from './tool'
import { env } from './env'

let client = createClient({
  base_url: env.PROVIDER_URL,
  api_key: env.API_KEY,
  default_model: env.MODEL_NAME,
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
  callback: async (args: unknown) => {
    return new Date().toDateString()
  },
})

client.addFunction({
  name: 'get_time',
  description: 'Get the current time, without the date part',
  parameters: {
    type: 'object',
    properties: {
      reasoning: {
        type: 'string',
        description: 'The reasoning for getting the time',
      },
    },
  },
  callback: async (args: unknown) => {
    return new Date().toTimeString()
  },
})

async function testComplete() {
  let content = 'hi'
  content = 'what is the current date and time?'
  content =
    'what is the current date and time? Response in format of "YYYY-MM-DD HH:MM:SS" without extra text'

  function log(label: string, message: any) {
    console.log(`[${label}]`)
    console.log(message)
    console.log(`[/${label}]`)
    console.log('--------------------------------')
  }

  log('prompt', content)

  let messages: ChatCompletionMessageParam[] = [{ role: 'user', content }]

  let result = await client.completeWithTools({
    messages,
    guardToolCall: alwaysAllow,
    onResponse({ response: newResponse }) {
      let response = newResponse

      if (response.choices[0].message.role) {
        log('role', response.choices[0].message.role)
      }
      if (response.choices[0].message.reasoning_content) {
        log('reasoning', response.choices[0].message.reasoning_content)
      }
      if (response.choices[0].message.content) {
        log('content', response.choices[0].message.content)
      }
      if (response.choices[0].message.tool_calls) {
        let index = -1
        for (const toolCall of response.choices[0].message.tool_calls) {
          index++
          log(`tool_call:${index}`, toolCall)
        }
      }
      if (response.choices[0].message.annotations) {
        for (const annotation of response.choices[0].message.annotations) {
          log('annotation', annotation)
        }
      }
      if (response.choices[0].message.audio) {
        log('audio', response.choices[0].message.audio)
      }
      if (response.choices[0].message.refusal) {
        log('refusal', response.choices[0].message.refusal)
      }
    },
    onToolCallResult({
      tool_call: toolCall,
      tool_call_result: toolCallResult,
    }) {
      log('tool_call_result', toolCallResult)
    },
  })

  log('result', result.last_message)
}

const noop = () => {}

async function streamAndCollect(args: {
  client: Client
  messages: ChatCompletionMessageParam[]
}) {
  let { client, messages } = args
  const streamGenerator = client.completeStream({ messages })
  let id: string | undefined = undefined
  let tool_calls: (ToolCall & { type: 'function' })[] = []
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
            type: 'function',
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

async function testStream() {
  let content = 'hi'
  content = 'What is the syntax of tool calls?'
  content =
    'what is the current date and time? Response in format of "YYYY-MM-DD HH:MM:SS" without extra text'
  // content = `what is the date and time? Result in this format: `

  let messages: ChatCompletionMessageParam[] = [{ role: 'user', content }]

  for (;;) {
    let response = await streamAndCollect({ client, messages })

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
        let message = await client.tools.callTool(tool_call)
        // pass the tool call result to LLM
        messages.push(message)
        console.log('result:', message)
      }
      response = await streamAndCollect({ client, messages })
      continue
    }

    console.log('response:', response)
    break
  }
}

async function main() {
  // await testComplete()
  await testStream()
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
