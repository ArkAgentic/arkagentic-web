import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { applyStripeDeposit } from "@/lib/server-store";

function normalizeStripePaymentMethod(input?: string | null): "stripe" | "card" | "alipay" | "wechat_pay" {
  if (input === "card" || input === "alipay" || input === "wechat_pay") return input;
  return "stripe";
}

export async function POST(request: Request) {
  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeSecret || !webhookSecret) {
    return NextResponse.json({ error: "Stripe webhook is not configured" }, { status: 500 });
  }

  const stripe = new Stripe(stripeSecret, { apiVersion: "2026-07-29.dahlia" });
  const signature = (await headers()).get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    const usdCreditAmount = Number(session.metadata?.usdCreditAmount ?? "0");
    const usdPaidAmount = Number(session.metadata?.usdPaidAmount ?? "0");

    if (!userId || !Number.isFinite(usdCreditAmount) || usdCreditAmount <= 0) {
      return NextResponse.json({ error: "Missing metadata.userId or metadata.usdCreditAmount" }, { status: 400 });
    }

    if (session.payment_status !== "paid") {
      return NextResponse.json({ received: true, type: event.type, credited: false, reason: "payment_not_succeeded" });
    }

    let paymentMethod: "stripe" | "card" | "alipay" | "wechat_pay" = normalizeStripePaymentMethod(
      session.payment_method_types?.[0],
    );

    try {
      if (session.payment_intent) {
        const paymentIntent = await stripe.paymentIntents.retrieve(String(session.payment_intent), {
          expand: ["payment_method"],
        });
        if (paymentIntent.status !== "succeeded") {
          return NextResponse.json({ received: true, type: event.type, credited: false, reason: "payment_not_succeeded" });
        }
        const pmType =
          typeof paymentIntent.payment_method === "object" && paymentIntent.payment_method
            ? paymentIntent.payment_method.type
            : null;
        paymentMethod = normalizeStripePaymentMethod(pmType);
      }
    } catch {
      return NextResponse.json({ received: true, type: event.type, credited: false, reason: "payment_verification_failed" });
    }

    await applyStripeDeposit(userId, usdCreditAmount, {
      stripeId: session.id,
      paymentMethod,
      status: "success",
      kind: "deposit",
      paidAmountUsd: Number.isFinite(usdPaidAmount) && usdPaidAmount > 0 ? usdPaidAmount : undefined,
      creditedAmountUsd: usdCreditAmount,
    });
  }

  return NextResponse.json({ received: true, type: event.type });
}
