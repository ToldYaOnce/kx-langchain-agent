import { type MessageSource } from '@toldyaonce/kx-langchain-agent-runtime';
interface SimulateOptions {
    tenantId: string;
    source: MessageSource;
    text: string;
    phone?: string;
    email?: string;
    putEvents?: boolean;
}
export declare function simulateCommand(options: SimulateOptions): Promise<void>;
export {};
