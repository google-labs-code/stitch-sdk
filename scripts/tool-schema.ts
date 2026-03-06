/**
 * Tool Schema Types
 *
 * Minimal, purpose-built JSON Schema interface covering only the features
 * we encounter in Stitch MCP tool schemas. Replaces `any` in the Tool interface.
 *
 * This is NOT a full JSON Schema implementation — it covers:
 * properties, items, $ref, $defs, enum, type, required
 */

export interface ToolSchema {
  type?: string;
  properties?: Record<string, ToolSchema>;
  items?: ToolSchema;
  $ref?: string;
  $defs?: Record<string, ToolSchema>;
  enum?: string[];
  description?: string;
  required?: string[];
}

export interface Tool {
  name: string;
  description?: string;
  inputSchema?: ToolSchema;
  outputSchema?: ToolSchema;
}
