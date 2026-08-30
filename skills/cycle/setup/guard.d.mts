export interface GuardAbort {
  readonly _abort: { readonly reason: string }
}

export function decide(payload: unknown, role: string): GuardAbort | null
