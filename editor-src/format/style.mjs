export const defaultStyle = {
  indent: 2,
  contextualBracket: 'tight',
  binderColon: 'tight',
  proofCase: {
    arrowBreaksBody: true,
  },
  proofLet: {
    breakChains: true,
  },
};

export function mergeStyle(overrides = {}) {
  return {
    ...defaultStyle,
    ...overrides,
    proofCase: { ...defaultStyle.proofCase, ...overrides.proofCase },
    proofLet: { ...defaultStyle.proofLet, ...overrides.proofLet },
  };
}
