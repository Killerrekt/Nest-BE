import { InputField } from "./type";

export function parseAgentInputSchema(schemaString: string): InputField[] {
    try {
      const parsed = JSON.parse(schemaString);
  
      if (!Array.isArray(parsed)) {
        throw new Error("Input schema is not an array");
      }
  
      return parsed.map((field): InputField => ({
        id: field.id,
        name: field.name,
        description: field.description,
        type: field.type,
        isArray: field.isArray,
        required: field.required,
        nestedProperties: field.nestedProperties || [],
        enumValues: field.enumValues || [],
      }));
    } catch (error) {
      console.error("Failed to parse input schema:", error);
      return [];
    }
  }
  