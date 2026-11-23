/**
 * StreamingScreen.tsx — ojowaPTM active streaming screen.
 * Shows real-time meters, latency, and stop/mute controls while streaming.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Switch,
  ScrollView,
  ActivityIndicator,
  Alert,
  StatusBar,
  Platform,
} from 'react-native';
import { AudioCaptureService } from '../services/AudioCaptureService';
import { WiFiStreamService } from '../services/WiFiStreamService';
import { UltraLowLatencyStreamService } from '../services/UltraLowLatencyStreamService';
import type { AudioConfig, ObsConnection, StreamState } from '../types';
import { DEFAULT_AUDIO_CONFIG, DEFAULT_OBS_PORT } from '../types';

type StreamingScreenProps = {
  config: AudioConfig;
  connection: ObsConnection;
  state: StreamState;
  ultraLowLatency: boolean;
  onStop: () => void;
  onToggleMute: () => void;
  onToggleUltraLowLatency: (value: boolean) => void;
  onUpdateAudioSource: (source: string) => void;
  audioSource: string;
};

export default function StreamingScreen({
  config,
  connection,
  state,
  ultraLowLatency,
  onStop,
  onToggleMute,
  onToggleUltraLowLatency,
  onUpdateAudioSource,
  audioSource,
}: StreamingScreenProps) {
  const [lastSendTime, setLastSendTime] = useState<number>(0);
  const [levelInterval, setLevelInterval] = useState<any>(null);

  useEffect(() => {
    if (state.isStreaming && !levelInterval) {
      const interval = setInterval(() => {
        setLastSendTime(Date.now());
      }, 1000);
      setLevelInterval(interval);
    }
    return () => {
      if (levelInterval) clearInterval(levelInterval);
    };
  }, [state.isStreaming, levelInterval]);

  const handleStop = useCallback(() => {
    onStop();
  }, [onStop]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>ojowaPTM</Text>
        <Text style={styles.subtitle}>Streaming to OBS</Text>
      </View>

      {/* Connection Status */}
      <View style={styles.card}>
        <View style={styles.statusRow}>
          <Text style={styles.sectionTitle}>Connection</Text>
          <View style={[styles.statusBadge, styles.statusStreaming]}>
            <Text style={styles.statusText}>STREAMING</Text>
          </View>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>OBS PC</Text>
          <Text style={styles.infoValue}>{connection.host}:{connection.port}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Your Phone IP</Text>
          <Text style={styles.infoValue}>{state.obshost || '—'}</Text>
        </View>
      </View>

      {/* Main Controls */}
      <View style={styles.controls}>
        <TouchableOpacity style={[styles.button, styles.buttonLive]} onPress={handleStop}>
          <Text style={styles.buttonText}>STOP STREAMING</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.muteButton} onPress={onToggleMute}>
          <Text style={[styles.muteText, state.isMuted && styles.muteTextActive]}>
            {state.isMuted ? 'UNMUTE' : 'MUTE MIC'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Meters */}
      <View style={styles.meterCard}>
        <View style={styles.meterHeader}>
          <Text style={styles.sectionTitle}>Mic Level</Text>
          <Text style={styles.levelText}>{Math.round(state.level * 100)}%</Text>
        </View>
        <View style={styles.meterTrack}>
          <View style={[styles.meterFill, { width: state.level * 100 + '%' }]} />
        </View>
      </View>

      <View style={styles.meterCard}>
        <View style={styles.meterHeader}>
          <Text style={styles.sectionTitle}>Latency</Text>
          <Text style={styles.levelText}>{state.level > 0 ? `${Math.round(state.level * 100)}ms` : '—'}</Text>
        </View>
        <View style={styles.meterTrack}>
          <View style={[styles.meterFill, { width: Math.min(state.level * 2, 1) * 100 + '%' }]} />
        </View>
        <Text style={styles.latencyDetail}>
          {lastSendTime > 0 ? `Last send: ${Date.now() - lastSendTime} ms ago` : 'Waiting…'}
        </Text>
      </View>

      {/* Settings while streaming */}
      <View style={styles.card}>
        <View style={styles.toggleRow}>
          <Text style={styles.sectionTitle}>Ultra-Low Latency</Text>
          <Switch
            value={ultraLowLatency}
            onValueChange={onToggleUltraLowLatency}
            disabled={true}
            thumbColor={ultraLowLatency ? '#30d158' : '#8e93a0'}
            trackColor={{ false: '#212833', true: '#1a3d2e' }}
          />
        </View>
        <Text style={styles.helpText}>
          {ultraLowLatency ? 'Native-only path: ~8-15ms latency' : 'Standard JS bridge: ~35-75ms latency'}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Audio Source</Text>
        <View style={styles.sourceRow}>
          {['mic', 'jack', 'default', 'voice_communication', 'voice_recognition', 'camcorder'].map((source) => (
            <TouchableOpacity
              key={source}
              style={[styles.sourceButton, audioSource === source ? styles.sourceButtonActive : null]}
              onPress={() => onUpdateAudioSource(source)}
            >
              <Text style={[styles.sourceText, audioSource === source ? styles.sourceTextActive : null]}>
                {source.charAt(0).toUpperCase() + source.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </ScrollView>
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
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusStreaming: {
    backgroundColor: '#1a3d2e',
    borderWidth: 1,
    borderColor: '#30d158',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8e93a0',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#c9d1d9',
    fontFamily: 'monospace',
  },
  controls: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  button: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  buttonLive: {
    backgroundColor: '#ff453a',
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
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
  muteTextActive: {
    color: '#30d158',
  },
  meterCard: {
    backgroundColor: '#161b22',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#212833',
  },
  meterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  meterTrack: {
    width: '100%',
    height: 12,
    backgroundColor: '#212833',
    borderRadius: 6,
    overflow: 'hidden',
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
  latencyDetail: {
    fontSize: 11,
    color: '#8e93a0',
    marginTop: 6,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8e93a0',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  helpText: {
    fontSize: 11,
    color: '#8e93a0',
    marginTop: 4,
  },
  sourceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sourceButton: {
    backgroundColor: '#212833',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
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
});
