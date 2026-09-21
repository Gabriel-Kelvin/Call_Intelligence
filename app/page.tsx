"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { ArrowRight, BookOpenText, Check, CircleAlert, Database, FileText, MessageSquareText, Sparkles, Trash2, UploadCloud, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type RagCitation = { evidenceId: string; filename: string; title: string; speaker: string; market?: string; timestamp: string; quote: string };
type ChatResponse = { answer: string; citations: RagCitation[]; model?: string; confidence?: string; retrieval?: { queries: string[]; candidates: number; selected?: number; cited?: number; strategy?: string } };
type CorpusSummary = { transcripts: { id: string; filename: string; title: string; market?: string; chunkCount: number; characterCount: number }[]; transcriptCount: number; chunkCount: number; characterCount: number };
type InsightItem = { title: string; summary: string; citations: RagCitation[] };
type InsightsResult = { themes: InsightItem[]; disagreements: InsightItem[]; transcriptCount: number; chunkCount: number };
type GuideResult = { title: string; questions: string[]; answers: { question: string; responses: { transcriptId: string; expert: string; market?: string; answer: string; confidence: string; citations: RagCitation[] }[] }[] };

function Guide() {
  const [result, setResult] = useState<GuideResult | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState("");
  async function processGuide(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/guide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: await file.text() }) });
      const body = await response.json() as GuideResult & { error?: string }; if (!response.ok) throw new Error(body.error); setResult(body);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The guide could not be answered."); } finally { setLoading(false); event.target.value = ""; }
  }
  return <div className="stack guide-live">
    <Intro eyebrow="Live interview guide" title="Upload questions. Generate cited answers." copy="The guide is parsed at runtime, and every question is answered separately for each expert using only their transcript evidence." badge={result ? `${result.questions.length} questions answered` : "Waiting for guide"} />
    <section className={`guide-drop ${loading ? "processing" : ""}`}><div><i><BookOpenText /></i><span><strong>{loading ? "Answering the interview guide…" : "Upload interview questions"}</strong><small>TXT or Markdown · numbered, bulleted or plain questions</small></span></div><label>{loading ? <><span className="spinner dark" />Generating answers</> : "Choose guide"}<input type="file" accept=".txt,.md,text/plain,text/markdown" onChange={processGuide} disabled={loading} /></label></section>
    {loading && <div className="guide-progress"><span /><p>Retrieving evidence for each question, separating experts, and validating citations…</p></div>}
    {error && <div className="error"><CircleAlert /><div><strong>Guide analysis unavailable</strong><p>{error}</p></div></div>}
    {!loading && !result && !error && <EmptyState icon={<BookOpenText />} title="Your answers will be generated here" copy="Upload the supplied interview guide after the transcripts finish processing. Nothing on this screen is prewritten." />}
    {result && <section className="generated-guide"><header><div><Sparkles /><span><strong>{result.title}</strong><small>Generated from the live corpus</small></span></div><b>{result.answers.reduce((count, item) => count + item.responses.length, 0)} cited answers</b></header>{result.answers.map((item, index) => <article key={item.question}><div className="guide-question"><em>{String(index + 1).padStart(2, "0")}</em><h2>{item.question}</h2></div><div className="expert-answers">{item.responses.length ? item.responses.map(response => <div key={response.transcriptId}><header><span>{response.expert}</span><b>{response.market || response.confidence}</b></header><p>{response.answer}</p><footer>{response.citations.map(source => <RagSource key={source.evidenceId} source={source} />)}</footer></div>) : <p className="no-evidence">No supporting evidence found in the uploaded calls.</p>}</div></article>)}</section>}
  </div>;
}

function Intro({ eyebrow, title, copy, badge }: { eyebrow: string; title: string; copy: string; badge: string }) {
  return <section className="intro"><div><label>{eyebrow}</label><h1>{title}</h1><p>{copy}</p></div><aside><Check />{badge}</aside></section>;
}

function Synthesis({ insights }: { insights: InsightsResult | null }) {
  return <div className="stack">
    <Intro eyebrow="Generated cross-call synthesis" title="Where the experts align and diverge." copy="Insights are created after ingestion from the uploaded calls, with exact evidence attached to every theme and disagreement." badge={insights ? `${insights.transcriptCount} calls compared` : "Waiting for transcripts"} />
    {!insights && <EmptyState icon={<Users />} title="Insights have not been generated yet" copy="Upload the transcript corpus first. The pipeline will generate this view automatically when chunking is complete." />}
    {insights && <>
    <SectionTitle icon={<Check />} title="Common themes" copy="Repeated independently across the interviews" />
    <div className="theme-grid">{insights.themes.map((item, i) => <article className="theme live-theme" key={item.title}><header><span>0{i + 1}</span><b>{new Set(item.citations.map(c => c.filename)).size} calls</b></header><h3>{item.title}</h3><p>{item.summary}</p><footer>{item.citations.map(source => <RagSource key={source.evidenceId} source={source} />)}</footer></article>)}</div>
    <SectionTitle icon={<CircleAlert />} title="Meaningful disagreements" copy="Different conclusions, not contradictions" warn />
    <div className="disagreements live-disagreements">{insights.disagreements.length ? insights.disagreements.map(item => <article key={item.title}><h3>{item.title}</h3><p>{item.summary}</p><footer>{item.citations.map(source => <RagSource key={source.evidenceId} source={source} />)}</footer></article>) : <p className="no-evidence">No well-supported disagreement was found across these calls.</p>}</div>
    </>}
  </div>;
}

function EmptyState({ icon, title, copy }: { icon: React.ReactNode; title: string; copy: string }) {
  return <section className="empty-state"><i>{icon}</i><h2>{title}</h2><p>{copy}</p></section>;
}

function SectionTitle({ icon, title, copy, warn }: { icon: React.ReactNode; title: string; copy: string; warn?: boolean }) {
  return <div className={`section-title ${warn ? "warn" : ""}`}><i>{icon}</i><div><h2>{title}</h2><p>{copy}</p></div></div>;
}

const suggestions = ["What matters most in a purchase decision?", "Compare expected growth across markets", "Is training or funding the bigger barrier?"];

function RagSource({ source }: { source: RagCitation }) {
  const initials = (source.speaker || source.title).replace(/^(dr|mr|mrs|ms|prof)\.?\s+/i, "").split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();
  return <details className="rag-source"><summary><span>{initials}</span><b>{source.market || source.title}</b><time>{source.timestamp}</time><ArrowRight /></summary><div><small>{source.filename} · {source.speaker}</small><blockquote>“{source.quote}”</blockquote><p><Check />Exact stored excerpt</p></div></details>;
}

function Corpus({ onInsights, onClear }: { onInsights: (result: InsightsResult | null) => void; onClear: () => void }) {
  const [summary, setSummary] = useState<CorpusSummary | null>(null), [uploading, setUploading] = useState(false), [clearing, setClearing] = useState(false), [message, setMessage] = useState(""), [stage, setStage] = useState<"idle" | "uploading" | "chunking" | "insights" | "done">("idle");
  useEffect(() => { fetch("/api/corpus").then(async r => await r.json() as CorpusSummary).then(setSummary).catch(() => setMessage("Could not read the corpus.")); }, []);
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files || [])]; if (!files.length) return;
    setUploading(true); setMessage(""); setStage("uploading");
    try {
      const transcripts = await Promise.all(files.map(async file => ({ filename: file.name, text: await file.text() })));
      setStage("chunking");
      const response = await fetch("/api/corpus", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcripts }) });
      const body = await response.json() as CorpusSummary & { error?: string }; if (!response.ok) throw new Error(body.error); setSummary(body); setStage("insights");
      const insightResponse = await fetch("/api/insights", { method: "POST" });
      const insightBody = await insightResponse.json() as InsightsResult & { error?: string }; if (!insightResponse.ok) throw new Error(insightBody.error); onInsights(insightBody); setStage("done"); setMessage(`${files.length} transcript${files.length > 1 ? "s" : ""} processed. Cross-call insights are ready.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Upload failed."); setStage("idle"); } finally { setUploading(false); event.target.value = ""; }
  }
  async function clearAll() {
    if (!window.confirm("Delete all uploaded transcripts and generated corpus data?")) return;
    setClearing(true); setMessage("");
    try {
      const response = await fetch("/api/corpus", { method: "DELETE" });
      const body = await response.json() as CorpusSummary & { error?: string }; if (!response.ok) throw new Error(body.error);
      setSummary(body); onInsights(null); onClear(); setStage("idle"); setMessage("Corpus deleted.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The corpus could not be deleted."); } finally { setClearing(false); }
  }
  const status = stage === "uploading" ? ["Reading selected files", "Checking file types and preparing the transcripts."] : stage === "chunking" ? ["Reading the transcripts", "Finding speakers, timestamps and exact supporting passages."] : ["Generating cross-call insights", "Comparing the calls and validating supporting evidence."];
  return <div className="stack corpus-view"><Intro eyebrow="Transcript pipeline" title="Bring any call. Ask anything grounded." copy="Upload timestamped or plain-text transcripts. Signal parses the structure, creates evidence-preserving chunks and makes them immediately searchable." badge={`${summary?.chunkCount || 0} evidence chunks`} />
    <section className="upload-panel"><div><i><UploadCloud /></i><h2>Add transcripts</h2><p>TXT, MD, VTT or SRT · up to 20 files and 2 MB each</p></div><label className="upload-button">{uploading ? "Indexing…" : "Choose files"}<input type="file" accept=".txt,.md,.vtt,.srt,text/plain,text/markdown" multiple onChange={upload} disabled={uploading} /></label></section>
    {uploading && <section className="processing-status" aria-live="polite"><span className="processing-orbit"><i /><i /><i /></span><div><strong>{status[0]}</strong><p>{status[1]}</p></div></section>}
    {message && <div className="pipeline-message"><Check />{message}</div>}
    <section className="corpus-list"><header><div><Database /><span><strong>Indexed corpus</strong><small>{summary?.transcriptCount || 0} transcripts · {summary?.characterCount.toLocaleString() || 0} characters</small></span></div>{Boolean(summary?.transcriptCount) && <button className="clear-corpus" type="button" onClick={clearAll} disabled={clearing || uploading}><Trash2 />{clearing ? "Deleting…" : "Delete corpus"}</button>}</header><div>{summary?.transcripts.map(item => <article key={item.id}><FileText /><span><strong>{item.title}</strong><small>{item.filename}{item.market ? ` · ${item.market}` : ""}</small></span><b>{item.chunkCount} chunks</b></article>)}</div></section>
  </div>;
}

function Ask() {
  const [question, setQuestion] = useState(""), [result, setResult] = useState<ChatResponse | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState("");
  async function ask(event?: FormEvent, preset?: string) {
    event?.preventDefault(); const q = (preset || question).trim(); if (!q || loading) return;
    setQuestion(q); setLoading(true); setError(""); setResult(null);
    try { const response = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q }) }); const json = await response.json() as ChatResponse & { error?: string }; if (!response.ok) throw new Error(json.error); setResult(json); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not analyse the calls."); } finally { setLoading(false); }
  }
  return <div className="ask-layout"><section className="ask-main"><div className="spark"><Sparkles /></div><label>Ask across all calls</label><h1>Turn conversations into one clear answer.</h1><p>Answers use only the indexed transcripts. Claims without supporting evidence are left out.</p>
    <form onSubmit={ask}><Textarea value={question} onChange={e => setQuestion(e.target.value)} placeholder="Ask about adoption, economics, training, outlook…" /><Button disabled={!question.trim() || loading}>{loading ? <><span className="spinner" />Analysing calls</> : <>Ask the transcripts <ArrowRight /></>}</Button></form>
    <div className="suggestions"><span>Try asking</span>{suggestions.map(s => <button onClick={() => ask(undefined, s)} key={s}>{s}</button>)}</div>
    {error && <div className="error"><CircleAlert /><div><strong>Analysis unavailable</strong><p>{error}</p></div></div>}
    {result && <article className="result"><header><Sparkles />Evidence-backed answer <small>{result.confidence} confidence · {result.model}</small></header><p>{result.answer}</p><div className="retrieval-trace"><span>{result.retrieval?.candidates || 0} retrieved → {result.retrieval?.selected || 0} reranked</span><span>{result.retrieval?.queries?.length || 1} query paths</span><span>{result.retrieval?.strategy || "hybrid retrieval"}</span></div><footer><label>Verified sources used</label><div className="rag-sources">{result.citations.map(c => <RagSource key={c.evidenceId} source={c} />)}</div></footer></article>}
  </section><aside className="ask-aside"><div className="guard"><i><Check /></i><h3>Grounded by design</h3><p>The model receives only retrieved transcript evidence and must return verified source IDs.</p><ul><li>No outside knowledge</li><li>Exact-quote validation</li><li>Timestamped sources</li></ul></div><div className="corpus"><FileText /><span>Research corpus</span><strong>Live indexed workspace</strong><p>Built from the transcripts uploaded in this session</p></div></aside></div>;
}

export default function Home() {
  const [insights, setInsights] = useState<InsightsResult | null>(null);
  const [workspaceVersion, setWorkspaceVersion] = useState(0);
  return <main>
    <Tabs defaultValue="corpus"><div className="nav"><TabsList variant="line"><TabsTrigger value="corpus"><Database />1. Corpus</TabsTrigger><TabsTrigger value="synthesis"><Users />2. Cross-call insights</TabsTrigger><TabsTrigger value="guide"><BookOpenText />3. Interview guide</TabsTrigger><TabsTrigger value="ask"><MessageSquareText />4. Ask transcripts</TabsTrigger></TabsList><span><i />Live analysis workspace</span></div>
      <div className="content"><TabsContent value="corpus"><Corpus onInsights={setInsights} onClear={() => setWorkspaceVersion(version => version + 1)} /></TabsContent><TabsContent value="synthesis"><Synthesis insights={insights} /></TabsContent><TabsContent value="guide"><Guide key={`guide-${workspaceVersion}`} /></TabsContent><TabsContent value="ask"><Ask key={`ask-${workspaceVersion}`} /></TabsContent></div>
    </Tabs>
  </main>;
}
