import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    DATABASE_URL_exists: !!process.env.DATABASE_URL,
    DATABASE_URL_length: process.env.DATABASE_URL?.length || 0,
    DATABASE_URL_preview: process.env.DATABASE_URL?.substring(0, 20) || "not found",
    DIRECT_URL_exists: !!process.env.DIRECT_URL,
    AUTH_SECRET_exists: !!process.env.AUTH_SECRET,
    NODE_ENV: process.env.NODE_ENV,
    all_env_keys: Object.keys(process.env).filter(key =>
      key.includes('DATABASE') || key.includes('AUTH')
    ),
  });
}
