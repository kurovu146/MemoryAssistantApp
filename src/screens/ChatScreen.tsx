import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Markdown from 'react-native-markdown-display';
import {pick, isCancel} from 'react-native-document-picker';
import {useChat, type ChatMessage, type ChatImage} from '../stores/chat';
import {useSettings, getProviderForModel, PROVIDERS} from '../stores/settings';
import {getToolIcon} from '../agent/tools';
import {saveUploadedFile} from '../utils/file-manager';
import {extractText} from '../utils/text-extractor';

interface PendingImage {
  uri: string;
  base64: string;
  mediaType: string;
  name: string;
  fileId?: number;
}

interface PendingFile {
  fileId: number;
  filename: string;
  extractedText: string;
  mimeType: string;
}

function MessageBubble({msg}: {msg: ChatMessage}) {
  const isUser = msg.role === 'user';

  return (
    <View
      className={`mx-3 my-1 max-w-[85%] ${isUser ? 'self-end' : 'self-start'}`}>
      <View
        className={`rounded-2xl px-4 py-3 ${
          isUser ? 'bg-primary rounded-br-sm' : 'bg-surface-light rounded-bl-sm'
        }`}>
        {msg.images && msg.images.length > 0 && (
          <View className="mb-2 flex-row flex-wrap gap-1.5">
            {msg.images.map((img, i) => (
              <Image
                key={i}
                source={{uri: img.uri}}
                style={{width: msg.images!.length === 1 ? 220 : 120, height: msg.images!.length === 1 ? 220 : 120}}
                className="rounded-xl"
                resizeMode="cover"
              />
            ))}
          </View>
        )}
        {isUser ? (
          msg.content ? (
            <Text className="text-base text-white" selectable>
              {msg.content}
            </Text>
          ) : null
        ) : (
          <Markdown
            style={{
              body: {color: '#cdd6f4', fontSize: 16},
              heading1: {color: '#cdd6f4', fontSize: 22, fontWeight: 'bold'},
              heading2: {color: '#cdd6f4', fontSize: 20, fontWeight: 'bold'},
              heading3: {color: '#cdd6f4', fontSize: 18, fontWeight: 'bold'},
              code_inline: {
                backgroundColor: '#313244',
                color: '#a6e3a1',
                paddingHorizontal: 4,
                borderRadius: 4,
              },
              code_block: {
                backgroundColor: '#313244',
                color: '#a6e3a1',
                padding: 8,
                borderRadius: 8,
              },
              fence: {
                backgroundColor: '#313244',
                color: '#a6e3a1',
                padding: 8,
                borderRadius: 8,
              },
              blockquote: {
                backgroundColor: '#313244',
                borderLeftColor: '#6366f1',
                borderLeftWidth: 3,
                paddingLeft: 8,
              },
              bullet_list_icon: {color: '#6c7086'},
              ordered_list_icon: {color: '#6c7086'},
              link: {color: '#89b4fa'},
              strong: {color: '#cdd6f4', fontWeight: 'bold'},
              em: {color: '#cdd6f4', fontStyle: 'italic'},
              paragraph: {marginTop: 0, marginBottom: 4},
            }}>
            {msg.content}
          </Markdown>
        )}
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

async function readImageBase64(uri: string): Promise<string> {
  const response = await fetch(uri);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(',')[1] ?? '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function ChatScreen() {
  const {messages, isLoading, status, sendMessage, loadSession} =
    useChat();
  const {apiKeys, model, botName} = useSettings();
  const [input, setInput] = useState('');
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({animated: true}), 100);
    }
  }, [messages.length]);

  const currentProvider = getProviderForModel(model);
  const activeApiKey = apiKeys[currentProvider];
  const providerLabel = PROVIDERS.find(p => p.name === currentProvider)?.label ?? currentProvider;

  const canSend = !isLoading && (input.trim().length > 0 || pendingImages.length > 0 || pendingFiles.length > 0);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!canSend) {
      return;
    }
    if (!activeApiKey) {
      useChat.setState(s => ({
        messages: [
          ...s.messages,
          {
            id: `err-${Date.now()}`,
            role: 'assistant' as const,
            content: `Please set your ${providerLabel} API key in Settings first.`,
            timestamp: Date.now(),
          },
        ],
      }));
      return;
    }

    const images: ChatImage[] | undefined =
      pendingImages.length > 0
        ? pendingImages.map(p => ({uri: p.uri, base64: p.base64, mediaType: p.mediaType}))
        : undefined;

    // Build combined text: extracted files + user input + source hints
    const parts: string[] = [];

    for (const f of pendingFiles) {
      parts.push(`=== File: ${f.filename} ===\n${f.extractedText}`);
    }

    if (text) {
      parts.push(text);
    }

    const fileSourceHints = [
      ...pendingFiles.map(f => `[source: file:${f.fileId}]`),
      ...pendingImages.filter(p => p.fileId).map(p => `[source: file:${p.fileId}]`),
    ];
    if (fileSourceHints.length > 0) {
      parts.push(fileSourceHints.join('\n'));
    }

    const fullText = parts.join('\n\n');

    setInput('');
    setPendingImages([]);
    setPendingFiles([]);
    sendMessage(fullText, model, images);
  }, [input, canSend, activeApiKey, providerLabel, model, messages, sendMessage, pendingImages, pendingFiles]);

  const handleFilePick = useCallback(async () => {
    try {
      const results = await pick({
        allowMultiSelection: true,
        copyTo: 'cachesDirectory',
      });

      const newImages: PendingImage[] = [];
      const newFiles: PendingFile[] = [];

      for (const result of results) {
        const uri = result?.fileCopyUri ?? result?.uri;
        if (!uri) {
          continue;
        }

        const mimeType = result.type ?? '';
        const fileName = result.name ?? 'untitled';

        // Save file permanently + check duplicate
        const saveResult = await saveUploadedFile(uri, fileName, mimeType);
        if (saveResult.duplicate) {
          Alert.alert(
            'Duplicate File',
            `"${fileName}" has the same content as "${saveResult.existingFile.filename}" (uploaded earlier). Skipped.`,
          );
          continue;
        }

        if (mimeType.startsWith('image/')) {
          const base64 = await readImageBase64(saveResult.absolutePath);
          newImages.push({
            uri: saveResult.absolutePath,
            base64,
            mediaType: mimeType,
            name: fileName,
            fileId: saveResult.fileId,
          });
        } else {
          // Extract text from file — buffer into pendingFiles
          const MAX_TEXT_SIZE = 200 * 1024;
          const extraction = await extractText(saveResult.absolutePath, mimeType);
          if (!extraction.success) {
            Alert.alert('Extraction Failed', `"${fileName}": ${extraction.error}`);
            continue;
          }
          if (extraction.text.length > MAX_TEXT_SIZE) {
            Alert.alert(
              'File Too Large',
              `"${fileName}" extracted text is too large (${(extraction.text.length / 1024).toFixed(0)}KB). Max 200KB.`,
            );
            continue;
          }
          if (extraction.text.length > 0) {
            newFiles.push({
              fileId: saveResult.fileId,
              filename: fileName,
              extractedText: extraction.text,
              mimeType,
            });
          }
        }
      }

      if (newImages.length > 0) {
        setPendingImages(prev => [...prev, ...newImages]);
      }
      if (newFiles.length > 0) {
        setPendingFiles(prev => [...prev, ...newFiles]);
      }
    } catch (err: unknown) {
      if (!isCancel(err)) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        Alert.alert('Error', `Failed to read file: ${message}`);
      }
    }
  }, []);

  const removePendingImage = useCallback((index: number) => {
    setPendingImages(prev => prev.filter((_, i) => i !== index));
  }, []);

  const removePendingFile = useCallback((index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const renderItem = useCallback(
    ({item}: {item: ChatMessage}) => <MessageBubble msg={item} />,
    [],
  );

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="border-b border-surface-light px-4 py-3">
        <Text className="text-lg font-bold text-text-primary">
          {botName}
        </Text>
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

        {pendingImages.length > 0 && (
          <View className="border-t border-surface-light px-3 pt-2">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{gap: 8}}>
              {pendingImages.map((img, i) => (
                <View key={i} className="relative">
                  <Image
                    source={{uri: img.uri}}
                    className="h-20 w-20 rounded-xl"
                    resizeMode="cover"
                  />
                  <Pressable
                    onPress={() => removePendingImage(i)}
                    className="absolute -right-1 -top-1 h-5 w-5 items-center justify-center rounded-full bg-red-500">
                    <Text className="text-xs font-bold text-white">✕</Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {pendingFiles.length > 0 && (
          <View className="border-t border-surface-light px-3 pt-2 pb-1">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{gap: 6}}>
              {pendingFiles.map((file, i) => (
                <View
                  key={i}
                  className="flex-row items-center rounded-full bg-surface-lighter px-3 py-1">
                  <Text className="mr-1.5 text-xs text-text-muted" numberOfLines={1}>
                    📄 {file.filename}
                  </Text>
                  <Pressable onPress={() => removePendingFile(i)}>
                    <Text className="text-xs font-bold text-text-muted">✕</Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        <View className="flex-row items-end border-t border-surface-light px-3 py-2">
          <Pressable
            onPress={handleFilePick}
            disabled={isLoading}
            className="mr-2 h-10 w-10 items-center justify-center rounded-full bg-surface-light">
            <Text className="text-lg">📎</Text>
          </Pressable>
          <TextInput
            className="mr-2 max-h-24 min-h-[40px] flex-1 rounded-xl bg-surface-light px-4 py-2.5 text-base text-text-primary"
            placeholder={pendingImages.length > 0 || pendingFiles.length > 0 ? 'Add a caption...' : 'Type a message...'}
            placeholderTextColor="#6c7086"
            value={input}
            onChangeText={setInput}
            multiline
            submitBehavior="submit"
            onSubmitEditing={handleSend}
            editable={!isLoading}
          />
          <Pressable
            onPress={handleSend}
            disabled={!canSend}
            className={`h-10 w-10 items-center justify-center rounded-full ${
              canSend ? 'bg-primary' : 'bg-surface-lighter'
            }`}>
            <Text className="text-lg text-white">↑</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
