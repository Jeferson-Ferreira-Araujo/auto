"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { passwordError } from "@/lib/auth/password";
import { PasswordChecklist } from "@/components/PasswordChecklist";
import { Button } from "@/components/ui/button";
import { Card, CardBody, Field, Input } from "@/components/ui/primitives";

type Status = "checking" | "ready" | "invalid";

/**
 * O link do e-mail de redefinição chega de um destes jeitos (depende da configuração do
 * projeto no Supabase), e este componente cobre os três:
 *  1. `#access_token=...&type=recovery` no FRAGMENTO da URL — o SDK do navegador
 *     (`detectSessionInUrl`, ligado por padrão) já cria a sessão sozinho antes de rodar
 *     nosso código; só precisamos chamar `getSession()`.
 *  2. `?code=...` — trocamos por sessão com `exchangeCodeForSession`.
 *  3. `?token_hash=...&type=recovery` — trocamos com `verifyOtp`.
 * Se o Supabase mandou de volta um erro (link expirado/já usado), vem como
 * `?error=...&error_description=...` — mostramos direto sem tentar nada.
 */
export default function NewPasswordPage() {
  return (
    <Suspense fallback={<CheckingCard />}>
      <NewPasswordForm />
    </Suspense>
  );
}

function CheckingCard() {
  return (
    <Card>
      <CardBody>
        <p className="text-sm text-[var(--color-muted)]">Verificando o link…</p>
      </CardBody>
    </Card>
  );
}

function NewPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    async function resolveSession() {
      const errorDescription = searchParams.get("error_description");
      if (errorDescription) {
        setStatus("invalid");
        return;
      }

      const code = searchParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        setStatus(error ? "invalid" : "ready");
        return;
      }

      const tokenHash = searchParams.get("token_hash");
      const type = searchParams.get("type");
      if (tokenHash && type === "recovery") {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
        setStatus(error ? "invalid" : "ready");
        return;
      }

      // Nenhum parâmetro na URL — ou o SDK já processou o fragmento (#access_token=...)
      // sozinho, ou não tem sessão mesmo.
      const { data } = await supabase.auth.getSession();
      setStatus(data.session ? "ready" : "invalid");
    }

    resolveSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const pwErr = passwordError(password);
    if (pwErr) return setError(pwErr);
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
          <h1 className="mb-2 text-2xl font-bold tracking-tight text-[var(--color-heading)]">Link inválido ou expirado</h1>
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
          <h1 className="mb-2 text-2xl font-bold tracking-tight text-[var(--color-heading)]">Senha alterada ✅</h1>
          <p className="text-sm text-[var(--color-muted)]">Entrando…</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody>
        <h1 className="mb-4 text-2xl font-bold tracking-tight text-[var(--color-heading)]">Criar nova senha</h1>
        <form onSubmit={onSubmit}>
          <Field label="Nova senha">
            <Input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </Field>
          <PasswordChecklist password={password} />
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
          <Button type="submit" className="w-full" disabled={loading || !!passwordError(password) || password !== confirm}>
            {loading ? "Salvando…" : "Salvar nova senha"}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
