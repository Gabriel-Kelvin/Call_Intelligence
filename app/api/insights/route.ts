import { groqJson } from "@/lib/groq";
import { getAllChunks, getChunks } from "@/lib/transcript-pipeline";

export async function POST() {
  try {
    const all = getAllChunks();
    if (!all.length) return Response.json({ error: "Upload transcripts before generating insights." }, { status: 400 });
    const byTranscript = new Map<string, typeof all>();
    all.forEach(chunk => byTranscript.set(chunk.transcriptId, [...(byTranscript.get(chunk.transcriptId) || []), chunk]));
    const selected = [...byTranscript.values()].flatMap(chunks => chunks.slice(0, 30));
    let used = "";
    for (const chunk of selected) {
      const row = `[${chunk.id}] transcript=${chunk.transcriptId} | expert=${chunk.title} | market=${chunk.market || "unknown"} | speaker=${chunk.speaker} | time=${chunk.timestamp}\n${chunk.content}\n\n`;
      if (used.length + row.length > 55_000) break;
      used += row;
    }
    const generated = await groqJson(
      "You analyse expert-call transcripts across multiple calls. Identify only genuinely recurring themes and meaningful disagreements. Do not invent consensus. Every insight must cite exact supplied evidence IDs from at least two transcripts when possible. Return JSON only: {\"themes\":[{\"title\":\"...\",\"summary\":\"...\",\"evidenceIds\":[\"...\"]}],\"disagreements\":[{\"title\":\"...\",\"summary\":\"...\",\"evidenceIds\":[\"...\"]}]}. Return at most 4 themes and 3 disagreements.",
      `TRANSCRIPT EVIDENCE:\n${used}`,
      1000,
    ) as { themes?: { title?: string; summary?: string; evidenceIds?: string[] }[]; disagreements?: { title?: string; summary?: string; evidenceIds?: string[] }[] };
    const allowed = new Set(selected.map(chunk => chunk.id));
    const hydrate = (items: typeof generated.themes = []) => (items || []).filter(item => item.title && item.summary).map(item => {
      const ids = [...new Set(item.evidenceIds || [])].filter(id => allowed.has(id)).slice(0, 8);
      return { title: item.title, summary: item.summary, citations: getChunks(ids).map(chunk => ({ evidenceId: chunk.id, filename: chunk.filename, title: chunk.title, speaker: chunk.speaker, market: chunk.market, timestamp: chunk.timestamp, quote: chunk.content })) };
    }).filter(item => item.citations.length);
    return Response.json({ themes: hydrate(generated.themes), disagreements: hydrate(generated.disagreements), transcriptCount: byTranscript.size, chunkCount: all.length, generatedAt: new Date().toISOString() });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Insights could not be generated." }, { status: 500 }); }
}
