"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Eye, EyeOff, Sparkles } from "lucide-react";

/**
 * Login Page — Simple password-based authentication.
 * Posts to /api/auth, which sets a httpOnly cookie on success.
 * Styled with CocoLash brand aesthetic: warm, elegant, luxury.
 */
export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
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

      // Success — redirect to the main app
      router.push("/generate");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-coco-beige px-4">
      {/* Subtle background pattern */}
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
        {/* Logo & Brand Header */}
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

        {/* Login Card */}
        <Card className="border-coco-pink-dark/30 bg-white/80 shadow-xl backdrop-blur-sm">
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label
                  htmlFor="password"
                  className="text-sm font-medium text-coco-brown"
                >
                  Access Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError("");
                    }}
                    className="border-coco-pink-dark/40 bg-white pr-10 text-coco-brown placeholder:text-coco-brown-medium/50 focus-visible:ring-coco-golden"
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

              {/* Error message */}
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                  {error}
                </div>
              )}

              {/* Submit button — golden/brand accent */}
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

            {/* Footer note */}
            <div className="mt-6 border-t border-coco-pink-dark/20 pt-4">
              <p className="text-center text-xs text-coco-brown-medium/70">
                This is a private application. Contact your administrator if you
                need access.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Bottom branding */}
        <p className="mt-6 text-center text-xs text-coco-brown-medium/50">
          Powered by CocoLash AI &middot; Premium Content Creation
        </p>
      </div>
    </div>
  );
}
