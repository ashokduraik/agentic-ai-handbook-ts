# Post 09 · CI with an eval gate: fail the build when answers get worse

*Series: [Lesson 09 — Deployment](../README.md) · Post 9 of 9 · about 30 minutes*

> A colleague shortens the system instructions "to save tokens". Every test passes: types are fine, the HTTP layer works. In production, the assistant stops admitting when it doesn't know, and starts inventing deposit amounts. Nothing failed, because nothing measured quality.

---

## The idea, in plain English

**CI** (continuous integration) runs checks on every push and pull request. Normal checks (types, unit tests) catch *broken* code. LLM apps also need to catch *worse* answers. That's an **eval gate**: run a set of known questions (lesson 05), compute a score, and **fail the build** if it's below a threshold.

This repo's workflow, [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml), has three jobs:

1. **checks**, on every push, with no model: `npm ci`, typecheck, every `test:offline` (including post 06's smoke test) and `kubeconform` on the manifests.
2. **evals**, only once you set the repository variables `CI_CHAT_MODEL` and `CI_EMBED_MODEL`: it starts Ollama as a service container, pulls those models, and runs lesson 05's `evals:fast` as the **hard gate**. promptfoo runs too, as a report that doesn't fail the build (yet).
3. **image**: builds the Docker image (post 07). It doesn't push it anywhere until you add a registry login.

How does a script "fail the build"? Its **exit code**. 0 means success; anything else marks the job red, and the pull request shows a ❌.

Pick the threshold from a baseline (run the suite a few times on `main`), not a guess, and keep the CI models small: GitHub's runners have no GPU.

---

## Let's see it in code

### Step 1 — the gated job

*About the imports:* the example uses helpers from `@learn/shared`, the course's small helper package. `optional(name, default)` reads an optional setting from the environment and `section()` prints a bold heading in the output. [More about these helpers](../../shared/README.md).

```yaml
  evals:
    needs: checks
    if: vars.CI_CHAT_MODEL != '' && vars.CI_EMBED_MODEL != ''
```

```yaml
    services:
      ollama:
        image: ollama/ollama:0.40.8
        ports: ["11434:11434"]
```

```yaml
      - name: RAG evals (quality gate)
        run: npm run evals:fast -w 05-evals # exits 1 when overall score < EVAL_THRESHOLD
```

### Step 2 — a miniature gate

[`example.ts`](./example.ts) does what `evals:fast` does, in 50 lines, against post 06's `ask()`:

```ts
// 1. Cases: a question and what a correct answer must contain (or must admit not knowing).
const cases = [
  { question: 'How much is the deposit after three no-shows?', mustContain: /100/ },
  { question: 'How long does a refill approval take?', mustContain: /2 working days|two working days/i },
  { question: 'Do you offer dental implants?', unanswerable: true },
];
```

```ts
  const ok = c.unanswerable ? !r.answerable : r.answerable && r.citationsValid && c.mustContain!.test(r.answer);
```

### Step 3 — the exit code is the gate

```ts
// 3. The gate. In CI a non-zero exit code fails the job, and the pull request shows a red ❌.
const score = passed / cases.length;
const threshold = Number(optional('EVAL_THRESHOLD', '0.6'));
```

```ts
process.exit(score >= threshold ? 0 : 1);
```

---

## Run it

From the lesson folder (`09-deployment/`):

```bash
npm run post:09:offline                                  # a fake that gets 2 of 3 right → PASS
EVAL_THRESHOLD=0.9 npx tsx 09-ci-eval-gate/example.ts --offline; echo "exit $?"   # → FAIL, exit 1
npm run post:09                                          # the real pipeline
```

To turn on the real gate on GitHub: *Settings → Secrets and variables → Actions → Variables*, add `CI_CHAT_MODEL` and `CI_EMBED_MODEL` (small models), and optionally `EVAL_THRESHOLD`.

### What you should see

Offline: `score 0.67  threshold 0.6 → PASS ✅`, and with `EVAL_THRESHOLD=0.9`: `FAIL ❌ (exit code 1)`.

Live on the box: the deposit (`"100"`) and refill (`"2 working days"`) cases passed. The dental-implants case **failed**: the model marked it answerable with the answer `"false"`. Score 0.67, so the gate passed at 0.6; a stricter threshold would have caught it. That's what the gate is for.

The GitHub workflow itself was not run by the course author (only its files and commands were checked).

## Common gotchas

- ❌ **A threshold picked by feel.** Measure a baseline; small models are noisy, so leave a margin.
- ❌ **Three cases.** Fine for a demo; a real gate needs dozens, including "should refuse" cases.
- ❌ **Gating on promptfoo (or an LLM judge) from day one** with a tiny CI model: flaky builds teach people to ignore red. Start it as a report (`continue-on-error: true`), then promote it.
- ❌ **Secrets in workflow files.** Use repository variables and secrets.
- ✅ Cheap checks first (`checks` job), slow evals only after they pass (`needs: checks`).

## Try it yourself

1. **The map's exercise:** set the two CI variables on your fork, change lesson 04's instructions to "Always give a confident answer", push, and watch `evals:fast` fail.
2. Add five cases to the mini gate, including two that should be refused. What's the box model's score?
3. Change the `image` job to push to GitHub Container Registry with a SHA tag (needs `packages: write` permission and a login step).

## Key takeaways

- An **eval gate** turns "answers got worse" into a red build.
- The gate is just a script with an **exit code**: score ≥ threshold → 0, else 1.
- This repo's CI: offline **checks** always; **evals** once you set the model variables; **image** build on every push.

---

[← Previous: Kubernetes](../08-kubernetes/README.md) · [📚 Series index](../README.md) · [Next: Lesson 10 — Capstone →](../../10-capstone/README.md)
