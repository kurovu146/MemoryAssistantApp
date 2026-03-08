import {createMMKV} from 'react-native-mmkv';
import * as Keychain from 'react-native-keychain';
import {create} from 'zustand';

const storage = createMMKV({id: 'settings'});

export type ProviderName = 'claude' | 'openai' | 'gemini';

export interface ModelDef {
  id: string;
  label: string;
  provider: ProviderName;
}

export const PROVIDERS: {name: ProviderName; label: string; placeholder: string}[] = [
  {name: 'claude', label: 'Claude (Anthropic)', placeholder: 'sk-ant-...'},
  {name: 'openai', label: 'OpenAI', placeholder: 'sk-...'},
  {name: 'gemini', label: 'Gemini (Google)', placeholder: 'AIza...'},
];

export const MODELS: ModelDef[] = [
  {id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', provider: 'claude'},
  {id: 'claude-sonnet-4-5-20250514', label: 'Sonnet 4.5', provider: 'claude'},
  {id: 'claude-opus-4-6', label: 'Opus 4.6', provider: 'claude'},
  {id: 'gpt-5-mini', label: 'GPT-5 Mini', provider: 'openai'},
  {id: 'gemini-3.0-flash', label: 'Gemini 3.0 Flash', provider: 'gemini'},
  {id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite', provider: 'gemini'},
];

const KEYCHAIN_SERVICES: Record<ProviderName, string> = {
  claude: 'claude-api-key',
  openai: 'openai-api-key',
  gemini: 'gemini-api-key',
};

const VOYAGE_KEYCHAIN_SERVICE = 'voyage-api-key';

interface SettingsState {
  apiKeys: Record<ProviderName, string>;
  voyageApiKey: string;
  model: string;
  botName: string;
  isLoaded: boolean;
  loadSettings: () => Promise<void>;
  setApiKey: (provider: ProviderName, key: string) => Promise<void>;
  setVoyageApiKey: (key: string) => Promise<void>;
  setModel: (model: string) => void;
  setBotName: (name: string) => void;
  // Legacy getters for existing code
  claudeApiKey: string;
  openaiApiKey: string;
}

export function getProviderForModel(modelId: string): ProviderName {
  const m = MODELS.find(x => x.id === modelId);
  return m?.provider ?? 'claude';
}

export const useSettings = create<SettingsState>((set, get) => ({
  apiKeys: {claude: '', openai: '', gemini: ''},
  voyageApiKey: '',
  model: 'claude-haiku-4-5-20251001',
  botName: 'Assistant',
  isLoaded: false,
  claudeApiKey: '',
  openaiApiKey: '',

  loadSettings: async () => {
    const model = storage.getString('model') ?? 'claude-haiku-4-5-20251001';
    const botName = storage.getString('botName') ?? 'Assistant';

    const apiKeys: Record<ProviderName, string> = {claude: '', openai: '', gemini: ''};
    for (const [provider, service] of Object.entries(KEYCHAIN_SERVICES)) {
      try {
        const creds = await Keychain.getGenericPassword({service});
        if (creds) {
          apiKeys[provider as ProviderName] = creds.password;
        }
      } catch {}
    }

    let voyageApiKey = '';
    try {
      const creds = await Keychain.getGenericPassword({service: VOYAGE_KEYCHAIN_SERVICE});
      if (creds) {
        voyageApiKey = creds.password;
      }
    } catch {}

    set({
      apiKeys,
      voyageApiKey,
      model,
      botName,
      isLoaded: true,
      claudeApiKey: apiKeys.claude,
      openaiApiKey: apiKeys.openai,
    });
  },

  setApiKey: async (provider: ProviderName, key: string) => {
    const service = KEYCHAIN_SERVICES[provider];
    if (key) {
      await Keychain.setGenericPassword(provider, key, {service});
    } else {
      await Keychain.resetGenericPassword({service});
    }
    set(s => {
      const apiKeys = {...s.apiKeys, [provider]: key};
      return {
        apiKeys,
        claudeApiKey: apiKeys.claude,
        openaiApiKey: apiKeys.openai,
      };
    });
  },

  setVoyageApiKey: async (key: string) => {
    if (key) {
      await Keychain.setGenericPassword('voyage', key, {service: VOYAGE_KEYCHAIN_SERVICE});
    } else {
      await Keychain.resetGenericPassword({service: VOYAGE_KEYCHAIN_SERVICE});
    }
    set({voyageApiKey: key});
  },

  // Legacy methods kept for compatibility
  setClaudeApiKey: async (key: string) => get().setApiKey('claude', key),
  setOpenaiApiKey: async (key: string) => get().setApiKey('openai', key),

  setModel: (model: string) => {
    storage.set('model', model);
    set({model});
  },

  setBotName: (name: string) => {
    storage.set('botName', name);
    set({botName: name});
  },
}));
