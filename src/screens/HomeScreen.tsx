/**
 * HomeScreen.tsx — ojowaPTM main screen.
 * Phone as Mic: stream your Android microphone to OBS over WiFi.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Switch,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { KeepAwake } from 'expo-keep-awake';
import * as Network from 'expo-network';
import { AudioCaptureService } from '../services/AudioCaptureService';
import { WiFiStreamService } from '../services/WiFiStreamService';
import type { AudioConfig, AudioSource, ObsConnection, StreamState } from '../types';
import { DEFAULT_AUDIO_CONFIG, DEFAULT_OBS_PORT, AUDIO_SOURCE_OPTIONS } from '../types';

export default function HomeScreen() {
  const [config, setConfig] = useState<AudioConfig>(DEFAULT_AUDIO_CONFIG);
  const [connection, setConnection] = useState<ObsConnection>({
    host: '',
    port: DEFAULT_OBS_PORT,
  });
  const [state, setState] = useState<StreamState>({
    isConnected: false,
    isStreaming: false,
    isMuted: false,
    level: 0,
    error: null,
    obshost: null,
    obsport: null,
  });
  const [ipAddress, setIpAddress] = useState<string>('');
  const [levelInterval, setLevelInterval] = useState<any>(null);
  const [audioSource, setAudioSource] = useState<AudioSource>('mic');

  const toggleStream = async () => {
    if (state.isStreaming) {
      await AudioCaptureService.stopCapture();
      WiFiStreamService.disconnect();
      if (levelInterval) clearInterval(levelInterval);
      setState((prev) => ({ ...prev, isStreaming: false, isConnected: false, level: 0 }));
      return;
    }

    if (!connection.host) {
      Alert.alert('Enter OBS IP', 'Please type the IP address of the PC running OBS.');
      return;
    }

    setState((prev) => ({ ...prev, error: null }));

    const connected = await WiFiStreamService.connect(connection, handleStateChange);
    if (!connected) {
      setState((prev) => ({ ...prev, error: 'Failed to connect to OBS. Check IP/port.' }));
      return;
    }

    const started = await AudioCaptureService.startCapture(
      config,
      (pcm) => {
        if (!state.isMuted && WiFiStreamService.isConnected()) {
          WiFiStreamService.sendPcm(config, pcm);
        }
      },
      (level) => {
        setState((prev) => ({ ...prev, level }));
      }
    );

    if (!started) {
      WiFiStreamService.disconnect();
      setState((prev) => ({ ...prev, error: 'Failed to start microphone capture.' }));
      return;
    }

    setState((prev) => ({ ...prev, isStreaming: true }));
  };

  const toggleMute = () => {
    setState((prev) => ({ ...prev, isMuted: !prev.isMuted }));
  };

  const updateHost = (text: string) => {
    setConnection((prev) => ({ ...prev, host: text }));
  };

  const updatePort = (text: string) => {
    const p = parseInt(text, 10) || DEFAULT_OBS_PORT;
    setConnection((prev) => ({ ...prev, port: p }));
  };

  const updateAudioSource = (source: AudioSource) => {
    setAudioSource(source);
    setConfig((prev) => ({ ...prev, audioSource: source }));
  };
  useEffect(() => {
    (async () => {
      try {
        const ip = await Network.getIpAddressAsync();
        setIpAddress(ip);
      } catch {
        setIpAddress('unknown');
      }
    })();
  }, []);

  useEffect(() => {
    return () => {
      if (levelInterval) clearInterval(levelInterval);
      WiFiStreamService.disconnect();
    };
  }, []);

  const handleStateChange = useCallback(
    ({ connected, error }: { connected: boolean; error: string | null }) => {
      setState((prev) => ({ ...prev, isConnected: connected, error }));
      if (!connected) {
        setState((prev) => ({ ...prev, isStreaming: false }));
      }
    },
    []
  );
  return (
    <KeepAwake keepAwake={state.isStreaming}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <StatusBar style="light" />

        <View style={styles.header}>
          <Text style={styles.title}>ojowaPTM</Text>
          <Text style={styles.subtitle}>Phone as Mic for OBS</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Your Phone IP</Text>
          <Text style={styles.ipText}>{ipAddress}</Text>
          <Text style={styles.ipHint}>
            Enter the OBS PC IP below to stream to it
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>OBS PC (WiFi)</Text>
          <TextInput
            style={styles.input}
            placeholder="OBS PC IP address"
            value={connection.host}
            onChangeText={updateHost}
            autoCapitalize="none"
            spellCheck={false}
          />
          <TextInput
            style={styles.input}
            placeholder="Port"
            value={String(connection.port)}
            onChangeText={updatePort}
            keyboardType="numeric"
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Audio Source</Text>
          <View style={styles.sourceRow}>
            {AUDIO_SOURCE_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.sourceButton,
                  audioSource === opt.value ? styles.sourceButtonActive : null,
                ]}
                onPress={() => updateAudioSource(opt.value)}
              >
                <Text style={[styles.sourceText, audioSource === opt.value ? styles.sourceTextActive : null]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.button, state.isStreaming ? styles.buttonLive : styles.buttonIdle]}
            onPress={toggleStream}
          >
            <Text style={styles.buttonText}>
              {state.isStreaming ? 'STOP STREAMING' : 'START STREAMING'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.muteButton} onPress={toggleMute}>
            <Text style={styles.muteText}>
              {state.isMuted ? 'UNMUTE' : 'MUTE MIC'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.meterCard}>
          <Text style={styles.sectionTitle}>Mic Level</Text>
          <View style={styles.meterTrack}>
            <View style={[styles.meterFill, { width: state.level * 100 + '%' }]} />
          </View>
          <Text style={styles.levelText}>
            {Math.round(state.level * 100)}%
          </Text>
        </View>

        <View style={styles.statusCard}>
          <Text style={styles.statusLabel}>Status:</Text>
          <Text style={[styles.statusValue, state.isStreaming ? styles.statusLive : styles.statusIdle]}>
            {state.isStreaming
              ? `Streaming to ${connection.host}:${connection.port}`
              : state.isConnected
              ? 'Connected to OBS'
              : 'Idle'}
          </Text>
          {state.error && (
            <Text style={styles.errorText}>{state.error}</Text>
          )}
        </View>

        {state.isStreaming && (
          <ActivityIndicator size="large" color="#0a84ff" style={styles.spinner} />
        )}
      </ScrollView>
    </KeepAwake>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0d12',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 15,
    color: '#8e93a0',
    marginTop: 6,
  },
  card: {
    backgroundColor: '#161b22',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#212833',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8e93a0',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  ipText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0a84ff',
    fontFamily: 'monospace',
  },
  ipHint: {
    fontSize: 12,
    color: '#8e93a0',
    marginTop: 4,
  },
  input: {
    backgroundColor: '#0d1117',
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 10,
    color: '#c9d1d9',
    padding: 12,
    fontSize: 15,
    marginBottom: 10,
  },
  controls: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  button: {
    flex: 1,
    backgroundColor: '#0a84ff',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonLive: {
    backgroundColor: '#ff453a',
  },
  buttonIdle: {
    opacity: 1,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  muteButton: {
    width: 70,
    backgroundColor: '#30363d',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  muteText: {
    color: '#c9d1d9',
    fontSize: 12,
    fontWeight: '700',
  },
  meterCard: {
    backgroundColor: '#161b22',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#212833',
    alignItems: 'center',
  },
  meterTrack: {
    width: '100%',
    height: 12,
    backgroundColor: '#212833',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 8,
  },
  meterFill: {
    height: '100%',
    backgroundColor: '#30d158',
    width: '0%',
  },
  levelText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#c9d1d9',
  },
  statusCard: {
    backgroundColor: '#161b22',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#212833',
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8e93a0',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  statusValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#c9d1d9',
  },
  statusLive: {
    color: '#30d158',
  },
  statusIdle: {
    color: '#8e93a0',
  },
  errorText: {
    color: '#ff453a',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
  },
  sourceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  sourceButton: {
    backgroundColor: '#212833',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  sourceButtonActive: {
    backgroundColor: '#0a84ff',
    borderColor: '#0a84ff',
  },
  sourceText: {
    color: '#8e93a0',
    fontSize: 12,
    fontWeight: '600',
  },
  sourceTextActive: {
    color: '#ffffff',
  },
  spinner: {
    marginTop: 16,
  },
});