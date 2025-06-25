import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { AgentToFlowJSON, AppService } from './app.service';

import { Response } from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import { ReduceAbilityResJson, ReduceTiggerResJson } from './json';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Post()
  async getFlowJson(
    @Body() AgentToFlowJSON: AgentToFlowJSON,
    @Res() res: Response,
  ): Promise<any> {
    const ai = new GoogleGenAI({
      apiKey: process.env.KEY,
    });

    const abilitiesJson = ReduceAbilityResJson();

    const triggers = ReduceTiggerResJson();

    const agentDescription = AgentToFlowJSON.agent.description;

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
              id: {
                type: Type.STRING,
              },
              type: {
                type: Type.STRING,
              },
              target_id: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: {
                      type: Type.STRING,
                    },
                    label: {
                      type: Type.STRING,
                    },
                  },
                  required: ['id'],
                },
              },
              step_no: {
                type: Type.INTEGER,
              },
              condition: {
                type: Type.STRING,
              },
              title: {
                type: Type.STRING,
              },
              description: {
                type: Type.STRING,
              },
            },
            required: ['id', 'type', 'step_no', 'target_id'],
          },
        },
      },
    });

    const data = response.text ? JSON.parse(response.text) : '';
    console.log(data);

    res.status(HttpStatus.CREATED).json({ data: data });

    return [];
  }
}
