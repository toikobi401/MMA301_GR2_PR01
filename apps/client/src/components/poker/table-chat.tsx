import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, TextInput, View } from 'react-native';
import type { ChatMessage } from '@app/shared';
import { Button, Text } from '@/components/ui';
import { cn } from '@/lib/cn';

export interface TableChatProps {
  visible: boolean;
  messages: ChatMessage[];
  viewerId: string | null;
  onSend: (body: string) => void;
  onClose: () => void;
}

/**
 * In-game chat.
 *
 * Sending and receiving both run over the live socket — only the backlog on
 * open is missing, because the server has no endpoint to fetch recent
 * messages. Until it does, a player who joins mid-session starts with an
 * empty log rather than the last few lines.
 */
export function TableChat({ visible, messages, viewerId, onSend, onClose }: TableChatProps) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  // New messages arrive at the bottom, so follow them.
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(timer);
  }, [messages.length, visible]);

  function send() {
    const body = draft.trim();
    if (!body) return;
    onSend(body);
    setDraft('');
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/50" onPress={onClose}>
        <Pressable
          className="dark max-h-[70%] gap-3 rounded-t-lg border-t border-border bg-card p-4"
          onPress={() => {}}
        >
          <View className="flex-row items-center justify-between">
            <Text variant="subheading" className="text-white">
              Table chat
            </Text>
            <Button variant="ghost" size="sm" label="Close" onPress={onClose} />
          </View>

          <ScrollView ref={scrollRef} className="max-h-[300px]">
            {messages.length === 0 ? (
              <Text variant="caption" className="py-6 text-center text-white/40">
                Nothing said yet.
              </Text>
            ) : (
              <View className="gap-2">
                {messages.map((message) => {
                  const mine = message.userId === viewerId;
                  return (
                    <View
                      key={message.id}
                      className={cn('max-w-[85%] rounded-lg px-3 py-2', mine
                        ? 'self-end bg-primary'
                        : 'self-start bg-white/10')}
                    >
                      {!mine && (
                        <Text variant="caption" className="font-medium text-white/60">
                          {message.displayName}
                        </Text>
                      )}
                      <Text
                        variant="caption"
                        className={mine ? 'text-primary-foreground' : 'text-white'}
                      >
                        {message.body}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>

          <View className="flex-row gap-2">
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={send}
              placeholder="Say something"
              placeholderTextColor="#9AA3B4"
              maxLength={500}
              returnKeyType="send"
              className="min-h-[44px] flex-1 rounded-md border border-input bg-background px-3 py-2 text-base text-foreground"
            />
            <Button label="Send" onPress={send} disabled={draft.trim().length === 0} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
