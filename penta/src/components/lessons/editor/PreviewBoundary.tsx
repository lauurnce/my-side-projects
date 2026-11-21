"use client";

import { Component, type ReactNode } from "react";

type PreviewBoundaryProps = {
  text: string;
  children: ReactNode;
};

type PreviewBoundaryState = {
  text: string;
  failed: boolean;
};

export class PreviewBoundary extends Component<PreviewBoundaryProps, PreviewBoundaryState> {
  state: PreviewBoundaryState = { text: this.props.text, failed: false };

  static getDerivedStateFromProps(
    props: PreviewBoundaryProps,
    state: PreviewBoundaryState,
  ): PreviewBoundaryState | null {
    return props.text === state.text ? null : { text: props.text, failed: false };
  }

  static getDerivedStateFromError(): Partial<PreviewBoundaryState> {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return <p role="alert">The preview could not be shown. Your text is safe.</p>;
    return this.props.children;
  }
}
