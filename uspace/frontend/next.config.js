/** @type {import('next').NextConfig} */
const nextConfig = {
  // basePath removed — using subdomain (uspace.gongvue.com) instead
  transpilePackages: ["three"],
  webpack: (config) => {
    // web-ifc-three의 WASM 파일 처리
    config.module.rules.push({
      test: /\.wasm$/,
      type: "asset/resource",
    });
    return config;
  },
};

module.exports = nextConfig;
