import { CheckCircle2, Code2, Languages, RefreshCw, Wand2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type {
  AnalysisResult,
  CanvasOperation,
  GeneratedArtifact,
  InstitutionTuningProfile,
  LanguageCode,
  LayoutSuggestion
} from "../../../shared/src/types";
import { API_URL } from "../hooks/useBoardSocket";

const languageOptions: Array<{ value: LanguageCode; label: string }> = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "hi", label: "Hindi" },
  { value: "zh", label: "Mandarin" }
];

interface EnhancementsPanelProps {
  open: boolean;
  preferredLanguage: LanguageCode;
  authToken: string;
  clientId: string;
  roomId: string;
  userId: string;
  onApplyOperation: (operation: CanvasOperation) => void;
  onClose: () => void;
  onLanguageChange: (language: LanguageCode) => void;
  onToast: (message: string) => void;
}

export function EnhancementsPanel({
  open,
  preferredLanguage,
  authToken,
  clientId,
  roomId,
  userId,
  onApplyOperation,
  onClose,
  onLanguageChange,
  onToast
}: EnhancementsPanelProps) {
  const [artifact, setArtifact] = useState<GeneratedArtifact | null>(null);
  const [localizedAnalysis, setLocalizedAnalysis] = useState<AnalysisResult | null>(null);
  const [profile, setProfile] = useState<InstitutionTuningProfile | null>(null);
  const [suggestions, setSuggestions] = useState<LayoutSuggestion[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  const fetchLocalizedAnalysis = useCallback(
    async (language: LanguageCode) => {
      const response = await fetch(
        `${API_URL}/api/boards/${encodeURIComponent(roomId)}/localized-analysis?language=${encodeURIComponent(language)}`
      );

      if (!response.ok) {
        throw new Error("Localized analysis failed");
      }

      setLocalizedAnalysis((await response.json()) as AnalysisResult);
    },
    [roomId]
  );

  const refreshLayoutSuggestions = useCallback(async () => {
    const response = await fetch(`${API_URL}/api/boards/${encodeURIComponent(roomId)}/layout-suggestions`);

    if (!response.ok) {
      throw new Error("Layout suggestions failed");
    }

    setSuggestions((await response.json()) as LayoutSuggestion[]);
  }, [roomId]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const load = async () => {
      setStatus("loading");

      try {
        const profileResponse = await fetch(`${API_URL}/api/ai/institution-profile`);
        setProfile((await profileResponse.json()) as InstitutionTuningProfile);
        await Promise.all([refreshLayoutSuggestions(), fetchLocalizedAnalysis(preferredLanguage)]);
        setStatus("idle");
      } catch {
        setStatus("error");
      }
    };

    void load();
  }, [fetchLocalizedAnalysis, open, preferredLanguage, refreshLayoutSuggestions]);

  const generateCode = async () => {
    setStatus("loading");

    try {
      const response = await fetch(`${API_URL}/api/boards/${encodeURIComponent(roomId)}/generated-code`);

      if (!response.ok) {
        throw new Error("Code generation failed");
      }

      setArtifact((await response.json()) as GeneratedArtifact);
      setStatus("idle");
      onToast("Generated implementation artifact");
    } catch {
      setStatus("error");
      onToast("Code generation failed");
    }
  };

  const applyAutoLayout = async () => {
    setStatus("loading");

    try {
      const response = await fetch(`${API_URL}/api/boards/${encodeURIComponent(roomId)}/auto-layout`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ userId, clientId })
      });

      if (!response.ok) {
        throw new Error("Auto-layout failed");
      }

      const operation = (await response.json()) as CanvasOperation;
      onApplyOperation(operation);
      await refreshLayoutSuggestions();
      setStatus("idle");
      onToast("Auto-layout applied");
    } catch {
      setStatus("error");
      onToast("Auto-layout needs more diagram elements");
    }
  };

  const handleLanguageChange = (language: LanguageCode) => {
    onLanguageChange(language);
    void fetchLocalizedAnalysis(language).catch(() => {
      setStatus("error");
      onToast("Localized analysis failed");
    });
  };

  if (!open) {
    return null;
  }

  return (
    <aside className="floating-drawer right enhancements-drawer" aria-label="AI enhancements panel">
      <div className="floating-drawer-header">
        <div>
          <span className="panel-kicker">Phase 4</span>
          <h2>AI Enhancements</h2>
        </div>
        <button className="ghost-icon" onClick={onClose} title="Close enhancements" type="button">
          <X size={17} />
        </button>
      </div>

      <div className="enhancements-body">
        <section className="enhancement-section">
          <div className="section-title-row">
            <h3>Language</h3>
            <Languages size={16} />
          </div>
          <select value={preferredLanguage} onChange={(event) => handleLanguageChange(event.target.value as LanguageCode)}>
            {languageOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {localizedAnalysis ? <p>{localizedAnalysis.summary}</p> : null}
        </section>

        <section className="enhancement-section">
          <div className="section-title-row">
            <h3>Diagram Code</h3>
            <Code2 size={16} />
          </div>
          <button className="wide-button primary" onClick={() => void generateCode()} type="button">
            <Code2 size={16} />
            Generate artifact
          </button>
          {artifact ? (
            <div className="artifact-output">
              <strong>{artifact.title}</strong>
              <span>{artifact.language}</span>
              <pre>{artifact.content}</pre>
              {artifact.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}
        </section>

        <section className="enhancement-section">
          <div className="section-title-row">
            <h3>Auto Layout</h3>
            <Wand2 size={16} />
          </div>
          <div className="drawer-header-actions">
            <button className="small-button" onClick={() => void refreshLayoutSuggestions()} type="button">
              <RefreshCw size={15} />
              Refresh
            </button>
            <button className="small-button primary" onClick={() => void applyAutoLayout()} type="button">
              <Wand2 size={15} />
              Apply
            </button>
          </div>
          <div className="suggestion-list">
            {suggestions.map((suggestion) => (
              <article className={`layout-suggestion ${suggestion.impact}`} key={suggestion.id}>
                <strong>{suggestion.title}</strong>
                <p>{suggestion.description}</p>
                <span>{suggestion.impact} impact</span>
              </article>
            ))}
          </div>
        </section>

        <section className="enhancement-section">
          <div className="section-title-row">
            <h3>Institution Profile</h3>
            <CheckCircle2 size={16} />
          </div>
          {profile ? (
            <>
              <p>{profile.label}</p>
              <div className={profile.configured ? "integration-pill ready inline" : "integration-pill inline"}>
                {profile.configured ? "configured" : "default"}
              </div>
              <ul>
                {profile.rubric.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </>
          ) : null}
        </section>

        {status === "error" ? <div className="analysis-status">AI enhancement request failed.</div> : null}
        {status === "loading" ? <div className="analysis-status">Working on AI enhancement request...</div> : null}
      </div>
    </aside>
  );
}
