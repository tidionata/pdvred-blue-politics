import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck, UserCheck, Lock, ArrowLeft, KeyRound, Store } from "lucide-react";

export default function Auth() {
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get("tab") === "signup" ? "signup" : "login";
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Login state
  const [loginEmail, setLoginEmail]       = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Role Selection State (Após autenticar na conta da loja)
  const [isLoggedInSession, setIsLoggedInSession] = useState(false);
  const [selectedRole, setSelectedRole] = useState<"dono" | "funcionario" | null>(null);
  const [adminPinInput, setAdminPinInput] = useState("");
  const [isCreatingPin, setIsCreatingPin] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  // Signup state
  const [signupName, setSignupName]           = useState("");
  const [signupStoreName, setSignupStoreName] = useState("");
  const [signupEmail, setSignupEmail]         = useState("");
  const [signupPassword, setSignupPassword]   = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setIsLoggedInSession(true);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setIsLoggedInSession(true);
      } else {
        setIsLoggedInSession(false);
        setSelectedRole(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    });

    if (error) {
      toast({
        title: "Erro ao entrar",
        description: "Credenciais inválidas. Verifique seu email e senha.",
        variant: "destructive",
      });
    } else {
      setIsLoggedInSession(true);
    }

    setLoading(false);
  };

  const handleSelectFuncionario = () => {
    // Funcionário: Modo restrito (bloqueia abas de dono)
    sessionStorage.setItem("pdv_user_role", "funcionario");
    sessionStorage.removeItem("pdv_admin_unlocked");
    toast({
      title: "Modo Funcionário Ativado",
      description: "Acesso restrito ao PDV, Pedidos e Clientes.",
    });
    navigate("/dashboard/pdv");
  };

  const handleSelectDono = () => {
    const savedPin = localStorage.getItem("pdv_admin_password");
    if (!savedPin) {
      // Se não houver PIN criado, usa '1234' por padrão ou permite criar
      setIsCreatingPin(false);
    }
    setSelectedRole("dono");
  };

  const handleConfirmDonoPin = (e: React.FormEvent) => {
    e.preventDefault();
    const savedPin = localStorage.getItem("pdv_admin_password") || "1234";

    if (isCreatingPin) {
      if (!newPin || newPin.length < 4) {
        toast({ title: "Senha curta", description: "Crie uma senha de pelo menos 4 dígitos.", variant: "destructive" });
        return;
      }
      if (newPin !== confirmPin) {
        toast({ title: "Senhas não coincidem", description: "Verifique a confirmação da senha.", variant: "destructive" });
        return;
      }
      localStorage.setItem("pdv_admin_password", newPin);
      sessionStorage.setItem("pdv_user_role", "dono");
      sessionStorage.setItem("pdv_admin_unlocked", "true");
      toast({ title: "Senha do Administrador Salva!", description: "Acesso total liberado ao sistema." });
      navigate("/dashboard");
      return;
    }

    if (adminPinInput === savedPin || adminPinInput === "1234") {
      if (!localStorage.getItem("pdv_admin_password")) {
        localStorage.setItem("pdv_admin_password", "1234");
      }
      sessionStorage.setItem("pdv_user_role", "dono");
      sessionStorage.setItem("pdv_admin_unlocked", "true");
      toast({ title: "Bem-vindo, Administrador!", description: "Acesso total liberado." });
      navigate("/dashboard");
    } else {
      toast({ 
        title: "Senha Incorreta", 
        description: "A senha de administrador padrão é 1234 ou a que você configurou.", 
        variant: "destructive" 
      });
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email: signupEmail,
      password: signupPassword,
      options: {
        data: {
          full_name: signupName,
          store_name: signupStoreName || "Minha Loja",
        },
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      toast({ title: "Erro ao cadastrar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Conta criada!", description: "Verifique seu email para confirmar." });
    }

    setLoading(false);
  };

  // ── SE JÁ ESTÁ AUTENTICADO: Tela de Seleção de Perfil (Dono vs Funcionário) ──
  if (isLoggedInSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md shadow-2xl border">
          <CardHeader className="text-center pb-3">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-2">
              <Store className="h-6 w-6" />
            </div>
            <CardTitle className="text-2xl font-bold font-['Space_Grotesk'] text-primary">
              Quem está acessando?
            </CardTitle>
            <CardDescription>
              Selecione seu perfil para entrar no sistema
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-2">
            {!selectedRole ? (
              <div className="grid grid-cols-1 gap-3">
                {/* Opção 1: Dono */}
                <button
                  type="button"
                  onClick={handleSelectDono}
                  className="p-4 rounded-2xl border-2 border-primary/20 hover:border-primary hover:bg-primary/5 transition-all text-left flex items-center justify-between group shadow-sm"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <ShieldCheck className="h-6 w-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-base text-foreground group-hover:text-primary">
                        Dono / Administrador
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        Acesso total a relatórios, faturamento, configurações e estoque.
                      </p>
                    </div>
                  </div>
                  <Lock className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0 ml-2" />
                </button>

                {/* Opção 2: Funcionário */}
                <button
                  type="button"
                  onClick={handleSelectFuncionario}
                  className="p-4 rounded-2xl border-2 border-blue-500/20 hover:border-blue-500 hover:bg-blue-50/50 transition-all text-left flex items-center justify-between group shadow-sm"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <UserCheck className="h-6 w-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-base text-foreground group-hover:text-blue-600">
                        Funcionário / Operador
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        Acesso direto ao PDV (Caixa), Pedidos e Cadastro de Clientes.
                      </p>
                    </div>
                  </div>
                </button>

                <div className="pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs text-muted-foreground hover:text-red-600"
                    onClick={() => supabase.auth.signOut()}
                  >
                    Trocar de conta / Sair
                  </Button>
                </div>
              </div>
            ) : (
              /* Formulário de Senha para o Dono */
              <form onSubmit={handleConfirmDonoPin} className="space-y-4 animate-in fade-in zoom-in-95 duration-150">
                <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-xs text-amber-900 flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>
                    {isCreatingPin 
                      ? "Crie uma senha de acesso master para proteger suas informações financeiras." 
                      : "Digite sua senha de administrador para liberar o acesso total."}
                  </span>
                </div>

                {isCreatingPin ? (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="new-pin">Criar Senha Master</Label>
                      <Input
                        id="new-pin"
                        type="password"
                        placeholder="Mínimo 4 dígitos"
                        value={newPin}
                        onChange={(e) => setNewPin(e.target.value)}
                        autoFocus
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="confirm-pin">Confirmar Senha</Label>
                      <Input
                        id="confirm-pin"
                        type="password"
                        placeholder="Repita a senha"
                        value={confirmPin}
                        onChange={(e) => setConfirmPin(e.target.value)}
                        required
                      />
                    </div>
                  </>
                ) : (
                  <div className="space-y-1.5">
                    <Label htmlFor="admin-pin">Senha de Administrador</Label>
                    <Input
                      id="admin-pin"
                      type="password"
                      placeholder="Digite sua senha de Dono"
                      value={adminPinInput}
                      onChange={(e) => setAdminPinInput(e.target.value)}
                      autoFocus
                      required
                    />
                  </div>
                )}

                {!isCreatingPin && (
                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                    <span>Padrão: <strong className="text-foreground">1234</strong></span>
                    <button
                      type="button"
                      onClick={() => setIsCreatingPin(true)}
                      className="text-primary hover:underline font-medium"
                    >
                      Trocar / Criar Nova Senha
                    </button>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 gap-1.5"
                    onClick={() => {
                      setSelectedRole(null);
                      setIsCreatingPin(false);
                    }}
                  >
                    <ArrowLeft className="h-4 w-4" /> Voltar
                  </Button>
                  <Button type="submit" className="flex-1 font-semibold">
                    {isCreatingPin ? "Salvar & Entrar" : "Entrar como Dono"}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── SE NÃO ESTÁ AUTENTICADO: Login / Cadastro normal ──
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold font-['Space_Grotesk'] text-primary">
            PDVTOTAL
          </CardTitle>
          <CardDescription>
            Sistema completo de ponto de venda
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={defaultTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Cadastrar</TabsTrigger>
            </TabsList>

            {/* ── Login ────────────────────────────────────────────────── */}
            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="seu@email.com"
                    value={loginEmail}
                    onChange={e => setLoginEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Senha</Label>
                  <Input
                    id="login-password"
                    type="password"
                    value={loginPassword}
                    onChange={e => setLoginPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
                </Button>
              </form>
            </TabsContent>

            {/* ── Cadastro ─────────────────────────────────────────────── */}
            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Seu nome</Label>
                  <Input
                    id="signup-name"
                    value={signupName}
                    onChange={e => setSignupName(e.target.value)}
                    autoComplete="name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-store">Nome da loja</Label>
                  <Input
                    id="signup-store"
                    value={signupStoreName}
                    onChange={e => setSignupStoreName(e.target.value)}
                    placeholder="Minha Loja"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    value={signupEmail}
                    onChange={e => setSignupEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Senha</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    value={signupPassword}
                    onChange={e => setSignupPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                    minLength={8}
                  />
                  <p className="text-xs text-muted-foreground">Mínimo 8 caracteres</p>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar conta"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
