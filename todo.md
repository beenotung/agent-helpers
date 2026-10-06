overall plan

- [ ] tool call loop
  - [x] basic loop until no more tool call is needed
  - [ ] support early terminate in the tool call loops
  - [ ] support count based guard
  - [ ] include total usage in the loop result
- [ ] context compaction
- [ ] cast.ts integration
- [ ] mc question answer loop
- [ ] json answer loop (via tool call?)
- [ ] free-text question answer loop
- [ ] terminate condition loop
  - [ ] callback to check terminate condition
  - [ ] loop until the terminate condition is met
- [ ] multi-step flow / todo list
- [ ] sub-agent flow
- [ ] detect repeated response in loop
  - [ ] detect repeating pattern in single response
  - [ ] detect repeating pattern in recent responses
  - [ ] callback to determine to terminate or inject new message

---

support early terminate in the tool call loops

implement either one below, or maybe both?

- [ ] implement AbortSignal for the complete with tools loop
- [ ] implement early return in event handler

---

add count based helper tool call guard, not just alwaysAllow / alwaysReject

- [ ] support a count based guard
  - [ ] by total number of tool call
  - [ ] by total number of new messages
  - [ ] by context size (more complex, lower priority)

---

include total usage in the loop result

- [ ] sum `usage` across every response in the loop, like the SDK runner's `totalUsage()`

---

context compaction

take reference on opencode codebase for compaction design

- [ ] helper functions to compact context
  - [ ] summarize the context
    - [ ] custom compaction prompt
    - [ ] custom number of messages to keep
  - [ ] skip the old messages from the loop
- [ ] keep a list of compaction in result
- [ ] emit the compaction event via callback

---

cast.ts integration

- [ ] accept cast.ts parser when register function
- [ ] use the inferred json schema in tool call definition
- [ ] auto parse before calling the function, and pass validation error if any to LLM as tool call result
- [ ] parse before `guardToolCall`, so the guard can inspect typed fields instead of the raw JSON string
  - i.e. order is: parse -> guard -> call
  - today the guard gets `tool_call.function.arguments` as a raw JSON string

---

mc question answer loop

- [ ] use it as tool call or direction text response
- [ ] auto feedback to the LLM if the response is invalid
- [ ] avoid endless loop if the LLM keep failed for producing valid response

---

terminate condition loop

- [ ] callback to check terminate condition
- [ ] loop until the terminate condition is met
  - [ ] callback of custom logics
  - [ ] count based guard
- [ ] generalize for other loops
  - [ ] mc
  - [ ] question answer
  - [ ] json answer
  - [ ] tool call loop
  - [ ] custom termination condition

---

## done

Fixes that need more explanation than the commit diff gives are written up in
[tasks/done/](./tasks/done/).
