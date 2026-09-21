import { corpusSummary } from "@/lib/transcript-pipeline";

export async function GET() {
  const corpus = corpusSummary();
  return Response.json({
    status: "ok",
    service: "call-intelligence",
    transcriptCount: corpus.transcriptCount,
    timestamp: new Date().toISOString(),
  });
}
