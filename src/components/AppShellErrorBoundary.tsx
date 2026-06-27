import { GlobalErrorPage } from "@/components/GlobalErrorPage"
import { Component, type ReactNode } from "react"

type AppShellErrorBoundaryProps = {
  children: ReactNode
  resetKey: string
}

type AppShellErrorBoundaryState = {
  error: unknown
  hasError: boolean
  resetKey: string
}

export class AppShellErrorBoundary extends Component<
  AppShellErrorBoundaryProps,
  AppShellErrorBoundaryState
> {
  state: AppShellErrorBoundaryState = {
    error: null,
    hasError: false,
    resetKey: this.props.resetKey,
  }

  static getDerivedStateFromProps(
    props: AppShellErrorBoundaryProps,
    state: AppShellErrorBoundaryState,
  ) {
    if (state.hasError && state.resetKey !== props.resetKey) {
      return {
        error: null,
        hasError: false,
        resetKey: props.resetKey,
      }
    }

    if (state.resetKey !== props.resetKey) {
      return {
        resetKey: props.resetKey,
      }
    }

    return null
  }

  static getDerivedStateFromError(error: unknown) {
    return {
      error,
      hasError: true,
    }
  }

  render() {
    if (this.state.hasError) {
      return <GlobalErrorPage error={this.state.error} />
    }

    return this.props.children
  }
}
