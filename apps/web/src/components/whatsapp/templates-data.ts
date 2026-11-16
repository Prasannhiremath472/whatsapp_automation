export type TemplateStatus = "draft" | "pending" | "approved" | "rejected";

export type TemplateButton = {
  type: "quick_reply" | "cta_url" | "cta_phone";
  label: string;
  value?: string;
};

export type WaTemplate = {
  id: string;
  name: string;
  category: string;
  language: string;
  headerType: "none" | "text" | "image" | "video" | "document";
  headerText?: string;
  body: string;
  footer?: string;
  buttons: TemplateButton[];
  status: TemplateStatus;
  updatedAt: string;
};

export const templateCategories = [
  "Welcome",
  "Marketing",
  "Order Updates",
  "Payments",
  "Appointments",
  "Customer Support",
  "Feedback",
  "Re-engagement",
] as const;

export const templateLanguages = ["English", "Hindi", "Marathi"] as const;

export const statusMeta: Record<
  TemplateStatus,
  { label: string; className: string }
> = {
  approved: { label: "Approved", className: "bg-primary-soft text-primary" },
  pending: { label: "Pending review", className: "bg-warning/15 text-warning" },
  rejected: { label: "Rejected", className: "bg-destructive/10 text-destructive" },
  draft: { label: "Local draft", className: "bg-muted text-muted-foreground" },
};

const originalTemplates: WaTemplate[] = [
  {
    id: "tpl-welcome-1",
    name: "welcome_greeting",
    category: "Welcome",
    language: "English",
    headerType: "text",
    headerText: "Welcome to {{1}}!",
    body: "Hi {{1}}, thanks for joining {{2}}! We're excited to have you. Reply anytime — a real human reads every message.",
    footer: "Bright Minds Academy",
    buttons: [{ type: "quick_reply", label: "Browse products" }, { type: "quick_reply", label: "Talk to us" }],
    status: "approved",
    updatedAt: "2 days ago",
  },
  {
    id: "tpl-welcome-2",
    name: "onboarding_steps",
    category: "Welcome",
    language: "English",
    headerType: "none",
    body: "Welcome aboard, {{1}}! Here's how to get started:\n1. Complete your profile\n2. Link your store\n3. Send your first campaign\nNeed help? Just reply HELP.",
    buttons: [{ type: "cta_url", label: "Open setup guide", value: "https://brightminds.example/setup" }],
    status: "approved",
    updatedAt: "1 week ago",
  },
  {
    id: "tpl-marketing-1",
    name: "diwali_sale_announce",
    category: "Marketing",
    language: "English",
    headerType: "image",
    body: "Hi {{1}}! Our Diwali Sale is live — up to {{2}}% off storewide until {{3}}. Early access for you starts now.",
    footer: "Reply STOP to opt out",
    buttons: [{ type: "cta_url", label: "Shop the sale", value: "https://brightminds.example/sale" }],
    status: "approved",
    updatedAt: "3 days ago",
  },
  {
    id: "tpl-marketing-2",
    name: "new_collection_teaser",
    category: "Marketing",
    language: "Hindi",
    headerType: "image",
    body: "नमस्ते {{1}}! हमारा नया कलेक्शन आ गया है। आपके लिए खास छूट — {{2}}% तक। आज ही देखें!",
    footer: "बंद करने के लिए STOP लिखें",
    buttons: [{ type: "cta_url", label: "कलेक्शन देखें", value: "https://brightminds.example/new" }],
    status: "pending",
    updatedAt: "5 hours ago",
  },
  {
    id: "tpl-order-1",
    name: "order_confirmation",
    category: "Order Updates",
    language: "English",
    headerType: "none",
    body: "Thanks {{1}}! Your order #{{2}} for {{3}} is confirmed. We'll message you when it ships.",
    buttons: [{ type: "cta_url", label: "View order", value: "https://brightminds.example/orders" }],
    status: "approved",
    updatedAt: "1 day ago",
  },
  {
    id: "tpl-order-2",
    name: "shipping_update",
    category: "Order Updates",
    language: "English",
    headerType: "text",
    headerText: "Your order is on its way",
    body: "Good news {{1}}! Order #{{2}} has shipped via {{3}}. Expected delivery: {{4}}.",
    buttons: [{ type: "cta_url", label: "Track package", value: "https://brightminds.example/track" }],
    status: "approved",
    updatedAt: "4 days ago",
  },
  {
    id: "tpl-payment-1",
    name: "payment_reminder",
    category: "Payments",
    language: "English",
    headerType: "none",
    body: "Hi {{1}}, a friendly reminder that payment of ₹{{2}} for invoice #{{3}} is due on {{4}}. Pay securely in one tap.",
    buttons: [{ type: "cta_url", label: "Pay now", value: "https://brightminds.example/pay" }, { type: "quick_reply", label: "Already paid" }],
    status: "approved",
    updatedAt: "2 days ago",
  },
  {
    id: "tpl-payment-2",
    name: "payment_received",
    category: "Payments",
    language: "English",
    headerType: "none",
    body: "Payment received — thank you {{1}}! ₹{{2}} towards invoice #{{3}}. Your receipt is attached below.",
    footer: "Bright Minds Academy Billing",
    buttons: [],
    status: "draft",
    updatedAt: "1 hour ago",
  },
  {
    id: "tpl-appointment-1",
    name: "appointment_reminder",
    category: "Appointments",
    language: "English",
    headerType: "text",
    headerText: "Appointment reminder",
    body: "Hi {{1}}, this is a reminder for your appointment on {{2}} at {{3}} with {{4}}. Reply C to confirm or R to reschedule.",
    buttons: [{ type: "quick_reply", label: "Confirm" }, { type: "quick_reply", label: "Reschedule" }],
    status: "approved",
    updatedAt: "6 days ago",
  },
  {
    id: "tpl-support-1",
    name: "support_ticket_update",
    category: "Customer Support",
    language: "English",
    headerType: "none",
    body: "Hi {{1}}, update on your ticket #{{2}}: {{3}}. We'll keep you posted — no need to follow up.",
    buttons: [{ type: "quick_reply", label: "Thanks" }, { type: "cta_phone", label: "Call support", value: "+12025550100" }],
    status: "approved",
    updatedAt: "3 days ago",
  },
  {
    id: "tpl-feedback-1",
    name: "post_delivery_feedback",
    category: "Feedback",
    language: "English",
    headerType: "none",
    body: "Hi {{1}}, how was your experience with order #{{2}}? Your feedback helps us improve — it takes 30 seconds.",
    buttons: [{ type: "quick_reply", label: "Loved it" }, { type: "quick_reply", label: "Could be better" }],
    status: "approved",
    updatedAt: "1 week ago",
  },
  {
    id: "tpl-reengage-1",
    name: "winback_offer",
    category: "Re-engagement",
    language: "English",
    headerType: "image",
    body: "We miss you, {{1}}! It's been a while — here's {{2}}% off your next order, valid until {{3}}.",
    footer: "Reply STOP to opt out",
    buttons: [{ type: "cta_url", label: "Claim offer", value: "https://brightminds.example/winback" }],
    status: "rejected",
    updatedAt: "2 weeks ago",
  },
  {
    id: "tpl-reengage-2",
    name: "cart_abandonment",
    category: "Re-engagement",
    language: "English",
    headerType: "none",
    body: "Hi {{1}}, you left {{2}} in your cart. Still interested? Complete your order before stock runs out.",
    buttons: [{ type: "cta_url", label: "Return to cart", value: "https://brightminds.example/cart" }],
    status: "pending",
    updatedAt: "8 hours ago",
  },
  {
    id: "tpl-support-2",
    name: "after_hours_reply",
    category: "Customer Support",
    language: "Marathi",
    headerType: "none",
    body: "नमस्कार {{1}}! सध्या आमची टीम ऑफलाइन आहे. तुमचा संदेश आम्ही उद्या सकाळी {{2}} वाजता उत्तर देऊ. धन्यवाद!",
    buttons: [],
    status: "draft",
    updatedAt: "30 min ago",
  },
];

const academyBodies: Record<string,string[]> = {
 Welcome: ['Hi {{1}}, welcome to Bright Minds Academy! Which course would you like to explore?','नमस्ते {{1}}! ब्राइट माइंड्स अकादमी में आपका स्वागत है। आप कौन सा कोर्स सीखना चाहते हैं?','नमस्कार {{1}}! ब्राइट माइंड्स अकादमीमध्ये आपले स्वागत आहे. कोणता अभ्यासक्रम जाणून घ्यायचा आहे?'],
 Marketing: ['Hi {{1}}, November admissions are open at Bright Minds Academy. Explore Digital Marketing, Web Development and Data Analytics.','नमस्ते {{1}}! नवंबर बैच के लिए प्रवेश शुरू हैं। अपने पसंदीदा पाठ्यक्रम की जानकारी के लिए उत्तर दें।','नमस्कार {{1}}! नोव्हेंबर बॅचसाठी प्रवेश सुरू आहेत. अभ्यासक्रमाच्या माहितीसाठी उत्तर द्या.'],
 'Order Updates': ['Hi {{1}}, your course registration #{{2}} is confirmed. Our admissions team will share the next steps.','नमस्ते {{1}}, आपका कोर्स पंजीकरण #{{2}} पूरा हुआ है। आगे की जानकारी जल्द भेजेंगे।','नमस्कार {{1}}, तुमची अभ्यासक्रम नोंदणी #{{2}} पूर्ण झाली आहे. पुढील माहिती लवकरच पाठवू.'],
 Payments: ['Hi {{1}}, this is a reminder about your course payment. Contact our admissions team for your confirmed fee details.','नमस्ते {{1}}, कोर्स भुगतान के बारे में एक सूचना। सही फीस की जानकारी के लिए हमारी टीम से संपर्क करें।','नमस्कार {{1}}, अभ्यासक्रम शुल्काबाबत सूचना. अधिक माहितीसाठी आमच्या टीमशी संपर्क करा.'],
 Appointments: ['Hi {{1}}, your counselling appointment is on {{2}} at {{3}}. Reply to confirm or reschedule.','नमस्ते {{1}}, आपकी काउंसलिंग {{2}} को {{3}} बजे है। पुष्टि या समय बदलने के लिए उत्तर दें।','नमस्कार {{1}}, तुमची समुपदेशन भेट {{2}} रोजी {{3}} वाजता आहे. पुष्टीसाठी उत्तर द्या.'],
 'Customer Support': ['Hi {{1}}, thanks for contacting student support. Your enquiry #{{2}} is with our team.','नमस्ते {{1}}, छात्र सहायता से संपर्क करने के लिए धन्यवाद। हमारी टीम जल्द उत्तर देगी।','नमस्कार {{1}}, विद्यार्थी सहाय्याशी संपर्क केल्याबद्दल धन्यवाद. आमची टीम लवकरच उत्तर देईल.'],
 Feedback: ['Hi {{1}}, how was your counselling experience at Bright Minds Academy? Your feedback helps us improve.','नमस्ते {{1}}, ब्राइट माइंड्स अकादमी में आपका अनुभव कैसा रहा? आपकी राय हमारे लिए महत्वपूर्ण है।','नमस्कार {{1}}, ब्राइट माइंड्स अकादमीमधील तुमचा अनुभव कसा होता? तुमचा अभिप्राय महत्त्वाचा आहे.'],
 'Re-engagement': ['Hi {{1}}, still thinking about your next course? Our counsellors are here to help you choose.','नमस्ते {{1}}, क्या आप अभी भी कोर्स चुन रहे हैं? हमारी टीम मार्गदर्शन के लिए तैयार है।','नमस्कार {{1}}, अजून अभ्यासक्रम निवडत आहात का? आमची टीम मार्गदर्शनासाठी तयार आहे.'],
};
export const sampleTemplates: WaTemplate[] = templateCategories.flatMap((category,ci)=>templateLanguages.map((language,li)=>{
 const original=originalTemplates.find(t=>t.category===category);
 return {...original,id:li===0?(original?.id??`tpl-${ci}-0`):`tpl-${ci}-${li}`,name:category.toLowerCase().replaceAll(' ','_').replaceAll('-','_')+'_'+['en','hi','mr'][li],category,language,headerType:ci===1?'image':'none',body:academyBodies[category]?.[li]??'',footer:ci===1?'Reply STOP to opt out':'Bright Minds Academy',buttons:ci===4?[{type:'quick_reply',label:'Confirm'},{type:'quick_reply',label:'Reschedule'}]:[],status:li===0?'approved':ci%4===0?'draft':ci%4===1?'pending':ci%4===2?'rejected':'approved',updatedAt:'Nov 4, 2026'};
}));
export const MAX_TEMPLATE_BUTTONS=3;
export function fillPreviewVariables(text: string) {
  const samples = ["Priya", "Bright Minds Academy", "10:00 AM", "Saturday", "BMA-1042", "Course details", "Admissions team", "12 Nov"];
  let i = 0;
  return text.replace(/\{\{(?:\d+|customer_name|order_id)\}\}/g, () => samples[i++ % samples.length] ?? "");
}
