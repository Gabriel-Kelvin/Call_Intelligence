import { getChunks, retrieve } from "@/lib/transcript-pipeline";
import { groqJson } from "@/lib/groq";

export async function POST(request: Request) {
  try {
    const { question } = await request.json() as { question?: string };
    if (!question?.trim()) return Response.json({ error: "Please enter a question." }, { status: 400 });
    if (question.length > 800) return Response.json({ error: "Please keep the question under 800 characters." }, { status: 400 });
    let expandedQueries = [question.trim()];
    try {
      const plan = await groqJson("Rewrite a research question into up to 4 complementary retrieval queries. Preserve names, dates and technical terms. Add synonyms and alternate phrasings, but do not answer. Return JSON only: {\"queries\":[\"...\"]}.", question.trim(), 250) as { queries?: string[] };
      expandedQueries = [question.trim(), ...(plan.queries || [])].filter((value, index, all) => value && all.indexOf(value) === index).slice(0, 5);
    } catch { /* Original query remains a reliable fallback. */ }

    const candidates = retrieve(expandedQueries, 20);
    if (!candidates.length) return Response.json({ answer: "I could not find relevant evidence in the indexed transcripts.", citations: [], retrieval: { queries: expandedQueries, candidates: 0 } });
    const candidateBlock = candidates.map(({ chunk, score }) => `[${chunk.id}] file=${chunk.filename} | title=${chunk.title} | speaker=${chunk.speaker} | market=${chunk.market || "unknown"} | time=${chunk.timestamp} | retrieval_score=${score.toFixed(3)}\n${chunk.content}`).join("\n\n");
    let selected = candidates.slice(0, 10);
    try {
      const reranked = await groqJson("You are a strict evidence reranker. Select only passages that directly help answer the question in its intended subject and context. Reject passages that merely share generic words, numbers, or verbs but discuss a different domain. Prefer a small precise set over broad recall. If none directly answer or inform the question, return an empty array. Return JSON only: {\"evidenceIds\":[\"exact supplied ID\"]}.", `QUESTION:\n${question.trim()}\n\nCANDIDATE PASSAGES:\n${candidateBlock}`, 350) as { evidenceIds?: string[] };
      if (Array.isArray(reranked.evidenceIds)) {
        const selectedIds = new Set(reranked.evidenceIds.slice(0, 10));
        selected = candidates.filter(row => selectedIds.has(row.chunk.id));
      }
    } catch { /* Deterministic ranking remains the fallback. */ }
    if (!selected.length) return Response.json({ answer: "The indexed transcripts do not contain enough relevant evidence to answer that question.", citations: [], confidence: "low", model: "Qwen 3.8 27B · Groq", retrieval: { queries: expandedQueries, candidates: candidates.length, selected: 0, cited: 0, strategy: "multi-query BM25 + semantic reranking" } });
    const evidenceBlock = selected.map(({ chunk, score }) => `[${chunk.id}] file=${chunk.filename} | title=${chunk.title} | speaker=${chunk.speaker} | market=${chunk.market || "unknown"} | time=${chunk.timestamp} | retrieval_score=${score.toFixed(3)}\n${chunk.content}`).join("\n\n");

    const generated = await groqJson("You are an evidence-first research analyst. Answer ONLY from the supplied transcript excerpts. Never invent facts, quotes, speakers or timestamps. Do not combine evidence from unrelated subjects merely because wording overlaps. Resolve the user's actual question, compare sources only when they concern the same subject, preserve genuine disagreement, and explicitly say when evidence is insufficient. Every substantive claim must be supported by one or more evidence IDs from the supplied set. Return JSON only: {\"answer\":\"2-6 concise plain-text sentences\",\"evidenceIds\":[\"exact supplied ID\"],\"confidence\":\"high|medium|low\"}.", `QUESTION:\n${question.trim()}\n\nRETRIEVED TRANSCRIPT EVIDENCE:\n${evidenceBlock}`, 850) as { answer?: string; evidenceIds?: string[]; confidence?: string };

    if (!generated.answer) throw new Error("The model returned an empty answer.");
    const allowed = new Set(selected.map(row => row.chunk.id));
    const validIds = [...new Set(generated.evidenceIds || [])].filter(id => allowed.has(id)).slice(0, 8);
    const citations = getChunks(validIds).map(chunk => ({ evidenceId: chunk.id, transcriptId: chunk.transcriptId, filename: chunk.filename, title: chunk.title, speaker: chunk.speaker, market: chunk.market, timestamp: chunk.timestamp, quote: chunk.content }));
    return Response.json({ answer: generated.answer, citations, confidence: generated.confidence || "medium", model: "Qwen 3.8 27B · Groq", retrieval: { queries: expandedQueries, candidates: candidates.length, selected: selected.length, cited: citations.length, strategy: "multi-query BM25 + semantic reranking" } });
  } catch (error) {
    console.error("Transcript RAG failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "The answer could not be verified." }, { status: 500 });
  }
}
