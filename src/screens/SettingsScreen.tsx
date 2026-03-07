import React, {useState} from 'react';
import {Alert, Pressable, ScrollView, Text, TextInput, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {MODELS, useSettings} from '../stores/settings';

export default function SettingsScreen() {
  const {
    claudeApiKey,
    openaiApiKey,
    model,
    botName,
    setClaudeApiKey,
    setOpenaiApiKey,
    setModel,
    setBotName,
  } = useSettings();
  const [keyInput, setKeyInput] = useState(claudeApiKey);
  const [showKey, setShowKey] = useState(false);
  const [openaiKeyInput, setOpenaiKeyInput] = useState(openaiApiKey);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [nameInput, setNameInput] = useState(botName);

  const handleSaveKey = async () => {
    await setClaudeApiKey(keyInput.trim());
    Alert.alert('Saved', 'API key saved securely to Keychain.');
  };

  const handleClearKey = async () => {
    Alert.alert('Clear API Key', 'Remove your Claude API key?', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await setClaudeApiKey('');
          setKeyInput('');
        },
      },
    ]);
  };

  const handleSaveOpenaiKey = async () => {
    await setOpenaiApiKey(openaiKeyInput.trim());
    Alert.alert('Saved', 'OpenAI API key saved securely to Keychain.');
  };

  const handleClearOpenaiKey = async () => {
    Alert.alert('Clear API Key', 'Remove your OpenAI API key?', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await setOpenaiApiKey('');
          setOpenaiKeyInput('');
        },
      },
    ]);
  };

  const maskedKey = claudeApiKey
    ? `${claudeApiKey.slice(0, 10)}...${claudeApiKey.slice(-4)}`
    : '';

  const maskedOpenaiKey = openaiApiKey
    ? `${openaiApiKey.slice(0, 7)}...${openaiApiKey.slice(-4)}`
    : '';

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="border-b border-surface-light px-4 py-3">
        <Text className="text-lg font-bold text-text-primary">Settings</Text>
      </View>

      <ScrollView className="flex-1 px-4 pt-4">
        {/* API Key */}
        <View className="mb-6">
          <Text className="mb-2 text-sm font-semibold uppercase text-text-muted">
            Claude API Key
          </Text>
          <View className="rounded-xl bg-surface-light p-4">
            {claudeApiKey ? (
              <View>
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm text-success">Connected</Text>
                  <Pressable onPress={() => setShowKey(!showKey)}>
                    <Text className="text-xs text-accent">
                      {showKey ? 'Hide' : 'Show'}
                    </Text>
                  </Pressable>
                </View>
                <Text className="mt-1 font-mono text-xs text-text-muted">
                  {showKey ? claudeApiKey : maskedKey}
                </Text>
                <View className="mt-3 flex-row gap-2">
                  <Pressable
                    onPress={() => {
                      setKeyInput(claudeApiKey);
                    }}
                    className="rounded-lg bg-surface-lighter px-3 py-2">
                    <Text className="text-sm text-text-secondary">Edit</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleClearKey}
                    className="rounded-lg bg-danger/20 px-3 py-2">
                    <Text className="text-sm text-danger">Remove</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View>
                <TextInput
                  className="rounded-lg bg-surface px-3 py-2.5 font-mono text-sm text-text-primary"
                  placeholder="sk-ant-..."
                  placeholderTextColor="#6c7086"
                  value={keyInput}
                  onChangeText={setKeyInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry={!showKey}
                />
                <Pressable
                  onPress={handleSaveKey}
                  disabled={!keyInput.trim()}
                  className={`mt-3 rounded-lg py-2.5 ${
                    keyInput.trim() ? 'bg-primary' : 'bg-surface-lighter'
                  }`}>
                  <Text className="text-center text-sm font-semibold text-white">
                    Save Key
                  </Text>
                </Pressable>
                <Text className="mt-2 text-xs text-text-muted">
                  Stored securely in iOS Keychain / Android Keystore.
                  Never leaves your device.
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* OpenAI API Key */}
        <View className="mb-6">
          <Text className="mb-2 text-sm font-semibold uppercase text-text-muted">
            OpenAI API Key
          </Text>
          <View className="rounded-xl bg-surface-light p-4">
            {openaiApiKey ? (
              <View>
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm text-success">Connected</Text>
                  <Pressable onPress={() => setShowOpenaiKey(!showOpenaiKey)}>
                    <Text className="text-xs text-accent">
                      {showOpenaiKey ? 'Hide' : 'Show'}
                    </Text>
                  </Pressable>
                </View>
                <Text className="mt-1 font-mono text-xs text-text-muted">
                  {showOpenaiKey ? openaiApiKey : maskedOpenaiKey}
                </Text>
                <View className="mt-3 flex-row gap-2">
                  <Pressable
                    onPress={() => {
                      setOpenaiKeyInput(openaiApiKey);
                    }}
                    className="rounded-lg bg-surface-lighter px-3 py-2">
                    <Text className="text-sm text-text-secondary">Edit</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleClearOpenaiKey}
                    className="rounded-lg bg-danger/20 px-3 py-2">
                    <Text className="text-sm text-danger">Remove</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View>
                <TextInput
                  className="rounded-lg bg-surface px-3 py-2.5 font-mono text-sm text-text-primary"
                  placeholder="sk-..."
                  placeholderTextColor="#6c7086"
                  value={openaiKeyInput}
                  onChangeText={setOpenaiKeyInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry={!showOpenaiKey}
                />
                <Pressable
                  onPress={handleSaveOpenaiKey}
                  disabled={!openaiKeyInput.trim()}
                  className={`mt-3 rounded-lg py-2.5 ${
                    openaiKeyInput.trim() ? 'bg-primary' : 'bg-surface-lighter'
                  }`}>
                  <Text className="text-center text-sm font-semibold text-white">
                    Save Key
                  </Text>
                </Pressable>
                <Text className="mt-2 text-xs text-text-muted">
                  Stored securely in iOS Keychain / Android Keystore.
                  Never leaves your device.
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Bot Name */}
        <View className="mb-6">
          <Text className="mb-2 text-sm font-semibold uppercase text-text-muted">
            Bot Name
          </Text>
          <View className="rounded-xl bg-surface-light p-4">
            <TextInput
              className="rounded-lg bg-surface px-3 py-2.5 text-base text-text-primary"
              placeholder="Assistant"
              placeholderTextColor="#6c7086"
              value={nameInput}
              onChangeText={setNameInput}
              onBlur={() => {
                const name = nameInput.trim() || 'Assistant';
                setNameInput(name);
                setBotName(name);
              }}
              returnKeyType="done"
              onSubmitEditing={() => {
                const name = nameInput.trim() || 'Assistant';
                setNameInput(name);
                setBotName(name);
              }}
            />
            <Text className="mt-2 text-xs text-text-muted">
              The name your assistant uses to identify itself.
            </Text>
          </View>
        </View>

        {/* Model Selection */}
        <View className="mb-6">
          <Text className="mb-2 text-sm font-semibold uppercase text-text-muted">
            Model
          </Text>
          <View className="rounded-xl bg-surface-light">
            {MODELS.map((m, i) => (
              <Pressable
                key={m.id}
                onPress={() => setModel(m.id)}
                className={`flex-row items-center justify-between px-4 py-3.5 ${
                  i < MODELS.length - 1 ? 'border-b border-surface' : ''
                }`}>
                <Text className="text-base text-text-primary">{m.label}</Text>
                {model === m.id && (
                  <View className="h-5 w-5 items-center justify-center rounded-full bg-primary">
                    <Text className="text-xs text-white">✓</Text>
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        </View>

        {/* About */}
        <View className="mb-6">
          <Text className="mb-2 text-sm font-semibold uppercase text-text-muted">
            About
          </Text>
          <View className="rounded-xl bg-surface-light p-4">
            <Text className="text-base font-bold text-text-primary">
              Memory Assistant
            </Text>
            <Text className="mt-1 text-sm text-text-secondary">
              Version 0.0.1
            </Text>
            <Text className="mt-2 text-xs text-text-muted">
              Privacy-first personal knowledge assistant.
              All data stored locally on device.
              API keys never leave your device.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
