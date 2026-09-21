"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { passwordError } from "@/lib/auth/password";
import { PasswordChecklist } from "@/components/PasswordChecklist";
import { Button } from "@/components/ui/button";
import { Card, CardBody, Field, Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

export function ChangePasswordCard({ userEmail }: { userEmail: string }) {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setCurrent("");
    setNext("");
    setConfirm("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!current) return setError("Informe sua senha atual.");
    const pwErr = passwordError(next);
    if (pwErr) return setError(pwErr);
    if (next !== confirm) return setError("As senhas novas não coincidem.");
    if (next === current) return setError("A nova senha precisa ser diferente da atual.");

    setLoading(true);
    const supabase = createSupabaseBrowserClient();

    // Confirma a senha atual antes de trocar — evita que alguém com a sessão aberta
    // (ex.: computador compartilhado) troque a senha sem saber a atual.
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password: current,
    });
    if (signInError) {
      setLoading(false);
      setError("Senha atual incorreta.");
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: next });
    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    toast.push("Senha alterada", "success");
    reset();
  }

  return (
    <Card>
      <CardBody>
        <h3 className="mb-1 font-medium">Senha</h3>
        <p className="mb-3 text-sm text-[var(--color-muted)]">Altere sua senha de acesso à AUTORA.</p>
        <form onSubmit={onSubmit} className="max-w-sm space-y-0">
          <Field label="Senha atual">
            <Input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
            />
          </Field>
          <Field label="Nova senha">
            <Input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
            />
          </Field>
          <PasswordChecklist password={next} />
          <Field label="Confirme a nova senha">
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </Field>
          {error && <p className="mb-3 text-sm text-[var(--color-danger)]">{error}</p>}
          <Button type="submit" disabled={loading || !current || !next || !confirm}>
            {loading ? "Salvando…" : "Salvar nova senha"}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
