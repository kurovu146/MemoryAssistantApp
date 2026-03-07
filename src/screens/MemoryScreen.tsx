import React, {useCallback, useEffect, useState} from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import * as repo from '../db/repository';
import type {MemoryFact} from '../db/repository';

function FactItem({
  fact,
  onDelete,
}: {
  fact: MemoryFact;
  onDelete: (id: number) => void;
}) {
  return (
    <Pressable
      onLongPress={() =>
        Alert.alert('Delete Memory', `Delete "#${fact.id}: ${fact.fact}"?`, [
          {text: 'Cancel', style: 'cancel'},
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => onDelete(fact.id),
          },
        ])
      }
      className="mx-3 my-1 rounded-xl bg-surface-light px-4 py-3">
      <View className="flex-row items-start justify-between">
        <Text className="flex-1 text-base text-text-primary" selectable>
          {fact.fact}
        </Text>
        <Text className="ml-2 text-xs text-text-muted">#{fact.id}</Text>
      </View>
      <View className="mt-2 flex-row">
        <View className="rounded-full bg-surface-lighter px-2 py-0.5">
          <Text className="text-xs text-accent">{fact.category}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function MemoryScreen() {
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);

  const loadData = useCallback(() => {
    setCategories(repo.listCategories());
    if (search.trim()) {
      setFacts(repo.searchFacts(search.trim()));
    } else {
      setFacts(repo.listFacts(selectedCategory ?? undefined));
    }
  }, [search, selectedCategory]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDelete = useCallback(
    (id: number) => {
      repo.deleteFact(id);
      loadData();
    },
    [loadData],
  );

  const renderFact = useCallback(
    ({item}: {item: MemoryFact}) => (
      <FactItem fact={item} onDelete={handleDelete} />
    ),
    [handleDelete],
  );

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="border-b border-surface-light px-4 py-3">
        <Text className="text-lg font-bold text-text-primary">Memory</Text>
      </View>

      <View className="px-3 pt-3">
        <TextInput
          className="rounded-xl bg-surface-light px-4 py-2.5 text-base text-text-primary"
          placeholder="Search memories..."
          placeholderTextColor="#6c7086"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {!search && (
        <View className="px-3 pt-3">
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={['all', ...categories]}
            keyExtractor={item => item}
            renderItem={({item}) => {
              const isSelected =
                item === 'all' ? !selectedCategory : selectedCategory === item;
              return (
                <Pressable
                  onPress={() =>
                    setSelectedCategory(item === 'all' ? null : item)
                  }
                  className={`mr-2 rounded-full px-3 py-1.5 ${
                    isSelected ? 'bg-primary' : 'bg-surface-light'
                  }`}>
                  <Text
                    className={`text-sm ${
                      isSelected ? 'text-white' : 'text-text-secondary'
                    }`}>
                    {item === 'all' ? 'All' : item}
                  </Text>
                </Pressable>
              );
            }}
          />
        </View>
      )}

      <FlatList
        data={facts}
        renderItem={renderFact}
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={{paddingVertical: 8}}
        ListEmptyComponent={
          <View className="items-center pt-20">
            <Text className="text-4xl">📝</Text>
            <Text className="mt-3 text-base text-text-muted">
              {search ? 'No results found' : 'No memories yet'}
            </Text>
            <Text className="mt-1 text-sm text-text-muted">
              Chat with Kuro to save memories
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}
