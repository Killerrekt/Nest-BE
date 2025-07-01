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

  @Post('test')
  simpleTest(@Body() body: any): any {
    console.log('Simple test endpoint hit');
    console.log('Body received:', body);
    return {
      message: 'Test endpoint working',
      body: body,
      hasDescription: !!body?.description,
    };
  }

    @Post()
  async getFlowJson(
    @Body() AgentToFlowJSON: any,
    @Res() res: Response,
  ): Promise<any> {
    try {
      // Debug log to see what we're receiving
      console.log('=== REQUEST DEBUG ===');
      console.log('Received request body:', JSON.stringify(AgentToFlowJSON, null, 2));
      console.log('Type of AgentToFlowJSON:', typeof AgentToFlowJSON);
      console.log('AgentToFlowJSON exists:', !!AgentToFlowJSON);

      // Process abilities array
      let transformedAbilities: any[] = [];
      if (AgentToFlowJSON.abilities && Array.isArray(AgentToFlowJSON.abilities)) {
        console.log('=== PROCESSING ABILITIES ===');
        console.log('Original abilities:', JSON.stringify(AgentToFlowJSON.abilities, null, 2));
        
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
        
        console.log('Transformed abilities:', JSON.stringify(transformedAbilities, null, 2));
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
      const rawSchema = AgentToFlowJSON.input_schema;

      const inputFields = parseAgentInputSchema(rawSchema);

      console.log('Input fields:', JSON.stringify(inputFields, null, 2));

      const content = `You are an agent responsible for creating workflows that don't have any knowledge about ability and trigger other than the provided one.
      The output returned should be an array that shows the step by step breakdown of the workflow. Try keeping the number of steps to a minimum.
      Each step should have the general format of 
      {
          id : string //unique
          type : string //can only be ability,if,loop or trigger
          target_id? : {id : string// id of next step, 
                        label? : string// explains how are they connected }[]
          step_no : int //the level of the node in this workflow tree.
          condition? : string // if conditional mention the condition
          title : string, 
          description : string,
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

      If you are able to create an workflow return status 200 along with the output or else return the following json :-
      {
        staus : 400,
        reason : string // why did it fail
      }

      Here is a text :- ${agentDescription}. From this extract a basic workflow and create it based on the rules declared above.
    `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: content,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
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
                      id: { type: Type.STRING },
                      label: { type: Type.STRING },
                    },
                    required: ['id'],
                  },
                },
                step_no: { type: Type.INTEGER },
                condition: { type: Type.STRING },
                title: { type: Type.STRING },
                description: { type: Type.STRING },
              },
              required: ['id', 'type', 'step_no', 'target_id', 'description'],
            },
          },
        },
      });

      if (!response.text) {
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          error: 'No response received from AI service.',
        });
      }

      const data = JSON.parse(response.text);
      console.log('AI Response:', data);

      if (data.status === 400) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          error: data.reason || 'AI could not create workflow.',
        });
      }

      if (!Array.isArray(data)) {
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          error: 'Invalid response format from AI service.',
        });
      }

      const transformedData = this.flowTransformationService.serviceToFlow(data as ServiceStep[]);

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
