import { useEffect, useState, type ComponentProps, type PropsWithChildren } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { KeyboardScrollView } from './keyboard';

type IconName = ComponentProps<typeof Ionicons>['name'];
export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color?: string }) {
  const { palette } = useTheme();
  return <Ionicons name={name} size={size} color={color || palette.text} accessible={false} />;
}
export function Label({ children, secondary = false, style }: PropsWithChildren<{ secondary?: boolean; style?: ComponentProps<typeof Text>['style'] }>) {
  const { palette } = useTheme();
  return <Text style={[{ fontSize: 15, lineHeight: 22, color: secondary ? palette.secondary : palette.text }, style]}>{children}</Text>;
}
export function IconButton({ icon, label, onPress, disabled = false, active = false, size = 22 }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean; active?: boolean; size?: number }) {
  const { palette } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected: active }} disabled={disabled}
    onPress={onPress} style={({ pressed }) => [styles.iconButton, { opacity: disabled ? .35 : pressed ? .6 : 1, backgroundColor: active ? palette.raised : 'transparent' }]}>
    <Icon name={icon} size={size} color={active ? palette.gold : palette.text} />
  </Pressable>;
}
export function Button({ children, onPress, quiet = false, disabled = false, busy = false, icon }: PropsWithChildren<{ onPress: () => void; quiet?: boolean; disabled?: boolean; busy?: boolean; icon?: IconName }>) {
  const { palette } = useTheme();
  return <Pressable accessibilityRole="button" disabled={disabled || busy} accessibilityState={{ disabled: disabled || busy, busy }} onPress={onPress}
    style={({ pressed }) => [styles.button, { backgroundColor: quiet ? palette.raised : palette.text, opacity: disabled || busy ? .5 : pressed ? .7 : 1 }]}>
    {busy ? <ActivityIndicator color={quiet ? palette.text : palette.buttonText} /> : <>{icon && <Icon name={icon} color={quiet ? palette.text : palette.buttonText} size={20} />}<Text style={{ color: quiet ? palette.text : palette.buttonText, fontSize: 15, fontWeight: '500' }}>{children}</Text></>}
  </Pressable>;
}
export function Field(props: TextInputProps) {
  const { palette } = useTheme();
  return <TextInput placeholderTextColor={palette.quiet} {...props} style={[styles.field, { backgroundColor: palette.panel, color: palette.text, borderColor: palette.line }, props.style]} />;
}
export function Notice({ message, onDismiss, action, error = false }: { message: string; onDismiss?: () => void; action?: { label: string; onPress: () => void }; error?: boolean }) {
  const { palette } = useTheme();
  return <View accessibilityLiveRegion="polite" style={[styles.notice, { backgroundColor: palette.raised }]}>
    <View style={{ flex: 1, gap: 8 }}><Label style={{ fontSize: 13, lineHeight: 19, color: error ? palette.error : palette.secondary }}>{message}</Label>
      {action && <Pressable onPress={action.onPress} accessibilityRole="button"><Label style={{ color: palette.gold, fontWeight: '500' }}>{action.label}</Label></Pressable>}</View>
    {onDismiss && <IconButton icon="close-outline" label="Dismiss message" onPress={onDismiss} />}
  </View>;
}
export function Screen({ children, scroll = true, style }: PropsWithChildren<{ scroll?: boolean; style?: ViewStyle }>) {
  const { palette } = useTheme();
  return <SafeAreaView edges={['top', 'left', 'right']} style={[styles.screen, { backgroundColor: palette.background }]}>
    {scroll ? <KeyboardScrollView contentContainerStyle={[styles.content, style]}>{children}</KeyboardScrollView> : <View style={[styles.content, { flex: 1 }, style]}>{children}</View>}
  </SafeAreaView>;
}
export function Heading({ title, subtitle, accessory }: { title: string; subtitle?: string; accessory?: React.ReactNode }) {
  const { palette } = useTheme();
  return <View style={styles.heading}><View style={{ flex: 1, gap: 8 }}>
    <Text accessibilityRole="header" style={{ fontSize: 32, lineHeight: 38, fontWeight: '500', letterSpacing: -.7, color: palette.text }}>{title}</Text>
    {subtitle && <Label secondary style={{ fontSize: 14 }}>{subtitle}</Label>}
  </View>{accessory}</View>;
}
export function Cover({ uri, size = 56, label }: { uri?: string; size?: number; label?: string }) {
  const { palette } = useTheme();
  const [failed, setFailed] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- A changed remote image gets a fresh failure state.
  useEffect(() => setFailed(false), [uri]);
  return <View style={{ width: size, height: size, borderRadius: size > 100 ? 16 : 8, backgroundColor: palette.raised, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
    {uri && !failed ? <Image source={{ uri }} onError={() => setFailed(true)} accessibilityLabel={label || 'Album artwork'} style={{ width: '100%', height: '100%' }} /> : <Icon name="musical-notes-outline" size={size > 100 ? 48 : 22} color={palette.quiet} />}
  </View>;
}
export function Empty({ icon, title, detail, children }: PropsWithChildren<{ icon: IconName; title: string; detail: string }>) {
  const { palette } = useTheme();
  return <View style={[styles.empty, { borderColor: palette.line }]}><Icon name={icon} size={28} color={palette.gold} /><Label style={{ fontSize: 20, fontWeight: '500' }}>{title}</Label><Label secondary style={{ textAlign: 'center', maxWidth: 280, fontSize: 14 }}>{detail}</Label>{children}</View>;
}
export const styles = StyleSheet.create({
  screen: { flex: 1 }, content: { padding: 24, gap: 24, paddingBottom: 32 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingTop: 8 },
  iconButton: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  button: { minHeight: 48, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  field: { borderWidth: 1, borderRadius: 10, minHeight: 52, paddingHorizontal: 16, fontSize: 16 },
  notice: { padding: 16, borderRadius: 12, gap: 8, flexDirection: 'row', alignItems: 'center' },
  empty: { borderWidth: 1, borderRadius: 16, padding: 28, gap: 12, alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  section: { gap: 16 },
});
