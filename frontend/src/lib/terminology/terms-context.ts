import { createContext, useContext } from 'react'
import { makeT, type T, type Terminology } from './terminology'

export const SCHOOL: Terminology = { preset: 'school', overrides: [] }

export type TermsState = { t: T; terminology: Terminology }

export const TermsContext = createContext<TermsState>({ t: makeT(SCHOOL), terminology: SCHOOL })

/** t() for the current organisation: the only way to show an institution word. */
export const useT = () => useContext(TermsContext).t
