import { createRoot } from "react-dom/client";
import React, { Component, ErrorInfo, ReactNode } from "react";
import App from "./App.tsx";
import "./index.css";

// ── Patch de imunidade contra Google Translate / extensões DOM ──────────────
// O Google Tradutor altera os nós de texto criando <font> e removendo referências nativas.
// Quando o React tenta executar `removeChild` ou `insertBefore`, o navegador lança
// `NotFoundError: The node to be removed is not a child of this node`.
// Este patch intercepta e previne o crash completo da aplicação.
if (typeof window !== "undefined") {
  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(child: T): T {
    if (child.parentNode !== this) {
      if (console) {
        console.warn(
          "Node.removeChild impediu crash de nó modificado por tradutor externo:",
          child,
          this
        );
      }
      return child;
    }
    return originalRemoveChild.apply(this, arguments as any);
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(
    newNode: T,
    referenceNode: Node | null
  ): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      if (console) {
        console.warn(
          "Node.insertBefore contornou nó de referência modificado por tradutor externo:",
          newNode,
          referenceNode,
          this
        );
      }
      return originalInsertBefore.call(this, newNode, null);
    }
    return originalInsertBefore.apply(this, arguments as any);
  };
}

class ErrorBoundary extends Component<{children: ReactNode}, {hasError: boolean, error: Error | null}> {
  constructor(props: {children: ReactNode}) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "20px", color: "red", backgroundColor: "#fee" }}>
          <h1>Something went wrong.</h1>
          <pre>{this.state.error?.toString()}</pre>
          <pre>{this.state.error?.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
