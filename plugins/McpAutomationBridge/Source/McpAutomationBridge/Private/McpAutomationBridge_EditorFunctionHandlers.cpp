#include "McpAutomationBridgeGlobals.h"
#include "Dom/JsonObject.h"
#include "McpAutomationBridgeHelpers.h"
#include "McpAutomationBridgeSubsystem.h"
#if WITH_EDITOR
#include "Editor.h"
#include "GameFramework/Pawn.h"
#if __has_include("Subsystems/EditorActorSubsystem.h")
#include "Subsystems/EditorActorSubsystem.h"
#elif __has_include("EditorActorSubsystem.h")
#include "EditorActorSubsystem.h"
#endif
#if __has_include("Subsystems/UnrealEditorSubsystem.h")
#include "Subsystems/UnrealEditorSubsystem.h"
#elif __has_include("UnrealEditorSubsystem.h")
#include "UnrealEditorSubsystem.h"
#endif
#if __has_include("Subsystems/LevelEditorSubsystem.h")
#include "Subsystems/LevelEditorSubsystem.h"
#elif __has_include("LevelEditorSubsystem.h")
#include "LevelEditorSubsystem.h"
#endif
#include "AssetToolsModule.h"
#include "EditorAssetLibrary.h"
#if __has_include("EditorLoadingAndSavingUtils.h")
#include "EditorLoadingAndSavingUtils.h"
#elif __has_include("FileHelpers.h")
#include "FileHelpers.h"
#endif
#include "Factories/Factory.h"
#include "Interfaces/IPluginManager.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/Base64.h"
#include "Misc/FileHelper.h"
#include "Sound/SoundBase.h"
#include "Sound/SoundCue.h"
#include "UObject/SoftObjectPath.h"
#include "Misc/Paths.h"
#include "Serialization/JsonSerializer.h"
#if __has_include("Blueprint/UserWidget.h")
#include "Blueprint/UserWidget.h"
#endif
#if __has_include("GameFramework/PlayerController.h")
#include "GameFramework/PlayerController.h"
#endif
#include "EngineUtils.h"
#include "GameFramework/WorldSettings.h"
#include "Misc/OutputDeviceNull.h"
#endif

#if WITH_EDITOR
namespace {

static bool McpIsPythonPluginEnabled() {
  const TSharedPtr<IPlugin> PythonPlugin =
      IPluginManager::Get().FindPlugin(TEXT("PythonScriptPlugin"));
  return PythonPlugin.IsValid() && PythonPlugin->IsEnabled();
}

static FString McpEscapeForPythonLiteral(const FString& Value) {
  FString Escaped = Value.Replace(TEXT("\\"), TEXT("\\\\"));
  Escaped = Escaped.Replace(TEXT("'"), TEXT("\\'"));
  return Escaped;
}

static FString McpSerializeJsonObject(const TSharedPtr<FJsonObject>& Object) {
  if (!Object.IsValid()) {
    return TEXT("{}");
  }

  FString Json;
  TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Json);
  if (!FJsonSerializer::Serialize(Object.ToSharedRef(), Writer)) {
    return TEXT("{}");
  }
  return Json;
}

static FString McpBase64EncodeUtf8(const FString& Value) {
  FTCHARToUTF8 Converter(*Value);
  return FBase64::Encode(reinterpret_cast<const uint8*>(Converter.Get()),
                         Converter.Length());
}

static bool McpExecutePythonScriptText(const FString& Script,
                                       const FString& FailureMessage,
                                       TSharedPtr<FJsonObject>& OutResult,
                                       FString& OutError) {
  if (!McpIsPythonPluginEnabled()) {
    OutError = TEXT("PythonScriptPlugin is not enabled.");
    return false;
  }

  const FString TempDir =
      FPaths::Combine(FPaths::ProjectSavedDir(), TEXT("McpAutomationBridge"),
                      TEXT("PythonFallback"));
  IFileManager::Get().MakeDirectory(*TempDir, true);

  const FString Token = FGuid::NewGuid().ToString(EGuidFormats::Digits);
  const FString ScriptPath =
      FPaths::ConvertRelativePathToFull(FPaths::Combine(TempDir, Token + TEXT(".py")));
  const FString OutputPath =
      FPaths::ConvertRelativePathToFull(FPaths::Combine(TempDir, Token + TEXT(".json")));

  const FString FinalScript =
      Script.Replace(TEXT("__MCP_OUTPUT_PATH__"),
                     *McpEscapeForPythonLiteral(OutputPath));

  if (!FFileHelper::SaveStringToFile(FinalScript, *ScriptPath, FFileHelper::EEncodingOptions::ForceUTF8WithoutBOM)) {
    OutError = TEXT("Unable to write Python script to disk.");
    return false;
  }

  FString PythonCommand = FString::Printf(
      TEXT("py exec(compile(open(r'%s', encoding='utf-8').read(), r'%s', 'exec'))"),
      *McpEscapeForPythonLiteral(ScriptPath),
      *McpEscapeForPythonLiteral(ScriptPath));

  bool bExecuted = false;
  if (GEditor) {
    UWorld* TargetWorld = GEditor->GetEditorWorldContext().World();
    bExecuted = GEditor->Exec(TargetWorld, *PythonCommand);
  }

  if (!bExecuted) {
    OutError = FailureMessage;
    IFileManager::Get().Delete(*ScriptPath);
    return false;
  }

  FString JsonText;
  if (!FFileHelper::LoadFileToString(JsonText, *OutputPath)) {
    OutError = TEXT("Python template did not produce an output payload.");
    IFileManager::Get().Delete(*ScriptPath);
    return false;
  }

  TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(JsonText);
  if (!FJsonSerializer::Deserialize(Reader, OutResult) || !OutResult.IsValid()) {
    OutError = TEXT("Python template output could not be parsed as JSON.");
    IFileManager::Get().Delete(*ScriptPath);
    IFileManager::Get().Delete(*OutputPath);
    return false;
  }

  IFileManager::Get().Delete(*ScriptPath);
  IFileManager::Get().Delete(*OutputPath);
  return true;
}

static bool McpRunPythonArbitraryCode(const FString& Code,
                                      const FString& ResultVariable,
                                      const TSharedPtr<FJsonObject>& Params,
                                      const FString& SourceLabel,
                                      TSharedPtr<FJsonObject>& OutResult,
                                      FString& OutError);

static bool McpRunPythonTemplate(const FString& TemplateName,
                                 const TSharedPtr<FJsonObject>& Params,
                                 TSharedPtr<FJsonObject>& OutResult,
                                 FString& OutError) {
  FString Code;
  if (TemplateName.Equals(TEXT("list_selected_assets"), ESearchCase::IgnoreCase)) {
    Code =
        TEXT("selected = unreal.EditorUtilityLibrary.get_selected_asset_data()\n")
        TEXT("result = {\n")
        TEXT("    'success': True,\n")
        TEXT("    'items': [data.get_asset().get_path_name() for data in selected if data and data.get_asset()],\n")
        TEXT("}\n")
        TEXT("result['count'] = len(result['items'])\n");
  } else if (TemplateName.Equals(TEXT("list_selected_actors"), ESearchCase::IgnoreCase)) {
    Code =
        TEXT("selected = unreal.EditorLevelLibrary.get_selected_level_actors()\n")
        TEXT("result = {\n")
        TEXT("    'success': True,\n")
        TEXT("    'items': [actor.get_path_name() for actor in selected if actor],\n")
        TEXT("}\n")
        TEXT("result['count'] = len(result['items'])\n");
  } else if (TemplateName.Equals(TEXT("list_assets_in_path"), ESearchCase::IgnoreCase)) {
    Code =
        TEXT("path = str(mcp_params.get('path') or '')\n")
        TEXT("if not path:\n")
        TEXT("    raise RuntimeError(\"Template 'list_assets_in_path' requires path.\")\n")
        TEXT("recursive = bool(mcp_params.get('recursive', False))\n")
        TEXT("items = unreal.EditorAssetLibrary.list_assets(path, recursive=recursive, include_folder=False)\n")
        TEXT("result = {'success': True, 'items': items, 'count': len(items), 'path': path, 'recursive': recursive}\n");
  } else if (TemplateName.Equals(TEXT("list_assets_by_mount_root"), ESearchCase::IgnoreCase)) {
    Code =
        TEXT("path = str(mcp_params.get('mountRoot') or mcp_params.get('path') or '')\n")
        TEXT("if not path:\n")
        TEXT("    raise RuntimeError(\"Template 'list_assets_by_mount_root' requires mountRoot or path.\")\n")
        TEXT("recursive = bool(mcp_params.get('recursive', True))\n")
        TEXT("items = unreal.EditorAssetLibrary.list_assets(path, recursive=recursive, include_folder=False)\n")
        TEXT("result = {'success': True, 'items': items, 'count': len(items), 'mountRoot': path, 'recursive': recursive}\n");
  } else if (TemplateName.Equals(TEXT("find_assets_by_class"), ESearchCase::IgnoreCase)) {
    Code =
        TEXT("path = str(mcp_params.get('path') or '/Game')\n")
        TEXT("class_name = str(mcp_params.get('className') or '').strip()\n")
        TEXT("if not class_name:\n")
        TEXT("    raise RuntimeError(\"Template 'find_assets_by_class' requires className.\")\n")
        TEXT("recursive = bool(mcp_params.get('recursive', True))\n")
        TEXT("asset_paths = unreal.EditorAssetLibrary.list_assets(path, recursive=recursive, include_folder=False)\n")
        TEXT("matches = []\n")
        TEXT("for asset_path in asset_paths:\n")
        TEXT("    asset = unreal.EditorAssetLibrary.load_asset(asset_path)\n")
        TEXT("    if asset and asset.get_class().get_name() == class_name:\n")
        TEXT("        matches.append(asset_path)\n")
        TEXT("result = {'success': True, 'items': matches, 'count': len(matches), 'path': path, 'className': class_name, 'recursive': recursive}\n");
  } else if (TemplateName.Equals(TEXT("get_asset_details"), ESearchCase::IgnoreCase)) {
    Code =
        TEXT("path = str(mcp_params.get('path') or '')\n")
        TEXT("if not path:\n")
        TEXT("    raise RuntimeError(\"Template 'get_asset_details' requires path.\")\n")
        TEXT("asset = unreal.EditorAssetLibrary.load_asset(path)\n")
        TEXT("if not asset:\n")
        TEXT("    raise RuntimeError(f\"Unable to load asset: {path}\")\n")
        TEXT("asset_class = asset.get_class()\n")
        TEXT("package_name = asset.get_outermost().get_name() if asset.get_outermost() else ''\n")
        TEXT("result = {\n")
        TEXT("    'success': True,\n")
        TEXT("    'path': asset.get_path_name(),\n")
        TEXT("    'name': asset.get_name(),\n")
        TEXT("    'className': asset_class.get_name() if asset_class else '',\n")
        TEXT("    'packageName': package_name,\n")
        TEXT("    'exists': unreal.EditorAssetLibrary.does_asset_exist(path),\n")
        TEXT("}\n");
  } else if (TemplateName.Equals(TEXT("check_asset_loadability"), ESearchCase::IgnoreCase)) {
    Code =
        TEXT("path = str(mcp_params.get('path') or '')\n")
        TEXT("if not path:\n")
        TEXT("    raise RuntimeError(\"Template 'check_asset_loadability' requires path.\")\n")
        TEXT("asset = unreal.EditorAssetLibrary.load_asset(path)\n")
        TEXT("asset_class = asset.get_class() if asset else None\n")
        TEXT("result = {\n")
        TEXT("    'success': True,\n")
        TEXT("    'path': path,\n")
        TEXT("    'loadable': bool(asset),\n")
        TEXT("    'className': asset_class.get_name() if asset_class else '',\n")
        TEXT("}\n");
  } else if (TemplateName.Equals(TEXT("get_selected_asset_details"), ESearchCase::IgnoreCase)) {
    Code =
        TEXT("selected = unreal.EditorUtilityLibrary.get_selected_asset_data()\n")
        TEXT("items = []\n")
        TEXT("for data in selected:\n")
        TEXT("    asset = data.get_asset() if data else None\n")
        TEXT("    if not asset:\n")
        TEXT("        continue\n")
        TEXT("    asset_class = asset.get_class()\n")
        TEXT("    items.append({\n")
        TEXT("        'path': asset.get_path_name(),\n")
        TEXT("        'name': asset.get_name(),\n")
        TEXT("        'className': asset_class.get_name() if asset_class else '',\n")
        TEXT("    })\n")
        TEXT("result = {'success': True, 'items': items, 'count': len(items)}\n");
  } else if (TemplateName.Equals(TEXT("find_actors_by_class"), ESearchCase::IgnoreCase)) {
    Code =
        TEXT("class_name = str(mcp_params.get('className') or '').strip()\n")
        TEXT("if not class_name:\n")
        TEXT("    raise RuntimeError(\"Template 'find_actors_by_class' requires className.\")\n")
        TEXT("actors = unreal.EditorLevelLibrary.get_all_level_actors()\n")
        TEXT("matches = []\n")
        TEXT("for actor in actors:\n")
        TEXT("    actor_class = actor.get_class() if actor else None\n")
        TEXT("    if actor_class and actor_class.get_name() == class_name:\n")
        TEXT("        matches.append(actor.get_path_name())\n")
        TEXT("result = {'success': True, 'items': matches, 'count': len(matches), 'className': class_name}\n");
  } else if (TemplateName.Equals(TEXT("get_actor_details"), ESearchCase::IgnoreCase)) {
    Code =
        TEXT("actor_path = str(mcp_params.get('path') or '')\n")
        TEXT("if not actor_path:\n")
        TEXT("    raise RuntimeError(\"Template 'get_actor_details' requires path.\")\n")
        TEXT("target = None\n")
        TEXT("for actor in unreal.EditorLevelLibrary.get_all_level_actors():\n")
        TEXT("    if actor and actor.get_path_name() == actor_path:\n")
        TEXT("        target = actor\n")
        TEXT("        break\n")
        TEXT("if not target:\n")
        TEXT("    raise RuntimeError(f\"Unable to find actor: {actor_path}\")\n")
        TEXT("actor_class = target.get_class()\n")
        TEXT("location = target.get_actor_location()\n")
        TEXT("rotation = target.get_actor_rotation()\n")
        TEXT("scale = target.get_actor_scale3d()\n")
        TEXT("result = {\n")
        TEXT("    'success': True,\n")
        TEXT("    'path': target.get_path_name(),\n")
        TEXT("    'name': target.get_name(),\n")
        TEXT("    'className': actor_class.get_name() if actor_class else '',\n")
        TEXT("    'location': {'x': location.x, 'y': location.y, 'z': location.z},\n")
        TEXT("    'rotation': {'pitch': rotation.pitch, 'yaw': rotation.yaw, 'roll': rotation.roll},\n")
        TEXT("    'scale': {'x': scale.x, 'y': scale.y, 'z': scale.z},\n")
        TEXT("}\n");
  } else if (TemplateName.Equals(TEXT("get_editor_world"), ESearchCase::IgnoreCase)) {
    Code =
        TEXT("world = unreal.EditorLevelLibrary.get_editor_world()\n")
        TEXT("result = {\n")
        TEXT("    'success': True,\n")
        TEXT("    'path': world.get_path_name() if world else '',\n")
        TEXT("    'name': world.get_name() if world else '',\n")
        TEXT("    'className': world.get_class().get_name() if world and world.get_class() else '',\n")
        TEXT("}\n");
  } else if (TemplateName.Equals(TEXT("run_editor_utility"),
                                 ESearchCase::IgnoreCase)) {
    Code =
        TEXT("path = str(mcp_params.get('path') or '')\n")
        TEXT("if not path:\n")
        TEXT("    raise RuntimeError(\"Template 'run_editor_utility' requires path.\")\n")
        TEXT("asset = unreal.EditorAssetLibrary.load_asset(path)\n")
        TEXT("if not asset:\n")
        TEXT("    raise RuntimeError(f\"Unable to load editor utility asset: {path}\")\n")
        TEXT("subsystem = unreal.get_editor_subsystem(unreal.EditorUtilitySubsystem)\n")
        TEXT("asset_class_name = asset.get_class().get_name() if asset.get_class() else ''\n")
        TEXT("result = {'success': True, 'path': path, 'className': asset_class_name}\n")
        TEXT("if 'EditorUtilityWidgetBlueprint' in asset_class_name:\n")
        TEXT("    subsystem.spawn_and_register_tab(asset)\n")
        TEXT("    result['mode'] = 'widget'\n")
        TEXT("else:\n")
        TEXT("    result['mode'] = 'utility'\n")
        TEXT("    result['ran'] = bool(subsystem.try_run(asset))\n");
  } else if (TemplateName.Equals(TEXT("validate_selected_assets"),
                                 ESearchCase::IgnoreCase)) {
    Code =
        TEXT("selected = unreal.EditorUtilityLibrary.get_selected_asset_data()\n")
        TEXT("validator = unreal.get_editor_subsystem(unreal.EditorValidatorSubsystem)\n")
        TEXT("items = []\n")
        TEXT("limit_value = mcp_params.get('limit')\n")
        TEXT("limit = int(limit_value) if isinstance(limit_value, (int, float)) else None\n")
        TEXT("for index, data in enumerate(selected):\n")
        TEXT("    if limit is not None and index >= limit:\n")
        TEXT("        break\n")
        TEXT("    asset = data.get_asset() if data else None\n")
        TEXT("    if not asset:\n")
        TEXT("        continue\n")
        TEXT("    entry = {'path': asset.get_path_name(), 'name': asset.get_name()}\n")
        TEXT("    if validator:\n")
        TEXT("        validation_result = validator.validate_loaded_asset(asset)\n")
        TEXT("        entry['validationResult'] = str(validation_result)\n")
        TEXT("    items.append(entry)\n")
        TEXT("result = {'success': True, 'items': items, 'count': len(items)}\n");
  } else if (TemplateName.Equals(TEXT("audit_assets_in_path"),
                                 ESearchCase::IgnoreCase)) {
    Code =
        TEXT("path = str(mcp_params.get('path') or '')\n")
        TEXT("if not path:\n")
        TEXT("    raise RuntimeError(\"Template 'audit_assets_in_path' requires path.\")\n")
        TEXT("recursive = bool(mcp_params.get('recursive', True))\n")
        TEXT("class_name_filter = str(mcp_params.get('className') or '').strip()\n")
        TEXT("limit_value = mcp_params.get('limit')\n")
        TEXT("limit = int(limit_value) if isinstance(limit_value, (int, float)) else None\n")
        TEXT("asset_paths = unreal.EditorAssetLibrary.list_assets(path, recursive=recursive, include_folder=False)\n")
        TEXT("items = []\n")
        TEXT("class_counts = {}\n")
        TEXT("for asset_path in asset_paths:\n")
        TEXT("    asset = unreal.EditorAssetLibrary.load_asset(asset_path)\n")
        TEXT("    if not asset:\n")
        TEXT("        continue\n")
        TEXT("    class_name = asset.get_class().get_name() if asset.get_class() else ''\n")
        TEXT("    if class_name_filter and class_name != class_name_filter:\n")
        TEXT("        continue\n")
        TEXT("    class_counts[class_name] = class_counts.get(class_name, 0) + 1\n")
        TEXT("    items.append({'path': asset_path, 'name': asset.get_name(), 'className': class_name})\n")
        TEXT("    if limit is not None and len(items) >= limit:\n")
        TEXT("        break\n")
        TEXT("result = {\n")
        TEXT("    'success': True,\n")
        TEXT("    'path': path,\n")
        TEXT("    'recursive': recursive,\n")
        TEXT("    'classNameFilter': class_name_filter,\n")
        TEXT("    'count': len(items),\n")
        TEXT("    'items': items,\n")
        TEXT("    'classCounts': class_counts,\n")
        TEXT("}\n");
  } else if (TemplateName.Equals(TEXT("audit_mod_config_asset"),
                                 ESearchCase::IgnoreCase)) {
    Code =
        TEXT("path = str(mcp_params.get('path') or mcp_params.get('objectPath') or '')\n")
        TEXT("if not path:\n")
        TEXT("    raise RuntimeError(\"Template 'audit_mod_config_asset' requires path or objectPath.\")\n")
        TEXT("asset = unreal.EditorAssetLibrary.load_asset(path)\n")
        TEXT("if not asset:\n")
        TEXT("    raise RuntimeError(f\"Unable to load mod-config asset: {path}\")\n")
        TEXT("asset_class = asset.get_class()\n")
        TEXT("root_section = getattr(asset, 'root_section', None)\n")
        TEXT("result = {\n")
        TEXT("    'success': True,\n")
        TEXT("    'path': path,\n")
        TEXT("    'className': asset_class.get_name() if asset_class else '',\n")
        TEXT("    'hasRootSection': root_section is not None,\n")
        TEXT("    'rootSectionClass': root_section.get_class().get_name() if root_section and root_section.get_class() else '',\n")
        TEXT("}\n");
  } else if (TemplateName.Equals(TEXT("mcp_blueprint"), ESearchCase::IgnoreCase)) {
    Code =
        TEXT("bp_path = str(mcp_params.get('blueprintPath') or '')\n")
        TEXT("if not bp_path:\n")
        TEXT("    raise RuntimeError(\"mcp_blueprint template requires blueprintPath\")\n")
        TEXT("asset = unreal.EditorAssetLibrary.load_asset(bp_path)\n")
        TEXT("if not asset:\n")
        TEXT("    raise RuntimeError(f\"Could not load asset at {bp_path}\")\n")
        TEXT("sub_action = str(mcp_params.get('subAction') or '')\n")
        TEXT("result = {'success': True, 'blueprintPath': bp_path, 'subAction': sub_action}\n")
        TEXT("if sub_action == 'get_event_graph':\n")
        TEXT("    graphs = []\n")
        TEXT("    try:\n")
        TEXT("        graphs = asset.get_editor_property('uber_graph_pages')\n")
        TEXT("    except:\n")
        TEXT("        pass\n")
        TEXT("    if not graphs:\n")
        TEXT("        try:\n")
        TEXT("            graphs = asset.get_editor_property('function_graphs')\n")
        TEXT("        except:\n")
        TEXT("            pass\n")
        TEXT("    event_graph = None\n")
        TEXT("    for g in graphs:\n")
        TEXT("        if g.get_name() == 'EventGraph':\n")
        TEXT("            event_graph = g\n")
        TEXT("            break\n")
        TEXT("    if not event_graph and graphs:\n")
        TEXT("        event_graph = graphs[0]\n")
        TEXT("    if event_graph:\n")
        TEXT("        result['graphName'] = event_graph.get_name()\n")
        TEXT("        result['graphPath'] = event_graph.get_path_name()\n")
        TEXT("    else:\n")
        TEXT("        raise RuntimeError(\"Could not find EventGraph\")\n")
        TEXT("elif sub_action in ['create_call_function_node', 'set_node_pin_value', 'create_add_delegate', 'connect_pins']:\n")
        TEXT("    result['message'] = f\"Use manage_blueprint_graph.{sub_action} tool action directly for safer and more robust results. The C++ handlers have been improved to support your workflow directly.\"\n")
        TEXT("else:\n")
        TEXT("    raise RuntimeError(f\"Unknown subAction: {sub_action}\")\n");
  } else {
    OutError = FString::Printf(TEXT("Unsupported Python template '%s'."), *TemplateName);
    return false;
  }

  return McpRunPythonArbitraryCode(
      Code, TEXT("result"), Params,
      FString::Printf(TEXT("<python-template:%s>"), *TemplateName), OutResult,
      OutError);
}

static bool McpRunPythonArbitraryCode(const FString& Code,
                                      const FString& ResultVariable,
                                      const TSharedPtr<FJsonObject>& Params,
                                      const FString& SourceLabel,
                                      TSharedPtr<FJsonObject>& OutResult,
                                      FString& OutError) {
  if (Code.TrimStartAndEnd().IsEmpty()) {
    OutError = TEXT("Python code is empty.");
    return false;
  }

  const FString ResultName =
      ResultVariable.TrimStartAndEnd().IsEmpty() ? TEXT("result")
                                                 : ResultVariable.TrimStartAndEnd();
  const FString ParamsJson = McpSerializeJsonObject(Params);
  const FString EncodedParams = McpBase64EncodeUtf8(ParamsJson);
  const FString EncodedCode = McpBase64EncodeUtf8(Code);
  const FString EscapedResultName = McpEscapeForPythonLiteral(ResultName);
  const FString EffectiveSourceLabel = SourceLabel.TrimStartAndEnd().IsEmpty()
                                           ? TEXT("<mcp-python>")
                                           : SourceLabel.TrimStartAndEnd();
  const FString EscapedSourceLabel =
      McpEscapeForPythonLiteral(EffectiveSourceLabel);
  const FString Script = FString::Printf(
      TEXT("import base64\n")
      TEXT("import contextlib\n")
      TEXT("import io\n")
      TEXT("import json\n")
      TEXT("import traceback\n")
      TEXT("import unreal\n")
      TEXT("\n")
      TEXT("def _mcp_to_jsonable(value, depth=0):\n")
      TEXT("    if depth > 8:\n")
      TEXT("        return str(value)\n")
      TEXT("    if value is None or isinstance(value, (bool, int, float, str)):\n")
      TEXT("        return value\n")
      TEXT("    if isinstance(value, (list, tuple, set)):\n")
      TEXT("        return [_mcp_to_jsonable(v, depth + 1) for v in list(value)]\n")
      TEXT("    if isinstance(value, dict):\n")
      TEXT("        return {str(k): _mcp_to_jsonable(v, depth + 1) for k, v in value.items()}\n")
      TEXT("    try:\n")
      TEXT("        if hasattr(value, 'get_path_name'):\n")
      TEXT("            return {\n")
      TEXT("                'type': type(value).__name__,\n")
      TEXT("                'name': value.get_name() if hasattr(value, 'get_name') else str(value),\n")
      TEXT("                'path': value.get_path_name(),\n")
      TEXT("            }\n")
      TEXT("    except Exception:\n")
      TEXT("        pass\n")
      TEXT("    try:\n")
      TEXT("        if hasattr(value, 'get_name'):\n")
      TEXT("            return {'type': type(value).__name__, 'name': value.get_name()}\n")
      TEXT("    except Exception:\n")
      TEXT("        pass\n")
      TEXT("    return str(value)\n")
      TEXT("\n")
      TEXT("_mcp_params = json.loads(base64.b64decode('%s').decode('utf-8'))\n")
      TEXT("_mcp_stdout = io.StringIO()\n")
      TEXT("_mcp_stderr = io.StringIO()\n")
      TEXT("_mcp_globals = {\n")
      TEXT("    '__name__': '__main__',\n")
      TEXT("    'unreal': unreal,\n")
      TEXT("    'mcp_params': _mcp_params,\n")
      TEXT("    '%s': {'success': True},\n")
      TEXT("}\n")
      TEXT("with contextlib.redirect_stdout(_mcp_stdout), contextlib.redirect_stderr(_mcp_stderr):\n")
      TEXT("    try:\n")
      TEXT("        _mcp_code = base64.b64decode('%s').decode('utf-8')\n")
      TEXT("        exec(compile(_mcp_code, '%s', 'exec'), _mcp_globals, _mcp_globals)\n")
      TEXT("        _mcp_result = _mcp_globals.get('%s', {'success': True})\n")
      TEXT("        if callable(_mcp_globals.get('main')) and _mcp_result == {'success': True}:\n")
      TEXT("            _mcp_result = _mcp_globals['main'](_mcp_params)\n")
      TEXT("    except Exception as exc:\n")
      TEXT("        _mcp_result = {'success': False, 'error': str(exc), 'traceback': traceback.format_exc()}\n")
      TEXT("_mcp_payload = _mcp_result if isinstance(_mcp_result, dict) else {'success': True, 'result': _mcp_to_jsonable(_mcp_result)}\n")
      TEXT("_mcp_payload = _mcp_to_jsonable(_mcp_payload)\n")
      TEXT("if isinstance(_mcp_payload, dict):\n")
      TEXT("    _mcp_payload.setdefault('success', True)\n")
      TEXT("    _mcp_payload['stdout'] = _mcp_stdout.getvalue()\n")
      TEXT("    _mcp_payload['stderr'] = _mcp_stderr.getvalue()\n")
      TEXT("    _mcp_payload['resultVariable'] = '%s'\n")
      TEXT("    _mcp_payload['source'] = '%s'\n")
      TEXT("with open(r'__MCP_OUTPUT_PATH__', 'w', encoding='utf-8') as fp:\n")
      TEXT("    json.dump(_mcp_payload, fp)\n"),
      *EncodedParams, *EscapedResultName, *EncodedCode, *EscapedSourceLabel,
      *EscapedResultName, *EscapedResultName, *EscapedSourceLabel);

  return McpExecutePythonScriptText(
      Script, TEXT("Failed to execute Python code in editor."), OutResult,
      OutError);
}

static bool McpRunPythonFile(const FString& FilePath,
                             const FString& ResultVariable,
                             const TSharedPtr<FJsonObject>& Params,
                             TSharedPtr<FJsonObject>& OutResult,
                             FString& OutError) {
  if (FilePath.TrimStartAndEnd().IsEmpty()) {
    OutError = TEXT("Python file path is empty.");
    return false;
  }
  const FString NormalizedFilePath =
      FPaths::ConvertRelativePathToFull(FilePath.TrimStartAndEnd());
  FString Code;
  if (!FFileHelper::LoadFileToString(Code, *NormalizedFilePath)) {
    OutError = TEXT("Unable to read Python file.");
    return false;
  }
  const FString WrappedCode = FString::Printf(
      TEXT("__file__ = r'%s'\n")
      TEXT("%s"),
      *McpEscapeForPythonLiteral(NormalizedFilePath), *Code);
  return McpRunPythonArbitraryCode(WrappedCode, ResultVariable, Params,
                                   NormalizedFilePath, OutResult, OutError);
}

} // namespace
#endif

bool UMcpAutomationBridgeSubsystem::HandleExecuteEditorFunction(
    const FString &RequestId, const FString &Action,
    const TSharedPtr<FJsonObject> &Payload,
    TSharedPtr<FMcpBridgeWebSocket> RequestingSocket) {
  const FString Lower = Action.ToLower();
  // Accept either the generic execute_editor_function action or the
  // more specific execute_console_command action. This allows the
  // server to use native console commands for health checks and diagnostics.
  if (!Lower.Equals(TEXT("execute_editor_function"), ESearchCase::IgnoreCase) &&
      !Lower.Contains(TEXT("execute_editor_function")) &&
      !Lower.Equals(TEXT("execute_console_command")) &&
      !Lower.Contains(TEXT("execute_console_command")))
    return false;

  if (!Payload.IsValid()) {
    SendAutomationError(RequestingSocket, RequestId,
                        TEXT("execute_editor_function payload missing."),
                        TEXT("INVALID_PAYLOAD"));
    return true;
  }

  // Handle native console command action first — console commands
  // carry a top-level `command` (or params.command) and should not
  // be treated as a generic execute_editor_function requiring a
  // functionName field.
  if (Lower.Equals(TEXT("execute_console_command")) ||
      Lower.Contains(TEXT("execute_console_command"))) {
    // Accept either a top-level 'command' string or nested params.command
    FString Cmd;
    if (!Payload->TryGetStringField(TEXT("command"), Cmd)) {
      const TSharedPtr<FJsonObject> *ParamsPtr = nullptr;
      if (Payload->TryGetObjectField(TEXT("params"), ParamsPtr) && ParamsPtr &&
          (*ParamsPtr).IsValid()) {
        (*ParamsPtr)->TryGetStringField(TEXT("command"), Cmd);
      }
    }
    if (Cmd.IsEmpty()) {
      SendAutomationError(RequestingSocket, RequestId, TEXT("command required"),
                          TEXT("INVALID_ARGUMENT"));
      return true;
    }

    if (!GEditor) {
      SendAutomationResponse(RequestingSocket, RequestId, false,
                             TEXT("Editor not available"), nullptr,
                             TEXT("EDITOR_NOT_AVAILABLE"));
      return true;
    }

    bool bExecCalled = false;
    bool bOk = false;

    // Prefer executing with a valid editor world context where possible to
    // avoid assertions inside engine helpers that require a proper world
    // (e.g. when running Open/Map commands).
    UWorld *TargetWorld = nullptr;
#if WITH_EDITOR
    if (GEditor) {
      if (UUnrealEditorSubsystem *UES =
              GEditor->GetEditorSubsystem<UUnrealEditorSubsystem>()) {
        TargetWorld = UES->GetEditorWorld();
      }
      if (!TargetWorld) {
        TargetWorld = GEditor->GetEditorWorldContext().World();
      }
    }
#endif

    if (GEditor && TargetWorld) {
      bOk = GEditor->Exec(TargetWorld, *Cmd);
      bExecCalled = true;
    }

    // Fallback: try all known engine world contexts if the editor world
    // did not handle the command successfully.
    if (!bOk && GEngine) {
      for (const FWorldContext &Ctx : GEngine->GetWorldContexts()) {
        UWorld *World = Ctx.World();
        if (!World)
          continue;
        const bool bWorldOk = GEngine->Exec(World, *Cmd);
        bExecCalled = bExecCalled || bWorldOk;
        if (bWorldOk) {
          bOk = true;
          break;
        }
      }
    }

    // If we could not find any valid world to execute against, avoid
    // invoking the engine command path entirely and return a structured
    // error instead of risking an assertion.
    if (!bExecCalled && !TargetWorld) {
      TSharedPtr<FJsonObject> Out = MakeShared<FJsonObject>();
      Out->SetStringField(TEXT("command"), Cmd);
      Out->SetBoolField(TEXT("success"), false);
      SendAutomationResponse(RequestingSocket, RequestId, false,
                             TEXT("Editor world not available for command"),
                             Out, TEXT("EDITOR_WORLD_NOT_AVAILABLE"));
      return true;
    }

    TSharedPtr<FJsonObject> Out = MakeShared<FJsonObject>();
    Out->SetStringField(TEXT("command"), Cmd);
    Out->SetBoolField(TEXT("success"), bOk);
    SendAutomationResponse(RequestingSocket, RequestId, bOk,
                           bOk ? TEXT("Command executed")
                               : TEXT("Command not executed"),
                           Out, bOk ? FString() : TEXT("EXEC_FAILED"));
    return true;
  }

  // For other execute_editor_function cases require functionName
  FString FunctionName;
  Payload->TryGetStringField(TEXT("functionName"), FunctionName);
  if (FunctionName.IsEmpty()) {
    SendAutomationError(RequestingSocket, RequestId,
                        TEXT("functionName required"),
                        TEXT("INVALID_ARGUMENT"));
    return true;
  }

  const FString FN = FunctionName.ToUpper();
  // Accept either a top-level 'command' string or nested params.command
  FString Cmd;
  const TSharedPtr<FJsonObject> *ParamsPtr = nullptr;
  TSharedPtr<FJsonObject> Params = MakeShared<FJsonObject>();
  if (Payload->TryGetObjectField(TEXT("params"), ParamsPtr) && ParamsPtr &&
      (*ParamsPtr).IsValid()) {
    Params = *ParamsPtr;
  }
  if (!Payload->TryGetStringField(TEXT("command"), Cmd)) {
    Params->TryGetStringField(TEXT("command"), Cmd);
  }
  // (Console handling moved earlier)

#if WITH_EDITOR
  if (FN == TEXT("GET_PYTHON_FALLBACK_STATUS")) {
    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    const bool bPythonPluginEnabled = McpIsPythonPluginEnabled();
    Result->SetBoolField(TEXT("pythonPluginEnabled"), bPythonPluginEnabled);
    TArray<TSharedPtr<FJsonValue>> Templates;
    Templates.Add(MakeShared<FJsonValueString>(TEXT("list_selected_assets")));
    Templates.Add(MakeShared<FJsonValueString>(TEXT("list_selected_actors")));
    Templates.Add(MakeShared<FJsonValueString>(TEXT("list_assets_in_path")));
    Templates.Add(MakeShared<FJsonValueString>(TEXT("list_assets_by_mount_root")));
    Templates.Add(MakeShared<FJsonValueString>(TEXT("find_assets_by_class")));
    Templates.Add(MakeShared<FJsonValueString>(TEXT("check_asset_loadability")));
    Templates.Add(MakeShared<FJsonValueString>(TEXT("get_asset_details")));
    Templates.Add(MakeShared<FJsonValueString>(TEXT("get_selected_asset_details")));
    Templates.Add(MakeShared<FJsonValueString>(TEXT("find_actors_by_class")));
    Templates.Add(MakeShared<FJsonValueString>(TEXT("get_actor_details")));
    Templates.Add(MakeShared<FJsonValueString>(TEXT("get_editor_world")));
    Templates.Add(MakeShared<FJsonValueString>(TEXT("run_editor_utility")));
    Templates.Add(MakeShared<FJsonValueString>(TEXT("validate_selected_assets")));
    Templates.Add(MakeShared<FJsonValueString>(TEXT("audit_assets_in_path")));
    Templates.Add(MakeShared<FJsonValueString>(TEXT("audit_mod_config_asset")));
    Templates.Add(MakeShared<FJsonValueString>(TEXT("mcp_blueprint")));
    Result->SetArrayField(TEXT("templates"), Templates);
    Result->SetBoolField(TEXT("unsafeExecutionSupported"), bPythonPluginEnabled);
    Result->SetStringField(
        TEXT("message"),
        bPythonPluginEnabled
            ? TEXT("Python template execution is available in the editor.")
            : TEXT("PythonScriptPlugin is disabled; Python template execution is unavailable."));
    SendAutomationResponse(RequestingSocket, RequestId, true,
                           TEXT("Python fallback status"), Result,
                           FString());
    return true;
  }

  if (FN == TEXT("RUN_PYTHON_TEMPLATE")) {
    const TSharedPtr<FJsonObject>* TemplateParamsPtr = nullptr;
    TSharedPtr<FJsonObject> TemplateParams = Params;
    if (Params->TryGetObjectField(TEXT("templateParams"), TemplateParamsPtr) &&
        TemplateParamsPtr && (*TemplateParamsPtr).IsValid()) {
      TemplateParams = *TemplateParamsPtr;
    }
    FString TemplateName;
    if (!Payload->TryGetStringField(TEXT("templateName"), TemplateName) ||
        TemplateName.TrimStartAndEnd().IsEmpty()) {
      if (!Params->TryGetStringField(TEXT("templateName"), TemplateName)) {
        SendAutomationError(RequestingSocket, RequestId,
                            TEXT("templateName is required."),
                            TEXT("INVALID_ARGUMENT"));
        return true;
      }
    }

    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    FString ErrorMessage;
    if (!McpRunPythonTemplate(TemplateName, TemplateParams, Result, ErrorMessage)) {
      SendAutomationResponse(RequestingSocket, RequestId, false,
                             ErrorMessage, Result,
                             TEXT("PYTHON_TEMPLATE_FAILED"));
      return true;
    }

    SendAutomationResponse(RequestingSocket, RequestId,
                           !Result->HasField(TEXT("success")) ||
                               Result->GetBoolField(TEXT("success")),
                           TEXT("Python template executed"), Result,
                           FString());
    return true;
  }

  if (FN == TEXT("RUN_PYTHON_CODE")) {
    const TSharedPtr<FJsonObject>* ScriptParamsPtr = nullptr;
    TSharedPtr<FJsonObject> ScriptParams = MakeShared<FJsonObject>();
    if (Params->TryGetObjectField(TEXT("scriptParams"), ScriptParamsPtr) &&
        ScriptParamsPtr && (*ScriptParamsPtr).IsValid()) {
      ScriptParams = *ScriptParamsPtr;
    }
    FString Code;
    Payload->TryGetStringField(TEXT("code"), Code);
    FString ResultVariable;
    Payload->TryGetStringField(TEXT("resultVariable"), ResultVariable);
    if (Code.TrimStartAndEnd().IsEmpty()) {
      Params->TryGetStringField(TEXT("code"), Code);
    }
    if (Code.TrimStartAndEnd().IsEmpty()) {
      Params->TryGetStringField(TEXT("script"), Code);
    }
    if (Code.TrimStartAndEnd().IsEmpty()) {
      Params->TryGetStringField(TEXT("python"), Code);
    }
    if (Code.TrimStartAndEnd().IsEmpty()) {
      Params->TryGetStringField(TEXT("source"), Code);
    }
    if (ResultVariable.TrimStartAndEnd().IsEmpty()) {
      Params->TryGetStringField(TEXT("resultVariable"), ResultVariable);
    }
    if (Code.TrimStartAndEnd().IsEmpty()) {
      SendAutomationError(RequestingSocket, RequestId, TEXT("code is required."),
                          TEXT("INVALID_ARGUMENT"));
      return true;
    }

    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    FString ErrorMessage;
    if (!McpRunPythonArbitraryCode(Code, ResultVariable, ScriptParams,
                                   TEXT("<mcp-python>"), Result,
                                   ErrorMessage)) {
      SendAutomationResponse(RequestingSocket, RequestId, false, ErrorMessage,
                             Result, TEXT("PYTHON_CODE_FAILED"));
      return true;
    }

    SendAutomationResponse(RequestingSocket, RequestId,
                           !Result->HasField(TEXT("success")) ||
                               Result->GetBoolField(TEXT("success")),
                           TEXT("Python code executed"), Result, FString());
    return true;
  }

  if (FN == TEXT("RUN_PYTHON_FILE")) {
    const TSharedPtr<FJsonObject>* ScriptParamsPtr = nullptr;
    TSharedPtr<FJsonObject> ScriptParams = MakeShared<FJsonObject>();
    if (Params->TryGetObjectField(TEXT("scriptParams"), ScriptParamsPtr) &&
        ScriptParamsPtr && (*ScriptParamsPtr).IsValid()) {
      ScriptParams = *ScriptParamsPtr;
    }
    FString FilePath;
    Payload->TryGetStringField(TEXT("filePath"), FilePath);
    FString ResultVariable;
    Payload->TryGetStringField(TEXT("resultVariable"), ResultVariable);
    if (FilePath.TrimStartAndEnd().IsEmpty()) {
      Params->TryGetStringField(TEXT("filePath"), FilePath);
    }
    if (FilePath.TrimStartAndEnd().IsEmpty()) {
      Params->TryGetStringField(TEXT("path"), FilePath);
    }
    if (FilePath.TrimStartAndEnd().IsEmpty()) {
      Params->TryGetStringField(TEXT("filename"), FilePath);
    }
    if (ResultVariable.TrimStartAndEnd().IsEmpty()) {
      Params->TryGetStringField(TEXT("resultVariable"), ResultVariable);
    }
    if (FilePath.TrimStartAndEnd().IsEmpty()) {
      SendAutomationError(RequestingSocket, RequestId,
                          TEXT("filePath is required."),
                          TEXT("INVALID_ARGUMENT"));
      return true;
    }

    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    FString ErrorMessage;
    if (!McpRunPythonFile(FilePath, ResultVariable, ScriptParams, Result,
                          ErrorMessage)) {
      SendAutomationResponse(RequestingSocket, RequestId, false, ErrorMessage,
                             Result, TEXT("PYTHON_FILE_FAILED"));
      return true;
    }

    SendAutomationResponse(RequestingSocket, RequestId,
                           !Result->HasField(TEXT("success")) ||
                               Result->GetBoolField(TEXT("success")),
                           TEXT("Python file executed"), Result, FString());
    return true;
  }

  // Dispatch a handful of well-known functions to native handlers
  if (FN == TEXT("GET_ALL_ACTORS") || FN == TEXT("GET_ALL_ACTORS_SIMPLE")) {
    if (!GEditor) {
      SendAutomationResponse(RequestingSocket, RequestId, false,
                             TEXT("Editor not available"), nullptr,
                             TEXT("EDITOR_NOT_AVAILABLE"));
      return true;
    }
    UEditorActorSubsystem *ActorSS =
        GEditor->GetEditorSubsystem<UEditorActorSubsystem>();
    if (!ActorSS) {
      SendAutomationResponse(RequestingSocket, RequestId, false,
                             TEXT("EditorActorSubsystem not available"),
                             nullptr, TEXT("EDITOR_ACTOR_SUBSYSTEM_MISSING"));
      return true;
    }
    TArray<AActor *> Actors = ActorSS->GetAllLevelActors();
    TArray<TSharedPtr<FJsonValue>> Arr;
    Arr.Reserve(Actors.Num());
    for (AActor *A : Actors) {
      if (!A)
        continue;
      TSharedPtr<FJsonObject> E = MakeShared<FJsonObject>();
      E->SetStringField(TEXT("name"), A->GetName());
      E->SetStringField(TEXT("label"), A->GetActorLabel());
      E->SetStringField(TEXT("path"), A->GetPathName());
      E->SetStringField(TEXT("class"), A->GetClass()
                                           ? A->GetClass()->GetPathName()
                                           : TEXT(""));
      Arr.Add(MakeShared<FJsonValueObject>(E));
    }
    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetArrayField(TEXT("actors"), Arr);
    Result->SetNumberField(TEXT("count"), Arr.Num());
    SendAutomationResponse(RequestingSocket, RequestId, true,
                           TEXT("Actor list"), Result, FString());
    return true;
  }

  if (FN == TEXT("SPAWN_ACTOR") || FN == TEXT("SPAWN_ACTOR_AT_LOCATION")) {
    FString ClassPath;
    Payload->TryGetStringField(TEXT("class_path"), ClassPath);
    if (ClassPath.IsEmpty())
      Payload->TryGetStringField(TEXT("classPath"), ClassPath);
    const TSharedPtr<FJsonObject> *LocObj = nullptr;
    FVector Loc(0, 0, 0);
    FRotator Rot(0, 0, 0);
    if (Payload->TryGetObjectField(TEXT("params"), LocObj) && LocObj &&
        (*LocObj).IsValid()) {
      const TSharedPtr<FJsonObject> &P = *LocObj;
      ReadVectorField(P, TEXT("location"), Loc, Loc);
      ReadRotatorField(P, TEXT("rotation"), Rot, Rot);
    } else {
      if (const TSharedPtr<FJsonValue> LocVal =
              Payload->TryGetField(TEXT("location"))) {
        if (LocVal->Type == EJson::Array) {
          const TArray<TSharedPtr<FJsonValue>> &A = LocVal->AsArray();
          if (A.Num() >= 3)
            Loc = FVector((float)A[0]->AsNumber(), (float)A[1]->AsNumber(),
                          (float)A[2]->AsNumber());
        } else if (LocVal->Type == EJson::Object) {
          const TSharedPtr<FJsonObject> LocObject = LocVal->AsObject();
          if (LocObject.IsValid())
            ReadVectorField(LocObject, TEXT("location"), Loc, Loc);
        }
      }
    }

    if (!GEditor) {
      SendAutomationResponse(RequestingSocket, RequestId, false,
                             TEXT("Editor not available"), nullptr,
                             TEXT("EDITOR_NOT_AVAILABLE"));
      return true;
    }
    UEditorActorSubsystem *ActorSS =
        GEditor->GetEditorSubsystem<UEditorActorSubsystem>();
    if (!ActorSS) {
      SendAutomationResponse(RequestingSocket, RequestId, false,
                             TEXT("EditorActorSubsystem not available"),
                             nullptr, TEXT("EDITOR_ACTOR_SUBSYSTEM_MISSING"));
      return true;
    }
    UClass *Resolved = nullptr;
    if (!ClassPath.IsEmpty()) {
      Resolved = ResolveClassByName(ClassPath);
    }
    if (!Resolved) {
      TSharedPtr<FJsonObject> Err = MakeShared<FJsonObject>();
      Err->SetStringField(TEXT("error"), TEXT("Class not found"));
      SendAutomationResponse(RequestingSocket, RequestId, false,
                             TEXT("Class not found"), Err,
                             TEXT("CLASS_NOT_FOUND"));
      return true;
    }
    AActor *Spawned = SpawnActorInActiveWorld<AActor>(Resolved, Loc, Rot);
    if (!Spawned) {
      TSharedPtr<FJsonObject> Err = MakeShared<FJsonObject>();
      Err->SetStringField(TEXT("error"), TEXT("Spawn failed"));
      SendAutomationResponse(RequestingSocket, RequestId, false,
                             TEXT("Spawn failed"), Err, TEXT("SPAWN_FAILED"));
      return true;
    }
    TSharedPtr<FJsonObject> Out = MakeShared<FJsonObject>();
    Out->SetStringField(TEXT("actorName"), Spawned->GetActorLabel());
    Out->SetStringField(TEXT("actorPath"), Spawned->GetPathName());
    Out->SetBoolField(TEXT("success"), true);
    AddActorVerification(Out, Spawned);
    SendAutomationResponse(RequestingSocket, RequestId, true,
                           TEXT("Actor spawned"), Out, FString());
    return true;
  }

  if (FN == TEXT("DELETE_ACTOR") || FN == TEXT("DESTROY_ACTOR")) {
    // ... (existing delete logic) ...
    FString Target;
    Payload->TryGetStringField(TEXT("actor_name"), Target);
    if (Target.IsEmpty())
      Payload->TryGetStringField(TEXT("actorName"), Target);
    if (Target.IsEmpty()) {
      SendAutomationError(RequestingSocket, RequestId,
                          TEXT("actor_name required"),
                          TEXT("INVALID_ARGUMENT"));
      return true;
    }
    if (!GEditor) {
      SendAutomationResponse(RequestingSocket, RequestId, false,
                             TEXT("Editor not available"), nullptr,
                             TEXT("EDITOR_NOT_AVAILABLE"));
      return true;
    }
    UEditorActorSubsystem *ActorSS =
        GEditor->GetEditorSubsystem<UEditorActorSubsystem>();
    if (!ActorSS) {
      SendAutomationResponse(RequestingSocket, RequestId, false,
                             TEXT("EditorActorSubsystem not available"),
                             nullptr, TEXT("EDITOR_ACTOR_SUBSYSTEM_MISSING"));
      return true;
    }
    AActor *Found = nullptr;
    for (AActor *A : ActorSS->GetAllLevelActors()) {
      if (!A)
        continue;
      if (A->GetActorLabel().Equals(Target, ESearchCase::IgnoreCase) ||
          A->GetName().Equals(Target, ESearchCase::IgnoreCase) ||
          A->GetPathName().Equals(Target, ESearchCase::IgnoreCase)) {
        Found = A;
        break;
      }
    }
    if (!Found) {
      TSharedPtr<FJsonObject> Err = MakeShared<FJsonObject>();
      Err->SetStringField(TEXT("error"), TEXT("Actor not found"));
      SendAutomationResponse(RequestingSocket, RequestId, false,
                             TEXT("Actor not found"), Err,
                             TEXT("ACTOR_NOT_FOUND"));
      return true;
    }
    const bool bDeleted = ActorSS->DestroyActor(Found);
    TSharedPtr<FJsonObject> Out = MakeShared<FJsonObject>();
    Out->SetBoolField(TEXT("success"), bDeleted);
    if (bDeleted) {
      Out->SetStringField(TEXT("deleted"), Found->GetActorLabel());
      SendAutomationResponse(RequestingSocket, RequestId, true,
                             TEXT("Actor deleted"), Out, FString());
    } else {
      Out->SetStringField(TEXT("error"), TEXT("Delete failed"));
      SendAutomationResponse(RequestingSocket, RequestId, false,
                             TEXT("Delete failed"), Out, TEXT("DELETE_FAILED"));
    }
    return true;
  }

  if (FN == TEXT("POSSESS")) {
    FString TargetName;
    Payload->TryGetStringField(TEXT("actor_name"), TargetName);
    if (TargetName.IsEmpty())
      Payload->TryGetStringField(TEXT("actorName"), TargetName);
    if (TargetName.IsEmpty()) {
      SendAutomationError(RequestingSocket, RequestId,
                          TEXT("actorName required"), TEXT("INVALID_ARGUMENT"));
      return true;
    }

    if (!GEditor || !GEditor->IsPlaySessionInProgress()) {
      SendAutomationResponse(RequestingSocket, RequestId, false,
                             TEXT("Possess only available during PIE session"),
                             nullptr, TEXT("NOT_IN_PIE"));
      return true;
    }

    UWorld *PlayWorld = GEditor->PlayWorld;
    if (!PlayWorld) {
      SendAutomationResponse(RequestingSocket, RequestId, false,
                             TEXT("PIE World not found"), nullptr,
                             TEXT("WORLD_NOT_FOUND"));
      return true;
    }

    APawn *FoundPawn = nullptr;
    for (TActorIterator<APawn> It(PlayWorld); It; ++It) {
      APawn *P = *It;
      if (!P)
        continue;
      if (P->GetActorLabel().Equals(TargetName, ESearchCase::IgnoreCase) ||
          P->GetName().Equals(TargetName, ESearchCase::IgnoreCase)) {
        FoundPawn = P;
        break;
      }
    }

    if (!FoundPawn) {
      SendAutomationResponse(RequestingSocket, RequestId, false,
                             TEXT("Pawn not found in PIE world"), nullptr,
                             TEXT("PAWN_NOT_FOUND"));
      return true;
    }

    APlayerController *PC = PlayWorld->GetFirstPlayerController();
    if (!PC) {
      SendAutomationResponse(RequestingSocket, RequestId, false,
                             TEXT("No PlayerController found in PIE"), nullptr,
                             TEXT("PC_NOT_FOUND"));
      return true;
    }

    PC->Possess(FoundPawn);

    TSharedPtr<FJsonObject> Out = MakeShared<FJsonObject>();
    Out->SetBoolField(TEXT("success"), true);
    Out->SetStringField(TEXT("possessed"), FoundPawn->GetActorLabel());
    AddActorVerification(Out, FoundPawn);
    SendAutomationResponse(RequestingSocket, RequestId, true,
                           TEXT("Possessed pawn"), Out, FString());
    return true;
  }

  if (FN == TEXT("ASSET_EXISTS") || FN == TEXT("ASSET_EXISTS_SIMPLE")) {
    FString PathToCheck;
    // Accept either top-level 'path' or nested params.path
    if (!Payload->TryGetStringField(TEXT("path"), PathToCheck)) {
      const TSharedPtr<FJsonObject> *LocalParamsPtr = nullptr;
      if (Payload->TryGetObjectField(TEXT("params"), LocalParamsPtr) &&
          LocalParamsPtr && (*LocalParamsPtr).IsValid()) {
        (*LocalParamsPtr)->TryGetStringField(TEXT("path"), PathToCheck);
      }
    }
    if (PathToCheck.IsEmpty()) {
      SendAutomationError(RequestingSocket, RequestId, TEXT("path required"),
                          TEXT("INVALID_ARGUMENT"));
      return true;
    }

    // Perform check on game thread
    TSharedPtr<FJsonObject> Out = MakeShared<FJsonObject>();
    const bool bExists = UEditorAssetLibrary::DoesAssetExist(PathToCheck);
    Out->SetBoolField(TEXT("exists"), bExists);
    Out->SetStringField(TEXT("path"), PathToCheck);
    Out->SetBoolField(TEXT("success"), true);
    SendAutomationResponse(RequestingSocket, RequestId, true,
                           bExists ? TEXT("Asset exists")
                                   : TEXT("Asset not found"),
                           Out, bExists ? FString() : TEXT("NOT_FOUND"));
    return true;
  }

  if (FN == TEXT("SET_VIEWPORT_CAMERA") ||
      FN == TEXT("SET_VIEWPORT_CAMERA_INFO") ||
      FN == TEXT("SET_CAMERA_POSITION")) {
    const TSharedPtr<FJsonObject> *CameraParamsPtr = nullptr;
    FVector Loc(0, 0, 0);
    FRotator Rot(0, 0, 0);
    if (Payload->TryGetObjectField(TEXT("params"), CameraParamsPtr) &&
        CameraParamsPtr && (*CameraParamsPtr).IsValid()) {
      ReadVectorField(*CameraParamsPtr, TEXT("location"), Loc, Loc);
      ReadRotatorField(*CameraParamsPtr, TEXT("rotation"), Rot, Rot);
    } else {
      ReadVectorField(Payload, TEXT("location"), Loc, Loc);
      ReadRotatorField(Payload, TEXT("rotation"), Rot, Rot);
    }
    if (!GEditor) {
      SendAutomationResponse(RequestingSocket, RequestId, false,
                             TEXT("Editor not available"), nullptr,
                             TEXT("EDITOR_NOT_AVAILABLE"));
      return true;
    }

    if (UUnrealEditorSubsystem *UES =
            GEditor->GetEditorSubsystem<UUnrealEditorSubsystem>()) {
      UES->SetLevelViewportCameraInfo(Loc, Rot);
      if (ULevelEditorSubsystem *LES =
              GEditor->GetEditorSubsystem<ULevelEditorSubsystem>()) {
        LES->EditorInvalidateViewports();
      }
      TSharedPtr<FJsonObject> R = MakeShared<FJsonObject>();
      R->SetBoolField(TEXT("success"), true);
      SendAutomationResponse(RequestingSocket, RequestId, true,
                             TEXT("Camera set"), R, FString());
    } else {
      SendAutomationResponse(RequestingSocket, RequestId, false,
                             TEXT("UnrealEditorSubsystem not available"),
                             nullptr, TEXT("SUBSYSTEM_NOT_FOUND"));
    }
    return true;
  }

  if (FN == TEXT("BUILD_LIGHTING")) {
    FString Quality;
    Payload->TryGetStringField(TEXT("quality"), Quality);
    if (!GEditor) {
      SendAutomationResponse(RequestingSocket, RequestId, false,
                             TEXT("Editor not available"), nullptr,
                             TEXT("EDITOR_NOT_AVAILABLE"));
      return true;
    }

    // Guard against missing editor world; building lighting when there is
    // no active editor world can trigger engine assertions. If the world
    // is not available, report a structured error instead of proceeding.
    UWorld *CurrentWorld = nullptr;
    if (GEditor) {
      CurrentWorld = GEditor->GetEditorWorldContext().World();
    }
    if (!CurrentWorld) {
      SendAutomationResponse(
          RequestingSocket, RequestId, false,
          TEXT("Editor world not available for build lighting"), nullptr,
          TEXT("EDITOR_WORLD_NOT_AVAILABLE"));
      return true;
    }

    if (ULevelEditorSubsystem *LES =
            GEditor->GetEditorSubsystem<ULevelEditorSubsystem>()) {
      ELightingBuildQuality QualityEnum =
          ELightingBuildQuality::Quality_Production;
      if (!Quality.IsEmpty()) {
        const FString LowerQuality = Quality.ToLower();
        if (LowerQuality == TEXT("preview")) {
          QualityEnum = ELightingBuildQuality::Quality_Preview;
        } else if (LowerQuality == TEXT("medium")) {
          QualityEnum = ELightingBuildQuality::Quality_Medium;
        } else if (LowerQuality == TEXT("high")) {
          QualityEnum = ELightingBuildQuality::Quality_High;
        } else if (LowerQuality == TEXT("production")) {
          QualityEnum = ELightingBuildQuality::Quality_Production;
        } else {
          TSharedPtr<FJsonObject> Err = MakeShared<FJsonObject>();
          Err->SetBoolField(TEXT("success"), false);
          Err->SetStringField(TEXT("error"), TEXT("unknown_quality"));
          Err->SetStringField(TEXT("quality"), Quality);
          Err->SetStringField(TEXT("validValues"), TEXT("preview, medium, high, production"));
          SendAutomationResponse(RequestingSocket, RequestId, false,
                                 TEXT("Unknown lighting quality"), Err,
                                 TEXT("UNKNOWN_QUALITY"));
          return true;
        }
      }
      if (AWorldSettings *WS = CurrentWorld->GetWorldSettings()) {
        if (WS->bForceNoPrecomputedLighting) {
          TSharedPtr<FJsonObject> R = MakeShared<FJsonObject>();
          R->SetBoolField(TEXT("skipped"), true);
          R->SetStringField(TEXT("reason"),
                            TEXT("bForceNoPrecomputedLighting is true"));
          SendAutomationResponse(
              RequestingSocket, RequestId, true,
              TEXT("Lighting build skipped (precomputed lighting disabled)"), R,
              FString());
          return true;
        }
      }

#if ENGINE_MAJOR_VERSION == 5 && ENGINE_MINOR_VERSION >= 1
      LES->BuildLightMaps(QualityEnum, /*bWithReflectionCaptures*/ false);
      TSharedPtr<FJsonObject> R = MakeShared<FJsonObject>();
      R->SetBoolField(TEXT("requested"), true);
      SendAutomationResponse(RequestingSocket, RequestId, true,
                             TEXT("Build lighting requested"), R, FString());
#else
      // UE 5.0 fallback - BuildLightMaps not available
      TSharedPtr<FJsonObject> R = MakeShared<FJsonObject>();
      R->SetBoolField(TEXT("requested"), false);
      R->SetStringField(TEXT("error"), TEXT("BuildLightMaps not available in UE 5.0"));
      SendAutomationResponse(RequestingSocket, RequestId, false,
                             TEXT("Build lighting not available in UE 5.0"), R, TEXT("NOT_AVAILABLE"));
#endif
    } else {
      SendAutomationResponse(RequestingSocket, RequestId, false,
                             TEXT("LevelEditorSubsystem not available"),
                             nullptr, TEXT("SUBSYSTEM_NOT_FOUND"));
    }
    return true;
  }

  if (FN == TEXT("SAVE_CURRENT_LEVEL")) {
    if (!GEditor) {
      SendAutomationResponse(RequestingSocket, RequestId, false,
                             TEXT("Editor not available"), nullptr,
                             TEXT("EDITOR_NOT_AVAILABLE"));
      return true;
    }

    bool bSaved = false;
#if __has_include("EditorLoadingAndSavingUtils.h")
    bSaved = UEditorLoadingAndSavingUtils::SaveCurrentLevel();
#elif __has_include("FileHelpers.h")
    bSaved = FEditorFileUtils::SaveCurrentLevel();
#endif

    TSharedPtr<FJsonObject> Out = MakeShared<FJsonObject>();
    Out->SetBoolField(TEXT("success"), bSaved);
    SendAutomationResponse(RequestingSocket, RequestId, bSaved,
                           bSaved ? TEXT("Level saved")
                                  : TEXT("Failed to save level"),
                           Out, bSaved ? FString() : TEXT("SAVE_FAILED"));
    return true;
  }

  // RESOLVE_OBJECT: return basic object/asset discovery info
  if (FN == TEXT("RESOLVE_OBJECT")) {
    FString Path;
    Payload->TryGetStringField(TEXT("path"), Path);
    if (Path.IsEmpty()) {
      SendAutomationError(RequestingSocket, RequestId, TEXT("path required"),
                          TEXT("INVALID_ARGUMENT"));
      return true;
    }
    TSharedPtr<FJsonObject> Out = MakeShared<FJsonObject>();
    bool bExists = false;
    FString ClassName;
    if (UEditorAssetLibrary::DoesAssetExist(Path)) {
      bExists = true;
      if (UObject *Obj = UEditorAssetLibrary::LoadAsset(Path)) {
        if (UClass *Cls = Obj->GetClass()) {
          ClassName = Cls->GetPathName();
        }
      }
    } else if (UObject *Obj = FindObject<UObject>(nullptr, *Path)) {
      bExists = true;
      if (UClass *Cls = Obj->GetClass()) {
        ClassName = Cls->GetPathName();
      }
    }
    Out->SetBoolField(TEXT("exists"), bExists);
    Out->SetStringField(TEXT("path"), Path);
    Out->SetStringField(TEXT("class"), ClassName);
    Out->SetBoolField(TEXT("success"), true);
    SendAutomationResponse(RequestingSocket, RequestId, true,
                           bExists ? TEXT("Object resolved")
                                   : TEXT("Object not found"),
                           Out, bExists ? FString() : TEXT("NOT_FOUND"));
    return true;
  }

  // LIST_ACTOR_COMPONENTS: provide a simple listing of components for a given
  // editor actor
  if (FN == TEXT("LIST_ACTOR_COMPONENTS")) {
    FString ActorPath;
    Payload->TryGetStringField(TEXT("actorPath"), ActorPath);
    if (ActorPath.IsEmpty()) {
      SendAutomationError(RequestingSocket, RequestId,
                          TEXT("actorPath required"), TEXT("INVALID_ARGUMENT"));
      return true;
    }
    if (!GEditor) {
      SendAutomationResponse(RequestingSocket, RequestId, false,
                             TEXT("Editor not available"), nullptr,
                             TEXT("EDITOR_NOT_AVAILABLE"));
      return true;
    }
    UEditorActorSubsystem *ActorSS =
        GEditor->GetEditorSubsystem<UEditorActorSubsystem>();
    if (!ActorSS) {
      SendAutomationResponse(RequestingSocket, RequestId, false,
                             TEXT("EditorActorSubsystem not available"),
                             nullptr, TEXT("EDITOR_ACTOR_SUBSYSTEM_MISSING"));
      return true;
    }
    AActor *Found = nullptr;
    for (AActor *A : ActorSS->GetAllLevelActors()) {
      if (!A)
        continue;
      if (A->GetActorLabel().Equals(ActorPath, ESearchCase::IgnoreCase) ||
          A->GetName().Equals(ActorPath, ESearchCase::IgnoreCase) ||
          A->GetPathName().Equals(ActorPath, ESearchCase::IgnoreCase)) {
        Found = A;
        break;
      }
    }
    if (!Found) {
      TSharedPtr<FJsonObject> Err = MakeShared<FJsonObject>();
      Err->SetStringField(TEXT("error"), TEXT("Actor not found"));
      SendAutomationResponse(RequestingSocket, RequestId, false,
                             TEXT("Actor not found"), Err,
                             TEXT("ACTOR_NOT_FOUND"));
      return true;
    }
    TArray<UActorComponent *> Comps;
    Found->GetComponents(Comps);
    TArray<TSharedPtr<FJsonValue>> Arr;
    for (UActorComponent *C : Comps) {
      if (!C)
        continue;
      TSharedPtr<FJsonObject> R = MakeShared<FJsonObject>();
      R->SetStringField(TEXT("name"), C->GetName());
      R->SetStringField(TEXT("class"), C->GetClass()
                                           ? C->GetClass()->GetPathName()
                                           : TEXT(""));
      R->SetStringField(TEXT("path"), C->GetPathName());
      Arr.Add(MakeShared<FJsonValueObject>(R));
    }
    TSharedPtr<FJsonObject> Out = MakeShared<FJsonObject>();
    Out->SetArrayField(TEXT("components"), Arr);
    Out->SetNumberField(TEXT("count"), Arr.Num());
    SendAutomationResponse(RequestingSocket, RequestId, true,
                           TEXT("Components listed"), Out, FString());
    return true;
  }

  // GET_BLUEPRINT_CDO: best-effort CDO/class info for a Blueprint asset
  if (FN == TEXT("GET_BLUEPRINT_CDO")) {
    FString BlueprintPath;
    Payload->TryGetStringField(TEXT("blueprintPath"), BlueprintPath);
    if (BlueprintPath.IsEmpty()) {
      SendAutomationError(RequestingSocket, RequestId,
                          TEXT("blueprintPath required"),
                          TEXT("INVALID_ARGUMENT"));
      return true;
    }

    if (!UEditorAssetLibrary::DoesAssetExist(BlueprintPath)) {
      SendAutomationResponse(RequestingSocket, RequestId, false,
                             TEXT("Blueprint not found"), nullptr,
                             TEXT("NOT_FOUND"));
      return true;
    }

    TSharedPtr<FJsonObject> Out = MakeShared<FJsonObject>();
    UObject *Obj = UEditorAssetLibrary::LoadAsset(BlueprintPath);
    if (!Obj) {
      SendAutomationResponse(RequestingSocket, RequestId, false,
                             TEXT("Blueprint not found"), nullptr,
                             TEXT("NOT_FOUND"));
      return true;
    }

    if (UBlueprint *BP = Cast<UBlueprint>(Obj)) {
      if (BP->GeneratedClass) {
        UClass *Gen = BP->GeneratedClass;
        Out->SetStringField(TEXT("blueprintPath"), BlueprintPath);
        Out->SetStringField(TEXT("classPath"), Gen->GetPathName());
        Out->SetStringField(TEXT("className"), Gen->GetName());
        SendAutomationResponse(RequestingSocket, RequestId, true,
                               TEXT("Blueprint CDO info"), Out, FString());
        return true;
      }
      SendAutomationResponse(RequestingSocket, RequestId, false,
                             TEXT("Blueprint/GeneratedClass not available"),
                             nullptr, TEXT("INVALID_BLUEPRINT"));
      return true;
    }

    if (UClass *C = Cast<UClass>(Obj)) {
      Out->SetStringField(TEXT("classPath"), C->GetPathName());
      Out->SetStringField(TEXT("className"), C->GetName());
      SendAutomationResponse(RequestingSocket, RequestId, true,
                             TEXT("Class info"), Out, FString());
      return true;
    }

    SendAutomationResponse(RequestingSocket, RequestId, false,
                           TEXT("Blueprint/GeneratedClass not available"),
                           nullptr, TEXT("INVALID_BLUEPRINT"));
    return true;
  }

  if (FN == TEXT("BLUEPRINT_ADD_COMPONENT")) {
    const TSharedPtr<FJsonObject> *BlueprintParamsPtr = nullptr;
    TSharedPtr<FJsonObject> LocalParams = MakeShared<FJsonObject>();
    if (Payload->TryGetObjectField(TEXT("params"), BlueprintParamsPtr) &&
        BlueprintParamsPtr && (*BlueprintParamsPtr).IsValid()) {
      LocalParams = *BlueprintParamsPtr;
    } else if (Payload->HasField(TEXT("payloadBase64"))) {
      FString Enc;
      Payload->TryGetStringField(TEXT("payloadBase64"), Enc);
      if (!Enc.IsEmpty()) {
        TArray<uint8> DecodedBytes;
        if (FBase64::Decode(Enc, DecodedBytes) && DecodedBytes.Num() > 0) {
          DecodedBytes.Add(0);
          const ANSICHAR *Utf8 =
              reinterpret_cast<const ANSICHAR *>(DecodedBytes.GetData());
          FString Decoded = FString(UTF8_TO_TCHAR(Utf8));
          TSharedPtr<FJsonObject> Parsed = MakeShared<FJsonObject>();
          TSharedRef<TJsonReader<>> Reader =
              TJsonReaderFactory<>::Create(Decoded);
          if (FJsonSerializer::Deserialize(Reader, Parsed) &&
              Parsed.IsValid()) {
            LocalParams = Parsed;
          }
        }
      }
    }

    FString TargetBP;
    LocalParams->TryGetStringField(TEXT("blueprintPath"), TargetBP);
    if (TargetBP.IsEmpty()) {
      SendAutomationError(RequestingSocket, RequestId,
                          TEXT("blueprintPath required"),
                          TEXT("INVALID_ARGUMENT"));
      return true;
    }

    TSharedPtr<FJsonObject> SCSPayload = MakeShared<FJsonObject>();
    SCSPayload->SetStringField(TEXT("blueprintPath"), TargetBP);

    TArray<TSharedPtr<FJsonValue>> Ops;
    TSharedPtr<FJsonObject> Op = MakeShared<FJsonObject>();
    Op->SetStringField(TEXT("type"), TEXT("add_component"));
    FString Name;
    LocalParams->TryGetStringField(TEXT("componentName"), Name);
    if (!Name.IsEmpty())
      Op->SetStringField(TEXT("componentName"), Name);
    FString Class;
    LocalParams->TryGetStringField(TEXT("componentClass"), Class);
    if (!Class.IsEmpty())
      Op->SetStringField(TEXT("componentClass"), Class);
    FString AttachTo;
    LocalParams->TryGetStringField(TEXT("attachTo"), AttachTo);
    if (!AttachTo.IsEmpty())
      Op->SetStringField(TEXT("attachTo"), AttachTo);
    Ops.Add(MakeShared<FJsonValueObject>(Op));
    SCSPayload->SetArrayField(TEXT("operations"), Ops);

    return HandleBlueprintAction(RequestId, TEXT("blueprint_modify_scs"),
                                 SCSPayload, RequestingSocket);
  }

  if (FN == TEXT("CREATE_ASSET")) {
    // Check if we have a nested "params" object, which is standard for
    // ExecuteEditorFunction
    const TSharedPtr<FJsonObject> *ParamsObj;
    const TSharedPtr<FJsonObject> SourceObj =
        (Payload->TryGetObjectField(TEXT("params"), ParamsObj)) ? *ParamsObj
                                                                : Payload;

    FString AssetName;
    SourceObj->TryGetStringField(TEXT("asset_name"), AssetName);
    FString PackagePath;
    SourceObj->TryGetStringField(TEXT("package_path"), PackagePath);
    FString AssetClass;
    SourceObj->TryGetStringField(TEXT("asset_class"), AssetClass);
    FString FactoryClass;
    SourceObj->TryGetStringField(TEXT("factory_class"), FactoryClass);

    if (AssetName.IsEmpty() || PackagePath.IsEmpty() ||
        FactoryClass.IsEmpty()) {
      SendAutomationError(
          RequestingSocket, RequestId,
          TEXT("asset_name, package_path, and factory_class required"),
          TEXT("INVALID_ARGUMENT"));
      return true;
    }

    if (!GEditor) {
      SendAutomationResponse(RequestingSocket, RequestId, false,
                             TEXT("Editor not available"), nullptr,
                             TEXT("EDITOR_NOT_AVAILABLE"));
      return true;
    }

    IAssetTools &AssetTools =
        FModuleManager::LoadModuleChecked<FAssetToolsModule>("AssetTools")
            .Get();

    // Resolve factory
    UClass *FactoryUClass = ResolveClassByName(FactoryClass);
    if (!FactoryUClass) {
#if ENGINE_MAJOR_VERSION == 5 && ENGINE_MINOR_VERSION >= 1
      // Try finding by short name or full path
      FactoryUClass = UClass::TryFindTypeSlow<UClass>(FactoryClass);
#else
      // UE 5.0: Use ResolveClassByName instead of deprecated ANY_PACKAGE
      FactoryUClass = ResolveClassByName(FactoryClass);
#endif
    }

    // Quick factory lookup by short name if full resolution failed
    if (!FactoryUClass) {
      for (TObjectIterator<UClass> It; It; ++It) {
        if (It->GetName().Equals(FactoryClass) ||
            It->GetName().Equals(FactoryClass + TEXT("Factory"))) {
          if (It->IsChildOf(UFactory::StaticClass())) {
            FactoryUClass = *It;
            break;
          }
        }
      }
    }

    if (!FactoryUClass) {
      SendAutomationResponse(
          RequestingSocket, RequestId, false,
          FString::Printf(TEXT("Factory class '%s' not found"), *FactoryClass),
          nullptr, TEXT("FACTORY_NOT_FOUND"));
      return true;
    }

    UFactory *Factory =
        NewObject<UFactory>(GetTransientPackage(), FactoryUClass);
    if (!Factory) {
      SendAutomationResponse(RequestingSocket, RequestId, false,
                             TEXT("Failed to instantiate factory"), nullptr,
                             TEXT("FACTORY_CREATION_FAILED"));
      return true;
    }

    // Attempt creation
    UObject *NewAsset =
        AssetTools.CreateAsset(AssetName, PackagePath, nullptr, Factory);
    if (NewAsset) {
      // Use McpSafeAssetSave instead of modal PromptForCheckoutAndSave to avoid D3D12 crashes
      McpSafeAssetSave(NewAsset);

      TSharedPtr<FJsonObject> Out = MakeShared<FJsonObject>();
      Out->SetStringField(TEXT("name"), NewAsset->GetName());
      Out->SetStringField(TEXT("path"), NewAsset->GetPathName());
      Out->SetBoolField(TEXT("success"), true);

      SendAutomationResponse(RequestingSocket, RequestId, true,
                             TEXT("Asset created"), Out, FString());
    } else {
      SendAutomationResponse(RequestingSocket, RequestId, false,
                             TEXT("Failed to create asset via AssetTools"),
                             nullptr, TEXT("ASSET_CREATION_FAILED"));
    }
    return true;
  }

  // PLAY_SOUND helpers
  if (FN == TEXT("PLAY_SOUND_AT_LOCATION") || FN == TEXT("PLAY_SOUND_2D")) {
    const TSharedPtr<FJsonObject> *SoundParamsPtr = nullptr;
    if (!Payload->TryGetObjectField(TEXT("params"), SoundParamsPtr) ||
        !SoundParamsPtr || !(*SoundParamsPtr).IsValid()) { /* allow top-level path fields */
    }
    FString SoundPath;
    if (!Payload->TryGetStringField(TEXT("path"), SoundPath))
      Payload->TryGetStringField(TEXT("soundPath"), SoundPath);
    if (SoundPath.IsEmpty()) {
      SendAutomationError(RequestingSocket, RequestId,
                          TEXT("soundPath or path required"),
                          TEXT("INVALID_ARGUMENT"));
      return true;
    }
    if (!GEditor) {
      SendAutomationResponse(RequestingSocket, RequestId, false,
                             TEXT("Editor world not available"), nullptr,
                             TEXT("EDITOR_WORLD_NOT_AVAILABLE"));
      return true;
    }
    UWorld *World = nullptr;
    if (UUnrealEditorSubsystem *UES =
            GEditor->GetEditorSubsystem<UUnrealEditorSubsystem>()) {
      World = UES->GetEditorWorld();
    }
    if (!World) {
      SendAutomationResponse(RequestingSocket, RequestId, false,
                             TEXT("Editor world not available"), nullptr,
                             TEXT("EDITOR_WORLD_NOT_AVAILABLE"));
      return true;
    }

    if (!UEditorAssetLibrary::DoesAssetExist(SoundPath)) {
      TSharedPtr<FJsonObject> Err = MakeShared<FJsonObject>();
      Err->SetStringField(TEXT("error"), TEXT("Sound asset not found"));
      SendAutomationResponse(RequestingSocket, RequestId, false,
                             TEXT("Sound not found"), Err, TEXT("NOT_FOUND"));
      return true;
    }

    USoundBase *Snd =
        Cast<USoundBase>(UEditorAssetLibrary::LoadAsset(SoundPath));
    if (!Snd) {
      TSharedPtr<FJsonObject> Err = MakeShared<FJsonObject>();
      Err->SetStringField(TEXT("error"), TEXT("Sound asset not found"));
      SendAutomationResponse(RequestingSocket, RequestId, false,
                             TEXT("Sound not found"), Err, TEXT("NOT_FOUND"));
      return true;
    }

    if (FN == TEXT("PLAY_SOUND_AT_LOCATION")) {
      float x = 0, y = 0, z = 0;
      const TSharedPtr<FJsonObject> *LocObj = nullptr;
      if (Payload->TryGetObjectField(TEXT("params"), LocObj) && LocObj &&
          (*LocObj).IsValid()) {
        (*LocObj)->TryGetNumberField(TEXT("x"), x);
        (*LocObj)->TryGetNumberField(TEXT("y"), y);
        (*LocObj)->TryGetNumberField(TEXT("z"), z);
      }
      FVector Loc(x, y, z);
      UGameplayStatics::SpawnSoundAtLocation(World, Snd, Loc);
    } else {
      UGameplayStatics::SpawnSoundAtLocation(World, Snd, FVector::ZeroVector);
    }

    TSharedPtr<FJsonObject> Out = MakeShared<FJsonObject>();
    Out->SetBoolField(TEXT("success"), true);
    SendAutomationResponse(RequestingSocket, RequestId, true,
                           TEXT("Sound played"), Out, FString());
    return true;
  }

  // ADD_WIDGET_TO_VIEWPORT: implemented with proper widget creation and
  // viewport management
  if (FN == TEXT("ADD_WIDGET_TO_VIEWPORT")) {
    FString WidgetPath;
    Payload->TryGetStringField(TEXT("widget_path"), WidgetPath);
    if (WidgetPath.IsEmpty()) {
      SendAutomationError(RequestingSocket, RequestId,
                          TEXT("widget_path required"),
                          TEXT("INVALID_ARGUMENT"));
      return true;
    }

    int32 zOrder = 0;
    Payload->TryGetNumberField(TEXT("z_order"), zOrder);
    int32 playerIndex = 0;
    Payload->TryGetNumberField(TEXT("player_index"), playerIndex);

    if (!GEditor) {
      SendAutomationResponse(RequestingSocket, RequestId, false,
                             TEXT("Editor not available for widget creation"),
                             nullptr, TEXT("EDITOR_NOT_AVAILABLE"));
      return true;
    }

    // Load the widget blueprint class
    UClass *WidgetClass = LoadClass<UUserWidget>(nullptr, *WidgetPath);
    if (!WidgetClass) {
      TSharedPtr<FJsonObject> Err = MakeShared<FJsonObject>();
      Err->SetStringField(TEXT("error"), TEXT("Widget class not found"));
      Err->SetStringField(TEXT("widget_path"), WidgetPath);
      SendAutomationResponse(RequestingSocket, RequestId, false,
                             TEXT("Widget class not found"), Err,
                             TEXT("WIDGET_NOT_FOUND"));
      return true;
    }

    // Get the current world and player controller
    UWorld *World = GEditor->GetEditorWorldContext().World();
    if (!World) {
      SendAutomationResponse(RequestingSocket, RequestId, false,
                             TEXT("No world available"), nullptr,
                             TEXT("NO_WORLD"));
      return true;
    }

    APlayerController *PlayerController =
        UGameplayStatics::GetPlayerController(World, playerIndex);
    if (!PlayerController) {
      // Try to get the first available player controller if the specified one
      // doesn't exist
      PlayerController = UGameplayStatics::GetPlayerController(World, 0);
      if (!PlayerController) {
        TSharedPtr<FJsonObject> Err = MakeShared<FJsonObject>();
        Err->SetStringField(TEXT("error"),
                            TEXT("Player controller not available"));
        Err->SetNumberField(TEXT("player_index"), playerIndex);
        SendAutomationResponse(RequestingSocket, RequestId, false,
                               TEXT("Player controller not available"), Err,
                               TEXT("NO_PLAYER_CONTROLLER"));
        return true;
      }
    }

    // Create and add the widget to viewport
    UUserWidget *Widget =
        CreateWidget<UUserWidget>(PlayerController, WidgetClass);
    if (!Widget) {
      SendAutomationResponse(RequestingSocket, RequestId, false,
                             TEXT("Failed to create widget instance"), nullptr,
                             TEXT("WIDGET_CREATION_FAILED"));
      return true;
    }

    Widget->AddToViewport(zOrder);

    // Verify widget is in viewport
    const bool bIsInViewport = Widget->IsInViewport();

    TSharedPtr<FJsonObject> Out = MakeShared<FJsonObject>();
    Out->SetBoolField(TEXT("success"), bIsInViewport);
    Out->SetStringField(TEXT("widget_path"), WidgetPath);
    Out->SetStringField(TEXT("widget_class"), WidgetClass->GetPathName());
    Out->SetNumberField(TEXT("z_order"), zOrder);
    Out->SetNumberField(TEXT("player_index"),
                        PlayerController ? playerIndex : 0);

    if (!bIsInViewport) {
      SendAutomationResponse(RequestingSocket, RequestId, false,
                             TEXT("Failed to add widget to viewport"), Out,
                             TEXT("ADD_TO_VIEWPORT_FAILED"));
      return true;
    }

    SendAutomationResponse(RequestingSocket, RequestId, true,
                           TEXT("Widget added to viewport"), Out, FString());
    return true;
  }

  if (FN == TEXT("GENERATE_MEMORY_REPORT")) {
    FString OutputPath;
    Payload->TryGetStringField(TEXT("outputPath"), OutputPath);
    bool bDetailed = false;
    Payload->TryGetBoolField(TEXT("detailed"), bDetailed);

    if (!GEditor) {
      SendAutomationResponse(RequestingSocket, RequestId, false,
                             TEXT("Editor not available"), nullptr,
                             TEXT("EDITOR_NOT_AVAILABLE"));
      return true;
    }

    FString MemReportCmd =
        bDetailed ? TEXT("memreport -full") : TEXT("memreport");
    GEditor->Exec(nullptr, *MemReportCmd);

    TSharedPtr<FJsonObject> Out = MakeShared<FJsonObject>();
    Out->SetBoolField(TEXT("success"), true);
    // Note: OutputPath is not fully supported by the native memreport command
    // (it auto-generates filenames), but we acknowledge the request.
    Out->SetStringField(
        TEXT("message"),
        TEXT("Memory report generated (check Saved/Profiling/MemReports)"));

    SendAutomationResponse(RequestingSocket, RequestId, true,
                           TEXT("Memory report generated"), Out, FString());
    return true;
  }

  // CALL_SUBSYSTEM: generic reflection-based subsystem call
  if (FN == TEXT("CALL_SUBSYSTEM")) {
    FString SubsystemName;
    Payload->TryGetStringField(TEXT("subsystem"), SubsystemName);
    FString TargetFuncName;
    Payload->TryGetStringField(TEXT("function"), TargetFuncName);
    const TSharedPtr<FJsonObject> *Args = nullptr;
    Payload->TryGetObjectField(TEXT("args"), Args);

    if (SubsystemName.IsEmpty() || TargetFuncName.IsEmpty()) {
      SendAutomationError(RequestingSocket, RequestId,
                          TEXT("subsystem and function required"),
                          TEXT("INVALID_ARGUMENT"));
      return true;
    }

    if (!GEditor) {
      SendAutomationResponse(RequestingSocket, RequestId, false,
                             TEXT("Editor not available"), nullptr,
                             TEXT("EDITOR_NOT_AVAILABLE"));
      return true;
    }

    UObject *TargetSubsystem = nullptr;

    // 1. Try Editor Subsystems
    if (!TargetSubsystem) {
      // We can't iterate types easily without object iterator or known list.
      // Try resolving class first.
      UClass *SubsystemClass = ResolveClassByName(SubsystemName);
      if (SubsystemClass) {
        if (SubsystemClass->IsChildOf(UEditorSubsystem::StaticClass())) {
          TargetSubsystem = GEditor->GetEditorSubsystemBase(SubsystemClass);
        } else if (SubsystemClass->IsChildOf(UEngineSubsystem::StaticClass())) {
          TargetSubsystem = GEngine->GetEngineSubsystemBase(SubsystemClass);
        }
      }
    }

    // 2. Fallback: string-based lookup if class resolve failed or returns null
    // (though GetEditorSubsystemBase handles null class) Iterate known
    // subsystem collections if we really need to, but resolving class is best.

    if (!TargetSubsystem) {
      TSharedPtr<FJsonObject> Err = MakeShared<FJsonObject>();
      Err->SetStringField(
          TEXT("error"),
          FString::Printf(TEXT("Subsystem '%s' not found or not initialized"),
                          *SubsystemName));
      SendAutomationResponse(RequestingSocket, RequestId, false,
                             TEXT("Subsystem not found"), Err,
                             TEXT("SUBSYSTEM_NOT_FOUND"));
      return true;
    }

    // Build command string
    FString CmdString = TargetFuncName;
    if (Args && (*Args).IsValid()) {
      for (const auto &Pair : (*Args)->Values) {
        CmdString += TEXT(" ");
        CmdString += Pair.Key;
        CmdString += TEXT("=");

        switch (Pair.Value->Type) {
        case EJson::String:
          CmdString += FString::Printf(TEXT("\"%s\""), *Pair.Value->AsString());
          break;
        case EJson::Number:
          CmdString += FString::Printf(TEXT("%f"), Pair.Value->AsNumber());
          break;
        case EJson::Boolean:
          CmdString += Pair.Value->AsBool() ? TEXT("True") : TEXT("False");
          break;
        default:
          // Object/Array support in command string is limited, pass
          // stringified? For now, skip complex types or rely on simple string
          // conversion
          break;
        }
      }
    }

    FOutputDeviceNull Ar;
    bool bResult = TargetSubsystem->CallFunctionByNameWithArguments(
        *CmdString, Ar, nullptr, true);

    TSharedPtr<FJsonObject> Out = MakeShared<FJsonObject>();
    Out->SetBoolField(TEXT("success"), bResult);
    Out->SetStringField(TEXT("subsystem"), SubsystemName);
    Out->SetStringField(TEXT("function"), TargetFuncName);

    SendAutomationResponse(RequestingSocket, RequestId, bResult,
                           bResult ? TEXT("Function called")
                                   : TEXT("Function call failed"),
                           Out, bResult ? FString() : TEXT("CALL_FAILED"));
    return true;
  }

  if (FN == TEXT("CONFIGURE_TEXTURE_STREAMING")) {
    bool bEnabled = true;
    if (Payload->HasField(TEXT("enabled")))
      Payload->TryGetBoolField(TEXT("enabled"), bEnabled);

    double PoolSize = -1;
    if (Payload->HasField(TEXT("poolSize")))
      Payload->TryGetNumberField(TEXT("poolSize"), PoolSize);

    bool bBoost = false;
    if (Payload->HasField(TEXT("boostPlayerLocation")))
      Payload->TryGetBoolField(TEXT("boostPlayerLocation"), bBoost);

    if (IConsoleVariable *CVar = IConsoleManager::Get().FindConsoleVariable(
            TEXT("r.TextureStreaming"))) {
      CVar->Set(bEnabled ? 1 : 0, ECVF_SetByCode);
    }

    if (PoolSize >= 0) {
      if (IConsoleVariable *CVar = IConsoleManager::Get().FindConsoleVariable(
              TEXT("r.Streaming.PoolSize"))) {
        CVar->Set((int32)PoolSize, ECVF_SetByCode);
      }
    }

    // Boost logic would go here (e.g. forcing stream in for player view),
    // but basic CVar setting is the core requirement.

    TSharedPtr<FJsonObject> Out = MakeShared<FJsonObject>();
    Out->SetBoolField(TEXT("success"), true);
    Out->SetBoolField(TEXT("enabled"), bEnabled);
    SendAutomationResponse(RequestingSocket, RequestId, true,
                           TEXT("Texture streaming configured"), Out,
                           FString());
    return true;
  }

  return false;
}

#endif
