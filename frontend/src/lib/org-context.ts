import { createContext, useContext } from 'react'
import type { Me, MyOrg } from '../api/client'
import type { ApiError } from '../api/problem'

export type OrgState = {
  /** Every organisation the person belongs to. */
  orgs: MyOrg[]
  /** The one they are working in, or null before it is known. */
  current: MyOrg | null
  choose: (id: string) => void
  loading: boolean
  error: ApiError | null
  /** The server could not be reached or failed, so who the person is stays unknown. */
  unreachable: boolean
  /** The signed-in person's sign-in id, once known. */
  userId: string | null
  /** Whether this person runs the platform: the owner console, never an institution's content. */
  platformOwner: boolean
  /** Groups this person administers. */
  groups: Me['groups']
  /** The role an administrator is previewing in the current institution, or null. */
  previewing: string | null
  /** Start (a role) or stop (null) a preview; the server enforces it. */
  preview: (role: string | null) => void
  /** The person's own roles in the current institution, whatever is previewed. */
  ownRoles: MyOrg['roles']
}

export const OrgContext = createContext<OrgState>({ orgs: [], current: null, choose: () => {}, loading: true, error: null, unreachable: false, userId: null, platformOwner: false, groups: [], previewing: null, preview: () => {}, ownRoles: [] })

export const useOrg = () => useContext(OrgContext)
