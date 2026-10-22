import type { Metadata } from "next";
import Link from "next/link";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Política de privacidade — Dádiva Go",
  description:
    "Que dados a conta de cliente da Gráfica Dádiva guarda e como pedir a eliminação da conta.",
  robots: { index: true, follow: true },
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-svh bg-zinc-100 text-zinc-900 dark:bg-[#0a0a0a] dark:text-zinc-100">
      <header className="border-b border-zinc-200/90 bg-white pt-[env(safe-area-inset-top)] dark:border-white/[0.06] dark:bg-black">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href={ROUTES.clientLogin} className="text-base font-bold tracking-tight">
            Dádiva <span className="text-amber-500">Go</span>
          </Link>
          <Link
            href={ROUTES.clientLogin}
            className="text-sm font-medium text-amber-800 underline-offset-2 hover:underline dark:text-amber-300"
          >
            Entrar
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-12">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
          Gráfica Dádiva
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Política de privacidade</h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          Vigora desde 22 de outubro de 2026. Aplica-se à conta de cliente em{" "}
          <a className="underline underline-offset-2" href="https://graficadadiva.com">
            graficadadiva.com
          </a>{" "}
          e à app Android Dádiva Go.
        </p>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          <section>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Quem é responsável</h2>
            <p className="mt-2">
              A Gráfica Dádiva trata os dados da conta de cliente para preparar, acompanhar e entregar
              os pedidos. A app serve só o cliente. Balcão, caixa, produção e administração ficam no
              site da equipa.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Dados que guardamos</h2>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              <li>Conta: nome, e-mail, telefone e palavra-passe. A palavra-passe fica protegida e não é mostrada.</li>
              <li>Pedidos: artigos, quantidades, notas, estado e histórico.</li>
              <li>Fotos e ficheiros que envias para a modelagem.</li>
              <li>Mensagens trocadas com a equipa dentro do pedido.</li>
              <li>
                Na app Android, um identificador do telemóvel para avisar quando o estado muda, quando
                a equipa escreve ou quando a peça está pronta.
              </li>
              <li>
                Cookies de sessão neste telemóvel ou computador, para manter a entrada. No Android, a
                sessão pode continuar depois de fechares a app.
              </li>
            </ul>
            <p className="mt-3">
              Sem rede, um rascunho e as fotos ficam só no telemóvel até serem enviados. A primeira
              entrada precisa de ligação.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Para que servem</h2>
            <p className="mt-2">
              Usamos estes dados para criar a conta, receber e produzir o pedido, mostrar o estado,
              falar sobre o desenho e enviar avisos. Os avisos podem chegar pela app, por SMS ou por
              e-mail. O SMS usa o número de telefone da conta e um operador de mensagens. O aviso no
              telemóvel Android passa pelo serviço de notificações da Google.
            </p>
            <p className="mt-3">
              Não vendemos dados e não mostramos anúncios. Não pedimos dados de pagamento dentro da
              app. O pagamento trata-se na loja.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Quanto tempo ficam</h2>
            <p className="mt-2">
              A conta e os pedidos ficam enquanto a relação com a loja existir. Documentos e pedidos
              já emitidos podem ter de ser conservados pelo tempo exigido à actividade da gráfica.
              O identificador de avisos é apagado quando terminas a sessão na app ou quando deixa de
              ser válido.
            </p>
          </section>

          <section id="eliminar-conta">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Eliminar a conta</h2>
            <p className="mt-2">
              Podes pedir a eliminação da conta e dos dados associados. Envia uma mensagem a partir de
              um pedido na app, ou contacta a Gráfica Dádiva pelos contactos que constam nos avisos e
              documentos da loja, com o assunto «Eliminação de conta» e o e-mail da conta.
            </p>
            <p className="mt-3">
              A loja confirma o pedido e remove os dados da conta que não tenham de ficar guardados
              por causa de pedidos e documentos já emitidos. Enquanto esse pedido não for tratado, a
              conta continua activa.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Os teus pedidos</h2>
            <p className="mt-2">
              Podes consultar e corrigir os dados da conta ao entrar em Dádiva Go. Para acesso,
              correcção ou eliminação que não consigas fazer na app, usa o mesmo contacto da secção
              anterior.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
