import { createRuntime } from '../src/runtime/createRuntime';

describe('MERT Steps 1-6 runtime', () => {
  test('restoring access improves AAC reliability without changing authority', () => {
    const runtime = createRuntime();
    runtime.emit('scenario.choice.committed', { choiceId: 'restore-access' });

    const state = runtime.kernel.snapshot();
    expect(state.communication.reliable).toBe(true);
    expect(state.access.positionQuality).toBe(2);
    expect(state.authority.selfAuthority).toBe(true);
    expect(state.authority.proxyActive).toBe(false);
  });

  test('AAC composition pauses simulation time', () => {
    const runtime = createRuntime();
    runtime.emit('communication.composition.changed', { active: true });
    runtime.scenario.tick(180);
    expect(runtime.kernel.snapshot().simulationSeconds).toBe(0);

    runtime.emit('communication.composition.changed', { active: false });
    runtime.scenario.tick(180);
    expect(runtime.kernel.snapshot().simulationSeconds).toBe(180);
  });

  test('diagnostic overshadowing invokes delayed world-state dynamics', () => {
    const runtime = createRuntime();
    runtime.emit('scenario.choice.committed', { choiceId: 'anchor-on-disability' });
    runtime.scenario.tick(179);
    expect(runtime.kernel.snapshot().systems.diagnosticOvershadowingRisk).toBe(25);

    runtime.scenario.tick(1);
    const state = runtime.kernel.snapshot();
    expect(state.systems.diagnosticOvershadowingRisk).toBe(92);
    expect(state.vitals.spo2).toBeLessThan(89);
    expect(runtime.scenario.getCurrentNodeId()).toBe('recognisable-deterioration');
  });

  test('protected invariants reject proxy authority inference', () => {
    const runtime = createRuntime();
    expect(() => runtime.emit('world.patch', {
      authority: {
        ...runtime.kernel.snapshot().authority,
        proxyActive: true,
      },
    })).toThrow(/proxy authority/i);
  });
});
