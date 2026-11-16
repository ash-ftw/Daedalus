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
  const token = params.get("token");
  if (token) {
    window.localStorage.setItem("daedalus.authToken", token);
  }

  const hasRoom = !!params.get("room");
  const isDirectBoard = window.location.pathname.startsWith("/app") || window.location.pathname.startsWith("/board");

  // If URL explicitly targets a room or /board, launch straight into the canvas;
  // otherwise, greet the user with the clean Studio MACACO landing page.
  const [view, setView] = useState<View>(hasRoom || isDirectBoard ? "app" : "landing");

  if (view === "landing") {
    return (
      <LandingPage
        onGetStarted={() => setView("app")}
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
