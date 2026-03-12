#include "McpAutomationBridgeGlobals.h"
#include "Dom/JsonObject.h"
#include "McpAutomationBridgeHelpers.h"
#include "McpAutomationBridgeSubsystem.h"
#include "Misc/ScopeExit.h"

#if WITH_EDITOR
#include "EdGraphUtilities.h"
#include "EdGraph/EdGraph.h"
#include "EdGraph/EdGraphNode.h"
#include "EdGraph/EdGraphPin.h"
#include "EdGraph/EdGraphSchema.h"
#include "EdGraphNode_Comment.h"
#include "Engine/Blueprint.h"
#include "K2Node_BreakStruct.h"
#include "K2Node_CallFunction.h"
#include "K2Node_CommutativeAssociativeBinaryOperator.h"
#include "K2Node_CustomEvent.h"
#include "K2Node_DynamicCast.h"
#include "K2Node_Event.h"
#include "K2Node_ExecutionSequence.h"
#include "K2Node_FunctionEntry.h"
#include "K2Node_FunctionResult.h"
#include "K2Node_IfThenElse.h"
#include "K2Node_InputAxisEvent.h"
#include "K2Node_Knot.h"
#include "K2Node_Literal.h"
#include "K2Node_MakeArray.h"
#include "K2Node_MakeStruct.h"
#include "K2Node_PromotableOperator.h"
#include "K2Node_Select.h"
#include "K2Node_Self.h"
#include "K2Node_Timeline.h"
#include "K2Node_VariableGet.h"
#include "K2Node_VariableSet.h"
#include "Kismet/GameplayStatics.h"
#include "Kismet/KismetMathLibrary.h"
#include "Kismet/KismetSystemLibrary.h"
#include "Kismet2/BlueprintEditorUtils.h"
#include "Kismet2/KismetEditorUtilities.h"
#include "ScopedTransaction.h"

#endif

#if WITH_EDITOR
namespace {

static TArray<FString> ParseBlueprintCommentTags(const FString& CommentText) {
  TArray<FString> Tags;
  TArray<FString> Lines;
  CommentText.ParseIntoArrayLines(Lines);
  for (const FString& RawLine : Lines) {
    FString Line = RawLine.TrimStartAndEnd();
    bool bMatched = false;
    if (Line.RemoveFromStart(TEXT("tags:"), ESearchCase::IgnoreCase) ||
        Line.RemoveFromStart(TEXT("tag:"), ESearchCase::IgnoreCase) ||
        Line.RemoveFromStart(TEXT("[tags:"), ESearchCase::IgnoreCase)) {
      bMatched = true;
    }

    if (!bMatched) {
      continue;
    }

    Line.RemoveFromEnd(TEXT("]"));
    TArray<FString> ParsedTags;
    Line.ParseIntoArray(ParsedTags, TEXT(","), true);
    for (FString ParsedTag : ParsedTags) {
      ParsedTag = ParsedTag.TrimStartAndEnd();
      if (!ParsedTag.IsEmpty()) {
        Tags.AddUnique(ParsedTag);
      }
    }
  }
  return Tags;
}

static TArray<TSharedPtr<FJsonValue>> SerializeBlueprintSubGraphs(
    UEdGraphNode* Node) {
  TArray<TSharedPtr<FJsonValue>> GraphsJson;
  if (!Node) {
    return GraphsJson;
  }

  TArray<UEdGraph*> SubGraphs;
  Node->GetSubGraphs(SubGraphs);
  for (UEdGraph* SubGraph : SubGraphs) {
    if (!SubGraph) {
      continue;
    }
    TSharedPtr<FJsonObject> GraphObj = MakeShared<FJsonObject>();
    GraphObj->SetStringField(TEXT("graphName"), SubGraph->GetName());
    GraphObj->SetStringField(TEXT("graphPath"), SubGraph->GetPathName());
    GraphObj->SetStringField(TEXT("outerNodeId"), Node->NodeGuid.ToString());
    GraphObj->SetStringField(TEXT("outerNodeName"), Node->GetName());
    GraphObj->SetStringField(
        TEXT("outerNodeTitle"),
        Node->GetNodeTitle(ENodeTitleType::ListView).ToString());
    GraphObj->SetNumberField(TEXT("nodeCount"), SubGraph->Nodes.Num());
    GraphsJson.Add(MakeShared<FJsonValueObject>(GraphObj));
  }
  return GraphsJson;
}

static TSharedPtr<FJsonObject> SerializeBlueprintLink(UEdGraphPin* LinkedPin) {
  TSharedPtr<FJsonObject> LinkObj = MakeShared<FJsonObject>();
  if (!LinkedPin) {
    return LinkObj;
  }

  UEdGraphNode* OwningNode = LinkedPin->GetOwningNode();
  LinkObj->SetStringField(TEXT("pinName"), LinkedPin->PinName.ToString());
  LinkObj->SetStringField(TEXT("pinType"), LinkedPin->PinType.PinCategory.ToString());
  LinkObj->SetStringField(TEXT("direction"),
                          LinkedPin->Direction == EGPD_Input ? TEXT("Input")
                                                             : TEXT("Output"));
  if (OwningNode) {
    LinkObj->SetStringField(TEXT("nodeId"), OwningNode->NodeGuid.ToString());
    LinkObj->SetStringField(TEXT("nodeName"), OwningNode->GetName());
    LinkObj->SetStringField(TEXT("nodeTitle"),
                            OwningNode->GetNodeTitle(ENodeTitleType::ListView).ToString());
  }
  return LinkObj;
}

static void AddBlueprintPinDefaults(const UEdGraphPin* Pin,
                                    TSharedPtr<FJsonObject>& PinObj) {
  if (!Pin || !PinObj.IsValid()) {
    return;
  }

  if (!Pin->DefaultValue.IsEmpty()) {
    PinObj->SetStringField(TEXT("defaultValue"), Pin->DefaultValue);
  } else if (!Pin->DefaultTextValue.IsEmptyOrWhitespace()) {
    PinObj->SetStringField(TEXT("defaultTextValue"),
                           Pin->DefaultTextValue.ToString());
  } else if (Pin->DefaultObject) {
    PinObj->SetStringField(TEXT("defaultObjectPath"),
                           Pin->DefaultObject->GetPathName());
  }
}

static TSharedPtr<FJsonObject> SerializeBlueprintPin(UEdGraphPin* Pin) {
  TSharedPtr<FJsonObject> PinObj = MakeShared<FJsonObject>();
  if (!Pin) {
    return PinObj;
  }

  PinObj->SetStringField(TEXT("pinName"), Pin->PinName.ToString());
  PinObj->SetStringField(TEXT("pinType"), Pin->PinType.PinCategory.ToString());
  PinObj->SetStringField(TEXT("direction"),
                         Pin->Direction == EGPD_Input ? TEXT("Input")
                                                     : TEXT("Output"));

  if ((Pin->PinType.PinCategory == TEXT("object") ||
       Pin->PinType.PinCategory == TEXT("class") ||
       Pin->PinType.PinCategory == TEXT("struct")) &&
      Pin->PinType.PinSubCategoryObject.IsValid()) {
    PinObj->SetStringField(TEXT("pinSubType"),
                           Pin->PinType.PinSubCategoryObject->GetName());
  }

  TArray<TSharedPtr<FJsonValue>> LinkedToArray;
  for (UEdGraphPin* LinkedPin : Pin->LinkedTo) {
    if (LinkedPin) {
      LinkedToArray.Add(MakeShared<FJsonValueObject>(SerializeBlueprintLink(LinkedPin)));
    }
  }
  PinObj->SetArrayField(TEXT("linkedTo"), LinkedToArray);
  PinObj->SetNumberField(TEXT("linkCount"), LinkedToArray.Num());
  AddBlueprintPinDefaults(Pin, PinObj);
  return PinObj;
}

static void GetBlueprintCommentBounds(const UEdGraphNode_Comment* CommentNode,
                                      float& MinX, float& MinY, float& MaxX,
                                      float& MaxY) {
  MinX = CommentNode ? static_cast<float>(CommentNode->NodePosX) : 0.0f;
  MinY = CommentNode ? static_cast<float>(CommentNode->NodePosY) : 0.0f;
  const float Width = CommentNode ? CommentNode->NodeWidth : 0.0f;
  const float Height = CommentNode ? CommentNode->NodeHeight : 0.0f;
  MaxX = MinX + Width;
  MaxY = MinY + Height;
}

static bool IsNodeWithinComment(const UEdGraphNode* Node,
                                const UEdGraphNode_Comment* CommentNode) {
  if (!Node || !CommentNode || Node == CommentNode) {
    return false;
  }

  float MinX = 0.0f;
  float MinY = 0.0f;
  float MaxX = 0.0f;
  float MaxY = 0.0f;
  GetBlueprintCommentBounds(CommentNode, MinX, MinY, MaxX, MaxY);

  const float NodeX = static_cast<float>(Node->NodePosX);
  const float NodeY = static_cast<float>(Node->NodePosY);
  return NodeX >= MinX && NodeX <= MaxX && NodeY >= MinY && NodeY <= MaxY;
}

static FString BlueprintNodeSortKey(const UEdGraphNode* Node) {
  if (!Node) {
    return FString();
  }
  return FString::Printf(TEXT("%s|%s|%d|%d|%s"), *Node->GetClass()->GetName(),
                         *Node->GetNodeTitle(ENodeTitleType::ListView).ToString(),
                         Node->NodePosX, Node->NodePosY, *Node->GetName());
}

static TArray<UEdGraphNode*> SortBlueprintNodes(const TSet<UEdGraphNode*>& Nodes) {
  TArray<UEdGraphNode*> Sorted = Nodes.Array();
  Sorted.Sort([](const UEdGraphNode& A, const UEdGraphNode& B) {
    return BlueprintNodeSortKey(&A) < BlueprintNodeSortKey(&B);
  });
  return Sorted;
}

} // namespace
#endif

/**
 * Process a "manage_blueprint_graph" automation request to inspect or modify a
 * Blueprint graph.
 *
 * The Payload JSON controls the specific operation via the "subAction" field
 * (examples: create_node, connect_pins, get_nodes, break_pin_links,
 * delete_node, create_reroute_node, set_node_property, get_node_details,
 * get_graph_details, get_pin_details). In editor builds this function performs
 * graph/blueprint lookups and edits; in non-editor builds it reports an
 * editor-only error.
 *
 * @param RequestId Unique identifier for the automation request (used in
 * responses).
 * @param Action The requested action name; this handler only processes
 * "manage_blueprint_graph".
 * @param Payload JSON object containing action options such as
 * "assetPath"/"blueprintPath", "graphName", "subAction" and subaction-specific
 * fields (nodeType, nodeId, pin names, positions, etc.).
 * @param RequestingSocket WebSocket used to send responses and errors back to
 * the requester.
 * @return `true` if the request was handled by this function (Action ==
 * "manage_blueprint_graph"), `false` otherwise.
 */
bool UMcpAutomationBridgeSubsystem::HandleBlueprintGraphAction(
    const FString &RequestId, const FString &Action,
    const TSharedPtr<FJsonObject> &Payload,
    TSharedPtr<FMcpBridgeWebSocket> RequestingSocket) {
  if (Action != TEXT("manage_blueprint_graph")) {
    return false;
  }

#if WITH_EDITOR
  if (!Payload.IsValid()) {
    SendAutomationError(RequestingSocket, RequestId,
                        TEXT("Missing payload for blueprint graph action."),
                        TEXT("INVALID_PAYLOAD"));
    return true;
  }

  // Extract subAction early to handle actions that don't require a blueprint
  const FString EarlySubAction = GetJsonStringField(Payload, TEXT("subAction"));

  // SECURITY: Validate any provided path even for actions that don't require a blueprint
  // This prevents false negatives in security tests where malicious paths should still be rejected
  {
    FString AssetPathParam;
    FString BlueprintPathParam;
    
    if (Payload->TryGetStringField(TEXT("assetPath"), AssetPathParam) && !AssetPathParam.IsEmpty()) {
      FString SanitizedAssetPath = SanitizeProjectRelativePath(AssetPathParam);
      if (SanitizedAssetPath.IsEmpty()) {
        SendAutomationError(RequestingSocket, RequestId,
                            TEXT("Invalid assetPath: contains traversal sequences or invalid characters."),
                            TEXT("INVALID_PATH"));
        return true;
      }
    }
    
    if (Payload->TryGetStringField(TEXT("blueprintPath"), BlueprintPathParam) && !BlueprintPathParam.IsEmpty()) {
      FString SanitizedBlueprintPath = SanitizeProjectRelativePath(BlueprintPathParam);
      if (SanitizedBlueprintPath.IsEmpty()) {
        SendAutomationError(RequestingSocket, RequestId,
                            TEXT("Invalid blueprintPath: contains traversal sequences or invalid characters."),
                            TEXT("INVALID_PATH"));
        return true;
      }
    }
  }

  // Special case: list_node_types doesn't require a blueprint - it lists all UK2Node types globally
  if (EarlySubAction == TEXT("list_node_types")) {
    TArray<TSharedPtr<FJsonValue>> NodeTypes;
    for (TObjectIterator<UClass> It; It; ++It) {
      if (!It->IsChildOf(UK2Node::StaticClass()))
        continue;
      if (It->HasAnyClassFlags(CLASS_Abstract))
        continue;

      TSharedPtr<FJsonObject> TypeObj = MakeShared<FJsonObject>();
      TypeObj->SetStringField(TEXT("className"), It->GetName());
      TypeObj->SetStringField(TEXT("displayName"),
                              It->GetDisplayNameText().ToString());
      NodeTypes.Add(MakeShared<FJsonValueObject>(TypeObj));
    }

    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetArrayField(TEXT("nodeTypes"), NodeTypes);
    Result->SetNumberField(TEXT("count"), NodeTypes.Num());
    SendAutomationResponse(RequestingSocket, RequestId, true,
                           TEXT("Node types listed."), Result);
    return true;
  }

  FString AssetPath;
  if (!Payload->TryGetStringField(TEXT("assetPath"), AssetPath) ||
      AssetPath.IsEmpty()) {
    // Allow callers to use "blueprintPath" (as exposed by the consolidated
    // tool schema) as an alias for assetPath so tests and tools do not need
    // to duplicate the same value under two keys.
    FString BlueprintPath;
    Payload->TryGetStringField(TEXT("blueprintPath"), BlueprintPath);
    if (!BlueprintPath.IsEmpty()) {
      AssetPath = BlueprintPath;
    }
  }
  
  // SECURITY: Sanitize the path before loading
  FString SanitizedAssetPath = SanitizeProjectRelativePath(AssetPath);
  if (SanitizedAssetPath.IsEmpty()) {
    SendAutomationError(RequestingSocket, RequestId,
                        TEXT("Invalid asset path: contains traversal sequences or invalid characters."),
                        TEXT("INVALID_PATH"));
    return true;
  }
  AssetPath = SanitizedAssetPath;

  if (AssetPath.IsEmpty()) {
    SendAutomationError(
        RequestingSocket, RequestId,
        TEXT("Missing 'assetPath' or 'blueprintPath' in payload."),
        TEXT("INVALID_ARGUMENT"));
    return true;
  }

  UBlueprint *Blueprint = LoadObject<UBlueprint>(nullptr, *AssetPath);
  if (!Blueprint) {
    SendAutomationError(
        RequestingSocket, RequestId,
        FString::Printf(TEXT("Could not load blueprint at path: %s"),
                        *AssetPath),
        TEXT("ASSET_NOT_FOUND"));
    return true;
  }

  FString GraphName;
  Payload->TryGetStringField(TEXT("graphName"), GraphName);
  UEdGraph *TargetGraph = nullptr;

  // Find the target graph
  if (GraphName.IsEmpty() ||
      GraphName.Equals(TEXT("EventGraph"), ESearchCase::IgnoreCase)) {
    // Default to the main ubergraph/event graph
    if (Blueprint->UbergraphPages.Num() > 0) {
      TargetGraph = Blueprint->UbergraphPages[0];
    }
  } else {
    // Search in FunctionGraphs and UbergraphPages
    for (UEdGraph *Graph : Blueprint->FunctionGraphs) {
      if (Graph->GetName() == GraphName) {
        TargetGraph = Graph;
        break;
      }
    }
    if (!TargetGraph) {
      for (UEdGraph *Graph : Blueprint->UbergraphPages) {
        if (Graph->GetName() == GraphName) {
          TargetGraph = Graph;
          break;
        }
      }
    }
  }

  if (!TargetGraph) {
    // Fallback: try finding by name in all graphs
    TArray<UEdGraph *> AllGraphs;
    Blueprint->GetAllGraphs(AllGraphs);
    for (UEdGraph *Graph : AllGraphs) {
      if (Graph->GetName() == GraphName) {
        TargetGraph = Graph;
        break;
      }
    }
  }

  if (!TargetGraph) {
    SendAutomationError(
        RequestingSocket, RequestId,
        FString::Printf(TEXT("Could not find graph '%s' in blueprint."),
                        *GraphName),
        TEXT("GRAPH_NOT_FOUND"));
    return true;
  }

  const FString SubAction = GetJsonStringField(Payload, TEXT("subAction"));

  // Node identifier interoperability:
  // - Prefer NodeGuid strings for stable references.
  // - Accept node UObject names (e.g. "K2Node_Event_0") for clients that
  //   mistakenly pass nodeName where nodeId is expected.
  auto FindNodeByIdOrName = [&](const FString &Id) -> UEdGraphNode * {
    if (Id.IsEmpty()) {
      return nullptr;
    }

    for (UEdGraphNode *Node : TargetGraph->Nodes) {
      if (!Node) {
        continue;
      }

      if (Node->NodeGuid.ToString().Equals(Id, ESearchCase::IgnoreCase) ||
          Node->GetName().Equals(Id, ESearchCase::IgnoreCase)) {
        return Node;
      }
    }

    return nullptr;
  };

  auto ResolveFunctionForBinding = [&](const FString& MemberClass,
                                       const FString& MemberName)
      -> UFunction* {
    if (MemberName.IsEmpty()) {
      return nullptr;
    }

    if (!MemberClass.IsEmpty()) {
      if (UClass* Class = ResolveUClass(MemberClass)) {
        return Class->FindFunctionByName(*MemberName);
      }
      return nullptr;
    }

    if (Blueprint && Blueprint->GeneratedClass) {
      if (UFunction* Func =
              Blueprint->GeneratedClass->FindFunctionByName(*MemberName)) {
        return Func;
      }
    }

    if (UFunction* Func =
            UKismetSystemLibrary::StaticClass()->FindFunctionByName(
                *MemberName)) {
      return Func;
    }
    if (UFunction* Func =
            UGameplayStatics::StaticClass()->FindFunctionByName(*MemberName)) {
      return Func;
    }
    return UKismetMathLibrary::StaticClass()->FindFunctionByName(*MemberName);
  };

  auto BuildCommentMembership = [&]() {
    TMap<FGuid, TArray<FGuid>> Membership;
    TArray<UEdGraphNode_Comment*> CommentNodes;
    for (UEdGraphNode* Node : TargetGraph->Nodes) {
      if (UEdGraphNode_Comment* CommentNode =
              Cast<UEdGraphNode_Comment>(Node)) {
        CommentNodes.Add(CommentNode);
      }
    }

    for (UEdGraphNode_Comment* CommentNode : CommentNodes) {
      if (!CommentNode) {
        continue;
      }
      for (UEdGraphNode* Node : TargetGraph->Nodes) {
        if (IsNodeWithinComment(Node, CommentNode)) {
          Membership.FindOrAdd(Node->NodeGuid).Add(CommentNode->NodeGuid);
        }
      }
    }
    return Membership;
  };

  auto SerializeNodeWithMembership =
      [&](UEdGraphNode* Node, const TMap<FGuid, TArray<FGuid>>& Membership,
          bool bIncludePins, bool bIncludeConnectionSummary,
          bool bIncludeSubGraphs) {
        TSharedPtr<FJsonObject> NodeObj = MakeShared<FJsonObject>();
        if (!Node) {
          return NodeObj;
        }

        NodeObj->SetStringField(TEXT("nodeId"), Node->NodeGuid.ToString());
        NodeObj->SetStringField(TEXT("nodeName"), Node->GetName());
        NodeObj->SetStringField(TEXT("nodeType"), Node->GetClass()->GetName());
        NodeObj->SetStringField(
            TEXT("nodeTitle"),
            Node->GetNodeTitle(ENodeTitleType::ListView).ToString());
        NodeObj->SetStringField(TEXT("comment"), Node->NodeComment);
        NodeObj->SetNumberField(TEXT("x"), Node->NodePosX);
        NodeObj->SetNumberField(TEXT("y"), Node->NodePosY);
        if (const UEdGraphNode_Comment* CommentNode =
                Cast<UEdGraphNode_Comment>(Node)) {
          NodeObj->SetNumberField(TEXT("width"), CommentNode->NodeWidth);
          NodeObj->SetNumberField(TEXT("height"), CommentNode->NodeHeight);
          TArray<TSharedPtr<FJsonValue>> TagsJson;
          for (const FString& Tag : ParseBlueprintCommentTags(Node->NodeComment)) {
            TagsJson.Add(MakeShared<FJsonValueString>(Tag));
          }
          NodeObj->SetArrayField(TEXT("tags"), TagsJson);
        }

        TArray<TSharedPtr<FJsonValue>> MembershipJson;
        if (const TArray<FGuid>* GroupIds = Membership.Find(Node->NodeGuid)) {
          for (const FGuid& GroupId : *GroupIds) {
            MembershipJson.Add(
                MakeShared<FJsonValueString>(GroupId.ToString()));
          }
        }
        NodeObj->SetArrayField(TEXT("commentGroupIds"), MembershipJson);
        const TArray<TSharedPtr<FJsonValue>> SubGraphsJson =
            SerializeBlueprintSubGraphs(Node);
        NodeObj->SetBoolField(TEXT("hasSubGraphs"), SubGraphsJson.Num() > 0);
        NodeObj->SetNumberField(TEXT("subGraphCount"), SubGraphsJson.Num());
        if (bIncludeSubGraphs) {
          NodeObj->SetArrayField(TEXT("subGraphs"), SubGraphsJson);
        }

        int32 IncomingLinkCount = 0;
        int32 OutgoingLinkCount = 0;
        TArray<TSharedPtr<FJsonValue>> PinsArray;
        for (UEdGraphPin* Pin : Node->Pins) {
          if (!Pin) {
            continue;
          }
          if (Pin->Direction == EGPD_Input) {
            IncomingLinkCount += Pin->LinkedTo.Num();
          } else {
            OutgoingLinkCount += Pin->LinkedTo.Num();
          }
          if (bIncludePins) {
            PinsArray.Add(
                MakeShared<FJsonValueObject>(SerializeBlueprintPin(Pin)));
          }
        }

        if (bIncludePins) {
          NodeObj->SetArrayField(TEXT("pins"), PinsArray);
        }

        if (bIncludeConnectionSummary) {
          TSharedPtr<FJsonObject> SummaryObj = MakeShared<FJsonObject>();
          SummaryObj->SetNumberField(TEXT("pinCount"), Node->Pins.Num());
          SummaryObj->SetNumberField(TEXT("incomingLinkCount"),
                                     IncomingLinkCount);
          SummaryObj->SetNumberField(TEXT("outgoingLinkCount"),
                                     OutgoingLinkCount);
          SummaryObj->SetNumberField(TEXT("totalLinkCount"),
                                     IncomingLinkCount + OutgoingLinkCount);
          NodeObj->SetObjectField(TEXT("connectionSummary"), SummaryObj);
        }
        return NodeObj;
      };

  auto CollectCommentGroupNodes = [&](UEdGraphNode_Comment* CommentNode) {
    TArray<UEdGraphNode*> Nodes;
    if (!CommentNode) {
      return Nodes;
    }

    Nodes.Add(CommentNode);
    for (UEdGraphNode* Node : TargetGraph->Nodes) {
      if (IsNodeWithinComment(Node, CommentNode)) {
        Nodes.Add(Node);
      }
    }
    return Nodes;
  };

  if (SubAction == TEXT("create_node")) {
    const FScopedTransaction Transaction(
        FText::FromString(TEXT("Create Blueprint Node")));
    Blueprint->Modify();
    TargetGraph->Modify();

    FString NodeType;
    Payload->TryGetStringField(TEXT("nodeType"), NodeType);
    float X = 0.0f;
    float Y = 0.0f;
    Payload->TryGetNumberField(TEXT("x"), X);
    Payload->TryGetNumberField(TEXT("y"), Y);

    // Helper to finalize and report
    auto FinalizeAndReport = [&](auto &NodeCreator, UEdGraphNode *NewNode) {
      if (NewNode) {
        // Set position BEFORE finalization per FGraphNodeCreator pattern
        NewNode->NodePosX = X;
        NewNode->NodePosY = Y;

        // Finalize() calls CreateNewGuid(), PostPlacedNewNode(), and
        // AllocateDefaultPins() if pins are empty. Do NOT call
        // AllocateDefaultPins() again after this!
        NodeCreator.Finalize();

        FBlueprintEditorUtils::MarkBlueprintAsModified(Blueprint);

        TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
        Result->SetStringField(TEXT("nodeId"), NewNode->NodeGuid.ToString());
        Result->SetStringField(TEXT("nodeName"), NewNode->GetName());
        AddAssetVerification(Result, Blueprint);
        SendAutomationResponse(RequestingSocket, RequestId, true,
                               TEXT("Node created."), Result);
      } else {
        SendAutomationError(
            RequestingSocket, RequestId,
            TEXT("Failed to create node (unsupported type or internal error)."),
            TEXT("CREATE_FAILED"));
      }
    };

    // Map common Blueprint node names to their CallFunction equivalents
    // This allows users to use nodeType="PrintString" instead of CallFunction
    static TMap<FString, TTuple<FString, FString>> CommonFunctionNodes = {
        {TEXT("PrintString"),
         MakeTuple(TEXT("UKismetSystemLibrary"), TEXT("PrintString"))},
        {TEXT("Print"),
         MakeTuple(TEXT("UKismetSystemLibrary"), TEXT("PrintString"))},
        {TEXT("PrintText"),
         MakeTuple(TEXT("UKismetSystemLibrary"), TEXT("PrintText"))},
        {TEXT("SetActorLocation"),
         MakeTuple(TEXT("AActor"), TEXT("K2_SetActorLocation"))},
        {TEXT("GetActorLocation"),
         MakeTuple(TEXT("AActor"), TEXT("K2_GetActorLocation"))},
        {TEXT("SetActorRotation"),
         MakeTuple(TEXT("AActor"), TEXT("K2_SetActorRotation"))},
        {TEXT("GetActorRotation"),
         MakeTuple(TEXT("AActor"), TEXT("K2_GetActorRotation"))},
        {TEXT("SetActorTransform"),
         MakeTuple(TEXT("AActor"), TEXT("K2_SetActorTransform"))},
        {TEXT("GetActorTransform"),
         MakeTuple(TEXT("AActor"), TEXT("K2_GetActorTransform"))},
        {TEXT("AddActorLocalOffset"),
         MakeTuple(TEXT("AActor"), TEXT("K2_AddActorLocalOffset"))},
        {TEXT("Delay"), MakeTuple(TEXT("UKismetSystemLibrary"), TEXT("Delay"))},
        {TEXT("DestroyActor"),
         MakeTuple(TEXT("AActor"), TEXT("K2_DestroyActor"))},
        {TEXT("SpawnActor"),
         MakeTuple(TEXT("UGameplayStatics"),
                   TEXT("BeginDeferredActorSpawnFromClass"))},
        {TEXT("GetPlayerPawn"),
         MakeTuple(TEXT("UGameplayStatics"), TEXT("GetPlayerPawn"))},
        {TEXT("GetPlayerController"),
         MakeTuple(TEXT("UGameplayStatics"), TEXT("GetPlayerController"))},
        {TEXT("PlaySound"),
         MakeTuple(TEXT("UGameplayStatics"), TEXT("PlaySound2D"))},
        {TEXT("PlaySound2D"),
         MakeTuple(TEXT("UGameplayStatics"), TEXT("PlaySound2D"))},
        {TEXT("PlaySoundAtLocation"),
         MakeTuple(TEXT("UGameplayStatics"), TEXT("PlaySoundAtLocation"))},
        {TEXT("GetWorldDeltaSeconds"),
         MakeTuple(TEXT("UGameplayStatics"), TEXT("GetWorldDeltaSeconds"))},
        {TEXT("SetTimerByFunctionName"),
         MakeTuple(TEXT("UKismetSystemLibrary"), TEXT("K2_SetTimer"))},
        {TEXT("ClearTimer"),
         MakeTuple(TEXT("UKismetSystemLibrary"), TEXT("K2_ClearTimer"))},
        {TEXT("IsValid"),
         MakeTuple(TEXT("UKismetSystemLibrary"), TEXT("IsValid"))},
        {TEXT("IsValidClass"),
         MakeTuple(TEXT("UKismetSystemLibrary"), TEXT("IsValidClass"))},
        // Math Nodes
        {TEXT("Add_IntInt"),
         MakeTuple(TEXT("UKismetMathLibrary"), TEXT("Add_IntInt"))},
        {TEXT("Subtract_IntInt"),
         MakeTuple(TEXT("UKismetMathLibrary"), TEXT("Subtract_IntInt"))},
        {TEXT("Multiply_IntInt"),
         MakeTuple(TEXT("UKismetMathLibrary"), TEXT("Multiply_IntInt"))},
        {TEXT("Divide_IntInt"),
         MakeTuple(TEXT("UKismetMathLibrary"), TEXT("Divide_IntInt"))},
        {TEXT("Add_DoubleDouble"),
         MakeTuple(TEXT("UKismetMathLibrary"), TEXT("Add_DoubleDouble"))},
        {TEXT("Subtract_DoubleDouble"),
         MakeTuple(TEXT("UKismetMathLibrary"), TEXT("Subtract_DoubleDouble"))},
        {TEXT("Multiply_DoubleDouble"),
         MakeTuple(TEXT("UKismetMathLibrary"), TEXT("Multiply_DoubleDouble"))},
        {TEXT("Divide_DoubleDouble"),
         MakeTuple(TEXT("UKismetMathLibrary"), TEXT("Divide_DoubleDouble"))},
        {TEXT("FTrunc"), MakeTuple(TEXT("UKismetMathLibrary"), TEXT("FTrunc"))},
        // Vector Ops
        {TEXT("MakeVector"),
         MakeTuple(TEXT("UKismetMathLibrary"), TEXT("MakeVector"))},
        {TEXT("BreakVector"),
         MakeTuple(TEXT("UKismetMathLibrary"), TEXT("BreakVector"))},
        // Actor/Component Ops
        {TEXT("GetComponentByClass"),
         MakeTuple(TEXT("AActor"), TEXT("GetComponentByClass"))},
        // Timer
        {TEXT("GetWorldTimerManager"),
         MakeTuple(TEXT("UKismetSystemLibrary"), TEXT("K2_GetTimerManager"))}};

    // Check if this is a common function node shortcut
    if (const auto *FuncInfo = CommonFunctionNodes.Find(NodeType)) {
      FString ClassName = FuncInfo->Get<0>();
      FString FuncName = FuncInfo->Get<1>();

      // Find the class and function BEFORE creating NodeCreator
      // (FGraphNodeCreator asserts in destructor if not finalized)
      UClass *Class = nullptr;
      if (ClassName == TEXT("UKismetSystemLibrary")) {
        Class = UKismetSystemLibrary::StaticClass();
      } else if (ClassName == TEXT("UGameplayStatics")) {
        Class = UGameplayStatics::StaticClass();
      } else if (ClassName == TEXT("AActor")) {
        Class = AActor::StaticClass();
      } else if (ClassName == TEXT("UKismetMathLibrary")) {
        Class = UKismetMathLibrary::StaticClass();
      } else {
        Class = ResolveUClass(ClassName);
      }

      UFunction *Func = nullptr;
      if (Class) {
        Func = Class->FindFunctionByName(*FuncName);
      }

      // Return early with error if function not found (before NodeCreator)
      if (!Func) {
        SendAutomationError(
            RequestingSocket, RequestId,
            FString::Printf(
                TEXT("Could not find function '%s::%s' for node type '%s'"),
                *ClassName, *FuncName, *NodeType),
            TEXT("FUNCTION_NOT_FOUND"));
        return true;
      }

      // Now safe to create NodeCreator since we know we'll finalize it
      FGraphNodeCreator<UK2Node_CallFunction> NodeCreator(*TargetGraph);
      UK2Node_CallFunction *CallFuncNode = NodeCreator.CreateNode(false);
      CallFuncNode->SetFromFunction(Func);
      FinalizeAndReport(NodeCreator, CallFuncNode);
      return true;
    }

    // ========================================================================
    // DYNAMIC NODE CREATION - Find node classes at runtime
    // ========================================================================

    // Map user-friendly node names to their K2Node class names
    static TMap<FString, FString> NodeTypeAliases = {
        // Flow Control
        {TEXT("Branch"), TEXT("K2Node_IfThenElse")},
        {TEXT("IfThenElse"), TEXT("K2Node_IfThenElse")},
        {TEXT("Sequence"), TEXT("K2Node_ExecutionSequence")},
        {TEXT("ExecutionSequence"), TEXT("K2Node_ExecutionSequence")},
        {TEXT("Select"), TEXT("K2Node_Select")},
        {TEXT("Switch"), TEXT("K2Node_SwitchInteger")},
        {TEXT("SwitchOnInt"), TEXT("K2Node_SwitchInteger")},
        {TEXT("SwitchOnEnum"), TEXT("K2Node_SwitchEnum")},
        {TEXT("SwitchOnString"), TEXT("K2Node_SwitchString")},
        {TEXT("SwitchOnName"), TEXT("K2Node_SwitchName")},
        // Flow Control
        {TEXT("DoOnce"), TEXT("K2Node_DoOnce")},
        {TEXT("DoN"), TEXT("K2Node_DoN")},
        {TEXT("FlipFlop"), TEXT("K2Node_FlipFlop")},
        {TEXT("Gate"), TEXT("K2Node_Gate")},
        {TEXT("MultiGate"), TEXT("K2Node_MultiGate")},
        // Loops
        {TEXT("ForLoop"), TEXT("K2Node_ForLoop")},
        {TEXT("ForLoopWithBreak"), TEXT("K2Node_ForLoopWithBreak")},
        {TEXT("ForEachLoop"), TEXT("K2Node_ForEachElementInEnum")},
        {TEXT("WhileLoop"), TEXT("K2Node_WhileLoop")},
        // Data
        {TEXT("MakeArray"), TEXT("K2Node_MakeArray")},
        {TEXT("MakeStruct"), TEXT("K2Node_MakeStruct")},
        {TEXT("BreakStruct"), TEXT("K2Node_BreakStruct")},
        {TEXT("MakeMap"), TEXT("K2Node_MakeMap")},
        {TEXT("MakeSet"), TEXT("K2Node_MakeSet")},
        // Actor/Component
        {TEXT("SpawnActorFromClass"), TEXT("K2Node_SpawnActorFromClass")},
        {TEXT("GetAllActorsOfClass"), TEXT("K2Node_GetAllActorsOfClass")},
        // Misc
        {TEXT("Self"), TEXT("K2Node_Self")},
        {TEXT("GetSelf"), TEXT("K2Node_Self")},
        {TEXT("Timeline"), TEXT("K2Node_Timeline")},
        {TEXT("Knot"), TEXT("K2Node_Knot")},
        {TEXT("Reroute"), TEXT("K2Node_Knot")},
        {TEXT("Comment"), TEXT("EdGraphNode_Comment")},
        // Literals
        {TEXT("Literal"), TEXT("K2Node_Literal")},
    };

    // Helper: Try to find a UK2Node subclass by name
    auto FindNodeClassByName = [](const FString &TypeName) -> UClass * {
      // First check for aliases
      FString ResolvedName = TypeName;
      if (const FString *Alias = NodeTypeAliases.Find(TypeName)) {
        ResolvedName = *Alias;
      }

      TArray<FString> NamesToTry;
      NamesToTry.Add(ResolvedName);
      NamesToTry.Add(FString::Printf(TEXT("K2Node_%s"), *ResolvedName));
      NamesToTry.Add(FString::Printf(TEXT("UK2Node_%s"), *ResolvedName));
      // Also try the original name if different
      if (ResolvedName != TypeName) {
        NamesToTry.Add(TypeName);
        NamesToTry.Add(FString::Printf(TEXT("K2Node_%s"), *TypeName));
        NamesToTry.Add(FString::Printf(TEXT("UK2Node_%s"), *TypeName));
      }

      for (TObjectIterator<UClass> It; It; ++It) {
        if (!It->IsChildOf(UEdGraphNode::StaticClass()))
          continue;
        if (It->HasAnyClassFlags(CLASS_Abstract))
          continue;

        FString ClassName = It->GetName();
        for (const FString &NameToMatch : NamesToTry) {
          if (ClassName.Equals(NameToMatch, ESearchCase::IgnoreCase)) {
            return *It;
          }
        }
      }
      return nullptr;
    };

    // Special nodes requiring extra parameters
    if (NodeType == TEXT("VariableGet") ||
        NodeType == TEXT("K2Node_VariableGet")) {
      FString VarName;
      Payload->TryGetStringField(TEXT("variableName"), VarName);
      FName VarFName(*VarName);
      bool bFound = false;
      for (const FBPVariableDescription &VarDesc : Blueprint->NewVariables) {
        if (VarDesc.VarName == VarFName) {
          bFound = true;
          break;
        }
      }
      if (!bFound && Blueprint->GeneratedClass &&
          Blueprint->GeneratedClass->FindPropertyByName(VarFName)) {
        bFound = true;
      }
      if (!bFound) {
        SendAutomationError(
            RequestingSocket, RequestId,
            FString::Printf(TEXT("Variable '%s' not found"), *VarName),
            TEXT("VARIABLE_NOT_FOUND"));
        return true;
      }
      FGraphNodeCreator<UK2Node_VariableGet> NodeCreator(*TargetGraph);
      UK2Node_VariableGet *VarGet = NodeCreator.CreateNode(false);
      VarGet->VariableReference.SetSelfMember(VarFName);
      FinalizeAndReport(NodeCreator, VarGet);
      return true;
    }

    if (NodeType == TEXT("VariableSet") ||
        NodeType == TEXT("K2Node_VariableSet")) {
      FString VarName;
      Payload->TryGetStringField(TEXT("variableName"), VarName);
      FName VarFName(*VarName);
      bool bFound = false;
      for (const FBPVariableDescription &VarDesc : Blueprint->NewVariables) {
        if (VarDesc.VarName == VarFName) {
          bFound = true;
          break;
        }
      }
      if (!bFound && Blueprint->GeneratedClass &&
          Blueprint->GeneratedClass->FindPropertyByName(VarFName)) {
        bFound = true;
      }
      if (!bFound) {
        SendAutomationError(
            RequestingSocket, RequestId,
            FString::Printf(TEXT("Variable '%s' not found"), *VarName),
            TEXT("VARIABLE_NOT_FOUND"));
        return true;
      }
      FGraphNodeCreator<UK2Node_VariableSet> NodeCreator(*TargetGraph);
      UK2Node_VariableSet *VarSet = NodeCreator.CreateNode(false);
      VarSet->VariableReference.SetSelfMember(VarFName);
      FinalizeAndReport(NodeCreator, VarSet);
      return true;
    }

    if (NodeType == TEXT("CallFunction") ||
        NodeType == TEXT("K2Node_CallFunction") ||
        NodeType == TEXT("FunctionCall")) {
      FString MemberName, MemberClass;
      Payload->TryGetStringField(TEXT("memberName"), MemberName);
      Payload->TryGetStringField(TEXT("memberClass"), MemberClass);
      UFunction *Func = nullptr;
      if (!MemberClass.IsEmpty()) {
        if (UClass *Class = ResolveUClass(MemberClass))
          Func = Class->FindFunctionByName(*MemberName);
      } else {
        Func = Blueprint->GeneratedClass->FindFunctionByName(*MemberName);
        if (!Func) {
          if (UClass *KSL = UKismetSystemLibrary::StaticClass())
            Func = KSL->FindFunctionByName(*MemberName);
          if (!Func)
            if (UClass *GPS = UGameplayStatics::StaticClass())
              Func = GPS->FindFunctionByName(*MemberName);
          if (!Func)
            if (UClass *KML = UKismetMathLibrary::StaticClass())
              Func = KML->FindFunctionByName(*MemberName);
        }
      }
      if (Func) {
        FGraphNodeCreator<UK2Node_CallFunction> NodeCreator(*TargetGraph);
        UK2Node_CallFunction *CallFuncNode = NodeCreator.CreateNode(false);
        CallFuncNode->SetFromFunction(Func);
        FinalizeAndReport(NodeCreator, CallFuncNode);
      } else {
        SendAutomationError(
            RequestingSocket, RequestId,
            FString::Printf(TEXT("Function '%s' not found"), *MemberName),
            TEXT("FUNCTION_NOT_FOUND"));
      }
      return true;
    }

    if (NodeType == TEXT("Event") || NodeType == TEXT("K2Node_Event")) {
      FString EventName, MemberClass;
      Payload->TryGetStringField(TEXT("eventName"), EventName);
      Payload->TryGetStringField(TEXT("memberClass"), MemberClass);
      if (EventName.IsEmpty()) {
        SendAutomationError(RequestingSocket, RequestId,
                            TEXT("eventName required"),
                            TEXT("INVALID_ARGUMENT"));
        return true;
      }
      static TMap<FString, FString> Aliases = {
          {TEXT("BeginPlay"), TEXT("ReceiveBeginPlay")},
          {TEXT("Tick"), TEXT("ReceiveTick")},
          {TEXT("EndPlay"), TEXT("ReceiveEndPlay")}};
      if (const FString *A = Aliases.Find(EventName))
        EventName = *A;

      UClass *TargetClass = nullptr;
      UFunction *EventFunc = nullptr;
      if (!MemberClass.IsEmpty()) {
        TargetClass = ResolveUClass(MemberClass);
        if (TargetClass)
          EventFunc = TargetClass->FindFunctionByName(*EventName);
      } else {
        for (UClass *C = Blueprint->ParentClass; C && !EventFunc;
             C = C->GetSuperClass()) {
          EventFunc = C->FindFunctionByName(*EventName,
                                            EIncludeSuperFlag::ExcludeSuper);
          if (EventFunc)
            TargetClass = C;
        }
      }
      if (EventFunc && TargetClass) {
        FGraphNodeCreator<UK2Node_Event> NodeCreator(*TargetGraph);
        UK2Node_Event *EventNode = NodeCreator.CreateNode(false);
        EventNode->EventReference.SetFromField<UFunction>(EventFunc, false);
        EventNode->bOverrideFunction = true;
        FinalizeAndReport(NodeCreator, EventNode);
      } else {
        SendAutomationError(
            RequestingSocket, RequestId,
            FString::Printf(TEXT("Event '%s' not found"), *EventName),
            TEXT("EVENT_NOT_FOUND"));
      }
      return true;
    }

    if (NodeType == TEXT("CustomEvent") ||
        NodeType == TEXT("K2Node_CustomEvent")) {
      FString EventName;
      Payload->TryGetStringField(TEXT("eventName"), EventName);
      FGraphNodeCreator<UK2Node_CustomEvent> NodeCreator(*TargetGraph);
      UK2Node_CustomEvent *EventNode = NodeCreator.CreateNode(false);
      EventNode->CustomFunctionName = FName(*EventName);
      FinalizeAndReport(NodeCreator, EventNode);
      return true;
    }

    if (NodeType == TEXT("Cast") || NodeType.StartsWith(TEXT("CastTo"))) {
      FString TargetClassName;
      Payload->TryGetStringField(TEXT("targetClass"), TargetClassName);
      if (TargetClassName.IsEmpty() && NodeType.StartsWith(TEXT("CastTo")))
        TargetClassName = NodeType.Mid(6);
      UClass *TargetClass = ResolveUClass(TargetClassName);
      if (!TargetClass) {
        SendAutomationError(
            RequestingSocket, RequestId,
            FString::Printf(TEXT("Class '%s' not found"), *TargetClassName),
            TEXT("CLASS_NOT_FOUND"));
        return true;
      }
      FGraphNodeCreator<UK2Node_DynamicCast> NodeCreator(*TargetGraph);
      UK2Node_DynamicCast *CastNode = NodeCreator.CreateNode(false);
      CastNode->TargetType = TargetClass;
      FinalizeAndReport(NodeCreator, CastNode);
      return true;
    }

    if (NodeType == TEXT("InputAxisEvent") ||
        NodeType == TEXT("K2Node_InputAxisEvent")) {
      FString InputAxisName;
      Payload->TryGetStringField(TEXT("inputAxisName"), InputAxisName);
      if (InputAxisName.IsEmpty()) {
        SendAutomationError(RequestingSocket, RequestId,
                            TEXT("inputAxisName required"),
                            TEXT("INVALID_ARGUMENT"));
        return true;
      }
      FGraphNodeCreator<UK2Node_InputAxisEvent> NodeCreator(*TargetGraph);
      UK2Node_InputAxisEvent *InputNode = NodeCreator.CreateNode(false);
      InputNode->InputAxisName = FName(*InputAxisName);
      FinalizeAndReport(NodeCreator, InputNode);
      return true;
    }

    // ========== DYNAMIC FALLBACK: Create ANY node class by name ==========
    UClass *NodeClass = FindNodeClassByName(NodeType);
    if (NodeClass) {
      UEdGraphNode *NewNode = NewObject<UEdGraphNode>(TargetGraph, NodeClass);
      if (NewNode) {
        TargetGraph->AddNode(NewNode, false, false);
        NewNode->CreateNewGuid();
        NewNode->PostPlacedNewNode();
        NewNode->AllocateDefaultPins();
        NewNode->NodePosX = X;
        NewNode->NodePosY = Y;
        FBlueprintEditorUtils::MarkBlueprintAsModified(Blueprint);
        TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
        Result->SetStringField(TEXT("nodeId"), NewNode->NodeGuid.ToString());
        Result->SetStringField(TEXT("nodeName"), NewNode->GetName());
        Result->SetStringField(TEXT("nodeClass"), NodeClass->GetName());
        SendAutomationResponse(RequestingSocket, RequestId, true,
                               TEXT("Node created."), Result);
      } else {
        SendAutomationError(RequestingSocket, RequestId,
                            TEXT("Failed to instantiate node."),
                            TEXT("CREATE_FAILED"));
      }
    } else {
      SendAutomationError(
          RequestingSocket, RequestId,
          FString::Printf(TEXT("Node type '%s' not found. Use list_node_types "
                               "to see available types."),
                          *NodeType),
          TEXT("NODE_TYPE_NOT_FOUND"));
    }
    return true;
  } else if (SubAction == TEXT("connect_pins")) {
    const FScopedTransaction Transaction(
        FText::FromString(TEXT("Connect Blueprint Pins")));
    Blueprint->Modify();
    TargetGraph->Modify();

    FString FromNodeId, FromPinName, ToNodeId, ToPinName;
    Payload->TryGetStringField(TEXT("fromNodeId"), FromNodeId);
    Payload->TryGetStringField(TEXT("fromPinName"), FromPinName);
    Payload->TryGetStringField(TEXT("toNodeId"), ToNodeId);
    Payload->TryGetStringField(TEXT("toPinName"), ToPinName);
    if (FromNodeId.IsEmpty()) {
      Payload->TryGetStringField(TEXT("sourceNode"), FromNodeId);
    }
    if (FromNodeId.IsEmpty()) {
      Payload->TryGetStringField(TEXT("sourceNodeId"), FromNodeId);
    }
    if (ToNodeId.IsEmpty()) {
      Payload->TryGetStringField(TEXT("targetNode"), ToNodeId);
    }
    if (ToNodeId.IsEmpty()) {
      Payload->TryGetStringField(TEXT("targetNodeId"), ToNodeId);
    }
    if (FromPinName.IsEmpty()) {
      Payload->TryGetStringField(TEXT("fromPin"), FromPinName);
    }
    if (FromPinName.IsEmpty()) {
      Payload->TryGetStringField(TEXT("sourcePin"), FromPinName);
    }
    if (FromPinName.IsEmpty()) {
      Payload->TryGetStringField(TEXT("sourcePinName"), FromPinName);
    }
    if (FromPinName.IsEmpty()) {
      Payload->TryGetStringField(TEXT("outputPin"), FromPinName);
    }
    if (ToPinName.IsEmpty()) {
      Payload->TryGetStringField(TEXT("toPin"), ToPinName);
    }
    if (ToPinName.IsEmpty()) {
      Payload->TryGetStringField(TEXT("targetPin"), ToPinName);
    }
    if (ToPinName.IsEmpty()) {
      Payload->TryGetStringField(TEXT("targetPinName"), ToPinName);
    }
    if (ToPinName.IsEmpty()) {
      Payload->TryGetStringField(TEXT("inputPin"), ToPinName);
    }

    if (FromNodeId.Contains(TEXT(".")) && FromPinName.IsEmpty()) {
      FString ParsedNodeId;
      FString ParsedPinName;
      if (FromNodeId.Split(TEXT("."), &ParsedNodeId, &ParsedPinName) &&
          !ParsedNodeId.IsEmpty() && !ParsedPinName.IsEmpty()) {
        FromNodeId = ParsedNodeId;
        FromPinName = ParsedPinName;
      }
    }
    if (ToNodeId.Contains(TEXT(".")) && ToPinName.IsEmpty()) {
      FString ParsedNodeId;
      FString ParsedPinName;
      if (ToNodeId.Split(TEXT("."), &ParsedNodeId, &ParsedPinName) &&
          !ParsedNodeId.IsEmpty() && !ParsedPinName.IsEmpty()) {
        ToNodeId = ParsedNodeId;
        ToPinName = ParsedPinName;
      }
    }

    if (FromNodeId.IsEmpty() || ToNodeId.IsEmpty() || FromPinName.IsEmpty() ||
        ToPinName.IsEmpty()) {
      SendAutomationError(
          RequestingSocket, RequestId,
          TEXT("connect_pins requires source and target node/pin values. Accepted shapes: fromNodeId/fromPinName/toNodeId/toPinName, sourceNode/sourcePin/targetNode/targetPin, or Node.Pin shorthand."),
          TEXT("INVALID_ARGUMENT"));
      return true;
    }

    UEdGraphNode *FromNode = FindNodeByIdOrName(FromNodeId);
    UEdGraphNode *ToNode = FindNodeByIdOrName(ToNodeId);

    if (!FromNode || !ToNode) {
      const FString ErrorMessage = FString::Printf(
          TEXT("Could not find source or target node. Resolved source='%s', target='%s'."),
          *FromNodeId, *ToNodeId);
      SendAutomationError(RequestingSocket, RequestId,
                          ErrorMessage,
                          TEXT("NODE_NOT_FOUND"));
      return true;
    }

    // Handle PinName in format "NodeName.PinName"
    FString FromPinClean = FromPinName;
    if (FromPinName.Contains(TEXT("."))) {
      FromPinName.Split(TEXT("."), nullptr, &FromPinClean);
    }
    FString ToPinClean = ToPinName;
    if (ToPinName.Contains(TEXT("."))) {
      ToPinName.Split(TEXT("."), nullptr, &ToPinClean);
    }

    UEdGraphPin *FromPin = FromNode->FindPin(*FromPinClean);
    UEdGraphPin *ToPin = ToNode->FindPin(*ToPinClean);

    if (!FromPin || !ToPin) {
      const FString ErrorMessage = FString::Printf(
          TEXT("Could not find source or target pin. Resolved source pin='%s' on node '%s', target pin='%s' on node '%s'."),
          *FromPinClean, *FromNode->GetName(), *ToPinClean, *ToNode->GetName());
      SendAutomationError(RequestingSocket, RequestId,
                          ErrorMessage,
                          TEXT("PIN_NOT_FOUND"));
      return true;
    }

    FromNode->Modify();
    ToNode->Modify();

    if (TargetGraph->GetSchema()->TryCreateConnection(FromPin, ToPin)) {
      FBlueprintEditorUtils::MarkBlueprintAsModified(Blueprint);
      TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
      AddAssetVerification(Result, Blueprint);
      SendAutomationResponse(RequestingSocket, RequestId, true,
                             TEXT("Pins connected."), Result);
    } else {
      SendAutomationError(RequestingSocket, RequestId,
                          TEXT("Failed to connect pins (schema rejection)."),
                          TEXT("CONNECTION_FAILED"));
    }
    return true;
  } else if (SubAction == TEXT("get_nodes")) {
    const TMap<FGuid, TArray<FGuid>> Membership = BuildCommentMembership();
    TArray<TSharedPtr<FJsonValue>> NodesArray;

    for (UEdGraphNode *Node : TargetGraph->Nodes) {
      if (!Node)
        continue;

      NodesArray.Add(MakeShared<FJsonValueObject>(
          SerializeNodeWithMembership(Node, Membership, true, true, true)));
    }

    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetArrayField(TEXT("nodes"), NodesArray);
    Result->SetStringField(TEXT("graphName"), TargetGraph->GetName());
    AddAssetVerification(Result, Blueprint);

    SendAutomationResponse(RequestingSocket, RequestId, true,
                           TEXT("Nodes retrieved."), Result);
    return true;
  } else if (SubAction == TEXT("list_comment_groups")) {
    const TMap<FGuid, TArray<FGuid>> Membership = BuildCommentMembership();
    TArray<TSharedPtr<FJsonValue>> GroupsJson;

    for (UEdGraphNode* Node : TargetGraph->Nodes) {
      UEdGraphNode_Comment* CommentNode = Cast<UEdGraphNode_Comment>(Node);
      if (!CommentNode) {
        continue;
      }

      float MinX = 0.0f;
      float MinY = 0.0f;
      float MaxX = 0.0f;
      float MaxY = 0.0f;
      GetBlueprintCommentBounds(CommentNode, MinX, MinY, MaxX, MaxY);

      TSharedPtr<FJsonObject> GroupObj = MakeShared<FJsonObject>();
      GroupObj->SetStringField(TEXT("commentNodeId"),
                               CommentNode->NodeGuid.ToString());
      GroupObj->SetStringField(TEXT("commentNodeName"), CommentNode->GetName());
      GroupObj->SetStringField(
          TEXT("commentTitle"),
          CommentNode->GetNodeTitle(ENodeTitleType::ListView).ToString());
      GroupObj->SetStringField(TEXT("comment"), CommentNode->NodeComment);
      GroupObj->SetNumberField(TEXT("x"), CommentNode->NodePosX);
      GroupObj->SetNumberField(TEXT("y"), CommentNode->NodePosY);
      GroupObj->SetNumberField(TEXT("width"), CommentNode->NodeWidth);
      GroupObj->SetNumberField(TEXT("height"), CommentNode->NodeHeight);
      GroupObj->SetNumberField(TEXT("minX"), MinX);
      GroupObj->SetNumberField(TEXT("minY"), MinY);
      GroupObj->SetNumberField(TEXT("maxX"), MaxX);
      GroupObj->SetNumberField(TEXT("maxY"), MaxY);

      TArray<TSharedPtr<FJsonValue>> TagsJson;
      for (const FString& Tag : ParseBlueprintCommentTags(CommentNode->NodeComment)) {
        TagsJson.Add(MakeShared<FJsonValueString>(Tag));
      }
      GroupObj->SetArrayField(TEXT("tags"), TagsJson);

      TArray<TSharedPtr<FJsonValue>> GroupNodesJson;
      for (UEdGraphNode* GroupNode : CollectCommentGroupNodes(CommentNode)) {
        GroupNodesJson.Add(MakeShared<FJsonValueObject>(
            SerializeNodeWithMembership(GroupNode, Membership, false, true,
                                        true)));
      }
      GroupObj->SetArrayField(TEXT("nodes"), GroupNodesJson);
      GroupObj->SetNumberField(TEXT("nodeCount"), GroupNodesJson.Num());
      GroupsJson.Add(MakeShared<FJsonValueObject>(GroupObj));
    }

    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetStringField(TEXT("graphName"), TargetGraph->GetName());
    Result->SetArrayField(TEXT("commentGroups"), GroupsJson);
    Result->SetNumberField(TEXT("commentGroupCount"), GroupsJson.Num());
    AddAssetVerification(Result, Blueprint);

    SendAutomationResponse(RequestingSocket, RequestId, true,
                           TEXT("Comment groups retrieved."), Result);
    return true;
  } else if (SubAction == TEXT("find_nodes")) {
    const TMap<FGuid, TArray<FGuid>> Membership = BuildCommentMembership();
    FString Query;
    FString CommentTitle;
    FString CommentTag;
    FString NodeTitleFilter;
    FString NodeTypeFilter;
    Payload->TryGetStringField(TEXT("query"), Query);
    Payload->TryGetStringField(TEXT("commentTitle"), CommentTitle);
    Payload->TryGetStringField(TEXT("commentTag"), CommentTag);
    Payload->TryGetStringField(TEXT("nodeTitle"), NodeTitleFilter);
    Payload->TryGetStringField(TEXT("nodeTypeFilter"), NodeTypeFilter);
    bool bIncludePins = false;
    Payload->TryGetBoolField(TEXT("includePins"), bIncludePins);
    bool bIncludeSubGraphs = false;
    Payload->TryGetBoolField(TEXT("includeSubGraphs"), bIncludeSubGraphs);

    const FString NormalizedQuery = Query.TrimStartAndEnd().ToLower();
    const FString NormalizedCommentTitle = CommentTitle.TrimStartAndEnd().ToLower();
    const FString NormalizedCommentTag = CommentTag.TrimStartAndEnd().ToLower();
    const FString NormalizedNodeTitle = NodeTitleFilter.TrimStartAndEnd().ToLower();
    const FString NormalizedNodeType = NodeTypeFilter.TrimStartAndEnd().ToLower();

    TArray<UEdGraph*> SearchGraphs;
    SearchGraphs.Add(TargetGraph);
    if (bIncludeSubGraphs) {
      TArray<UEdGraph*> AllGraphs;
      Blueprint->GetAllGraphs(AllGraphs);
      for (UEdGraph* Graph : AllGraphs) {
        if (Graph && Graph != TargetGraph) {
          SearchGraphs.Add(Graph);
        }
      }
    }

    TMap<FGuid, UEdGraphNode_Comment*> CommentById;
    for (UEdGraph* SearchGraph : SearchGraphs) {
      if (!SearchGraph) {
        continue;
      }
      for (UEdGraphNode* Node : SearchGraph->Nodes) {
        if (UEdGraphNode_Comment* CommentNode =
                Cast<UEdGraphNode_Comment>(Node)) {
          CommentById.Add(CommentNode->NodeGuid, CommentNode);
        }
      }
    }

    auto BuildMembershipForGraph = [&](UEdGraph* SearchGraph) {
      if (SearchGraph == TargetGraph) {
        return Membership;
      }

      TMap<FGuid, TArray<FGuid>> GraphMembership;
      TArray<UEdGraphNode_Comment*> CommentNodes;
      for (UEdGraphNode* Node : SearchGraph->Nodes) {
        if (UEdGraphNode_Comment* CommentNode =
                Cast<UEdGraphNode_Comment>(Node)) {
          CommentNodes.Add(CommentNode);
        }
      }

      for (UEdGraphNode_Comment* CommentNode : CommentNodes) {
        if (!CommentNode) {
          continue;
        }
        for (UEdGraphNode* Node : SearchGraph->Nodes) {
          if (IsNodeWithinComment(Node, CommentNode)) {
            GraphMembership.FindOrAdd(Node->NodeGuid).Add(
                CommentNode->NodeGuid);
          }
        }
      }
      return GraphMembership;
    };

    auto NodeMatches = [&](UEdGraphNode* Node,
                           const TMap<FGuid, TArray<FGuid>>& LocalMembership) {
      if (!Node) {
        return false;
      }
      const FString NodeTitle =
          Node->GetNodeTitle(ENodeTitleType::ListView).ToString();
      const FString NodeType = Node->GetClass()->GetName();
      const FString NodeComment = Node->NodeComment;
      if (!NormalizedNodeTitle.IsEmpty() &&
          !NodeTitle.ToLower().Contains(NormalizedNodeTitle)) {
        return false;
      }
      if (!NormalizedNodeType.IsEmpty() &&
          !NodeType.ToLower().Contains(NormalizedNodeType)) {
        return false;
      }
      if (!NormalizedCommentTitle.IsEmpty() || !NormalizedCommentTag.IsEmpty()) {
        bool bMatchedGroup = false;
        if (const TArray<FGuid>* GroupIds = LocalMembership.Find(Node->NodeGuid)) {
          for (const FGuid& GroupId : *GroupIds) {
            UEdGraphNode_Comment* const* CommentNodePtr = CommentById.Find(GroupId);
            if (!CommentNodePtr || !*CommentNodePtr) {
              continue;
            }
            const FString GroupTitle =
                (*CommentNodePtr)->GetNodeTitle(ENodeTitleType::ListView)
                    .ToString()
                    .ToLower();
            const TArray<FString> Tags =
                ParseBlueprintCommentTags((*CommentNodePtr)->NodeComment);
            const bool bTitleOk =
                NormalizedCommentTitle.IsEmpty() ||
                GroupTitle.Contains(NormalizedCommentTitle);
            bool bTagOk = NormalizedCommentTag.IsEmpty();
            if (!bTagOk) {
              for (const FString& Tag : Tags) {
                if (Tag.ToLower().Contains(NormalizedCommentTag)) {
                  bTagOk = true;
                  break;
                }
              }
            }
            if (bTitleOk && bTagOk) {
              bMatchedGroup = true;
              break;
            }
          }
        }
        if (!bMatchedGroup) {
          return false;
        }
      }
      if (!NormalizedQuery.IsEmpty()) {
        FString CombinedHaystack =
            FString::Printf(TEXT("%s %s %s %s"), *NodeTitle, *NodeType,
                            *NodeComment, *Node->GetName())
                .ToLower();
        if (!CombinedHaystack.Contains(NormalizedQuery)) {
          bool bFoundInGroup = false;
          if (const TArray<FGuid>* GroupIds = LocalMembership.Find(Node->NodeGuid)) {
            for (const FGuid& GroupId : *GroupIds) {
              UEdGraphNode_Comment* const* CommentNodePtr = CommentById.Find(GroupId);
              if (!CommentNodePtr || !*CommentNodePtr) {
                continue;
              }
              FString GroupHaystack =
                  FString::Printf(TEXT("%s %s"),
                                  *(*CommentNodePtr)
                                       ->GetNodeTitle(ENodeTitleType::ListView)
                                       .ToString(),
                                  *(*CommentNodePtr)->NodeComment)
                      .ToLower();
              if (GroupHaystack.Contains(NormalizedQuery)) {
                bFoundInGroup = true;
                break;
              }
            }
          }
          if (!bFoundInGroup) {
            return false;
          }
        }
      }
      return true;
    };

    TArray<TSharedPtr<FJsonValue>> MatchingNodes;
    for (UEdGraph* SearchGraph : SearchGraphs) {
      if (!SearchGraph) {
        continue;
      }
      const TMap<FGuid, TArray<FGuid>> LocalMembership =
          BuildMembershipForGraph(SearchGraph);
      for (UEdGraphNode* Node : SearchGraph->Nodes) {
        if (!NodeMatches(Node, LocalMembership)) {
          continue;
        }
        TSharedPtr<FJsonObject> NodeObj = SerializeNodeWithMembership(
            Node, LocalMembership, bIncludePins, true, true);
        NodeObj->SetStringField(TEXT("graphName"), SearchGraph->GetName());
        NodeObj->SetStringField(TEXT("graphPath"), SearchGraph->GetPathName());
        NodeObj->SetBoolField(TEXT("isNestedGraph"), SearchGraph != TargetGraph);
        MatchingNodes.Add(MakeShared<FJsonValueObject>(NodeObj));
      }
    }

    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetStringField(TEXT("graphName"), TargetGraph->GetName());
    Result->SetStringField(TEXT("query"), Query);
    Result->SetBoolField(TEXT("includeSubGraphs"), bIncludeSubGraphs);
    Result->SetArrayField(TEXT("nodes"), MatchingNodes);
    Result->SetNumberField(TEXT("count"), MatchingNodes.Num());
    AddAssetVerification(Result, Blueprint);
    SendAutomationResponse(RequestingSocket, RequestId, true,
                           TEXT("Matching nodes retrieved."), Result);
    return true;
  } else if (SubAction == TEXT("break_pin_links")) {
    const FScopedTransaction Transaction(
        FText::FromString(TEXT("Break Blueprint Pin Links")));
    Blueprint->Modify();
    TargetGraph->Modify();

    FString NodeId, PinName;
    Payload->TryGetStringField(TEXT("nodeId"), NodeId);
    Payload->TryGetStringField(TEXT("pinName"), PinName);

    UEdGraphNode *TargetNode = FindNodeByIdOrName(NodeId);

    if (!TargetNode) {
      SendAutomationError(RequestingSocket, RequestId, TEXT("Node not found."),
                          TEXT("NODE_NOT_FOUND"));
      return true;
    }

    UEdGraphPin *Pin = TargetNode->FindPin(*PinName);
    if (!Pin) {
      SendAutomationError(RequestingSocket, RequestId, TEXT("Pin not found."),
                          TEXT("PIN_NOT_FOUND"));
      return true;
    }

    TargetNode->Modify();
    TargetGraph->GetSchema()->BreakPinLinks(*Pin, true);
    FBlueprintEditorUtils::MarkBlueprintAsModified(Blueprint);
    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    AddAssetVerification(Result, Blueprint);
    SendAutomationResponse(RequestingSocket, RequestId, true,
                           TEXT("Pin links broken."), Result);
    return true;
  } else if (SubAction == TEXT("disconnect_subgraph")) {
    FString Direction = TEXT("both");
    Payload->TryGetStringField(TEXT("direction"), Direction);
    Direction = Direction.ToLower();

    bool bDryRun = false;
    Payload->TryGetBoolField(TEXT("dryRun"), bDryRun);

    TSet<UEdGraphNode*> SelectedNodes;
    FString CommentNodeId;
    Payload->TryGetStringField(TEXT("commentNodeId"), CommentNodeId);
    if (!CommentNodeId.IsEmpty()) {
      if (UEdGraphNode_Comment* CommentNode =
              Cast<UEdGraphNode_Comment>(FindNodeByIdOrName(CommentNodeId))) {
        for (UEdGraphNode* Node : CollectCommentGroupNodes(CommentNode)) {
          if (Node) {
            SelectedNodes.Add(Node);
          }
        }
      }
    }

    const TArray<TSharedPtr<FJsonValue>>* NodeIdValues = nullptr;
    if (Payload->TryGetArrayField(TEXT("nodeIds"), NodeIdValues) &&
        NodeIdValues) {
      for (const TSharedPtr<FJsonValue>& Value : *NodeIdValues) {
        if (!Value.IsValid() || Value->Type != EJson::String) {
          continue;
        }
        if (UEdGraphNode* Node = FindNodeByIdOrName(Value->AsString())) {
          SelectedNodes.Add(Node);
        }
      }
    }

    if (SelectedNodes.Num() == 0) {
      SendAutomationError(RequestingSocket, RequestId,
                          TEXT("disconnect_subgraph requires commentNodeId or nodeIds."),
                          TEXT("INVALID_ARGUMENT"));
      return true;
    }

    struct FPendingLink {
      UEdGraphPin* Pin = nullptr;
      UEdGraphPin* LinkedPin = nullptr;
      TSharedPtr<FJsonObject> Json;
    };

    TSet<FString> SeenLinks;
    TArray<FPendingLink> PendingLinks;
    for (UEdGraphNode* Node : SelectedNodes) {
      if (!Node) {
        continue;
      }
      for (UEdGraphPin* Pin : Node->Pins) {
        if (!Pin) {
          continue;
        }

        const bool bCheckIncoming =
            Direction == TEXT("incoming") || Direction == TEXT("both");
        const bool bCheckOutgoing =
            Direction == TEXT("outgoing") || Direction == TEXT("both");
        const bool bDirectionAllowed =
            (Pin->Direction == EGPD_Input && bCheckIncoming) ||
            (Pin->Direction == EGPD_Output && bCheckOutgoing);
        if (!bDirectionAllowed) {
          continue;
        }

        for (UEdGraphPin* LinkedPin : Pin->LinkedTo) {
          UEdGraphNode* LinkedNode =
              LinkedPin ? LinkedPin->GetOwningNode() : nullptr;
          if (!LinkedPin || !LinkedNode || SelectedNodes.Contains(LinkedNode)) {
            continue;
          }

          const FString LinkKey = FString::Printf(
              TEXT("%s:%s->%s:%s"), *Node->NodeGuid.ToString(),
              *Pin->PinName.ToString(), *LinkedNode->NodeGuid.ToString(),
              *LinkedPin->PinName.ToString());
          if (SeenLinks.Contains(LinkKey)) {
            continue;
          }
          SeenLinks.Add(LinkKey);

          TSharedPtr<FJsonObject> LinkJson = MakeShared<FJsonObject>();
          LinkJson->SetStringField(TEXT("fromNodeId"), Node->NodeGuid.ToString());
          LinkJson->SetStringField(TEXT("fromNodeName"), Node->GetName());
          LinkJson->SetStringField(TEXT("fromPinName"), Pin->PinName.ToString());
          LinkJson->SetStringField(TEXT("toNodeId"), LinkedNode->NodeGuid.ToString());
          LinkJson->SetStringField(TEXT("toNodeName"), LinkedNode->GetName());
          LinkJson->SetStringField(TEXT("toPinName"),
                                   LinkedPin->PinName.ToString());

          PendingLinks.Add({Pin, LinkedPin, LinkJson});
        }
      }
    }

    if (!bDryRun) {
      const FScopedTransaction Transaction(
          FText::FromString(TEXT("Disconnect Blueprint Subgraph")));
      Blueprint->Modify();
      TargetGraph->Modify();
      for (const FPendingLink& Link : PendingLinks) {
        if (Link.Pin && Link.LinkedPin) {
          Link.Pin->GetOwningNode()->Modify();
          Link.LinkedPin->GetOwningNode()->Modify();
          TargetGraph->GetSchema()->BreakSinglePinLink(Link.Pin,
                                                       Link.LinkedPin);
        }
      }
      if (PendingLinks.Num() > 0) {
        FBlueprintEditorUtils::MarkBlueprintAsModified(Blueprint);
      }
    }

    TArray<TSharedPtr<FJsonValue>> LinksJson;
    for (const FPendingLink& Link : PendingLinks) {
      LinksJson.Add(MakeShared<FJsonValueObject>(Link.Json));
    }

    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetStringField(TEXT("graphName"), TargetGraph->GetName());
    Result->SetBoolField(TEXT("dryRun"), bDryRun);
    Result->SetStringField(TEXT("direction"), Direction);
    Result->SetNumberField(TEXT("selectedNodeCount"), SelectedNodes.Num());
    Result->SetArrayField(TEXT("disconnectedLinks"), LinksJson);
    Result->SetNumberField(TEXT("disconnectCount"), LinksJson.Num());
    AddAssetVerification(Result, Blueprint);

    SendAutomationResponse(RequestingSocket, RequestId, true,
                           bDryRun ? TEXT("Subgraph disconnect preview generated.")
                                   : TEXT("Subgraph disconnected."),
                           Result);
    return true;
  } else if (SubAction == TEXT("disable_subgraph")) {
    bool bDryRun = false;
    Payload->TryGetBoolField(TEXT("dryRun"), bDryRun);
    FString Reason;
    FString StatusTag = TEXT("disabled");
    FString CommentNodeId;
    Payload->TryGetStringField(TEXT("reason"), Reason);
    Payload->TryGetStringField(TEXT("statusTag"), StatusTag);
    Payload->TryGetStringField(TEXT("commentNodeId"), CommentNodeId);

    TSet<UEdGraphNode*> SelectedNodes;
    UEdGraphNode_Comment* TargetCommentNode = nullptr;
    if (!CommentNodeId.IsEmpty()) {
      TargetCommentNode =
          Cast<UEdGraphNode_Comment>(FindNodeByIdOrName(CommentNodeId));
      if (TargetCommentNode) {
        for (UEdGraphNode* Node : CollectCommentGroupNodes(TargetCommentNode)) {
          if (Node) {
            SelectedNodes.Add(Node);
          }
        }
      }
    }

    const TArray<TSharedPtr<FJsonValue>>* NodeIdValues = nullptr;
    if (Payload->TryGetArrayField(TEXT("nodeIds"), NodeIdValues) &&
        NodeIdValues) {
      for (const TSharedPtr<FJsonValue>& Value : *NodeIdValues) {
        if (!Value.IsValid() || Value->Type != EJson::String) {
          continue;
        }
        if (UEdGraphNode* Node = FindNodeByIdOrName(Value->AsString())) {
          SelectedNodes.Add(Node);
        }
      }
    }

    if (SelectedNodes.Num() == 0) {
      SendAutomationError(RequestingSocket, RequestId,
                          TEXT("disable_subgraph requires commentNodeId or nodeIds."),
                          TEXT("INVALID_ARGUMENT"));
      return true;
    }

    TSet<FString> SeenLinks;
    TArray<TSharedPtr<FJsonValue>> LinksJson;
    TArray<TPair<UEdGraphPin*, UEdGraphPin*>> PendingBreaks;
    for (UEdGraphNode* Node : SelectedNodes) {
      if (!Node) {
        continue;
      }
      for (UEdGraphPin* Pin : Node->Pins) {
        if (!Pin) {
          continue;
        }
        for (UEdGraphPin* LinkedPin : Pin->LinkedTo) {
          UEdGraphNode* LinkedNode =
              LinkedPin ? LinkedPin->GetOwningNode() : nullptr;
          if (!LinkedPin || !LinkedNode || SelectedNodes.Contains(LinkedNode)) {
            continue;
          }
          const FString LinkKey = FString::Printf(
              TEXT("%s:%s->%s:%s"), *Node->NodeGuid.ToString(),
              *Pin->PinName.ToString(), *LinkedNode->NodeGuid.ToString(),
              *LinkedPin->PinName.ToString());
          if (SeenLinks.Contains(LinkKey)) {
            continue;
          }
          SeenLinks.Add(LinkKey);
          TSharedPtr<FJsonObject> LinkObj = MakeShared<FJsonObject>();
          LinkObj->SetStringField(TEXT("fromNodeId"), Node->NodeGuid.ToString());
          LinkObj->SetStringField(TEXT("fromPinName"), Pin->PinName.ToString());
          LinkObj->SetStringField(TEXT("toNodeId"), LinkedNode->NodeGuid.ToString());
          LinkObj->SetStringField(TEXT("toPinName"), LinkedPin->PinName.ToString());
          LinksJson.Add(MakeShared<FJsonValueObject>(LinkObj));
          PendingBreaks.Add(TPair<UEdGraphPin*, UEdGraphPin*>(Pin, LinkedPin));
        }
      }
    }

    FString UpdatedComment;
    if (TargetCommentNode) {
      UpdatedComment = TargetCommentNode->NodeComment;
      const FString StatusLine = FString::Printf(TEXT("status: %s"), *StatusTag);
      if (!UpdatedComment.Contains(StatusLine, ESearchCase::IgnoreCase)) {
        UpdatedComment += UpdatedComment.IsEmpty() ? TEXT("") : TEXT("\n");
        UpdatedComment += StatusLine;
      }
      if (!Reason.TrimStartAndEnd().IsEmpty()) {
        UpdatedComment += FString::Printf(TEXT("\nreason: %s"), *Reason);
      }
    }

    if (!bDryRun) {
      const FScopedTransaction Transaction(
          FText::FromString(TEXT("Disable Blueprint Subgraph")));
      Blueprint->Modify();
      TargetGraph->Modify();
      for (const TPair<UEdGraphPin*, UEdGraphPin*>& Link : PendingBreaks) {
        if (Link.Key && Link.Value) {
          Link.Key->GetOwningNode()->Modify();
          Link.Value->GetOwningNode()->Modify();
          TargetGraph->GetSchema()->BreakSinglePinLink(Link.Key, Link.Value);
        }
      }
      if (TargetCommentNode) {
        TargetCommentNode->Modify();
        TargetCommentNode->NodeComment = UpdatedComment;
      }
      if (PendingBreaks.Num() > 0 || TargetCommentNode) {
        FBlueprintEditorUtils::MarkBlueprintAsModified(Blueprint);
      }
    }

    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetStringField(TEXT("graphName"), TargetGraph->GetName());
    Result->SetBoolField(TEXT("dryRun"), bDryRun);
    Result->SetStringField(TEXT("statusTag"), StatusTag);
    Result->SetStringField(TEXT("reason"), Reason);
    Result->SetNumberField(TEXT("selectedNodeCount"), SelectedNodes.Num());
    Result->SetArrayField(TEXT("disconnectedLinks"), LinksJson);
    Result->SetNumberField(TEXT("disconnectCount"), LinksJson.Num());
    if (TargetCommentNode) {
      Result->SetStringField(TEXT("commentNodeId"),
                             TargetCommentNode->NodeGuid.ToString());
      Result->SetStringField(TEXT("updatedComment"),
                             bDryRun ? UpdatedComment : TargetCommentNode->NodeComment);
    }
    AddAssetVerification(Result, Blueprint);
    SendAutomationResponse(RequestingSocket, RequestId, true,
                           bDryRun ? TEXT("Subgraph disable preview generated.")
                                   : TEXT("Subgraph disabled."),
                           Result);
    return true;
  } else if (SubAction == TEXT("duplicate_subgraph")) {
    TSet<UEdGraphNode*> SelectedNodes;
    FString CommentNodeId;
    Payload->TryGetStringField(TEXT("commentNodeId"), CommentNodeId);
    if (!CommentNodeId.IsEmpty()) {
      if (UEdGraphNode_Comment* CommentNode =
              Cast<UEdGraphNode_Comment>(FindNodeByIdOrName(CommentNodeId))) {
        for (UEdGraphNode* Node : CollectCommentGroupNodes(CommentNode)) {
          if (Node) {
            SelectedNodes.Add(Node);
          }
        }
      }
    }

    const TArray<TSharedPtr<FJsonValue>>* NodeIdValues = nullptr;
    if (Payload->TryGetArrayField(TEXT("nodeIds"), NodeIdValues) &&
        NodeIdValues) {
      for (const TSharedPtr<FJsonValue>& Value : *NodeIdValues) {
        if (!Value.IsValid() || Value->Type != EJson::String) {
          continue;
        }
        if (UEdGraphNode* Node = FindNodeByIdOrName(Value->AsString())) {
          SelectedNodes.Add(Node);
        }
      }
    }

    if (SelectedNodes.Num() == 0) {
      SendAutomationError(RequestingSocket, RequestId,
                          TEXT("duplicate_subgraph requires commentNodeId or nodeIds."),
                          TEXT("INVALID_ARGUMENT"));
      return true;
    }

    double OffsetX = 400.0;
    double OffsetY = 0.0;
    Payload->TryGetNumberField(TEXT("offsetX"), OffsetX);
    Payload->TryGetNumberField(TEXT("offsetY"), OffsetY);

    bool bReconnectExternalLinks = false;
    Payload->TryGetBoolField(TEXT("reconnectExternalLinks"),
                             bReconnectExternalLinks);

    TSet<UObject*> NodesToExport;
    for (UEdGraphNode* Node : SelectedNodes) {
      if (Node) {
        NodesToExport.Add(Node);
      }
    }

    FString ExportedText;
    FEdGraphUtilities::ExportNodesToText(NodesToExport, ExportedText);
    if (ExportedText.IsEmpty()) {
      SendAutomationError(RequestingSocket, RequestId,
                          TEXT("Unable to export subgraph for duplication."),
                          TEXT("DUPLICATE_FAILED"));
      return true;
    }

    const FScopedTransaction Transaction(
        FText::FromString(TEXT("Duplicate Blueprint Subgraph")));
    Blueprint->Modify();
    TargetGraph->Modify();

    TSet<UEdGraphNode*> ImportedNodeSet;
    FEdGraphUtilities::ImportNodesFromText(TargetGraph, ExportedText,
                                           ImportedNodeSet);
    if (ImportedNodeSet.Num() == 0) {
      SendAutomationError(RequestingSocket, RequestId,
                          TEXT("No nodes were imported during duplication."),
                          TEXT("DUPLICATE_FAILED"));
      return true;
    }

    for (UEdGraphNode* ImportedNode : ImportedNodeSet) {
      if (!ImportedNode) {
        continue;
      }
      ImportedNode->Modify();
      ImportedNode->CreateNewGuid();
      ImportedNode->NodePosX += static_cast<int32>(OffsetX);
      ImportedNode->NodePosY += static_cast<int32>(OffsetY);
    }

    TArray<UEdGraphNode*> SortedSourceNodes = SortBlueprintNodes(SelectedNodes);
    TArray<UEdGraphNode*> SortedImportedNodes =
        SortBlueprintNodes(ImportedNodeSet);
    TSharedPtr<FJsonObject> MappingObj = MakeShared<FJsonObject>();
    const int32 PairCount =
        FMath::Min(SortedSourceNodes.Num(), SortedImportedNodes.Num());
    for (int32 Index = 0; Index < PairCount; ++Index) {
      MappingObj->SetStringField(
          SortedSourceNodes[Index]->NodeGuid.ToString(),
          SortedImportedNodes[Index]->NodeGuid.ToString());
    }

    const TMap<FGuid, TArray<FGuid>> Membership = BuildCommentMembership();
    TArray<TSharedPtr<FJsonValue>> ImportedNodesJson;
    for (UEdGraphNode* ImportedNode : SortedImportedNodes) {
      ImportedNodesJson.Add(MakeShared<FJsonValueObject>(
          SerializeNodeWithMembership(ImportedNode, Membership, true, true,
                                      true)));
    }

    FBlueprintEditorUtils::MarkBlueprintAsModified(Blueprint);

    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetStringField(TEXT("graphName"), TargetGraph->GetName());
    Result->SetNumberField(TEXT("offsetX"), OffsetX);
    Result->SetNumberField(TEXT("offsetY"), OffsetY);
    Result->SetBoolField(TEXT("reconnectExternalLinks"),
                         bReconnectExternalLinks);
    Result->SetArrayField(TEXT("duplicatedNodes"), ImportedNodesJson);
    Result->SetObjectField(TEXT("oldToNewNodeIds"), MappingObj);
    if (bReconnectExternalLinks) {
      Result->SetStringField(
          TEXT("warning"),
          TEXT("External link reconnection is not yet automated; duplicated subgraphs preserve only internal links."));
    }
    AddAssetVerification(Result, Blueprint);

    SendAutomationResponse(RequestingSocket, RequestId, true,
                           TEXT("Subgraph duplicated."), Result);
    return true;
  }

  else if (SubAction == TEXT("delete_node")) {
    const FScopedTransaction Transaction(
        FText::FromString(TEXT("Delete Blueprint Node")));
    Blueprint->Modify();
    TargetGraph->Modify();

    FString NodeId;
    Payload->TryGetStringField(TEXT("nodeId"), NodeId);

    UEdGraphNode *TargetNode = FindNodeByIdOrName(NodeId);

    if (TargetNode) {
      FBlueprintEditorUtils::RemoveNode(Blueprint, TargetNode, true);
      TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
      AddAssetVerification(Result, Blueprint);
      SendAutomationResponse(RequestingSocket, RequestId, true,
                             TEXT("Node deleted."), Result);
    } else {
      SendAutomationError(RequestingSocket, RequestId, TEXT("Node not found."),
                          TEXT("NODE_NOT_FOUND"));
    }
    return true;
  } else if (SubAction == TEXT("create_reroute_node")) {
    const FScopedTransaction Transaction(
        FText::FromString(TEXT("Create Reroute Node")));
    Blueprint->Modify();
    TargetGraph->Modify();

    float X = 0.0f;
    float Y = 0.0f;
    Payload->TryGetNumberField(TEXT("x"), X);
    Payload->TryGetNumberField(TEXT("y"), Y);

    FGraphNodeCreator<UK2Node_Knot> NodeCreator(*TargetGraph);
    UK2Node_Knot *RerouteNode = NodeCreator.CreateNode(false);

    RerouteNode->NodePosX = X;
    RerouteNode->NodePosY = Y;

    NodeCreator.Finalize();

    FBlueprintEditorUtils::MarkBlueprintAsModified(Blueprint);

    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetStringField(TEXT("nodeId"), RerouteNode->NodeGuid.ToString());
    Result->SetStringField(TEXT("nodeName"), RerouteNode->GetName());
    AddAssetVerification(Result, Blueprint);
    SendAutomationResponse(RequestingSocket, RequestId, true,
                           TEXT("Reroute node created."), Result);
    return true;
  } else if (SubAction == TEXT("set_node_property")) {
    const FScopedTransaction Transaction(
        FText::FromString(TEXT("Set Blueprint Node Property")));
    Blueprint->Modify();
    TargetGraph->Modify();

    // Generic property setter for common node properties used by tools.
    FString NodeId;
    Payload->TryGetStringField(TEXT("nodeId"), NodeId);
    FString PropertyName;
    Payload->TryGetStringField(TEXT("propertyName"), PropertyName);
    FString Value;
    Payload->TryGetStringField(TEXT("value"), Value);

    UEdGraphNode *TargetNode = FindNodeByIdOrName(NodeId);

    if (TargetNode) {
      TargetNode->Modify();
      bool bHandled = false;

      if (PropertyName.Equals(TEXT("Comment"), ESearchCase::IgnoreCase) ||
          PropertyName.Equals(TEXT("NodeComment"), ESearchCase::IgnoreCase)) {
        TargetNode->NodeComment = Value;
        bHandled = true;
      } else if (PropertyName.Equals(TEXT("X"), ESearchCase::IgnoreCase) ||
                 PropertyName.Equals(TEXT("NodePosX"),
                                     ESearchCase::IgnoreCase)) {
        double NumValue = 0.0;
        if (!Payload->TryGetNumberField(TEXT("value"), NumValue)) {
          NumValue = FCString::Atod(*Value);
        }
        TargetNode->NodePosX = static_cast<float>(NumValue);
        bHandled = true;
      } else if (PropertyName.Equals(TEXT("Y"), ESearchCase::IgnoreCase) ||
                 PropertyName.Equals(TEXT("NodePosY"),
                                     ESearchCase::IgnoreCase)) {
        double NumValue = 0.0;
        if (!Payload->TryGetNumberField(TEXT("value"), NumValue)) {
          NumValue = FCString::Atod(*Value);
        }
        TargetNode->NodePosY = static_cast<float>(NumValue);
        bHandled = true;
      } else if (PropertyName.Equals(TEXT("bCommentBubbleVisible"),
                                     ESearchCase::IgnoreCase)) {
        TargetNode->bCommentBubbleVisible = Value.ToBool();
        bHandled = true;
      } else if (PropertyName.Equals(TEXT("bCommentBubblePinned"),
                                     ESearchCase::IgnoreCase)) {
        TargetNode->bCommentBubblePinned = Value.ToBool();
        bHandled = true;
      }

      if (bHandled) {
        TargetGraph->NotifyGraphChanged();
        FBlueprintEditorUtils::MarkBlueprintAsModified(Blueprint);
        TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
        Result->SetStringField(TEXT("nodeId"), TargetNode->NodeGuid.ToString());
        Result->SetStringField(TEXT("nodeName"), TargetNode->GetName());
        AddAssetVerification(Result, Blueprint);
        SendAutomationResponse(RequestingSocket, RequestId, true,
                               TEXT("Node property updated."), Result);
      } else {
        SendAutomationError(
            RequestingSocket, RequestId,
            FString::Printf(TEXT("Unsupported node property '%s'"),
                            *PropertyName),
            TEXT("PROPERTY_NOT_SUPPORTED"));
      }
    } else {
      SendAutomationError(RequestingSocket, RequestId, TEXT("Node not found."),
                          TEXT("NODE_NOT_FOUND"));
    }
    return true;
  } else if (SubAction == TEXT("get_node_details")) {
    FString NodeId;
    Payload->TryGetStringField(TEXT("nodeId"), NodeId);

    UEdGraphNode *TargetNode = FindNodeByIdOrName(NodeId);

    if (TargetNode) {
      const TMap<FGuid, TArray<FGuid>> Membership = BuildCommentMembership();
      TSharedPtr<FJsonObject> Result =
          SerializeNodeWithMembership(TargetNode, Membership, true, true, true);
      AddAssetVerification(Result, Blueprint);

      SendAutomationResponse(RequestingSocket, RequestId, true,
                             TEXT("Node details retrieved."), Result);
    } else {
      SendAutomationError(RequestingSocket, RequestId, TEXT("Node not found."),
                          TEXT("NODE_NOT_FOUND"));
    }
    return true;
  } else if (SubAction == TEXT("get_graph_details")) {
    const TMap<FGuid, TArray<FGuid>> Membership = BuildCommentMembership();
    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetStringField(TEXT("graphName"), TargetGraph->GetName());
    Result->SetStringField(TEXT("graphPath"), TargetGraph->GetPathName());
    Result->SetNumberField(TEXT("nodeCount"), TargetGraph->Nodes.Num());

    TArray<TSharedPtr<FJsonValue>> Nodes;
    for (UEdGraphNode *Node : TargetGraph->Nodes) {
      Nodes.Add(MakeShared<FJsonValueObject>(
          SerializeNodeWithMembership(Node, Membership, true, true, true)));
    }

    TArray<TSharedPtr<FJsonValue>> CommentGroups;
    for (UEdGraphNode* Node : TargetGraph->Nodes) {
      if (UEdGraphNode_Comment* CommentNode = Cast<UEdGraphNode_Comment>(Node)) {
        TSharedPtr<FJsonObject> GroupObj = MakeShared<FJsonObject>();
        GroupObj->SetStringField(TEXT("commentNodeId"),
                                 CommentNode->NodeGuid.ToString());
        GroupObj->SetStringField(
            TEXT("commentTitle"),
            CommentNode->GetNodeTitle(ENodeTitleType::ListView).ToString());
        TArray<TSharedPtr<FJsonValue>> GroupNodes;
        for (UEdGraphNode* GroupNode : CollectCommentGroupNodes(CommentNode)) {
          GroupNodes.Add(MakeShared<FJsonValueObject>(
              SerializeNodeWithMembership(GroupNode, Membership, false, true,
                                          true)));
        }
        GroupObj->SetArrayField(TEXT("nodes"), GroupNodes);
        CommentGroups.Add(MakeShared<FJsonValueObject>(GroupObj));
      }
    }
    Result->SetArrayField(TEXT("nodes"), Nodes);
    Result->SetArrayField(TEXT("commentGroups"), CommentGroups);
    Result->SetNumberField(TEXT("commentGroupCount"), CommentGroups.Num());
    AddAssetVerification(Result, Blueprint);

    SendAutomationResponse(RequestingSocket, RequestId, true,
                           TEXT("Graph details retrieved."), Result);
    return true;
  } else if (SubAction == TEXT("list_graphs")) {
    TArray<UEdGraph*> AllGraphs;
    Blueprint->GetAllGraphs(AllGraphs);
    TArray<TSharedPtr<FJsonValue>> GraphsJson;
    for (UEdGraph* Graph : AllGraphs) {
      if (!Graph) {
        continue;
      }
      TSharedPtr<FJsonObject> GraphObj = MakeShared<FJsonObject>();
      GraphObj->SetStringField(TEXT("graphName"), Graph->GetName());
      GraphObj->SetStringField(TEXT("graphPath"), Graph->GetPathName());
      GraphObj->SetNumberField(TEXT("nodeCount"), Graph->Nodes.Num());

      UEdGraphNode* OwningNode = Cast<UEdGraphNode>(Graph->GetOuter());
      GraphObj->SetBoolField(TEXT("isNestedGraph"), OwningNode != nullptr);
      if (OwningNode) {
        GraphObj->SetStringField(TEXT("outerNodeId"),
                                 OwningNode->NodeGuid.ToString());
        GraphObj->SetStringField(TEXT("outerNodeName"), OwningNode->GetName());
        GraphObj->SetStringField(
            TEXT("outerNodeTitle"),
            OwningNode->GetNodeTitle(ENodeTitleType::ListView).ToString());
      }
      GraphsJson.Add(MakeShared<FJsonValueObject>(GraphObj));
    }

    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetArrayField(TEXT("graphs"), GraphsJson);
    Result->SetNumberField(TEXT("graphCount"), GraphsJson.Num());
    Result->SetStringField(TEXT("selectedGraphName"), TargetGraph->GetName());
    AddAssetVerification(Result, Blueprint);
    SendAutomationResponse(RequestingSocket, RequestId, true,
                           TEXT("Graphs retrieved."), Result);
    return true;
  } else if (SubAction == TEXT("get_pin_details")) {
    FString NodeId;
    Payload->TryGetStringField(TEXT("nodeId"), NodeId);
    FString PinName;
    Payload->TryGetStringField(TEXT("pinName"), PinName);

    UEdGraphNode *TargetNode = FindNodeByIdOrName(NodeId);

    if (!TargetNode) {
      SendAutomationError(RequestingSocket, RequestId, TEXT("Node not found."),
                          TEXT("NODE_NOT_FOUND"));
      return true;
    }

    TArray<UEdGraphPin *> PinsToReport;
    if (!PinName.IsEmpty()) {
      UEdGraphPin *Pin = TargetNode->FindPin(*PinName);
      if (!Pin) {
        SendAutomationError(RequestingSocket, RequestId, TEXT("Pin not found."),
                            TEXT("PIN_NOT_FOUND"));
        return true;
      }
      PinsToReport.Add(Pin);
    } else {
      PinsToReport = TargetNode->Pins;
    }

    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetStringField(TEXT("nodeId"), NodeId);

    TArray<TSharedPtr<FJsonValue>> PinsJson;
    for (UEdGraphPin *Pin : PinsToReport) {
      if (!Pin) {
        continue;
      }
      PinsJson.Add(MakeShared<FJsonValueObject>(SerializeBlueprintPin(Pin)));
    }

    Result->SetArrayField(TEXT("pins"), PinsJson);
    AddAssetVerification(Result, Blueprint);

    SendAutomationResponse(RequestingSocket, RequestId, true,
                           TEXT("Pin details retrieved."), Result);
    return true;
  } else if (SubAction == TEXT("create_config_binding_cluster")) {
    FString SectionName;
    FString PropertyKey;
    FString ExpectedType;
    FString MemberName;
    FString MemberClass;
    FString CustomEventName;
    FString SectionLookupFunctionName;
    FString SectionLookupClass;
    FString PropertyLookupFunctionName;
    FString PropertyLookupClass;
    FString BindFunctionName;
    FString BindClass;
    Payload->TryGetStringField(TEXT("section"), SectionName);
    Payload->TryGetStringField(TEXT("propertyName"), PropertyKey);
    if (PropertyKey.IsEmpty()) {
      Payload->TryGetStringField(TEXT("key"), PropertyKey);
    }
    Payload->TryGetStringField(TEXT("expectedType"), ExpectedType);
    Payload->TryGetStringField(TEXT("memberName"), MemberName);
    if (MemberName.IsEmpty()) {
      Payload->TryGetStringField(TEXT("applyFunction"), MemberName);
    }
    Payload->TryGetStringField(TEXT("memberClass"), MemberClass);
    Payload->TryGetStringField(TEXT("customEventName"), CustomEventName);
    Payload->TryGetStringField(TEXT("sectionLookupFunction"),
                               SectionLookupFunctionName);
    Payload->TryGetStringField(TEXT("sectionLookupClass"), SectionLookupClass);
    Payload->TryGetStringField(TEXT("propertyLookupFunction"),
                               PropertyLookupFunctionName);
    Payload->TryGetStringField(TEXT("propertyLookupClass"), PropertyLookupClass);
    Payload->TryGetStringField(TEXT("bindFunction"), BindFunctionName);
    Payload->TryGetStringField(TEXT("bindClass"), BindClass);

    if (SectionName.IsEmpty() || PropertyKey.IsEmpty()) {
      SendAutomationError(RequestingSocket, RequestId,
                          TEXT("section and propertyName/key are required."),
                          TEXT("INVALID_ARGUMENT"));
      return true;
    }

    double X = 0.0;
    double Y = 0.0;
    Payload->TryGetNumberField(TEXT("x"), X);
    Payload->TryGetNumberField(TEXT("y"), Y);

    const FScopedTransaction Transaction(
        FText::FromString(TEXT("Create Config Binding Cluster")));
    Blueprint->Modify();
    TargetGraph->Modify();

    TArray<TSharedPtr<FJsonValue>> CreatedNodes;
    TArray<TSharedPtr<FJsonValue>> AutoConnections;

    FGraphNodeCreator<UEdGraphNode_Comment> CommentCreator(*TargetGraph);
    UEdGraphNode_Comment* CommentNode = CommentCreator.CreateNode(false);
    CommentNode->NodePosX = static_cast<int32>(X);
    CommentNode->NodePosY = static_cast<int32>(Y);
    CommentNode->NodeWidth = 1800.0f;
    CommentNode->NodeHeight = 420.0f;
    CommentNode->NodeComment = FString::Printf(
        TEXT("Template: config-binding\nsection: %s\nproperty: %s\ntype: %s\ntags: config-binding,%s"),
        *SectionName, *PropertyKey,
        ExpectedType.IsEmpty() ? TEXT("unknown") : *ExpectedType,
        *SectionName);
    CommentCreator.Finalize();

    const TMap<FGuid, TArray<FGuid>> Membership = BuildCommentMembership();
    CreatedNodes.Add(MakeShared<FJsonValueObject>(
        SerializeNodeWithMembership(CommentNode, Membership, false, false,
                                    true)));

    auto CreateLiteralNode = [&](const FString& LiteralValue,
                                 const FString& NodeLabel, double NodeX,
                                 double NodeY) -> UK2Node_CallFunction* {
      UFunction* LiteralFunction = ResolveFunctionForBinding(
          TEXT("UKismetSystemLibrary"), TEXT("MakeLiteralString"));
      if (!LiteralFunction) {
        return nullptr;
      }
      FGraphNodeCreator<UK2Node_CallFunction> NodeCreator(*TargetGraph);
      UK2Node_CallFunction* LiteralNode = NodeCreator.CreateNode(false);
      LiteralNode->SetFromFunction(LiteralFunction);
      LiteralNode->NodePosX = static_cast<int32>(NodeX);
      LiteralNode->NodePosY = static_cast<int32>(NodeY);
      LiteralNode->NodeComment = NodeLabel;
      NodeCreator.Finalize();
      if (UEdGraphPin* ValuePin = LiteralNode->FindPin(TEXT("Value"))) {
        TargetGraph->GetSchema()->TrySetDefaultValue(*ValuePin, LiteralValue);
      }
      CreatedNodes.Add(MakeShared<FJsonValueObject>(
          SerializeNodeWithMembership(LiteralNode, BuildCommentMembership(),
                                      true, true, true)));
      return LiteralNode;
    };

    auto CreateCallNode = [&](const FString& FunctionClass,
                              const FString& FunctionName,
                              const FString& NodeLabel, double NodeX,
                              double NodeY) -> UK2Node_CallFunction* {
      if (UFunction* Function =
              ResolveFunctionForBinding(FunctionClass, FunctionName)) {
        FGraphNodeCreator<UK2Node_CallFunction> NodeCreator(*TargetGraph);
        UK2Node_CallFunction* CallNode = NodeCreator.CreateNode(false);
        CallNode->SetFromFunction(Function);
        CallNode->NodePosX = static_cast<int32>(NodeX);
        CallNode->NodePosY = static_cast<int32>(NodeY);
        CallNode->NodeComment = NodeLabel;
        NodeCreator.Finalize();
        CreatedNodes.Add(MakeShared<FJsonValueObject>(
            SerializeNodeWithMembership(CallNode, BuildCommentMembership(), true,
                                        true, true)));
        return CallNode;
      }
      return nullptr;
    };

    auto FindPinByNames = [&](UEdGraphNode* Node,
                              EEdGraphPinDirection Direction,
                              const TArray<FString>& PreferredNames)
        -> UEdGraphPin* {
      if (!Node) {
        return nullptr;
      }
      for (const FString& PreferredName : PreferredNames) {
        for (UEdGraphPin* Pin : Node->Pins) {
          if (!Pin || Pin->Direction != Direction) {
            continue;
          }
          if (Pin->PinName.ToString().Equals(PreferredName,
                                             ESearchCase::IgnoreCase)) {
            return Pin;
          }
        }
      }
      return nullptr;
    };

    auto FindFirstPin = [&](UEdGraphNode* Node, EEdGraphPinDirection Direction,
                            bool bExecPinsOnly,
                            bool bObjectPinsPreferred) -> UEdGraphPin* {
      if (!Node) {
        return nullptr;
      }
      for (UEdGraphPin* Pin : Node->Pins) {
        if (!Pin || Pin->Direction != Direction) {
          continue;
        }
        if (bExecPinsOnly &&
            Pin->PinType.PinCategory != UEdGraphSchema_K2::PC_Exec) {
          continue;
        }
        if (!bExecPinsOnly && bObjectPinsPreferred &&
            Pin->PinType.PinCategory != UEdGraphSchema_K2::PC_Object &&
            Pin->PinType.PinCategory != UEdGraphSchema_K2::PC_Interface &&
            Pin->PinType.PinCategory != UEdGraphSchema_K2::PC_Class) {
          continue;
        }
        return Pin;
      }
      if (!bExecPinsOnly && bObjectPinsPreferred) {
        return FindFirstPin(Node, Direction, false, false);
      }
      return nullptr;
    };

    auto FindLiteralOutputPin = [&](UEdGraphNode* Node) -> UEdGraphPin* {
      return FindPinByNames(Node, EGPD_Output, {TEXT("ReturnValue")});
    };

    auto ConnectPinsIfPossible = [&](UEdGraphPin* OutputPin,
                                     UEdGraphPin* InputPin,
                                     const FString& Label) -> bool {
      if (!OutputPin || !InputPin) {
        return false;
      }
      if (TargetGraph->GetSchema()->TryCreateConnection(OutputPin, InputPin)) {
        TSharedPtr<FJsonObject> LinkObj = MakeShared<FJsonObject>();
        LinkObj->SetStringField(TEXT("label"), Label);
        LinkObj->SetStringField(TEXT("fromNodeId"),
                                OutputPin->GetOwningNode()->NodeGuid.ToString());
        LinkObj->SetStringField(TEXT("fromPinName"),
                                OutputPin->PinName.ToString());
        LinkObj->SetStringField(TEXT("toNodeId"),
                                InputPin->GetOwningNode()->NodeGuid.ToString());
        LinkObj->SetStringField(TEXT("toPinName"),
                                InputPin->PinName.ToString());
        AutoConnections.Add(MakeShared<FJsonValueObject>(LinkObj));
        return true;
      }
      return false;
    };

    auto WireLiteralIntoNode = [&](UK2Node_CallFunction* LiteralNode,
                                   UEdGraphNode* TargetNode,
                                   const TArray<FString>& PreferredPins,
                                   const FString& Label) {
      ConnectPinsIfPossible(FindLiteralOutputPin(LiteralNode),
                            FindPinByNames(TargetNode, EGPD_Input,
                                           PreferredPins),
                            Label);
    };

    auto FindPrimaryObjectOutput = [&](UEdGraphNode* Node) -> UEdGraphPin* {
      if (UEdGraphPin* PreferredPin = FindPinByNames(
              Node, EGPD_Output,
              {TEXT("AsConfigPropertySection"), TEXT("AsConfigProperty"),
               TEXT("ReturnValue"), TEXT("Object"), TEXT("Value")})) {
        return PreferredPin;
      }
      return FindFirstPin(Node, EGPD_Output, false, true);
    };

    auto FindPrimaryObjectInput = [&](UEdGraphNode* Node) -> UEdGraphPin* {
      if (UEdGraphPin* PreferredPin = FindPinByNames(
              Node, EGPD_Input,
              {TEXT("Object"), TEXT("Target"), TEXT("Property"),
               TEXT("ConfigProperty"), TEXT("Section"),
               TEXT("ConfigSection"), TEXT("InputObject")})) {
        return PreferredPin;
      }
      return FindFirstPin(Node, EGPD_Input, false, true);
    };

    auto WireExecChain = [&](UEdGraphNode* FromNode, UEdGraphNode* ToNode,
                             const FString& Label) {
      ConnectPinsIfPossible(FindFirstPin(FromNode, EGPD_Output, true, false),
                            FindFirstPin(ToNode, EGPD_Input, true, false),
                            Label);
    };

    const FString DefaultEventName = FString::Printf(
        TEXT("Apply_%s_%s"), *SectionName.Replace(TEXT("/"), TEXT("_")),
        *PropertyKey.Replace(TEXT("/"), TEXT("_")));
    UK2Node_CallFunction* SectionLiteralNode =
        CreateLiteralNode(SectionName, TEXT("Section literal"), X + 40.0,
                          Y + 84.0);
    UK2Node_CallFunction* PropertyLiteralNode =
        CreateLiteralNode(PropertyKey, TEXT("Property literal"), X + 40.0,
                          Y + 184.0);
    UK2Node_CallFunction* TypeLiteralNode =
        ExpectedType.IsEmpty()
            ? nullptr
            : CreateLiteralNode(ExpectedType, TEXT("Type literal"), X + 40.0,
                                Y + 284.0);

    FGraphNodeCreator<UK2Node_CustomEvent> EventCreator(*TargetGraph);
    UK2Node_CustomEvent* EventNode = EventCreator.CreateNode(false);
    EventNode->CustomFunctionName =
        FName(*(CustomEventName.IsEmpty() ? DefaultEventName : CustomEventName));
    EventNode->NodePosX = static_cast<int32>(X + 260.0);
    EventNode->NodePosY = static_cast<int32>(Y + 84.0);
    EventNode->NodeComment = TEXT("Config binding entry point");
    EventCreator.Finalize();
    CreatedNodes.Add(MakeShared<FJsonValueObject>(SerializeNodeWithMembership(
        EventNode, BuildCommentMembership(), true, true, true)));

    UK2Node_CallFunction* SectionLookupNode = CreateCallNode(
        SectionLookupClass, SectionLookupFunctionName, TEXT("Section lookup"),
        X + 520.0, Y + 32.0);
    UK2Node_CallFunction* PropertyLookupNode = CreateCallNode(
        PropertyLookupClass, PropertyLookupFunctionName,
        TEXT("Property lookup"), X + 800.0, Y + 32.0);

    UK2Node_DynamicCast* CastNode = nullptr;
    if (UClass* CastTargetClass = ResolveUClass(ExpectedType)) {
      FGraphNodeCreator<UK2Node_DynamicCast> CastCreator(*TargetGraph);
      CastNode = CastCreator.CreateNode(false);
      CastNode->TargetType = CastTargetClass;
      CastNode->NodePosX = static_cast<int32>(X + 1080.0);
      CastNode->NodePosY = static_cast<int32>(Y + 32.0);
      CastNode->NodeComment = TEXT("Config property cast");
      CastCreator.Finalize();
      CreatedNodes.Add(MakeShared<FJsonValueObject>(SerializeNodeWithMembership(
          CastNode, BuildCommentMembership(), true, true, true)));
    }

    UK2Node_CallFunction* BindNode = CreateCallNode(
        BindClass, BindFunctionName, TEXT("Bind OnPropertyValueChanged"),
        X + 1360.0, Y + 32.0);
    UK2Node_CallFunction* ApplyNode = CreateCallNode(
        MemberClass, MemberName, TEXT("Apply/config target"), X + 1640.0,
        Y + 32.0);

    WireLiteralIntoNode(SectionLiteralNode, SectionLookupNode,
                        {TEXT("Section"), TEXT("SectionName"),
                         TEXT("ConfigSection"), TEXT("Name"), TEXT("Key")},
                        TEXT("section-literal"));
    WireLiteralIntoNode(PropertyLiteralNode, PropertyLookupNode,
                        {TEXT("Property"), TEXT("PropertyName"), TEXT("Key"),
                         TEXT("Name")},
                        TEXT("property-literal"));
    WireLiteralIntoNode(SectionLiteralNode, ApplyNode,
                        {TEXT("Section"), TEXT("SectionName")},
                        TEXT("section-to-apply"));
    WireLiteralIntoNode(PropertyLiteralNode, ApplyNode,
                        {TEXT("Property"), TEXT("PropertyName"), TEXT("Key")},
                        TEXT("property-to-apply"));
    WireLiteralIntoNode(TypeLiteralNode, ApplyNode,
                        {TEXT("Type"), TEXT("ExpectedType")},
                        TEXT("type-to-apply"));
    WireLiteralIntoNode(TypeLiteralNode, BindNode,
                        {TEXT("Type"), TEXT("ExpectedType")},
                        TEXT("type-to-bind"));

    WireExecChain(EventNode, SectionLookupNode, TEXT("event-to-section-lookup"));
    WireExecChain(SectionLookupNode, PropertyLookupNode,
                  TEXT("section-lookup-to-property-lookup"));
    WireExecChain(PropertyLookupNode, BindNode,
                  TEXT("property-lookup-to-bind"));
    WireExecChain(BindNode, ApplyNode, TEXT("bind-to-apply"));
    if (!SectionLookupNode && PropertyLookupNode) {
      WireExecChain(EventNode, PropertyLookupNode,
                    TEXT("event-to-property-lookup"));
    }
    if (!SectionLookupNode && !PropertyLookupNode && BindNode) {
      WireExecChain(EventNode, BindNode, TEXT("event-to-bind"));
    }
    if (!SectionLookupNode && !PropertyLookupNode && !BindNode && ApplyNode) {
      WireExecChain(EventNode, ApplyNode, TEXT("event-to-apply"));
    }

    UEdGraphNode* CurrentDataNode = SectionLookupNode;
    if (CurrentDataNode && PropertyLookupNode) {
      ConnectPinsIfPossible(FindPrimaryObjectOutput(CurrentDataNode),
                            FindPrimaryObjectInput(PropertyLookupNode),
                            TEXT("section-object-to-property-lookup"));
      CurrentDataNode = PropertyLookupNode;
    } else if (PropertyLookupNode) {
      CurrentDataNode = PropertyLookupNode;
    }

    if (CurrentDataNode && CastNode) {
      ConnectPinsIfPossible(FindPrimaryObjectOutput(CurrentDataNode),
                            FindPrimaryObjectInput(CastNode),
                            TEXT("lookup-to-cast"));
      CurrentDataNode = CastNode;
    } else if (CastNode) {
      CurrentDataNode = CastNode;
    }

    if (CurrentDataNode && BindNode) {
      ConnectPinsIfPossible(FindPrimaryObjectOutput(CurrentDataNode),
                            FindPrimaryObjectInput(BindNode),
                            TEXT("data-to-bind"));
      CurrentDataNode = BindNode;
    } else if (BindNode) {
      CurrentDataNode = BindNode;
    }

    if (CurrentDataNode && ApplyNode) {
      ConnectPinsIfPossible(FindPrimaryObjectOutput(CurrentDataNode),
                            FindPrimaryObjectInput(ApplyNode),
                            TEXT("data-to-apply"));
    }

    FBlueprintEditorUtils::MarkBlueprintAsModified(Blueprint);

    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetStringField(TEXT("graphName"), TargetGraph->GetName());
    Result->SetStringField(TEXT("section"), SectionName);
    Result->SetStringField(TEXT("propertyName"), PropertyKey);
    Result->SetStringField(TEXT("expectedType"), ExpectedType);
    Result->SetArrayField(TEXT("createdNodes"), CreatedNodes);
    Result->SetArrayField(TEXT("autoConnections"), AutoConnections);
    Result->SetBoolField(TEXT("hasCustomEvent"), EventNode != nullptr);
    Result->SetBoolField(TEXT("hasSectionLookup"), SectionLookupNode != nullptr);
    Result->SetBoolField(TEXT("hasPropertyLookup"),
                         PropertyLookupNode != nullptr);
    Result->SetBoolField(TEXT("hasCast"), CastNode != nullptr);
    Result->SetBoolField(TEXT("hasBind"), BindNode != nullptr);
    Result->SetBoolField(TEXT("hasApply"), ApplyNode != nullptr);
    Result->SetBoolField(
        TEXT("fullyWired"),
        SectionLookupNode != nullptr && PropertyLookupNode != nullptr &&
            BindNode != nullptr && ApplyNode != nullptr &&
            AutoConnections.Num() > 0);
    Result->SetStringField(
        TEXT("warning"),
        TEXT("Config binding cluster creation now stamps an event-driven chain and wires common literal/data/exec pins when lookup/bind/apply functions are provided. Delegate-specific or project-specific pins may still need manual adjustment."));
    AddAssetVerification(Result, Blueprint);

    SendAutomationResponse(RequestingSocket, RequestId, true,
                           TEXT("Config binding cluster created."),
                           Result);
    return true;
  } else if (SubAction == TEXT("summarize_migration_stage")) {
    const TMap<FGuid, TArray<FGuid>> Membership = BuildCommentMembership();
    FString FilterTag;
    Payload->TryGetStringField(TEXT("commentTag"), FilterTag);
    FilterTag = FilterTag.TrimStartAndEnd().ToLower();

    TArray<TSharedPtr<FJsonValue>> GroupsJson;
    for (UEdGraphNode* Node : TargetGraph->Nodes) {
      UEdGraphNode_Comment* CommentNode = Cast<UEdGraphNode_Comment>(Node);
      if (!CommentNode) {
        continue;
      }
      const TArray<FString> Tags =
          ParseBlueprintCommentTags(CommentNode->NodeComment);
      if (!FilterTag.IsEmpty()) {
        bool bMatched = false;
        for (const FString& Tag : Tags) {
          if (Tag.ToLower().Contains(FilterTag)) {
            bMatched = true;
            break;
          }
        }
        if (!bMatched) {
          continue;
        }
      }

      TArray<UEdGraphNode*> GroupNodes = CollectCommentGroupNodes(CommentNode);
      int32 ExternalLinkCount = 0;
      for (UEdGraphNode* GroupNode : GroupNodes) {
        if (!GroupNode) {
          continue;
        }
        for (UEdGraphPin* Pin : GroupNode->Pins) {
          if (!Pin) {
            continue;
          }
          for (UEdGraphPin* LinkedPin : Pin->LinkedTo) {
            UEdGraphNode* LinkedNode =
                LinkedPin ? LinkedPin->GetOwningNode() : nullptr;
            if (LinkedNode && !GroupNodes.Contains(LinkedNode)) {
              ExternalLinkCount += 1;
            }
          }
        }
      }

      TSharedPtr<FJsonObject> GroupObj = MakeShared<FJsonObject>();
      GroupObj->SetStringField(TEXT("commentNodeId"),
                               CommentNode->NodeGuid.ToString());
      GroupObj->SetStringField(
          TEXT("commentTitle"),
          CommentNode->GetNodeTitle(ENodeTitleType::ListView).ToString());
      GroupObj->SetStringField(TEXT("comment"), CommentNode->NodeComment);
      TArray<TSharedPtr<FJsonValue>> TagsJson;
      for (const FString& Tag : Tags) {
        TagsJson.Add(MakeShared<FJsonValueString>(Tag));
      }
      GroupObj->SetArrayField(TEXT("tags"), TagsJson);
      GroupObj->SetNumberField(TEXT("nodeCount"), GroupNodes.Num());
      GroupObj->SetNumberField(TEXT("externalLinkCount"), ExternalLinkCount);
      GroupObj->SetBoolField(
          TEXT("disabled"),
          CommentNode->NodeComment.Contains(TEXT("status: disabled"),
                                            ESearchCase::IgnoreCase) ||
              Tags.ContainsByPredicate([](const FString& Tag) {
                return Tag.Equals(TEXT("disabled"), ESearchCase::IgnoreCase);
              }));
      GroupsJson.Add(MakeShared<FJsonValueObject>(GroupObj));
    }

    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetStringField(TEXT("graphName"), TargetGraph->GetName());
    Result->SetArrayField(TEXT("groups"), GroupsJson);
    Result->SetNumberField(TEXT("groupCount"), GroupsJson.Num());
    AddAssetVerification(Result, Blueprint);
    SendAutomationResponse(RequestingSocket, RequestId, true,
                           TEXT("Migration stage summary retrieved."), Result);
    return true;
  } else if (SubAction == TEXT("list_node_types")) {
    // List all available UK2Node types for AI discoverability
    TArray<TSharedPtr<FJsonValue>> NodeTypes;
    for (TObjectIterator<UClass> It; It; ++It) {
      if (!It->IsChildOf(UK2Node::StaticClass()))
        continue;
      if (It->HasAnyClassFlags(CLASS_Abstract))
        continue;

      TSharedPtr<FJsonObject> TypeObj = MakeShared<FJsonObject>();
      TypeObj->SetStringField(TEXT("className"), It->GetName());
      TypeObj->SetStringField(TEXT("displayName"),
                              It->GetDisplayNameText().ToString());
      NodeTypes.Add(MakeShared<FJsonValueObject>(TypeObj));
    }

    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetArrayField(TEXT("nodeTypes"), NodeTypes);
    Result->SetNumberField(TEXT("count"), NodeTypes.Num());
    AddAssetVerification(Result, Blueprint);
    SendAutomationResponse(RequestingSocket, RequestId, true,
                           TEXT("Node types listed."), Result);
    return true;
  } else if (SubAction == TEXT("set_pin_default_value")) {
    // Set a default value on a node's input pin
    FString NodeId, PinName, Value;
    Payload->TryGetStringField(TEXT("nodeId"), NodeId);
    Payload->TryGetStringField(TEXT("pinName"), PinName);
    Payload->TryGetStringField(TEXT("value"), Value);

    UEdGraphNode *TargetNode = FindNodeByIdOrName(NodeId);
    if (!TargetNode) {
      SendAutomationError(RequestingSocket, RequestId, TEXT("Node not found."),
                          TEXT("NODE_NOT_FOUND"));
      return true;
    }

    UEdGraphPin *Pin = TargetNode->FindPin(*PinName);
    if (!Pin) {
      SendAutomationError(RequestingSocket, RequestId, TEXT("Pin not found."),
                          TEXT("PIN_NOT_FOUND"));
      return true;
    }

    if (Pin->Direction != EGPD_Input) {
      SendAutomationError(RequestingSocket, RequestId,
                          TEXT("Can only set default values on input pins."),
                          TEXT("INVALID_PIN_DIRECTION"));
      return true;
    }

    const FScopedTransaction Transaction(
        FText::FromString(TEXT("Set Pin Default Value")));
    Blueprint->Modify();
    TargetGraph->Modify();
    TargetNode->Modify();

    // Use the schema to properly set the default value
    const UEdGraphSchema *Schema = TargetGraph->GetSchema();
    Schema->TrySetDefaultValue(*Pin, Value);

    FBlueprintEditorUtils::MarkBlueprintAsModified(Blueprint);

    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetStringField(TEXT("nodeId"), NodeId);
    Result->SetStringField(TEXT("nodeName"), TargetNode->GetName());
    Result->SetStringField(TEXT("pinName"), PinName);
    Result->SetStringField(TEXT("value"), Value);
    AddAssetVerification(Result, Blueprint);
    SendAutomationResponse(RequestingSocket, RequestId, true,
                           TEXT("Pin default value set."), Result);
    return true;
  }

  SendAutomationError(
      RequestingSocket, RequestId,
      FString::Printf(TEXT("Unknown subAction: %s"), *SubAction),
      TEXT("INVALID_SUBACTION"));
  return true;
#else
  SendAutomationError(RequestingSocket, RequestId,
                      TEXT("Blueprint graph actions are editor-only."),
                      TEXT("EDITOR_ONLY"));
  return true;
#endif
}
