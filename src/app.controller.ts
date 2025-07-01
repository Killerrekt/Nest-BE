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

      const content = `You are an agent responsible for creating workflows that don't have any knowledge about ability and trigger other than the provided one.
      
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
          "description": "This event is triggered when HTTP GET/POST requests are made to a webhook URL."
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
          "description": "Checks some condition"
        },
        {
          "id": "step_3",
          "type": "ability",
          "target_id": [],
          "step_no": 3,
          "title": "Some Action",
          "description": "Does some action"
        }
      ]
      
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
                  },
                  required: [
                    'id',
                    'type',
                    'step_no',
                    'target_id',
                    'title',
                    'description',
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

      const transformedData = this.flowTransformationService.serviceToFlow(
        data as ServiceStep[],
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
      const rawSchema = AgentToFlowJSON.input_schema;

      const inputFields = parseAgentInputSchema(rawSchema);

      console.log('Input fields:', JSON.stringify(inputFields, null, 2));

      const content = `You are an agent responsible for creating workflows that don't have any knowledge about ability and trigger other than the provided one.
      The output returned should be an array that shows the step by step breakdown of the workflow. Try keeping the number of steps to a minimum.
      Each step should follow this format:

      {
        id: string, // unique step ID
        type: string, // one of: 'ability', 'if', 'loop', or 'trigger'
        target_id: [
          {
            id: string,        // ID of the target step
            label?: string     // Optional label to explain the connection
          }
        ],
        step_no: integer, // The level of the node in the workflow tree
        condition?: string, // Only if conditional
        title: string,
        description: string
      }


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

      If you are able to create an workflow return the output as described or else return the following json :-
      {
        staus : 400,
        reason : string // why did it fail
      }

      Here is a text :- ${agentDescription}. From this extract a basic workflow and create it based on the rules declared above.
      Do NOT wrap your response in markdown backticks. Do not include explanations. Just output raw JSON.
      `;

      const anthropic = new Anthropic({
        apiKey: process.env.CLAUDE_KEY,
      });

      const msg = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{ role: 'user', content: content }],
      });

      let data = [];

      if (msg.content[0].type == 'text') {
        data = JSON.parse(msg.content[0].text);
      }

      console.log(data);

      if (!Array.isArray(data)) {
        return res.status(HttpStatus.NOT_ACCEPTABLE).json(data);
      }

      const transformedData = this.flowTransformationService.serviceToFlow(
        data as ServiceStep[],
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
