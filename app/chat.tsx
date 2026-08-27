import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Clipboard,
  Alert
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  runOnJS
} from 'react-native-reanimated';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';

interface Message {
  id: string;
  name: string;
  text: string;
  timestamp: string;
  ip?: string;
}

export default function ChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const name = (params.name as string) || 'FULANO';
  const initialStatus = (params.status as string) || 'online';
  const apiUrl = (params.apiUrl as string) || 'http://localhost:3000';
  const avatar = (params.avatar as string) || '🦋';

  const getAvatarForUser = (userName: string) => {
    if (userName === name) {
      return avatar;
    }
    const avatars = ['🦋', '🦆', '⚽', '🌻', '🎮', '💖', '🐱'];
    let hash = 0;
    for (let i = 0; i < userName.length; i++) {
      hash = userName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % avatars.length;
    return avatars[index];
  };

  const [messages, setMessages] = useState<Message[]>([]);
  const [deletedLocalIds, setDeletedLocalIds] = useState<string[]>([]);
  const [showTimeIds, setShowTimeIds] = useState<string[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Context Menu State
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [showMenu, setShowMenu] = useState(false);

  // Quoted Reply state
  const [replyTo, setReplyTo] = useState<Message | null>(null);

  // Screen shake animation
  const shakeOffset = useSharedValue(0);
  const processedNudges = useRef<Set<string>>(new Set());
  const flatListRef = useRef<FlatList>(null);

  // ── Register username on enter / release on leave ────────────────────────
  useEffect(() => {
    let mounted = true;

    const join = async () => {
      try {
        const res = await fetch(`${apiUrl}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name })
        });
        if (!mounted) return;
        if (res.status === 409) {
          const data = await res.json();
          Alert.alert(
            'Nome já em uso',
            data.error || `O nome "${name}" já está sendo usado. Escolha outro apelido.`,
            [{ text: 'OK', onPress: () => router.replace('/') }]
          );
        }
      } catch (_) {
        // Falha silenciosa — o servidor pode não ter o endpoint /join
      }
    };

    join();

    return () => {
      mounted = false;
      // Best-effort: libera o username ao sair
      fetch(`${apiUrl}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      }).catch(() => {});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Screen shake animation logic
  const triggerShakeEffect = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    
    shakeOffset.value = withSequence(
      withTiming(-12, { duration: 40 }),
      withTiming(12, { duration: 40 }),
      withTiming(-12, { duration: 40 }),
      withTiming(12, { duration: 40 }),
      withTiming(-8, { duration: 40 }),
      withTiming(8, { duration: 40 }),
      withTiming(-4, { duration: 40 }),
      withTiming(4, { duration: 40 }),
      withTiming(0, { duration: 40 })
    );
  }, [shakeOffset]);

  // Shared status dot color helper
  const getStatusColor = (s: string) => {
    switch (s) {
      case 'online': return '#34d399';
      case 'busy': return '#f87171';
      case 'away': return '#fbbf24';
      default: return '#9ca3af';
    }
  };

  // Fetch messages from API
  const fetchMessages = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

      const res = await fetch(`${apiUrl}/messages`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`Servidor respondeu com código ${res.status}`);
      }

      const data: Message[] = await res.json();
      const parsedData = Array.isArray(data) ? data : [];

      // Check for incoming nudges to trigger vibration/shake locally
      parsedData.forEach(msg => {
        if (
          msg.text.includes('⚠️ chamou a atenção de todos!') &&
          !processedNudges.current.has(msg.id)
        ) {
          processedNudges.current.add(msg.id);
          // Only shake if it's from someone else (sender already shook their screen)
          if (msg.name !== name) {
            triggerShakeEffect();
          }
        }
      });

      setMessages(parsedData);
      setError(null);
    } catch (err: any) {
      console.log('Error fetching messages:', err);
      let errMsg = 'Erro de conexão com o servidor';
      if (err.name === 'AbortError') {
        errMsg = 'Tempo limite de conexão esgotado (Timeout)';
      } else if (err.message) {
        errMsg = err.message;
      }
      setError(`Não foi possível se conectar: ${errMsg}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [apiUrl, name, triggerShakeEffect]);

  // Handle Refreshing
  const onRefresh = () => {
    setRefreshing(true);
    fetchMessages(true);
  };

  // Poll for messages every 3 seconds
  useEffect(() => {
    fetchMessages();
    const interval = setInterval(() => {
      fetchMessages(true);
    }, 3000);

    return () => clearInterval(interval);
  }, [fetchMessages]);

  // Send Message
  const handleSend = async (forcedText?: string) => {
    const textToSend = forcedText !== undefined ? forcedText : inputText.trim();
    if (!textToSend) return;

    let payloadText = textToSend;
    // Append reply quote if replying
    if (replyTo && forcedText === undefined) {
      payloadText = `[Resp. para ${replyTo.name}: "${replyTo.text.substring(0, 30)}..."] ${textToSend}`;
    }

    const payload = {
      name,
      text: payloadText
    };

    try {
      const res = await fetch(`${apiUrl}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.status === 409) {
        const data = await res.json();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert(
          'Nome já em uso',
          data.error || `O nome "${name}" já está sendo usado por outra pessoa.`,
          [{ text: 'Voltar', onPress: () => router.replace('/') }]
        );
        return;
      }

      if (!res.ok) {
        throw new Error(`Erro ${res.status}`);
      }

      setInputText('');
      setReplyTo(null);
      setError(null);
      
      // Fetch messages immediately to update UI
      await fetchMessages(true);
      
      // Scroll to bottom
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);

    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(`Erro ao enviar mensagem: ${err.message || 'Servidor Offline'}`);
    }
  };

  // Send MSN Nudge
  const sendMsnNudge = () => {
    triggerShakeEffect();
    handleSend('⚠️ chamou a atenção de todos!');
  };

  // Interaction handlers
  const handleSingleTap = (msgId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowTimeIds(prev => 
      prev.includes(msgId) ? prev.filter(id => id !== msgId) : [...prev, msgId]
    );
  };

  const handleDoubleTap = () => {
    sendMsnNudge();
  };

  const handleLongPress = (msg: Message) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedMessage(msg);
    setShowMenu(true);
  };

  // Menu action handlers
  const handleCopyText = () => {
    if (selectedMessage) {
      Clipboard.setString(selectedMessage.text);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Sucesso', 'Mensagem copiada para a área de transferência.');
    }
    setShowMenu(false);
  };

  const handleQuoteMessage = () => {
    if (selectedMessage) {
      setReplyTo(selectedMessage);
    }
    setShowMenu(false);
  };

  const handleDeleteLocal = () => {
    if (selectedMessage) {
      setDeletedLocalIds(prev => [...prev, selectedMessage.id]);
    }
    setShowMenu(false);
  };

  // Render individual messages
  const renderMessageItem = ({ item }: { item: Message }) => {
    // Check if message is locally hidden
    if (deletedLocalIds.includes(item.id)) return null;

    const isSystemNudge = item.text.includes('⚠️ chamou a atenção de todos!');
    const isCurrentUser = item.name === name;
    const showTime = showTimeIds.includes(item.id);
    const formattedTime = new Date(item.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });

    if (isSystemNudge) {
      return (
        <View style={styles.nudgeMessageContainer}>
          <Text style={styles.nudgeMessageText}>
            ⚡ {item.name} {item.text.replace('⚠️ ', '')}
          </Text>
        </View>
      );
    }

    // Build the gesture config
    const tap = Gesture.Tap()
      .numberOfTaps(1)
      .onStart(() => {
        runOnJS(handleSingleTap)(item.id);
      });

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .onStart(() => {
        runOnJS(handleDoubleTap)();
      });

    const longPress = Gesture.LongPress()
      .minDuration(500)
      .onStart(() => {
        runOnJS(handleLongPress)(item);
      });

    // Tap must wait to see if a double tap is coming
    const exclusiveGestures = Gesture.Exclusive(doubleTap, tap, longPress);

    const userAvatar = getAvatarForUser(item.name);

    return (
      <GestureDetector gesture={exclusiveGestures}>
        <View style={[styles.messageRow, isCurrentUser && styles.messageRowRight]}>
          {/* Avatar on Left (Matching attachment style precisely) */}
          {!isCurrentUser && (
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarEmoji}>{userAvatar}</Text>
            </View>
          )}

          <View style={styles.messageContentWrapper}>
            {/* Sender username above the bubble (gray, small) */}
            <Text style={[styles.senderName, isCurrentUser && styles.senderNameRight]}>
              {item.name}
            </Text>

            {/* Bubble body (light pink/magenta) */}
            <View style={[styles.bubble, isCurrentUser ? styles.bubbleRight : styles.bubbleLeft]}>
              <Text style={styles.messageText}>{item.text}</Text>
            </View>

            {/* Time / IP Info (appears on single tap or toggle) */}
            {(showTime || item.ip) && (
              <Text style={[styles.messageMeta, isCurrentUser && styles.messageMetaRight]}>
                {formattedTime} {item.ip ? `• IP: ${item.ip}` : ''}
              </Text>
            )}
          </View>

          {/* Current User Avatar on Right */}
          {isCurrentUser && (
            <View style={[styles.avatarCircle, { marginLeft: 10 }]}>
              <Text style={styles.avatarEmoji}>{userAvatar}</Text>
            </View>
          )}
        </View>
      </GestureDetector>
    );
  };

  // Reanimated style for screen shaking
  const shakeStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: shakeOffset.value }]
    };
  });

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
    <SafeAreaView style={styles.safe}>
      {/* HEADER: Baby blue background, white circle avatar, "Bem-vinde FULANO" text */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/')}>
          <Ionicons name="arrow-back" size={24} color="#0f172a" />
        </TouchableOpacity>
        
        <View style={styles.headerAvatar}>
          <Text style={styles.headerAvatarEmoji}>{avatar}</Text>
        </View>
        
        <Text style={styles.headerTitle} numberOfLines={1}>
          Bem-vinde {name}
        </Text>
        
        <View style={[styles.headerStatusDot, { backgroundColor: getStatusColor(initialStatus) }]} />

        {/* Action icons */}
        <TouchableOpacity style={styles.nudgeButton} onPress={sendMsnNudge} accessibilityLabel="Chamar Atenção">
          <Ionicons name="alert-circle" size={24} color="#0284c7" />
        </TouchableOpacity>
      </View>

      {/* SUB-HEADER: "SALA 1" centered */}
      <View style={styles.subHeader}>
        <Text style={styles.subHeaderTitle}>SALA 1</Text>
      </View>

      {/* Resilient API connection error banner */}
      {error && (
        <View style={styles.errorBanner}>
          <View style={styles.errorTextContainer}>
            <Ionicons name="warning" size={20} color="white" />
            <Text style={styles.errorText} numberOfLines={2}>
              {error}
            </Text>
          </View>
          <TouchableOpacity style={styles.retryButton} onPress={() => fetchMessages(false)}>
            <Text style={styles.retryButtonText}>Tentar Novamente</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Main chat viewport with animation wrapping */}
      <Animated.View style={[styles.feedContainer, shakeStyle]}>
        {loading && messages.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#0284c7" />
            <Text style={styles.loadingText}>Conectando ao chat...</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={item => item.id}
            renderItem={renderMessageItem}
            contentContainerStyle={styles.listContent}
            onRefresh={onRefresh}
            refreshing={refreshing}
            ListEmptyComponent={
              <View style={styles.center}>
                <Ionicons name="chatbubbles-outline" size={48} color="#94a3b8" />
                <Text style={styles.emptyText}>Nenhuma mensagem enviada.</Text>
                <Text style={styles.emptyTip}>Dê um toque duplo nas mensagens para chamar atenção!</Text>
              </View>
            }
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
          />
        )}
      </Animated.View>

      {/* Footer input replying quote preview */}
      {replyTo && (
        <View style={styles.replyPreviewBar}>
          <View style={styles.replyPreviewTextContainer}>
            <Text style={styles.replyPreviewTitle}>Respondendo a {replyTo.name}:</Text>
            <Text style={styles.replyPreviewText} numberOfLines={1}>{replyTo.text}</Text>
          </View>
          <TouchableOpacity onPress={() => setReplyTo(null)}>
            <Ionicons name="close-circle" size={20} color="#64748b" />
          </TouchableOpacity>
        </View>
      )}

      {/* INPUT BAR: Digite sua mensagem... and paper plane send icon */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.textInput}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Digite sua mensagem..."
          placeholderTextColor="#94a3b8"
          onSubmitEditing={() => handleSend()}
          blurOnSubmit={false}
          multiline={false}
        />
        <TouchableOpacity style={styles.sendButton} onPress={() => handleSend()}>
          <Ionicons name="paper-plane-outline" size={24} color="#0f172a" />
        </TouchableOpacity>
      </View>

      {/* Glassmorphic Context Menu (Long Press Options) */}
      {showMenu && selectedMessage && (
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setShowMenu(false)}
        >
          <View style={styles.menuCard}>
            <Text style={styles.menuTitle}>Mensagem de {selectedMessage.name}</Text>
            
            <TouchableOpacity style={styles.menuItem} onPress={handleCopyText}>
              <Ionicons name="copy-outline" size={18} color="#334155" />
              <Text style={styles.menuItemText}>Copiar Texto</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.menuItem} onPress={handleQuoteMessage}>
              <Ionicons name="arrow-undo-outline" size={18} color="#334155" />
              <Text style={styles.menuItemText}>Responder</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.menuItem} onPress={sendMsnNudge}>
              <Ionicons name="alert-circle-outline" size={18} color="#334155" />
              <Text style={styles.menuItemText}>Chamar Atenção (Nudge)</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.menuItem} onPress={handleDeleteLocal}>
              <Ionicons name="trash-outline" size={18} color="#ef4444" />
              <Text style={[styles.menuItemText, { color: '#ef4444' }]}>Excluir Localmente</Text>
            </TouchableOpacity>
            
            <View style={styles.menuSeparator} />
            
            <TouchableOpacity style={styles.menuCancelItem} onPress={() => setShowMenu(false)}>
              <Text style={styles.menuCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      )}
    </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f1f5f9', // slate-100 base
  },
  header: {
    height: 70,
    backgroundColor: '#A1CEDC', // Baby blue matching image attachment
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
  },
  backButton: {
    marginRight: 12,
  },
  headerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
    borderColor: 'rgba(255, 255, 255, 0.7)',
    borderWidth: 1,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarEmoji: {
    fontSize: 28,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
    flex: 1,
  },
  headerStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 16,
  },
  nudgeButton: {
    padding: 6,
  },
  subHeader: {
    backgroundColor: '#e2e8f0',
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
  },
  subHeaderTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 2,
  },
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.95)', // Glassmorphic red error
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderColor: 'rgba(239, 68, 68, 0.4)',
    borderBottomWidth: 1,
  },
  errorTextContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  errorText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 8,
  },
  retryButton: {
    backgroundColor: 'white',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: 'bold',
  },
  feedContainer: {
    flex: 1,
    backgroundColor: '#f8fafc', // Light grey/white message pane
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    gap: 16,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
    marginVertical: 4,
  },
  messageRowRight: {
    justifyContent: 'flex-end',
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
    borderColor: 'rgba(255, 255, 255, 0.7)',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: {
    fontSize: 20,
  },
  messageContentWrapper: {
    maxWidth: '70%',
    marginLeft: 10,
  },
  senderName: {
    fontSize: 12,
    color: '#64748b', // Gray sender username
    marginBottom: 4,
    marginLeft: 2,
  },
  senderNameRight: {
    textAlign: 'right',
    marginRight: 2,
    marginLeft: 0,
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  bubbleLeft: {
    backgroundColor: '#f5d6eb', // Pink/light magenta matching reference image
    borderTopLeftRadius: 4,
  },
  bubbleRight: {
    backgroundColor: '#d2e5f5', // Soft MSN blue
    borderTopRightRadius: 4,
  },
  messageText: {
    fontSize: 15,
    color: '#0f172a',
    lineHeight: 20,
  },
  messageMeta: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 4,
    marginLeft: 4,
  },
  messageMetaRight: {
    textAlign: 'right',
    marginRight: 4,
    marginLeft: 0,
  },
  nudgeMessageContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
    paddingHorizontal: 20,
  },
  nudgeMessageText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#e02424',
    backgroundColor: '#fee2e2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  replyPreviewBar: {
    backgroundColor: '#e2e8f0',
    borderTopWidth: 1,
    borderTopColor: '#cbd5e1',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  replyPreviewTextContainer: {
    flex: 1,
    marginRight: 8,
  },
  replyPreviewTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#475569',
  },
  replyPreviewText: {
    fontSize: 13,
    color: '#64748b',
    fontStyle: 'italic',
  },
  inputContainer: {
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: -2 },
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: '#0f172a',
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    paddingRight: 10,
  },
  sendButton: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 8,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
    textAlign: 'center',
  },
  emptyTip: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 4,
  },
  menuOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.45)', // Translucent dark overlay
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  menuCard: {
    width: '80%',
    maxWidth: 320,
    backgroundColor: 'rgba(255, 255, 255, 0.85)', // Glassmorphic card
    borderColor: 'rgba(255, 255, 255, 0.6)',
    borderWidth: 1.5,
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  menuTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 16,
    textAlign: 'center',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    gap: 12,
  },
  menuItemText: {
    fontSize: 15,
    color: '#334155',
    fontWeight: '500',
  },
  menuSeparator: {
    height: 1,
    backgroundColor: 'rgba(226, 232, 240, 0.8)',
    marginVertical: 8,
  },
  menuCancelItem: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  menuCancelText: {
    fontSize: 15,
    color: '#64748b',
    fontWeight: 'bold',
  },
});
