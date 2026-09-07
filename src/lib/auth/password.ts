/** Regras de senha — usadas no cadastro e na redefinição. Refletem a política
 *  recomendada no Supabase (mín. 8, minúscula, maiúscula e dígito). */

export type PasswordRule = { key: string; label: string; test: (pw: string) => boolean };

export const PASSWORD_RULES: PasswordRule[] = [
  { key: "len", label: "Pelo menos 8 caracteres", test: (p) => p.length >= 8 },
  { key: "lower", label: "Uma letra minúscula", test: (p) => /[a-z]/.test(p) },
  { key: "upper", label: "Uma letra maiúscula", test: (p) => /[A-Z]/.test(p) },
  { key: "digit", label: "Um número", test: (p) => /\d/.test(p) },
];

const WEAK = new Set([
  "12345678",
  "123456789",
  "senha123",
  "password",
  "password1",
  "qwerty123",
  "aaaaaaaa",
  "abcdefgh",
]);

export type PasswordCheck = { ok: boolean; failed: string[]; weak: boolean };

export function checkPassword(pw: string): PasswordCheck {
  const failed = PASSWORD_RULES.filter((r) => !r.test(pw)).map((r) => r.key);
  const weak = WEAK.has(pw.toLowerCase());
  return { ok: failed.length === 0 && !weak, failed, weak };
}

/** Mensagem única para quando não quisermos mostrar a lista de regras. */
export function passwordError(pw: string): string | null {
  const c = checkPassword(pw);
  if (c.weak) return "Essa senha é muito comum. Escolha outra.";
  if (!c.ok) return "A senha precisa ter 8+ caracteres, com maiúscula, minúscula e número.";
  return null;
}
