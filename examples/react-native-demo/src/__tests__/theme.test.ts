import { BLINK_LABELS, BLINK_THEME, uiProps } from '../theme';

describe('uiProps', () => {
  it('hands the component nothing for the default look', () => {
    expect(uiProps('default')).toEqual({});
  });

  it('hands it the Blink palette and the Spanish copy when themed', () => {
    expect(uiProps('themed')).toEqual({
      theme: BLINK_THEME,
      labels: BLINK_LABELS,
    });
    expect(BLINK_THEME.primaryColor).toBe('#F7931A');
    expect(BLINK_LABELS.cancel).toBe('Cancelar');
  });
});
