import React from 'react';
import {Pressable, Text, View} from 'react-native';

interface SegmentTabsProps {
  tabs: string[];
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function SegmentTabs({
  tabs,
  activeTab,
  onTabChange,
}: SegmentTabsProps) {
  return (
    <View className="mx-3 mt-3 flex-row rounded-xl bg-surface-light p-1">
      {tabs.map(tab => {
        const isActive = tab === activeTab;
        return (
          <Pressable
            key={tab}
            onPress={() => onTabChange(tab)}
            className={`flex-1 items-center rounded-lg py-2 ${
              isActive ? 'bg-primary' : ''
            }`}>
            <Text
              className={`text-sm font-medium ${
                isActive ? 'text-white' : 'text-text-secondary'
              }`}>
              {tab}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
