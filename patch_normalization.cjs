const fs = require('fs');
const path = require('path');
const handlersPath = path.join('src', 'tools', 'handlers', 'blueprint-handlers.ts');
let handlersContent = fs.readFileSync(handlersPath, 'utf8');

const regexMapArgs = /\/\/ sourcePin -> fromPinName, targetPin -> toPinName \(for connect_pins\)\n\s*if \(argsRecord\.sourcePin !== undefined\) \{\n\s*mappedArgs\.fromPinName = argsRecord\.sourcePin;\n\s*\}\n\s*if \(argsRecord\.targetPin !== undefined\) \{\n\s*mappedArgs\.toPinName = argsRecord\.targetPin;\n\s*\}/;

const newMapArgs = `// sourcePin -> fromPinName, targetPin -> toPinName (for connect_pins)
      if (argsRecord.sourcePin !== undefined) {
        mappedArgs.fromPinName = argsRecord.sourcePin;
      }
      if (argsRecord.targetPin !== undefined) {
        mappedArgs.toPinName = argsRecord.targetPin;
      }
      if (argsRecord.fromPin !== undefined) {
        mappedArgs.fromPinName = argsRecord.fromPin;
      }
      if (argsRecord.toPin !== undefined) {
        mappedArgs.toPinName = argsRecord.toPin;
      }
      if (argsRecord.outputPin !== undefined) {
        mappedArgs.fromPinName = argsRecord.outputPin;
      }
      if (argsRecord.inputPin !== undefined) {
        mappedArgs.toPinName = argsRecord.inputPin;
      }`;

handlersContent = handlersContent.replace(regexMapArgs, newMapArgs);
fs.writeFileSync(handlersPath, handlersContent, 'utf8');
console.log("Input normalization patched");
