import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

type Insight = { id: string; tone: string; title: string; detail: string; href: string };
type Brief = { lead: string; insights: Insight[]; prompts: string[] };
type Answer = { reply: string; tone: "answer" | "guard"; links: { href: string; label: string }[] };
type Turn = { role: "user" | "brief"; text: string; tone?: string; links?: { href: string; label: string }[] };

export function AssistantDock({
  open,
  seed,
  onSeedDone,
  onClose,
}: {
  open: boolean;
  seed: string | null;
  onSeedDone: () => void;
  onClose: () => void;
}) {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const thread = useRef<HTMLDivElement>(null);
  const seeded = useRef<string | null>(null);

  useEffect(() => {
    api<Brief>("/api/assistant/brief")
      .then((data) => {
        setBrief(data);
        setTurns([{ role: "brief", text: data.lead }]);
      })
      .catch((caught) => setTurns([{ role: "brief", text: caught.message, tone: "guard" }]));
  }, []);

  useEffect(() => {
    thread.current?.scrollTo({ top: thread.current.scrollHeight });
  }, [turns, busy]);

  useEffect(() => {
    if (!seed) {
      seeded.current = null;
      return;
    }
    if (seed === seeded.current) return;
    seeded.current = seed;
    void ask(seed);
    onSeedDone();
  }, [seed]);

  async function ask(message: string) {
    const text = message.trim();
    if (!text || busy) return;
    setTurns((current) => [...current, { role: "user", text }]);
    setDraft("");
    setBusy(true);
    try {
      const answer = await api<Answer>("/api/assistant", { method: "POST", body: JSON.stringify({ message: text }) });
      setTurns((current) => [...current, { role: "brief", text: answer.reply, tone: answer.tone, links: answer.links }]);
    } catch (caught) {
      setTurns((current) => [...current, { role: "brief", text: caught instanceof Error ? caught.message : "The brief could not answer.", tone: "guard" }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className={open ? "assistant open" : "assistant"} aria-label="Marigold brief">
      <header className="assistant-head">
        <div>
          <p className="eyebrow">Marigold brief</p>
          <strong>Ask the books</strong>
        </div>
        <button type="button" className="ghost" onClick={onClose} aria-label="Hide brief">
          Hide
        </button>
      </header>
      <div className="assistant-thread" ref={thread}>
        {turns.map((turn, index) => (
          <article key={`${turn.role}-${index}`} className={`bubble ${turn.role} ${turn.tone || ""}`}>
            <p>{turn.text}</p>
            {turn.links && turn.links.length > 0 ? (
              <div className="bubble-links">
                {turn.links.map((link) => (
                  <Link key={link.href + link.label} to={link.href}>
                    {link.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </article>
        ))}
        {busy ? <p className="bubble brief waiting">Reading the books…</p> : null}
      </div>
      {brief ? (
        <div className="prompts">
          {brief.prompts.map((prompt) => (
            <button key={prompt} type="button" onClick={() => ask(prompt)} disabled={busy}>
              {prompt}
            </button>
          ))}
        </div>
      ) : null}
      <form
        className="assistant-ask"
        onSubmit={(event) => {
          event.preventDefault();
          void ask(draft);
        }}
      >
        <label className="sr" htmlFor="brief-ask">
          Ask Marigold
        </label>
        <input
          id="brief-ask"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask about people, leave, or pay"
          maxLength={500}
        />
        <button className="primary" type="submit" disabled={busy || !draft.trim()}>
          Ask
        </button>
      </form>
      <p className="assistant-foot">Answers come from Meridian’s records. This is not a general chat model.</p>
    </aside>
  );
}
