/** Full native index for every study activity on the signed-in account. */
import React from 'react';
import { Platform, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { StudySets } from '@/components/StudySets';

export default function StudyIndexScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 0) + 8,
          paddingBottom: insets.bottom + 32,
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <StudySets limit={null} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 18 },
});
