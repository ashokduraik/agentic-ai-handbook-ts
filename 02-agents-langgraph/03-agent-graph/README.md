# Post 03 · An LLM agent as a graph (agent ⇄ tools)

*Series: [Lesson 02 — Agents with LangGraph](../README.md) · Post 3 of 8 · about 40 minutes*

> In post 01 you wrote the agent loop as a `for` loop. In post 02 you built a graph with no model. Now put them together: **the same "when is P-001 seeing radiology?" agent, as a two-node graph.**
>
> Why bother, if the `for` loop worked? Because every later post (retries, step limits, memory, human approval, handoffs) plugs into this graph without rewriting the loop.

This is the most important shape in the whole lesson. Almost every production LangGraph agent you will read at work starts as these two nodes and one conditional edge.

---

## The idea, in plain English

### The loop as a graph

Look at post 01's loop again: *decide → (tool calls?) → act → decide again*. Map each part to a graph piece:

| Post 01 loop | Graph piece |
|---|---|
| the `messages` array | **state** (`messages`, with an append reducer) |
| `generateText(...)` | the **`agent` node** (calls the model) |
| `runTool(...)` | the **`tools` node** (runs your code) |
| `if (toolCalls.length === 0) break` | a **conditional edge** after `agent` |
| "go round again" | a normal edge `tools → agent` |

```mermaid
flowchart LR
  S([START]) --> agent
  agent -- "tool calls?  yes" --> tools
  tools --> agent
  agent -- no --> E([END])
```

### Messages as state

The state holds just one field, `messages`, using LangGraph's built-in **`MessagesValue`**. Its reducer **appends** whatever a node returns. So the `agent` node returns `[reply]` and the `tools` node returns `[toolResult]`, and the conversation grows exactly as it did in post 01.

LangGraph uses LangChain's message classes: `HumanMessage` (the user), `SystemMessage` (instructions), `AIMessage` (the model, possibly with `tool_calls`), `ToolMessage` (a tool's result, linked by `tool_call_id`).

### Testing without a model

Model output changes from run to run, so how do you test the graph itself? Swap the model for a **scripted model**: a function that returns fixed `AIMessage`s ("first ask for the tool, then answer"). Now routing, tools and state can be tested deterministically, and model *quality* is checked separately with evals (lesson 05).

### Streaming steps

`graph.stream(..., { streamMode: 'updates' })` yields one event **each time a node finishes**, with that node's update. That is perfect for logs, progress bars in a UI, or watching an agent think.

---

## Let's see it in code

Open [`example.ts`](./example.ts).

> **Course helpers:** this example imports `env`, `section`, `stripThinking` from `@learn/shared`, the small helper package every lesson uses so that no example names a model or provider. `env` gives typed access to the `.env` settings (provider, Ollama URL, model names); `section()` prints a bold heading in the console output; and `stripThinking()` removes a reasoning model's `<think>…</think>` text from a reply. See [the `@learn/shared` guide](../../shared/README.md) for every helper.

### Step 1 — a LangChain tool

```ts
const listAppointments = tool(
  async ({ patientId }) => JSON.stringify(appointments.filter((a) => a.patientId === patientId)),
  {
    name: 'list_appointments',
    description: 'List all appointments for a patient id like P-001. Read-only.',
    schema: z.object({ patientId: z.string() }),
  },
);
```

Same three parts as an AI SDK tool (name and description for the model, a Zod schema, your function), in LangChain's shape. The function returns a string because a `ToolMessage`'s content is text.

### Step 2 — state is just the conversation

```ts
const AgentState = new StateSchema({ messages: MessagesValue });
```

One line. `MessagesValue` is a ready-made `ReducedValue` that appends messages (and can also update a message by id).

### Step 3 — a real model, or a scripted one

```ts
function realModel(): CallModel {
  const llm = new ChatOllama({ model: env.chatModel, baseUrl: env.ollamaBaseUrl, temperature: 0, numPredict: 1024 });
  const withTools = llm.bindTools([listAppointments]); // tell the model which tools exist
  return (messages) => withTools.invoke(messages);
}
```

The model name and URL come from `.env` through `@learn/shared`. `bindTools` sends the tool descriptions with every call. `numPredict: 1024` caps the reply length, because small "thinking" models can otherwise ramble for minutes.

```ts
function scriptedModel(): CallModel {
  return async (messages) => {
    const lastMessage = messages.at(-1);
    if (!ToolMessage.isInstance(lastMessage)) {
      return new AIMessage({ content: '', tool_calls: [{ id: 'call-1', name: 'list_appointments', args: { patientId: 'P-001' } }] });
    }
    return new AIMessage('P-001 has radiology on 2026-11-05 at 14:00.');
  };
}
```

The scripted model has the same signature. If the last message is not a tool result, it asks for the tool; otherwise it answers. `--offline` picks this one.

### Step 4 — the two nodes

```ts
const agent: GraphNode<typeof AgentState> = async (state) => {
  const reply = await callModel([
    new SystemMessage('You help hospital front-desk staff. Use the tools to look things up. Never invent appointments.'),
    ...state.messages,
  ]);
  return { messages: [reply] }; // appended, thanks to MessagesValue
};
```

The `agent` node adds the system instructions in front of the conversation on every call (they are not stored in state), calls the model, and returns its reply.

```ts
const tools: GraphNode<typeof AgentState> = async (state) => {
  const last = state.messages.at(-1) as AIMessage;
  const results: ToolMessage[] = [];
  for (const call of last.tool_calls ?? []) {
    const output = await listAppointments.invoke(call.args as { patientId: string }); // args checked by the tool's schema
    results.push(new ToolMessage({ tool_call_id: call.id!, name: call.name, content: String(output) }));
  }
  return { messages: results };
};
```

The `tools` node reads the tool calls from the model's last message, runs each one, and returns one `ToolMessage` per call, linked by `tool_call_id`. `tool.invoke` validates the arguments against the Zod schema first.

### Step 5 — the loop is two edges

```ts
.addConditionalEdges(
  'agent',
  (state) => {
    const last = state.messages.at(-1);
    return last && AIMessage.isInstance(last) && last.tool_calls?.length ? 'tools' : END;
  },
  ['tools', END],
)
.addEdge('tools', 'agent') // after the tools, the model looks again
```

The router is post 01's `if`: tool calls → `tools`, otherwise `END`. The plain edge `tools → agent` closes the loop.

### Step 6 — stream node-by-node updates

```ts
let firstUpdate = true; // only the first event is dumped in full (the others are one-line summaries)
for await (const update of stream) {
  if (firstUpdate) {
    // The raw event, shown in full ONCE. Notice its shape: { <node name>: <the partial update that node returned> }.
    // The agent node returns an AIMessage (look at `tool_calls`, and `usage_metadata` when live).
    // The later events have the same shape, so below we print one short line per message instead.
    dump('first stream update', update);
    firstUpdate = false;
  }
  for (const [node, delta] of Object.entries(update)) {
    for (const m of (delta as { messages?: BaseMessage[] }).messages ?? []) {
      const calls = AIMessage.isInstance(m) && m.tool_calls?.length ? ` → asks for ${JSON.stringify(m.tool_calls.map((c) => [c.name, c.args]))}` : '';
      // The tools node returns ToolMessages; `tool_call_id` points at the model's call they answer.
      const answers = ToolMessage.isInstance(m) ? ` (answers ${m.tool_call_id})` : '';
      console.log(`[${node}] ${m.getType()}: ${stripThinking(String(m.content)).slice(0, 200)}${calls}${answers}`);
    }
  }
}
```

Each `update` looks like `{ agent: { messages: [...] } }` or `{ tools: { messages: [...] } }`: the node's name and what it returned. The example prints one line per message, and for a `ToolMessage` it adds which call it answers.

The **first** update is also printed raw with the toolkit's `dump()` ([what it is](../../shared/README.md#dumplabel-value--print-the-full-returned-value)). Later updates have the same `{ node: { messages } }` shape, so we only print their one-line summary to keep the output short.

These are LangChain message objects, so the fields have LangChain names (`dump` hides LangChain's internal `lc_*` bookkeeping fields):

| Field | On | What it is |
|---|---|---|
| `content` / `text` | all | The message text. Empty (`''`) when the model only asked for a tool. |
| `contentBlocks` | all | The same content as typed blocks: `text`, `tool_call`, and with a thinking model a `reasoning` block holding its thinking. |
| `tool_calls` | `AIMessage` | `{ name, args, id, type: 'tool_call' }` for each tool the model wants. This is what the router checks. |
| `tool_call_id` | `ToolMessage` | The `id` of the call this result answers. It must match, just like `toolCallId` in post 01. The example prints it as `(answers …)`. |
| `usage_metadata` | `AIMessage` (live) | Tokens: `input_tokens`, `output_tokens`, `total_tokens`. |
| `response_metadata` | `AIMessage` (live) | Ollama's raw details: `model`, `done_reason` (`'stop'`, or `'length'` if it ran out of tokens), and timings in **nanoseconds** (`total_duration`, `eval_duration`). |
| `additional_kwargs.reasoning_content` | `AIMessage` (live) | The thinking again, as a plain string; `dump` shows a note instead of printing it twice. |
| `id` | all | A random id for the message. Yours will differ. |

---

## Run it

From the lesson folder:

```bash
npm run post:03:offline   # scripted model: always the same output
npm run post:03           # your CHAT_MODEL through Ollama
# or: npx tsx 03-agent-graph/example.ts [--offline]
```

### What you should see

The first update dumped in full, then one summary line for every message. The summaries, in order:

```
[agent] ai:  → asks for [["list_appointments",{"patientId":"P-001"}]]
[tools] tool: [{"id":"A-100",...},{"id":"A-101",...,"dept":"radiology","when":"2026-11-05 14:00"}] (answers call-1)
[agent] ai: P-001 has radiology on 2026-11-05 at 14:00.
```

This is the offline run (the scripted model), which always looks like this. A live run has the same three lines, except that the call id after `answers` is made up by the model's provider, and the wording of the last line is the model's own (for example *"Patient P-001 is seeing radiology on 2026-11-05 14:00."*).

The offline run in full (trimmed at `…`; only the message `id`s will differ on your machine):

```
── Node-by-node updates ────────────────────────────────────────
▼ first stream update
{
  agent: {
    messages: [
      AIMessage {
        contentBlocks: [
          { type: 'text', text: '' },
          {
            type: 'tool_call',
            id: 'call-1',
            name: 'list_appointments',
            args: { patientId: 'P-001' }
          }
        ],
        text: '',
        id: '224afe18-7f68-43e2-b9a4-c02040626029',
        content: '',
        additional_kwargs: {},
        response_metadata: {},
        type: 'ai',
        tool_calls: [ { id: 'call-1', name: 'list_appointments', args: { patientId: 'P-001' } } ],
        invalid_tool_calls: []
      }
    ]
  }
}
  (hidden for readability: agent.messages[].lc_* — set SHOW_RAW=1 to print everything)
[agent] ai:  → asks for [["list_appointments",{"patientId":"P-001"}]]
[tools] tool: [{"id":"A-100",...},{"id":"A-101",...,"dept":"radiology","when":"2026-11-05 14:00"}] (answers call-1)
[agent] ai: P-001 has radiology on 2026-11-05 at 14:00.
```

With a live `qwen3:0.6b` the first `AIMessage` also carries the model's thinking and its token counts (trimmed):

```
      AIMessage {
        contentBlocks: [
          {
            type: 'reasoning',
            reasoning: 'Okay, the user is asking when patient P-001 is seeing radiology. Let me check the tools available. …'
          },
          {
            type: 'tool_call',
            id: 'a2567d21-08e0-45e4-b97b-21f2a8771d78',
            name: 'list_appointments',
            args: { patientId: 'P-001' }
          }
        ],
        …
        response_metadata: {
          model_provider: 'ollama',
          model: 'qwen3:0.6b',
          created_at: '2026-10-24T15:23:21.837933739Z',
          done: true,
          done_reason: 'stop',
          total_duration: 3961307983,
          …
          prompt_eval_count: 176,
          …
          eval_count: 269,
          eval_duration: 3815703000
        },
        type: 'ai',
        tool_calls: [
          {
            name: 'list_appointments',
            args: { patientId: 'P-001' },
            id: 'a2567d21-08e0-45e4-b97b-21f2a8771d78',
            type: 'tool_call'
          }
        ],
        invalid_tool_calls: [],
        usage_metadata: {
          input_tokens: 176,
          output_tokens: 269,
          total_tokens: 445,
          …
        }
      }
```

269 output tokens just to ask for one tool: almost all of it is thinking. Your ids, timings and token counts will differ.

## Common gotchas

- ❌ **Putting the system prompt into state.** It then gets saved in every checkpoint and is hard to change. Add it inside the `agent` node.
- ❌ **Forgetting `tool_call_id`.** Every `ToolMessage` must point at the call it answers, or the next model call fails.
- ❌ **Testing the graph only with a live model.** A scripted model makes routing bugs show up every time instead of "sometimes".
- ✅ This folder uses `ChatOllama`. For Azure or Bedrock, swap in `AzureChatOpenAI` or `ChatBedrockConverse`; nodes and edges stay the same.
- ✅ LangGraph also ships a prebuilt `ToolNode` and `createReactAgent`. Use them once you understand what they do; this post builds them by hand so you do.

## Try it yourself

1. Add a second tool, `get_department_phone({ dept })`, bind it, and dispatch by `call.name` in the `tools` node.
2. Change the scripted model so it asks for **two** tools in one message. Does the `tools` node handle both?
3. Try `streamMode: 'values'` instead of `'updates'`. What is different about each event?

## Key takeaways

- An agent graph = **`agent` node** (model) + **`tools` node** (your code) + a **conditional edge** + an edge back.
- `MessagesValue` makes the conversation the state and appends to it.
- A **scripted model** lets you test the graph with no LLM.
- `streamMode: 'updates'` shows each node's work as it happens.

---

[← Previous: State graphs](../02-state-graphs/README.md) · [📚 Series index](../README.md) · [Next: Retries and failure recovery →](../04-retries-and-recovery/README.md)
