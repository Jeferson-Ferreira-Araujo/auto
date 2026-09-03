"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardBody, Field, Input } from "@/components/ui/primitives";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(params.get("erro") ? "Não foi possível entrar. Tente novamente." : null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError("E-mail ou senha incorretos.");
      return;
    }
    router.push(params.get("next") ?? "/");
    router.refresh();
  }

  return (
    <Card>
      <CardBody>
        <h1 className="mb-4 text-lg font-semibold">Entrar</h1>
        <form onSubmit={onSubmit}>
          <Field label="E-mail">
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </Field>
          <Field label="Senha">
            <Input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </Field>
          {error && <p className="mb-3 text-sm text-[var(--color-danger)]">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Entrando…" : "Entrar"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-[var(--color-muted)]">
          Não tem conta?{" "}
          <Link href="/signup" className="font-medium text-[var(--color-primary)]">
            Criar conta
          </Link>
        </p>
      </CardBody>
    </Card>
  );
}
