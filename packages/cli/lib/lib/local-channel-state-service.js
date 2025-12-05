"use strict";
/**
 * @fileoverview
 * Local Channel State Service for CLI Development
 *
 * Implements the same interface as ChannelStateService but uses LocalSessionStore
 * instead of DynamoDB, allowing local testing of goal workflows without AWS.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalChannelStateService = void 0;
/**
 * Local implementation of ChannelStateService for CLI development
 */
class LocalChannelStateService {
    constructor(sessionStore, sessionId) {
        this.sessionStore = sessionStore;
        this.sessionId = sessionId;
    }
    /**
     * Load workflow state for a channel
     */
    async loadWorkflowState(channelId, tenantId) {
        console.log(`📊 [LOCAL] Loading workflow state for session: ${this.sessionId}`);
        const state = this.sessionStore.getWorkflowState(this.sessionId);
        if (state) {
            console.log(`✅ [LOCAL] Loaded existing workflow state`);
            console.log(`   Message count: ${state.messageCount}`);
            console.log(`   Captured data: ${JSON.stringify(state.capturedData)}`);
            console.log(`   Active goals: ${state.activeGoals.join(', ') || 'none'}`);
            console.log(`   Completed goals: ${state.completedGoals.join(', ') || 'none'}`);
            return state;
        }
        console.log(`📝 [LOCAL] No existing workflow state, returning default`);
        return this.getDefaultWorkflowState();
    }
    /**
     * Save workflow state for a channel
     */
    async saveWorkflowState(channelId, state, tenantId) {
        console.log(`💾 [LOCAL] Saving workflow state for session: ${this.sessionId}`);
        console.log(`   Captured data: ${JSON.stringify(state.capturedData)}`);
        console.log(`   Active goals: ${state.activeGoals.join(', ')}`);
        console.log(`   Completed goals: ${state.completedGoals.join(', ')}`);
        this.sessionStore.updateWorkflowState(this.sessionId, state);
        console.log(`✅ [LOCAL] Workflow state saved to file`);
    }
    /**
     * Update specific fields in the workflow state (partial update)
     */
    async updateWorkflowState(channelId, updates, tenantId) {
        console.log(`🔄 [LOCAL] Updating workflow state for session: ${this.sessionId}`);
        const currentState = await this.loadWorkflowState(channelId, tenantId);
        const newState = {
            ...currentState,
            ...updates,
            lastUpdated: new Date().toISOString()
        };
        await this.saveWorkflowState(channelId, newState, tenantId);
        return newState;
    }
    /**
     * Mark a data field as captured
     */
    async markFieldCaptured(channelId, fieldName, fieldValue, tenantId) {
        console.log(`✔️ [LOCAL] Marking field captured: ${fieldName} = ${fieldValue}`);
        const currentState = await this.loadWorkflowState(channelId, tenantId);
        const updates = {
            capturedData: {
                ...currentState.capturedData,
                [fieldName]: fieldValue
            }
        };
        // Update tracking flags for standard contact fields
        if (fieldName === 'email') {
            updates.isEmailCaptured = true;
        }
        else if (fieldName === 'phone') {
            updates.isPhoneCaptured = true;
        }
        else if (fieldName === 'firstName') {
            updates.isFirstNameCaptured = true;
        }
        else if (fieldName === 'lastName') {
            updates.isLastNameCaptured = true;
        }
        return this.updateWorkflowState(channelId, updates, tenantId);
    }
    /**
     * Mark a goal as completed
     */
    async markGoalCompleted(channelId, goalId, tenantId) {
        console.log(`🎯 [LOCAL] Marking goal completed: ${goalId}`);
        const currentState = await this.loadWorkflowState(channelId, tenantId);
        if (currentState.completedGoals.includes(goalId)) {
            console.log(`   Goal ${goalId} already completed`);
            return currentState;
        }
        return this.updateWorkflowState(channelId, {
            completedGoals: [...currentState.completedGoals, goalId],
            activeGoals: currentState.activeGoals.filter(id => id !== goalId)
        }, tenantId);
    }
    /**
     * Set active goals
     */
    async setActiveGoals(channelId, goalIds, tenantId) {
        console.log(`🎯 [LOCAL] Setting active goals: ${goalIds.join(', ')}`);
        return this.updateWorkflowState(channelId, {
            activeGoals: goalIds
        }, tenantId);
    }
    /**
     * Increment message count
     */
    async incrementMessageCount(channelId, tenantId) {
        const currentState = await this.loadWorkflowState(channelId, tenantId);
        return this.updateWorkflowState(channelId, {
            messageCount: currentState.messageCount + 1
        }, tenantId);
    }
    /**
     * Record that an event was emitted (prevent duplicate events)
     */
    async recordEventEmitted(channelId, eventName, tenantId) {
        console.log(`📤 [LOCAL] Recording event emitted: ${eventName}`);
        const currentState = await this.loadWorkflowState(channelId, tenantId);
        if (currentState.emittedEvents.includes(eventName)) {
            console.log(`   Event ${eventName} already emitted`);
            return currentState;
        }
        return this.updateWorkflowState(channelId, {
            emittedEvents: [...currentState.emittedEvents, eventName]
        }, tenantId);
    }
    /**
     * Rollback workflow state to a previous snapshot
     */
    async rollbackState(channelId, snapshot, tenantId) {
        console.log(`⏪ [LOCAL] Rolling back workflow state for session: ${this.sessionId}`);
        const currentState = await this.loadWorkflowState(channelId, tenantId);
        const rolledBackState = {
            ...currentState,
            capturedData: snapshot.capturedData,
            activeGoals: snapshot.activeGoals,
            completedGoals: snapshot.completedGoals,
            messageCount: snapshot.messageCount,
            lastUpdated: new Date().toISOString()
        };
        await this.saveWorkflowState(channelId, rolledBackState, tenantId);
        console.log(`✅ [LOCAL] Workflow state rolled back successfully`);
        return rolledBackState;
    }
    /**
     * Check if all required contact info has been captured
     */
    isContactInfoComplete(state) {
        return (state.isEmailCaptured &&
            state.isPhoneCaptured &&
            state.isFirstNameCaptured);
    }
    /**
     * Check if an event has already been emitted
     */
    hasEventBeenEmitted(state, eventName) {
        return state.emittedEvents.includes(eventName);
    }
    /**
     * Get default workflow state
     */
    getDefaultWorkflowState() {
        return {
            isEmailCaptured: false,
            isPhoneCaptured: false,
            isFirstNameCaptured: false,
            isLastNameCaptured: false,
            capturedData: {},
            completedGoals: [],
            activeGoals: [],
            currentGoalOrder: 0,
            messageCount: 0,
            lastUpdated: new Date().toISOString(),
            emittedEvents: []
        };
    }
}
exports.LocalChannelStateService = LocalChannelStateService;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9jYWwtY2hhbm5lbC1zdGF0ZS1zZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2xpYi9sb2NhbC1jaGFubmVsLXN0YXRlLXNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7R0FNRzs7O0FBS0g7O0dBRUc7QUFDSCxNQUFhLHdCQUF3QjtJQUluQyxZQUFZLFlBQStCLEVBQUUsU0FBaUI7UUFDNUQsSUFBSSxDQUFDLFlBQVksR0FBRyxZQUFZLENBQUM7UUFDakMsSUFBSSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUM7SUFDN0IsQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLGlCQUFpQixDQUFDLFNBQWlCLEVBQUUsUUFBaUI7UUFDMUQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrREFBa0QsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUM7UUFFaEYsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7UUFFakUsSUFBSSxLQUFLLEVBQUUsQ0FBQztZQUNWLE9BQU8sQ0FBQyxHQUFHLENBQUMsMENBQTBDLENBQUMsQ0FBQztZQUN4RCxPQUFPLENBQUMsR0FBRyxDQUFDLHFCQUFxQixLQUFLLENBQUMsWUFBWSxFQUFFLENBQUMsQ0FBQztZQUN2RCxPQUFPLENBQUMsR0FBRyxDQUFDLHFCQUFxQixJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDdkUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsS0FBSyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksTUFBTSxFQUFFLENBQUMsQ0FBQztZQUMxRSxPQUFPLENBQUMsR0FBRyxDQUFDLHVCQUF1QixLQUFLLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxN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bnRlbnQiOlsiLyoqXHJcbiAqIEBmaWxlb3ZlcnZpZXdcclxuICogTG9jYWwgQ2hhbm5lbCBTdGF0ZSBTZXJ2aWNlIGZvciBDTEkgRGV2ZWxvcG1lbnRcclxuICogXHJcbiAqIEltcGxlbWVudHMgdGhlIHNhbWUgaW50ZXJmYWNlIGFzIENoYW5uZWxTdGF0ZVNlcnZpY2UgYnV0IHVzZXMgTG9jYWxTZXNzaW9uU3RvcmVcclxuICogaW5zdGVhZCBvZiBEeW5hbW9EQiwgYWxsb3dpbmcgbG9jYWwgdGVzdGluZyBvZiBnb2FsIHdvcmtmbG93cyB3aXRob3V0IEFXUy5cclxuICovXHJcblxyXG5pbXBvcnQgdHlwZSB7IENoYW5uZWxXb3JrZmxvd1N0YXRlIH0gZnJvbSAnQHRvbGR5YW9uY2Uva3gtbGFuZ2NoYWluLWFnZW50LXJ1bnRpbWUnO1xyXG5pbXBvcnQgeyBMb2NhbFNlc3Npb25TdG9yZSB9IGZyb20gJy4vbG9jYWwtc2Vzc2lvbi1zdG9yZS5qcyc7XHJcblxyXG4vKipcclxuICogTG9jYWwgaW1wbGVtZW50YXRpb24gb2YgQ2hhbm5lbFN0YXRlU2VydmljZSBmb3IgQ0xJIGRldmVsb3BtZW50XHJcbiAqL1xyXG5leHBvcnQgY2xhc3MgTG9jYWxDaGFubmVsU3RhdGVTZXJ2aWNlIHtcclxuICBwcml2YXRlIHNlc3Npb25TdG9yZTogTG9jYWxTZXNzaW9uU3RvcmU7XHJcbiAgcHJpdmF0ZSBzZXNzaW9uSWQ6IHN0cmluZztcclxuXHJcbiAgY29uc3RydWN0b3Ioc2Vzc2lvblN0b3JlOiBMb2NhbFNlc3Npb25TdG9yZSwgc2Vzc2lvbklkOiBzdHJpbmcpIHtcclxuICAgIHRoaXMuc2Vzc2lvblN0b3JlID0gc2Vzc2lvblN0b3JlO1xyXG4gICAgdGhpcy5zZXNzaW9uSWQgPSBzZXNzaW9uSWQ7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBMb2FkIHdvcmtmbG93IHN0YXRlIGZvciBhIGNoYW5uZWxcclxuICAgKi9cclxuICBhc3luYyBsb2FkV29ya2Zsb3dTdGF0ZShjaGFubmVsSWQ6IHN0cmluZywgdGVuYW50SWQ/OiBzdHJpbmcpOiBQcm9taXNlPENoYW5uZWxXb3JrZmxvd1N0YXRlPiB7XHJcbiAgICBjb25zb2xlLmxvZyhg8J+TiiBbTE9DQUxdIExvYWRpbmcgd29ya2Zsb3cgc3RhdGUgZm9yIHNlc3Npb246ICR7dGhpcy5zZXNzaW9uSWR9YCk7XHJcbiAgICBcclxuICAgIGNvbnN0IHN0YXRlID0gdGhpcy5zZXNzaW9uU3RvcmUuZ2V0V29ya2Zsb3dTdGF0ZSh0aGlzLnNlc3Npb25JZCk7XHJcbiAgICBcclxuICAgIGlmIChzdGF0ZSkge1xyXG4gICAgICBjb25zb2xlLmxvZyhg4pyFIFtMT0NBTF0gTG9hZGVkIGV4aXN0aW5nIHdvcmtmbG93IHN0YXRlYCk7XHJcbiAgICAgIGNvbnNvbGUubG9nKGAgICBNZXNzYWdlIGNvdW50OiAke3N0YXRlLm1lc3NhZ2VDb3VudH1gKTtcclxuICAgICAgY29uc29sZS5sb2coYCAgIENhcHR1cmVkIGRhdGE6ICR7SlNPTi5zdHJpbmdpZnkoc3RhdGUuY2FwdHVyZWREYXRhKX1gKTtcclxuICAgICAgY29uc29sZS5sb2coYCAgIEFjdGl2ZSBnb2FsczogJHtzdGF0ZS5hY3RpdmVHb2Fscy5qb2luKCcsICcpIHx8ICdub25lJ31gKTtcclxuICAgICAgY29uc29sZS5sb2coYCAgIENvbXBsZXRlZCBnb2FsczogJHtzdGF0ZS5jb21wbGV0ZWRHb2Fscy5qb2luKCcsICcpIHx8ICdub25lJ31gKTtcclxuICAgICAgcmV0dXJuIHN0YXRlO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnNvbGUubG9nKGDwn5OdIFtMT0NBTF0gTm8gZXhpc3Rpbmcgd29ya2Zsb3cgc3RhdGUsIHJldHVybmluZyBkZWZhdWx0YCk7XHJcbiAgICByZXR1cm4gdGhpcy5nZXREZWZhdWx0V29ya2Zsb3dTdGF0ZSgpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogU2F2ZSB3b3JrZmxvdyBzdGF0ZSBmb3IgYSBjaGFubmVsXHJcbiAgICovXHJcbiAgYXN5bmMgc2F2ZVdvcmtmbG93U3RhdGUoXHJcbiAgICBjaGFubmVsSWQ6IHN0cmluZyxcclxuICAgIHN0YXRlOiBDaGFubmVsV29ya2Zsb3dTdGF0ZSxcclxuICAgIHRlbmFudElkPzogc3RyaW5nXHJcbiAgKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBjb25zb2xlLmxvZyhg8J+SviBbTE9DQUxdIFNhdmluZyB3b3JrZmxvdyBzdGF0ZSBmb3Igc2Vzc2lvbjogJHt0aGlzLnNlc3Npb25JZH1gKTtcclxuICAgIGNvbnNvbGUubG9nKGAgICBDYXB0dXJlZCBkYXRhOiAke0pTT04uc3RyaW5naWZ5KHN0YXRlLmNhcHR1cmVkRGF0YSl9YCk7XHJcbiAgICBjb25zb2xlLmxvZyhgICAgQWN0aXZlIGdvYWxzOiAke3N0YXRlLmFjdGl2ZUdvYWxzLmpvaW4oJywgJyl9YCk7XHJcbiAgICBjb25zb2xlLmxvZyhgICAgQ29tcGxldGVkIGdvYWxzOiAke3N0YXRlLmNvbXBsZXRlZEdvYWxzLmpvaW4oJywgJyl9YCk7XHJcbiAgICBcclxuICAgIHRoaXMuc2Vzc2lvblN0b3JlLnVwZGF0ZVdvcmtmbG93U3RhdGUodGhpcy5zZXNzaW9uSWQsIHN0YXRlKTtcclxuICAgIGNvbnNvbGUubG9nKGDinIUgW0xPQ0FMXSBXb3JrZmxvdyBzdGF0ZSBzYXZlZCB0byBmaWxlYCk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBVcGRhdGUgc3BlY2lmaWMgZmllbGRzIGluIHRoZSB3b3JrZmxvdyBzdGF0ZSAocGFydGlhbCB1cGRhdGUpXHJcbiAgICovXHJcbiAgYXN5bmMgdXBkYXRlV29ya2Zsb3dTdGF0ZShcclxuICAgIGNoYW5uZWxJZDogc3RyaW5nLFxyXG4gICAgdXBkYXRlczogUGFydGlhbDxDaGFubmVsV29ya2Zsb3dTdGF0ZT4sXHJcbiAgICB0ZW5hbnRJZD86IHN0cmluZ1xyXG4gICk6IFByb21pc2U8Q2hhbm5lbFdvcmtmbG93U3RhdGU+IHtcclxuICAgIGNvbnNvbGUubG9nKGDwn5SEIFtMT0NBTF0gVXBkYXRpbmcgd29ya2Zsb3cgc3RhdGUgZm9yIHNlc3Npb246ICR7dGhpcy5zZXNzaW9uSWR9YCk7XHJcbiAgICBcclxuICAgIGNvbnN0IGN1cnJlbnRTdGF0ZSA9IGF3YWl0IHRoaXMubG9hZFdvcmtmbG93U3RhdGUoY2hhbm5lbElkLCB0ZW5hbnRJZCk7XHJcbiAgICBcclxuICAgIGNvbnN0IG5ld1N0YXRlOiBDaGFubmVsV29ya2Zsb3dTdGF0ZSA9IHtcclxuICAgICAgLi4uY3VycmVudFN0YXRlLFxyXG4gICAgICAuLi51cGRhdGVzLFxyXG4gICAgICBsYXN0VXBkYXRlZDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpXHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICBhd2FpdCB0aGlzLnNhdmVXb3JrZmxvd1N0YXRlKGNoYW5uZWxJZCwgbmV3U3RhdGUsIHRlbmFudElkKTtcclxuICAgIHJldHVybiBuZXdTdGF0ZTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIE1hcmsgYSBkYXRhIGZpZWxkIGFzIGNhcHR1cmVkXHJcbiAgICovXHJcbiAgYXN5bmMgbWFya0ZpZWxkQ2FwdHVyZWQoXHJcbiAgICBjaGFubmVsSWQ6IHN0cmluZyxcclxuICAgIGZpZWxkTmFtZTogc3RyaW5nLFxyXG4gICAgZmllbGRWYWx1ZTogYW55LFxyXG4gICAgdGVuYW50SWQ/OiBzdHJpbmdcclxuICApOiBQcm9taXNlPENoYW5uZWxXb3JrZmxvd1N0YXRlPiB7XHJcbiAgICBjb25zb2xlLmxvZyhg4pyU77iPIFtMT0NBTF0gTWFya2luZyBmaWVsZCBjYXB0dXJlZDogJHtmaWVsZE5hbWV9ID0gJHtmaWVsZFZhbHVlfWApO1xyXG4gICAgXHJcbiAgICBjb25zdCBjdXJyZW50U3RhdGUgPSBhd2FpdCB0aGlzLmxvYWRXb3JrZmxvd1N0YXRlKGNoYW5uZWxJZCwgdGVuYW50SWQpO1xyXG4gICAgXHJcbiAgICBjb25zdCB1cGRhdGVzOiBQYXJ0aWFsPENoYW5uZWxXb3JrZmxvd1N0YXRlPiA9IHtcclxuICAgICAgY2FwdHVyZWREYXRhOiB7XHJcbiAgICAgICAgLi4uY3VycmVudFN0YXRlLmNhcHR1cmVkRGF0YSxcclxuICAgICAgICBbZmllbGROYW1lXTogZmllbGRWYWx1ZVxyXG4gICAgICB9XHJcbiAgICB9O1xyXG5cclxuICAgIC8vIFVwZGF0ZSB0cmFja2luZyBmbGFncyBmb3Igc3RhbmRhcmQgY29udGFjdCBmaWVsZHNcclxuICAgIGlmIChmaWVsZE5hbWUgPT09ICdlbWFpbCcpIHtcclxuICAgICAgdXBkYXRlcy5pc0VtYWlsQ2FwdHVyZWQgPSB0cnVlO1xyXG4gICAgfSBlbHNlIGlmIChmaWVsZE5hbWUgPT09ICdwaG9uZScpIHtcclxuICAgICAgdXBkYXRlcy5pc1Bob25lQ2FwdHVyZWQgPSB0cnVlO1xyXG4gICAgfSBlbHNlIGlmIChmaWVsZE5hbWUgPT09ICdmaXJzdE5hbWUnKSB7XHJcbiAgICAgIHVwZGF0ZXMuaXNGaXJzdE5hbWVDYXB0dXJlZCA9IHRydWU7XHJcbiAgICB9IGVsc2UgaWYgKGZpZWxkTmFtZSA9PT0gJ2xhc3ROYW1lJykge1xyXG4gICAgICB1cGRhdGVzLmlzTGFzdE5hbWVDYXB0dXJlZCA9IHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHRoaXMudXBkYXRlV29ya2Zsb3dTdGF0ZShjaGFubmVsSWQsIHVwZGF0ZXMsIHRlbmFudElkKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIE1hcmsgYSBnb2FsIGFzIGNvbXBsZXRlZFxyXG4gICAqL1xyXG4gIGFzeW5jIG1hcmtHb2FsQ29tcGxldGVkKFxyXG4gICAgY2hhbm5lbElkOiBzdHJpbmcsXHJcbiAgICBnb2FsSWQ6IHN0cmluZyxcclxuICAgIHRlbmFudElkPzogc3RyaW5nXHJcbiAgKTogUHJvbWlzZTxDaGFubmVsV29ya2Zsb3dTdGF0ZT4ge1xyXG4gICAgY29uc29sZS5sb2coYPCfjq8gW0xPQ0FMXSBNYXJraW5nIGdvYWwgY29tcGxldGVkOiAke2dvYWxJZH1gKTtcclxuICAgIFxyXG4gICAgY29uc3QgY3VycmVudFN0YXRlID0gYXdhaXQgdGhpcy5sb2FkV29ya2Zsb3dTdGF0ZShjaGFubmVsSWQsIHRlbmFudElkKTtcclxuICAgIFxyXG4gICAgaWYgKGN1cnJlbnRTdGF0ZS5jb21wbGV0ZWRHb2Fscy5pbmNsdWRlcyhnb2FsSWQpKSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKGAgICBHb2FsICR7Z29hbElkfSBhbHJlYWR5IGNvbXBsZXRlZGApO1xyXG4gICAgICByZXR1cm4gY3VycmVudFN0YXRlO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICByZXR1cm4gdGhpcy51cGRhdGVXb3JrZmxvd1N0YXRlKGNoYW5uZWxJZCwge1xyXG4gICAgICBjb21wbGV0ZWRHb2FsczogWy4uLmN1cnJlbnRTdGF0ZS5jb21wbGV0ZWRHb2FscywgZ29hbElkXSxcclxuICAgICAgYWN0aXZlR29hbHM6IGN1cnJlbnRTdGF0ZS5hY3RpdmVHb2Fscy5maWx0ZXIoaWQgPT4gaWQgIT09IGdvYWxJZClcclxuICAgIH0sIHRlbmFudElkKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFNldCBhY3RpdmUgZ29hbHNcclxuICAgKi9cclxuICBhc3luYyBzZXRBY3RpdmVHb2FscyhcclxuICAgIGNoYW5uZWxJZDogc3RyaW5nLFxyXG4gICAgZ29hbElkczogc3RyaW5nW10sXHJcbiAgICB0ZW5hbnRJZD86IHN0cmluZ1xyXG4gICk6IFByb21pc2U8Q2hhbm5lbFdvcmtmbG93U3RhdGU+IHtcclxuICAgIGNvbnNvbGUubG9nKGDwn46vIFtMT0NBTF0gU2V0dGluZyBhY3RpdmUgZ29hbHM6ICR7Z29hbElkcy5qb2luKCcsICcpfWApO1xyXG4gICAgXHJcbiAgICByZXR1cm4gdGhpcy51cGRhdGVXb3JrZmxvd1N0YXRlKGNoYW5uZWxJZCwge1xyXG4gICAgICBhY3RpdmVHb2FsczogZ29hbElkc1xyXG4gICAgfSwgdGVuYW50SWQpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogSW5jcmVtZW50IG1lc3NhZ2UgY291bnRcclxuICAgKi9cclxuICBhc3luYyBpbmNyZW1lbnRNZXNzYWdlQ291bnQoY2hhbm5lbElkOiBzdHJpbmcsIHRlbmFudElkPzogc3RyaW5nKTogUHJvbWlzZTxDaGFubmVsV29ya2Zsb3dTdGF0ZT4ge1xyXG4gICAgY29uc3QgY3VycmVudFN0YXRlID0gYXdhaXQgdGhpcy5sb2FkV29ya2Zsb3dTdGF0ZShjaGFubmVsSWQsIHRlbmFudElkKTtcclxuICAgIFxyXG4gICAgcmV0dXJuIHRoaXMudXBkYXRlV29ya2Zsb3dTdGF0ZShjaGFubmVsSWQsIHtcclxuICAgICAgbWVzc2FnZUNvdW50OiBjdXJyZW50U3RhdGUubWVzc2FnZUNvdW50ICsgMVxyXG4gICAgfSwgdGVuYW50SWQpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogUmVjb3JkIHRoYXQgYW4gZXZlbnQgd2FzIGVtaXR0ZWQgKHByZXZlbnQgZHVwbGljYXRlIGV2ZW50cylcclxuICAgKi9cclxuICBhc3luYyByZWNvcmRFdmVudEVtaXR0ZWQoXHJcbiAgICBjaGFubmVsSWQ6IHN0cmluZyxcclxuICAgIGV2ZW50TmFtZTogc3RyaW5nLFxyXG4gICAgdGVuYW50SWQ/OiBzdHJpbmdcclxuICApOiBQcm9taXNlPENoYW5uZWxXb3JrZmxvd1N0YXRlPiB7XHJcbiAgICBjb25zb2xlLmxvZyhg8J+TpCBbTE9DQUxdIFJlY29yZGluZyBldmVudCBlbWl0dGVkOiAke2V2ZW50TmFtZX1gKTtcclxuICAgIFxyXG4gICAgY29uc3QgY3VycmVudFN0YXRlID0gYXdhaXQgdGhpcy5sb2FkV29ya2Zsb3dTdGF0ZShjaGFubmVsSWQsIHRlbmFudElkKTtcclxuICAgIFxyXG4gICAgaWYgKGN1cnJlbnRTdGF0ZS5lbWl0dGVkRXZlbnRzLmluY2x1ZGVzKGV2ZW50TmFtZSkpIHtcclxuICAgICAgY29uc29sZS5sb2coYCAgIEV2ZW50ICR7ZXZlbnROYW1lfSBhbHJlYWR5IGVtaXR0ZWRgKTtcclxuICAgICAgcmV0dXJuIGN1cnJlbnRTdGF0ZTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgcmV0dXJuIHRoaXMudXBkYXRlV29ya2Zsb3dTdGF0ZShjaGFubmVsSWQsIHtcclxuICAgICAgZW1pdHRlZEV2ZW50czogWy4uLmN1cnJlbnRTdGF0ZS5lbWl0dGVkRXZlbnRzLCBldmVudE5hbWVdXHJcbiAgICB9LCB0ZW5hbnRJZCk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBSb2xsYmFjayB3b3JrZmxvdyBzdGF0ZSB0byBhIHByZXZpb3VzIHNuYXBzaG90XHJcbiAgICovXHJcbiAgYXN5bmMgcm9sbGJhY2tTdGF0ZShcclxuICAgIGNoYW5uZWxJZDogc3RyaW5nLFxyXG4gICAgc25hcHNob3Q6IHtcclxuICAgICAgYXR0ZW1wdENvdW50czogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcclxuICAgICAgY2FwdHVyZWREYXRhOiBSZWNvcmQ8c3RyaW5nLCBhbnk+O1xyXG4gICAgICBhY3RpdmVHb2Fsczogc3RyaW5nW107XHJcbiAgICAgIGNvbXBsZXRlZEdvYWxzOiBzdHJpbmdbXTtcclxuICAgICAgbWVzc2FnZUNvdW50OiBudW1iZXI7XHJcbiAgICB9LFxyXG4gICAgdGVuYW50SWQ/OiBzdHJpbmdcclxuICApOiBQcm9taXNlPENoYW5uZWxXb3JrZmxvd1N0YXRlPiB7XHJcbiAgICBjb25zb2xlLmxvZyhg4o+qIFtMT0NBTF0gUm9sbGluZyBiYWNrIHdvcmtmbG93IHN0YXRlIGZvciBzZXNzaW9uOiAke3RoaXMuc2Vzc2lvbklkfWApO1xyXG4gICAgXHJcbiAgICBjb25zdCBjdXJyZW50U3RhdGUgPSBhd2FpdCB0aGlzLmxvYWRXb3JrZmxvd1N0YXRlKGNoYW5uZWxJZCwgdGVuYW50SWQpO1xyXG4gICAgXHJcbiAgICBjb25zdCByb2xsZWRCYWNrU3RhdGU6IENoYW5uZWxXb3JrZmxvd1N0YXRlID0ge1xyXG4gICAgICAuLi5jdXJyZW50U3RhdGUsXHJcbiAgICAgIGNhcHR1cmVkRGF0YTogc25hcHNob3QuY2FwdHVyZWREYXRhLFxyXG4gICAgICBhY3RpdmVHb2Fsczogc25hcHNob3QuYWN0aXZlR29hbHMsXHJcbiAgICAgIGNvbXBsZXRlZEdvYWxzOiBzbmFwc2hvdC5jb21wbGV0ZWRHb2FscyxcclxuICAgICAgbWVzc2FnZUNvdW50OiBzbmFwc2hvdC5tZXNzYWdlQ291bnQsXHJcbiAgICAgIGxhc3RVcGRhdGVkOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcclxuICAgIH07XHJcbiAgICBcclxuICAgIGF3YWl0IHRoaXMuc2F2ZVdvcmtmbG93U3RhdGUoY2hhbm5lbElkLCByb2xsZWRCYWNrU3RhdGUsIHRlbmFudElkKTtcclxuICAgIFxyXG4gICAgY29uc29sZS5sb2coYOKchSBbTE9DQUxdIFdvcmtmbG93IHN0YXRlIHJvbGxlZCBiYWNrIHN1Y2Nlc3NmdWxseWApO1xyXG4gICAgcmV0dXJuIHJvbGxlZEJhY2tTdGF0ZTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENoZWNrIGlmIGFsbCByZXF1aXJlZCBjb250YWN0IGluZm8gaGFzIGJlZW4gY2FwdHVyZWRcclxuICAgKi9cclxuICBpc0NvbnRhY3RJbmZvQ29tcGxldGUoc3RhdGU6IENoYW5uZWxXb3JrZmxvd1N0YXRlKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gKFxyXG4gICAgICBzdGF0ZS5pc0VtYWlsQ2FwdHVyZWQgJiZcclxuICAgICAgc3RhdGUuaXNQaG9uZUNhcHR1cmVkICYmXHJcbiAgICAgIHN0YXRlLmlzRmlyc3ROYW1lQ2FwdHVyZWRcclxuICAgICk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBDaGVjayBpZiBhbiBldmVudCBoYXMgYWxyZWFkeSBiZWVuIGVtaXR0ZWRcclxuICAgKi9cclxuICBoYXNFdmVudEJlZW5FbWl0dGVkKHN0YXRlOiBDaGFubmVsV29ya2Zsb3dTdGF0ZSwgZXZlbnROYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcclxuICAgIHJldHVybiBzdGF0ZS5lbWl0dGVkRXZlbnRzLmluY2x1ZGVzKGV2ZW50TmFtZSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBHZXQgZGVmYXVsdCB3b3JrZmxvdyBzdGF0ZVxyXG4gICAqL1xyXG4gIHByaXZhdGUgZ2V0RGVmYXVsdFdvcmtmbG93U3RhdGUoKTogQ2hhbm5lbFdvcmtmbG93U3RhdGUge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgaXNFbWFpbENhcHR1cmVkOiBmYWxzZSxcclxuICAgICAgaXNQaG9uZUNhcHR1cmVkOiBmYWxzZSxcclxuICAgICAgaXNGaXJzdE5hbWVDYXB0dXJlZDogZmFsc2UsXHJcbiAgICAgIGlzTGFzdE5hbWVDYXB0dXJlZDogZmFsc2UsXHJcbiAgICAgIGNhcHR1cmVkRGF0YToge30sXHJcbiAgICAgIGNvbXBsZXRlZEdvYWxzOiBbXSxcclxuICAgICAgYWN0aXZlR29hbHM6IFtdLFxyXG4gICAgICBjdXJyZW50R29hbE9yZGVyOiAwLFxyXG4gICAgICBtZXNzYWdlQ291bnQ6IDAsXHJcbiAgICAgIGxhc3RVcGRhdGVkOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgIGVtaXR0ZWRFdmVudHM6IFtdXHJcbiAgICB9O1xyXG4gIH1cclxufVxyXG5cclxuIl19