import './global.css';
import React, {useEffect} from 'react';
import {StatusBar, Text} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {NavigationContainer} from '@react-navigation/native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {GestureHandlerRootView} from 'react-native-gesture-handler';

import ChatScreen from './src/screens/ChatScreen';
import MemoryScreen from './src/screens/MemoryScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import {useSettings} from './src/stores/settings';

const Tab = createBottomTabNavigator();

const THEME = {
  dark: true,
  colors: {
    primary: '#6366f1',
    background: '#1e1e2e',
    card: '#1e1e2e',
    text: '#cdd6f4',
    border: '#313244',
    notification: '#f38ba8',
  },
  fonts: {
    regular: {fontFamily: 'System', fontWeight: '400' as const},
    medium: {fontFamily: 'System', fontWeight: '500' as const},
    bold: {fontFamily: 'System', fontWeight: '700' as const},
    heavy: {fontFamily: 'System', fontWeight: '900' as const},
  },
};

function TabIcon({label, focused}: {label: string; focused: boolean}) {
  const icons: Record<string, string> = {
    Chat: '💬',
    Memory: '🧠',
    Settings: '⚙️',
  };
  return (
    <Text style={{fontSize: 22, opacity: focused ? 1 : 0.5}}>
      {icons[label] ?? '?'}
    </Text>
  );
}

export default function App() {
  const {loadSettings, isLoaded} = useSettings();

  useEffect(() => {
    loadSettings();
  }, []);

  if (!isLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor="#1e1e2e" />
        <NavigationContainer theme={THEME}>
          <Tab.Navigator
            screenOptions={({route}) => ({
              headerShown: false,
              tabBarIcon: ({focused}) => (
                <TabIcon label={route.name} focused={focused} />
              ),
              tabBarActiveTintColor: '#6366f1',
              tabBarInactiveTintColor: '#6c7086',
              tabBarStyle: {
                backgroundColor: '#1e1e2e',
                borderTopColor: '#313244',
              },
            })}>
            <Tab.Screen name="Chat" component={ChatScreen} />
            <Tab.Screen name="Memory" component={MemoryScreen} />
            <Tab.Screen name="Settings" component={SettingsScreen} />
          </Tab.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
