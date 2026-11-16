export type ChatMessage = {
  id: string;
  from: "me" | "them";
  text: string;
  time: string;
  status?: "sent" | "delivered" | "read";
};

export type Conversation = {
  id: string;
  name: string;
  phone: string;
  initials: string;
  lastMessage: string;
  lastTime: string;
  unread: number;
  assignedTo?: string;
  tags: string[];
  notes: string;
  status?: string;
  email?: string;
  messages: ChatMessage[];
};

export const conversations: Conversation[] = [
  {
    id: "c1",
    name: "Priya Sharma",
    phone: "+91 98220 11445",
    initials: "PS",
    lastMessage: "Can I exchange it for a medium?",
    lastTime: "10:42",
    unread: 2,
    assignedTo: "Ajinkya",
    tags: ["Repeat customer", "COD"],
    notes: "Prefers Hindi. Ordered 6 times, always kurtis size S.",
    messages: [
      { id: "m1", from: "them", text: "Hi! I received my order #1042 today", time: "10:38" },
      { id: "m2", from: "them", text: "The kurti is beautiful but it's a bit tight", time: "10:39" },
      { id: "m3", from: "me", text: "Hi Priya! Glad it reached you. Sorry about the fit — we can definitely help with an exchange.", time: "10:40", status: "read" },
      { id: "m4", from: "them", text: "Can I exchange it for a medium?", time: "10:42" },
      { id: "m5", from: "them", text: "Also, is pickup possible from my address?", time: "10:42" },
    ],
  },
  {
    id: "c2",
    name: "Rahul Mehta",
    phone: "+91 99870 55621",
    initials: "RM",
    lastMessage: "Payment done, please confirm",
    lastTime: "09:15",
    unread: 1,
    tags: ["Wholesale"],
    notes: "Bulk buyer — electronics reseller in Pune.",
    messages: [
      { id: "m1", from: "me", text: "Hi Rahul, a friendly reminder that payment of ₹24,500 for invoice #INV-881 is due today.", time: "09:02", status: "read" },
      { id: "m2", from: "them", text: "Payment done, please confirm", time: "09:15" },
    ],
  },
  {
    id: "c3",
    name: "Ananya Iyer",
    phone: "+91 90040 78233",
    initials: "AI",
    lastMessage: "Loved it! ⭐⭐⭐⭐⭐",
    lastTime: "Yesterday",
    unread: 0,
    assignedTo: "Sneha",
    tags: ["VIP"],
    notes: "Left a 5-star review last month. Engages with every campaign.",
    messages: [
      { id: "m1", from: "me", text: "Hi Ananya, how was your experience with order #1038? Your feedback helps us improve.", time: "Yesterday", status: "read" },
      { id: "m2", from: "them", text: "Loved it! ⭐⭐⭐⭐⭐", time: "Yesterday" },
      { id: "m3", from: "me", text: "That's wonderful to hear — thank you! 💚", time: "Yesterday", status: "read" },
    ],
  },
  {
    id: "c4",
    name: "Vikram Desai",
    phone: "+91 98331 20987",
    initials: "VD",
    lastMessage: "When will it be back in stock?",
    lastTime: "Yesterday",
    unread: 0,
    tags: ["New lead"],
    notes: "Came from the Diwali Sale campaign.",
    messages: [
      { id: "m1", from: "them", text: "The wireless earbuds show out of stock", time: "Yesterday" },
      { id: "m2", from: "them", text: "When will it be back in stock?", time: "Yesterday" },
    ],
  },
  {
    id: "c5",
    name: "Meera Kulkarni",
    phone: "+91 98901 45512",
    initials: "MK",
    lastMessage: "Thanks for the quick refund!",
    lastTime: "Tue",
    unread: 0,
    assignedTo: "Ajinkya",
    tags: ["Refund processed"],
    notes: "Refund of ₹1,299 processed on Tuesday.",
    messages: [
      { id: "m1", from: "me", text: "Hi Meera, your refund of ₹1,299 for order #1019 has been processed. It should reflect in 3–5 business days.", time: "Tue", status: "read" },
      { id: "m2", from: "them", text: "Thanks for the quick refund!", time: "Tue" },
    ],
  },
  {
    id: "c6",
    name: "Arjun Nair",
    phone: "+91 97690 88341",
    initials: "AN",
    lastMessage: "Ok, book me for Saturday 11am",
    lastTime: "Mon",
    unread: 0,
    tags: ["Appointment"],
    notes: "In-store demo appointment for the new collection.",
    messages: [
      { id: "m1", from: "me", text: "Hi Arjun, this is a reminder for your store visit. Reply C to confirm or R to reschedule.", time: "Mon", status: "read" },
      { id: "m2", from: "them", text: "Ok, book me for Saturday 11am", time: "Mon" },
    ],
  },
  {
    id: "c7",
    name: "Sana Sheikh",
    phone: "+91 98111 34098",
    initials: "SS",
    lastMessage: "Do you deliver to Lucknow?",
    lastTime: "Sun",
    unread: 0,
    tags: ["New lead"],
    notes: "Asked about delivery coverage.",
    messages: [
      { id: "m1", from: "them", text: "Do you deliver to Lucknow?", time: "Sun" },
      { id: "m2", from: "me", text: "Hi Sana! Yes, we deliver across India. Lucknow orders usually arrive in 3–4 days.", time: "Sun", status: "delivered" },
    ],
  },
];
