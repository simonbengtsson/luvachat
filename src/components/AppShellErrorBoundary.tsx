import { GlobalStatusPage } from "@/components/GlobalStatusPage"
import { AlertCircleIcon } from "lucide-react"
import { Component, type ReactNode } from "react"

type AppShellErrorBoundaryProps = {
  children: ReactNode
  resetKey: string
}

type AppShellErrorBoundaryState = {
  hasError: boolean
  resetKey: string
}

export class AppShellErrorBoundary extends Component<
  AppShellErrorBoundaryProps,
  AppShellErrorBoundaryState
> {
  state: AppShellErrorBoundaryState = {
    hasError: false,
    resetKey: this.props.resetKey,
  }

  static getDerivedStateFromProps(
    props: AppShellErrorBoundaryProps,
    state: AppShellErrorBoundaryState,
  ) {
    if (state.hasError && state.resetKey !== props.resetKey) {
      return {
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

  static getDerivedStateFromError() {
    return {
      hasError: true,
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <GlobalStatusPage
          title="Something went wrong"
          message="Something went wrong. Please try again."
          icon={<AlertCircleIcon />}
        />
      )
    }

    return this.props.children
  }
}
