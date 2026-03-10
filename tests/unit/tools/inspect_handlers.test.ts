import { describe, expect, it } from 'vitest';
import {
  classifyDependencyKind,
  createDiagnosticIssue,
  groupDependenciesByType,
  inferInspectionValueType,
  looksLikeMountedObjectPath,
  normalizeInspectAction,
  normalizeInspectionEnvelope,
  resolveValueAtPath,
  tokenizePropertyPath
} from '../../../src/tools/handlers/inspect-handlers.js';

describe('inspect handler helpers', () => {
  it('normalizes inspect_class to describe_class', () => {
    expect(normalizeInspectAction('inspect_class')).toBe('describe_class');
    expect(normalizeInspectAction('get_actor_details')).toBe('inspect_object');
  });

  it('recognizes mounted object paths without rewriting them', () => {
    expect(looksLikeMountedObjectPath('/TajsGraph/MM_FactoryBaked.MM_FactoryBaked')).toBe(true);
    expect(looksLikeMountedObjectPath('/SML/BP_Config.BP_Config')).toBe(true);
    expect(looksLikeMountedObjectPath('Factory_Wall_01')).toBe(false);
  });

  it('tokenizes property paths with array and map style access', () => {
    expect(tokenizePropertyPath('StaticMaterials[0].MaterialInterface')).toEqual([
      'StaticMaterials',
      0,
      'MaterialInterface'
    ]);
    expect(tokenizePropertyPath('StaticSwitchParameters[UseNanite]')).toEqual([
      'StaticSwitchParameters',
      'UseNanite'
    ]);
  });

  it('resolves values from nested exported property data', () => {
    const source = {
      StaticMaterials: [
        { MaterialInterface: '/Game/M_Test.M_Test' }
      ],
      StaticSwitchParameters: {
        UseNanite: true
      }
    };

    expect(resolveValueAtPath(source, ['StaticMaterials', 0, 'MaterialInterface'])).toEqual({
      found: true,
      value: '/Game/M_Test.M_Test'
    });
    expect(resolveValueAtPath(source, ['StaticSwitchParameters', 'UseNanite'])).toEqual({
      found: true,
      value: true
    });
  });

  it('normalizes inspection envelopes into the new response contract', () => {
    const result = normalizeInspectionEnvelope({
      objectPath: '/TajsGraph/SM/SM_Wall.SM_Wall',
      className: 'StaticMesh',
      propertyName: 'NaniteSettings',
      value: { bEnabled: true }
    });

    expect(result.resolvedObjectPath).toBe('/TajsGraph/SM/SM_Wall.SM_Wall');
    expect(result.className).toBe('StaticMesh');
    expect(result.propertyPath).toBe('NaniteSettings');
    expect(result.valueType).toBe('object');
    expect(result.warnings).toEqual([]);
  });

  it('infers stable value types for structured inspection results', () => {
    expect(inferInspectionValueType(['a', 'b'])).toBe('array');
    expect(inferInspectionValueType({ enabled: true })).toBe('object');
    expect(inferInspectionValueType(true)).toBe('boolean');
  });

  it('classifies dependency entries into workflow-relevant groups', () => {
    expect(classifyDependencyKind('/TajsGraph/Materials/M_Factory.M_Factory')).toBe('material');
    expect(classifyDependencyKind('/TajsGraph/UI/WBP_Factory.WBP_Factory')).toBe('widget');
    expect(classifyDependencyKind('/TajsGraph/Meshes/SM_Foundation.SM_Foundation')).toBe('mesh');
  });

  it('groups dependencies by type while preserving mount-root scoping', () => {
    const grouped = groupDependenciesByType([
      { path: '/TajsGraph/Meshes/SM_A.SM_A' },
      { path: '/TajsGraph/Materials/M_A.M_A' },
      { path: '/OtherMod/Materials/M_B.M_B' }
    ], '/TajsGraph');

    expect(grouped.mesh).toHaveLength(1);
    expect(grouped.material).toHaveLength(1);
    expect(grouped.other).toHaveLength(0);
  });

  it('creates stable diagnostic issues for workflow checks', () => {
    expect(createDiagnosticIssue('descriptor', 'Plugin has no declared modules')).toEqual({
      severity: 'warning',
      category: 'descriptor',
      code: 'DESCRIPTOR_PLUGIN_HAS_NO_DECLARED_MODULES',
      message: 'Plugin has no declared modules'
    });
  });
});
