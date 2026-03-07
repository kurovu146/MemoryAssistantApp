import {createMMKV} from 'react-native-mmkv';
import * as Keychain from 'react-native-keychain';
import {create} from 'zustand';

const storage = createMMKV({id: 'settings'});

export const MODELS = [
  {id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', provider: 'claude'},
  {id: 'claude-sonnet-4-5-20250514', label: 'Claude Sonnet 4.5', provider: 'claude'},
  {id: 'claude-opus-4-6', label: 'Claude Opus 4.6', provider: 'claude'},
] as const;

interface SettingsState {
  claudeApiKey: string;
  model: string;
  isLoaded: boolean;
  loadSettings: () => Promise<void>;
  setClaudeApiKey: (key: string) => Promise<void>;
  setModel: (model: string) => void;
}

export const useSettings = create<SettingsState>((set) => ({
  claudeApiKey: '',
  model: 'claude-haiku-4-5-20251001',
  isLoaded: false,

  loadSettings: async () => {
    const model = storage.getString('model') ?? 'claude-haiku-4-5-20251001';

    let claudeApiKey = '';
    try {
      const creds = await Keychain.getGenericPassword({service: 'claude-api-key'});
      if (creds) {
        claudeApiKey = creds.password;
      }
    } catch {}

    set({claudeApiKey, model, isLoaded: true});
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

  setModel: (model: string) => {
    storage.set('model', model);
    set({model});
  },
}));
