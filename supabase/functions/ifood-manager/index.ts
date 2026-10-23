// ============================================================================
// iFood Manager — Integração Order + Events (PDV Total)
// Implementado conforme a documentação oficial do iFood (pasta /ifood):
//  • Autenticação client_credentials com cache do token (renova só ao expirar / 401)
//  • Polling de eventos (intervalo mínimo de 30s — controlado pelo app)
//  • Acknowledgment de TODOS os eventos (lotes de até 2000 IDs)
//  • Deduplicação de eventos (ifood_event_logs)
//  • Confirmar / Iniciar preparo / Pronto / Despachar (entrega própria)
//  • Motivos de cancelamento + solicitação de cancelamento
//  • Plataforma de negociação (aceitar / rejeitar / contraproposta)
//  • Sincronização de status quando o pedido muda em outro sistema
// ============================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const BASE = "https://merchant-api.ifood.com.br"
const AUTH_URL = `${BASE}/authentication/v1.0/oauth/token`
const ORDER_URL = `${BASE}/order/v1.0`
const EVENTS_URL = `${BASE}/events/v1.0`
const MERCHANT_URL = `${BASE}/merchant/v1.0`

const ACK_BATCH = 2000
const DETAILS_RETRY_WINDOW_MS = 10 * 60 * 1000 // doc: retry com backoff por até 10 minutos

// Mapeamento código curto → código completo (doc "Eventos de pedido")
const SHORT_CODES: Record<string, string> = {
  PLC: "PLACED", CFM: "CONFIRMED", CAN: "CANCELLED", SPS: "SEPARATION_STARTED",
  SPE: "SEPARATION_ENDED", RTP: "READY_TO_PICKUP", DSP: "DISPATCHED", CON: "CONCLUDED",
  CAR: "CANCELLATION_REQUESTED", CARF: "CANCELLATION_REQUEST_FAILED",
  ADR: "ASSIGN_DRIVER", GTO: "GOING_TO_ORIGIN", AAO: "ARRIVED_AT_ORIGIN", CLT: "COLLECTED",
  AAD: "ARRIVED_AT_DESTINATION", DRGO: "DELIVERY_RETURNING_TO_ORIGIN",
  DRDO: "DELIVERY_RETURNED_TO_ORIGIN", DRCR: "DELIVERY_RETURN_CODE_REQUESTED",
  HSD: "HANDSHAKE_DISPUTE", HSS: "HANDSHAKE_SETTLEMENT", OPA: "ORDER_PATCHED",
  DAR: "DELIVERY_ADDRESS_CHANGE_REQUESTED", RPS: "RECOMMENDED_PREPARATION_START",
  PRS: "PREPARATION_STARTED", DGAC: "DELIVERY_GROUP_ASSOCIATED",
}

// Status iFood → status local do PDV
const LOCAL_STATUS: Record<string, string> = {
  PLACED: "pending",
  CONFIRMED: "accepted",
  PREPARATION_STARTED: "preparing",
  SEPARATION_STARTED: "preparing",
  READY_TO_PICKUP: "ready",
  SEPARATION_ENDED: "ready",
  DISPATCHED: "ready",
  CONCLUDED: "delivered",
  CANCELLED: "cancelled",
}
const STATUS_RANK: Record<string, number> = { pending: 0, accepted: 1, preparing: 2, ready: 3, delivered: 4, cancelled: 5 }

const DELIVERY_EVENTS = new Set([
  "ASSIGN_DRIVER", "GOING_TO_ORIGIN", "ARRIVED_AT_ORIGIN", "COLLECTED", "ARRIVED_AT_DESTINATION",
  "DELIVERY_RETURNING_TO_ORIGIN", "DELIVERY_RETURNED_TO_ORIGIN", "DELIVERY_RETURN_CODE_REQUESTED",
])

class HttpError extends Error {
  constructor(public status: number, message: string, public body?: unknown) { super(message) }
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })

// ─── Cliente iFood com cache de token ────────────────────────────────────────
class IfoodClient {
  private token: string | null = null
  constructor(
    private db: SupabaseClient,
    private storeId: string,
    private clientId: string,
    private clientSecret: string,
  ) {}

  private async fetchNewToken(): Promise<string> {
    const body = new URLSearchParams({
      grantType: "client_credentials",
      clientId: this.clientId,
      clientSecret: this.clientSecret,
    })
    const res = await fetch(AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", accept: "application/json" },
      body,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.accessToken) {
      throw new HttpError(res.status, `Falha na autenticação iFood: ${data?.error?.message || data?.message || res.statusText}. Verifique Client ID e Client Secret.`)
    }
    const expiresIn = Number(data.expiresIn) || 3 * 3600 // doc: 3h padrão — usar sempre o expiresIn
    const expiresAt = new Date(Date.now() + (expiresIn - 15) * 1000).toISOString()
    await this.db.from("ifood_auth").upsert({
      store_id: this.storeId, access_token: data.accessToken, expires_at: expiresAt, updated_at: new Date().toISOString(),
    })
    this.token = data.accessToken
    return data.accessToken
  }

  private async getToken(force = false): Promise<string> {
    if (!force && this.token) return this.token
    if (!force) {
      const { data } = await this.db.from("ifood_auth").select("access_token, expires_at").eq("store_id", this.storeId).maybeSingle()
      if (data?.access_token && new Date(data.expires_at).getTime() > Date.now()) {
        this.token = data.access_token
        return data.access_token
      }
    }
    return this.fetchNewToken()
  }

  /** Requisição autenticada. Renova o token uma única vez se receber 401 (doc: token expirado → 401). */
  async request(url: string, init: RequestInit = {}, extraHeaders: Record<string, string> = {}): Promise<Response> {
    const doFetch = async (token: string) => fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...extraHeaders,
      },
    })
    let res = await doFetch(await this.getToken())
    if (res.status === 401) res = await doFetch(await this.getToken(true))
    if (res.status === 429) throw new HttpError(429, "Limite de requisições do iFood atingido. Aguarde alguns segundos.")
    return res
  }

  async requestJson(url: string, init: RequestInit = {}, extraHeaders: Record<string, string> = {}) {
    const res = await this.request(url, init, extraHeaders)
    const text = await res.text()
    let data: any = null
    try { data = text ? JSON.parse(text) : null } catch { data = text }
    if (!res.ok) {
      const msg = data?.message || data?.error?.message || data?.code || res.statusText
      throw new HttpError(res.status, `iFood ${res.status}: ${msg}`, data)
    }
    return { status: res.status, data }
  }
}

// ─── Helpers de mapeamento do pedido ─────────────────────────────────────────
const num = (v: any) => (v === null || v === undefined || isNaN(Number(v)) ? 0 : Number(v))

function mapPaymentMethod(order: any): string {
  const methods: any[] = order?.payments?.methods || []
  if (methods.length === 0) return "ifood_online"
  const offline = methods.find(m => String(m.type).toUpperCase() === "OFFLINE")
  if (!offline) return "ifood_online"
  const m = String(offline.method || "").trim().toUpperCase()
  const map: Record<string, string> = {
    CASH: "cash", PIX: "pix", CREDIT: "credit", DEBIT: "debit",
    MEAL_VOUCHER: "meal_voucher", FOOD_VOUCHER: "food_voucher",
  }
  return map[m] || m.toLowerCase() || "ifood_online"
}

function formatAddress(a: any): string | null {
  if (!a) return null
  const parts = [
    a.formattedAddress || [a.streetName, a.streetNumber].filter(Boolean).join(", "),
    a.complement,
    a.neighborhood,
    [a.city, a.state].filter(Boolean).join("/"),
    a.postalCode && !/^0+$/.test(a.postalCode) ? `CEP ${a.postalCode}` : null,
  ].filter(Boolean)
  let s = parts.join(" - ")
  if (a.reference) s += ` (Ref: ${a.reference})`
  return s || null
}

function buildDetails(order: any, previous: any = {}) {
  const delivery = order.delivery || {}
  const methods = (order?.payments?.methods || []).map((m: any) => ({
    method: String(m.method || "").trim(),
    type: m.type,
    value: num(m.value),
    prepaid: m.prepaid,
    brand: m.card?.brand || null,
    wallet: m.wallet?.name || null,
    changeFor: m.cash?.changeFor != null ? num(m.cash.changeFor) : null,
    change: m.cash?.changeFor != null ? Math.max(0, num(m.cash.changeFor) - num(m.value)) : null,
  }))
  const benefits = (order.benefits || []).map((b: any) => ({
    value: num(b.value),
    target: b.target,
    targetId: b.targetId || null,
    campaign: b.campaign?.name || null,
    sponsors: (b.sponsorshipValues || []).filter((s: any) => num(s.value) > 0).map((s: any) => ({
      name: s.name, value: num(s.value), description: s.description || null,
    })),
  }))
  return {
    ...previous,
    displayId: order.displayId,
    orderType: order.orderType,
    orderTiming: order.orderTiming,
    category: order.category,
    salesChannel: order.salesChannel,
    isTest: !!order.isTest,
    createdAt: order.createdAt,
    preparationStartDateTime: order.preparationStartDateTime || null,
    merchantName: order.merchant?.name || null,
    customer: {
      name: order.customer?.name || null,
      document: order.customer?.documentNumber || null,
      documentType: order.customer?.documentType || null,
      phone: order.customer?.phone?.number || null,
      localizer: order.customer?.phone?.localizer || null,
      localizerExpiration: order.customer?.phone?.localizerExpiration || null,
      ordersCountOnMerchant: order.customer?.ordersCountOnMerchant ?? null,
    },
    delivery: order.orderType === "DELIVERY" ? {
      mode: delivery.mode || null,
      description: delivery.description || null,
      deliveredBy: delivery.deliveredBy || null,
      deliveryDateTime: delivery.deliveryDateTime || null,
      observations: delivery.observations || null,
      pickupCode: delivery.pickupCode || null,
      address: formatAddress(delivery.deliveryAddress),
    } : null,
    takeout: order.takeout ? {
      mode: order.takeout.mode || null,
      takeoutDateTime: order.takeout.takeoutDateTime || null,
      observations: order.takeout.observations || null,
    } : null,
    dineIn: order.dineIn || null,
    schedule: order.schedule || null,
    total: order.total || null,
    payments: {
      prepaid: num(order?.payments?.prepaid),
      pending: num(order?.payments?.pending),
      methods,
    },
    benefits,
    additionalFees: (order.additionalFees || []).map((f: any) => ({ type: f.type, description: f.description, value: num(f.value) })),
    extraInfo: order.extraInfo || null,
  }
}

function mapItems(order: any, localOrderId: string) {
  return (order.items || []).map((item: any) => {
    const unit = String(item.unit || "UN").toUpperCase()
    const qty = num(item.quantity) || 1
    const isUnit = unit === "UN"
    const additionals: { name: string; price: number }[] = []
    for (const opt of item.options || []) {
      const label = `${num(opt.quantity) > 1 ? `${opt.quantity}x ` : ""}${opt.name}`
      additionals.push({ name: opt.groupName ? `${label} (${opt.groupName})` : label, price: num(opt.price) })
      for (const c of opt.customizations || opt.customization || []) {
        additionals.push({ name: `  ↳ ${num(c.quantity) > 1 ? `${c.quantity}x ` : ""}${c.name}`, price: num(c.price) })
      }
    }
    return {
      order_id: localOrderId,
      product_name: isUnit ? item.name : `${item.name} (${qty} ${item.unit})`,
      unit_price: isUnit ? num(item.unitPrice) : num(item.totalPrice),
      quantity: isUnit ? Math.max(1, Math.round(qty)) : 1,
      subtotal: num(item.totalPrice) || num(item.price),
      additionals,
      observations: item.observations || null,
    }
  })
}

function buildNotes(order: any): string {
  const parts: string[] = []
  if (order.extraInfo) parts.push(order.extraInfo)
  if (order.delivery?.observations) parts.push(`Entrega: ${order.delivery.observations}`)
  if (order.takeout?.observations) parts.push(`Retirada: ${order.takeout.observations}`)
  return parts.join(" | ")
}

function deliveryTypeOf(order: any): string {
  if (order.orderType === "DELIVERY") return "entrega"
  if (order.orderType === "TAKEOUT") return "retirada"
  return "local"
}

// ─── Persistência ────────────────────────────────────────────────────────────
async function findLocalOrder(db: SupabaseClient, storeId: string, ifoodOrderId: string) {
  const { data } = await db.from("orders")
    .select("id, status, notes, ifood_status, ifood_details")
    .eq("store_id", storeId).eq("external_id", ifoodOrderId).maybeSingle()
  return data
}

async function importOrder(db: SupabaseClient, ifood: IfoodClient, storeId: string, ifoodOrderId: string, initialStatus = "PLACED") {
  const existing = await findLocalOrder(db, storeId, ifoodOrderId)
  if (existing) return existing

  const res = await ifood.request(`${ORDER_URL}/orders/${ifoodOrderId}`)
  if (res.status === 404) throw new HttpError(404, "Detalhes do pedido ainda não disponíveis")
  if (!res.ok) throw new HttpError(res.status, `Erro ao buscar pedido ${ifoodOrderId}: ${res.statusText}`)
  const order = await res.json()

  const { data: inserted, error } = await db.from("orders").insert({
    store_id: storeId,
    customer_name: order.customer?.name || "Cliente iFood",
    customer_phone: order.customer?.phone?.number || null,
    status: LOCAL_STATUS[initialStatus] || "pending",
    total: num(order.total?.orderAmount),
    notes: buildNotes(order) || null,
    payment_method: mapPaymentMethod(order),
    origin: "ifood",
    external_id: order.id,
    external_code: order.displayId,
    delivery_type: deliveryTypeOf(order),
    delivery_address: order.orderType === "DELIVERY" ? formatAddress(order.delivery?.deliveryAddress) : null,
    ifood_status: initialStatus,
    ifood_order_type: order.orderType || null,
    ifood_order_timing: order.orderTiming || null,
    ifood_delivered_by: order.delivery?.deliveredBy || null,
    ifood_details: buildDetails(order),
    ifood_last_event_at: new Date().toISOString(),
  }).select("id, status, notes, ifood_status, ifood_details").single()

  if (error) {
    // Corrida: outro polling inseriu ao mesmo tempo
    const again = await findLocalOrder(db, storeId, ifoodOrderId)
    if (again) return again
    throw error
  }

  const items = mapItems(order, inserted.id)
  if (items.length) {
    const { error: itemsErr } = await db.from("order_items").insert(items)
    if (itemsErr) {
      // fallback se a coluna observations ainda não existir
      const noObs = items.map(({ observations, ...rest }: any) => ({
        ...rest,
        product_name: observations ? `${rest.product_name} — OBS: ${observations}` : rest.product_name,
      }))
      await db.from("order_items").insert(noObs)
    }
  }
  return inserted
}

async function refreshOrderFromIfood(db: SupabaseClient, ifood: IfoodClient, local: any, ifoodOrderId: string) {
  const res = await ifood.request(`${ORDER_URL}/orders/${ifoodOrderId}`)
  if (!res.ok) return
  const order = await res.json()
  await db.from("orders").update({
    total: num(order.total?.orderAmount),
    payment_method: mapPaymentMethod(order),
    ifood_details: buildDetails(order, local.ifood_details || {}),
  }).eq("id", local.id)
  await db.from("order_items").delete().eq("order_id", local.id)
  const items = mapItems(order, local.id)
  if (items.length) await db.from("order_items").insert(items)
}

async function applyEvent(db: SupabaseClient, ifood: IfoodClient, storeId: string, ev: any) {
  const fullCode: string = ev.fullCode || SHORT_CODES[ev.code] || ev.code
  const orderId: string = ev.orderId
  if (!orderId) return

  if (fullCode === "PLACED") {
    await importOrder(db, ifood, storeId, orderId, "PLACED")
    return
  }

  // Qualquer outro evento: garante que o pedido existe localmente (sincronização de status)
  let local = await findLocalOrder(db, storeId, orderId)
  if (!local) {
    const initial = LOCAL_STATUS[fullCode] ? fullCode : "PLACED"
    try { local = await importOrder(db, ifood, storeId, orderId, initial) } catch (e) {
      if (e instanceof HttpError && e.status === 404) return // pedido antigo (>7 dias) ou indisponível
      throw e
    }
    if (!local) return
  }

  const details = { ...(local.ifood_details || {}) }
  const update: Record<string, any> = { ifood_last_event_at: ev.createdAt || new Date().toISOString() }
  const meta = ev.metadata || {}

  if (LOCAL_STATUS[fullCode]) {
    const next = LOCAL_STATUS[fullCode]
    const cur = local.status
    const canMove = cur !== "cancelled" && cur !== "delivered" && (next === "cancelled" || (STATUS_RANK[next] ?? 0) >= (STATUS_RANK[cur] ?? 0))
    if (canMove) update.status = next
    update.ifood_status = fullCode
    if (fullCode === "CANCELLED") {
      const reason = meta.CANCEL_REASON || meta.CANCEL_CODE_DESCRIPTION || meta.reason || "Cancelado no iFood"
      details.cancellation = {
        code: meta.CANCEL_CODE || null, reason, origin: meta.CANCEL_ORIGIN || null,
        stage: meta.CANCEL_STAGE || null, at: ev.createdAt,
      }
      const tag = `[iFood cancelou: ${reason}]`
      if (!String(local.notes || "").includes(tag)) update.notes = local.notes ? `${local.notes} | ${tag}` : tag
      details.dispute = null
    }
  } else if (fullCode === "CANCELLATION_REQUESTED") {
    update.ifood_status = "CANCELLATION_REQUESTED"
    details.cancellationRequest = { origin: meta.ORIGIN || null, details: meta.details || null, code: meta.reason_code || null, at: ev.createdAt }
  } else if (fullCode === "CANCELLATION_REQUEST_FAILED") {
    update.ifood_status = "CANCELLATION_REQUEST_FAILED"
    details.cancellationFailure = {
      code: meta.CANCEL_CODE || null,
      reason: meta.CANCELLATION_REQUEST_FAILED_REASON || meta.reason || "Cancelamento rejeitado pelo iFood",
      at: ev.createdAt,
    }
  } else if (fullCode === "HANDSHAKE_DISPUTE") {
    details.dispute = {
      disputeId: meta.disputeId,
      action: meta.action,
      handshakeType: meta.handshakeType || null,
      message: meta.message || null,
      expiresAt: meta.expiresAt || null,
      timeoutAction: meta.timeoutAction || null,
      acceptCancellationReasons: meta.metadata?.acceptCancellationReasons || [],
      alternatives: meta.alternatives || [],
      items: meta.metadata?.items || meta.items || null,
      createdAt: meta.createdAt || ev.createdAt,
    }
  } else if (fullCode === "HANDSHAKE_SETTLEMENT") {
    details.lastSettlement = { ...meta, at: ev.createdAt }
    details.dispute = null
  } else if (fullCode === "ORDER_PATCHED") {
    details.lastPatch = { ...meta, at: ev.createdAt }
    await refreshOrderFromIfood(db, ifood, { ...local, ifood_details: details }, orderId)
    const refreshed = await findLocalOrder(db, storeId, orderId)
    Object.assign(details, refreshed?.ifood_details || {}, { lastPatch: { ...meta, at: ev.createdAt } })
  } else if (fullCode === "DELIVERY_ADDRESS_CHANGE_REQUESTED") {
    details.addressChangeRequest = { ...meta, at: ev.createdAt }
  } else if (DELIVERY_EVENTS.has(fullCode)) {
    details.deliveryStatus = fullCode
    if (fullCode === "ASSIGN_DRIVER") {
      details.driver = {
        name: meta.workerName || null, phone: meta.workerPhone || null,
        vehicle: meta.workerVehicleType || null, photo: meta.workerPhotoUrl || null,
      }
    }
    if (fullCode === "DELIVERY_RETURN_CODE_REQUESTED") details.returnCode = meta.HANDSHAKE_CODE || null
  } else if (fullCode === "RECOMMENDED_PREPARATION_START") {
    details.recommendedPreparationStart = ev.createdAt
  }

  update.ifood_details = details
  await db.from("orders").update(update).eq("id", local.id)
}

// ─── Polling + ACK ───────────────────────────────────────────────────────────
async function pollEvents(db: SupabaseClient, ifood: IfoodClient, storeId: string, merchantId?: string) {
  const headers: Record<string, string> = {}
  if (merchantId) headers["x-polling-merchants"] = merchantId
  const res = await ifood.request(`${EVENTS_URL}/events:polling`, { method: "GET" }, headers)
  if (res.status === 204) return { received: 0, processed: 0, acknowledged: 0, pending: 0 }
  if (!res.ok) {
    const t = await res.text()
    throw new HttpError(res.status, `Erro no polling iFood (${res.status}): ${t || res.statusText}`)
  }
  const payload = await res.json()
  const events: any[] = Array.isArray(payload) ? payload : (payload?.events || [])
  events.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime())

  const toAck: string[] = []
  let processed = 0
  let pending = 0
  const errors: string[] = []

  for (const ev of events) {
    if (!ev?.id) continue
    // Deduplicação
    const { data: log } = await db.from("ifood_event_logs")
      .select("id, processed").eq("store_id", storeId).eq("event_id", ev.id).maybeSingle()
    if (log?.processed) { toAck.push(ev.id); continue }
    if (!log) {
      await db.from("ifood_event_logs").insert({
        store_id: storeId, event_id: ev.id, order_id: ev.orderId,
        event_code: ev.fullCode || ev.code, payload: ev, processed: false,
      })
    }
    try {
      await applyEvent(db, ifood, storeId, ev)
      await db.from("ifood_event_logs").update({ processed: true }).eq("store_id", storeId).eq("event_id", ev.id)
      toAck.push(ev.id)
      processed++
    } catch (e) {
      const age = Date.now() - new Date(ev.createdAt || Date.now()).getTime()
      if (e instanceof HttpError && e.status === 404 && age < DETAILS_RETRY_WINDOW_MS) {
        pending++ // não confirma: o evento volta no próximo polling (retry)
      } else {
        errors.push(`${ev.fullCode || ev.code} ${ev.orderId}: ${(e as Error).message}`)
        console.error("Erro processando evento iFood", ev.id, e)
        toAck.push(ev.id) // evita loop infinito com evento problemático (fica registrado no log)
      }
    }
  }

  let acknowledged = 0
  for (let i = 0; i < toAck.length; i += ACK_BATCH) {
    const batch = toAck.slice(i, i + ACK_BATCH)
    const ackRes = await ifood.request(`${EVENTS_URL}/events/acknowledgment`, {
      method: "POST",
      body: JSON.stringify(batch.map(id => ({ id }))),
    })
    if (ackRes.ok || ackRes.status === 202) acknowledged += batch.length
    else console.error("Falha no acknowledgment", ackRes.status, await ackRes.text())
  }

  return { received: events.length, processed, acknowledged, pending, errors }
}

// ─── Servidor ────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const body = await req.json().catch(() => ({}))
    const { action, storeId } = body
    const orderId: string | undefined = body.orderId
    if (!storeId) throw new HttpError(400, "storeId é obrigatório")
    if (!action) throw new HttpError(400, "action é obrigatório")

    const db = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    )

    // Segurança: apenas dono da loja ou usuário vinculado à loja
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "")
    const { data: userData } = await db.auth.getUser(jwt)
    const userId = userData?.user?.id
    if (!userId) throw new HttpError(401, "Usuário não autenticado")
    const [{ data: ownerStore }, { data: profile }] = await Promise.all([
      db.from("stores").select("id").eq("id", storeId).eq("owner_id", userId).maybeSingle(),
      db.from("profiles").select("store_id").eq("auth_user_id", userId).maybeSingle(),
    ])
    if (!ownerStore && profile?.store_id !== storeId) throw new HttpError(403, "Sem permissão para esta loja")

    const { data: secrets } = await db.from("store_secrets").select("ifood_config").eq("store_id", storeId).maybeSingle()
    const cfg = (secrets?.ifood_config || {}) as Record<string, any>
    if (!cfg.client_id || !cfg.client_secret) {
      throw new HttpError(400, "iFood não configurado. Preencha Client ID e Client Secret em Configurações → iFood.")
    }
    const ifood = new IfoodClient(db, storeId, cfg.client_id, cfg.client_secret)

    const needOrder = () => { if (!orderId) throw new HttpError(400, "orderId (ID do pedido no iFood) é obrigatório") }
    const post = async (path: string, payload?: unknown) => {
      const r = await ifood.requestJson(`${ORDER_URL}${path}`, { method: "POST", ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}) })
      return r.data ?? { status: "ACCEPTED" }
    }
    const markLocal = async (fields: Record<string, any>) => {
      if (!orderId) return
      await db.from("orders").update(fields).eq("store_id", storeId).eq("external_id", orderId)
    }

    switch (action) {
      case "test_connection": {
        const { data: merchants } = await ifood.requestJson(`${MERCHANT_URL}/merchants`)
        const list = Array.isArray(merchants) ? merchants : []
        const found = cfg.merchant_id ? list.find((m: any) => m.id === cfg.merchant_id) : null
        let status: any = null
        if (cfg.merchant_id) {
          try { status = (await ifood.requestJson(`${MERCHANT_URL}/merchants/${cfg.merchant_id}/status`)).data } catch { /* opcional */ }
        }
        return json({
          ok: true,
          merchants: list.map((m: any) => ({ id: m.id, name: m.name, corporateName: m.corporateName })),
          merchantFound: cfg.merchant_id ? !!found : null,
          status,
        })
      }

      case "poll_events":
        return json(await pollEvents(db, ifood, storeId, cfg.merchant_id))

      case "confirm_order":
        needOrder()
        await post(`/orders/${orderId}/confirm`)
        return json({ success: true })

      case "start_preparation":
        needOrder()
        await post(`/orders/${orderId}/startPreparation`)
        return json({ success: true })

      case "ready_order":
      case "ready_to_pickup":
        needOrder()
        await post(`/orders/${orderId}/readyToPickup`)
        return json({ success: true })

      case "dispatch_order":
        needOrder()
        await post(`/orders/${orderId}/dispatch`)
        return json({ success: true })

      case "cancellation_reasons": {
        needOrder()
        const r = await ifood.request(`${ORDER_URL}/orders/${orderId}/cancellationReasons`)
        if (r.status === 204) return json({ reasons: [] })
        const data = await r.json().catch(() => [])
        if (!r.ok) throw new HttpError(r.status, data?.message || "Erro ao buscar motivos de cancelamento")
        const raw: any[] = Array.isArray(data) ? data : (data?.reasons || [])
        const reasons = raw.map(x => ({ code: String(x.cancelCodeId ?? x.code ?? x.id), description: x.description || x.name || String(x.code) }))
        return json({ reasons })
      }

      case "request_cancellation": {
        needOrder()
        const code = String(body.cancellationCode || body.reasonCode || "")
        if (!code) throw new HttpError(400, "Selecione um motivo de cancelamento")
        const description = String(body.reason || body.description || code).slice(0, 250)
        await post(`/orders/${orderId}/requestCancellation`, { reason: description, cancellationCode: code })
        await markLocal({ ifood_status: "CANCELLATION_REQUESTED" })
        return json({ success: true, message: "Cancelamento solicitado. Aguardando confirmação do iFood (evento CANCELLED)." })
      }

      case "dispute_accept": {
        if (!body.disputeId) throw new HttpError(400, "disputeId é obrigatório")
        const payload: Record<string, any> = {}
        if (body.reason) payload.reason = body.reason
        if (body.detailReason) payload.detailReason = String(body.detailReason).slice(0, 250)
        const data = (await ifood.requestJson(`${ORDER_URL}/disputes/${body.disputeId}/accept`, { method: "POST", body: JSON.stringify(payload) })).data
        return json({ success: true, data })
      }

      case "dispute_reject": {
        if (!body.disputeId) throw new HttpError(400, "disputeId é obrigatório")
        const payload: Record<string, any> = { reason: body.reason || "CUSTOMER_REQUEST" }
        if (body.detailReason) payload.detailReason = String(body.detailReason).slice(0, 250)
        const data = (await ifood.requestJson(`${ORDER_URL}/disputes/${body.disputeId}/reject`, { method: "POST", body: JSON.stringify(payload) })).data
        return json({ success: true, data })
      }

      case "dispute_alternative": {
        if (!body.disputeId) throw new HttpError(400, "disputeId é obrigatório")
        const data = (await ifood.requestJson(`${ORDER_URL}/disputes/${body.disputeId}/alternative`, {
          method: "POST", body: JSON.stringify({ type: body.type, metadata: body.metadata || {} }),
        })).data
        return json({ success: true, data })
      }

      case "validate_pickup_code": {
        needOrder()
        const data = (await ifood.requestJson(`${ORDER_URL}/orders/${orderId}/validatePickupCode`, { method: "POST", body: JSON.stringify({ code: body.code }) })).data
        return json(data ?? { valid: true })
      }

      case "verify_delivery_code": {
        needOrder()
        const data = (await ifood.requestJson(`${ORDER_URL}/orders/${orderId}/verifyDeliveryCode`, { method: "POST", body: JSON.stringify({ code: body.code }) })).data
        return json(data ?? { valid: true })
      }

      case "tracking": {
        needOrder()
        const r = await ifood.request(`${ORDER_URL}/orders/${orderId}/tracking`)
        if (r.status === 404) return json({ available: false })
        return json({ available: true, ...(await r.json()) })
      }

      default:
        throw new HttpError(400, `Ação desconhecida: ${action}`)
    }
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500
    const message = (error as Error)?.message || "Erro interno"
    console.error("ifood-manager:", message)
    // Retorna 200 com campo error para o supabase-js entregar a mensagem legível ao front
    return json({ error: message, status }, 200)
  }
})
