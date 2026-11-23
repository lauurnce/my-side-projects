"use client";

import { Component, type ReactNode } from "react";
import styles from "./screen.module.css";

type PostBoundaryProps = { body: string; children: ReactNode };

type PostBoundaryState = { body: string; failed: boolean };

export class PostBoundary extends Component<PostBoundaryProps, PostBoundaryState> {
  state: PostBoundaryState = { body: this.props.body, failed: false };

  static getDerivedStateFromProps(props: PostBoundaryProps, state: PostBoundaryState): PostBoundaryState | null {
    return props.body === state.body ? null : { body: props.body, failed: false };
  }

  static getDerivedStateFromError(): Partial<PostBoundaryState> {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <p className={styles.plain} dir="auto">
        {this.props.body}
      </p>
    );
  }
}
