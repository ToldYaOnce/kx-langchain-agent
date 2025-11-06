import { Command } from 'commander';
import { type ChatOptions } from './chat.js';
interface SimpleChatOptions extends ChatOptions {
    session?: string;
}
export declare function simpleChatCommand(options: SimpleChatOptions): Promise<void>;
export declare const simpleChatCmd: Command;
export {};
