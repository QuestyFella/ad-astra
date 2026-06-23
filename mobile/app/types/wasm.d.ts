declare module '*.wasm' {
  const asset: string | { uri: string };
  export default asset;
}
