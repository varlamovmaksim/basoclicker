import { NextRequest, NextResponse } from "next/server";
import { handleGetAuth } from "@/lib/auth/auth.controller";

export async function GET(
  request: NextRequest
): Promise<NextResponse> {
  return handleGetAuth(request);
}
