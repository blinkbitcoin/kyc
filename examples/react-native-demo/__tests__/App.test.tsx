/**
 * @format
 */

import React from 'react';
import * as RN from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import App, { checkDemoPermissions, FakeSdkScreen, outcomeText } from '../App';

const render = async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });
  return renderer!;
};

test('boots to the idle verification screen with the mode label', async () => {
  const renderer = await render();

  expect(
    renderer.root.findByProps({ testID: 'mode-label' }).props.children,
  ).toBe('mode: native');
  expect(
    renderer.root.findByProps({ testID: 'verification-start-button' }),
  ).toBeTruthy();
  expect(renderer.root.findByProps({ testID: 'outcome' }).props.children).toBe(
    'no outcome yet',
  );
});

test('"Start over" remounts the verification component', async () => {
  const renderer = await render();

  const before = renderer.root.findByProps({
    testID: 'verification-start-button',
  });
  await ReactTestRenderer.act(() => {
    renderer.root.findByProps({ testID: 'reset-button' }).props.onPress();
  });

  const after = renderer.root.findByProps({
    testID: 'verification-start-button',
  });
  expect(after).not.toBe(before);
  expect(renderer.root.findByProps({ testID: 'outcome' }).props.children).toBe(
    'no outcome yet',
  );
});

test('uses a light-content status bar in dark mode', async () => {
  const spy = jest.spyOn(RN, 'useColorScheme').mockReturnValue('dark');
  const renderer = await render();

  expect(renderer.root.findByType(RN.StatusBar).props.barStyle).toBe(
    'light-content',
  );
  spy.mockRestore();
});

describe('outcomeText', () => {
  it('reports every terminal outcome the component can produce', () => {
    expect(
      outcomeText({ kind: 'completed', result: { status: 'approved' } }),
    ).toBe('completed: approved');
    expect(
      outcomeText({ kind: 'completed', result: { status: 'declined' } }),
    ).toBe('completed: declined');
    expect(
      outcomeText({
        kind: 'error',
        error: { code: 'MOCK_ERROR', message: 'x' },
      }),
    ).toBe('error: MOCK_ERROR');
    expect(outcomeText({ kind: 'cancelled' })).toBe('cancelled');
    expect(outcomeText(null)).toBe('no outcome yet');
  });
});

describe('checkDemoPermissions', () => {
  it('is a stub: the demo has no permission library', async () => {
    await expect(checkDemoPermissions()).resolves.toBe('granted');
  });
});

describe('FakeSdkScreen', () => {
  it('drives the fake launch controller from its three buttons', async () => {
    const controller = {
      approve: jest.fn(),
      decline: jest.fn(),
      cancel: jest.fn(),
      fail: jest.fn(),
    };

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <FakeSdkScreen controller={controller} />,
      );
    });

    for (const [testID, method] of [
      ['fake-sdk-approve', controller.approve],
      ['fake-sdk-decline', controller.decline],
      ['fake-sdk-cancel', controller.cancel],
    ] as const) {
      await ReactTestRenderer.act(() => {
        renderer!.root.findByProps({ testID }).props.onPress();
      });
      expect(method).toHaveBeenCalledTimes(1);
    }
  });
});
