import {createContext,useContext,useEffect,useState,type ReactNode,type Dispatch,type SetStateAction} from 'react';
import {createSeed,restoreDemo,DEMO_STORAGE_KEY,type DemoState} from './demo-data';
const Context=createContext<{data:DemoState;setData:Dispatch<SetStateAction<DemoState>>;ready:boolean;reset:()=>void;complete:(step:string)=>void}|null>(null);
export function DemoProvider({children}:{children:ReactNode}) { const [data,setData]=useState(createSeed);const [ready,setReady]=useState(false);
 useEffect(()=>{try{setData(restoreDemo(localStorage.getItem(DEMO_STORAGE_KEY)));}catch{}setReady(true);},[]);
 useEffect(()=>{if(ready)try{localStorage.setItem(DEMO_STORAGE_KEY,JSON.stringify(data));}catch{}},[data,ready]);
 const complete=(step:string)=>setData(d=>({...d,checklist:d.checklist.includes(step)?d.checklist:[...d.checklist,step]}));
 return <Context.Provider value={{data,setData,ready,reset:()=>setData(createSeed()),complete}}>{children}</Context.Provider>;
}
export function useDemo(){const ctx=useContext(Context);if(!ctx)throw new Error('DemoProvider is required');return ctx;}
