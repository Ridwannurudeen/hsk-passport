import type { NextConfig } from "next";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const webpack = require("next/dist/compiled/webpack/webpack").webpack;

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      readline: false,
    };
    // Polyfill process.browser so fastfile (used by snarkjs) detects browser env.
    // Without this, fastfile tries to read URLs as local files and hangs.
    if (!isServer) {
      config.plugins = config.plugins || [];
      config.plugins.push(
        new webpack.DefinePlugin({
          "process.browser": JSON.stringify(true),
        })
      );
    }
    return config;
  },
};

export default nextConfig;
