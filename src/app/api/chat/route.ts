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
- Annual Leave (AL): 14 days per year (prorated for new hires based on completed months, carries forward to next year)
- Medical Certificate Leave (MC): 14 days per year (requires MC document, resets yearly)
- Compassionate Leave (CL): 3 days per year (resets yearly)
- No Pay Leave (NPL): As needed (unpaid, resets yearly)
- Half-day leave is available for Annual Leave only (AM or PM)
- Leave is calculated inclusive of start and end dates

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
        result = await streamText({
          model: google("gemini-1.5-flash"),
          system: systemPrompt,
          messages,
        });
      } catch (error) {
        console.error("Gemini error:", error);
        result = null;
      }
    }

    if (!result && process.env.OPENAI_API_KEY) {
      try {
        result = await streamText({
          model: openai("gpt-4o-mini"),
          system: systemPrompt,
          messages,
        });
      } catch (error) {
        console.error("OpenAI error:", error);
        result = null;
      }
    }

    if (!result && process.env.ANTHROPIC_API_KEY) {
      try {
        result = await streamText({
          model: anthropic("claude-3-haiku-20240307"),
          system: systemPrompt,
          messages,
        });
      } catch (error) {
        console.error("Anthropic error:", error);
        result = null;
      }
    }

    if (!result) {
      return new Response(
        JSON.stringify({ error: "No AI provider available. Please configure an API key." }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return result.toDataStreamResponse();
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
