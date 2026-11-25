import React, { Component, ErrorInfo } from 'react';
import { StyleSheet, View, Text, Button } from 'react-native';
import HomeScreen from './screens/HomeScreen';

// T23: Global JS error boundary to prevent red screen crashes
class ErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean; error: string | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): { hasError: boolean; error: string | null } {
    return { hasError: true, error: error.message };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ojowaPTM caught JS error:', error, errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.errorText}>ojowaPTM encountered an error.</Text>
          <Text style={styles.errorText}>{this.state.error}</Text>
          <Button title="Restart App" onPress={() => this.setState({ hasError: false, error: null })} />
        </View>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <View style={styles.container}>
      <ErrorBoundary>
        <HomeScreen />
      </ErrorBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0d12',
  },
  errorText: {
    color: '#ff453a',
    fontSize: 16,
    textAlign: 'center',
    margin: 20,
  },
});