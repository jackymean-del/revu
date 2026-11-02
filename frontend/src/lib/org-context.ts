import { createContext, useContext } from 'react'
import type { MyOrg } from '../api/client'
import type { ApiError } from '../api/problem'

export type OrgState = {
  /** Every organisation the person belongs to. */
  orgs: MyOrg[]
  /** The one they are working in, or null before it is known. */
  current: MyOrg | null
  choose: (id: string) => void
  loading: boolean
  error: ApiError | null
}

export const OrgContext = createContext<OrgState>({ orgs: [], current: null, choose: () => {}, loading: true, error: null })

export const useOrg = () => useContext(OrgContext)
