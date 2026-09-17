import { NextResponse } from "next/server";
import { getRuntimePricingCatalog } from "@/lib/model-pricing-store";

export async function GET() {
  try {
    const pricing = await getRuntimePricingCatalog();
    return NextResponse.json({ pricing });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "pricing catalog unavailable",
      },
      { status: 503 },
    );
  }
}
