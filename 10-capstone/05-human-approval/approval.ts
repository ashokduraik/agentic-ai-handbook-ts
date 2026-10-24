/** Human-in-the-loop for writes: every tool that is not read-only needs a "yes" first. */

// 1. The server's annotations tell us which tools write. Anything not marked read-only counts as a write.
export function writeToolsOf(tools: { name: string; annotations?: { readOnlyHint?: boolean } }[]): string[] {
  return tools.filter((t) => !t.annotations?.readOnlyHint).map((t) => t.name);
}

// 2. The approval decision per write tool, in the shape generateText's `toolApproval` option takes.
//    Here the "human" is the --approve flag, decided before the run. In a real app you'd return
//    'user-approval', show the pending request in the UI, and continue after a person clicks Approve.
export function approvalPolicy(writeTools: string[], approveWrites: boolean) {
  return Object.fromEntries(
    writeTools.map((n) => [n, approveWrites ? ('approved' as const) : { type: 'denied' as const, reason: 'needs human approval' }]),
  );
}
