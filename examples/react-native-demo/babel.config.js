module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'transform-inline-environment-variables',
      { include: ['KYC_MODE', 'KYC_UI', 'KYC_API_PORT'] },
    ],
  ],
};
