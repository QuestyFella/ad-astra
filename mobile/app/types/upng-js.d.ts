declare module 'upng-js' {
  interface DecodedPng {
    width: number;
    height: number;
  }

  const UPNG: {
    decode(buffer: ArrayBuffer): DecodedPng;
    toRGBA8(png: DecodedPng): Uint8Array[];
    encode(
      bufs: ArrayBuffer[],
      width: number,
      height: number,
      ps?: number,
      dels?: number[],
      forbidPlte?: boolean,
    ): ArrayBuffer;
  };

  export default UPNG;
}
