import { NextResponse } from "next/server";
import { postToNest } from "@/lib/nest-proxy";
import { attachAuthCookies } from "@/lib/session-cookies.server";

type NestLoginOk = {
  mfaRequired?: false;
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

type NestLoginMfa = {
  mfaRequired: true;
  mfaToken: string;
};

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Corpo JSON inválido." }, { status: 400 });
  }

  const result = await postToNest<NestLoginOk | NestLoginMfa>("auth/login", body);
  if (!result.ok) {
    return NextResponse.json(result.data, { status: result.status });
  }

  if ("mfaRequired" in result.data && result.data.mfaRequired === true) {
    return NextResponse.json({
      mfaRequired: true,
      mfaToken: result.data.mfaToken,
    });
  }

  const data = result.data as NestLoginOk;
  const response = NextResponse.json({ user: data.user });
  attachAuthCookies(response, data.accessToken, data.refreshToken);
  return response;
}
