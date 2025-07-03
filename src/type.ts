export interface Option {
  label: string;
  value: string;
}

export interface Brandkit {
  enabled: boolean;
  knowledge_vault: boolean;
}

export interface InputSchemaItem {
  id: string;
  name: string;
  description: string;
  type: string;
  isArray: boolean;
  required: boolean;
  nestedProperties: any[]; // could be further typed if needed
  enumValues: any[]; // same here
}

export interface ModelOptions {
  chatgpt: Option[];
  vertex: Option[];
  azurechatgpt: Option[];
  gemini: Option[];
  anthropic: Option[];
}

export interface AgentConfig {
  _id: string;
  id: string;
  title: string;
  description: string;
  active: boolean;
  project_id: string;
  abilities: any[]; // Replace with specific type if needed
  auth: string;
  response_type: string;
  randomness: number;
  user_id: string;
  org_id: string;
  created_at: string; // ISO string, or use `Date` if parsed
  updated_at: string;
  __v: number;
  model_id: string;
  provider: string;
  role_setting: string;
  input_schema: string; // JSON string; optionally parsed into InputSchemaItem[]
  brandkit: Brandkit;
  provider_options: Option[];
  response_types: Option[];
  model_options: Record<string, Option[]>;
}

export interface NodeSideBarData {
  title: string;
  type: string;
  placeholder: string;
}

export interface Node {
  id: string;
  position: {
    x: number;
    y: number;
  };
  data: {
    title: string;
    description: string;
    inputs: NodeSideBarData[];
    icon: string;
    isIsland: boolean;
    type?: string;
  };
  type: string;
}

export interface Edge {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
  label?: string;
}

export interface ServiceStep {
  id: string;
  type: string;
  target_id: Array<{
    id: string;
    label?: string;
    labelMain?: string;
  }>;
  step_no: number;
  condition?: string;
  title: string;
  description: string;
  action?: string;
  icon?: string;
}

export interface FlowJson {
  nodes: Node[];
  edges: Edge[];
}

export type InputField = {
  id: string;
  name: string;
  description: string;
  type: 'string' | 'boolean' | 'select' | 'textarea' | 'number';
  isArray: boolean;
  required: boolean;
  nestedProperties: InputField[];
  enumValues: string[];
};
