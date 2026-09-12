import { NextRequest, NextResponse } from "next/server";

type AssistantBody = {
  message?: string;
  context?: Record<string, unknown>;
};

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as AssistantBody;
  const message = (body.message || "").trim();

  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  // Simulate assistant response delay for chat UX in mock phase.
  await new Promise((resolve) => setTimeout(resolve, 450));

  // TODO: Connect Knowledge Base RAG Retriever here.
  // TODO: Inject retrieved passages into LLM prompt and return grounded citations.
  const response = {
    ok: true,
    answer:
      "Thanks for your question. I can help with Gateway onboarding, pricing structure, model routing, and API integration best practices.",
    context: {
      user_message: message,
      phase: "mock",
      ...body.context,
    },
    rag_sources: [] as Array<{ id: string; title: string; score: number }> ,
  };

  return NextResponse.json(response);
}
