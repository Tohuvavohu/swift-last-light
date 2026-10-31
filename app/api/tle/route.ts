import { getElements } from "@/lib/sources";
export async function GET() {
  try {
    return Response.json(await getElements(), {
      headers: { "Cache-Control": "public, max-age=300" },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "TLE source unavailable",
      },
      { status: 502 },
    );
  }
}
