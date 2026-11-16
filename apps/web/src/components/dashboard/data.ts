export const stats = [
  { label: "Total Contacts", value: "48,294", change: 8.2, hint: "vs last period" },
  { label: "Messages Sent", value: "126,840", change: 12.5, hint: "vs last period" },
  { label: "Messages Delivered", value: "121,903", change: 4.1, hint: "96.1% delivery rate" },
  { label: "Response Rate", value: "38.6%", change: -1.4, hint: "vs last period" },
];

export const activity = [
  { day: "Mon", sent: 14200, delivered: 13650, read: 10120 },
  { day: "Tue", sent: 16800, delivered: 16190, read: 12400 },
  { day: "Wed", sent: 15100, delivered: 14520, read: 11080 },
  { day: "Thu", sent: 19400, delivered: 18710, read: 14960 },
  { day: "Fri", sent: 22600, delivered: 21800, read: 17300 },
  { day: "Sat", sent: 18900, delivered: 18120, read: 13800 },
  { day: "Sun", sent: 19840, delivered: 18913, read: 14420 },
];

export const delivery = [
  { name: "Read", value: 72, color: "var(--chart-1)" },
  { name: "Delivered", value: 24, color: "var(--chart-2)" },
  { name: "Failed", value: 4, color: "var(--chart-5)" },
];

export const campaignPerf = [
  { name: "Admissions", read: 78, clicked: 31 },
  { name: "Follow-up", read: 69, clicked: 24 },
  { name: "Courses", read: 61, clicked: 18 },
  { name: "Feedback", read: 54, clicked: 12 },
];

export type CampaignStatus = "Completed" | "Running" | "Scheduled" | "Draft";
export const campaigns: { name: string; audience: number; sent: number; read: number; status: CampaignStatus; date: string }[] = [
  { name: "Diwali Festive Sale", audience: 12400, sent: 12380, read: 9620, status: "Completed", date: "Nov 3" },
  { name: "Abandoned Cart – Week 44", audience: 2140, sent: 1890, read: 1302, status: "Running", date: "Nov 4" },
  { name: "Winter Collection Launch", audience: 18600, sent: 0, read: 0, status: "Scheduled", date: "Nov 8" },
  { name: "Order Feedback Survey", audience: 3420, sent: 3418, read: 1845, status: "Completed", date: "Nov 1" },
  { name: "VIP Early Access", audience: 860, sent: 0, read: 0, status: "Draft", date: "—" },
];

export const conversations = [
  { name: "Priya Sharma", initials: "PS", message: "Is the blue kurta available in M?", time: "2m", unread: 2 },
  { name: "Rahul Mehta", initials: "RM", message: "Thanks, order received 👍", time: "14m", unread: 0 },
  { name: "Ananya Iyer", initials: "AI", message: "Can I change my delivery address?", time: "28m", unread: 1 },
  { name: "Vikram Singh", initials: "VS", message: "When will the sale end?", time: "1h", unread: 0 },
  { name: "Sneha Kulkarni", initials: "SK", message: "Payment failed, please help", time: "2h", unread: 3 },
];
