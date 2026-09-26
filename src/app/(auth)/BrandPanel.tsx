const BULLETS = [
  "Publica sozinho no Instagram, no horário certo",
  "Avisa antes de um produto vencer",
  "Atende e agenda pelo WhatsApp",
];

/**
 * Painel de marca do login/cadastro. Vira uma faixa compacta no mobile e um painel lateral
 * escuro no desktop — a malha de gradiente (`.auth-mesh`, globals.css) ecoa as cores do símbolo
 * da AUTORA sem competir com o formulário, que é o que a pessoa veio fazer aqui.
 */
export function AuthBrandPanel() {
  return (
    <div className="relative isolate flex shrink-0 items-center overflow-hidden bg-[#0a1128] px-6 py-7 sm:px-10 lg:w-[42%] lg:px-16 lg:py-0">
      <div className="auth-mesh" aria-hidden />
      <div className="relative z-10 mx-auto flex w-full max-w-sm flex-col gap-6 lg:mx-0 lg:max-w-none">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/autora-mark.png" alt="" width={36} height={36} className="shrink-0" />
          <span className="text-xl font-extrabold tracking-tight text-white">AUTORA</span>
        </div>

        <div className="hidden lg:block">
          <h2 className="max-w-xs text-[2.5rem] font-extrabold leading-[1.08] tracking-tight text-white">
            Seu negócio
            <br />
            no automático.
          </h2>
          <ul className="mt-9 space-y-3.5 text-sm text-white/70">
            {BULLETS.map((b) => (
              <li key={b} className="flex items-start gap-2.5">
                <span className="bg-gradient-brand mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" />
                {b}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-sm text-white/70 lg:hidden">Seu negócio no automático.</p>
      </div>
    </div>
  );
}
