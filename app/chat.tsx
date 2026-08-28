import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming
} from 'react-native-reanimated';

interface Message {
  id: string;
  name: string;
  text: string;
  timestamp: string;
  ip?: string;
}

const STICKER_LIST = [
  '47_47.png', '48_48.png', '49_49.png', '50_50.png', '51_51.png',
  '52_52.png', '71_71.png', '72_72.png', '74_74.gif', '77_77.png',
  'angel_smile.png', 'angry_smile.png', 'confused_smile.png', 'cry_smile.gif',
  'devil_smile.png', 'kiss.png', 'omg_smile.png', 'red_smile.png',
  'regular_smile.png', 'sad_smile.png', 'shades_smile.png', 'teeth_smile.png',
  'tongue_smile.png', 'what_face.png', 'wink_smile.gif',
];

export default function ChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const name = (params.name as string) || 'FULANO';
  const initialStatus = (params.status as string) || 'online';
  const apiUrl = (params.apiUrl as string) || 'https://nuclei-variably-zombie.ngrok-free.dev';
  const avatar = (params.avatar as string) || '🦋';

  const getAvatarForUser = useCallback((userName: string) => {
    if (userName === name) return avatar;
    const avatars = ['🦋', '🦆', '⚽', '🌻', '🎮', '💖', '🐱', '🏳️‍🌈', '😘', '💋', '🤡', '🤖', '👽', '👻', '💩', '🤮'];
    let hash = 0;
    for (let i = 0; i < userName.length; i++) {
      hash = userName.charCodeAt(i) + ((hash << 20) - hash);
    }
    return avatars[Math.abs(hash) % avatars.length];
  }, [name, avatar]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [deletedLocalIds, setDeletedLocalIds] = useState<Set<string>>(new Set());
  const [showTimeIds, setShowTimeIds] = useState<Set<string>>(new Set());
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [showStickerPicker, setShowStickerPicker] = useState(false);

  const shakeOffset = useSharedValue(0);
  const processedNudges = useRef<Set<string>>(new Set());
  const flatListRef = useRef<FlatList>(null);
  const isMountedRef = useRef(true); // Previne memory leaks

  useEffect(() => {
    isMountedRef.current = true;
    const join = async () => {
      try {
        const res = await fetch(`${apiUrl}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name })
        });
        if (!isMountedRef.current) return;

        if (res.status === 409) {
          const data = await res.json();
          Alert.alert(
            'Nome já em uso',
            data.error || `O nome "${name}" já está sendo usado.`,
            [{ text: 'OK', onPress: () => router.replace('/') }]
          );
        }
      } catch (_) { }
    };

    join();

    return () => {
      isMountedRef.current = false;
      fetch(`${apiUrl}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      }).catch(() => { });
    };
  }, [apiUrl, name, router]);

  const triggerShakeEffect = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    shakeOffset.value = withSequence(
      withTiming(-12, { duration: 40 }), withTiming(12, { duration: 40 }),
      withTiming(-12, { duration: 40 }), withTiming(12, { duration: 40 }),
      withTiming(-8, { duration: 40 }), withTiming(8, { duration: 40 }),
      withTiming(-4, { duration: 40 }), withTiming(4, { duration: 40 }),
      withTiming(0, { duration: 40 })
    );
  }, [shakeOffset]);

  const fetchMessages = useCallback(async (isSilent = false) => {
    if (!isSilent && isMountedRef.current) setLoading(true);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${apiUrl}/messages`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`Servidor respondeu com código ${res.status}`);

      const data: Message[] = await res.json();
      const parsedData = Array.isArray(data) ? data : [];

      parsedData.forEach(msg => {
        if (msg.text.includes('⚠️ chamou a atenção de todos!') && !processedNudges.current.has(msg.id)) {
          processedNudges.current.add(msg.id);
          if (msg.name !== name) triggerShakeEffect();
        }
      });

      if (isMountedRef.current) {
        setMessages(prev => {
          if (prev.length > 0 && parsedData.length > 0 && prev[prev.length - 1]?.id === parsedData[parsedData.length - 1]?.id && prev.length === parsedData.length) {
            return prev;
          }
          return parsedData;
        });
        setError(null);
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        let errMsg = err.name === 'AbortError' ? 'Tempo limite esgotado' : err.message || 'Erro de conexão';
        setError(`Falha: ${errMsg}`);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [apiUrl, name, triggerShakeEffect]);

  // Polling Recursivo Otimizado (evita Race Condition)
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const poll = async () => {
      await fetchMessages(true);
      if (isMountedRef.current) {
        timeoutId = setTimeout(poll, 3000);
      }
    };

    fetchMessages().then(() => {
      if (isMountedRef.current) timeoutId = setTimeout(poll, 3000);
    });

    return () => clearTimeout(timeoutId);
  }, [fetchMessages]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchMessages(true);
  };

  const handleSend = async (forcedText?: string) => {
    const textToSend = forcedText !== undefined ? forcedText : inputText.trim();
    if (!textToSend) return;

    let payloadText = textToSend;
    if (replyTo && forcedText === undefined) {
      payloadText = `[Resp. para ${replyTo.name}: "${replyTo.text.substring(0, 30)}..."] ${textToSend}`;
    }

    try {
      const res = await fetch(`${apiUrl}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, text: payloadText })
      });

      if (res.status === 409) {
        const data = await res.json();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Nome já em uso', data.error, [{ text: 'Voltar', onPress: () => router.replace('/') }]);
        return;
      }

      if (!res.ok) throw new Error(`Erro ${res.status}`);

      setInputText('');
      setReplyTo(null);
      setError(null);

      await fetchMessages(true);

      if (flatListRef.current && messages.length > 0) {
        flatListRef.current.scrollToOffset({ offset: 0, animated: true });
      }
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(`Erro ao enviar: ${err.message}`);
    }
  };

  const sendMsnNudge = () => {
    triggerShakeEffect();
    handleSend('⚠️ chamou a atenção de todos!');
  };

  const handleCopyText = async () => {
    if (selectedMessage) {
      await Clipboard.setStringAsync(selectedMessage.text);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setShowMenu(false);
  };

  // Renderização otimizada com React.memo e Set
  const toggleShowTime = useCallback((msgId: string) => {
    setShowTimeIds(prev => {
      const next = new Set(prev);
      next.has(msgId) ? next.delete(msgId) : next.add(msgId);
      return next;
    });
  }, []);

  const renderMessageItem = useCallback(({ item }: { item: Message }) => {
    if (deletedLocalIds.has(item.id)) return null;

    const isSystemNudge = item.text.includes('⚠️ chamou a atenção de todos!');
    const isSystemJoin = item.text.startsWith('[system:join]');
    const isSystemLeave = item.text.startsWith('[system:leave]');
    const isSystemEvent = isSystemJoin || isSystemLeave;
    const isSticker = /^\[sticker:[^\]]+\]$/.test(item.text);
    const isCurrentUser = item.name === name;
    const showTime = showTimeIds.has(item.id);
    const formattedTime = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (isSystemNudge) {
      return (
        <View style={styles.nudgeMessageContainer}>
          <Text style={styles.nudgeMessageText}>⚡ {item.name} {item.text.replace('⚠️ ', '')}</Text>
        </View>
      );
    }

    if (isSystemEvent) {
      const icon = isSystemJoin ? '🟢' : '🔴';
      const label = isSystemJoin ? `${item.name} entrou` : `${item.name} saiu`;
      return (
        <View style={styles.systemEventContainer}>
          <View style={[styles.systemEventLine, isSystemJoin ? styles.systemJoinLine : styles.systemLeaveLine]} />
          <View style={isSystemJoin ? styles.systemJoinBanner : styles.systemLeaveBanner}>
            <Text style={isSystemJoin ? styles.systemJoinText : styles.systemLeaveText}>{icon} {label}</Text>
          </View>
          <View style={[styles.systemEventLine, isSystemJoin ? styles.systemJoinLine : styles.systemLeaveLine]} />
        </View>
      );
    }

    const tap = Gesture.Tap()
      .numberOfTaps(1)
      .onStart(() => {
        runOnJS(toggleShowTime)(item.id);
        runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
      });

    const doubleTap = Gesture.Tap().numberOfTaps(2).onStart(() => runOnJS(sendMsnNudge)());
    const longPress = Gesture.LongPress().minDuration(500).onStart(() => {
      runOnJS(setSelectedMessage)(item);
      runOnJS(setShowMenu)(true);
      runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Medium);
    });

    const exclusiveGestures = Gesture.Exclusive(doubleTap, tap, longPress);
    const userAvatar = getAvatarForUser(item.name);

    return (
      <GestureDetector gesture={exclusiveGestures}>
        <View style={[styles.messageRow, isCurrentUser && styles.messageRowRight]}>
          {!isCurrentUser && (
            <View style={styles.avatarCircle}><Text style={styles.avatarEmoji}>{userAvatar}</Text></View>
          )}

          <View style={styles.messageContentWrapper}>
            <Text style={[styles.senderName, isCurrentUser && styles.senderNameRight]}>{item.name}</Text>
            <View style={[styles.bubble, isCurrentUser ? styles.bubbleRight : styles.bubbleLeft, isSticker && styles.stickerBubble]}>
              {isSticker ? (
                <Image source={{ uri: `${apiUrl}/stickers/${item.text.slice(9, -1)}` }} style={styles.stickerImage} resizeMode="contain" />
              ) : (
                <Text style={styles.messageText}>{item.text}</Text>
              )}
            </View>
            {(showTime || item.ip) && (
              <Text style={[styles.messageMeta, isCurrentUser && styles.messageMetaRight]}>
                {formattedTime} {item.ip ? `• IP: ${item.ip}` : ''}
              </Text>
            )}
          </View>

          {isCurrentUser && (
            <View style={[styles.avatarCircle, { marginLeft: 10 }]}><Text style={styles.avatarEmoji}>{userAvatar}</Text></View>
          )}
        </View>
      </GestureDetector>
    );
  }, [deletedLocalIds, showTimeIds, name, getAvatarForUser, apiUrl, sendMsnNudge]);

  const getStatusColor = (s: string) => ({ online: '#34d399', busy: '#f87171', away: '#fbbf24' }[s] || '#9ca3af');
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeOffset.value }] }));

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/')}>
            <Ionicons name="arrow-back" size={24} color="#0f172a" />
          </TouchableOpacity>
          <View style={styles.headerAvatar}><Text style={styles.headerAvatarEmoji}>{avatar}</Text></View>
          <Text style={styles.headerTitle} numberOfLines={1}>Bem-vindo(a) {name}</Text>
          <View style={[styles.headerStatusDot, { backgroundColor: getStatusColor(initialStatus) }]} />
          <TouchableOpacity style={styles.nudgeButton} onPress={sendMsnNudge}>
            <Ionicons name="alert-circle" size={24} color="#0284c7" />
          </TouchableOpacity>
        </View>

        <View style={styles.subHeader}><Text style={styles.subHeaderTitle}>SALA 1</Text></View>

        {error && (
          <View style={styles.errorBanner}>
            <View style={styles.errorTextContainer}>
              <Ionicons name="warning" size={20} color="white" />
              <Text style={styles.errorText} numberOfLines={2}>{error}</Text>
            </View>
            <TouchableOpacity style={styles.retryButton} onPress={() => fetchMessages(false)}>
              <Text style={styles.retryButtonText}>Tentar Novamente</Text>
            </TouchableOpacity>
          </View>
        )}

        <Animated.View style={[styles.feedContainer, shakeStyle]}>
          {loading && messages.length === 0 ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#0284c7" />
              <Text style={styles.loadingText}>Conectando ao chat...</Text>
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={Platform.OS === 'web' ? messages : [...messages].reverse()}
              keyExtractor={item => item.id}
              renderItem={renderMessageItem}
              contentContainerStyle={styles.listContent}
              inverted={Platform.OS !== 'web' && messages.length > 0}
              onRefresh={onRefresh}
              refreshing={refreshing}
              removeClippedSubviews={true}
              initialNumToRender={15}
              maxToRenderPerBatch={10}
              windowSize={5}
              ListEmptyComponent={
                <View style={styles.center}>
                  <Ionicons name="chatbubbles-outline" size={48} color="#94a3b8" />
                  <Text style={styles.emptyText}>Nenhuma mensagem enviada.</Text>
                  <Text style={styles.emptyTip}>Dê um toque duplo nas mensagens para chamar atenção!</Text>
                </View>
              }
            />
          )}
        </Animated.View>

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

        {showStickerPicker && (
          <View style={styles.stickerPicker}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stickerGrid}>
              {STICKER_LIST.map(filename => (
                <TouchableOpacity
                  key={filename}
                  style={styles.stickerPickerItem}
                  onPress={() => { handleSend(`[sticker:${filename}]`); setShowStickerPicker(false); }}
                >
                  <Image source={{ uri: `${apiUrl}/stickers/${filename}` }} style={{ width: 52, height: 52 }} resizeMode="contain" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        <View style={styles.inputContainer}>
          <TouchableOpacity style={styles.stickerButton} onPress={() => setShowStickerPicker(v => !v)}>
            <Text style={{ fontSize: 22 }}>😊</Text>
          </TouchableOpacity>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Digite sua mensagem..."
            placeholderTextColor="#94a3b8"
            onSubmitEditing={() => handleSend()}
            blurOnSubmit={false}
          />
          <TouchableOpacity style={styles.sendButton} onPress={() => handleSend()}>
            <Ionicons name="paper-plane-outline" size={24} color="#0f172a" />
          </TouchableOpacity>
        </View>

        {showMenu && selectedMessage && (
          <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setShowMenu(false)}>
            <View style={styles.menuCard}>
              <Text style={styles.menuTitle}>Mensagem de {selectedMessage.name}</Text>

              <TouchableOpacity style={styles.menuItem} onPress={handleCopyText}>
                <Ionicons name="copy-outline" size={18} color="#334155" />
                <Text style={styles.menuItemText}>Copiar Texto</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuItem} onPress={() => { setReplyTo(selectedMessage); setShowMenu(false); }}>
                <Ionicons name="arrow-undo-outline" size={18} color="#334155" />
                <Text style={styles.menuItemText}>Responder</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuItem} onPress={() => { sendMsnNudge(); setShowMenu(false); }}>
                <Ionicons name="alert-circle-outline" size={18} color="#334155" />
                <Text style={styles.menuItemText}>Chamar Atenção (Nudge)</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuItem} onPress={() => {
                setDeletedLocalIds(prev => new Set(prev).add(selectedMessage.id));
                setShowMenu(false);
              }}>
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
    marginRight: 10,
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
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderRadius: 20,
    // Glassmorphism base styling
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  bubbleLeft: {
    backgroundColor: 'rgba(255, 235, 247, 0.70)',
    borderColor: 'rgba(255, 255, 255, 0.90)',
    borderTopLeftRadius: 4,
  },
  bubbleRight: {
    backgroundColor: 'rgba(218, 238, 255, 0.70)',
    borderColor: 'rgba(255, 255, 255, 0.90)',
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
  // ── System event banners (join / leave) ─────────────────────────────────────
  systemEventContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 10,
    paddingHorizontal: 16,
    gap: 8,
  },
  systemEventLine: {
    flex: 1,
    height: 1,
  },
  systemJoinLine: {
    backgroundColor: 'rgba(52, 211, 153, 0.4)',
  },
  systemLeaveLine: {
    backgroundColor: 'rgba(251, 146, 60, 0.4)',
  },
  systemJoinBanner: {
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
    borderColor: 'rgba(52, 211, 153, 0.45)',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  systemLeaveBanner: {
    backgroundColor: 'rgba(251, 146, 60, 0.15)',
    borderColor: 'rgba(251, 146, 60, 0.45)',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  systemJoinText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#059669',
  },
  systemLeaveText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#d97706',
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
  // ── Sticker styles ──────────────────────────────────────────────────────────
  stickerBubble: {
    backgroundColor: 'transparent',
    padding: 2,
    elevation: 0,
    shadowOpacity: 0,
  },
  stickerImage: {
    width: 80,
    height: 80,
  },
  stickerPicker: {
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingVertical: 10,
  },
  stickerGrid: {
    paddingHorizontal: 12,
    gap: 8,
    alignItems: 'center' as const,
  },
  stickerPickerItem: {
    width: 68,
    height: 68,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  stickerButton: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginRight: 4,
  },
});
