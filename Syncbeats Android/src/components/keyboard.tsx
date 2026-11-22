import type { PropsWithChildren } from 'react';
import { ScrollView, type ScrollViewProps } from 'react-native';

// The browser manages its own input viewport. Metro selects keyboard.native.tsx on phones.
export function KeyboardRoot({ children }: PropsWithChildren) { return <>{children}</>; }
export function KeyboardScrollView(props: ScrollViewProps) { return <ScrollView keyboardShouldPersistTaps="handled" {...props} />; }
export function useKeyboardVisible() { return false; }
