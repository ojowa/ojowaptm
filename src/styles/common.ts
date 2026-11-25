/**
 * src/styles/common.ts — Shared design tokens and styles for ojowaPTM screens.
 * Extracted to prevent UI drift between HomeScreen and StreamingScreen.
 */

import { StyleSheet, TextStyle, ViewStyle } from 'react-native';

// --- Color palette ---
export const COLORS = {
  background: '#0b0d12',
  card: '#161b22',
  cardBorder: '#212833',
  surface: '#0d1117',
  surfaceBorder: '#30363d',
  text: '#c9d1d9',
  textMuted: '#8e93a0',
  textInverse: '#ffffff',
  accent: '#0a84ff',
  success: '#30d158',
  successBg: '#1a3d2e',
  warning: '#f0b429',
  warningBg: '#3d3a1a',
  error: '#ff453a',
  errorBg: '#3d1a1a',
  buttonIdle: '#0a84ff',
  buttonLive: '#ff453a',
  meterFill: '#30d158',
  meterTrack: '#212833',
} as const;

// --- Base layout styles ---
export const baseStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: COLORS.textInverse,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 15,
    color: COLORS.textMuted,
    marginTop: 6,
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
  buttonText: {
    color: COLORS.textInverse,
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
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '700',
  },
  muteTextActive: {
    color: COLORS.success,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  helpText: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  sourceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap' as const,
    gap: 8,
  },
  sourceButton: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.surfaceBorder,
  },
  sourceButtonActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  sourceText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  sourceTextActive: {
    color: COLORS.textInverse,
  },
  meterCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  meterTrack: {
    width: '100%',
    height: 12,
    backgroundColor: COLORS.meterTrack,
    borderRadius: 6,
    overflow: 'hidden' as const,
  },
  meterFill: {
    height: '100%',
    backgroundColor: COLORS.meterFill,
    width: '0%',
  },
  levelText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  latencyDetail: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 6,
  },
  statusBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  infoRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    marginTop: 8,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    fontFamily: 'monospace',
  },
  errorCard: {
    backgroundColor: COLORS.errorBg,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.error,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  errorHint: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginBottom: 2,
  },
  statusConnected: {
    backgroundColor: COLORS.successBg,
    borderWidth: 1,
    borderColor: COLORS.success,
  },
  statusConnecting: {
    backgroundColor: COLORS.warningBg,
    borderWidth: 1,
    borderColor: COLORS.warning,
  },
  statusIdle: {
    backgroundColor: '#3d1a1a',
    borderWidth: 1,
    borderColor: COLORS.error,
  },
} as const);

// --- Status badge style helpers ---
export const statusBadgeStyles = {
  connected: baseStyles.statusConnected,
  connecting: baseStyles.statusConnecting,
  idle: baseStyles.statusIdle,
} as const;

// --- Button variant styles ---
export const buttonVariantStyles = {
  live: { backgroundColor: COLORS.buttonLive } as ViewStyle,
  idle: { backgroundColor: COLORS.buttonIdle } as ViewStyle,
  connecting: { opacity: 0.6 } as ViewStyle,
} as const;