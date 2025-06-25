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
