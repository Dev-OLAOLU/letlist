export type LiveGroupPost = {
  waMessageId: string;
  groupName: string;
  body: string;
};

/** Fresh posts as if they just landed in the watched WhatsApp groups. */
export const LIVE_GROUP_POSTS: LiveGroupPost[] = [
  {
    waMessageId: "wamid.letlist.lekki.admiralty.rev3",
    groupName: "Lekki & Ajah Available Homes",
    body: `Forwarded from Lekki & Ajah Available Homes

UPDATE
2 bedroom apartment
Lekki Phase 1, by Admiralty

Rent now: 4.2 million per annum
Service charge: 600k
Agency: 10%
Legal: 10%

Fitted kitchen
POP ceiling
24hrs light
Treated water
Parking
Prepaid meter
All rooms ensuite

Still available this week.`,
  },
  {
    waMessageId: "wamid.letlist.lekki.ikate.new",
    groupName: "Lekki & Ajah Available Homes",
    body: `Forwarded from Lekki & Ajah Available Homes

HOT LETTING
2 bedroom flat
Ikate Elegushi, Lekki

Rent: 3.9 million yearly
Service charge 450k
Agency 10% Legal 10%

Newly renovated
Inverter
Fitted kitchen
Security
Parking
Prepaid meter`,
  },
  {
    waMessageId: "wamid.letlist.yaba.sc.new",
    groupName: "Yaba · Surulere · Students",
    body: `Forwarded from Yaba · Surulere · Students

Self contain
Yaba, Akoka by the stadium

Rent 780k per annum
Agency 10%
Legal 10%

Wardrobe
Prepaid meter
Treated water
Tiled floor

Available immediately.`,
  },
  {
    waMessageId: "wamid.letlist.ikeja.2bed.new",
    groupName: "Ikeja GRA & Mainland Flats",
    body: `Forwarded from Ikeja GRA & Mainland Flats

2 bedroom flat
Ikeja GRA, quiet close

Rent 2.7m yearly
Agency 10% Legal 10%
Service charge 180k

POP ceiling
Wardrobes
Parking
Prepaid meter
Security`,
  },
  {
    waMessageId: "wamid.letlist.magodo.update",
    groupName: "Magodo · Maryland · Gbagada",
    body: `Forwarded from Magodo · Maryland · Gbagada

4 bedroom duplex
Magodo Phase 2

Price reduced: 7 million per annum
Service charge 500k
Agency 10% Legal 10%

BQ
Estate security
Parking
Fitted kitchen
All rooms ensuite
Tarred road`,
  },
  {
    waMessageId: "wamid.letlist.vi.new",
    groupName: "VI · Ikoyi · Oniru Lets",
    body: `Forwarded from VI · Ikoyi · Oniru Lets

1 bedroom apartment
Victoria Island, Kofo Abayomi

Rent 5.8m per annum
Service charge 800k
Agency 10% Legal 10%

Serviced
24hrs light
Lift
Security
Fitted kitchen
Parking`,
  },
];
