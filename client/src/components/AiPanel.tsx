import { AlertTriangle, Bot, CheckCircle2, Lightbulb, MessageSquare, ScanSearch, Sparkles, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { AnalysisIssue, AnalysisResult, ChatMessage } from "../../../shared/src/types";

interface AiPanelProps {
  analysis: AnalysisResult | null;
  chat: ChatMessage[];
  dismissedIssues: Set<string>;
  highlightEnabled: boolean;
  isAnalyzing: boolean;
  isGeneratingDiagram: boolean;
  onAcceptSuggestion: (issue: AnalysisIssue) => void;
  onAnalyze: () => void;
  onChat: (message: string) => void;
  onGenerateDiagram: (prompt: string) => Promise<void>;
  onDismissIssue: (issueId: string) => void;
  onToggleHighlight: () => void;
}

type PanelTab = "build" | "explain" | "correct" | "chat";

const severityLabel = {
  error: "Error",
  warning: "Warning",
  suggestion: "Suggestion"
};

export function AiPanel({
  analysis,
  chat,
  dismissedIssues,
  highlightEnabled,
  isAnalyzing,
  isGeneratingDiagram,
  onAcceptSuggestion,
  onAnalyze,
  onChat,
  onGenerateDiagram,
  onDismissIssue,
  onToggleHighlight
}: AiPanelProps) {
  const [tab, setTab] = useState<PanelTab>("build");
  const [draft, setDraft] = useState("");
  const [diagramPrompt, setDiagramPrompt] = useState("");
  const visibleIssues = useMemo(
    () => (analysis?.issues ?? []).filter((issue) => !dismissedIssues.has(issue.id)),
    [analysis?.issues, dismissedIssues]
  );

  const submitDiagramPrompt = async (event: FormEvent) => {
    event.preventDefault();
    const prompt = diagramPrompt.trim();

    if (!prompt || isGeneratingDiagram) {
      return;
    }

    await onGenerateDiagram(prompt);
    setDiagramPrompt("");
  };

  const submitChat = (event: FormEvent) => {
    event.preventDefault();
    const message = draft.trim();

    if (!message) {
      return;
    }

    onChat(message);
    setDraft("");
  };

  return (
    <aside className="ai-panel" aria-label="AI panel">
      <div className="panel-header">
        <div>
          <span className="panel-kicker">AI Studio</span>
          <h2>{analysis?.diagramType ?? "Waiting for canvas"}</h2>
        </div>
        <button className="icon-button" onClick={onAnalyze} title="Analyze now" type="button">
          <ScanSearch size={18} />
        </button>
      </div>

      <div className="tab-list" role="tablist">
        <button className={tab === "build" ? "active" : ""} onClick={() => setTab("build")} type="button">
          Build
        </button>
        <button className={tab === "explain" ? "active" : ""} onClick={() => setTab("explain")} type="button">
          Explain
        </button>
        <button className={tab === "correct" ? "active" : ""} onClick={() => setTab("correct")} type="button">
          Correct
          {visibleIssues.length > 0 ? <span>{visibleIssues.length}</span> : null}
        </button>
        <button className={tab === "chat" ? "active" : ""} onClick={() => setTab("chat")} type="button">
          Chat
        </button>
      </div>

      {isAnalyzing ? <div className="analysis-status">Analyzing current canvas...</div> : null}
      {isGeneratingDiagram ? <div className="analysis-status">Building diagram...</div> : null}

      {tab === "build" ? (
        <div className="panel-body">
          <form className="diagram-build-form" onSubmit={submitDiagramPrompt}>
            <label htmlFor="diagram-prompt">Prompt</label>
            <textarea
              id="diagram-prompt"
              maxLength={2000}
              onChange={(event) => setDiagramPrompt(event.target.value)}
              placeholder="Customer signup flow with email verification and billing decision"
              value={diagramPrompt}
            />
            <button className="wide-button primary" disabled={isGeneratingDiagram || !diagramPrompt.trim()} type="submit">
              <Sparkles size={16} />
              {isGeneratingDiagram ? "Building..." : "Build diagram"}
            </button>
          </form>
        </div>
      ) : null}

      {tab === "explain" ? (
        <div className="panel-body">
          {analysis ? (
            <>
              <div className="confidence-card">
                <span>{analysis.confidence}% confidence</span>
                <strong>{analysis.summary}</strong>
                <meter max="100" min="0" value={analysis.confidence} />
              </div>

              <button className={highlightEnabled ? "wide-button active" : "wide-button"} onClick={onToggleHighlight} type="button">
                <Lightbulb size={16} />
                Highlight on canvas
              </button>

              <section className="panel-section">
                <h3>Components</h3>
                <div className="component-list">
                  {analysis.components.length > 0 ? (
                    analysis.components.map((component) => (
                      <article className="component-row" key={component.id}>
                        <CheckCircle2 size={16} />
                        <div>
                          <strong>{component.label}</strong>
                          <p>{component.description}</p>
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className="empty-copy">Draw or place shapes to get component-level feedback.</p>
                  )}
                </div>
              </section>

              <section className="panel-section">
                <h3>Hints</h3>
                {analysis.hints.map((hint) => (
                  <p className="hint" key={hint}>
                    {hint}
                  </p>
                ))}
              </section>
            </>
          ) : (
            <div className="empty-state">
              <Bot size={28} />
              <p>Draw for a few seconds or use Analyze Now.</p>
            </div>
          )}
        </div>
      ) : null}

      {tab === "correct" ? (
        <div className="panel-body">
          {visibleIssues.length > 0 ? (
            visibleIssues.map((issue) => (
              <article className={`issue-card ${issue.severity}`} key={issue.id}>
                <div className="issue-heading">
                  <AlertTriangle size={17} />
                  <div>
                    <span>{severityLabel[issue.severity]}</span>
                    <strong>{issue.title}</strong>
                  </div>
                  <button className="ghost-icon" onClick={() => onDismissIssue(issue.id)} title="Dismiss" type="button">
                    <X size={16} />
                  </button>
                </div>
                <p>{issue.explanation}</p>
                <details>
                  <summary>Why?</summary>
                  <ReactMarkdown>{issue.why}</ReactMarkdown>
                </details>
                <div className="issue-actions">
                  <button className="small-button primary" onClick={() => onAcceptSuggestion(issue)} type="button">
                    Accept suggestion
                  </button>
                  <button className="small-button" onClick={() => onDismissIssue(issue.id)} type="button">
                    Dismiss
                  </button>
                </div>
              </article>
            ))
          ) : (
            <div className="empty-state">
              <CheckCircle2 size={28} />
              <p>No active correction suggestions.</p>
            </div>
          )}
        </div>
      ) : null}

      {tab === "chat" ? (
        <div className="panel-body chat-body">
          <div className="chat-log">
            {chat.length > 0 ? (
              chat.map((message) => (
                <article className={`chat-message ${message.sender}`} key={message.id}>
                  <span>{message.authorName}</span>
                  <p>{message.content}</p>
                </article>
              ))
            ) : (
              <div className="empty-state">
                <MessageSquare size={28} />
                <p>Ask the AI about the current diagram.</p>
              </div>
            )}
          </div>
          <form className="chat-form" onSubmit={submitChat}>
            <input
              aria-label="Ask AI about this diagram"
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask about this diagram..."
              value={draft}
            />
            <button className="small-button primary" type="submit">
              Send
            </button>
          </form>
        </div>
      ) : null}
    </aside>
  );
}
