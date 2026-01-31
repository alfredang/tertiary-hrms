import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";

const systemPrompt = `You are an AI assistant for the Tertiary Infotech HR Portal. You help employees with HR-related questions and tasks.

You can assist with:
- Leave policies and balance inquiries
- Expense claim procedures
- Payroll and CPF questions
- Company policies
- General HR inquiries

Singapore CPF Information:
- Employee contribution (age ≤55): 20% of ordinary wages
- Employer contribution (age ≤55): 17% of ordinary wages
- Monthly ordinary wage ceiling: $8,000
- Annual wage ceiling: $102,000

Leave Policies:
- Annual Leave: 14 days per year
- Sick Leave: 14 days per year
- Medical Leave: Up to 60 days (with MC)
- Compassionate Leave: 3 days

Be helpful, professional, and concise in your responses. If you don't know something, suggest the employee contact HR directly.`;

export async function POST(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { messages } = await req.json();

    // Try Gemini first, then OpenAI, then Anthropic
    let result;

    if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      try {
        result = streamText({
          model: google("gemini-1.5-flash"),
          system: systemPrompt,
          messages,
        });
      } catch (error) {
        console.error("Gemini error, trying OpenAI:", error);
      }
    }

    if (!result && process.env.OPENAI_API_KEY) {
      try {
        result = streamText({
          model: openai("gpt-4o-mini"),
          system: systemPrompt,
          messages,
        });
      } catch (error) {
        console.error("OpenAI error, trying Anthropic:", error);
      }
    }

    if (!result && process.env.ANTHROPIC_API_KEY) {
      result = streamText({
        model: anthropic("claude-3-haiku-20240307"),
        system: systemPrompt,
        messages,
      });
    }

    if (!result) {
      return new Response(
        JSON.stringify({ error: "No AI provider configured" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return (await result).toDataStreamResponse();
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
