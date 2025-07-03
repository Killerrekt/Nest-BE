import { Injectable } from '@nestjs/common';
import { NodeSideBarData, FlowJson, ServiceStep, Node, Edge } from './type';

@Injectable()
export class FlowTransformationService {
  serviceToFlow(
    data: ServiceStep[],
    abilitiesMap?: Map<string, string>,
  ): FlowJson {
    console.log(data);
    const nodes: Node[] = [];
    const arr: {
      source: string;
      target: string;
      label?: string;
      labelMain?: string;
    }[] = [];
    const stepMap = new Map<string, number>();

    data.forEach((ele) => {
      const inputs: NodeSideBarData[] = [];

      if (ele.action) {
        inputs.push({
          title: 'Action',
          type: 'div',
          placeholder: ele.action,
        });
      } else if (ele.condition) {
        inputs.push({
          title: 'Condition',
          type: 'div',
          placeholder: ele.condition as string,
        });
      }

      stepMap.set(ele.id, ele.step_no);
      if (
        ele.target_id &&
        Array.isArray(ele.target_id) &&
        ele.target_id.length > 0
      ) {
        // Validate that target_id is an array of objects, not a flat array
        const isValidTargetArray = ele.target_id.every(
          (target) => target && typeof target === 'object' && target.id,
        );

        if (isValidTargetArray) {
          ele.target_id.forEach((target) =>
            arr.push({
              source: ele.id,
              target: target.id,
              label: target.label,
              labelMain: target.labelMain,
            }),
          );
        } else {
          console.error(
            `Invalid target_id format for ${ele.id}:`,
            ele.target_id,
          );
          console.error('Expected format: [{id: "string", label?: "string"}]');
          // Skip this step's connections due to invalid format
        }
      }

      // Determine node type based on step type and ability mapping
      let nodeType = 'logic'; // default

      if (ele.type === 'trigger') {
        nodeType = 'trigger';
      } else if (ele.type === 'ability' && abilitiesMap) {
        nodeType = abilitiesMap.get(ele.title) || 'logic';
      }

      const temp: Node = {
        id: ele.id,
        position: {
          x: 0,
          y: 0,
        },
        data: {
          title: ele.title,
          description: ele.description,
          inputs: inputs,
          icon: ele.icon || 'zap', // Use the icon from Claude response, fallback to 'zap'
          isIsland: false,
          type: nodeType, // Include the ability type from the original request, or 'logic' as default
        },
        type: 'custom',
      };
      nodes.push(temp);
    });

    const edges: Edge[] = [];
    let count = 1;
    const HandleMap = new Map<string, string[]>();
    arr.forEach((ele) => {
      // Skip if either source or target is missing
      if (!ele.target || !ele.source) {
        return;
      }

      const sourceStep = stepMap.get(ele.source);
      const targetStep = stepMap.get(ele.target);

      const LR1 = HandleMap.get(ele.source)?.includes('right')
        ? 'left'
        : 'right';

      const condition = sourceStep && targetStep && sourceStep > targetStep;
      const pos1 = condition ? LR1 : 'bottom';
      const pos2 = 'top';

      const temp = {
        id: `e${count}`,
        source: ele.source,
        sourceHandle: `${ele.source}-${pos1}`,
        target: ele.target,
        targetHandle: `${ele.target}-${pos2}`,
        label: ele.label,
        data: { label: ele.labelMain },
      };
      count += 1;

      const check = HandleMap.get(ele.source);
      HandleMap.set(ele.source, check ? [...check, pos1] : [pos1]);
      HandleMap.set(ele.target, check ? [...check, pos2] : [pos2]);

      edges.push(temp);
    });

    return {
      nodes: nodes,
      edges: edges,
    };
  }
}
