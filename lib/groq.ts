export const GROQ_MODEL = "qwen/qwen3.8-27b";

export async function groqJson(system: string, user: string, maxCompletionTokens = 900) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("The AI connection has not been configured.");
  const options = { method: "POST", headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: GROQ_MODEL, temperature: .1, max_completion_tokens: maxCompletionTokens, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: user }] }) };
  let response = await fetch("https://api.groq.com/openai/v1/chat/completions", options);
  if (response.status === 429) {
    const retrySeconds = Math.min(Number(response.headers.get("retry-after") || 4), 12);
    await new Promise(resolve => setTimeout(resolve, retrySeconds * 1000));
    response = await fetch("https://api.groq.com/openai/v1/chat/completions", options);
  }
  if (!response.ok) {
    const detail = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(response.status === 429 ? "The free AI allowance is temporarily busy. Please try again shortly." : detail.error?.message || "The AI service could not complete the analysis.");
  }
  const data = await response.json() as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content || "{}";
  return JSON.parse(content.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim()) as Record<string, unknown>;
}
