# Post 05 · Step limits: stopping a runaway agent

*Series: [Lesson 02 — Agents with LangGraph](../README.md) · Post 5 of 8 · about 20 minutes*

> *"Find me a cardiology slot this week."* The tool says *"No free slots this week."* The model, determined to help, asks again. And again. And again.
>
> Every round trip costs tokens and time, and the user is still waiting. Without a limit this runs until something times out, or until your monthly bill arrives.

In [post 01](../01-what-is-an-agent/README.md) the safety net was `MAX_STEPS` in a `for` loop. In lesson 01 it was `stopWhen: stepCountIs(5)`. In LangGraph it is called **`recursionLimit`**, and this post shows how to set it and what to do when it trips.

---

## The idea, in plain English

### What LangGraph counts

LangGraph runs a graph in **super-steps**. In a simple graph like ours, each node run is one super-step: `agent` (1), `tools` (2), `agent` (3), `tools` (4)… When the count goes past **`recursionLimit`**, LangGraph stops the run and throws a **`GraphRecursionError`**.

```
agent → tools → agent → tools → agent → tools → (7th step would exceed recursionLimit: 6) ⛔ GraphRecursionError
```

So a limit of 6 allows about **3 model calls** in an `agent ⇄ tools` loop. The default limit is 25, which is often far more model calls than a front-desk question deserves.

### Where the limit lives

The limit is set **per run**, in the config of `invoke` or `stream`:

```
graph.invoke(input, { recursionLimit: 6 })
```

That's useful: a quick lookup can get a small limit, a long research task a bigger one, with the same graph.

### When it trips

Hitting the limit is not a crash to show the user. It means *"the agent could not finish"*. Catch `GraphRecursionError` and:

- reply honestly ("I could not finish this; a staff member will follow up"),
- **log it**, because a loop is a bug (unclear tool result, bad prompt, weak model) worth looking at.

---

## Let's see it in code

Open [`example.ts`](./example.ts). The "model" is a deliberately stuck function, so the loop is guaranteed.

> **Course helpers:** this example imports `section` from `@learn/shared`, the small helper package every lesson uses so that no example names a model or provider. `section()` prints a bold heading in the console output. See [the `@learn/shared` guide](../../shared/README.md) for every helper.

### Step 1 — a model that never stops asking

```ts
const agent: GraphNode<typeof AgentState> = async () => {
  modelCalls++;
  console.log(`  agent step ${modelCalls}: asks for search_slots(cardiology) again`);
  return {
    messages: [new AIMessage({ content: '', tool_calls: [{ id: `c${modelCalls}`, name: 'search_slots', args: { dept: 'cardiology' } }] })],
  };
};
```

Every time it runs, it asks for the same tool. Real models do this too when a tool result doesn't tell them what to do next.

### Step 2 — the same agent ⇄ tools graph as post 03

```ts
.addConditionalEdges('agent', (s) => ((s.messages.at(-1) as AIMessage).tool_calls?.length ? 'tools' : END), ['tools', END])
.addEdge('tools', 'agent')
```

Nothing in the graph itself prevents the loop. The limit is a **run-time** setting.

### Step 3 — set the limit, catch the error

```ts
try {
  await graph.invoke(
    { messages: [new HumanMessage('Find me a cardiology slot this week.')] },
    { recursionLimit: 6 }, // at most 6 node runs (agent + tools each count), then stop
  );
} catch (e) {
  if (e instanceof GraphRecursionError) {
```

`GraphRecursionError` is exported from `@langchain/langgraph`, so you can tell it apart from other errors.

```ts
console.log(`\n⛔ Stopped after ${modelCalls} model calls: ${e.name}`);
console.log('Reply to user: "Sorry, I could not finish this request. A staff member will follow up."');
```

The user gets an honest message; you get a log line.

---

## Run it

From the lesson folder (no model needed):

```bash
npm run post:05
# or: npx tsx 05-step-limits/example.ts
```

### What you should see

```
  agent step 1: asks for search_slots(cardiology) again
  agent step 2: asks for search_slots(cardiology) again
  agent step 3: asks for search_slots(cardiology) again

⛔ Stopped after 3 model calls: GraphRecursionError
Reply to user: "Sorry, I could not finish this request. A staff member will follow up."
```

Three model calls for a limit of 6, because each `tools` run counts too.

## Common gotchas

- ❌ **Relying on the default (25).** Pick a limit per use case, close to what a good run needs plus a little headroom.
- ❌ **Letting `GraphRecursionError` reach the user** as a stack trace.
- ❌ **Raising the limit to "fix" a loop.** Fix the cause: a clearer tool result ("No free slots this week. Do not search again; offer the waiting list."), a better prompt, or a stronger model.
- ✅ Put the limit next to the thread id in your run config (post 07 does: `recursionLimit: 20`).
- ✅ The same idea in other tools: `stopWhen: stepCountIs(n)` in the AI SDK, `MAX_STEPS` in a hand-written loop.

## Try it yourself

1. Change the limit to 2, then to 3. How many model calls happen each time?
2. Make the stuck model give up on its 4th call (return `new AIMessage('No slots available this week.')`). Which limit is the smallest that lets it finish?
3. Wrap the stuck example in a `stream(..., { streamMode: 'updates', recursionLimit: 6 })` loop. When exactly does the error arrive?

## Key takeaways

- LangGraph counts node runs (super-steps); **`recursionLimit`** caps them **per run**.
- Going past it throws **`GraphRecursionError`**: catch it, reply honestly, and log it.
- In an `agent ⇄ tools` loop, a limit of N allows about N/2 model calls.
- A tripped limit is a symptom; fix the loop's cause rather than raising the limit.

---

[← Previous: Retries and failure recovery](../04-retries-and-recovery/README.md) · [📚 Series index](../README.md) · [Next: Checkpoints, threads and memory →](../06-checkpoints-and-memory/README.md)
