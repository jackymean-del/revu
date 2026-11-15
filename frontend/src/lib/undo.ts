import { createContext, useContext } from 'react'

export type Later = (label: string, run: () => void, undo?: () => void) => void

/** Without the provider a removal simply happens. */
export const Ctx = createContext<Later>((_, run) => run())

/** later(label, run, undo): run in a few seconds unless Undo is pressed; undo puts the screen back. */
export const useLater = () => useContext(Ctx)
