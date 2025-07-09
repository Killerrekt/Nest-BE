export type PromptProps = {
  background: string;
  instruction: string;
  agentDescription: string;
  triggers: any;
  abilitiesJson?: any;
  abilitiesString: string[];
};

export const Prompt = {
  gemini: ({
    background,
    instruction,
    agentDescription,
    triggers,
    abilitiesJson,
  }: PromptProps) => `AGENT CONTEXT:
      ${background ? `Background: ${background}` : ''}
      
      ${instruction ? `Instructions: ${instruction}` : ''}
      
      WORKFLOW CREATION TASK:
      You are responsible for creating workflows based on the agent context above. You can only use the abilities and triggers provided below.
      
      The output must be a JSON array showing the step-by-step breakdown of the workflow. Keep the number of steps to a minimum.
      IMPORTANT FORMAT REQUIREMENTS:
      - Return ONLY a JSON array of step objects
      - Each step MUST have target_id as an array of objects (NOT a flat array)
      
      EXAMPLE OF CORRECT OUTPUT:
      [
        {
          "id": "trigger_1",
          "type": "trigger",
          "target_id": [{"id": "step_2", "labelMain": "Lead is Qualified?", "label" : "yes"}],
          "step_no": 1,
          "title": "HTTP Request Trigger",
          "description": "This event is triggered when HTTP GET/POST requests are made to a webhook URL.",
          "icon": "webhook"
        },
        {
          "id": "step_2",
          "type": "if", 
          "target_id": [
            {"id": "step_3","labelMain" : "Was content uploaded successfully?" ,"label": "yes"},
            {"id": "step_4", "labelMain" : "Was content uploaded successfully? ","label": "no"}
          ],
          "step_no": 2,
          "condition": "some condition",
          "title": "Check Condition",
          "description": "Checks some condition",
          "icon": "git-branch"
        },
        {
          "id": "step_3",
          "type": "ability",
          "target_id": [],
          "step_no": 3,
          "title": "Some Action",
          "description": "Does some action",
          "icon": "zap"
        }
      ]

      ICON SELECTION:
      Choose appropriate icons from the lucide-react library based on the step type and functionality:
      - For triggers: "play"
      - For abilities/actions: "zap", "send", "database", "file-text", "image", "upload", "download", "edit", "trash", "copy", "search", "filter", "settings", "user", "users", "message-square", "phone", "video", "map", "shopping-cart", "credit-card", "lock", "unlock", "key", "shield", "eye", "eye-off", "heart", "star", "bookmark", "flag", "tag", "paperclip", "link", "external-link", "refresh", "rotate-cw", "arrow-right", "arrow-left", "arrow-up", "arrow-down", "plus", "minus", "x", "check", "alert-triangle", "alert-circle", "info", "help-circle"
      - For conditionals: "git-branch"
      - For loops: "repeat"
      
      CRITICAL RULES FOR target_id:
      - IMPORTANT: ALWAYS use object arrays like [{"id": "step_2", "labelMain": "Lead is Qualified?", "label" : "yes"}]
      - For no connections: "target_id": []
      - For one connection: "target_id": [{"id": "next_step_id", "labelMain": "Lead is Qualified?", "label" : "yes"}]
      - For multiple connections: "target_id": [{"id": "step1", "labelMain" : "Was Email send successfully? ","label": "yes"}, {"id": "step2", "labelMain" : "Did the website get updated?","label": "no"}]

      Each workflow starts with a trigger and is followed by a set of abilities. Cause of this the step_no of trigger is always 1. Also use the title and description provided in the following ability to populated the corresponding fields.
      Here is the trigger JSON :- ${JSON.stringify(triggers)}
      Here is the ability JSON :- ${JSON.stringify(abilitiesJson)}

      When using a loop, indicate the end of the loop by pointing the target_id back to the loop starting id.

      IMPORTANT: If you are able to create a workflow, return ONLY the array of steps directly (not wrapped in any object). 
      If you cannot create a workflow, return ONLY this format:
      {
        "status": "400", 
        "error": "reason why it failed"
      }

      Here is a text :- ${agentDescription}. From this extract a basic workflow and create it based on the rules declared above.
      
      REMINDER: Your response must be a JSON array where each step has target_id as an array of objects:
      CORRECT: "target_id": [{"id": "step1","labelMain" : "Was Email send successfully? ", "label": "yes"}, {"id": "step2","labelMain" : "Was Email send successfully? ", "label": "no"}]  
      WRONG: "target_id": ["id", "step1", "label", "yes", "id", "step2", "label", "no"]
    `,
  gpt: ({
    background,
    instruction,
    agentDescription,
    triggers,
    abilitiesString,
  }: PromptProps) => `AGENT CONTEXT:
      ${background ? `Background: ${background}` : ''}
      
      ${instruction ? `Instructions: ${instruction}` : ''}
      
      WORKFLOW CREATION TASK:
      You are responsible for creating workflows based on the agent context above. You can only use the abilities and triggers provided below.
      
      The output must be a JSON array showing the step-by-step breakdown of the workflow. Keep the number of steps to a minimum.
      Each step should follow this exact format:

      {
        "id": "string", // unique step ID
        "type": "string", // one of: "ability", "if", "loop", or "trigger"
        "target_id": [
          {
            "id": "string",        // ID of the target step
            "labelMain" : "string" // 
            "label": "string"      // Optional label to explain the connection
          }
        ],
        "step_no": number, // The level of the node in the workflow tree
        "condition": "string", // Only if conditional
        "title": "string",
        "description": "string",
        "icon": "string" // A relevant icon from lucide-react library
      }

      ICON SELECTION:
      Choose appropriate icons from the lucide-react library based on the step type and functionality:
      - For triggers: "play", "webhook", "mail", "calendar", "clock", "bell", "radio"
      - For abilities/actions: "zap", "send", "database", "file-text", "image", "upload", "download", "edit", "trash", "copy", "search", "filter", "settings", "user", "message-square", "phone", "video", "shopping-cart", "credit-card", "lock", "unlock", "flag", "tag", "paperclip", "link", "external-link", "refresh", "rotate-cw", "plus", "minus", "x", "check", "alert-triangle", "alert-circle", "info", "help-circle"
      - For conditionals: "git-branch", "split", "merge", "decision", "help-circle", "alert-triangle", "check-circle", "x-circle"
      - For loops: "repeat", "rotate-cw", "refresh", "arrow-right-left", "repeat-1"
      
      Select the most contextually appropriate icon for each step based on its functionality.


      Each workflow should start by a trigger and only use the triggers which are provided in the following json :- ${JSON.stringify(triggers)}.
      The step containing trigger should have following value along with the general format =>
      {
        type : "trigger",
        step_no : 1,
        title : string // Don't create on your own, get it and copy it as it is from the json.
        description : string // copy it as it is from the json and don't change it.
      }
      After creating this, check if the trigger title is present in the json or not. You can check the presence by performing an exact string match of the title.

      The ability provided in the following json :- ${abilitiesString.join('. ')}.
      The step containing ability should have following value along with the general format =>
      {
        type : "ability",
        title : string // Don't create on your own, get it and copy it as it is from the json.
        description : string // copy it as it is from the json and don't change it.
      }

      If you are using a loop, indicate the end of the loop by pointing the target_id back to the loop starting id.

      WORKFLOW REQUIREMENT:
      Based on the agent context above and the following description: "${agentDescription}"
      
      Create a workflow that aligns with the agent's background, follows the instructions, and uses the output guidelines provided. 
      The output is then fed into workflow-steps-to-custom-data.
      
      If you cannot create a workflow, return:
      {
        "status": "400",
        "reason": "explanation of why it failed"
      }
      
      IMPORTANT: Return ONLY valid JSON. Do NOT wrap in markdown backticks. Do NOT include explanations.
    `,
  claude: ({
    background,
    instruction,
    agentDescription,
    triggers,
    abilitiesJson,
  }: PromptProps) => `AGENT CONTEXT:
      ${background ? `Background: ${background}` : ''}
      
      ${instruction ? `Instructions: ${instruction}` : ''}
      
      WORKFLOW CREATION TASK:
      You are responsible for creating workflows based on the agent context above. You can only use the abilities and triggers provided below.
      
      The output must be a JSON array showing the step-by-step breakdown of the workflow. Keep the number of steps to a minimum.
      Each step should follow this exact format:

      {
        "id": "string", // unique step ID
        "type": "string", // one of: "ability", "if", "loop", or "trigger"
        "target_id": [
          {
            "id": "string",        // ID of the target step
            "labelMain" : "string" // 
            "label": "string"      // Optional label to explain the connection
          }
        ],
        "step_no": number, // The level of the node in the workflow tree
        "condition": "string", // Only if conditional
        "title": "string",
        "description": "string",
        "icon": "string" // A relevant icon from lucide-react library
      }

      ICON SELECTION:
      Choose appropriate icons from the lucide-react library based on the step type and functionality:
      - For triggers: "play", "webhook", "mail", "calendar", "clock", "bell", "radio"
      - For abilities/actions: "zap", "send", "database", "file-text", "image", "upload", "download", "edit", "trash", "copy", "search", "filter", "settings", "user", "users", "message-square", "phone", "video", "map", "shopping-cart", "credit-card", "lock", "unlock", "key", "shield", "eye", "eye-off", "heart", "star", "bookmark", "flag", "tag", "paperclip", "link", "external-link", "refresh", "rotate-cw", "arrow-right", "arrow-left", "arrow-up", "arrow-down", "plus", "minus", "x", "check", "alert-triangle", "alert-circle", "info", "help-circle"
      - For conditionals: "git-branch", "split", "merge", "decision", "help-circle", "alert-triangle", "check-circle", "x-circle"
      - For loops: "repeat", "rotate-cw", "refresh", "arrow-right-left", "repeat-1"
      
      Select the most contextually appropriate icon for each step based on its functionality.


      Each workflow should start by a trigger and only use the triggers which are provided in the following json :- ${JSON.stringify(triggers)}.
      The step containing trigger should have following value along with the general format =>
      {
        type : "trigger",
        step_no : 1,
        title : string // Don't create on your own, get it and copy it as it is from the json.
        description : string // copy it as it is from the json and don't change it.
      }
      After creating this, check if the trigger title is present in the json or not. You can check the presence by performing an exact string match of the title.

      The ability provided in the following json :- ${JSON.stringify(abilitiesJson)}.
      The step containing ability should have following value along with the general format =>
      {
        type : "ability",
        title : string // Don't create on your own, get it and copy it as it is from the json.
        description : string // copy it as it is from the json and don't change it.
      }

      If you are using a loop, indicate the end of the loop by pointing the target_id back to the loop starting id.

      WORKFLOW REQUIREMENT:
      Based on the agent context above and the following description: "${agentDescription}"
      
      Create a workflow that aligns with the agent's background, follows the instructions, and uses the output guidelines provided.
      
      If you cannot create a workflow, return:
      {
        "status": "400",
        "reason": "explanation of why it failed"
      }
      
      IMPORTANT: Return ONLY valid JSON. Do NOT wrap in markdown backticks. Do NOT include explanations.
      `,
};
