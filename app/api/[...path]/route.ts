import { proxyToNest } from "@/lib/nest-proxy";

type RouteContext = { params: Promise<{ path: string[] }> };

async function handle(request: Request, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  if (path[0] === "session") {
    return Response.json({ message: "Not Found" }, { status: 404 });
  }
  return proxyToNest(request, path);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
export const OPTIONS = handle;
