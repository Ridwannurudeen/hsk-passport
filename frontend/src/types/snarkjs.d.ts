// Minimal types for snarkjs — the package doesn't ship TS definitions.
// We only call groth16.fullProve client-side; widen as needed.
declare module "snarkjs" {
  export const groth16: {
    fullProve(
      input: Record<string, string | string[]>,
      wasmPath: string,
      zkeyPath: string
    ): Promise<{
      proof: {
        pi_a: string[];
        pi_b: string[][];
        pi_c: string[];
        protocol: string;
        curve: string;
      };
      publicSignals: string[];
    }>;
    verify(
      vkey: unknown,
      publicSignals: string[],
      proof: unknown
    ): Promise<boolean>;
  };
}
