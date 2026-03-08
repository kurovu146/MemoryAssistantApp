import React, {useState} from 'react';
import {Alert, Pressable, ScrollView, Text, TextInput, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  MODELS,
  PROVIDERS,
  useSettings,
  getProviderForModel,
  type ProviderName,
} from '../stores/settings';


const PROVIDER_ICONS: Record<ProviderName, string> = {
  claude: 'C',
  openai: 'O',
  gemini: 'G',
};

function ProviderSection({provider}: {provider: (typeof PROVIDERS)[number]}) {
  const {apiKeys, model, setApiKey, setModel} = useSettings();
  const key = apiKeys[provider.name];
  const [keyInput, setKeyInput] = useState(key);
  const [showKey, setShowKey] = useState(false);
  const [editing, setEditing] = useState(false);

  const providerModels = MODELS.filter(m => m.provider === provider.name);

  const masked = key
    ? `${key.slice(0, Math.min(8, key.length))}...${key.slice(-4)}`
    : '';

  const handleSave = async () => {
    await setApiKey(provider.name, keyInput.trim());
    setEditing(false);
    Alert.alert('Saved', `${provider.label} key saved to Keychain.`);
  };

  const handleClear = () => {
    Alert.alert('Remove Key', `Remove ${provider.label} API key?`, [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await setApiKey(provider.name, '');
          setKeyInput('');
          setEditing(false);
        },
      },
    ]);
  };

  return (
    <View>
      {/* API Key */}
      <View className="mb-4 rounded-xl bg-surface-light p-4">
        <Text className="mb-2 text-xs font-semibold uppercase text-text-muted">
          API Key
        </Text>
        {key && !editing ? (
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
              {showKey ? key : masked}
            </Text>
            <View className="mt-2 flex-row gap-2">
              <Pressable
                onPress={() => {
                  setKeyInput(key);
                  setEditing(true);
                }}
                className="rounded-lg bg-surface-lighter px-3 py-1.5">
                <Text className="text-xs text-text-secondary">Edit</Text>
              </Pressable>
              <Pressable
                onPress={handleClear}
                className="rounded-lg bg-danger/20 px-3 py-1.5">
                <Text className="text-xs text-danger">Remove</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View>
            <TextInput
              className="rounded-lg bg-surface px-3 py-2 font-mono text-sm text-text-primary"
              placeholder={provider.placeholder}
              placeholderTextColor="#6c7086"
              value={keyInput}
              onChangeText={setKeyInput}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={!showKey}
            />
            <View className="mt-2 flex-row gap-2">
              <Pressable
                onPress={handleSave}
                disabled={!keyInput.trim()}
                className={`flex-1 rounded-lg py-2 ${
                  keyInput.trim() ? 'bg-primary' : 'bg-surface-lighter'
                }`}>
                <Text className="text-center text-sm font-semibold text-white">
                  Save
                </Text>
              </Pressable>
              {editing && (
                <Pressable
                  onPress={() => {
                    setKeyInput(key);
                    setEditing(false);
                  }}
                  className="rounded-lg bg-surface-lighter px-4 py-2">
                  <Text className="text-sm text-text-secondary">Cancel</Text>
                </Pressable>
              )}
            </View>
            <Text className="mt-2 text-xs text-text-muted">
              Stored in Keychain. Never leaves your device.
            </Text>
          </View>
        )}
      </View>

      {/* Models */}
      <View className="mb-4 rounded-xl bg-surface-light">
        <Text className="px-4 pb-1 pt-3 text-xs font-semibold uppercase text-text-muted">
          Model
        </Text>
        {providerModels.map((m, i) => {
          const isSelected = model === m.id;
          const hasKey = !!key;
          return (
            <Pressable
              key={m.id}
              onPress={() => hasKey && setModel(m.id)}
              className={`flex-row items-center justify-between px-4 py-3 ${
                i < providerModels.length - 1 ? 'border-b border-surface' : ''
              } ${!hasKey ? 'opacity-40' : ''}`}>
              <Text
                className={`text-base ${
                  isSelected ? 'font-semibold text-accent' : 'text-text-primary'
                }`}>
                {m.label}
              </Text>
              {isSelected && (
                <View className="h-5 w-5 items-center justify-center rounded-full bg-primary">
                  <Text className="text-xs text-white">✓</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function EmbeddingsSection() {
  const {voyageApiKey, setVoyageApiKey} = useSettings();
  const [keyInput, setKeyInput] = useState(voyageApiKey);
  const [showKey, setShowKey] = useState(false);
  const [editing, setEditing] = useState(false);

  const masked = voyageApiKey
    ? `${voyageApiKey.slice(0, Math.min(8, voyageApiKey.length))}...${voyageApiKey.slice(-4)}`
    : '';

  const handleSave = async () => {
    await setVoyageApiKey(keyInput.trim());
    setEditing(false);
    Alert.alert('Saved', 'Voyage AI key saved to Keychain.');
  };

  const handleClear = () => {
    Alert.alert('Remove Key', 'Remove Voyage AI API key?', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await setVoyageApiKey('');
          setKeyInput('');
          setEditing(false);
        },
      },
    ]);
  };

  return (
    <View className="mb-4 rounded-xl bg-surface-light p-4">
      <Text className="mb-0.5 text-sm font-semibold text-text-primary">
        Voyage AI
      </Text>
      <Text className="mb-3 text-xs text-text-muted">
        Optional — enables semantic search
      </Text>
      {voyageApiKey && !editing ? (
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
            {showKey ? voyageApiKey : masked}
          </Text>
          <View className="mt-2 flex-row gap-2">
            <Pressable
              onPress={() => {
                setKeyInput(voyageApiKey);
                setEditing(true);
              }}
              className="rounded-lg bg-surface-lighter px-3 py-1.5">
              <Text className="text-xs text-text-secondary">Edit</Text>
            </Pressable>
            <Pressable
              onPress={handleClear}
              className="rounded-lg bg-danger/20 px-3 py-1.5">
              <Text className="text-xs text-danger">Remove</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View>
          <TextInput
            className="rounded-lg bg-surface px-3 py-2 font-mono text-sm text-text-primary"
            placeholder="pa-..."
            placeholderTextColor="#6c7086"
            value={keyInput}
            onChangeText={setKeyInput}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry={!showKey}
          />
          <View className="mt-2 flex-row gap-2">
            <Pressable
              onPress={handleSave}
              disabled={!keyInput.trim()}
              className={`flex-1 rounded-lg py-2 ${
                keyInput.trim() ? 'bg-primary' : 'bg-surface-lighter'
              }`}>
              <Text className="text-center text-sm font-semibold text-white">
                Save
              </Text>
            </Pressable>
            {editing && (
              <Pressable
                onPress={() => {
                  setKeyInput(voyageApiKey);
                  setEditing(false);
                }}
                className="rounded-lg bg-surface-lighter px-4 py-2">
                <Text className="text-sm text-text-secondary">Cancel</Text>
              </Pressable>
            )}
          </View>
          <Text className="mt-2 text-xs text-text-muted">
            Stored in Keychain. Never leaves your device.
          </Text>
        </View>
      )}
    </View>
  );
}

export default function SettingsScreen() {
  const {botName, setBotName, model, apiKeys} = useSettings();
  const [nameInput, setNameInput] = useState(botName);
  const [activeTab, setActiveTab] = useState<ProviderName>(
    getProviderForModel(model),
  );

  const activeProvider = PROVIDERS.find(p => p.name === activeTab)!;

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="border-b border-surface-light px-4 py-3">
        <Text className="text-lg font-bold text-text-primary">Settings</Text>
      </View>

      <ScrollView className="flex-1 px-4 pt-4">
        {/* Bot Name */}
        <View className="mb-4 rounded-xl bg-surface-light p-4">
          <Text className="mb-2 text-xs font-semibold uppercase text-text-muted">
            Bot Name
          </Text>
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
        </View>

        {/* Provider Tabs */}
        <View className="mb-4 flex-row gap-2">
          {PROVIDERS.map(p => {
            const isActive = activeTab === p.name;
            const hasKey = !!apiKeys[p.name];
            return (
              <Pressable
                key={p.name}
                onPress={() => setActiveTab(p.name)}
                className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2.5 ${
                  isActive ? 'bg-primary' : 'bg-surface-light'
                }`}>
                <Text
                  className={`text-sm font-bold ${
                    isActive ? 'text-white' : 'text-text-muted'
                  }`}>
                  {PROVIDER_ICONS[p.name]}
                </Text>
                <Text
                  className={`text-sm font-medium ${
                    isActive ? 'text-white' : 'text-text-secondary'
                  }`}>
                  {p.name.charAt(0).toUpperCase() + p.name.slice(1)}
                </Text>
                {hasKey && !isActive && (
                  <View className="h-1.5 w-1.5 rounded-full bg-success" />
                )}
              </Pressable>
            );
          })}
        </View>

        {/* Active Provider Content */}
        <ProviderSection provider={activeProvider} />

        {/* Embeddings */}
        <Text className="mb-2 text-xs font-semibold uppercase text-text-muted">
          Embeddings
        </Text>
        <EmbeddingsSection />

        {/* About */}
        <View className="mb-6 rounded-xl bg-surface-light p-4">
          <Text className="text-base font-bold text-text-primary">
            Memory Assistant
          </Text>
          <Text className="mt-1 text-sm text-text-secondary">
            Version 0.0.1
          </Text>
          <Text className="mt-2 text-xs text-text-muted">
            Privacy-first personal knowledge assistant.{'\n'}
            All data stored locally on device.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
