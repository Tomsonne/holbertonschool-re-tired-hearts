import { assertDemoResetTarget } from './reset-demo';

describe('réinitialisation de démonstration', () => {
  it('refuse une base ordinaire et une confirmation inexacte', () => {
    expect(() => assertDemoResetTarget({ DATABASE_NAME: 're_tired_hearts', DEMO_RESET_CONFIRM: 're_tired_hearts' })).toThrow('Reset refusé');
    expect(() => assertDemoResetTarget({ DATABASE_NAME: 're_tired_hearts_demo_test', DEMO_RESET_CONFIRM: 'autre' })).toThrow('Reset refusé');
  });

  it('accepte uniquement la base jetable confirmée', () => {
    expect(assertDemoResetTarget({
      DATABASE_NAME: 're_tired_hearts_demo_test',
      DEMO_RESET_CONFIRM: 're_tired_hearts_demo_test',
    })).toBe('re_tired_hearts_demo_test');
  });
});
