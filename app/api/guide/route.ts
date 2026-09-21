import { groqJson } from "@/lib/groq";
import { getAllChunks, getChunks, retrieve } from "@/lib/transcript-pipeline";

function parseQuestions(text: string) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").map(line => line.trim()).filter(Boolean);
  const candidates = lines.map(line => line.replace(/^[-*•]\s*/, "").replace(/^\d+[.)]\s*/, "")).filter(line => line.endsWith("?") || /^(how|what|why|when|where|which|who|do|does|did|is|are|can|could|would|should)\b/i.test(line));
  if (candidates.length) return [...new Set(candidates)].slice(0, 12);
  return [...new Set(text.match(/[^?\n]+\?/g)?.map(value => value.trim()) || [])].slice(0, 12);
}

export async function POST(request: Request) {
  try {
    const { text } = await request.json() as { text?: string };
    if (!text?.trim()) return Response.json({ error: "Upload or paste an interview guide." }, { status: 400 });
    const questions = parseQuestions(text);
    if (!questions.length) return Response.json({ error: "No interview questions were detected." }, { status: 400 });

    const allChunks = getAllChunks();
    const compactCorpus = allChunks.reduce((sum, chunk) => sum + chunk.content.length, 0) <= 45_000;
    const candidateSets = compactCorpus ? questions.map(() => allChunks.map(chunk => ({ chunk, score: 1 }))) : questions.map(question => retrieve([question], 12));
    if (!candidateSets.some(set => set.length)) return Response.json({ error: "The uploaded transcripts do not contain evidence for this guide." }, { status: 400 });
    const evidenceBundle = compactCorpus ? `QUESTIONS:\n${questions.map((question, index) => `${index + 1}. ${question}`).join("\n")}\n\nSHARED CORPUS:\n${allChunks.map(chunk => `[${chunk.id}] transcript=${chunk.transcriptId} | expert=${chunk.title} | market=${chunk.market || "unknown"} | speaker=${chunk.speaker} | time=${chunk.timestamp}\n${chunk.content}`).join("\n\n")}` : questions.map((question, index) => {
      const rows = candidateSets[index].map(({ chunk }) => `[${chunk.id}] transcript=${chunk.transcriptId} | expert=${chunk.title} | market=${chunk.market || "unknown"} | speaker=${chunk.speaker} | time=${chunk.timestamp}\n${chunk.content}`).join("\n\n");
      return `QUESTION ${index + 1}: ${question}\n${rows}`;
    }).join("\n\n---\n\n");

    const generated = await groqJson(
      "Answer every interview-guide question separately for every expert transcript that contains relevant evidence. Use only supplied excerpts. Do not merge experts, invent missing answers, or cite an ID from another expert in a response. If a transcript lacks evidence for a question, omit it. Keep each answer to 1-3 concise sentences. Return JSON only: {\"answers\":[{\"questionIndex\":1,\"responses\":[{\"transcriptId\":\"exact transcript ID\",\"answer\":\"...\",\"evidenceIds\":[\"exact evidence ID\"],\"confidence\":\"high|medium|low\"}]}]}.",
      `INTERVIEW GUIDE WITH RETRIEVED EVIDENCE:\n${evidenceBundle}`,
      2400,
    ) as { answers?: { questionIndex?: number; responses?: { transcriptId?: string; answer?: string; evidenceIds?: string[]; confidence?: string }[] }[] };

    const answerMap = new Map((generated.answers || []).map(answer => [answer.questionIndex, answer]));
    const answers = questions.map((question, index) => {
      const allowed = new Set(candidateSets[index].map(row => row.chunk.id));
      const raw = answerMap.get(index + 1);
      const responses = (raw?.responses || []).filter(response => response.transcriptId && response.answer).map(response => {
        const ids = [...new Set(response.evidenceIds || [])].filter(id => allowed.has(id));
        const citations = getChunks(ids).filter(chunk => chunk.transcriptId === response.transcriptId).map(chunk => ({ evidenceId: chunk.id, filename: chunk.filename, title: chunk.title, speaker: chunk.speaker, market: chunk.market, timestamp: chunk.timestamp, quote: chunk.content }));
        const first = citations[0];
        return { transcriptId: response.transcriptId!, expert: first?.title || "Expert", market: first?.market, answer: response.answer!, confidence: response.confidence || "medium", citations };
      }).filter(response => response.citations.length);
      return { question, responses };
    });
    return Response.json({ title: guideTitle(text), questions, answers, generatedAt: new Date().toISOString() });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "The guide could not be answered." }, { status: 500 }); }
}

function guideTitle(text: string) {
  const first = text.replace(/\r\n?/g, "\n").split("\n").map(line => line.trim()).find(Boolean) || "Interview guide";
  return first.length < 100 && !first.endsWith("?") ? first : "Interview guide";
}
