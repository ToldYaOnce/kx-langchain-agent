export const PERSONAS = {
    Carlos: {
        read_cps: [9, 12],
        type_cps: [3, 6],
        comp_base_ms: [600, 1500],
        comp_ms_per_token: [2, 5],
        write_ms_per_char: [5, 10],
        jitter_ms: [250, 1200],
        pauses: { prob: 0.35, each_ms: [400, 1200], max: 2 }
    },
    Alex: {
        read_cps: [10, 14],
        type_cps: [5, 8],
        comp_base_ms: [400, 1200],
        comp_ms_per_token: [1, 4],
        write_ms_per_char: [4, 8],
        jitter_ms: [200, 900],
        pauses: { prob: 0.25, each_ms: [300, 900], max: 2 }
    },
    Sam: {
        read_cps: [8, 11],
        type_cps: [4, 7],
        comp_base_ms: [500, 1300],
        comp_ms_per_token: [2, 4],
        write_ms_per_char: [6, 12],
        jitter_ms: [300, 1000],
        pauses: { prob: 0.30, each_ms: [350, 1000], max: 3 }
    }
};
//# sourceMappingURL=personaTimings.js.map