/**
 * @fileOverview Mobile UI role: provides the reusable Keyboard Aware Scroll View Compat component.
 * System connection: composed by Expo Router screens and aligned with shared API/auth/purchase state where required.
 */
import { ScrollView, ScrollViewProps } from 'react-native';

type Props = ScrollViewProps;

export function KeyboardAwareScrollViewCompat({
  children,
  keyboardShouldPersistTaps = 'handled',
  ...props
}: Props) {
  return (
    <ScrollView
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      automaticallyAdjustKeyboardInsets
      {...props}
    >
      {children}
    </ScrollView>
  );
}
