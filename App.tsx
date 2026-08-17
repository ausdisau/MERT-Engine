import React, { useRef, useState } from 'react';
import { Platform, SafeAreaView, ScrollView, StyleSheet, Text, Pressable, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { createRuntime } from './src/runtime/createRuntime';
import { OpenWorldWeb } from './src/world/OpenWorldWeb';

export default function App() {
  if (Platform.OS === 'web') return <OpenWorldWeb />;
  return <MobileSimulation />;
}

function MobileSimulation() {
  const runtimeRef = useRef(createRuntime());
  const runtime = runtimeRef.current;
  const [revision, setRevision] = useState(runtime.kernel.snapshot().revision);
  const refresh = () => setRevision(runtime.kernel.snapshot().revision);
  const choose = (choiceId: string) => { runtime.emit('scenario.choice.committed', { choiceId }); refresh(); };
  const state = runtime.kernel.snapshot();

  return <SafeAreaView style={styles.safeArea}><StatusBar style="auto"/><ScrollView contentContainerStyle={styles.container}>
    <Text accessibilityRole="header" style={styles.title}>MERT Engine · Companion</Text>
    <Text>Open the web deployment on a WebXR headset for the immersive world.</Text>
    <View style={styles.card}>
      <Text style={styles.heading}>World State</Text>
      <Text>HR {state.vitals.heartRate} · RR {state.vitals.respiratoryRate} · SpO₂ {state.vitals.spo2}%</Text>
      <Text>AAC: {state.communication.available ? 'AVAILABLE' : 'UNAVAILABLE'} · {state.communication.reliable ? 'RELIABLE' : 'UNRELIABLE'}</Text>
      <Text>Decision authority: {state.authority.decisionMaker}</Text>
      <Text>Revision: {revision}</Text>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="Restore communication and positioning access" style={styles.button} onPress={()=>choose('restore-access')}><Text style={styles.buttonText}>Restore AAC + Position</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Escalate to senior support" style={styles.button} onPress={()=>choose('escalate')}><Text style={styles.buttonText}>Escalate</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Choose diagnostic overshadowing branch" style={styles.button} onPress={()=>choose('anchor-on-disability')}><Text style={styles.buttonText}>Anchor on Baseline Disability</Text></Pressable>
  </ScrollView></SafeAreaView>;
}

const styles=StyleSheet.create({safeArea:{flex:1},container:{padding:20,gap:12,maxWidth:820,width:'100%',alignSelf:'center'},title:{fontSize:28,fontWeight:'700'},card:{borderWidth:1,borderRadius:12,padding:16,gap:6},heading:{fontSize:19,fontWeight:'700'},button:{borderWidth:2,borderRadius:10,padding:16},buttonText:{fontWeight:'700'}});
