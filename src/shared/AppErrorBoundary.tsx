import { Component, type ErrorInfo, type ReactNode } from "react";

interface AppErrorBoundaryProps {
  children: ReactNode;
  scope: "工作区" | "文档";
}

interface AppErrorBoundaryState { failed: boolean }

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): AppErrorBoundaryState { return { failed: true }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`${this.props.scope}渲染失败`, error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="workspace-loading" role="alert">
        <strong>{this.props.scope}暂时无法显示</strong>
        <span>请刷新页面后重试，已保存的数据不会受影响。</span>
        <button type="button" className="primary-button" onClick={() => window.location.reload()}>刷新页面</button>
      </main>
    );
  }
}
