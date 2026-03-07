import {createMMKV} from 'react-native-mmkv';
import * as Keychain from 'react-native-keychain';
import {create} from 'zustand';

const storage = createMMKV({id: 'settings'});

export const MODELS = [
  {id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', provider: 'claude'},
  {id: 'claude-sonnet-4-5-20250514', label: 'Claude Sonnet 4.5', provider: 'claude'},
  {id: 'claude-opus-4-6', label: 'Claude Opus 4.6', provider: 'claude'},
  {id: 'gpt-4o', label: 'GPT-4o', provider: 'openai'},
  {id: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'openai'},
] as const;

interface SettingsState {
  claudeApiKey: string;
  openaiApiKey: string;
  model: string;
  botName: string;
  isLoaded: boolean;
  loadSettings: () => Promise<void>;
  setClaudeApiKey: (key: string) => Promise<void>;
  setOpenaiApiKey: (key: string) => Promise<void>;
  setModel: (model: string) => void;
  setBotName: (name: string) => void;
}

export const useSettings = create<SettingsState>((set) => ({
  claudeApiKey: '',
  openaiApiKey: '',
  model: 'claude-haiku-4-5-20251001',
  botName: 'Assistant',
  isLoaded: false,

  loadSettings: async () => {
    const model = storage.getString('model') ?? 'claude-haiku-4-5-20251001';
    const botName = storage.getString('botName') ?? 'Assistant';

    let claudeApiKey = '';
    try {
      const creds = await Keychain.getGenericPassword({service: 'claude-api-key'});
      if (creds) {
        claudeApiKey = creds.password;
      }
    } catch {}

    let openaiApiKey = '';
    try {
      const creds = await Keychain.getGenericPassword({service: 'openai-api-key'});
      if (creds) {
        openaiApiKey = creds.password;
      }
    } catch {}

    set({claudeApiKey, openaiApiKey, model, botName, isLoaded: true});
  },

  setClaudeApiKey: async (key: string) => {
    if (key) {
      await Keychain.setGenericPassword('claude', key, {
        service: 'claude-api-key',
      });
    } else {
      await Keychain.resetGenericPassword({service: 'claude-api-key'});
    }
    set({claudeApiKey: key});
  },

  setOpenaiApiKey: async (key: string) => {
    if (key) {
      await Keychain.setGenericPassword('openai', key, {
        service: 'openai-api-key',
      });
    } else {
      await Keychain.resetGenericPassword({service: 'openai-api-key'});
    }
    set({openaiApiKey: key});
  },

  setModel: (model: string) => {
    storage.set('model', model);
    set({model});
  },

  setBotName: (name: string) => {
    storage.set('botName', name);
    set({botName: name});
  },
}));
