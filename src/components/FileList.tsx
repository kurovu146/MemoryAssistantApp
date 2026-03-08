import React, {useCallback} from 'react';
import {Alert, FlatList, Image, Pressable, Text, View} from 'react-native';
import type {UploadedFile} from '../db/repository';
import {formatFileSize, getAbsolutePath} from '../utils/file-manager';

const FILE_ICONS: Record<string, string> = {
  image: '🖼️',
  text: '📄',
  application: '📎',
};

function getFileIcon(mimeType: string): string {
  const type = mimeType.split('/')[0];
  return FILE_ICONS[type] ?? '📎';
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'Z');
  return d.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function FileItem({
  file,
  onDelete,
}: {
  file: UploadedFile;
  onDelete: (file: UploadedFile) => void;
}) {
  const isImage = file.mimeType.startsWith('image/');

  return (
    <Pressable
      onLongPress={() =>
        Alert.alert(
          'Delete File',
          `Delete "${file.filename}"?\n\nThis will also remove linked knowledge documents, chunks, and entity mentions.`,
          [
            {text: 'Cancel', style: 'cancel'},
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => onDelete(file),
            },
          ],
        )
      }
      className="mx-3 my-1 flex-row items-center rounded-xl bg-surface-light px-4 py-3">
      {isImage ? (
        <Image
          source={{uri: `file://${getAbsolutePath(file.storedPath)}`}}
          className="h-12 w-12 rounded-lg"
          resizeMode="cover"
        />
      ) : (
        <View className="h-12 w-12 items-center justify-center rounded-lg bg-surface-lighter">
          <Text className="text-2xl">{getFileIcon(file.mimeType)}</Text>
        </View>
      )}

      <View className="ml-3 flex-1">
        <Text
          className="text-base text-text-primary"
          numberOfLines={1}
          ellipsizeMode="middle">
          {file.filename}
        </Text>
        <View className="mt-1 flex-row items-center gap-2">
          <Text className="text-xs text-text-muted">
            {formatFileSize(file.sizeBytes)}
          </Text>
          <Text className="text-xs text-text-muted">
            {formatDate(file.createdAt)}
          </Text>
          {file.docId && (
            <View className="rounded-full bg-primary/20 px-1.5 py-0.5">
              <Text className="text-[10px] text-accent">linked</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

interface FileListProps {
  files: UploadedFile[];
  onDelete: (file: UploadedFile) => void;
}

export default function FileList({files, onDelete}: FileListProps) {
  const renderItem = useCallback(
    ({item}: {item: UploadedFile}) => (
      <FileItem file={item} onDelete={onDelete} />
    ),
    [onDelete],
  );

  return (
    <FlatList
      data={files}
      renderItem={renderItem}
      keyExtractor={item => item.id.toString()}
      contentContainerStyle={{paddingVertical: 8}}
      ListEmptyComponent={
        <View className="items-center pt-20">
          <Text className="text-4xl">📁</Text>
          <Text className="mt-3 text-base text-text-muted">No files yet</Text>
          <Text className="mt-1 text-sm text-text-muted">
            Use the clip button in Chat to upload files
          </Text>
        </View>
      }
    />
  );
}
