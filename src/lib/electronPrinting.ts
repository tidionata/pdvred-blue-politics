// Detecta se o app está rodando dentro do Electron
export function isElectron(): boolean {
  return typeof window !== 'undefined' && !!(window as any).electronAPI;
}

// Lista as impressoras instaladas no Windows
export async function getPrinters(): Promise<{ name: string; displayName: string; isDefault: boolean }[]> {
  if (!isElectron()) return [];
  try {
    return await (window as any).electronAPI.getPrinters();
  } catch {
    return [];
  }
}

// Alterna entre tela cheia e janela no Electron
export async function toggleFullscreen(): Promise<boolean> {
  if (!isElectron()) return false;
  try {
    return await (window as any).electronAPI.toggleFullscreen();
  } catch {
    return false;
  }
}

// Lê a impressora configurada do localStorage
export function getKitchenPrinter(): string {
  return localStorage.getItem('pdv_printer_cozinha') || '';
}

export function getCashierPrinter(): string {
  return localStorage.getItem('pdv_printer_caixa') || '';
}

// Imprime HTML silenciosamente em uma impressora específica
export async function printSilent(htmlContent: string, printerName: string): Promise<boolean> {
  if (!isElectron()) return false;
  try {
    const success = await (window as any).electronAPI.printHtml({
      html: htmlContent,
      printer: printerName || undefined,
      silent: true
    });
    return !!success;
  } catch (err) {
    console.error('Print error:', err);
    return false;
  }
}

// Imprime na impressora de cozinha (comandas/pedidos)
export async function printToKitchen(htmlContent: string): Promise<boolean> {
  const printer = getKitchenPrinter();
  if (!printer) return false;
  return printSilent(htmlContent, printer);
}

// Imprime na impressora de caixa (cupom fiscal/recibo)
export async function printToCashier(htmlContent: string): Promise<boolean> {
  const printer = getCashierPrinter();
  if (!printer) return false;
  return printSilent(htmlContent, printer);
}

// Gera HTML de comanda para cozinha
export function buildKitchenReceiptHtml(
  order: { id: string; customer_name?: string; notes?: string; created_at?: string; delivery_type?: string; delivery_address?: string },
  items: { quantity: number; product_name: string; additionals?: { name: string }[] }[],
  storeName: string
): string {
  const shortId = order.id?.substring(0, 6).toUpperCase() || '??????';
  const time = order.created_at
    ? new Date(order.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : '--:--';

  const itemsHtml = items.map(item => `
    <div style="margin-bottom:6px;border-bottom:1px dashed #000;padding-bottom:4px;">
      <div style="font-size:14px;font-weight:bold;">${item.quantity}x ${item.product_name}</div>
      ${item.additionals?.length ? `<div style="font-size:11px;color:#333;">+ ${item.additionals.map(a => a.name).join(', ')}</div>` : ''}
    </div>
  `).join('');

  return `
    <html><head><style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family:'Courier New',monospace; font-size:12px; padding:10px; width:80mm; }
      .center { text-align:center; }
      .bold { font-weight:bold; }
      .sep { border-top:2px dashed #000; margin:8px 0; }
    </style></head>
    <body>
      <div class="center bold" style="font-size:16px;">🍳 COZINHA</div>
      <div class="center" style="font-size:18px;font-weight:bold;margin:4px 0;">PEDIDO #${shortId}</div>
      <div class="center" style="font-size:11px;">${storeName} — ${time}</div>
      <div class="sep"></div>
      ${order.customer_name ? `<div class="bold">👤 ${order.customer_name}</div>` : ''}
      ${order.delivery_type === 'entrega' ? `<div class="bold" style="color:#000;">🛵 ENTREGA: ${order.delivery_address || ''}</div>` : ''}
      ${order.delivery_type === 'retirada' ? `<div class="bold">🚶 RETIRADA</div>` : ''}
      ${order.delivery_type === 'local' ? `<div class="bold">🍽️ CONSUMO LOCAL</div>` : ''}
      <div class="sep"></div>
      ${itemsHtml}
      ${order.notes ? `<div class="sep"></div><div class="bold">⚠️ OBS: ${order.notes}</div>` : ''}
    </body></html>
  `;
}
