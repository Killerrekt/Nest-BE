export function ConvertAgentInstructions(role_setting: string) {
  // Use the 's' flag to make '.' match newlines for multiline content
  const background = role_setting.match(
    /<AgentBackground>(.*?)<\/AgentBackground>/s,
  );
  const instruction = role_setting.match(
    /<AgentInstruction>(.*?)<\/AgentInstruction>/s,
  );

  const output = role_setting.match(
    /<AgentOutputFormatting>(.*?)<\/AgentOutputFormatting>/s,
  );
  
  console.log('=== ROLE PARSER DEBUG ===');
  console.log('Raw role_setting length:', role_setting.length);
  console.log('Background match:', !!background);
  console.log('Instruction match:', !!instruction);
  console.log('Output match:', !!output);
  
  const result = {
    background: background?.[1]?.trim() || '',
    instruction: instruction?.[1]?.trim() || '',
    output: output?.[1]?.trim() || '',
  };
  
  console.log('Parsed background length:', result.background.length);
  console.log('Parsed instruction length:', result.instruction.length);
  console.log('Parsed output length:', result.output.length);
  console.log('=== END ROLE PARSER DEBUG ===');
  
  return result;
}
