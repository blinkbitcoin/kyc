import { describePackage, PACKAGE_NAME } from '../packageInfo';

describe('packageInfo', () => {
  it('names the package', () => {
    expect(PACKAGE_NAME).toBe('@blinkbitcoin/kyc-react-native');
  });

  it('describes the package for a demo screen', () => {
    expect(describePackage()).toBe(
      '@blinkbitcoin/kyc-react-native (bootstrap)',
    );
  });
});
