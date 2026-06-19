import {
  BUILTIN_TOOL_CATEGORY,
  type PermissionMode,
  type PolicyDecision,
  type ToolCategory,
} from '@maka/core/permission';
import type { MakaTool } from './tool-runtime.js';

export const LOCAL_READ_AGENT_ID = 'local-read';
export const LOCAL_READ_AGENT_PROFILE = 'local_read';

export interface AgentDefinition {
  id: string;
  profile: string;
  name: string;
  description: string;
  permissionMode: PermissionMode;
  tools: readonly string[];
  categoryPolicy: Readonly<Partial<Record<ToolCategory, PolicyDecision>>>;
  systemPrompt: string;
}

export interface AgentDefinitionListItem {
  id: string;
  profile: string;
  name: string;
  description: string;
  permissionMode: PermissionMode;
  tools: string[];
}

export const LOCAL_READ_AGENT_DEFINITION: AgentDefinition = {
  id: LOCAL_READ_AGENT_ID,
  profile: LOCAL_READ_AGENT_PROFILE,
  name: 'Local Read',
  description: 'Read-only repository exploration with file and text search tools only.',
  permissionMode: 'explore',
  tools: ['Read', 'Glob', 'Grep'],
  categoryPolicy: {
    read: 'allow',
  },
  systemPrompt: [
    'You are a foreground local-read child agent.',
    'Use only the provided Read, Glob, and Grep tools.',
    'Do not use shell, web, browser, write, or nested agent tools.',
    'Return a concise answer with concrete file or symbol evidence.',
  ].join('\n'),
};

export const BUILTIN_AGENT_DEFINITIONS: readonly AgentDefinition[] = [
  LOCAL_READ_AGENT_DEFINITION,
];

const modeRank: Record<PermissionMode, number> = {
  explore: 0,
  ask: 1,
  execute: 2,
};

export function listBuiltinAgentDefinitions(): AgentDefinitionListItem[] {
  return BUILTIN_AGENT_DEFINITIONS.map((definition) => ({
    id: definition.id,
    profile: definition.profile,
    name: definition.name,
    description: definition.description,
    permissionMode: definition.permissionMode,
    tools: [...definition.tools],
  }));
}

export function getBuiltinAgentDefinition(id: string): AgentDefinition | undefined {
  return BUILTIN_AGENT_DEFINITIONS.find((definition) => definition.id === id);
}

export function getBuiltinAgentDefinitionByProfile(profile: string): AgentDefinition | undefined {
  return BUILTIN_AGENT_DEFINITIONS.find((definition) => definition.profile === profile);
}

export function requireBuiltinAgentDefinition(id: string): AgentDefinition {
  const definition = getBuiltinAgentDefinition(id);
  if (!definition) {
    const available = BUILTIN_AGENT_DEFINITIONS.map((agent) => agent.id).join(', ');
    throw new Error(`Unknown agent "${id}". Available agents: ${available}.`);
  }
  return definition;
}

export function requireBuiltinAgentDefinitionByProfile(profile: string): AgentDefinition {
  const definition = getBuiltinAgentDefinitionByProfile(profile);
  if (!definition) {
    const available = BUILTIN_AGENT_DEFINITIONS.map((agent) => agent.profile).join(', ');
    throw new Error(`Unknown agent profile "${profile}". Available profiles: ${available}.`);
  }
  return definition;
}

export function evaluateAgentDefinitionToolAccess(
  definition: AgentDefinition,
  tool: Pick<MakaTool, 'name' | 'categoryHint'>,
): { category: ToolCategory; decision: PolicyDecision } {
  const category = categoryForTool(tool);
  if (!definition.tools.includes(tool.name)) return { category, decision: 'block' };
  return {
    category,
    decision: definition.categoryPolicy[category] ?? 'block',
  };
}

export function buildToolsForAgentDefinition(
  tools: readonly MakaTool[],
  definition: AgentDefinition = LOCAL_READ_AGENT_DEFINITION,
): MakaTool[] {
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const out: MakaTool[] = [];
  for (const name of definition.tools) {
    const tool = byName.get(name);
    if (!tool) continue;
    if (evaluateAgentDefinitionToolAccess(definition, tool).decision === 'allow') {
      out.push(tool);
    }
  }
  return out;
}

export function assertAgentDefinitionRunnable(input: {
  parentPermissionMode: PermissionMode;
  definition: AgentDefinition;
  tools: readonly MakaTool[];
}): void {
  const { parentPermissionMode, definition, tools } = input;
  if (modeRank[definition.permissionMode] > modeRank[parentPermissionMode]) {
    throw new Error(
      `Agent "${definition.id}" cannot run in parent permission mode "${parentPermissionMode}" because it requires "${definition.permissionMode}".`,
    );
  }

  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const missing = definition.tools.filter((name) => !byName.has(name));
  if (missing.length > 0) {
    throw new Error(`Agent "${definition.id}" is unavailable: missing tools: ${missing.join(', ')}`);
  }

  const nonAllow = definition.tools
    .map((name) => {
      const tool = byName.get(name);
      return tool ? { name, ...evaluateAgentDefinitionToolAccess(definition, tool) } : undefined;
    })
    .filter((item): item is { name: string; category: ToolCategory; decision: PolicyDecision } =>
      item !== undefined && item.decision !== 'allow'
    );
  if (nonAllow.length > 0) {
    const details = nonAllow.map((item) => `${item.name}:${item.decision}`).join(', ');
    throw new Error(`Agent "${definition.id}" is unavailable: non-allow tool policy: ${details}`);
  }
}

function categoryForTool(tool: Pick<MakaTool, 'name' | 'categoryHint'>): ToolCategory {
  return tool.categoryHint ?? BUILTIN_TOOL_CATEGORY[tool.name] ?? 'custom_tool';
}
