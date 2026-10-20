import { strict as assert } from 'assert'
import { array, int, object, optional, string } from 'cast.ts'
import { createClient } from './client'
import { ToolCall, ToolRegistry } from './tool'

/** a tool call as the model sends it */
function toolCall(name: string, args: string): ToolCall {
  return {
    id: `call_${name}`,
    type: 'function',
    index: 0,
    function: { name, arguments: args },
  }
}

/** the content of a tool result, which is always a string here */
function content(result: { content: string | any }): string {
  return result.content as string
}

/** the function definition of a registered tool */
function functionOf(registry: ToolRegistry, index = 0): any {
  let tool = registry.tools[index]
  assert.equal(tool.type, 'function')
  return (tool as any).function
}

async function testSchemaFromParser() {
  let registry = new ToolRegistry()
  registry.addFunction({
    name: 'get_user',
    description: 'Get a user by id',
    parser: object({
      user_id: int(),
      reason: optional(string()),
    }),
    callback: async () => 'ok',
  })

  let tool = functionOf(registry)
  assert.equal(tool.name, 'get_user')
  let parameters = tool.parameters as any
  assert.equal(parameters.type, 'object')
  assert.deepEqual(parameters.properties.user_id, { type: 'integer' })
  assert.deepEqual(parameters.properties.reason, { type: 'string' })
  // optional fields are not required
  assert.deepEqual(parameters.required, ['user_id'])
  console.log('✓ schema is derived from the parser')
}

async function testCallbackReceivesParsedArgs() {
  let received: unknown = undefined
  let registry = new ToolRegistry()
  registry.addFunction({
    name: 'get_user',
    description: 'Get a user by id',
    parser: object({ user_id: int() }),
    callback: async (args) => {
      received = args
      return 'user ' + args.user_id
    },
  })

  let result = await registry.callTool(toolCall('get_user', '{"user_id": 42}'))
  assert.equal(result.role, 'tool')
  assert.equal(content(result), 'user 42')
  // the callback receives the parsed value, not the raw JSON string
  assert.deepEqual(received, { user_id: 42 })
  console.log('✓ callback receives the parsed and validated arguments')
}

async function testMissingField() {
  let called = false
  let registry = new ToolRegistry()
  registry.addFunction({
    name: 'get_user',
    description: 'Get a user by id',
    parser: object({ user_id: int() }),
    callback: async () => {
      called = true
      return 'ok'
    },
  })

  let result = await registry.callTool(toolCall('get_user', '{}'))
  assert.equal(called, false, 'the callback must not run')
  assert.match(content(result), /invalid tool call arguments/i)
  // the error tells the model what to fix
  assert.match(content(result), /user_id/)
  console.log('✓ a missing field is reported and the callback is skipped')
}

async function testWrongType() {
  let registry = new ToolRegistry()
  registry.addFunction({
    name: 'get_user',
    description: 'Get a user by id',
    parser: object({ user_id: int() }),
    callback: async () => 'ok',
  })

  let result = await registry.callTool(
    toolCall('get_user', '{"user_id": "not a number"}'),
  )
  assert.match(content(result), /invalid tool call arguments/i)
  assert.match(content(result), /user_id/)
  console.log('✓ a wrong type is reported')
}

async function testInvalidJson() {
  let registry = new ToolRegistry()
  registry.addFunction({
    name: 'get_user',
    description: 'Get a user by id',
    parser: object({ user_id: int() }),
    callback: async () => 'ok',
  })

  let result = await registry.callTool(toolCall('get_user', '{not json'))
  assert.match(content(result), /invalid tool call arguments/i)
  assert.match(content(result), /invalid json/i)
  console.log('✓ invalid JSON is reported')
}

async function testNestedAndArray() {
  let received: unknown = undefined
  let registry = new ToolRegistry()
  registry.addFunction({
    name: 'search',
    description: 'Search users',
    parser: object({
      keywords: array(string()),
      limit: optional(int()),
    }),
    callback: async (args) => {
      received = args
      return 'ok'
    },
  })

  let result = await registry.callTool(
    toolCall('search', '{"keywords": ["a", "b"], "limit": 5}'),
  )
  assert.equal(content(result), 'ok')
  assert.deepEqual(received, { keywords: ['a', 'b'], limit: 5 })
  console.log('✓ nested values and arrays are parsed')
}

/** the legacy API: hand-written schema, callback receives the raw JSON string */
async function testLegacyParametersPath() {
  let received: unknown = undefined
  let registry = new ToolRegistry()
  registry.addFunction({
    name: 'get_date',
    description: 'Get the current date',
    parameters: {
      type: 'object',
      properties: { reasoning: { type: 'string' } },
    },
    callback: async (args) => {
      received = args
      return 'today'
    },
  })

  let parameters = functionOf(registry).parameters as any
  assert.equal(parameters.type, 'object')
  assert.deepEqual(parameters.properties.reasoning, { type: 'string' })

  let result = await registry.callTool(
    toolCall('get_date', '{"reasoning": "because"}'),
  )
  assert.equal(content(result), 'today')
  // unchanged behaviour: the callback receives the raw JSON string
  assert.equal(received, '{"reasoning": "because"}')
  console.log('✓ the legacy parameters path still passes the raw JSON string')
}

/** the guard receives the parsed arguments of a parser-based function */
async function testGuardReceivesTypedArgs() {
  let client = createClient({
    base_url: 'http://127.0.0.1:1/v1',
    api_key: 'test',
    default_model: 'test-model',
  })
  client.addFunction({
    name: 'get_user',
    description: 'Get a user by id',
    parser: object({ user_id: int() }),
    callback: async () => 'ok',
  })

  let guardArgs: any = undefined
  let callTool = (client as any).callTool.bind(client)
  let result = await callTool({
    create_args: { messages: [] },
    new_responses: [],
    new_messages: [],
    response: {} as any,
    new_message: {} as any,
    tool_call: toolCall('get_user', '{"user_id": 7}'),
    guardToolCall: async (args: any) => {
      guardArgs = args
      return true
    },
  })

  assert.equal(content(result), 'ok')
  assert.deepEqual(guardArgs.arguments, { user_id: 7 })
  console.log('✓ the guard receives the parsed arguments')
}

/** a parse failure short-circuits: neither the guard nor the callback runs */
async function testParseFailureSkipsGuardAndCallback() {
  let client = createClient({
    base_url: 'http://127.0.0.1:1/v1',
    api_key: 'test',
    default_model: 'test-model',
  })
  let callbackRan = false
  client.addFunction({
    name: 'get_user',
    description: 'Get a user by id',
    parser: object({ user_id: int() }),
    callback: async () => {
      callbackRan = true
      return 'ok'
    },
  })

  let guardRan = false
  let callTool = (client as any).callTool.bind(client)
  let result = await callTool({
    create_args: { messages: [] },
    new_responses: [],
    new_messages: [],
    response: {} as any,
    new_message: {} as any,
    tool_call: toolCall('get_user', '{"user_id": "oops"}'),
    guardToolCall: async () => {
      guardRan = true
      return true
    },
  })

  assert.equal(callbackRan, false, 'the callback must not run')
  assert.equal(guardRan, false, 'the guard must not run')
  assert.match(content(result), /invalid tool call arguments/i)
  console.log('✓ a parse failure skips both the guard and the callback')
}

/** the legacy path keeps the original order: guard, then callback */
async function testLegacyGuardOrder() {
  let client = createClient({
    base_url: 'http://127.0.0.1:1/v1',
    api_key: 'test',
    default_model: 'test-model',
  })
  client.addFunction({
    name: 'get_date',
    description: 'Get the current date',
    parameters: { type: 'object', properties: {} },
    callback: async () => 'today',
  })

  let guardArgs: any = undefined
  let callTool = (client as any).callTool.bind(client)
  let result = await callTool({
    create_args: { messages: [] },
    new_responses: [],
    new_messages: [],
    response: {} as any,
    new_message: {} as any,
    tool_call: toolCall('get_date', '{"reasoning": "x"}'),
    guardToolCall: async (args: any) => {
      guardArgs = args
      return true
    },
  })

  assert.equal(content(result), 'today')
  // a function without a parser has no typed arguments
  assert.equal(guardArgs.arguments, undefined)
  console.log('✓ the legacy path keeps guard, then callback')
}

/** a rejected tool call still produces the rejection reason as the result */
async function testGuardRejection() {
  let client = createClient({
    base_url: 'http://127.0.0.1:1/v1',
    api_key: 'test',
    default_model: 'test-model',
  })
  client.addFunction({
    name: 'get_user',
    description: 'Get a user by id',
    parser: object({ user_id: int() }),
    callback: async () => 'ok',
  })

  let callTool = (client as any).callTool.bind(client)
  let result = await callTool({
    create_args: { messages: [] },
    new_responses: [],
    new_messages: [],
    response: {} as any,
    new_message: {} as any,
    tool_call: toolCall('get_user', '{"user_id": 7}'),
    guardToolCall: async () => 'not allowed here',
  })

  assert.match(content(result), /not allowed here/)
  console.log('✓ a rejected tool call reports the reason')
}

async function main() {
  await testSchemaFromParser()
  await testCallbackReceivesParsedArgs()
  await testMissingField()
  await testWrongType()
  await testInvalidJson()
  await testNestedAndArray()
  await testLegacyParametersPath()
  await testGuardReceivesTypedArgs()
  await testParseFailureSkipsGuardAndCallback()
  await testLegacyGuardOrder()
  await testGuardRejection()
  console.log('\nAll tests passed.')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
