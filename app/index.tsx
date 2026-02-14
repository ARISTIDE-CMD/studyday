import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useAppTheme } from '@/hooks/use-app-theme';
import { useAuth } from '@/providers/auth-provider';

export default function Index() {
  const { session, loading, shouldShowPostLoginIntro } = useAuth();
  const { colors } = useAppTheme();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (session) {
    if (shouldShowPostLoginIntro) {
      return <Redirect href="/post-login" />;
    }
    return <Redirect href="/(mobile)" />;
  }

  return <Redirect href="/onboarding" />;
}
