import { DeclarativeScenarioEngine } from '../core/DeclarativeScenarioEngine';
import { SimulationKernel } from '../core/SimulationKernel';
import type { JsonValue, SimulationEvent } from '../core/types';
import { VNNDynamicsCoordinator } from '../modules/VNNDynamics';
import { initialWorldState, notMyBaselineScenario } from '../scenarios/notMyBaseline';

export function createRuntime() {
  const kernel = new SimulationKernel(initialWorldState);
  new VNNDynamicsCoordinator(kernel);
  const scenario = new DeclarativeScenarioEngine(notMyBaselineScenario, kernel);

  const emit = (type: string, payload: JsonValue, source = 'app'): void => {
    const event: SimulationEvent = {
      id: `${source}-${type}-${kernel.auditLog().length + 1}`,
      type,
      source,
      atSimulationSeconds: kernel.snapshot().simulationSeconds,
      payload,
    };
    kernel.emit(event);
    scenario.handle(event);
  };

  return { kernel, scenario, emit };
}
