# Test Case Mapping for `normalizeTransformInput`

| Scenario | Input | Expected Output |
|----------|-------|-----------------|
| **Invalid Input: null** | `null` | `undefined` |
| **Invalid Input: undefined** | `undefined` | `undefined` |
| **Invalid Input: string** | `"invalid"` | `undefined` |
| **Invalid Input: number** | `123` | `undefined` |
| **Empty Object** | `{}` | `undefined` |
| **Object with unrelated keys** | `{ foo: "bar" }` | `undefined` |
| **Full Transform (Objects)** | `{ location: { x: 1, y: 2, z: 3 }, rotation: { pitch: 10, yaw: 20, roll: 30 }, scale: { x: 1, y: 1, z: 1 } }` | `{ location: { x: 1, y: 2, z: 3 }, rotation: { x: 10, y: 20, z: 30 }, scale: { x: 1, y: 1, z: 1 } }` |
| **Partial Transform (Location only)** | `{ location: { x: 1 } }` | `{ location: { x: 1 } }` |
| **Partial Transform (Rotation only, alternate keys)** | `{ rotation: { yaw: 20 } }` | `{ rotation: { y: 20 } }` |
| **Partial Transform (Scale only)** | `{ scale: { z: 5 } }` | `{ scale: { z: 5 } }` |
| **Partial Transform (Mixed components)** | `{ location: { x: 1 }, scale: { z: 5 } }` | `{ location: { x: 1 }, scale: { z: 5 } }` |
| **Full Transform (Arrays)** | `{ location: [1, 2, 3], rotation: [10, 20, 30], scale: [1, 1, 1] }` | `{ location: { x: 1, y: 2, z: 3 }, rotation: { x: 10, y: 20, z: 30 }, scale: { x: 1, y: 1, z: 1 } }` |
| **Partial Transform (Arrays)** | `{ location: [1], rotation: [10, 20], scale: [1, 1, 1, 4] }` | `{ location: { x: 1 }, rotation: { x: 10, y: 20 }, scale: { x: 1, y: 1, z: 1 } }` |
| **Mixed Formats (Array/Object)** | `{ location: [1, 2, 3], rotation: { pitch: 10, roll: 30 } }` | `{ location: { x: 1, y: 2, z: 3 }, rotation: { x: 10, z: 30 } }` |
| **Primitive Component** | `{ location: 100 }` | `{ location: { x: 100 } }` |
| **String Numbers** | `{ location: { x: "100", y: "200.5" } }` | `{ location: { x: 100, y: 200.5 } }` |
| **Invalid Numbers in Components** | `{ location: { x: NaN, y: Infinity, z: "abc" }, scale: { x: 1 } }` | `{ scale: { x: 1 } }` |
