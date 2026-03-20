import { ChevronDown } from "lucide-react";
import { type ComponentProps, type ReactNode, useCallback } from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ChatMessageAreaScrollButtonProps {
	alignment?: "left" | "center" | "right";
	className?: string;
}

export function ChatMessageAreaScrollButton({
	alignment = "center",
	className,
}: ChatMessageAreaScrollButtonProps) {
	const { isAtBottom, scrollToBottom } = useStickToBottomContext();

	const handleScrollToBottom = useCallback(() => {
		scrollToBottom();
	}, [scrollToBottom]);

	if (isAtBottom) {
		return null;
	}

	const alignmentClasses = {
		left: "left-4",
		center: "left-1/2 -translate-x-1/2",
		right: "right-4",
	};

	return (
		<Button
			variant="secondary"
			size="icon"
			className={cn(
				"absolute bottom-4 rounded-full shadow-lg hover:bg-secondary",
				alignmentClasses[alignment],
				className,
			)}
			onClick={handleScrollToBottom}
		>
			<ChevronDown className="h-4 w-4" />
		</Button>
	);
}

type ChatMessageAreaProps = ComponentProps<typeof StickToBottom>;

export function ChatMessageArea({ className, ...props }: ChatMessageAreaProps) {
	return (
		<StickToBottom
			className={cn(
				"relative flex-1 h-full overflow-x-hidden overflow-y-auto",
				className,
			)}
			resize="smooth"
			initial="smooth"
			{...props}
		/>
	);
}

type ChatMessageAreaContentProps = Omit<
	ComponentProps<typeof StickToBottom.Content>,
	"children" | "scrollClassName"
> & {
	children?: ReactNode;
	scrollClassName?: string;
	scrollRestorationId?: string;
	scrollStyle?: ComponentProps<"div">["style"];
};

export function ChatMessageAreaContent({
	className,
	scrollClassName,
	scrollRestorationId,
	scrollStyle,
	...props
}: ChatMessageAreaContentProps) {
	const { scrollRef, contentRef } = useStickToBottomContext();

	return (
		<div
			ref={scrollRef}
			data-scroll-restoration-id={scrollRestorationId}
			className={cn(
				"h-full w-full overflow-x-hidden overflow-y-auto",
				scrollClassName,
			)}
			style={{
				height: "100%",
				width: "100%",
				scrollbarGutter: "stable both-edges",
				...scrollStyle,
			}}
		>
			<div
				{...props}
				ref={contentRef}
				className={cn("max-w-2xl mx-auto w-full min-h-full py-2", className)}
			/>
		</div>
	);
}
