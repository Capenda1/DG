import { NextResponse } from "next/server";
import { postToNest } from "@/lib/nest-proxy";
import { attachAuthCookies } from "@/lib/session-cookies.server";

type NestMfaVerifyResponse = {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    mfaEnabled: boolean;
    phone: string | null;
    createdAt: string;
  };
  accessToken: string;
  refreshToken: string;
};

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Corpo JSON inválido." }, { status: 400 });
  }

  const result = await postToNest<NestMfaVerifyResponse>("auth/mfa/verify", body);
  if (!result.ok) {
    return NextResponse.json(result.data, { status: result.status });
  }

  const response = NextResponse.json({ user: result.data.user });
  attachAuthCookies(
    response,
    result.data.accessToken,
    result.data.refreshToken,
  );
  return response;
}
