import { useState } from "react";
import { useLocation, Link } from "wouter";
import { Eye, EyeOff } from "lucide-react";
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
import { useRegister } from "@workspace/api-client-react";
import { AuthLanguageSelect } from "../../components/AuthLanguageSelect";
import { useAuthLanguage } from "../../lib/auth-locale";
import { useSystemDark } from "../../hooks/use-system-dark";

const TOKEN_KEY = "schoolar_token";

export default function RegisterPage() {
  const [, setLocation] = useLocation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const { language, setLanguage, copy } = useAuthLanguage();
  const dark = useSystemDark();

  const registerMutation = useRegister();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const result = await registerMutation.mutateAsync({
        data: { name, email, password },
      });
      localStorage.setItem(TOKEN_KEY, result.token);
      // New accounts land on the guided tour first; it marks tutorialSeen and
      // moves on to the dashboard when finished or skipped.
      setLocation("/tutorial");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : copy.registrationFailed;
      toast({
        title: copy.registrationFailed,
        description: message,
        variant: "destructive",
      });
    }
  }

  return (
    <div
      className={`${dark ? "dark " : ""}min-h-[100dvh] flex items-center justify-center bg-background text-foreground px-4 py-8`}
      style={{ colorScheme: dark ? "dark" : "light" }}
    >
      <div className="w-full max-w-md">
        <h1 className="sr-only">
          {copy.registerTitle}, Casparel
        </h1>
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center gap-2 mb-2">
            <BrandIcon className="h-11 w-11" label="Casparel" />
            <span className="text-2xl font-bold text-foreground">Casparel</span>
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
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    className="pr-10"
                    placeholder={copy.newPasswordPlaceholder}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    data-testid="password-input"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={
                      showPassword ? copy.hidePassword : copy.showPassword
                    }
                    aria-pressed={showPassword}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    data-testid="toggle-password-visibility"
                  >
                    {showPassword ? (
                      <EyeOff size={16} />
                    ) : (
                      <Eye size={16} />
                    )}
                  </button>
                </div>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={registerMutation.isPending}
                data-testid="register-button"
              >
                {registerMutation.isPending
                  ? copy.creatingAccount
                  : copy.createAccount}
              </Button>
            </form>

            <p className="mt-4 text-center text-sm text-muted-foreground">
              {copy.hasAccount}{" "}
              <Link
                href="/auth/login"
                className="text-primary-text font-medium hover:underline"
                data-testid="login-link"
              >
                {copy.signIn}
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
