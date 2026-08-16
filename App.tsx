import React, { useRef, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, Pressable, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { createRuntime } from './src/runtime/createRuntime';

export default function App() {
  const runtimeRef = useRef(createRuntime());
  const runtime = runtimeRef.current;
  const [revision, setRevision] = useState(runtime.kernel.snapshot().revision);

  const refresh = () => setRevision(runtime.kernel.snapshot().revision);
  const choose = (choiceId: string) => {
    runtime.emit('scenario.choice.committed', { choiceId });
    refresh();
  };
  const advance = (seconds: number) => {
    runtime.scenario.tick(seconds);
    refresh();
  };

  const state = runtime.kernel.snapshot();

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="auto" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text accessibilityRole="header" style={styles.title}>MERT Engine · Steps 1–6</Text>
        <Text style={styles.subtitle}>Not My Baseline · declarative rules + VNN world-state dynamics</Text>

        <View accessible accessibilityLabel={`Simulation time ${state.simulationSeconds} seconds. Current node ${runtime.scenario.getCurrentNodeId()}.`} style={styles.card}>
          <Text style={styles.heading}>Simulation</Text>
          <Text>Node: {runtime.scenario.getCurrentNodeId()}</Text>
          <Text>Clock: {state.simulationSeconds}s {runtime.kernel.isPaused() ? 'PAUSED' : 'RUNNING'}</Text>
          <Text>Revision: {revision}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.heading}>World State</Text>
          <Text>HR {state.vitals.heartRate} · RR {state.vitals.respiratoryRate} · SpO₂ {state.vitals.spo2}%</Text>
          <Text>Temp {state.vitals.temperatureC}°C · SBP {state.vitals.systolicBp}</Text>
          <Text>AAC: {state.communication.available ? 'AVAILABLE' : 'UNAVAILABLE'} · {state.communication.reliable ? 'RELIABLE' : 'UNRELIABLE'}</Text>
          <Text>Decision authority: {state.authority.decisionMaker}</Text>
          <Text>Diagnostic overshadowing risk: {state.systems.diagnosticOvershadowingRisk}/100</Text>
        </View>

        <Text accessibilityRole="header" style={styles.heading}>Actions</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Restore communication and positioning access" style={styles.button} onPress={() => choose('restore-access')}>
          <Text style={styles.buttonText}>Restore AAC + Position</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Escalate to senior support" style={styles.button} onPress={() => choose('escalate')}>
          <Text style={styles.buttonText}>Escalate</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Choose diagnostic overshadowing branch" style={styles.button} onPress={() => choose('anchor-on-disability')}>
          <Text style={styles.buttonText}>Anchor on Baseline Disability</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Advance simulation by 180 seconds" style={styles.buttonSecondary} onPress={() => advance(180)}>
          <Text>Advance +180s</Text>
        </Pressable>

        <View accessible accessibilityLabel="Protected simulation invariants" style={styles.notice}>
          <Text style={styles.heading}>Protected invariants</Text>
          <Text>AAC failure ≠ incapacity</Text>
          <Text>Disability ≠ acute deterioration</Text>
          <Text>Model proposal ≠ clinical truth</Text>
          <Text>Educational simulation only</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { padding: 20, gap: 12, maxWidth: 820, width: '100%', alignSelf: 'center' },
  title: { fontSize: 28, fontWeight: '700' },
  subtitle: { fontSize: 16, marginBottom: 8 },
  card: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 6 },
  heading: { fontSize: 19, fontWeight: '700' },
  button: { borderWidth: 2, borderRadius: 10, padding: 16 },
  buttonSecondary: { borderWidth: 1, borderRadius: 10, padding: 16 },
  buttonText: { fontWeight: '700' },
  notice: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 4, marginTop: 8 },
});
