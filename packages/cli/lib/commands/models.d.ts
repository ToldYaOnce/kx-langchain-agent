interface TestModelOptions {
    model: string;
    prompt: string;
}
export declare const modelsCommand: {
    list(): Promise<void>;
    test(options: TestModelOptions): Promise<void>;
};
export {};
