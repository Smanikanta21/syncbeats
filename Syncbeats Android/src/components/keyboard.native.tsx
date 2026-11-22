import type { PropsWithChildren } from 'react';
import { Platform, type ScrollViewProps } from 'react-native';
import { KeyboardAwareScrollView, KeyboardProvider, useKeyboardState } from 'react-native-keyboard-controller';

export function KeyboardRoot({ children }: PropsWithChildren) {
  return <KeyboardProvider statusBarTranslucent navigationBarTranslucent>{children}</KeyboardProvider>;
}
export function KeyboardScrollView(props: ScrollViewProps) {
  return <KeyboardAwareScrollView
    bottomOffset={24}
    keyboardShouldPersistTaps="handled"
    keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
    {...props}
  />;
}
export function useKeyboardVisible() { return useKeyboardState(state => state.isVisible); }
