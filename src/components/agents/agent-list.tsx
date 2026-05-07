import {
  closestCenter,
  DndContext,
  type DraggableAttributes,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { clsx } from "clsx";
import { GripVertical } from "lucide-react";
import { useCallback, useMemo } from "react";
import { AgentMascot } from "@/components/shared/agent-mascot/agent-mascot";
import type { AgentDetail } from "@/lib/types";
import { agentDisplayName } from "@/lib/types";
import { useAgentStore } from "@/stores/agent-store";

type SortableListeners = NonNullable<ReturnType<typeof useSortable>["listeners"]>;

function AgentItem({
  agent,
  isSelected,
  onSelect,
  sortable,
  dragHandleProps,
}: {
  agent: AgentDetail;
  isSelected: boolean;
  onSelect: () => void;
  sortable: boolean;
  dragHandleProps?: {
    attributes: DraggableAttributes;
    listeners?: SortableListeners;
  };
}) {
  const dragProps = dragHandleProps ?? { attributes: {}, listeners: {} };

  return (
    <div
      className={clsx(
        "flex items-center rounded-lg transition-colors",
        isSelected
          ? "bg-accent text-accent-foreground"
          : agent.detected
            ? "text-foreground/80 hover:bg-accent/50"
            : "text-muted-foreground/50",
      )}
    >
      <div
        className={clsx(
          "flex shrink-0 items-center justify-center text-muted-foreground/30 hover:text-muted-foreground/60",
          sortable
            ? "w-6 cursor-grab active:cursor-grabbing"
            : "w-3 pointer-events-none opacity-0",
        )}
        {...dragProps.attributes}
        {...dragProps.listeners}
      >
        <GripVertical size={14} />
      </div>
      <button
        onClick={onSelect}
        disabled={!agent.detected}
        className="flex flex-1 items-center gap-2 py-2.5 pr-3 text-left"
      >
        <AgentMascot name={agent.name} size={18} />
        <div className="min-w-0">
          <span className="block text-[13px] font-medium">
            {agentDisplayName(agent.name)}
          </span>
          {!agent.detected && (
            <span className="block text-[10px] leading-tight text-muted-foreground">
              Not detected
            </span>
          )}
        </div>
      </button>
    </div>
  );
}

function SortableAgentItem({
  agent,
  isSelected,
  onSelect,
}: {
  agent: AgentDetail;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: agent.name });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={clsx(isDragging && "z-10 opacity-50")}
    >
      <AgentItem
        agent={agent}
        isSelected={isSelected}
        onSelect={onSelect}
        sortable
        dragHandleProps={{ attributes, listeners }}
      />
    </div>
  );
}

export function AgentList({
  agents,
  selectedAgent,
  onSelectAgent,
  sortable = false,
  emptyMessage = "No agents available",
}: {
  agents: AgentDetail[];
  selectedAgent: string | null;
  onSelectAgent: (name: string) => void;
  sortable?: boolean;
  emptyMessage?: string;
}) {
  const agentOrder = useAgentStore((s) => s.agentOrder);
  const reorderAgents = useAgentStore((s) => s.reorderAgents);

  const sorted = useMemo(
    () =>
      [...agents].sort((a, b) => {
        const ai = agentOrder.indexOf(a.name);
        const bi = agentOrder.indexOf(b.name);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      }),
    [agents, agentOrder],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!sortable) return;

      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const names = sorted.map((agent) => agent.name);
      const oldIndex = names.indexOf(active.id as string);
      const newIndex = names.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;

      reorderAgents(arrayMove(names, oldIndex, newIndex));
    },
    [reorderAgents, sortable, sorted],
  );

  if (sorted.length === 0) {
    return (
      <div className="px-3 py-4 text-xs leading-5 text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  if (!sortable) {
    return (
      <div className="flex flex-col gap-0.5 p-2">
        {sorted.map((agent) => (
          <AgentItem
            key={agent.name}
            agent={agent}
            isSelected={agent.name === selectedAgent}
            onSelect={() => onSelectAgent(agent.name)}
            sortable={false}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 p-2">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sorted.map((agent) => agent.name)}
          strategy={verticalListSortingStrategy}
        >
          {sorted.map((agent) => (
            <SortableAgentItem
              key={agent.name}
              agent={agent}
              isSelected={agent.name === selectedAgent}
              onSelect={() => onSelectAgent(agent.name)}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}
