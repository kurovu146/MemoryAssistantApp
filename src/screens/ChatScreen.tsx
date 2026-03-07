import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useChat, type ChatMessage} from '../stores/chat';
import {useSettings} from '../stores/settings';
import {getToolIcon} from '../agent/tools';

function MessageBubble({msg}: {msg: ChatMessage}) {
  const isUser = msg.role === 'user';

  return (
    <View
      className={`mx-3 my-1 max-w-[85%] ${isUser ? 'self-end' : 'self-start'}`}>
      <View
        className={`rounded-2xl px-4 py-3 ${
          isUser ? 'bg-primary rounded-br-sm' : 'bg-surface-light rounded-bl-sm'
        }`}>
        <Text
          className={`text-base ${isUser ? 'text-white' : 'text-text-primary'}`}
          selectable>
          {msg.content}
        </Text>
      </View>
      {msg.toolsUsed && msg.toolsUsed.length > 0 && (
        <View className="mt-1 flex-row flex-wrap gap-1">
          {msg.toolsUsed.map((tool, i) => (
            <View
              key={tool}
              className="flex-row items-center rounded-full bg-surface-lighter px-2 py-0.5">
              <Text className="text-xs text-text-muted">
                {getToolIcon(tool)} {tool}
                {(msg.toolsCounts?.[i] ?? 0) > 1
                  ? ` x${msg.toolsCounts![i]}`
                  : ''}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export default function ChatScreen() {
  const {messages, isLoading, status, sendMessage, loadSession, newSession} =
    useChat();
  const {claudeApiKey, model} = useSettings();
  const [input, setInput] = useState('');
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    loadSession();
  }, []);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isLoading) {
      return;
    }
    if (!claudeApiKey) {
      useChat.setState({
        messages: [
          ...messages,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: 'Please set your Claude API key in Settings first.',
            timestamp: Date.now(),
          },
        ],
      });
      return;
    }
    setInput('');
    sendMessage(text, claudeApiKey, model);
  }, [input, isLoading, claudeApiKey, model, messages, sendMessage]);

  const renderItem = useCallback(
    ({item}: {item: ChatMessage}) => <MessageBubble msg={item} />,
    [],
  );

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="flex-row items-center justify-between border-b border-surface-light px-4 py-3">
        <Text className="text-lg font-bold text-text-primary">Kuro</Text>
        <Pressable
          onPress={newSession}
          className="rounded-lg bg-surface-light px-3 py-1.5">
          <Text className="text-sm text-accent">New Chat</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}>
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={{paddingVertical: 8}}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({animated: true})
          }
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center pt-20">
              <Text className="text-4xl">🧠</Text>
              <Text className="mt-3 text-lg text-text-secondary">
                Memory Assistant
              </Text>
              <Text className="mt-1 text-sm text-text-muted">
                Ask me anything or save knowledge
              </Text>
            </View>
          }
        />

        {isLoading && status ? (
          <View className="px-4 py-2">
            <Text className="text-sm italic text-text-muted">{status}</Text>
          </View>
        ) : null}

        <View className="flex-row items-end border-t border-surface-light px-3 py-2">
          <TextInput
            className="mr-2 max-h-24 min-h-[40px] flex-1 rounded-xl bg-surface-light px-4 py-2.5 text-base text-text-primary"
            placeholder="Type a message..."
            placeholderTextColor="#6c7086"
            value={input}
            onChangeText={setInput}
            multiline
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
            editable={!isLoading}
          />
          <Pressable
            onPress={handleSend}
            disabled={isLoading || !input.trim()}
            className={`h-10 w-10 items-center justify-center rounded-full ${
              input.trim() && !isLoading ? 'bg-primary' : 'bg-surface-lighter'
            }`}>
            <Text className="text-lg text-white">↑</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
