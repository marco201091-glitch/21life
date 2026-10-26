import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputInstance,
  type TextInputSelectionChangeEvent,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { FormattedMarkdown } from '@/components/ui/formatted-markdown';
import { useLanguage } from '@/contexts/language-context';
import { colors, radii, spacing } from '@/constants/theme';
import { layout } from '@/lib/layout';
import {
  toggleLinePrefix,
  wrapSelectionWithMarker,
  type TextSelection,
} from '@/lib/rich-text';

type RichTextInputProps = {
  label?: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  hint?: string;
  minHeight?: number;
  onFocus?: () => void;
};

export function RichTextInput({
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  minHeight = 120,
  onFocus,
}: RichTextInputProps) {
  const { copy } = useLanguage();
  const inputRef = useRef<TextInputInstance>(null);
  const [selection, setSelection] = useState<TextSelection>({ start: value.length, end: value.length });
  const [focused, setFocused] = useState(false);
  const [toolbarOpen, setToolbarOpen] = useState(false);

  // Keep the native cursor valid when the controlled value is reset by a form
  // (opening another match, clearing a field, or applying a toolbar edit).
  useEffect(() => {
    const max = value.length;
    if (selection.start <= max && selection.end <= max) return;
    const next = { start: Math.min(selection.start, max), end: Math.min(selection.end, max) };
    setSelection(next);
    requestAnimationFrame(() => inputRef.current?.setNativeProps({ selection: next }));
  }, [selection, value.length]);

  const applyEdit = useCallback((
    editor: (currentValue: string, currentSelection: TextSelection) => {
      value: string;
      selection: TextSelection;
    },
  ) => {
    const result = editor(value, selection);
    onChangeText(result.value);
    setSelection(result.selection);
    requestAnimationFrame(() => {
      inputRef.current?.setNativeProps({
        selection: {
          start: result.selection.start,
          end: result.selection.end,
        },
      });
      inputRef.current?.focus();
    });
  }, [onChangeText, selection, value]);

  const handleSelectionChange = (event: TextInputSelectionChangeEvent) => {
    setSelection({
      start: event.nativeEvent.selection.start,
      end: event.nativeEvent.selection.end,
    });
  };

  const beginEditing = () => {
    setFocused(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const showPreview = !focused && value.trim().length > 0;

  return (
    <View style={styles.wrapper}>
      {label ? (
        <Text style={styles.label} maxFontSizeMultiplier={layout.maxFontSizeMultiplier}>
          {label}
        </Text>
      ) : null}
      <View style={[styles.editor, focused && styles.editorFocused]}>
        {showPreview ? (
          <Pressable
            onPress={beginEditing}
            style={[styles.preview, { minHeight }]}
            accessibilityRole="button"
            accessibilityLabel={label || placeholder || copy('editNotes')}
          >
            <FormattedMarkdown value={value} style={styles.previewMarkdown} />
            <Text style={styles.previewHint}>{copy('richTextTapToEdit')}</Text>
          </Pressable>
        ) : (
          <>
            <View style={styles.toolbarRow}>
              <Pressable
                onPress={() => setToolbarOpen((open) => !open)}
                style={({ pressed }) => [styles.formatToggle, pressed && styles.toolbarButtonPressed]}
                accessibilityRole="button"
                accessibilityState={{ expanded: toolbarOpen }}
                accessibilityLabel={copy('formattingOptions')}
              >
                <Ionicons
                  name={toolbarOpen ? 'chevron-up' : 'options-outline'}
                  size={16}
                  color={colors.foreground}
                />
              </Pressable>
              {toolbarOpen ? (
                <View style={styles.toolbar}>
                  <ToolbarButton
                    icon="format-bold"
                    label={copy('bold')}
                    onPress={() => applyEdit((currentValue, currentSelection) => wrapSelectionWithMarker(currentValue, currentSelection, '**'))}
                  />
                  <ToolbarButton
                    icon="format-italic"
                    label={copy('italic')}
                    onPress={() => applyEdit((currentValue, currentSelection) => wrapSelectionWithMarker(currentValue, currentSelection, '*'))}
                  />
                  <ToolbarButton
                    icon="format-strikethrough"
                    label={copy('strikethrough')}
                    onPress={() => applyEdit((currentValue, currentSelection) => wrapSelectionWithMarker(currentValue, currentSelection, '~~'))}
                  />
                  <ToolbarButton
                    ionicon="list-outline"
                    label={copy('bulletList')}
                    onPress={() => applyEdit((currentValue, currentSelection) => toggleLinePrefix(currentValue, currentSelection, '- '))}
                  />
                </View>
              ) : null}
            </View>
            <TextInput
              ref={inputRef}
              value={value}
              selection={selection}
              onChangeText={onChangeText}
              onSelectionChange={handleSelectionChange}
              onFocus={() => {
                setFocused(true);
                // Android can restore a stale selection (often position 0)
                // when a controlled multiline input regains focus.
                const next = {
                  start: Math.min(selection.start, value.length),
                  end: Math.min(selection.end, value.length),
                };
                setSelection(next);
                onFocus?.();
              }}
              onBlur={() => {
                setFocused(false);
                setToolbarOpen(false);
              }}
              placeholder={placeholder}
              placeholderTextColor={colors.muted}
              selectionColor={colors.primaryLight}
              multiline
              scrollEnabled
              textAlignVertical="top"
              style={[styles.input, { height: minHeight }]}
              maxFontSizeMultiplier={layout.maxFontSizeMultiplier}
            />
          </>
        )}
      </View>
      {hint ? (
        <Text style={styles.hint} maxFontSizeMultiplier={layout.maxFontSizeMultiplier}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

function ToolbarButton({
  icon,
  ionicon,
  label,
  onPress,
}: {
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  ionicon?: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.toolbarButton, pressed && styles.toolbarButtonPressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {icon ? (
        <MaterialCommunityIcons name={icon} size={16} color={colors.foreground} />
      ) : (
        <Ionicons name={ionicon!} size={16} color={colors.foreground} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.sm,
  },
  label: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '600',
  },
  editor: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.inputBg,
    overflow: 'hidden',
  },
  editorFocused: {
    borderColor: colors.primaryLight,
    backgroundColor: colors.selectionTint,
    shadowColor: colors.primary,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  formatToggle: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  toolbar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  toolbarButton: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  toolbarButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.94 }],
  },
  input: {
    color: colors.foreground,
    fontSize: 16,
    lineHeight: 22,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  preview: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  previewMarkdown: {
    flex: 1,
  },
  previewHint: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  hint: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
  },
});
