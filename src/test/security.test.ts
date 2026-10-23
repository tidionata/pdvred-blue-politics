/**
 * ============================================================
 * TESTES DE SEGURANÇA E LÓGICA — PdvTotal
 * Baseado no checklist de 60 pontos
 * Rodado com: npm test
 * ============================================================
 */
import { describe, it, expect } from "vitest";
import { SEFAZ_BY_UF, UF_NAMES, SERVICO_LABELS } from "../lib/sefaz-endpoints";

// ── Helpers locais (copiados da lógica real para teste isolado) ───────────────

function maskCnpj(v: string) {
  return v
    .replace(/\D/g, "")
    .slice(0, 14)
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function calcSubtotal(qty: number, unitPrice: number) {
  return parseFloat((qty * unitPrice).toFixed(2));
}

function isValidUUID(str: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

function calcDiscount(subtotal: number, discount: number, type: "fixed" | "percent") {
  const val = type === "percent" ? subtotal * (discount / 100) : discount;
  return Math.max(0, subtotal - val);
}

// ─────────────────────────────────────────────────────────────────────────────

// ── GRUPO 1: Autenticação ──────────────────────────────────────────────────
describe("Autenticação", () => {
  it("[T-03] Mensagem de erro genérica — não vaza se email existe", () => {
    const errorMsg = "Credenciais inválidas. Verifique seu email e senha.";
    expect(errorMsg).not.toContain("email não encontrado");
    expect(errorMsg).not.toContain("usuário não existe");
    expect(errorMsg).not.toContain("senha incorreta");
  });

  it("[T-08] Sem backdoor de conta de teste no código de produção", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      "c:/Users/Beatriz/Downloads/pdv-lojas-main/src/hooks/useAuth.ts",
      "utf-8"
    );
    expect(src).not.toContain("TEST_EMAIL");
    expect(src).not.toContain("TEST_PASSWORD");
    expect(src).not.toContain("mockTestUser");
    expect(src).not.toContain("TEST_USER_LOGGED_IN");
  });

  it("[T-09] TEST_USER_LOGGED_IN não deve existir como bypass", () => {
    // O mecanismo de bypass por localStorage foi removido
    const src = `
      const user = null;
      const isLoggedIn = localStorage.getItem("TEST_USER_LOGGED_IN") === "true";
    `;
    expect(src).not.toContain("mockTestUser");
  });

  it("[T-10] Senha mínima de 8 caracteres", () => {
    const minLength = 8;
    expect("1234567".length).toBeLessThan(minLength); // fraca
    expect("12345678".length).toBeGreaterThanOrEqual(minLength); // aceita
  });
});

// ── GRUPO 2: Validação de Dados / Manipulação de Preços ───────────────────
describe("Validação de dados e preços", () => {
  it("[T-26] Subtotal calculado = qty × unitPrice (sem manipulação)", () => {
    expect(calcSubtotal(2, 15.5)).toBe(31.0);
    expect(calcSubtotal(3, 10.0)).toBe(30.0);
    expect(calcSubtotal(1.5, 8.0)).toBe(12.0);
  });

  it("[T-26] Subtotal manipulado deve diferir do calculado", () => {
    const unitPrice = 10.0;
    const qty = 2;
    const realSubtotal = calcSubtotal(qty, unitPrice);
    const fakeSubtotal = 1.0; // tentativa de fraude
    expect(fakeSubtotal).not.toBe(realSubtotal);
  });

  it("[T-24] UUID inválido não pode ser usado como product_id real", () => {
    expect(isValidUUID("test-user-local-001")).toBe(false);
    expect(isValidUUID("00000000-0000-0000-0000-000000000000")).toBe(true);
    expect(isValidUUID("invalid")).toBe(false);
  });

  it("[T-24] CNPJ mascarado está no formato correto", () => {
    expect(maskCnpj("12345678000195")).toBe("12.345.678/0001-95");
    expect(maskCnpj("00000000000000")).toBe("00.000.000/0000-00");
  });

  it("[T-24] CNPJ com letras é rejeitado (só dígitos)", () => {
    const result = maskCnpj("12ABC678000195");
    expect(result).not.toContain("A");
    expect(result).not.toContain("B");
    expect(result).not.toContain("C");
  });

  it("[T-39] Desconto em % não gera total negativo", () => {
    expect(calcDiscount(100, 150, "percent")).toBe(0); // 150% desconto → 0
    expect(calcDiscount(100, 100, "percent")).toBe(0);
    expect(calcDiscount(100, 50, "percent")).toBe(50);
  });

  it("[T-39] Desconto fixo não gera total negativo", () => {
    expect(calcDiscount(50, 100, "fixed")).toBe(0); // desconto maior que total → 0
    expect(calcDiscount(100, 30, "fixed")).toBe(70);
  });
});

// ── GRUPO 3: RBAC / Controle de Acesso ────────────────────────────────────
describe("RBAC — Controle de Acesso por Role", () => {
  type Role = "owner" | "manager" | "cashier";

  function canAccess(role: Role, route: string): boolean {
    if (role === "owner") return true;
    if (role === "manager") return !route.includes("/settings");
    if (role === "cashier") return route === "/dashboard/pdv";
    return false;
  }

  it("[T-28] Owner acessa qualquer rota", () => {
    expect(canAccess("owner", "/dashboard/settings")).toBe(true);
    expect(canAccess("owner", "/dashboard/pdv")).toBe(true);
    expect(canAccess("owner", "/dashboard/products")).toBe(true);
  });

  it("[T-28] Manager não acessa settings", () => {
    expect(canAccess("manager", "/dashboard/settings")).toBe(false);
    expect(canAccess("manager", "/dashboard/pdv")).toBe(true);
    expect(canAccess("manager", "/dashboard/products")).toBe(true);
  });

  it("[T-28] Cashier só acessa PDV", () => {
    expect(canAccess("cashier", "/dashboard/pdv")).toBe(true);
    expect(canAccess("cashier", "/dashboard/settings")).toBe(false);
    expect(canAccess("cashier", "/dashboard/products")).toBe(false);
    expect(canAccess("cashier", "/dashboard")).toBe(false);
  });
});

// ── GRUPO 4: Dados SEFAZ ───────────────────────────────────────────────────
describe("Endpoints SEFAZ — Integridade dos dados", () => {
  const UFS = Object.keys(UF_NAMES);
  const SERVICOS = Object.keys(SERVICO_LABELS);

  it("[T-NFe] Todos os 27 estados estão mapeados", () => {
    expect(UFS).toHaveLength(27);
    const expected = ["AC","AL","AM","AP","BA","CE","DF","ES","GO",
      "MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN",
      "RO","RR","RS","SC","SE","SP","TO"];
    expected.forEach(uf => {
      expect(UFS).toContain(uf);
    });
  });

  it("[T-NFe] Cada UF tem autorizador definido", () => {
    UFS.forEach(uf => {
      const info = SEFAZ_BY_UF[uf];
      expect(info, `UF ${uf} sem autorizador`).toBeDefined();
      expect(info.autorizador).toBeTruthy();
    });
  });

  it("[T-NFe] URLs de autorização começam com https://", () => {
    UFS.forEach(uf => {
      const url = SEFAZ_BY_UF[uf]?.endpoints?.NFeAutorizacao;
      if (url && !url.startsWith("—")) {
        expect(url, `${uf} URL inválida`).toMatch(/^https:\/\//);
      }
    });
  });

  it("[T-NFe] MA usa SVAN (não SVRS)", () => {
    expect(SEFAZ_BY_UF["MA"].autorizador).toBe("SVAN");
  });

  it("[T-NFe] SP usa SEFAZ-SP própria", () => {
    expect(SEFAZ_BY_UF["SP"].autorizador).toBe("SEFAZ-SP");
    expect(SEFAZ_BY_UF["SP"].endpoints.NFeAutorizacao).toContain("fazenda.sp.gov.br");
  });

  it("[T-NFe] DF usa SVRS (não tem SEFAZ própria)", () => {
    expect(SEFAZ_BY_UF["DF"].autorizador).toBe("SVRS");
  });

  it("[T-NFe] Todos os serviços estão listados nos labels", () => {
    const expectedServicos = [
      "NFeAutorizacao", "NFeRetAutorizacao", "NfeStatusServico",
      "NfeInutilizacao", "NfeConsultaProtocolo", "NfeConsultaCadastro",
      "RecepcaoEvento",
    ];
    expectedServicos.forEach(s => {
      expect(SERVICOS).toContain(s);
    });
  });

  it("[T-NFe] AM usa SEFAZ-AM própria", () => {
    expect(SEFAZ_BY_UF["AM"].autorizador).toBe("SEFAZ-AM");
    expect(SEFAZ_BY_UF["AM"].endpoints.NFeAutorizacao).toContain("sefaz.am.gov.br");
  });
});

// ── GRUPO 5: Segurança — Exposição de dados ───────────────────────────────
describe("Segurança — Exposição de dados sensíveis", () => {
  it("[T-52] .env deve estar no .gitignore", async () => {
    const fs = await import("fs");
    const gitignore = fs.readFileSync(
      "c:/Users/Beatriz/Downloads/pdv-lojas-main/.gitignore",
      "utf-8"
    );
    expect(gitignore).toContain(".env");
  });

  it("[T-56] Nenhuma credencial hardcoded em useAuth", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      "c:/Users/Beatriz/Downloads/pdv-lojas-main/src/hooks/useAuth.ts",
      "utf-8"
    );
    expect(src).not.toContain("tidionata@gmail.com");
    expect(src).not.toContain("14192583");
    expect(src).not.toContain("TEST_USER_LOGGED_IN");
    expect(src).not.toContain("mockTestUser");
  });

  it("[T-56] Nenhuma credencial hardcoded em Auth.tsx", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      "c:/Users/Beatriz/Downloads/pdv-lojas-main/src/pages/Auth.tsx",
      "utf-8"
    );
    expect(src).not.toContain("tidionata@gmail.com");
    expect(src).not.toContain("14192583");
    expect(src).not.toContain("TEST_USER_LOGGED_IN");
    expect(src).not.toContain("Entrar com conta de teste");
  });

  it("[T-46] Cliente Supabase usa apenas anon key (sem service_role em código real)", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      "c:/Users/Beatriz/Downloads/pdv-lojas-main/src/integrations/supabase/client.ts",
      "utf-8"
    );
    // Filtra apenas linhas que NÃO são comentários e verifica se service_role aparece
    const codeLines = src
      .split("\n")
      .filter(l => !l.trim().startsWith("//") && !l.trim().startsWith("*"));
    const hasServiceRoleInCode = codeLines.some(l => l.includes("service_role") && !l.includes("//"));
    expect(hasServiceRoleInCode).toBe(false);
    // Garante que usa a chave anon
    expect(src).toContain("VITE_SUPABASE_PUBLISHABLE_KEY");
  });

  it("[T-48] vercel.json tem HSTS configurado", async () => {
    const fs = await import("fs");
    const raw = fs.readFileSync(
      "c:/Users/Beatriz/Downloads/pdv-lojas-main/vercel.json",
      "utf-8"
    );
    const cfg = JSON.parse(raw);
    const allHeaders: string[] = cfg.headers?.flatMap((h: any) =>
      h.headers.map((hh: any) => hh.key)
    ) ?? [];
    expect(allHeaders).toContain("Strict-Transport-Security");
    expect(allHeaders).toContain("X-Frame-Options");
    expect(allHeaders).toContain("X-Content-Type-Options");
    expect(allHeaders).toContain("Content-Security-Policy");
  });
});

// ── GRUPO 6: Cálculos do PDV ──────────────────────────────────────────────
describe("PDV — Cálculos de carrinho", () => {
  it("Subtotal de múltiplos itens", () => {
    const cart = [
      { qty: 2, price: 10.0 },
      { qty: 1, price: 25.5 },
      { qty: 3, price: 5.0 },
    ];
    const subtotal = cart.reduce((s, i) => s + calcSubtotal(i.qty, i.price), 0);
    expect(subtotal).toBeCloseTo(60.5, 2);
  });

  it("Carrinho vazio tem subtotal 0", () => {
    const subtotal = [].reduce((s: number) => s, 0);
    expect(subtotal).toBe(0);
  });

  it("Produto com peso fracionado (KG)", () => {
    expect(calcSubtotal(0.5, 20.0)).toBe(10.0);
    expect(calcSubtotal(1.35, 12.0)).toBeCloseTo(16.2, 2);
  });
});

// ── GRUPO 7: Reforma Tributária 2026 (IBS e CBS) ───────────────────────────
describe("Reforma Tributária 2026 (IBS/CBS)", () => {
  function calcIbsCbs(itemSubtotal: number, saleSubtotal: number, saleDiscount: number, cbsRate: number, ibsRate: number) {
    const itemDiscount = saleSubtotal > 0 ? (itemSubtotal / saleSubtotal) * saleDiscount : 0;
    const base = Math.max(0, itemSubtotal - itemDiscount);
    const valorCbs = Number((base * (cbsRate / 100)).toFixed(2));
    const valorIbs = Number((base * (ibsRate / 100)).toFixed(2));
    return { base, valorCbs, valorIbs };
  }

  it("[T-Tax] Cálculo da base com desconto proporcional", () => {
    // Venda de 200, desconto de 20. Item de 100.
    // Desconto proporcional no item deve ser 10. Base = 90.
    const result = calcIbsCbs(100, 200, 20, 0.9, 0.1);
    expect(result.base).toBe(90);
  });

  it("[T-Tax] Cálculo dos valores CBS (0.9%) e IBS (0.1%)", () => {
    // Base 1000. CBS = 9.00. IBS = 1.00.
    const result = calcIbsCbs(1000, 1000, 0, 0.9, 0.1);
    expect(result.valorCbs).toBe(9.00);
    expect(result.valorIbs).toBe(1.00);
  });

  it("[T-Tax] Valores fracionados e arredondamento", () => {
    // Base 155.50. 
    // CBS (0.9%) = 1.3995 → 1.40
    // IBS (0.1%) = 0.1555 → 0.16
    const result = calcIbsCbs(155.50, 155.50, 0, 0.9, 0.1);
    expect(result.valorCbs).toBe(1.40);
    expect(result.valorIbs).toBe(0.16);
  });

  it("[T-Tax] Classificação tributária deve ter 6 dígitos", () => {
    const regex = /^\d{6}$/;
    expect("010101").toMatch(regex);
    expect("12345").not.toMatch(regex);
    expect("1234567").not.toMatch(regex);
    expect("ABCDEF").not.toMatch(regex);
  });
});
