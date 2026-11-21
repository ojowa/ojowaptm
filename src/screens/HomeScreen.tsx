/**
 * HomeScreen.tsx — ojowaPTM main screen.
 * Phone as Mic: stream your Android microphone to OBS over WiFi.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
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
  StatusBar,
  Platform,
} from 'react-native';
import { AudioCaptureService } from '../services/AudioCaptureService';
import { WiFiStreamService } from '../services/WiFiStreamService';
import type { AudioConfig, AudioSource, ObsConnection, StreamState, ObsServerInfo } from '../types';
import { DEFAULT_AUDIO_CONFIG, DEFAULT_OBS_PORT, DEFAULT_DISCOVERY_PORT, AUDIO_SOURCE_OPTIONS } from '../types';

const DISCOVERY_MAGIC = 'OPTM_DISCOVER';
const DISCOVERY_RESPONSE_MAGIC = 'OPTM_DISC_RESP';

// Custom keep-awake hook using native Wakelock
const useKeepAwake = (enabled: boolean) => {
  const wakeLockRef = useRef<any>(null);
  
  useEffect(() => {
    if (Platform.OS === 'android' && enabled) {
      // Acquire wake lock via native module
      const PowerManager = require('react-native').NativeModules.PowerManager;
      if (PowerManager && PowerManager.acquireWakeLock) {
        PowerManager.acquireWakeLock();
        wakeLockRef.current = true;
      }
    }
    
    return () => {
      if (wakeLockRef.current) {
        const PowerManager = require('react-native').NativeModules.PowerManager;
        if (PowerManager && PowerManager.releaseWakeLock) {
          PowerManager.releaseWakeLock();
        }
        wakeLockRef.current = null;
      }
    };
  }, [enabled]);
};

// Get local IP address using react-native's native bridge
const getIpAddress = async (): Promise<string> => {
  if (Platform.OS === 'android') {
    const NetworkInfo = require('react-native').NativeModules.NetworkInfo;
    if (NetworkInfo && NetworkInfo.getIpAddress) {
      return await NetworkInfo.getIpAddress();
    }
  }
  return 'unknown';
};

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
  const [lastConnectedIP, setLastConnectedIP] = useState<string>('');
  const [discoveredServers, setDiscoveredServers] = useState<ObsServerInfo[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);

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
        const ip = await getIpAddress();
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

  // Auto-discovery of OBS PC on local network (simplified - manual entry only)
  // Note: Auto-discovery via UDP broadcast requires native modules
  // For now, manual IP entry is used. Auto-discovery can be added later with a native module.
  const discoverObsServers = useCallback(async () => {
    setIsDiscovering(true);
    setDiscoveredServers([]);
    // Auto-discovery not implemented in JS bundle - requires native module
    // For now, user must manually enter IP
    setTimeout(() => {
      setIsDiscovering(false);
    }, 1000);
  }, []);

  const handleDiscoverPress = useCallback(() => {
    discoverObsServers().then(() => {
      // Auto-discovery not implemented - user must enter IP manually
    });
  }, []);

  const handleStateChange = useCallback(
    ({ connected, error }: { connected: boolean; error: string | null }) => {
      setState((prev) => ({ ...prev, isConnected: connected, error }));
      if (connected) {
        setLastConnectedIP(connection.host);
      }
      if (!connected) {
        setState((prev) => ({ ...prev, isStreaming: false }));
      }
    },
    [connection.host]
  );

  useKeepAwake(state.isStreaming);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <StatusBar barStyle="light-content" />

        <View style={styles.header}>
          <Text style={styles.title}>ojowaPTM</Text>
          <Text style={styles.subtitle}>Phone as Mic for OBS</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.statusRow}>
            <Text style={styles.sectionTitle}>Connection Status</Text>
            <View style={[
              styles.statusIndicator,
              state.isConnected ? styles.statusConnected : styles.statusDisconnected
            ]}>
              <Text style={styles.statusText}>
                {state.isConnected ? 'Connected' : 'Disconnected'}
              </Text>
            </View>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.sectionTitle}>Your Phone IP</Text>
            <Text style={styles.ipText}>{ipAddress}</Text>
          </View>
          {lastConnectedIP && (
            <View style={styles.statusRow}>
              <Text style={styles.sectionTitle}>Last Connected To</Text>
              <Text style={styles.ipText}>{lastConnectedIP}:{DEFAULT_OBS_PORT}</Text>
            </View>
          )}
          <Text style={styles.ipHint}>
            Enter the OBS PC IP below to stream to it
          </Text>
        </View>

        <View style={styles.card}>
          <View>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>OBS PC (WiFi)</Text>
              <TouchableOpacity
                style={styles.discoverButton}
                onPress={handleDiscoverPress}
                disabled={isDiscovering}
              >
                <Text style={styles.discoverButtonText}>
                  {isDiscovering ? 'Scanning...' : 'Scan for OBS'}
                </Text>
              </TouchableOpacity>
            </View>
            {isDiscovering && <ActivityIndicator size="small" color="#0a84ff" style={{marginTop: 8}} />}
            {discoveredServers.length > 0 && (
              <View style={styles.discoveredList}>
                <Text style={styles.discoveredTitle}>Discovered OBS Servers:</Text>
                {discoveredServers.map((server, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.discoveredItem}
                    onPress={() => {
                      setConnection(prev => ({ ...prev, host: server.ip, port: server.port }));
                    }}
                  >
                    <View style={styles.discoveredItemInfo}>
                      <Text style={styles.discoveredItemIp}>{server.ip}:{server.port}</Text>
                      <Text style={styles.discoveredItemName}>{server.deviceName || 'OBS Studio'}</Text>
                    </View>
                    <Text style={styles.discoveredItemArrow}>▶</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <View>
              <TextInput
                style={styles.input}
                placeholder="OBS PC IP address (e.g., 192.168.1.100)"
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
          </View>
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
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusConnected: {
    backgroundColor: '#1a3d2e',
    borderWidth: 1,
    borderColor: '#30d158',
  },
  statusDisconnected: {
    backgroundColor: '#3d1a1a',
    borderWidth: 1,
    borderColor: '#ff453a',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
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
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  discoverButton: {
    backgroundColor: '#0a84ff',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  discoverButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  discoveredList: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#161b22',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  discoveredTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8e93a0',
    marginBottom: 8,
  },
  discoveredItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#0d1117',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  discoveredItemInfo: {
    flex: 1,
  },
  discoveredItemIp: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0a84ff',
    fontFamily: 'monospace',
  },
  discoveredItemName: {
    fontSize: 12,
    color: '#8e93a0',
    marginTop: 2,
  },
  discoveredItemArrow: {
    color: '#8e93a0',
    fontSize: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  discoverButton: {
    backgroundColor: '#0a84ff',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  discoverButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  discoveredList: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#161b22',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  discoveredTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8e93a0',
    marginBottom: 8,
  },
  discoveredItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#0d1117',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  discoveredItemInfo: {
    flex: 1,
  },
  discoveredItemIp: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0a84ff',
    fontFamily: 'monospace',
  },
  discoveredItemName: {
    fontSize: 12,
    color: '#8e93a0',
    marginTop: 2,
  },
  discoveredItemArrow: {
    color: '#8e93a0',
    fontSize: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  discoverButton: {
    backgroundColor: '#0a84ff',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  discoverButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  discoveredList: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#161b22',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  discoveredTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8e93a0',
    marginBottom: 8,
  },
  discoveredItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#0d1117',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  discoveredItemInfo: {
    flex: 1,
  },
  discoveredItemIp: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0a84ff',
    fontFamily: 'monospace',
  },
  discoveredItemName: {
    fontSize: 12,
    color: '#8e93a0',
    marginTop: 2,
  },
  discoveredItemArrow: {
    color: '#8e93a0',
    fontSize: 16,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusConnected: {
    backgroundColor: '#1a3d2e',
    borderWidth: 1,
    borderColor: '#30d158',
  },
  statusDisconnected: {
    backgroundColor: '#3d1a1a',
    borderWidth: 1,
    borderColor: '#ff453a',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
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
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  discoverButton: {
    backgroundColor: '#0a84ff',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  discoverButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  discoveredList: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#161b22',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  discoveredTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8e93a0',
    marginBottom: 8,
  },
  discoveredItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#0d1117',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  discoveredItemInfo: {
    flex: 1,
  },
  discoveredItemIp: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0a84ff',
    fontFamily: 'monospace',
  },
  discoveredItemName: {
    fontSize: 12,
    color: '#8e93a0',
    marginTop: 2,
  },
  discoveredItemArrow: {
    color: '#8e93a0',
    fontSize: 16,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusConnected: {
    backgroundColor: '#1a3d2e',
    borderWidth: 1,
    borderColor: '#30d158',
  },
  statusDisconnected: {
    backgroundColor: '#3d1a1a',
    borderWidth: 1,
    borderColor: '#ff453a',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
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
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  discoverButton: {
    backgroundColor: '#0a84ff',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  discoverButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  discoveredList: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#161b22',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  discoveredTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8e93a0',
    marginBottom: 8,
  },
  discoveredItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#0d1117',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  discoveredItemInfo: {
    flex: 1,
  },
  discoveredItemIp: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0a84ff',
    fontFamily: 'monospace',
  },
  discoveredItemName: {
    fontSize: 12,
    color: '#8e93a0',
    marginTop: 2,
  },
  discoveredItemArrow: {
    color: '#8e93a0',
    fontSize: 16,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusConnected: {
    backgroundColor: '#1a3d2e',
    borderWidth: 1,
    borderColor: '#30d158',
  },
  statusDisconnected: {
    backgroundColor: '#3d1a1a',
    borderWidth: 1,
    borderColor: '#ff453a',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
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
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  discoverButton: {
    backgroundColor: '#0a84ff',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  discoverButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  discoveredList: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#161b22',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  discoveredTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8e93a0',
    marginBottom: 8,
  },
  discoveredItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#0d1117',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  discoveredItemInfo: {
    flex: 1,
  },
  discoveredItemIp: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0a84ff',
    fontFamily: 'monospace',
  },
  discoveredItemName: {
    fontSize: 12,
    color: '#8e93a0',
    marginTop: 2,
  },
  discoveredItemArrow: {
    color: '#8e93a0',
    fontSize: 16,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusConnected: {
    backgroundColor: '#1a3d2e',
    borderWidth: 1,
    borderColor: '#30d158',
  },
  statusDisconnected: {
    backgroundColor: '#3d1a1a',
    borderWidth: 1,
    borderColor: '#ff453a',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
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
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  discoverButton: {
    backgroundColor: '#0a84ff',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  discoverButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  discoveredList: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#161b22',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  discoveredTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8e93a0',
    marginBottom: 8,
  },
  discoveredItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#0d1117',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  discoveredItemInfo: {
    flex: 1,
  },
  discoveredItemIp: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0a84ff',
    fontFamily: 'monospace',
  },
  discoveredItemName: {
    fontSize: 12,
    color: '#8e93a0',
    marginTop: 2,
  },
  discoveredItemArrow: {
    color: '#8e93a0',
    fontSize: 16,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusConnected: {
    backgroundColor: '#1a3d2e',
    borderWidth: 1,
    borderColor: '#30d158',
  },
  statusDisconnected: {
    backgroundColor: '#3d1a1a',
    borderWidth: 1,
    borderColor: '#ff453a',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
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
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  discoverButton: {
    backgroundColor: '#0a84ff',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  discoverButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  discoveredList: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#161b22',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  discoveredTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8e93a0',
    marginBottom: 8,
  },
  discoveredItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#0d1117',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  discoveredItemInfo: {
    flex: 1,
  },
  discoveredItemIp: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0a84ff',
    fontFamily: 'monospace',
  },
  discoveredItemName: {
    fontSize: 12,
    color: '#8e93a0',
    marginTop: 2,
  },
  discoveredItemArrow: {
    color: '#8e93a0',
    fontSize: 16,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusConnected: {
    backgroundColor: '#1a3d2e',
    borderWidth: 1,
    borderColor: '#30d158',
  },
  statusDisconnected: {
    backgroundColor: '#3d1a1a',
    borderWidth: 1,
    borderColor: '#ff453a',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
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
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  discoverButton: {
    backgroundColor: '#0a84ff',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  discoverButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  discoveredList: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#161b22',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  discoveredTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8e93a0',
    marginBottom: 8,
  },
  discoveredItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#0d1117',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  discoveredItemInfo: {
    flex: 1,
  },
  discoveredItemIp: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0a84ff',
    fontFamily: 'monospace',
  },
  discoveredItemName: {
    fontSize: 12,
    color: '#8e93a0',
    marginTop: 2,
  },
  discoveredItemArrow: {
    color: '#8e93a0',
    fontSize: 16,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusConnected: {
    backgroundColor: '#1a3d2e',
    borderWidth: 1,
    borderColor: '#30d158',
  },
  statusDisconnected: {
    backgroundColor: '#3d1a1a',
    borderWidth: 1,
    borderColor: '#ff453a',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
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

export default HomeScreen;