export type PersonaTiming = {
    read_cps: [number, number];
    type_cps: [number, number];
    comp_base_ms: [number, number];
    comp_ms_per_token: [number, number];
    write_ms_per_char: [number, number];
    jitter_ms: [number, number];
    pauses?: {
        prob: number;
        each_ms: [number, number];
        max: number;
    };
};
export declare const PERSONAS: Record<string, PersonaTiming>;
//# sourceMappingURL=personaTimings.d.ts.map