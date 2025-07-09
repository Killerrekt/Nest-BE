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
      let nodeType = 'logic';

      if (ele.type === 'trigger') {
        nodeType = 'trigger';
      } else if (ele.type === 'ability' && abilitiesMap) {
        nodeType = abilitiesMap.get(ele.title) || 'logic';
      } else if (ele.type === 'agent') {
        nodeType = 'agent'; // Preserve agent type
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
          abilityType: ele.abilityType, // Preserve the original ability type
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

  // Reverse transformation: converts flow data back to ServiceStep array
  flowToService(flowData: FlowJson): ServiceStep[] {
    const { nodes, edges } = flowData;
    const steps: ServiceStep[] = [];

    // Create maps for efficient lookup
    const nodeMap = new Map<string, Node>();
    const connectionMap = new Map<
      string,
      Array<{
        targetId: string;
        label?: string;
        labelMain?: string;
      }>
    >();

    // Build node map
    nodes.forEach((node) => {
      nodeMap.set(node.id, node);
    });

    // Process edges to build connections
    edges.forEach((edge) => {
      if (!connectionMap.has(edge.source)) {
        connectionMap.set(edge.source, []);
      }

      connectionMap.get(edge.source)!.push({
        targetId: edge.target,
        label: edge.label,
        labelMain: edge.data?.label,
      });
    });

    // Find the starting node (trigger)
    const startNode = nodes.find((node) => node.data.type === 'trigger');
    if (!startNode) {
      throw new Error('No trigger node found in the flow');
    }

        // Helper function to determine condition priority for sorting
    const getConditionPriority = (label: string | undefined): number => {
      if (!label) return 2; // No label gets middle priority
      
      const lowerLabel = label.toLowerCase();
      
      // Negative conditions (should come first)
      if (lowerLabel.includes('no') || 
          lowerLabel.includes('false') || 
          lowerLabel.includes('fail') || 
          lowerLabel.includes('error') || 
          lowerLabel.includes('reject') ||
          lowerLabel.includes('denied')) {
        return 0;
      }
      
      // Positive conditions (should come second)
      if (lowerLabel.includes('yes') || 
          lowerLabel.includes('true') || 
          lowerLabel.includes('success') || 
          lowerLabel.includes('pass') || 
          lowerLabel.includes('accept') ||
          lowerLabel.includes('approved')) {
        return 1;
      }
      
      // Unknown conditions get middle priority
      return 2;
    };

    // Use efficient breadth-first traversal with inline terminal processing
    const orderedNodes: Node[] = [];
    const visited = new Set<string>();
    const queue: string[] = [startNode.id];
    
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);
      
      const node = nodeMap.get(nodeId);
      if (!node) continue;
      
      orderedNodes.push(node);
      
      // Get and sort connections in one pass
      const connections = connectionMap.get(nodeId) || [];
      const sortedConnections = connections.sort((a, b) => {
        const priorityA = getConditionPriority(a.label);
        const priorityB = getConditionPriority(b.label);
        return priorityA - priorityB;
      });
      
      // Process connections: terminals first, then main flow
      const mainFlowQueue: string[] = [];
      
      for (const conn of sortedConnections) {
        const targetNode = nodeMap.get(conn.targetId);
        if (!targetNode || visited.has(conn.targetId)) continue;
        
        const targetConnections = connectionMap.get(conn.targetId) || [];
        
        // If target has no further connections, it's a terminal node - add immediately
        if (targetConnections.length === 0) {
          visited.add(conn.targetId);
          orderedNodes.push(targetNode);
        } else {
          // Main flow node - add to queue for next iteration
          mainFlowQueue.push(conn.targetId);
        }
      }
      
      // Add main flow nodes to queue in order
      queue.unshift(...mainFlowQueue);
    }

    // Convert ordered nodes to ServiceStep format
    orderedNodes.forEach((node, index) => {
      // Get connections for this node
      const connections = connectionMap.get(node.id) || [];

      // Build target_id array
      const target_id = connections.map((conn) => ({
        id: conn.targetId,
        label: conn.label,
        labelMain: conn.labelMain,
      }));

      // Determine step type based on node data type
      let stepType = 'ability'; // default
      if (node.data.type === 'trigger') {
        stepType = 'trigger';
      } else if (node.data.type === 'logic' && node.data.inputs?.length > 0) {
        // If it has condition inputs, it's a conditional step
        stepType = 'if';
      } else if (node.data.type === 'logic') {
        stepType = 'default';
      } else if (['action'].includes(node.data.type || '')) {
        stepType = 'ability';
      } else if (['agent'].includes(node.data.type || '')) {
        stepType = 'agent';
      }

      // Extract condition from inputs if it's a conditional node
      let condition: string | undefined;
      if (stepType === 'if' && node.data.inputs?.length > 0) {
        const conditionInput = node.data.inputs.find(
          (input) => input.title === 'Condition',
        );
        condition = conditionInput?.placeholder;
      }

      // Use proper step number based on traversal order
      const step_no = index + 1;

      const serviceStep: ServiceStep = {
        id: node.id,
        type: stepType,
        target_id: target_id,
        step_no: step_no,
        title: node.data.title,
        description: node.data.description,
        icon: node.data.icon,
        abilityType: node.data.type, // Include the original node data type
      };

      // Add condition for conditional steps
      if (condition) {
        serviceStep.condition = condition;
      }

      steps.push(serviceStep);
    });

    return steps;
  }
}
