import { useState } from 'react';
import { useLocation, Link } from 'wouter';
import BrandIcon from '../../components/BrandIcon';
import { Button } from '@workspace/edu-ds/components/ui/button';
import { Input } from '@workspace/edu-ds/components/ui/input';
import { Label } from '@workspace/edu-ds/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/edu-ds/components/ui/card';
import { toast } from '@workspace/edu-ds/hooks/use-toast';
import { useRegister } from '@workspace/api-client-react';
import { AuthLanguageSelect } from '../../components/AuthLanguageSelect';
import { useAuthLanguage } from '../../lib/auth-locale';

const TOKEN_KEY = 'schooler_token';

export default function RegisterPage() {
  const [, setLocation] = useLocation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { language, setLanguage, copy } = useAuthLanguage();

  const registerMutation = useRegister();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const result = await registerMutation.mutateAsync({ data: { name, email, password } });
      localStorage.setItem(TOKEN_KEY, result.token);
      setLocation('/dashboard');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : copy.registrationFailed;
      toast({ title: copy.registrationFailed, description: message, variant: 'destructive' });
    }
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center gap-2 mb-2">
            <BrandIcon className="h-20 w-36 text-foreground" label="Schoolar" />
            <span className="text-2xl font-bold text-primary">Schoolar</span>
          </div>
          <p className="text-sm text-muted-foreground">{copy.tagline}</p>
          <div className="mt-4">
            <AuthLanguageSelect language={language} label={copy.language} onChange={setLanguage} />
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{copy.registerTitle}</CardTitle>
            <CardDescription>{copy.registerDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">{copy.fullName}</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder={copy.namePlaceholder}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                  data-testid="name-input"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">{copy.email}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={copy.emailPlaceholder}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  data-testid="email-input"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">{copy.password}</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder={copy.newPasswordPlaceholder}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  data-testid="password-input"
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={registerMutation.isPending}
                data-testid="register-button"
              >
                {registerMutation.isPending ? copy.creatingAccount : copy.createAccount}
              </Button>
            </form>

            <p className="mt-4 text-center text-sm text-muted-foreground">
              {copy.hasAccount}{' '}
              <Link href="/auth/login" className="text-primary font-medium hover:underline" data-testid="login-link">
                {copy.signIn}
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
