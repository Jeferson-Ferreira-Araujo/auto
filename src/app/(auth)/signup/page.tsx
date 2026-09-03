"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { publicEnv } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { Card, CardBody, Field, Input } from "@/components/ui/primitives";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name }, emailRedirectTo: `${publicEnv.appUrl}/auth/callback?next=/dashboard` },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (data.session) {
      router.push("/dashboard");
      router.refresh();
    } else {
      setDone(true);
    }
  }

  if (done) {
    return (
      <Card>
        <CardBody>
          <h1 className="mb-2 text-lg font-semibold">Confirme seu e-mail</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Enviamos um link de confirmação para <strong>{email}</strong>. Abra o e-mail para ativar sua conta e continuar.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody>
        <h1 className="mb-4 text-lg font-semibold">Criar conta</h1>
        <form onSubmit={onSubmit}>
          <Field label="Seu nome">
            <Input required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="E-mail">
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </Field>
          <Field label="Senha" hint="Mínimo de 6 caracteres">
            <Input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </Field>
          {error && <p className="mb-3 text-sm text-[var(--color-danger)]">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Criando…" : "Criar conta"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-[var(--color-muted)]">
          Já tem conta?{" "}
          <Link href="/login" className="font-medium text-[var(--color-primary)]">
            Entrar
          </Link>
        </p>
      </CardBody>
    </Card>
  );
}
