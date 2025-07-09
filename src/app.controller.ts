import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Post,
  Query,
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
import OpenAI from 'openai';
import { encoding_for_model } from '@dqbd/tiktoken';
import { Prompt, PromptProps } from './prompt';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly flowTransformationService: FlowTransformationService,
  ) {}

  private GetPrompt(AgentToFlowJSON: any, res: Response, model: string) {
    let transformedAbilities: any[] = [];
    if (AgentToFlowJSON.abilities && Array.isArray(AgentToFlowJSON.abilities)) {
      transformedAbilities = AgentToFlowJSON.abilities.map((ability: any) => {
        let nestedAbilities = [];
        if (
          ability.type === 'agent' &&
          ability.fullAgentData &&
          ability.fullAgentData.abilities
        ) {
          nestedAbilities = ability.fullAgentData.abilities.map((ele: any) => ({
            title: ele.title,
            type: ele.type,
            description:
              ele.configured_action?.description ||
              ele.configured_action?.tool_description ||
              null,
          }));
        }
        const transformedAbility = {
          title: ability.title,
          type: ability.type,
          description:
            ability.type === 'agent' && ability.fullAgentData
              ? ability.fullAgentData.description
              : ability.configured_action?.description ||
                ability.configured_action?.tool_description ||
                null,
          fullAgentData: nestedAbilities,
        };
        return transformedAbility;
      });

      console.log(
        'Transformed abilities:',
        JSON.stringify(transformedAbilities, null, 2),
      );
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

    const abilitiesJson = { abilities: transformedAbilities };
    const triggers = ReduceTiggerResJson(AgentToFlowJSON.trigger);
    const agentDescription = AgentToFlowJSON.description;

    const roleParsed = ConvertAgentInstructions(
      AgentToFlowJSON.role_setting || '',
    );
    const { background, instruction } = roleParsed;

    const abilitiesString = abilitiesJson.abilities.map((ele) => {
      return `title ${ele.title} and its description ${ele.description}`;
    });

    const input: PromptProps = {
      abilitiesString: abilitiesString,
      abilitiesJson: abilitiesJson,
      background: background,
      instruction: instruction,
      triggers: triggers,
      agentDescription: agentDescription,
    };

    let content = '';
    switch (model) {
      case 'gpt':
        content = Prompt.gpt(input);
        break;
      case 'claude':
        content = Prompt.claude(input);
        break;
      default:
        content = Prompt.gemini(input);
        break;
    }
    return [content, transformedAbilities];
  }

  private AfterResponse(data: any, res: Response, transformedAbilities: any[]) {
    if (Array.isArray(data)) {
      data = data.map((step: any) => {
        if (step.target_id && Array.isArray(step.target_id)) {
          step.target_id = step.target_id
            .map((target: any) => {
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
            })
            .filter(Boolean); // Remove any null values from failed parsing
        }
        return step;
      });
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
    transformedAbilities.forEach((ability) => {
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
  }

  @Post()
  async generateWorkflow(
    @Body() AgentToFlowJSON: any,
    @Res() res: Response,
    @Query('model') model: string,
  ): Promise<any> {
    try {
      const result = this.GetPrompt(AgentToFlowJSON, res, model);
      if (!Array.isArray(result)) {
        return;
      }
      const content = result[0];

      let llm_res: any = '';

      switch (model) {
        case 'gpt':
          const client = new OpenAI({
            timeout: 15 * 1000 * 60, // Increase default timeout to 15 minutes
            apiKey: process.env.OPEN_AI_KEY,
            organization: process.env.OPEN_AI_ORG,
          });

          const response = await client.chat.completions.create(
            {
              model: 'o3',
              messages: [{ role: 'user', content: content }],
              service_tier: 'flex',
              tools: [
                {
                  type: 'function',
                  function: {
                    name: 'workflow-steps-to-custom-data',
                    description: 'Convert workflow steps to a custom format.',
                    parameters: {
                      type: 'object',
                      properties: {
                        steps: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              id: { type: 'string' },
                              type: {
                                type: 'string',
                                enum: ['ability', 'if', 'loop', 'trigger'],
                              },
                              target_id: {
                                type: 'array',
                                items: {
                                  type: 'object',
                                  properties: {
                                    id: { type: 'string' },
                                    labelMain: { type: 'string' },
                                    label: { type: 'string' },
                                  },
                                  required: ['id'],
                                  additionalProperties: false,
                                },
                              },
                              step_no: { type: 'number' },
                              condition: { type: 'string' },
                              title: { type: 'string' },
                              description: { type: 'string' },
                              icon: { type: 'string' },
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
                            additionalProperties: false,
                          },
                        },
                      },
                      required: ['steps'],
                    },
                  },
                },
              ],
              tool_choice: {
                type: 'function',
                function: {
                  name: 'workflow-steps-to-custom-data',
                },
              },
            },
            { timeout: 15 * 1000 * 60 },
          );

          console.log(
            response.choices[0].message.tool_calls?.find(
              (ele) => ele.function.name == 'workflow-steps-to-custom-data',
            ),
          );

          const text = response.choices[0].message.tool_calls?.find(
            (ele) => ele.function.name == 'workflow-steps-to-custom-data',
          );

          llm_res = JSON.parse(text?.function.arguments as string);
          llm_res = llm_res.steps;
          break;
        case 'claude':
          const anthropic = new Anthropic({
            apiKey: process.env.CLAUDE_KEY,
          });

          const msg = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4000,
            messages: [{ role: 'user', content: content }],
          });
          if (msg.content[0].type == 'text') {
            llm_res = JSON.parse(msg.content[0].text);
          }
          break;
        default:
          const ai = new GoogleGenAI({
            apiKey: process.env.KEY,
          });
          const temp = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: content,
            config: {
              responseMimeType: 'application/json',
            },
          });

          if (!temp.text) {
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
              error: 'No response received from AI service.',
            });
          }

          llm_res = JSON.parse(temp.text);
          break;
      }
      return this.AfterResponse(llm_res, res, result[1] as any[]);
    } catch (error) {
      console.error('Error in controller:', error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Internal server error.',
        details: error.message,
      });
    }
  }

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Post('token-count')
  async TokenCount(
    @Body() AgentToFlowJSON: any,
    @Res() res: Response,
  ): Promise<any> {
    const enc = encoding_for_model('gpt-4'); // or "gpt-3.5-turbo"

    let transformedAbilities: any[] = [];
    if (AgentToFlowJSON.abilities && Array.isArray(AgentToFlowJSON.abilities)) {
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
    const triggers = ReduceTiggerResJson(AgentToFlowJSON.trigger_details);
    const agentDescription = AgentToFlowJSON.description;

    // Parse role settings using the agent role parser
    const roleParsed = ConvertAgentInstructions(
      AgentToFlowJSON.role_setting || '',
    );
    const { background, instruction, output: outputFormatting } = roleParsed;

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
      `;

    console.log(content);

    const tokens = enc.encode(content);
    console.log(tokens.length); // token count
    return tokens.length;
  }

  @Post('flow-to-steps')
  async convertFlowToSteps(
    @Body() flowData: any,
    @Res() res: Response,
  ): Promise<any> {
    try {
      console.log('=== FLOW TO STEPS CONVERSION ===');
      console.log('Input flow data:', JSON.stringify(flowData, null, 2));

      if (!flowData.nodes || !flowData.edges) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          error: 'Invalid flow data. Expected nodes and edges properties.',
        });
      }

      const steps = this.flowTransformationService.flowToService(flowData);

      console.log('Converted steps:', JSON.stringify(steps, null, 2));

      console.log('=== GENERATING USER PROMPT ===');
      const userPrompt = await this.generateUserPromptFromSteps(steps);
      console.log('Generated user prompt:', userPrompt);
      console.log('=== END CONVERSION ===');

      res.status(HttpStatus.OK).json({
        steps: steps,
        userPrompt: userPrompt,
        message:
          'Successfully converted flow to steps and generated user prompt',
      });
      return { steps, userPrompt };
    } catch (error) {
      console.error('Error in flow-to-steps conversion:', error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Internal server error during conversion.',
        details: error.message,
      });
    }
  }

  private async generateUserPromptFromSteps(steps: any[]): Promise<string> {
    try {
      const workflowSummary = this.createWorkflowSummary(steps);

      const content = `You are an expert AI assistant that helps users create automation workflows. 

Based on the following detailed workflow steps, generate a natural, conversational user prompt that someone would give to an AI agent to create this exact workflow.

WORKFLOW STEPS:
${workflowSummary}

Requirements for the user prompt:
1. Make it sound natural and conversational, as if a user is describing what they want
2. Include the key business logic and decision points
3. Mention the specific actions and integrations needed
4. Include the conditional logic and branching
5. Keep it concise but comprehensive
6. Focus on the business outcome and user intent
7. Don't use technical jargon - make it user-friendly

Generate a user prompt that would result in creating this workflow. The prompt should be something a non-technical user would naturally say when asking for this automation.

Return only the user prompt, nothing else.`;

      const ai = new GoogleGenAI({
        apiKey: process.env.KEY,
      });

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: content,
        config: {
          responseMimeType: 'text/plain',
        },
      });

      if (!response.text) {
        throw new Error('No response received from Gemini API');
      }

      return response.text.trim();
    } catch (error) {
      console.error('Error generating user prompt:', error);
      throw new Error('Failed to generate user prompt from workflow steps');
    }
  }

  private createWorkflowSummary(steps: any[]): string {
    return steps
      .map((step, index) => {
        let summary = `Step ${step.step_no}: ${step.title}\n`;
        summary += `  Description: ${step.description}\n`;
        summary += `  Type: ${step.type}\n`;

        if (step.condition) {
          summary += `  Condition: ${step.condition}\n`;
        }

        if (step.target_id && step.target_id.length > 0) {
          summary += `  Next Steps: ${step.target_id
            .map((t) => (t.label ? `${t.id} (${t.label})` : t.id))
            .join(', ')}\n`;
        }

        return summary;
      })
      .join('\n');
  }
}
