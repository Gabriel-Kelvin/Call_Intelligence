export type TranscriptChunk = {
  id: string;
  transcriptId: string;
  filename: string;
  title: string;
  speaker: string;
  market?: string;
  timestamp: string;
  startSeconds: number;
  content: string;
  tokens: string[];
};

export type TranscriptRecord = {
  id: string;
  filename: string;
  title: string;
  market?: string;
  chunkCount: number;
  characterCount: number;
  createdAt: string;
};

const stopwords = new Set("a an and are as at be but by can could did do does for from had has have how i if in into is it its may might more most not of on or our should so than that the their them then there these they this those to was we were what when where which who why will with would you your".split(" "));

export function tokenize(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9%]+/g, " ").split(/\s+/).filter(token => token.length > 1 && !stopwords.has(token));
}

function timeToSeconds(timestamp: string) {
  const parts = timestamp.split(":").map(Number);
  return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
}

function slug(value: string) {
  return value.toLowerCase().replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "transcript";
}

function splitLongText(text: string, max = 1100, overlap = 180) {
  if (text.length <= max) return [text];
  const parts: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    let end = Math.min(cursor + max, text.length);
    if (end < text.length) {
      const boundary = Math.max(text.lastIndexOf(". ", end), text.lastIndexOf("\n", end));
      if (boundary > cursor + max * .55) end = boundary + 1;
    }
    parts.push(text.slice(cursor, end).trim());
    if (end >= text.length) break;
    cursor = Math.max(cursor + 1, end - overlap);
  }
  return parts.filter(Boolean);
}

export function parseTranscript(filename: string, raw: string): { record: TranscriptRecord; chunks: TranscriptChunk[] } {
  const text = raw.replace(/\r\n?/g, "\n").replace(/\u0000/g, "").trim();
  const lines = text.split("\n");
  const expertLine = lines.find(line => /^\s*Expert\s*\d*\s*[–—-]/i.test(line));
  const roleLine = lines.find(line => /^\s*Role\s*:/i.test(line));
  const marketLine = lines.find(line => /^\s*Market\s*:/i.test(line));
  const title = expertLine?.replace(/^\s*Expert\s*\d*\s*[–—-]\s*/i, "").trim() || filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
  const defaultSpeaker = title;
  const market = marketLine?.replace(/^\s*Market\s*:\s*/i, "").trim();
  const transcriptId = `${slug(filename)}-${hash(text).slice(0, 7)}`;
  const turns: { timestamp: string; speaker: string; content: string }[] = [];
  let timestamp = "00:00", speaker = defaultSpeaker, buffer: string[] = [];

  const flush = () => {
    const content = buffer.join(" ").replace(/\s+/g, " ").trim();
    if (content) turns.push({ timestamp, speaker, content });
    buffer = [];
  };

  for (const sourceLine of lines) {
    const line = sourceLine.trim();
    if (!line || line === expertLine || line === roleLine || line === marketLine) { if (!line) flush(); continue; }
    const subtitleTime = line.match(/^((?:\d{1,2}:)?\d{1,2}:\d{2})(?:[.,]\d{3})?\s*-->\s*/);
    if (subtitleTime) { flush(); timestamp = subtitleTime[1].split(":").map(part => part.padStart(2, "0")).join(":"); continue; }
    if (/^\d+$/.test(line) || /^WEBVTT$/i.test(line)) continue;
    const timeMatch = line.match(/^\s*[[(]?((?:\d{1,2}:)?\d{1,2}:\d{2})[\])]?\s*(.*)$/);
    if (timeMatch) {
      flush(); timestamp = timeMatch[1].split(":").map(part => part.padStart(2, "0")).join(":");
      const remainder = timeMatch[2].trim();
      if (remainder) {
        const speakerMatch = remainder.match(/^([^:]{1,80}):\s*(.+)$/);
        if (speakerMatch) { speaker = speakerMatch[1].trim(); buffer.push(speakerMatch[2]); } else buffer.push(remainder);
      }
      continue;
    }
    const speakerMatch = line.match(/^([^:]{1,80}):\s*(.+)$/);
    if (speakerMatch) { flush(); speaker = speakerMatch[1].trim(); buffer.push(speakerMatch[2]); }
    else buffer.push(line);
  }
  flush();

  if (!turns.length && text) {
    text.split(/\n\s*\n/).filter(Boolean).forEach((paragraph, index) => turns.push({ timestamp: `P${index + 1}`, speaker: defaultSpeaker, content: paragraph.replace(/\s+/g, " ").trim() }));
  }

  const chunks: TranscriptChunk[] = [];
  turns.forEach((turn, turnIndex) => splitLongText(turn.content).forEach((content, partIndex) => {
    const id = `${transcriptId}-${turnIndex + 1}-${partIndex + 1}`;
    chunks.push({ id, transcriptId, filename, title, speaker: turn.speaker, market, timestamp: turn.timestamp, startSeconds: turn.timestamp.startsWith("P") ? turnIndex : timeToSeconds(turn.timestamp), content, tokens: tokenize(`${title} ${market || ""} ${turn.speaker} ${content}`) });
  }));

  return { record: { id: transcriptId, filename, title, market, chunkCount: chunks.length, characterCount: text.length, createdAt: new Date().toISOString() }, chunks };
}

function hash(value: string) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

const store = { transcripts: new Map<string, TranscriptRecord>(), chunks: new Map<string, TranscriptChunk>() };

export function ingestTranscript(filename: string, text: string) {
  const parsed = parseTranscript(filename, text);
  store.transcripts.set(parsed.record.id, parsed.record);
  parsed.chunks.forEach(chunk => store.chunks.set(chunk.id, chunk));
  return parsed.record;
}

export function corpusSummary() {
  const transcripts = [...store.transcripts.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { transcripts, transcriptCount: transcripts.length, chunkCount: store.chunks.size, characterCount: transcripts.reduce((sum, t) => sum + t.characterCount, 0) };
}

export function clearCorpus() {
  store.transcripts.clear();
  store.chunks.clear();
}

export function retrieve(queries: string[], limit = 14) {
  const chunks = [...store.chunks.values()];
  const documentFrequency = new Map<string, number>();
  chunks.forEach(chunk => new Set(chunk.tokens).forEach(token => documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1)));
  const avgLength = chunks.reduce((sum, chunk) => sum + chunk.tokens.length, 0) / Math.max(chunks.length, 1);
  const scores = new Map<string, number>();

  queries.forEach((query, queryIndex) => {
    const queryTokens = tokenize(query), phrase = query.toLowerCase().trim();
    chunks.forEach(chunk => {
      const frequencies = new Map<string, number>();
      chunk.tokens.forEach(token => frequencies.set(token, (frequencies.get(token) || 0) + 1));
      let score = 0;
      queryTokens.forEach(token => {
        const tf = frequencies.get(token) || 0;
        if (!tf) return;
        const idf = Math.log(1 + (chunks.length - (documentFrequency.get(token) || 0) + .5) / ((documentFrequency.get(token) || 0) + .5));
        score += idf * (tf * 2.2) / (tf + 1.2 * (.25 + .75 * chunk.tokens.length / Math.max(avgLength, 1)));
      });
      if (phrase.length > 5 && chunk.content.toLowerCase().includes(phrase)) score += 8;
      scores.set(chunk.id, (scores.get(chunk.id) || 0) + score / (queryIndex + 1));
    });
  });

  const ranked = chunks.map(chunk => ({ chunk, score: scores.get(chunk.id) || 0 })).filter(row => row.score > 0).sort((a, b) => b.score - a.score);
  const selected: typeof ranked = [], perTranscript = new Map<string, number>();
  for (const row of ranked) {
    if ((perTranscript.get(row.chunk.transcriptId) || 0) >= 4) continue;
    selected.push(row); perTranscript.set(row.chunk.transcriptId, (perTranscript.get(row.chunk.transcriptId) || 0) + 1);
    if (selected.length >= limit) break;
  }
  if (selected.length < Math.min(limit, ranked.length)) for (const row of ranked) { if (!selected.includes(row)) selected.push(row); if (selected.length >= limit) break; }
  return selected;
}

export function getChunks(ids: string[]) { return ids.map(id => store.chunks.get(id)).filter((value): value is TranscriptChunk => Boolean(value)); }

export function getAllChunks() { return [...store.chunks.values()]; }
