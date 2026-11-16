import {describe,it,expect} from 'vitest';
import {createSeed,restoreDemo,campaignLaunchStatus,canUseCampaignTemplate,simulateReply,defaultAgent} from '@/components/genie/demo-data';
import {sampleTemplates,MAX_TEMPLATE_BUTTONS,templateCategories,templateLanguages} from '@/components/whatsapp/templates-data';
import {parseCSV} from '@/lib/csv';
describe('Genie demo rules',()=>{
 it('provides at least 24 sample templates',()=>expect(sampleTemplates.length).toBeGreaterThanOrEqual(24));
 it('covers all eight categories and three requested languages',()=>{expect(templateCategories.length).toBe(8);expect(templateLanguages).toEqual(['English','Hindi','Marathi']);for(const category of templateCategories)for(const language of templateLanguages)expect(sampleTemplates.some(t=>t.category===category&&t.language===language)).toBe(true);});
 it('allows at most three template buttons',()=>{expect(MAX_TEMPLATE_BUTTONS).toBe(3);expect(sampleTemplates.every(t=>t.buttons.length<=3)).toBe(true);});
 it('does not allow local drafts in approved campaign selection',()=>{const base=sampleTemplates[0];if(!base)throw new Error('No templates');expect(canUseCampaignTemplate({...base,status:'draft'})).toBe(false);expect(canUseCampaignTemplate({...base,status:'approved'})).toBe(true);});
 it('preserves saved demo records on reload instead of reseeding',()=>{const seed=createSeed();seed.contacts[0]={...seed.contacts[0],id:'custom-contact',name:'Saved customer',phone:'demo',email:'',tags:[],source:'Manual',location:'Pune',status:'New',assigned:'Admin',notes:'',last:'Today'};expect(restoreDemo(JSON.stringify(seed)).contacts[0]?.name).toBe('Saved customer');});
 it('restores original academy workspace for reset seed',()=>{expect(createSeed().settings["workspace"]).toBe('Bright Minds Academy');expect(createSeed().agents[0]?.name).toBe('Genie Admissions Assistant');});
 it('uses fictional demo phone numbers',()=>{expect(createSeed().contacts.every(c=>c.phone.startsWith('+1 202 555 01')&&c.phone.endsWith('(demo)'))).toBe(true);});
 it('schedules a dated launch and runs an immediate launch locally',()=>{expect(campaignLaunchStatus('2026-11-08')).toBe('Scheduled');expect(campaignLaunchStatus('')).toBe('Running');});
 it('returns a simulated Hindi response',()=>expect(simulateReply('Admission',defaultAgent,'Hindi')).toContain('नमस्ते'));
 it('imports CSV containing escaped commas and quotes',()=>expect(parseCSV('name,phone\n"Sharma, Priya","demo"\n"Rahul ""R""",demo')).toEqual([['name','phone'],['Sharma, Priya','demo'],['Rahul "R"','demo']]));
});
