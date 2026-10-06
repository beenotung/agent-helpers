# Reasoning end callbacks not firing

Fixed in `019dedc`. The streamed per-part `*End` callbacks were silently skipped
whenever another part followed, so `onReasoningContentEnd` never fired for a
typical reasoning-then-content response.

## Symptom

Event order observed before the fix:

```
reasoningStart -> partEnd:reasoning -> contentStart -> ... -> partEnd:content
```

`onReasoningContentEnd` was never called. Only the generic `onPartEnd` fired.

## Cause

There were two separate mechanisms for closing a part:

- `startPart()` fired the generic `onPartEnd` for the previous part
- `flushPart()` fired the typed callbacks (`onReasoningContentEnd`, `onContentEnd`,
  …) — but it only ran **at stream end**, and it read the mutable `last_part`

By the time the stream ended, `last_part` had already moved on to the next part,
so the `last_part === 'reasoning'` check could never match. The typed end event
for any part that was followed by another part was lost.

## Fix

One function closes a part, and it runs on transition as well as at stream end:

```ts
async function endPart(context, part) {
  // typed callback first (e.g. onContentEnd), then generic onPartEnd
  ...
}

async function startPart(context, part) {
  if (last_part) await endPart(context, last_part)   // close the previous part
  await onPartStart?.(...)
  last_part = part
}

async function flushPart(context) {
  if (last_part) {
    await endPart(context, last_part)   // close the open part at stream end
    last_part = undefined
  }
}
```

Two details that matter:

- **`endPart` takes the part as an argument.** Passing the value rather than
  reading the mutable `last_part` is what makes it correct — it closes the part
  that actually ended, regardless of later reassignment.
- **`last_part` is reset once closed**, so a part is not reported twice, and the
  trailing "close any part left open" block cannot double-fire.

Event order after the fix (verified against a live provider):

```
partStart:reasoning -> reasoningStart -> partEnd:reasoning -> reasoningEnd
  -> partStart:content -> contentStart -> contentEnd -> finish -> partEnd:content
```

The typed callback now fires **before** the generic `onPartEnd`, matching the
event list documented on `CompleteStreamLoopEventListeners`.

## Notes

- `onContentEnd` fires **once per response**, not once per `streamWithTools` call:
  the tool loop runs one stream per iteration, and each closes its own part.
- The tool-call path was checked separately: `onToolCallsStart`, `onToolCallEnd`
  and `onToolCallsEnd` each fire once.
- The refusal path (`onRefusalEnd`) uses the same code shape but has **not** been
  tested — no provider was found that streams `delta.refusal`.
