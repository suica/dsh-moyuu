# dsh-moyuu-command-delegate

**Feature: expose the `subagent` / `workflow` / `ralph` delegation tools as explicit slash commands** — `/subagent <prompt>`, `/workflow <script>`, `/ralph <objective> [maxRounds]`.

Each command is **steered through the receiving agent's model-visible path**: the handler injects an explicit user-role instruction into the agent's next step telling the model to run the corresponding delegation tool with the exact argument, then returns immediately. The real work happens as a normal model tool call (own tool card, approval, background handling).

## Why steering instead of direct engine calls

`subagents` is a global host service, but `workflowEngine` is mounted inside the agent preset's `delegation` group as an **isolate realm**. A plugin row mounted by a plain preset — or a dynamic plugin on the host root — cannot resolve `workflowEngine`, so `/workflow` cannot call the engine directly unless the plugin is composed inside that group. Steering keeps this package self-contained and preset-agnostic: it works anywhere the `commands` service exists.

## Install / activate

Add the package to a profile's dependencies and activate it as a server plugin row (see `docs/PLUGIN-PACKAGE-RULES.zh.md`):

```yaml
- insert:
    - id: dsh-moyuu-command-delegate
      name: 'dsh-moyuu-command-delegate'
```

## Known limitations / bugs (WIP — do not merge)

This package is a work-in-progress. The following issues are known:

1. **Steering dumps the instruction as a user-visible message.** The injected instruction — including a pasted `/workflow` script — appears verbatim in the conversation as a user message. The model must then actually invoke the tool; nothing guarantees it does.
2. **Non-deterministic execution.** The command does not run the engine itself; it relies on the model choosing to call the tool. A model may paraphrase, decline, or restate the request.
3. **`/workflow` cannot reach the workflow engine directly.** Because `workflowEngine` is agent-isolated, this package can only *ask the model* to run the `workflow` tool. Direct execution requires composing the plugin inside the agent preset's `delegation` group (`isolate: { workflowEngine: true }`), which is deployment-specific and out of scope for a plain preset package.
4. **Long foreground runs.** Once the model runs `/ralph` (or a large `/workflow`), the loop/script blocks for a potentially long time with no intermediate feedback from the command itself.
5. **Not yet end-to-end validated in a live session.** The package's composition mounts cleanly, but the commands have not been confirmed against a real agent session.

## License

MIT
