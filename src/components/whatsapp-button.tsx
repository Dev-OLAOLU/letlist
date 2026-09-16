import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DESK_WHATSAPP, whatsappHref, type Listing } from "@/lib/listings";
import { cn } from "@/lib/utils";

export function WhatsappButton({
  listing,
  phone = DESK_WHATSAPP,
  className,
}: {
  listing: Listing;
  phone?: string;
  className?: string;
}) {
  return (
    <Button variant="whatsapp" size="lg" className={cn("w-full", className)} asChild>
      <a href={whatsappHref(listing, phone)} target="_blank" rel="noreferrer">
        <MessageCircle className="size-4" />
        Chat on WhatsApp
      </a>
    </Button>
  );
}
