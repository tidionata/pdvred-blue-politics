import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { 
  BarChart3, ShieldCheck, Smartphone, Bell, Package, 
  TrendingUp, Zap, CheckCircle2, ArrowRight, Star
} from "lucide-react";
import { Button } from "@/components/ui/button";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as const }
  }),
};

const plans = [
  {
    name: "Premium",
    price: "Sob consulta",
    features: [
      "Produtos ilimitados",
      "Usuários ilimitados",
      "PDV + Catálogo online",
      "Gestão de Mesas e Balcões",
      "Controle de fiados e fluxo de caixa",
      "Suporte prioritário via WhatsApp"
    ],
    popular: true,
  }
];

const pains = [
  { icon: Package, text: "Produto acaba e você não percebe?" },
  { icon: TrendingUp, text: "Não sabe quanto lucrou no dia?" },
  { icon: BarChart3, text: "Faz controle no caderno ou planilha?" },
];

const solutions = [
  { icon: Zap, title: "Estoque em tempo real", desc: "Saiba exatamente o que tem no expositor e no depósito." },
  { icon: Smartphone, title: "Venda pelo celular", desc: "PDV completo na palma da mão. Rápido e intuitivo." },
  { icon: Bell, title: "Alerta de reposição", desc: "Receba avisos quando o estoque do expositor está baixo." },
  { icon: BarChart3, title: "Relatórios inteligentes", desc: "Faturamento, lucro, ticket médio e mais." },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="container mx-auto flex items-center justify-between h-16 px-4">
          <span className="text-xl font-bold font-['Space_Grotesk'] text-primary">PdvTotal</span>
          <div className="flex gap-3">
            <Button variant="ghost" asChild><Link to="/auth">Entrar</Link></Button>
            <Button asChild><Link to="/auth?tab=signup">Cadastrar agora</Link></Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-4">
        <div className="container mx-auto text-center max-w-4xl">
          <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={0}>
            <span className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
              ✨ Controle total do seu expositor
            </span>
          </motion.div>
          <motion.h1 
            className="text-4xl md:text-6xl font-extrabold tracking-tight leading-tight mb-6"
            variants={fadeUp} custom={1} initial="hidden" animate="visible"
          >
            Controle total do seu{" "}
            <span className="text-primary">expositor</span>.
            <br />Venda rápido. Reponha certo. Lucre mais.
          </motion.h1>
          <motion.p 
            className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10"
            variants={fadeUp} custom={2} initial="hidden" animate="visible"
          >
            O único PDV feito especificamente para quem trabalha com expositor de loja. 
            Simples, rápido e poderoso.
          </motion.p>
          <motion.div className="flex flex-col sm:flex-row gap-4 justify-center" variants={fadeUp} custom={3} initial="hidden" animate="visible">
            <Button size="lg" className="text-base px-8 h-12" asChild>
              <Link to="/auth?tab=signup">Começar agora <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
            <Button size="lg" variant="outline" className="text-base px-8 h-12">
              Ver demonstração
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Pain Section */}
      <section className="py-20 bg-muted/50 px-4">
        <div className="container mx-auto max-w-4xl">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
            Você se identifica? 😰
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {pains.map((p, i) => (
              <motion.div
                key={i}
                className="bg-card rounded-xl p-6 border border-border shadow-sm text-center"
                variants={fadeUp} custom={i} initial="hidden" whileInView="visible" viewport={{ once: true }}
              >
                <p.icon className="h-10 w-10 text-destructive mx-auto mb-4" />
                <p className="text-lg font-semibold">{p.text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Solution Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-5xl">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
            A solução que faltava 🚀
          </h2>
          <p className="text-muted-foreground text-center mb-12 max-w-2xl mx-auto">
            Tudo o que você precisa para controlar seu expositor de forma profissional.
          </p>
          <div className="grid md:grid-cols-2 gap-8">
            {solutions.map((s, i) => (
              <motion.div
                key={i}
                className="flex gap-4 p-6 rounded-xl bg-card border border-border shadow-sm"
                variants={fadeUp} custom={i} initial="hidden" whileInView="visible" viewport={{ once: true }}
              >
                <div className="flex-shrink-0 h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <s.icon className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-lg mb-1">{s.title}</h3>
                  <p className="text-muted-foreground">{s.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 bg-muted/50 px-4" id="planos">
        <div className="container mx-auto max-w-5xl">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
            Planos simples e transparentes 💰
          </h2>
          <p className="text-muted-foreground text-center mb-12">Tudo que você precisa em uma única assinatura.</p>
          <div className="flex justify-center">
            <div className="w-full max-w-md">
              {plans.map((plan, i) => (
              <motion.div
                key={i}
                className={`relative rounded-2xl p-8 border bg-card shadow-sm ${
                  plan.popular ? "border-primary ring-2 ring-primary/20" : "border-border"
                }`}
                variants={fadeUp} custom={i} initial="hidden" whileInView="visible" viewport={{ once: true }}
              >
                {plan.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                    <Star className="h-3 w-3" /> Mais popular
                  </span>
                )}
                <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
                <div className="mb-6">
                  {plan.price === "Sob consulta" ? (
                    <span className="text-3xl font-extrabold">{plan.price}</span>
                  ) : (
                    <>
                      <span className="text-4xl font-extrabold">R${plan.price}</span>
                      <span className="text-muted-foreground">/mês</span>
                    </>
                  )}
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button className="w-full" variant={plan.popular ? "default" : "outline"} asChild>
                  <a href="https://wa.me/5569992922621?text=Olá,%20gostaria%20de%20saber%20mais%20sobre%20o%20plano%20Premium" target="_blank" rel="noopener noreferrer">Falar no WhatsApp</a>
                </Button>
              </motion.div>
            ))}
            </div>
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="py-20 px-4">
        <div className="container mx-auto text-center max-w-3xl">
          <ShieldCheck className="h-16 w-16 text-primary mx-auto mb-6" />
          <h2 className="text-3xl md:text-4xl font-bold mb-4">7 dias grátis</h2>
          <p className="text-lg text-muted-foreground mb-8">
            Experimente todos os recursos sem compromisso. Sem cartão de crédito. Se não gostar, é só não assinar.
          </p>
          <Button size="lg" className="text-base px-8 h-12" asChild>
            <Link to="/auth?tab=signup">
              Criar conta grátis <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 px-4">
        <div className="container mx-auto text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} PdvTotal. Todos os direitos reservados.
        </div>
      </footer>
    </div>
  );
}
