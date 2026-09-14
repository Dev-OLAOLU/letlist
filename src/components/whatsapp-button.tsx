import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { whatsappHref, type Listing } from "@/lib/listings";
import { cn } from "@/lib/utils";

export function WhatsappButton({
  listing,
  className,
}: {
  listing: Listing;
  className?: string;
}) {
  return (
    <Button variant="whatsapp" size="lg" className={cn("w-full", className)} asChild>
      <a href={whatsappHref(listing)} target="_blank" rel="noreferrer">
        <MessageCircle className="size-4" />
        Chat on WhatsApp
      </a>
    </Button>
  );
}
