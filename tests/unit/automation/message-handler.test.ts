import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MessageHandler } from '../../../src/automation/message-handler.js';
import { RequestTracker } from '../../../src/automation/request-tracker.js';
import { AutomationBridgeResponseMessage, ProgressUpdateMessage } from '../../../src/automation/types.js';

vi.mock('../../../src/utils/logger.js', () => {
    return {
        Logger: vi.fn().mockImplementation(() => ({
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
        }))
    };
});

describe('MessageHandler', () => {
    let messageHandler: MessageHandler;
    let mockRequestTracker: any;

    beforeEach(() => {
        vi.useFakeTimers();
        mockRequestTracker = {
            getPendingRequest: vi.fn(),
            resolveRequest: vi.fn(),
            rejectRequest: vi.fn(),
            extendTimeout: vi.fn(),
        };
        messageHandler = new MessageHandler(mockRequestTracker as unknown as RequestTracker);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    describe('handleMessage routing', () => {
        it('should route automation_response', () => {
            const spy = vi.spyOn(messageHandler as any, 'handleAutomationResponse');
            const msg = { type: 'automation_response', requestId: '123' };
            messageHandler.handleMessage(msg as any);
            expect(spy).toHaveBeenCalledWith(msg);
        });

        it('should route automation_event', () => {
            const spy = vi.spyOn(messageHandler as any, 'handleAutomationEvent');
            const msg = { type: 'automation_event', requestId: '123' };
            messageHandler.handleMessage(msg as any);
            expect(spy).toHaveBeenCalledWith(msg);
        });

        it('should route progress_update', () => {
            const spy = vi.spyOn(messageHandler as any, 'handleProgressUpdate');
            const msg = { type: 'progress_update', requestId: '123' };
            messageHandler.handleMessage(msg as any);
            expect(spy).toHaveBeenCalledWith(msg);
        });

        it('should handle bridge_goodbye', () => {
            const msg = { type: 'bridge_goodbye' };
            // Should not throw
            messageHandler.handleMessage(msg as any);
        });

        it('should handle unknown message types', () => {
            const msg = { type: 'unknown_type' };
            // Should not throw
            messageHandler.handleMessage(msg as any);
        });
    });

    describe('handleAutomationResponse', () => {
        it('should warn and return if requestId is missing', () => {
            const msg = { type: 'automation_response' };
            messageHandler.handleMessage(msg as any);
            expect(mockRequestTracker.getPendingRequest).not.toHaveBeenCalled();
        });

        it('should return if no pending request found', () => {
            mockRequestTracker.getPendingRequest.mockReturnValue(undefined);
            const msg = { type: 'automation_response', requestId: '123' };
            messageHandler.handleMessage(msg as any);
            expect(mockRequestTracker.resolveRequest).not.toHaveBeenCalled();
        });

        it('should resolve immediately if waitForEvent is false', () => {
            mockRequestTracker.getPendingRequest.mockReturnValue({
                action: 'test_action',
                waitForEvent: false
            });
            const msg = { type: 'automation_response', requestId: '123', success: true };
            messageHandler.handleMessage(msg as any);
            expect(mockRequestTracker.resolveRequest).toHaveBeenCalledWith('123', expect.objectContaining({ success: true }));
        });

        it('should wait for event if waitForEvent is true and no initialResponse', () => {
            const pending = {
                action: 'test_action',
                waitForEvent: true,
                eventTimeoutMs: 1000,
                initialResponse: undefined
            };
            mockRequestTracker.getPendingRequest.mockReturnValue(pending);
            const msg = { type: 'automation_response', requestId: '123', success: true };

            messageHandler.handleMessage(msg as any);

            expect(pending.initialResponse).toEqual(expect.objectContaining({ success: true }));
            expect(mockRequestTracker.resolveRequest).not.toHaveBeenCalled();
            expect(pending.hasOwnProperty('eventTimeout')).toBe(true);
        });

        it('should resolve immediately if waitForEvent is true but initial response failed', () => {
            const pending = {
                action: 'test_action',
                waitForEvent: true,
                initialResponse: undefined
            };
            mockRequestTracker.getPendingRequest.mockReturnValue(pending);
            const msg = { type: 'automation_response', requestId: '123', success: false };

            messageHandler.handleMessage(msg as any);

            expect(mockRequestTracker.resolveRequest).toHaveBeenCalledWith('123', expect.objectContaining({ success: false }));
        });

        it('should resolve immediately if waitForEvent is true but result is saved', () => {
            const pending = {
                action: 'test_action',
                waitForEvent: true,
                initialResponse: undefined
            };
            mockRequestTracker.getPendingRequest.mockReturnValue(pending);
            const msg = { type: 'automation_response', requestId: '123', success: true, result: { saved: true } };

            messageHandler.handleMessage(msg as any);

            expect(mockRequestTracker.resolveRequest).toHaveBeenCalledWith('123', expect.objectContaining({ success: true }));
        });

        it('should resolve on second response when waitForEvent is true', () => {
            const pending = {
                action: 'test_action',
                waitForEvent: true,
                initialResponse: { type: 'automation_response', requestId: '123', success: true }
            };
            mockRequestTracker.getPendingRequest.mockReturnValue(pending);
            const msg = { type: 'automation_response', requestId: '123', success: true, result: { final: true } };

            messageHandler.handleMessage(msg as any);

            expect(mockRequestTracker.resolveRequest).toHaveBeenCalledWith('123', expect.objectContaining({ result: { final: true } }));
        });

        it('should reject on timeout when waiting for completion event', () => {
            const pending: any = {
                action: 'test_action',
                waitForEvent: true,
                eventTimeoutMs: 1000,
                initialResponse: undefined
            };
            mockRequestTracker.getPendingRequest.mockReturnValue(pending);
            const msg = { type: 'automation_response', requestId: '123', success: true };

            messageHandler.handleMessage(msg as any);

            vi.advanceTimersByTime(1001);

            expect(mockRequestTracker.rejectRequest).toHaveBeenCalledWith('123', expect.any(Error));
            expect(mockRequestTracker.rejectRequest.mock.calls[0][1].message).toContain('Timed out waiting for completion event');
        });
    });

    describe('enforceActionMatch', () => {
        it('should succeed on exact action match', () => {
            mockRequestTracker.getPendingRequest.mockReturnValue({
                action: 'MyAction',
                waitForEvent: false
            });
            const msg = { type: 'automation_response', requestId: '123', action: 'MyAction' };
            messageHandler.handleMessage(msg as any);
            const resolved = mockRequestTracker.resolveRequest.mock.calls[0][1];
            expect(resolved.success).not.toBe(false);
        });

        it('should succeed on prefix match', () => {
            mockRequestTracker.getPendingRequest.mockReturnValue({
                action: 'Create',
                waitForEvent: false
            });
            const msg = { type: 'automation_response', requestId: '123', action: 'CreateActor' };
            messageHandler.handleMessage(msg as any);
            const resolved = mockRequestTracker.resolveRequest.mock.calls[0][1];
            expect(resolved.success).not.toBe(false);
        });

        it('should fail on action mismatch', () => {
            mockRequestTracker.getPendingRequest.mockReturnValue({
                action: 'Create',
                waitForEvent: false
            });
            const msg = { type: 'automation_response', requestId: '123', action: 'Delete' };
            messageHandler.handleMessage(msg as any);
            const resolved = mockRequestTracker.resolveRequest.mock.calls[0][1];
            expect(resolved.success).toBe(false);
            expect(resolved.error).toBe('ACTION_PREFIX_MISMATCH');
        });

        it('should bypass mismatch for consolidated tool actions', () => {
            mockRequestTracker.getPendingRequest.mockReturnValue({
                action: 'inspect',
                waitForEvent: false
            });
            const msg = { type: 'automation_response', requestId: '123', action: 'something_else' };
            messageHandler.handleMessage(msg as any);
            const resolved = mockRequestTracker.resolveRequest.mock.calls[0][1];
            expect(resolved.success).not.toBe(false);
            expect(resolved.error).toBeUndefined();
        });
    });

    describe('handleAutomationEvent', () => {
        it('should resolve pending request with synthetic response', () => {
            const pending = {
                action: 'test_action',
                initialResponse: { success: true }
            };
            mockRequestTracker.getPendingRequest.mockReturnValue(pending);
            const msg = {
                type: 'automation_event',
                requestId: '123',
                event: 'Completed',
                result: { success: true, message: 'Done' }
            };

            messageHandler.handleMessage(msg as any);

            expect(mockRequestTracker.resolveRequest).toHaveBeenCalledWith('123', expect.objectContaining({
                type: 'automation_response',
                success: true,
                message: 'Done'
            }));
        });

        it('should use event field for message if result message is missing', () => {
            const pending = { action: 'test_action' };
            mockRequestTracker.getPendingRequest.mockReturnValue(pending);
            const msg = {
                type: 'automation_event',
                requestId: '123',
                event: 'Completed'
            };

            messageHandler.handleMessage(msg as any);

            expect(mockRequestTracker.resolveRequest).toHaveBeenCalledWith('123', expect.objectContaining({
                message: 'Completed'
            }));
        });

        it('should ignore if requestId is missing', () => {
            const msg = { type: 'automation_event' };
            messageHandler.handleMessage(msg as any);
            expect(mockRequestTracker.getPendingRequest).not.toHaveBeenCalled();
        });

        it('should ignore if no pending request found', () => {
            mockRequestTracker.getPendingRequest.mockReturnValue(undefined);
            const msg = { type: 'automation_event', requestId: '123' };
            messageHandler.handleMessage(msg as any);
            expect(mockRequestTracker.resolveRequest).not.toHaveBeenCalled();
        });
    });

    describe('handleProgressUpdate', () => {
        it('should extend timeout for pending request', () => {
            mockRequestTracker.getPendingRequest.mockReturnValue({ action: 'long_op' });
            mockRequestTracker.extendTimeout.mockReturnValue(true);
            const msg: ProgressUpdateMessage = {
                type: 'progress_update',
                requestId: '123',
                percent: 50,
                message: 'Working...'
            };

            messageHandler.handleMessage(msg);

            expect(mockRequestTracker.extendTimeout).toHaveBeenCalledWith('123', 50, 'Working...');
        });

        it('should warn if extendTimeout returns false', () => {
            mockRequestTracker.getPendingRequest.mockReturnValue({ action: 'long_op' });
            mockRequestTracker.extendTimeout.mockReturnValue(false);
            const msg: ProgressUpdateMessage = {
                type: 'progress_update',
                requestId: '123'
            };

            messageHandler.handleMessage(msg);
            expect(mockRequestTracker.extendTimeout).toHaveBeenCalled();
        });

        it('should ignore if requestId is missing', () => {
            const msg = { type: 'progress_update' };
            messageHandler.handleMessage(msg as any);
            expect(mockRequestTracker.getPendingRequest).not.toHaveBeenCalled();
        });

        it('should ignore if no pending request found', () => {
            mockRequestTracker.getPendingRequest.mockReturnValue(undefined);
            const msg = { type: 'progress_update', requestId: '123' };
            messageHandler.handleMessage(msg as any);
            expect(mockRequestTracker.extendTimeout).not.toHaveBeenCalled();
        });
    });
});
