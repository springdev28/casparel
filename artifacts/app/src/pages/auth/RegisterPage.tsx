import { useState } from 'react';
import { useLocation, Link } from 'wouter';
import { GraduationCap } from 'lucide-react';
import { Button } from '@workspace/edu-ds/components/ui/button';
import { Input } from '@workspace/edu-ds/components/ui/input';
import { Label } from '@workspace/edu-ds/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/edu-ds/components/ui/card';
import { toast } from '@workspace/edu-ds/hooks/use-toast';
import { useRegister } from '@workspace/api-client-react';

const TOKEN_KEY = 'schooler_token';

export default function RegisterPage() {
  const [, setLocation] = useLocation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const registerMutation = useRegister();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const result = await registerMutation.mutateAsync({ data: { name, email, password } });
      localStorage.setItem(TOKEN_KEY, result.token);
      setLocation('/dashboard');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      toast({ title: 'Registration failed', description: message, variant: 'destructive' });
    }
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center gap-2 mb-2">
            <GraduationCap size={32} className="text-primary" />
            <span className="text-2xl font-bold text-primary">Schooler</span>
          </div>
          <p className="text-sm text-muted-foreground">Your student &amp; teacher productivity platform</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Create an account</CardTitle>
            <CardDescription>Join Schooler to start learning and teaching</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Full name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Jane Smith"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                  data-testid="name-input"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  data-testid="email-input"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Min. 6 characters"
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
                {registerMutation.isPending ? 'Creating account…' : 'Create account'}
              </Button>
            </form>

            <p className="mt-4 text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link href="/auth/login" className="text-primary font-medium hover:underline" data-testid="login-link">
                Sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
