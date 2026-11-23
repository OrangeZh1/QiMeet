export type HelpQuestion = { id: string, question: string, answer: string }
export type HelpContent = { intro: string, items: HelpQuestion[] }
export type HelpSettings = HelpContent & { revision: string }
export const helpQuestionLimit = 60
export const helpQuestionLength = 160
export const helpAnswerLength = 12000
