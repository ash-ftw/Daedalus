import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

function Root() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  if (token) {
    window.localStorage.setItem("daedalus.authToken", token);
  }

  return <App />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<Root />);
