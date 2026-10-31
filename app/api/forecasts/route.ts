import { getForecasts } from "@/lib/sources";
export async function GET() {
  return Response.json(await getForecasts(), {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
