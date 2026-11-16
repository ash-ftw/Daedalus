import { useState } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { LandingPage } from "./components/LandingPage";
import { AuthScreen } from "./components/AuthScreen";
import "./styles.css";
import "./landing.css";

type View = "landing" | "signin" | "signup" | "app";

function Root() {
  const params = new URLSearchParams(window.location.search);
  const hasToken = !!window.localStorage.getItem("daedalus.authToken") || !!params.get("token");
  const hasRoom = !!params.get("room");
  const isDirectApp = window.location.pathname.startsWith("/app") || window.location.pathname.startsWith("/board");
  const [view, setView] = useState<View>(hasToken || hasRoom || isDirectApp ? "app" : "landing");

  if (view === "landing") {
    return (
      <LandingPage
        onGetStarted={() => setView("signup")}
        onSignIn={() => setView("signin")}
      />
    );
  }

  if (view === "signin" || view === "signup") {
    return (
      <AuthScreen
        mode={view === "signin" ? "signin" : "signup"}
        onBack={() => setView("landing")}
        onSuccess={() => setView("app")}
      />
    );
  }

  return <App />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<Root />);
