/**
 * Post 06 — Checkpoints, threads and memory   (read the blog post first: 06-checkpoints-and-memory/README.md)
 *
 * A CHECKPOINTER saves the graph's state after every step, under a THREAD id.
 * Invoke again with the same thread_id and the graph continues from the saved state.
 *
 *   A. MemorySaver: memory per thread (in RAM; gone when the process ends)
 *   B. SqliteSaver: the same, but in a file, so a NEW process (or a new saver) can pick it up
 *   C. (live) A chat model that "remembers" an earlier turn — only because of the checkpointer
 *
 * Run:  npx tsx 06-checkpoints-and-memory/example.ts            (A + B + C; C uses CHAT_MODEL)
 *       npx tsx 06-checkpoints-and-memory/example.ts --offline  (A + B only)
 */
import { mkdirSync, rmSync } from 'node:fs';
import { StateGraph, StateSchema, MessagesValue, MemorySaver, START, END, type GraphNode, type BaseCheckpointSaver } from '@langchain/langgraph';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import { HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';
import { ChatOllama } from '@langchain/ollama';
import { env, section, stripThinking } from '@learn/shared';

// ---------------------------------------------------------------------------
// A one-node graph that just records each message (so A and B need no model)
// ---------------------------------------------------------------------------
const NotesState = new StateSchema({ messages: MessagesValue });
const record: GraphNode<typeof NotesState> = async () => ({}); // nothing to add; the input message is already in state

function buildNotesGraph(checkpointer: BaseCheckpointSaver) {
  return new StateGraph(NotesState).addNode('record', record).addEdge(START, 'record').addEdge('record', END).compile({ checkpointer });
}
const note = (text: string) => ({ messages: [new HumanMessage(text)] });

// ---------------------------------------------------------------------------
// A. MemorySaver: one memory per thread_id
// ---------------------------------------------------------------------------
section('A. MemorySaver — same thread continues, other thread starts empty');
const notes = buildNotesGraph(new MemorySaver());
const bed4 = { configurable: { thread_id: 'ward-3-bed-4' } };
const bed7 = { configurable: { thread_id: 'ward-3-bed-7' } };

await notes.invoke(note('08:00 BP 150/95, gave amlodipine.'), bed4);
await notes.invoke(note('12:00 BP 135/85, patient comfortable.'), bed4); // same thread → added to the first
await notes.invoke(note('09:00 Admitted with fever.'), bed7); // different thread → separate memory

for (const [name, cfg] of [['bed 4', bed4], ['bed 7', bed7]] as const) {
  const { values } = await notes.getState(cfg); // read the latest checkpoint of a thread
  console.log(`${name}:`, values.messages.map((m: BaseMessage) => String(m.content)));
}

// Every step left a checkpoint behind: that is the thread's history (for audit, debugging, "time travel").
let n = 0;
for await (const snapshot of notes.getStateHistory(bed4)) {
  console.log(`  checkpoint ${++n}: ${snapshot.values.messages?.length ?? 0} message(s), next = [${snapshot.next.join(', ')}]`);
}

// ---------------------------------------------------------------------------
// B. SqliteSaver: memory that survives a restart
// ---------------------------------------------------------------------------
section('B. SqliteSaver — state in a file, read back by a brand-new saver');
const dbPath = new URL('../data/notes.db', import.meta.url).pathname;
mkdirSync(new URL('../data', import.meta.url), { recursive: true });
rmSync(dbPath, { force: true }); // fresh demo each run

const before = buildNotesGraph(SqliteSaver.fromConnString(dbPath));
await before.invoke(note('22:00 Night shift: patient asleep, pain 2/10.'), bed4);

// Pretend the server restarted: a NEW saver, a NEW graph object, same file, same thread id.
const after = buildNotesGraph(SqliteSaver.fromConnString(dbPath));
await after.invoke(note('06:00 Morning: asked for breakfast.'), bed4);
console.log('bed 4 after "restart":', (await after.getState(bed4)).values.messages.map((m: BaseMessage) => String(m.content)));

if (process.argv.includes('--offline')) process.exit(0);

// ---------------------------------------------------------------------------
// C. (live) Conversation memory for a chat model
// ---------------------------------------------------------------------------
section('C. A chat model remembers earlier turns — on the same thread only');
const llm = new ChatOllama({ model: env.chatModel, baseUrl: env.ollamaBaseUrl, temperature: 0, numPredict: 512 });
const chat: GraphNode<typeof NotesState> = async (state) => ({
  messages: [await llm.invoke([new SystemMessage('You are a ward assistant. Answer in one short sentence.'), ...state.messages])],
});
const chatGraph = new StateGraph(NotesState).addNode('chat', chat).addEdge(START, 'chat').addEdge('chat', END).compile({ checkpointer: new MemorySaver() });

const t1 = { configurable: { thread_id: 'nurse-chat-1' } };
const t2 = { configurable: { thread_id: 'nurse-chat-2' } };
await chatGraph.invoke(note('The patient in bed 4 is Rahul Menon. He is allergic to penicillin.'), t1);
const same = await chatGraph.invoke(note('What is the patient in bed 4 allergic to?'), t1);
const other = await chatGraph.invoke(note('What is the patient in bed 4 allergic to?'), t2);
console.log('same thread :', stripThinking(String(same.messages.at(-1)?.content)));
console.log('new thread  :', stripThinking(String(other.messages.at(-1)?.content)), '  ← it has never heard of bed 4');
