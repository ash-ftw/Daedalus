import { useState } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { LandingPage } from "./components/LandingPage";
import { AuthScreen } from "./components/AuthScreen";
import "./styles.css";
import "./landing.css";

type View = "landing" | "signin" | "signup" | "app";

function Root() {
  const hasToken = !!window.localStorage.getItem("daedalus.authToken");
  const [view, setView] = useState<View>(hasToken ? "app" : "landing");

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
