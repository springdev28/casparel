import { useLocalSearchParams } from 'expo-router';
import { AuthenticatedWebWorkspace } from '@/components/AuthenticatedWebWorkspace';

export default function SharedActivityScreen() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;
  return <AuthenticatedWebWorkspace requiresAuth={false} path={`/activities/shared/${encodeURIComponent(token ?? '')}`} />;
}
