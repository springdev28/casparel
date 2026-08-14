import { useState } from "react";
import { useLocation, Link } from "wouter";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
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
import { useSystemDark } from "../../hooks/use-system-dark";

const TOKEN_KEY = "schoolar_token";
const CHECK_IN_INDEX_KEY = "schoolar_check_in_index";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const { language, setLanguage, copy } = useAuthLanguage();
  const dark = useSystemDark();

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
      // Try to surface the server's friendly error text (e.g. rate-limit message
      // with retry-after seconds) instead of a generic "Network Error".
      let message = copy.loginFailed;
      if (err instanceof Error) {
        // axios wraps the response body in err.response.data.error
        const axiosData = (err as unknown as { response?: { data?: { error?: string } } }).response?.data;
        message = axiosData?.error ?? err.message;
      }
      toast({
        title: copy.loginFailed,
        description: message,
        variant: "destructive",
      });
    }
  }

  return (
    <div
      className={`${dark ? "dark " : ""}min-h-[100dvh] flex items-center justify-center bg-background text-foreground px-4`}
      style={{ colorScheme: dark ? "dark" : "light" }}
    >
      <div className="w-full max-w-md">
        <h1 className="sr-only">
          {copy.loginTitle}, Casparel
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
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    className="pr-10"
                    placeholder={copy.passwordPlaceholder}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
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
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
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
                className="text-primary-text font-medium hover:underline"
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
