"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardBody, Field, Input } from "@/components/ui/primitives";

type Status = "checking" | "ready" | "invalid";

export default function NewPasswordPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data }) => {
      setStatus(data.session ? "ready" : "invalid");
    });
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) return setError("A senha precisa ter pelo menos 6 caracteres.");
    if (password !== confirm) return setError("As senhas não coincidem.");
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
    setTimeout(() => {
      router.push("/dashboard");
      router.refresh();
    }, 1200);
  }

  if (status === "checking") {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-[var(--color-muted)]">Verificando o link…</p>
        </CardBody>
      </Card>
    );
  }

  if (status === "invalid") {
    return (
      <Card>
        <CardBody>
          <h1 className="mb-2 text-lg font-semibold">Link inválido ou expirado</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Peça um novo link de redefinição de senha.
          </p>
          <p className="mt-4 text-center text-sm">
            <Link href="/recuperar-senha" className="font-medium text-[var(--color-primary)]">
              Enviar novo link
            </Link>
          </p>
        </CardBody>
      </Card>
    );
  }

  if (done) {
    return (
      <Card>
        <CardBody>
          <h1 className="mb-2 text-lg font-semibold">Senha alterada ✅</h1>
          <p className="text-sm text-[var(--color-muted)]">Entrando…</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody>
        <h1 className="mb-4 text-lg font-semibold">Criar nova senha</h1>
        <form onSubmit={onSubmit}>
          <Field label="Nova senha" hint="Mínimo de 6 caracteres">
            <Input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Confirme a nova senha">
            <Input
              type="password"
              required
              minLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </Field>
          {error && <p className="mb-3 text-sm text-[var(--color-danger)]">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Salvando…" : "Salvar nova senha"}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
