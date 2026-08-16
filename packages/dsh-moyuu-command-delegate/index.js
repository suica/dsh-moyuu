/**
 * dsh-moyuu-command-delegate
 *
 * Expose the subagent / workflow / ralph delegation tools as explicit slash
 * commands: `/subagent <prompt>`, `/workflow <script>`, `/ralph <objective>`.
 *
 * Design: each command is "steered through the receiving agent's model-visible
 * path" — it injects an explicit, user-role instruction into the receiving
 * agent's next step telling the model to run the corresponding delegation tool
 * with the exact argument. The command handler returns immediately; the real
 * work happens as a normal model tool call (with its own tool card, approval,
 * and background handling).
 *
 * Why steering instead of direct engine calls:
 *   - `subagents` is a global host service, but `workflowEngine` is mounted
 *     inside the agent preset's `delegation` group as an ISOLATE realm. A plain
 *     plugin row mounted by a preset (or a dynamic plugin on the host root)
 *     cannot resolve `workflowEngine`, so `/workflow` cannot call the engine
 *     directly without being composed inside that group.
 *   - Steering therefore keeps this package self-contained and preset-agnostic:
 *     it works wherever the `commands` service exists.
 *
 * Known limitations (see PR / README):
 *   - The instruction (including a pasted workflow script) appears as a
 *     user-visible message in the conversation, then the model must actually
 *     invoke the tool — non-deterministic.
 *   - A pasted `/workflow` script is placed verbatim into the steering message,
 *     so a very large script inflates the model context.
 *   - `/ralph` with many rounds blocks a long foreground loop once the model
 *     runs the tool.
 */
import { createUserMessage } from "@deepseek-ai/dsh-llm";

/** Build one user-role steering message carrying an explicit tool instruction. */
function steerInstruction(agent, text) {
  agent.steer(createUserMessage({
    content: [{ type: "text", text }],
    source: { kind: "user" }
  }));
}

function usageError(usage) {
  return { kind: "error", text: usage };
}

const COMMANDS = [
  {
    name: "subagent",
    description: "Delegate a standalone task to a subagent",
    hint: "<prompt>",
    usage: "Usage: /subagent <prompt>\nGive the subagent a complete, standalone task prompt.",
    ack: "Subagent delegated to the model — it will run the `subagent` tool with your prompt.",
    build(raw) {
      const prompt = raw.trim();
      if (prompt.length === 0) return { error: this.usage };
      return {
        text: [
          "The user invoked the /subagent command with a standalone task.",
          "Run the `subagent` tool now with exactly this prompt — do not modify, summarize, or restate it:",
          "",
          prompt
        ].join("\n")
      };
    }
  },
  {
    name: "workflow",
    description: "Run a workflow orchestration script",
    hint: "<script>",
    usage: "Usage: /workflow <script>\nPass the plain-JS workflow script body (the same `script` argument the workflow tool takes), ending with `return <json-value>`.",
    ack: "Workflow handed to the model — it will run the `workflow` tool with your script. Watch the tool card in the conversation.",
    build(raw) {
      const script = raw.replace(/^\s+/, "");
      if (script.length === 0) return { error: this.usage };
      return {
        text: [
          "The user invoked the /workflow command with a complete workflow script.",
          "Run the `workflow` tool now with exactly this script — do not modify, summarize, or restate it — and with meta { name: \"workflow-command\", description: \"Workflow run from the /workflow command\" }:",
          "",
          script
        ].join("\n")
      };
    }
  },
  {
    name: "ralph",
    description: "Run a foreground fresh-agent Ralph loop toward an objective",
    hint: "<objective> [maxRounds]",
    usage: "Usage: /ralph <objective> [maxRounds]\nThe objective is the immutable completion goal for every fresh Ralph round.",
    ack: "Ralph delegated to the model — it will run the `ralph` tool with your objective.",
    build(raw) {
      const input = raw.trim();
      const trailing = /^([\s\S]+?)\s+(\d{1,10})$/.exec(input);
      let objective = input;
      let maxRounds;
      if (trailing !== null) {
        const n = Number(trailing[2]);
        if (Number.isSafeInteger(n) && n >= 1) {
          objective = trailing[1].trim();
          maxRounds = n;
        }
      }
      if (objective.length === 0) return { error: this.usage };
      const rounds = maxRounds === undefined ? "" : "\n\n(maxRounds: " + maxRounds + " — pass it to the ralph tool as the optional round cap.)";
      return {
        text: [
          "The user invoked the /ralph command with an immutable objective.",
          "Run the `ralph` tool now with exactly this objective — do not modify, summarize, or restate it:" + rounds,
          "",
          objective
        ].join("\n")
      };
    }
  }
];

export default {
  inject: ["commands"],
  apply(ctx) {
    for (const definition of COMMANDS) {
      ctx.commands.register({
        name: definition.name,
        description: definition.description,
        input: { hint: definition.hint },
        handler: (invocation) => {
          const built = definition.build(invocation.rawInput);
          if (built.error !== undefined) return usageError(built.error);
          try {
            steerInstruction(invocation.agent, built.text);
            return { kind: "success", text: definition.ack };
          } catch (error) {
            return {
              kind: "error",
              text: definition.name + " command failed to queue: " + (error instanceof Error ? error.message : String(error))
            };
          }
        }
      });
    }
  }
};
