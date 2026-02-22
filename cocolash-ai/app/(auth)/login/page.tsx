"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Eye, EyeOff, Sparkles, Lock, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type AuthMode = "supabase" | "password";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("supabase");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSupabaseLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
        setIsLoading(false);
        return;
      }

      router.push("/generate");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setIsLoading(false);
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Invalid password. Please try again.");
        setIsLoading(false);
        return;
      }

      router.push("/generate");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-coco-beige px-4">
      <div className="pointer-events-none fixed inset-0 opacity-[0.03]">
        <div
          className="h-full w-full"
          style={{
            backgroundImage:
              "radial-gradient(circle at 25% 25%, #ce9765 1px, transparent 1px), radial-gradient(circle at 75% 75%, #ce9765 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-coco-brown shadow-lg">
            <Sparkles className="h-8 w-8 text-coco-golden" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-coco-brown">
            CocoLash AI
          </h1>
          <p className="mt-2 text-sm text-coco-brown-medium">
            Brand Image Generator
          </p>
        </div>

        <Card className="border-coco-pink-dark/30 bg-white/80 shadow-xl backdrop-blur-sm">
          <CardContent className="pt-6">
            {mode === "supabase" ? (
              <form onSubmit={handleSupabaseLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label
                    htmlFor="email"
                    className="text-sm font-medium text-coco-brown"
                  >
                    Email
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-coco-brown-medium/50" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="admin@cocolash.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (error) setError("");
                      }}
                      className="border-coco-pink-dark/40 bg-white pl-10 text-coco-brown placeholder:text-coco-brown-medium/50 focus-visible:ring-coco-golden"
                      disabled={isLoading}
                      autoFocus
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="supabase-password"
                    className="text-sm font-medium text-coco-brown"
                  >
                    Password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-coco-brown-medium/50" />
                    <Input
                      id="supabase-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (error) setError("");
                      }}
                      className="border-coco-pink-dark/40 bg-white pl-10 pr-10 text-coco-brown placeholder:text-coco-brown-medium/50 focus-visible:ring-coco-golden"
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-coco-brown-medium/60 transition-colors hover:text-coco-brown"
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isLoading || !email || !password}
                  className="w-full bg-coco-golden font-semibold text-white shadow-md transition-all hover:bg-coco-golden-dark hover:shadow-lg disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    "Sign In"
                  )}
                </Button>
              </form>
            ) : (
              <form onSubmit={handlePasswordLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label
                    htmlFor="access-password"
                    className="text-sm font-medium text-coco-brown"
                  >
                    Access Password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-coco-brown-medium/50" />
                    <Input
                      id="access-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter access password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (error) setError("");
                      }}
                      className="border-coco-pink-dark/40 bg-white pl-10 pr-10 text-coco-brown placeholder:text-coco-brown-medium/50 focus-visible:ring-coco-golden"
                      disabled={isLoading}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-coco-brown-medium/60 transition-colors hover:text-coco-brown"
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isLoading || !password}
                  className="w-full bg-coco-golden font-semibold text-white shadow-md transition-all hover:bg-coco-golden-dark hover:shadow-lg disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    "Sign In"
                  )}
                </Button>
              </form>
            )}

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => {
                  setMode(mode === "supabase" ? "password" : "supabase");
                  setError("");
                  setPassword("");
                }}
                className="text-xs text-coco-golden transition-colors hover:text-coco-golden-dark"
              >
                {mode === "supabase"
                  ? "Use access password instead"
                  : "Sign in with email"}
              </button>
            </div>

            <div className="mt-4 border-t border-coco-pink-dark/20 pt-4">
              <p className="text-center text-xs text-coco-brown-medium/70">
                This is a private application. Contact your administrator if you
                need access.
              </p>
            </div>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-coco-brown-medium/50">
          Powered by CocoLash AI &middot; Premium Content Creation
        </p>
      </div>
    </div>
  );
}
