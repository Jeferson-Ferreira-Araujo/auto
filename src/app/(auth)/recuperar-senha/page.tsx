"use client";

import { useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { publicEnv } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { Card, CardBody, Field, Input } from "@/components/ui/primitives";

export default function RecoverPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    // Não revelamos se o e-mail existe — sempre mostramos a mesma confirmação.
    await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${publicEnv.appUrl}/auth/callback?next=/nova-senha`,
    });
    setLoading(false);
    setSent(true);
  }

  if (sent) {
    return (
      <Card>
        <CardBody>
          <h1 className="mb-2 text-lg font-semibold">Verifique seu e-mail</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Se existe uma conta com <strong>{email}</strong>, enviamos um link para redefinir a senha. O link vale por
            1 hora.
          </p>
          <p className="mt-4 text-center text-sm text-[var(--color-muted)]">
            <Link href="/login" className="font-medium text-[var(--color-primary)]">
              Voltar para entrar
            </Link>
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody>
        <h1 className="mb-1 text-lg font-semibold">Esqueci minha senha</h1>
        <p className="mb-4 text-sm text-[var(--color-muted)]">
          Informe seu e-mail e enviaremos um link para criar uma nova senha.
        </p>
        <form onSubmit={onSubmit}>
          <Field label="E-mail">
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </Field>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Enviando…" : "Enviar link"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-[var(--color-muted)]">
          <Link href="/login" className="font-medium text-[var(--color-primary)]">
            Voltar para entrar
          </Link>
        </p>
      </CardBody>
    </Card>
  );
}
