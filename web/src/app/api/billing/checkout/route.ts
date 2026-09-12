import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { parseJwtFromCookie } from "@/lib/server-auth";

const ALLOWED_AMOUNTS = new Set([10, 50, 200]);
const FX_USD_TO_CNY = 7.2;

type CheckoutCurrency = "usd" | "cny";

const CNY_TOPUP_PRICE_BY_USD: Record<number, number> = {
  10: Math.round(10 * FX_USD_TO_CNY),
  50: Math.round(50 * FX_USD_TO_CNY),
  200: Math.round(200 * FX_USD_TO_CNY),
};

const USD_CREDIT_BY_PAID_AMOUNT: Record<number, number> = {
  10: 10,
  50: 55,
  200: 230,
};

function resolveCheckoutCurrency(input?: string): CheckoutCurrency {
  return input === "cny" ? "cny" : "usd";
}

function normalizeOrigin(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return new URL(withScheme).origin;
  } catch {
    return null;
  }
}

function resolveOrigin(request: NextRequest): string {
  const envOrigin = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  const headerOrigin = request.headers.get("origin");
  const refererOrigin = normalizeOrigin(request.headers.get("referer"));

  return (
    normalizeOrigin(envOrigin) ||
    normalizeOrigin(headerOrigin) ||
    refererOrigin ||
    "https://arkagentic.com"
  );
}

export async function POST(request: NextRequest) {
  const session = parseJwtFromCookie(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 500 });
  }

  let amount = 0;
  let checkoutCurrency: CheckoutCurrency = "usd";
  try {
    const payload = (await request.json()) as { amount?: number; currency?: string };
    amount = Number(payload?.amount ?? 0);
    checkoutCurrency = resolveCheckoutCurrency(payload?.currency);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!ALLOWED_AMOUNTS.has(amount)) {
    return NextResponse.json({ error: "Only preset amounts are supported: 10, 50, 200" }, { status: 400 });
  }

  const stripe = new Stripe(stripeSecret, { apiVersion: "2026-07-29.dahlia" });
  const origin = resolveOrigin(request);

  try {
    const checkoutUnitAmount =
      checkoutCurrency === "cny" ? CNY_TOPUP_PRICE_BY_USD[amount] * 100 : amount * 100;
    const usdCreditAmount = USD_CREDIT_BY_PAID_AMOUNT[amount];
    const planId = `topup_${amount}`;

    const checkoutParams: Stripe.Checkout.SessionCreateParams = {
      mode: "payment",
      customer_email: session.email,
      success_url: `${origin}/console/topup?status=success&amount=${usdCreditAmount}`,
      cancel_url: `${origin}/console/topup?status=cancelled`,
      metadata: {
        userId: session.userId,
        planId,
        amountUsd: String(amount),
        usdPaidAmount: String(amount),
        usdCreditAmount: String(usdCreditAmount),
        checkoutCurrency,
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: checkoutCurrency,
            unit_amount: checkoutUnitAmount,
            product_data: {
              name: `ArkAgentic Credits - $${amount}`,
              description:
                amount >= 200
                  ? "Pay $200, credit $230 (includes $30 bonus credit)"
                  : amount >= 50
                    ? "Pay $50, credit $55 (includes $5 bonus credit)"
                    : "Pay $10, credit $10",
            },
          },
        },
      ],
    };

    checkoutParams.payment_method_types = ["card", "alipay", "wechat_pay", "link"];
    checkoutParams.payment_method_options = {
      wechat_pay: {
        client: "web",
      },
    };

    const checkout = await stripe.checkout.sessions.create(checkoutParams);
    const effectivePaymentMethods = checkout.payment_method_types ?? [];

    return NextResponse.json({
      url: checkout.url,
      id: checkout.id,
      paymentMethodTypes: effectivePaymentMethods,
      unavailablePaymentMethods: [],
      currency: checkout.currency,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stripe checkout creation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
