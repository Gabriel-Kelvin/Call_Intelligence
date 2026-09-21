import { clearCorpus, corpusSummary, ingestTranscript } from "@/lib/transcript-pipeline";

export async function GET() { return Response.json(corpusSummary()); }

export async function DELETE() {
  clearCorpus();
  return Response.json(corpusSummary());
}

export async function POST(request: Request) {
  try {
    const { transcripts } = await request.json() as { transcripts?: { filename?: string; text?: string }[] };
    if (!transcripts?.length) return Response.json({ error: "Add at least one transcript." }, { status: 400 });
    if (transcripts.length > 20) return Response.json({ error: "Upload up to 20 transcripts at a time." }, { status: 400 });
    const records = transcripts.map(item => {
      if (!item.filename || !item.text?.trim()) throw new Error("Every transcript needs a filename and text.");
      if (item.text.length > 2_000_000) throw new Error(`${item.filename} is larger than 2 MB.`);
      return ingestTranscript(item.filename, item.text);
    });
    return Response.json({ records, ...corpusSummary() }, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "The transcripts could not be processed." }, { status: 400 }); }
}
