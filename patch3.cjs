const fs = require('fs');
const content = fs.readFileSync('src/tools/animation.ts', 'utf8');

const oldCode = `            const bridge = this.automationBridge;

            // Add states if provided
            if (normalizedStates.length > 0) {
              await Promise.all(normalizedStates.map(state =>
                bridge.sendAutomationRequest('manage_animation_authoring', cleanObject({
                  subAction: 'add_state',
                  blueprintPath,
                  stateMachineName: machineName,
                  stateName: state.name
                }), { timeoutMs: 30000 })
              ));
            }

            // Add transitions if provided
            if (normalizedTransitions.length > 0) {
              await Promise.all(normalizedTransitions.map(transition =>
                bridge.sendAutomationRequest('manage_animation_authoring', cleanObject({
                  subAction: 'add_transition',
                  blueprintPath,
                  stateMachineName: machineName,
                  fromState: transition.sourceState,
                  toState: transition.targetState,
                  crossfadeDuration: 0.2
                }), { timeoutMs: 30000 })
              ));
            }`;

const newCode = `            const bridge = this.automationBridge;
            if (!bridge) {
              return { success: false, message: 'Automation bridge not available', error: 'AUTOMATION_BRIDGE_UNAVAILABLE' };
            }

            // Add states if provided
            if (normalizedStates.length > 0) {
              await Promise.all(normalizedStates.map(state =>
                bridge.sendAutomationRequest('manage_animation_authoring', cleanObject({
                  subAction: 'add_state',
                  blueprintPath,
                  stateMachineName: machineName,
                  stateName: state.name
                }), { timeoutMs: 30000 })
              ));
            }

            // Add transitions if provided
            if (normalizedTransitions.length > 0) {
              await Promise.all(normalizedTransitions.map(transition =>
                bridge.sendAutomationRequest('manage_animation_authoring', cleanObject({
                  subAction: 'add_transition',
                  blueprintPath,
                  stateMachineName: machineName,
                  fromState: transition.sourceState,
                  toState: transition.targetState,
                  crossfadeDuration: 0.2
                }), { timeoutMs: 30000 })
              ));
            }`;

if (content.includes(oldCode)) {
  const newContent = content.replace(oldCode, newCode);
  fs.writeFileSync('src/tools/animation.ts', newContent);
  console.log('Patch applied successfully');
} else {
  console.log('Error: Could not find code to patch');
}
