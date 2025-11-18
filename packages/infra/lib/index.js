"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DelayedRepliesStack = exports.DelayedReplies = void 0;
// Export the DelayedReplies construct (recommended) and DelayedRepliesStack (backward compatibility)
var delayed_replies_stack_1 = require("./delayed-replies-stack");
Object.defineProperty(exports, "DelayedReplies", { enumerable: true, get: function () { return delayed_replies_stack_1.DelayedReplies; } });
Object.defineProperty(exports, "DelayedRepliesStack", { enumerable: true, get: function () { return delayed_replies_stack_1.DelayedRepliesStack; } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEscUdBQXFHO0FBQ3JHLGlFQUE4RTtBQUFyRSx1SEFBQSxjQUFjLE9BQUE7QUFBRSw0SEFBQSxtQkFBbUIsT0FBQSIsInNvdXJjZXNDb250ZW50IjpbIi8vIEV4cG9ydCB0aGUgRGVsYXllZFJlcGxpZXMgY29uc3RydWN0IChyZWNvbW1lbmRlZCkgYW5kIERlbGF5ZWRSZXBsaWVzU3RhY2sgKGJhY2t3YXJkIGNvbXBhdGliaWxpdHkpXG5leHBvcnQgeyBEZWxheWVkUmVwbGllcywgRGVsYXllZFJlcGxpZXNTdGFjayB9IGZyb20gJy4vZGVsYXllZC1yZXBsaWVzLXN0YWNrJztcbmV4cG9ydCB0eXBlIHsgRGVsYXllZFJlcGxpZXNQcm9wcywgRGVsYXllZFJlcGxpZXNTdGFja1Byb3BzIH0gZnJvbSAnLi9kZWxheWVkLXJlcGxpZXMtc3RhY2snO1xuIl19