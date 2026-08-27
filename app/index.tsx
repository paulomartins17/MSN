import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

type StatusType = 'online' | 'busy' | 'away' | 'offline';

interface MsnAvatar {
  id: string;
  emoji: string;
  label: string;
  color: string;
}

const MSN_AVATARS: MsnAvatar[] = [
  { id: 'butterfly', emoji: '🦋', label: 'Borboleta', color: '#86efac' }, // Green butterfly
  { id: 'duck', emoji: '🦆', label: 'Patinho', color: '#fef08a' }, // Yellow duck
  { id: 'soccer', emoji: '⚽', label: 'Futebol', color: '#e2e8f0' }, // Soccer ball
  { id: 'flower', emoji: '🌻', label: 'Girassol', color: '#fde047' }, // Sunflower
  { id: 'game', emoji: '🎮', label: 'Controle', color: '#c084fc' }, // Gamepad
  { id: 'heart', emoji: '💖', label: 'Coração', color: '#fda4af' }, // Pink heart
  { id: 'cat', emoji: '🐱', label: 'Gatinho', color: '#ffedd5' } // Kitten
];

export default function LoginScreen() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [apiUrl, setApiUrl] = useState('http://localhost:3000');
  const [status, setStatus] = useState<StatusType>('online');
  const [showStatusPicker, setShowStatusPicker] = useState(false);

  // Selected Avatar index
  const [avatarIndex, setAvatarIndex] = useState(0);

  // Checkboxes
  const [rememberMe, setRememberMe] = useState(true);
  const [autoSignIn, setAutoSignIn] = useState(false);

  // Auto-detect Host IP for Expo Go on physical devices
  useEffect(() => {
    const hostUri = Constants.expoConfig?.hostUri || '';
    if (hostUri) {
      const ip = hostUri.split(':')[0];
      // Validate that it looks like an IP address to avoid ngrok/tunnel issues
      if (/^[0-9.]+$/.test(ip)) {
        setApiUrl(`http://${ip}:3000`);
        return;
      }
    }

    // Fallbacks
    if (Platform.OS === 'android') {
      setApiUrl('http://10.0.2.2:3000');
    } else {
      setApiUrl('http://localhost:3000');
    }
  }, []);

  const handleNextAvatar = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAvatarIndex((prev) => (prev + 1) % MSN_AVATARS.length);
  };

  const handlePrevAvatar = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAvatarIndex((prev) => (prev - 1 + MSN_AVATARS.length) % MSN_AVATARS.length);
  };

  const handleEnter = () => {
    if (!username.trim()) {
      alert('Por favor, informe seu nome antes de entrar.');
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Navigate to Chat Screen, passing name, status, api url and avatar
    router.replace({
      pathname: '/chat',
      params: {
        name: username.trim(),
        status,
        apiUrl: apiUrl.trim(),
        avatar: MSN_AVATARS[avatarIndex].emoji
      }
    });
  };

  const getStatusColor = (s: StatusType) => {
    switch (s) {
      case 'online': return '#22c55e'; // green
      case 'busy': return '#ef4444'; // red
      case 'away': return '#eab308'; // orange
      case 'offline': return '#64748b'; // grey
    }
  };

  const getStatusLabel = (s: StatusType) => {
    switch (s) {
      case 'online': return 'Online';
      case 'busy': return 'Ocupado';
      case 'away': return 'Ausente';
      case 'offline': return 'Invisível';
    }
  };

  const currentAvatar = MSN_AVATARS[avatarIndex];

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContainer} bounces={false}>
          {/* Decorative glass elements in the background */}
          <View style={[styles.bgCircle, styles.circle1]} />
          <View style={[styles.bgCircle, styles.circle2]} />
          <View style={[styles.bgCircle, styles.circle3]} />

          {/* MSN Glassmorphic Card */}
          <View style={styles.card}>
            {/* Window title bar style (Y2K style window header) */}
            <View style={styles.windowHeader}>
              <View style={styles.msnLogoHeader}>
                <View style={[styles.logoMiniFigure, { backgroundColor: '#60a5fa' }]} />
                <View style={[styles.logoMiniFigure, { backgroundColor: '#34d399', marginLeft: 4 }]} />
              </View>
              <Text style={styles.windowTitle}>Girly Chat 2000</Text>
              <View style={styles.windowControls}>
                <View style={styles.controlBtn} />
                <View style={styles.controlBtn} />
                <View style={[styles.controlBtn, styles.closeBtn]} />
              </View>
            </View>

            {/* Content Container (Two columns like MSN login) */}
            <View style={styles.mainContent}>
              {/* Left Column: Form & Fields */}
              <View style={styles.leftColumn}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Endereço de Entrada (Apelido):</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="mail-outline" size={16} color="#64748b" style={styles.inputIcon} />
                    <TextInput
                      value={username}
                      onChangeText={setUsername}
                      placeholder="ex: fulano_de_tal"
                      placeholderTextColor="rgba(71, 85, 105, 0.5)"
                      style={styles.input}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Servidor de API:</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="server-outline" size={16} color="#64748b" style={styles.inputIcon} />
                    <TextInput
                      value={apiUrl}
                      onChangeText={setApiUrl}
                      placeholder="http://localhost:3000"
                      placeholderTextColor="rgba(71, 85, 105, 0.5)"
                      style={styles.input}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                </View>

                {/* Seletor de Status MSN */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Entrar com Status:</Text>
                  <TouchableOpacity
                    style={styles.statusPickerButton}
                    onPress={() => setShowStatusPicker(!showStatusPicker)}
                  >
                    <View style={styles.statusPickerContent}>
                      <View style={[styles.statusDot, { backgroundColor: getStatusColor(status) }]} />
                      <Text style={styles.statusText}>{getStatusLabel(status)}</Text>
                    </View>
                    <Ionicons
                      name={showStatusPicker ? "chevron-up" : "chevron-down"}
                      size={14}
                      color="#64748b"
                    />
                  </TouchableOpacity>

                  {showStatusPicker && (
                    <View style={styles.statusDropdown}>
                      {(['online', 'busy', 'away', 'offline'] as StatusType[]).map((s) => (
                        <TouchableOpacity
                          key={s}
                          style={styles.statusDropdownItem}
                          onPress={() => {
                            setStatus(s);
                            setShowStatusPicker(false);
                          }}
                        >
                          <View style={[styles.statusDot, { backgroundColor: getStatusColor(s) }]} />
                          <Text style={styles.statusDropdownText}>{getStatusLabel(s)}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>

                {/* MSN Checkboxes */}
                <View style={styles.checkboxArea}>
                  <TouchableOpacity
                    style={styles.checkboxRow}
                    onPress={() => setRememberMe(!rememberMe)}
                  >
                    <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                      {rememberMe && <Ionicons name="checkmark" size={12} color="white" />}
                    </View>
                    <Text style={styles.checkboxLabel}>Lembrar-me</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.checkboxRow}
                    onPress={() => setAutoSignIn(!autoSignIn)}
                  >
                    <View style={[styles.checkbox, autoSignIn && styles.checkboxChecked]}>
                      {autoSignIn && <Ionicons name="checkmark" size={12} color="white" />}
                    </View>
                    <Text style={styles.checkboxLabel}>Entrar automaticamente</Text>
                  </TouchableOpacity>
                </View>

                {/* Sign In Button */}
                <TouchableOpacity style={styles.button} onPress={handleEnter}>
                  <Text style={styles.buttonText}>Entrar</Text>
                </TouchableOpacity>
              </View>

              {/* Right Column: Square MSN Avatar Display */}
              <View style={styles.rightColumn}>
                <View style={styles.avatarCardWrapper}>
                  <View style={[styles.avatarBox, { backgroundColor: currentAvatar.color }]}>
                    <Text style={styles.avatarEmoji}>{currentAvatar.emoji}</Text>
                  </View>
                  <View style={styles.avatarNavigation}>
                    <TouchableOpacity style={styles.navArrow} onPress={handlePrevAvatar}>
                      <Ionicons name="chevron-back" size={18} color="#0f172a" />
                    </TouchableOpacity>
                    <Text style={styles.avatarLabel}>{currentAvatar.label}</Text>
                    <TouchableOpacity style={styles.navArrow} onPress={handleNextAvatar}>
                      <Ionicons name="chevron-forward" size={18} color="#0f172a" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          </View>


        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#9abfe6', // Classic MSN Messenger Blue base
  },
  keyboardView: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    position: 'relative',
  },
  bgCircle: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.6,
  },
  circle1: {
    width: 320,
    height: 320,
    backgroundColor: '#818cf8', // Indigo blur blob
    top: -50,
    left: -50,
  },
  circle2: {
    width: 250,
    height: 250,
    backgroundColor: '#a5f3fc', // Cyan blob
    bottom: 50,
    right: -80,
  },
  circle3: {
    width: 180,
    height: 180,
    backgroundColor: '#fbcfe8', // Pink blob
    top: '40%',
    left: '80%',
  },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: 'rgba(255, 255, 255, 0.22)', // Highly transparent glassmorphism
    borderColor: 'rgba(255, 255, 255, 0.55)',
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
    overflow: 'hidden',
  },
  windowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.35)',
    paddingBottom: 10,
    marginBottom: 16,
  },
  msnLogoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  logoMiniFigure: {
    width: 10,
    height: 14,
    borderRadius: 3,
  },
  windowTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0c2340',
    flex: 1,
  },
  windowControls: {
    flexDirection: 'row',
    gap: 4,
  },
  controlBtn: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#e2e8f0',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  closeBtn: {
    backgroundColor: '#f87171',
  },
  mainContent: {
    flexDirection: 'row',
    gap: 16,
  },
  leftColumn: {
    flex: 3,
    gap: 12,
  },
  rightColumn: {
    flex: 2,
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  inputGroup: {
    gap: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1e3a8a', // Classic retro blue
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.45)', // Translucent input
    borderColor: 'rgba(255, 255, 255, 0.65)',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  inputIcon: {
    marginRight: 6,
  },
  input: {
    flex: 1,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '600',
  },
  statusPickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
    borderColor: 'rgba(255, 255, 255, 0.65)',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
  },
  statusPickerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 99,
    marginRight: 6,
  },
  statusText: {
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '600',
  },
  statusDropdown: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderColor: 'rgba(226, 232, 240, 0.8)',
    borderWidth: 1,
    borderRadius: 8,
    marginTop: 2,
    padding: 4,
    gap: 2,
  },
  statusDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  statusDropdownText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
  },
  checkboxArea: {
    gap: 6,
    marginTop: 4,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 16,
    height: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 4,
    marginRight: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
  },
  checkboxLabel: {
    fontSize: 11,
    color: '#1e293b',
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#0284c7',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 6,
    shadowColor: '#0284c7',
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  buttonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  avatarCardWrapper: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderColor: 'rgba(255, 255, 255, 0.55)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 8,
    alignItems: 'center',
    gap: 8,
    width: '100%',
  },
  avatarBox: {
    width: 80,
    height: 80,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: 'rgba(255, 255, 255, 0.65)',
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  avatarEmoji: {
    fontSize: 44,
  },
  avatarNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 4,
  },
  navArrow: {
    padding: 4,
  },
  avatarLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  footerText: {
    marginTop: 24,
    fontSize: 10,
    color: '#1e3a8a',
    opacity: 0.75,
    textAlign: 'center',
    fontWeight: 'bold',
  },
});
