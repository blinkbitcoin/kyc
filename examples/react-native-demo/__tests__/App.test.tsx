import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import * as RN from 'react-native';
import App from '../App';

test('renders the ready marker and the package description', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });
  expect(
    renderer!.root.findByProps({ testID: 'app-ready' }).props.children,
  ).toBe('KYC demo');
  expect(
    renderer!.root.findByProps({ testID: 'package-name' }).props.children,
  ).toBe('@blinkbitcoin/kyc-react-native (bootstrap)');
});

test('uses a light-content status bar in dark mode', async () => {
  const spy = jest.spyOn(RN, 'useColorScheme').mockReturnValue('dark');
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });
  expect(renderer!.root.findByType(RN.StatusBar).props.barStyle).toBe(
    'light-content',
  );
  spy.mockRestore();
});
