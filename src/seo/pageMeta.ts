export interface PageMetaEntry { path:string; title:string; description:string; robots?:string; sitemapPriority?:string; sitemapChangefreq?:string; }
const noindex='noindex, follow';
export const PAGE_META: Record<string,PageMetaEntry> = {
 '/':{path:'/',title:'DocBit — Data Preparation Tool for Excel, CSV & JSON',description:'Prepare Excel, CSV and JSON data with DocBit.',sitemapPriority:'1.0',sitemapChangefreq:'weekly'},
 '/report':{path:'/report',title:'Generate Report — DocBit',description:'Configure and generate a professional PDF report from prepared data.',robots:noindex},
  '/workspace':{path:'/workspace',title:'Workspace — DocBit',description:'Open, analyze and edit Excel, CSV and JSON files.',robots:noindex},
 '/history':{path:'/history',title:'History — DocBit',description:'Review recently opened DocBit files.',robots:noindex},
 '/auth/login':{path:'/auth/login',title:'Log in — DocBit',description:'Log in to DocBit.',robots:noindex},
 '/auth/signup':{path:'/auth/signup',title:'Create your DocBit account',description:'Create a DocBit account.',robots:noindex},
 '/password/reset':{path:'/password/reset',title:'Reset your password — DocBit',description:'Reset your DocBit password.',robots:noindex},
 '/about':{path:'/about',title:'About DocBit',description:'Learn about DocBit.',sitemapPriority:'0.5',sitemapChangefreq:'monthly'},
 '/terms':{path:'/terms',title:'Terms & Conditions — DocBit',description:'DocBit terms and conditions.',sitemapPriority:'0.2',sitemapChangefreq:'yearly'},
 '/privacy':{path:'/privacy',title:'Privacy — DocBit',description:'How DocBit handles authentication and uploaded files.',sitemapPriority:'0.3',sitemapChangefreq:'yearly'},
 '/documentation':{path:'/documentation',title:'Documentation — DocBit',description:'Learn how to use DocBit.',sitemapPriority:'0.7',sitemapChangefreq:'monthly'},
 '/support':{path:'/support',title:'Support — DocBit',description:'DocBit support and troubleshooting.',sitemapPriority:'0.4',sitemapChangefreq:'monthly'},
 '/analyzing':{path:'/analyzing',title:'Analyzing — DocBit',description:'Analyze an uploaded dataset before editing.',robots:noindex},
 '/editing':{path:'/editing',title:'Editing — DocBit',description:'Edit and export a prepared dataset.',robots:noindex}
};
export const NOT_FOUND_META={title:'Page Not Found | DocBit',description:'This page does not exist on DocBit.',robots:'noindex, follow'};
