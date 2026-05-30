import axe from 'axe-core';

// Runs axe-core's structural accessibility audit and returns the violations (empty array = clean). Specs
// assert `expect(await findAxeViolations(el)).toEqual([])`, keeping the assertion inside the test body.
// Colour-contrast and the `region` (landmark) checks need real layout and a whole-document context, which
// jsdom does not provide — they are disabled here and covered by the browser AXE pass instead. Everything
// structural (accessible names, roles, ARIA relationships, heading order) runs in jsdom.
export async function findAxeViolations(root: HTMLElement): Promise<axe.Result[]> {
  const { violations } = await axe.run(root, {
    resultTypes: ['violations'],
    rules: {
      'color-contrast': { enabled: false },
      region: { enabled: false },
    },
  });
  return violations;
}
