/**
 * HomeScreen.tsx — ojowaPTM main screen.
 * Phone as Mic: connect to OBS and stream your Android microphone over WiFi.
 * When streaming starts, renders StreamingScreen.
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
  PermissionsAndroid,
  NativeModules,
  NativeEventEmitter,
} from 'react-native';
import { AudioCaptureService } from '../services/AudioCaptureService';
import { WiFiStreamService } from '../services/WiFiStreamService';
import { UltraLowLatencyStreamService } from '../services/UltraLowLatencyStreamService';
import StreamingScreen from './StreamingScreen';
import type { AudioConfig, AudioSource, ObsConnection, StreamState, ObsServerInfo, StreamErrorType } from '../types';
import { DEFAULT_AUDIO_CONFIG, DEFAULT_OBS_PORT, DEFAULT_DISCOVERY_PORT, AUDIO_SOURCE_OPTIONS } from '../types';

const DISCOVERY_MAGIC = 'OPTM_DISCOVER';
const DISCOVERY_RESPONSE_MAGIC = 'OPTM_DISC_RESP';
const DISCOVERY_TIMEOUT_MS = 4000;

// Native UDP discovery module
const { ObsDiscovery } = NativeModules as {
  ObsDiscovery?: {
    startDiscovery(): void;
    stopDiscovery(): void;
  }
};

// Event emitter for discovery responses
const discoveryEmitter = new NativeEventEmitter(ObsDiscovery as any);

// Custom keep-awake hook using native Wakelock
const useKeepAwake = (enabled: boolean) => {
  const wakeLockRef = useRef<any>(null);
  useEffect(() => {
    if (Platform.OS === 'android' && enabled) {
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
          wakeLockRef.current = null;
        }
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
    isConnecting: false,
    isMuted: false,
    level: 0,
    error: null,
    errorType: null,
    nativeError: null,
    obshost: null,
    obsport: null,
    lastConnectedIP: null,
  });
  const [ipAddress, setIpAddress] = useState<string>('');
  const [audioSource, setAudioSource] = useState<AudioSource>('mic');
  const [ultraLowLatency, setUltraLowLatency] = useState<boolean>(false);
  const [discoveredServers, setDiscoveredServers] = useState<ObsServerInfo[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const discoverySubRef = useRef<any>(null);

  // ---- Handler functions (defined before use) ----

  const toggleMute = () => {
    setState((prev) => ({ ...prev, isMuted: !prev.isMuted }));
  };

  const handleStopStream = () => {
    if (ultraLowLatency) {
      UltraLowLatencyStreamService.disconnect();
    } else {
      AudioCaptureService.stopCapture();
      WiFiStreamService.disconnect();
    }
    setState((prev) => ({ ...prev, isStreaming: false, isConnected: false, level: 0, error: null }));
  };

  const updateHost = (text: string) => {
    setConnection((prev) => ({ ...prev, host: text }));
  };

  const updatePort = (text: string) => {
    const p = parseInt(text, 10) || DEFAULT_OBS_PORT;
    const port = Math.min(Math.max(p, 1024), 65535);
    setConnection((prev) => ({ ...prev, port }));
  };

  const updateAudioSource = (source: AudioSource) => {
    setAudioSource(source);
    setConfig((prev) => ({ ...prev, audioSource: source }));
  };

  const toggleStream = async () => {
    if (!connection.host) {
      Alert.alert('Enter OBS IP', 'Please type the IP address of the PC running OBS.');
      return;
    }

    // Request microphone permission
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: 'Microphone Permission',
          message: 'ojowaPTM needs access to your microphone to stream audio to OBS.',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        }
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert('Permission Required', 'Microphone permission is required to stream audio.');
        return;
      }
    }

    setState((prev) => ({ ...prev, error: null, isConnecting: true }));

    try {
      if (ultraLowLatency) {
        console.log('Starting ultra-low latency stream...');
        const connected = await UltraLowLatencyStreamService.connect(connection, handleStateChange);
        console.log('Ultra-low latency connect result:', connected);
        if (!connected) {
          setState((prev) => ({ ...prev, error: 'Failed to start ultra-low latency mode.' }));
          return;
        }
        setState((prev) => ({ ...prev, isStreaming: true }));
        console.log('Ultra-low latency streaming started');
      } else {
        const connected = await WiFiStreamService.connect(connection, handleStateChange);
        if (!connected) {
          setState((prev) => ({ ...prev, error: 'Failed to connect to OBS. Check IP/port.' }));
          return;
        }

        const started = await AudioCaptureService.startCapture(
          config,
          (pcm) => {
            if (!state.isMuted && WiFiStreamService.isConnected()) {
              const sendTime = Date.now();
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
      }
    } finally {
      setState((prev) => ({ ...prev, isConnecting: false }));
    }
  };

  const handleStateChange = useCallback(
    ({ connected, error, errorType, nativeError }: {
      connected: boolean;
      error: string | null;
      errorType: StreamErrorType | null;
      nativeError: string | null;
    }) => {
      setState((prev) => ({ ...prev, isConnected: connected, error, errorType, nativeError, lastConnectedIP: connection.host }));
      if (!connected) {
        setState((prev) => ({ ...prev, isStreaming: false }));
      }
    },
    [connection.host]
  );

  // ---- Effects ----

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
      WiFiStreamService.disconnect();
      if (discoverySubRef.current) {
        discoverySubRef.current.remove();
        discoverySubRef.current = null;
      }
      if (ObsDiscovery) {
        ObsDiscovery.stopDiscovery();
      }
    };
  }, []);

  // Auto-populate connection when exactly one OBS is discovered
  useEffect(() => {
    if (
      discoveredServers.length === 1 &&
      connection.host === '' &&
      state.lastConnectedIP === ''
    ) {
      const server = discoveredServers[0];
      setConnection((prev) => ({ ...prev, host: server.ip, port: server.port }));
      Alert.alert(
        'OBS Found',
        `Found OBS at ${server.ip}:${server.port}.\nTap START STREAMING to begin.`,
        [{ text: 'OK' }]
      );
    }
  }, [discoveredServers, connection.host, state.lastConnectedIP]);

  const discoverObsServers = useCallback(async () => {
    if (!ObsDiscovery) {
      return;
    }
    setIsDiscovering(true);
    setDiscoveredServers([]);

    discoverySubRef.current = discoveryEmitter.addListener('onObsDiscovered', (event: {
      ip: string;
      port: number;
      deviceName: string;
    }) => {
      setDiscoveredServers((prev) => {
        if (prev.some((s) => s.ip === event.ip && s.port === event.port)) {
          return prev;
        }
        return [...prev, { ip: event.ip, port: event.port, deviceName: event.deviceName }];
      });
    });

    ObsDiscovery.startDiscovery();

    setTimeout(() => {
      ObsDiscovery.stopDiscovery();
      setIsDiscovering(false);
      discoverySubRef.current?.remove();
      discoverySubRef.current = null;
    }, DISCOVERY_TIMEOUT_MS + 500);
  }, []);

  const handleDiscoverPress = useCallback(() => {
    discoverObsServers();
  }, []);

  useKeepAwake(state.isStreaming);

  // ---- Render ----

  // Render streaming screen when active
  if (state.isStreaming) {
    return (
      <StreamingScreen
        config={config}
        connection={connection}
        state={state}
        ultraLowLatency={ultraLowLatency}
        onStop={handleStopStream}
        onToggleMute={toggleMute}
        onToggleUltraLowLatency={setUltraLowLatency}
        onUpdateAudioSource={updateAudioSource}
        audioSource={audioSource}
      />
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>ojowaPTM</Text>
        <Text style={styles.subtitle}>Phone as Mic for OBS</Text>
      </View>

      {/* Connection Status */}
      <View style={styles.card}>
        <View style={styles.statusRow}>
          <Text style={styles.sectionTitle}>Connection</Text>
          <View style={[styles.statusBadge, state.isConnected ? styles.statusConnected : state.isConnecting ? styles.statusConnecting : styles.statusIdle]}>
            <Text style={styles.statusText}>
              {state.isConnected ? 'CONNECTED' : state.isConnecting ? 'CONNECTING…' : 'DISCONNECTED'}
            </Text>
          </View>
        </View>
        {state.lastConnectedIP && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Last Connected</Text>
            <Text style={styles.infoValue}>{state.lastConnectedIP}:{DEFAULT_OBS_PORT}</Text>
          </View>
        )}
      </View>

      {/* Your Phone IP */}
      <View style={styles.card}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Your Phone IP</Text>
          <Text style={styles.infoValue}>{ipAddress}</Text>
        </View>
      </View>

      {/* OBS PC Configuration */}
      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>OBS PC (WiFi)</Text>
          <TouchableOpacity style={styles.discoverButton} onPress={handleDiscoverPress} disabled={isDiscovering}>
            <Text style={styles.discoverButtonText}>{isDiscovering ? 'Scanning…' : 'Scan for OBS'}</Text>
          </TouchableOpacity>
        </View>
        {isDiscovering && <ActivityIndicator size="small" color="#0a84ff" style={styles.smallSpinner} />}
        {discoveredServers.length > 0 && (
          <View style={styles.discoveredList}>
            <Text style={styles.discoveredTitle}>Discovered OBS Servers</Text>
            {discoveredServers.map((server, index) => (
              <TouchableOpacity
                key={index}
                style={styles.discoveredItem}
                onPress={() => setConnection(prev => ({ ...prev, host: server.ip, port: server.port }))}
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
        <View style={styles.inputs}>
          <TextInput
            style={styles.input}
            placeholder="OBS PC IP address"
            value={connection.host}
            onChangeText={updateHost}
            autoCapitalize="none"
            spellCheck={false}
          />
          <TextInput
            style={[styles.input, styles.inputPort]}
            placeholder="Port"
            value={String(connection.port)}
            onChangeText={updatePort}
            keyboardType="numeric"
          />
        </View>
      </View>

      {/* Audio Source */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Audio Source</Text>
        <View style={styles.sourceRow}>
          {AUDIO_SOURCE_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.sourceButton, audioSource === opt.value ? styles.sourceButtonActive : null]}
              onPress={() => updateAudioSource(opt.value)}
            >
              <Text style={[styles.sourceText, audioSource === opt.value ? styles.sourceTextActive : null]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Ultra-Low Latency Toggle */}
      <View style={styles.card}>
        <View style={styles.toggleRow}>
          <Text style={styles.sectionTitle}>Ultra-Low Latency</Text>
          <Switch
            value={ultraLowLatency}
            onValueChange={setUltraLowLatency}
            disabled={state.isStreaming || state.isConnecting}
            thumbColor={ultraLowLatency ? '#30d158' : '#8e93a0'}
            trackColor={{ false: '#212833', true: '#1a3d2e' }}
          />
        </View>
        <Text style={styles.helpText}>
          {ultraLowLatency ? 'Native-only: ~8-15ms latency' : 'Standard JS bridge: ~35-75ms latency'}
        </Text>
      </View>

      {/* Main Controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.button, state.isStreaming ? styles.buttonLive : styles.buttonIdle, state.isConnecting && styles.buttonConnecting]}
          onPress={toggleStream}
          disabled={state.isConnecting}
        >
          {state.isConnecting && <ActivityIndicator size="small" color="#fff" style={styles.buttonSpinner} />}
          <Text style={styles.buttonText}>
            {state.isConnecting ? 'CONNECTING…' : state.isStreaming ? 'STOP STREAMING' : 'START STREAMING'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.muteButton} onPress={toggleMute} disabled={state.isConnecting || !state.isConnected}>
          <Text style={[styles.muteText, state.isMuted && styles.muteTextActive]}>
            {state.isMuted ? 'UNMUTE' : 'MUTE MIC'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Error Display */}
      {state.error && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{state.error}</Text>
          {state.errorType === 'network' && (
            <Text style={styles.errorHint}>
              Tip: Make sure OBS is running with the ojowaPTM plugin listening on port {connection.port}.
            </Text>
          )}
          {state.errorType === 'audio' && (
            <Text style={styles.errorHint}>
              Tip: Grant microphone permission and check the mic isn't in use by another app.
            </Text>
          )}
          {state.errorType === 'config' && (
            <Text style={styles.errorHint}>
              Tip: Check the OBS IP address and port settings.
            </Text>
          )}
        </View>
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
  statusConnected: {
    backgroundColor: '#1a3d2e',
    borderWidth: 1,
    borderColor: '#30d158',
  },
  statusConnecting: {
    backgroundColor: '#3d3a1a',
    borderWidth: 1,
    borderColor: '#f0b429',
  },
  statusIdle: {
    backgroundColor: '#3d1a1a',
    borderWidth: 1,
    borderColor: '#ff453a',
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
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8e93a0',
    textTransform: 'uppercase',
    letterSpacing: 1,
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
  smallSpinner: {
    marginTop: 8,
  },
  inputs: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#0d1117',
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 10,
    color: '#c9d1d9',
    padding: 12,
    fontSize: 15,
  },
  inputPort: {
    width: 100,
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
  buttonIdle: {
    backgroundColor: '#0a84ff',
  },
  buttonConnecting: {
    opacity: 0.6,
  },
  buttonSpinner: {
    marginRight: 8,
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
  errorCard: {
    backgroundColor: '#3d1a1a',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#ff453a',
  },
  errorText: {
    color: '#ff453a',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  errorHint: {
    color: '#8e93a0',
    fontSize: 11,
    marginBottom: 2,
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
});
