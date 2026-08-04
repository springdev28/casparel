import { useState } from "react";
import { useLocation, Link } from "wouter";
import { ArrowRight } from "lucide-react";
import BrandIcon from "../../components/BrandIcon";
import { Button } from "@workspace/edu-ds/components/ui/button";
import { Input } from "@workspace/edu-ds/components/ui/input";
import { Label } from "@workspace/edu-ds/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/edu-ds/components/ui/card";
import { toast } from "@workspace/edu-ds/hooks/use-toast";
import { useLogin } from "@workspace/api-client-react";
import { AuthLanguageSelect } from "../../components/AuthLanguageSelect";
import { useAuthLanguage } from "../../lib/auth-locale";

const TOKEN_KEY = "schoolar_token";
const CHECK_IN_INDEX_KEY = "schoolar_check_in_index";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { language, setLanguage, copy } = useAuthLanguage();

  const loginMutation = useLogin();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const result = await loginMutation.mutateAsync({
        data: { email, password },
      });
      localStorage.setItem(TOKEN_KEY, result.token);
      const previousCheckIn = Number(
        localStorage.getItem(CHECK_IN_INDEX_KEY) ?? -1,
      );
      const nextCheckIn = (previousCheckIn + 1) % 4;
      localStorage.setItem(CHECK_IN_INDEX_KEY, String(nextCheckIn));
      sessionStorage.setItem(CHECK_IN_INDEX_KEY, String(nextCheckIn));
      setLocation("/dashboard");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : copy.loginFailed;
      toast({
        title: copy.loginFailed,
        description: message,
        variant: "destructive",
      });
    }
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center gap-2 mb-2">
            <BrandIcon className="h-20 w-36 text-foreground" label="Schoolar" />
            <span className="text-2xl font-bold text-primary">Schoolar</span>
          </div>
          <p className="text-sm text-muted-foreground">{copy.tagline}</p>
          <div className="mt-4">
            <AuthLanguageSelect
              language={language}
              label={copy.language}
              onChange={setLanguage}
            />
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{copy.loginTitle}</CardTitle>
            <CardDescription>{copy.loginDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
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
                  placeholder={copy.passwordPlaceholder}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  data-testid="password-input"
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={loginMutation.isPending}
                data-testid="login-button"
              >
                {loginMutation.isPending ? copy.signingIn : copy.signIn}
              </Button>
            </form>

            <p className="mt-4 text-center text-sm text-muted-foreground">
              {copy.noAccount}{" "}
              <Link
                href="/auth/register"
                className="text-primary font-medium hover:underline"
                data-testid="register-link"
              >
                {copy.createOne}
              </Link>
            </p>

            {/* Browse without account */}
            <div className="mt-5 pt-4 border-t border-border">
              <Link
                href="/resources"
                className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                data-testid="browse-link"
              >
                {copy.browse}
                <ArrowRight size={14} />
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
