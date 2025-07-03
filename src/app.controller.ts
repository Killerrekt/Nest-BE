import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { AppService } from './app.service';
import { parseAgentInputSchema } from './parse-input-schema';
import { Response } from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import { ReduceAbilityResJson, ReduceTiggerResJson } from './json';
import { FlowTransformationService } from './flow-transformation.service';
import { ServiceStep, AgentConfig } from './type';
import Anthropic from '@anthropic-ai/sdk';
import { ConvertAgentInstructions } from './agent-role-parser';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly flowTransformationService: FlowTransformationService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Post()
  async getFlowJson(
    @Body() AgentToFlowJSON: any,
    @Res() res: Response,
  ): Promise<any> {
    try {
      // Debug log to see what we're receiving
      console.log('=== REQUEST DEBUG ===');
      console.log(
        'Received request body:',
        JSON.stringify(AgentToFlowJSON, null, 2),
      );
      console.log('Type of AgentToFlowJSON:', typeof AgentToFlowJSON);
      console.log('AgentToFlowJSON exists:', !!AgentToFlowJSON);

      // Process abilities array
      let transformedAbilities: any[] = [];
      if (
        AgentToFlowJSON.abilities &&
        Array.isArray(AgentToFlowJSON.abilities)
      ) {
        console.log('=== PROCESSING ABILITIES ===');
        console.log(
          'Original abilities:',
          JSON.stringify(AgentToFlowJSON.abilities, null, 2),
        );

        transformedAbilities = AgentToFlowJSON.abilities.map((ability: any) => {
          const transformedAbility = {
            id: ability.id,
            title: ability.title,
            type: ability.type,
            group_name: ability.configured_action?.group_name || null,
            description: ability.configured_action?.tool_description || null,
            connector_id: ability.configured_action?.connector_id || null,
            fullAgentData: ability.fullAgentData || null, // Include fullAgentData for agent-type abilities
          };
          return transformedAbility;
        });

        console.log(
          'Transformed abilities:',
          JSON.stringify(transformedAbilities, null, 2),
        );
        // console.log('Number of abilities processed:', transformedAbilities.length);
        console.log('=== END ABILITIES PROCESSING ===');
      } else {
        console.log('No abilities array found or abilities is not an array');
      }

      // Validate request body
      if (!AgentToFlowJSON) {
        console.log('Request body is empty/undefined');
        return res.status(HttpStatus.BAD_REQUEST).json({
          error: 'Invalid request body. Expected agent data is missing.',
        });
      }

      if (!AgentToFlowJSON.description) {
        console.log('Description is missing from request body');
        console.log('Available keys:', Object.keys(AgentToFlowJSON || {}));
        return res.status(HttpStatus.BAD_REQUEST).json({
          error: 'Agent description is required.',
          receivedKeys: Object.keys(AgentToFlowJSON || {}),
        });
      }

      const ai = new GoogleGenAI({
        apiKey: process.env.KEY,
      });

      // Use transformed abilities from request instead of dummy data
      const abilitiesJson = { abilities: transformedAbilities };
      const triggers = ReduceTiggerResJson();
      const agentDescription = AgentToFlowJSON.description;

      const roleParsed = ConvertAgentInstructions(AgentToFlowJSON.role_setting || '');
      const { background, instruction, output: outputFormatting } = roleParsed;
      
      console.log('=== PARSED ROLE SETTINGS ===');
      console.log('Background found:', !!background);
      console.log('Instructions found:', !!instruction);
      console.log('Output formatting found:', !!outputFormatting);
      if (background) console.log('Background preview:', background.substring(0, 150) + '...');
      if (instruction) console.log('Instructions preview:', instruction.substring(0, 150) + '...');
      if (outputFormatting) console.log('Output preview:', outputFormatting.substring(0, 150) + '...');
      console.log('=== END ROLE PARSING ===');

      const content = `AGENT CONTEXT:
      ${background ? `Background: ${background}` : ''}
      
      ${instruction ? `Instructions: ${instruction}` : ''}
      
      ${outputFormatting ? `Output Guidelines: ${outputFormatting}` : ''}
      
      WORKFLOW CREATION TASK:
      You are responsible for creating workflows based on the agent context above. You can only use the abilities and triggers provided below.
      
      The output must be a JSON array showing the step-by-step breakdown of the workflow. Keep the number of steps to a minimum.
      IMPORTANT FORMAT REQUIREMENTS:
      - Return ONLY a JSON array of step objects
      - Each step MUST have target_id as an array of objects (NOT a flat array)
      
      Here is the EXACT format you must follow:
      
      EXAMPLE OF CORRECT OUTPUT:
      [
        {
          "id": "trigger_1",
          "type": "trigger",
          "target_id": [{"id": "step_2"}],
          "step_no": 1,
          "title": "HTTP Request Trigger",
          "description": "This event is triggered when HTTP GET/POST requests are made to a webhook URL.",
          "icon": "webhook"
        },
        {
          "id": "step_2",
          "type": "if", 
          "target_id": [
            {"id": "step_3", "label": "true"},
            {"id": "step_4", "label": "false"}
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
      - For triggers: "play", "webhook", "mail", "calendar", "clock", "bell", "radio"
      - For abilities/actions: "zap", "send", "database", "file-text", "image", "upload", "download", "edit", "trash", "copy", "search", "filter", "settings", "user", "users", "message-square", "phone", "video", "map", "shopping-cart", "credit-card", "lock", "unlock", "key", "shield", "eye", "eye-off", "heart", "star", "bookmark", "flag", "tag", "paperclip", "link", "external-link", "refresh", "rotate-cw", "arrow-right", "arrow-left", "arrow-up", "arrow-down", "plus", "minus", "x", "check", "alert-triangle", "alert-circle", "info", "help-circle"
      - For conditionals: "git-branch", "split", "merge", "decision", "help-circle", "alert-triangle", "check-circle", "x-circle"
      - For loops: "repeat", "rotate-cw", "refresh", "arrow-right-left", "repeat-1"
      
      Select the most contextually appropriate icon for each step based on its functionality.
      
      CRITICAL RULES FOR target_id:
      - NEVER use flat arrays like ["id", "step_2"] 
      - ALWAYS use object arrays like [{"id": "step_2"}]
      - For no connections: "target_id": []
      - For one connection: "target_id": [{"id": "next_step_id"}]
      - For multiple connections: "target_id": [{"id": "step1", "label": "true"}, {"id": "step2", "label": "false"}]

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

      IMPORTANT: If you are able to create a workflow, return ONLY the array of steps directly (not wrapped in any object). 
      If you cannot create a workflow, return ONLY this format:
      {
        "status": "400", 
        "error": "reason why it failed"
      }

      Here is a text :- ${agentDescription}. From this extract a basic workflow and create it based on the rules declared above.
      
      REMINDER: Your response must be a JSON array where each step has target_id as an array of objects:
      ✅ CORRECT: "target_id": [{"id": "next_step"}]
      ❌ WRONG: "target_id": ["id", "next_step"]
      ✅ CORRECT: "target_id": [{"id": "step1", "label": "yes"}, {"id": "step2", "label": "no"}]  
      ❌ WRONG: "target_id": ["id", "step1", "label", "yes", "id", "step2", "label", "no"]
    `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: content,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            oneOf: [
              {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    type: { type: Type.STRING },
                    target_id: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          id: { 
                            type: Type.STRING,
                            description: 'The ID of the target step'
                          },
                          label: { 
                            type: Type.STRING,
                            description: 'Optional label describing the connection'
                          },
                        },
                        required: ['id'],
                        additionalProperties: false,
                        description: 'A target object with id and optional label'
                      },
                      description: 'Array of target connection objects (NOT a flat array of strings)',
                    },
                    step_no: { type: Type.INTEGER },
                    condition: { type: Type.STRING },
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    icon: { type: Type.STRING },
                  },
                  required: [
                    'id',
                    'type',
                    'step_no',
                    'target_id',
                    'title',
                    'description',
                    'icon',
                  ],
                },
              },
              {
                type: Type.OBJECT,
                properties: {
                  status: { type: Type.STRING },
                  error: { type: Type.STRING },
                },
                required: ['status', 'error'],
              },
            ],
          },
        },
      });

      if (!response.text) {
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          error: 'No response received from AI service.',
        });
      }

      let data = JSON.parse(response.text);
      console.log('AI Response (raw):', data);
      
      // Post-process the data to fix target_id JSON strings
      if (Array.isArray(data)) {
        data = data.map((step: any) => {
          if (step.target_id && Array.isArray(step.target_id)) {
            step.target_id = step.target_id.map((target: any) => {
              // If target is a JSON string, parse it to object
              if (typeof target === 'string' && target.startsWith('{')) {
                try {
                  return JSON.parse(target);
                } catch (e) {
                  console.warn(`Failed to parse target JSON string: ${target}`);
                  return null;
                }
              }
              // If it's already an object, return as is
              return target;
            }).filter(Boolean); // Remove any null values from failed parsing
          }
          return step;
        });
        console.log('AI Response (processed):', data);
      }

      if (data.status === '400') {
        return res.status(HttpStatus.BAD_REQUEST).json({
          error: data.error || 'AI could not create workflow.',
        });
      }

      if (!Array.isArray(data)) {
        return res.status(HttpStatus.NOT_ACCEPTABLE).json(data);
      }

      // Create abilities mapping (title -> type) for preserving original ability types
      const abilitiesMap = new Map<string, string>();
      transformedAbilities.forEach(ability => {
        // For agent type abilities, keep type as "agent", for others use the actual type
        const abilityType = ability.type;
        abilitiesMap.set(ability.title, abilityType);
      });

      const transformedData = this.flowTransformationService.serviceToFlow(
        data as ServiceStep[],
        abilitiesMap,
      );

      res.status(HttpStatus.CREATED).json({ data: transformedData });
      return transformedData;
    } catch (error) {
      console.error('Error in controller:', error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Internal server error.',
        details: error.message,
      });
    }
  }

  @Post('claude')
  async FlowJson(
    @Body() AgentToFlowJSON: any,
    @Res() res: Response,
  ): Promise<any> {
    try {
      // Process abilities array
      let transformedAbilities: any[] = [];
      if (
        AgentToFlowJSON.abilities &&
        Array.isArray(AgentToFlowJSON.abilities)
      ) {
        transformedAbilities = AgentToFlowJSON.abilities.map((ability: any) => {
          const transformedAbility = {
            id: ability.id,
            title: ability.title,
            type: ability.type,
            group_name: ability.configured_action?.group_name || null,
            description: ability.configured_action?.tool_description || null,
            connector_id: ability.configured_action?.connector_id || null,
            fullAgentData: ability.fullAgentData || null, // Include fullAgentData for agent-type abilities
          };
          return transformedAbility;
        });
      } else {
        console.log('No abilities array found or abilities is not an array');
      }

      // Validate request body
      if (!AgentToFlowJSON) {
        console.log('Request body is empty/undefined');
        return res.status(HttpStatus.BAD_REQUEST).json({
          error: 'Invalid request body. Expected agent data is missing.',
        });
      }

      if (!AgentToFlowJSON.description) {
        console.log('Description is missing from request body');
        console.log('Available keys:', Object.keys(AgentToFlowJSON || {}));
        return res.status(HttpStatus.BAD_REQUEST).json({
          error: 'Agent description is required.',
          receivedKeys: Object.keys(AgentToFlowJSON || {}),
        });
      }

      // Use transformed abilities from request instead of dummy data
      const abilitiesJson = { abilities: transformedAbilities };
      const triggers = ReduceTiggerResJson();
      const agentDescription = AgentToFlowJSON.description;
      
      // Parse role settings using the agent role parser
      const roleParsed = ConvertAgentInstructions(AgentToFlowJSON.role_setting || '');
      const { background, instruction, output: outputFormatting } = roleParsed;
      
      console.log('=== PARSED ROLE SETTINGS ===');
      console.log('Background found:', !!background);
      console.log('Instructions found:', !!instruction);
      console.log('Output formatting found:', !!outputFormatting);
      if (background) console.log('Background preview:', background.substring(0, 150) + '...');
      if (instruction) console.log('Instructions preview:', instruction.substring(0, 150) + '...');
      if (outputFormatting) console.log('Output preview:', outputFormatting.substring(0, 150) + '...');
      console.log('=== END ROLE PARSING ===');

      const content = `AGENT CONTEXT:
      ${background ? `Background: ${background}` : ''}
      
      ${instruction ? `Instructions: ${instruction}` : ''}
      
      ${outputFormatting ? `Output Guidelines: ${outputFormatting}` : ''}
      
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
      `;

      const anthropic = new Anthropic({
        apiKey: process.env.CLAUDE_KEY,
      });

      const msg = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{ role: 'user', content: content }],
      });

      // Log token usage information
      console.log('=== CLAUDE TOKEN USAGE ===');
      console.log('Input tokens:', msg.usage.input_tokens);
      console.log('Output tokens:', msg.usage.output_tokens);
      console.log('Total tokens:', msg.usage.input_tokens + msg.usage.output_tokens);
      console.log('=== END TOKEN USAGE ===');

      let data = [];

      if (msg.content[0].type == 'text') {
        data = JSON.parse(msg.content[0].text);
      }

      console.log('Claude response:', data);

      if (!Array.isArray(data)) {
        return res.status(HttpStatus.NOT_ACCEPTABLE).json(data);
      }

      // Create abilities mapping (title -> type) for preserving original ability types
      const abilitiesMap = new Map<string, string>();
      transformedAbilities.forEach(ability => {
        // For agent type abilities, keep type as "agent", for others use the actual type
        const abilityType = ability.type;
        abilitiesMap.set(ability.title, abilityType);
      });

      const transformedData = this.flowTransformationService.serviceToFlow(
        data as ServiceStep[],
        abilitiesMap,
      );

      res.status(HttpStatus.CREATED).json({ data: transformedData });
      return transformedData;
    } catch (error) {
      console.error('Error in controller:', error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Internal server error.',
        details: error.message,
      });
    }
  }
}
