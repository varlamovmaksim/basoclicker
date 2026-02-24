import { farcasterConfig } from "../../../farcaster.config";

export async function GET(): Promise<Response> {
  return Response.json(farcasterConfig);
}
