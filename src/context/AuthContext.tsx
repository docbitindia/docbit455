import React,{createContext,useCallback,useContext,useEffect,useMemo,useState} from 'react';
import type { AuthProfile as CloudUser } from '../services/authProfile';
import { supabase,toAuthSession,type AuthSession } from '../lib/supabase/client';
import { getProfile,updateProfileData } from '../services/authProfile';
import { env,supabaseConfigured } from '../config/env';

interface AuthContextValue { session:AuthSession|null; user:CloudUser|null; loading:boolean; configured:boolean; signIn:(email:string,password:string)=>Promise<void>; signUp:(name:string,email:string,password:string)=>Promise<void>; signInWithGoogle:()=>Promise<void>; resetPassword:(email:string)=>Promise<void>; updateName:(name:string)=>Promise<void>; updatePhoto:(url:string)=>Promise<void>; changePassword:(current:string,next:string)=>Promise<void>; setNewPassword:(next:string)=>Promise<void>; signOut:()=>Promise<void>; pendingProfileSetup:boolean; completeProfileSetup:(name:string)=>Promise<void>; deactivatedAccount:boolean; recoverAccount:(changePassword:boolean)=>Promise<void>; }
const AuthContext=createContext<AuthContextValue|null>(null);
function profileFallback(session:AuthSession,stored?:any):CloudUser{return {uid:session.localId,email:stored?.email||session.email,displayName:stored?.display_name??stored?.displayName??session.displayName??session.email.split('@')[0],photoURL:stored?.photo_url??stored?.photoURL??session.photoURL,createdAt:stored?.created_at??stored?.createdAt??new Date().toISOString(),status:stored?.status||'active',onboardingComplete:stored?.onboarding_complete??stored?.onboardingComplete};}
export function AuthProvider({children}:{children:React.ReactNode}){
 const [session,setSession]=useState<AuthSession|null>(null); const [user,setUser]=useState<CloudUser|null>(null); const [loading,setLoading]=useState(true); const [pendingProfileSetup,setPendingProfileSetup]=useState(false); const [deactivatedAccount,setDeactivatedAccount]=useState(false);
 const hydrate=useCallback(async(s:any)=>{
  const next=toAuthSession(s);
  setSession(next);
  if(!next){setUser(null);setPendingProfileSetup(false);setDeactivatedAccount(false);return;}
  try {
    const p=await getProfile(next);
    const profile=profileFallback(next,p);
    setUser(profile);
    if(profile.status==='deactivated'){setDeactivatedAccount(true);setPendingProfileSetup(false);return;}
    setDeactivatedAccount(false);
    setPendingProfileSetup(!p?.displayName || p?.onboardingComplete===false);
  } catch {
    // Keep the authenticated session even if the profile request temporarily fails.
    setUser(profileFallback(next));
  }
},[]);
 useEffect(()=>{let alive=true;(async()=>{try{const {data}=await supabase.auth.getSession();if(alive){await hydrate(data.session);}}finally{if(alive)setLoading(false);}})();const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,s)=>{void hydrate(s);});return()=>{alive=false;subscription.unsubscribe()};},[hydrate]);
 const signIn=useCallback(async(email:string,password:string)=>{const {data,error}=await supabase.auth.signInWithPassword({email:email.trim(),password});if(error)throw new Error(error.message);await hydrate(data.session);},[hydrate]);
 const signUp=useCallback(async(name:string,email:string,password:string)=>{const {data,error}=await supabase.auth.signUp({email:email.trim(),password,options:{data:{full_name:name.trim()}}});if(error)throw new Error(error.message);if(!data.session){throw new Error('Check your email to confirm your DocBit account before signing in.');}await hydrate(data.session);setUser(u=>u?{...u,displayName:name.trim(),onboardingComplete:true}:u);setPendingProfileSetup(false);},[hydrate]);
 const signInWithGoogle=useCallback(async()=>{const {error}=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:`${env.siteUrl}/auth/signup`}});if(error)throw new Error(error.message);},[]);
 const resetPassword=useCallback(async(email:string)=>{const {error}=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo:`${env.siteUrl}/password/reset`});if(error)throw new Error(error.message);},[]);
 const updateName=useCallback(async(name:string)=>{if(!session)throw new Error('You are not signed in.');const {error}=await supabase.auth.updateUser({data:{full_name:name.trim(),name:name.trim()}});if(error)throw new Error(error.message);const p=await updateProfileData(session,{displayName:name.trim()});setUser(profileFallback(session,p));},[session]);
 const updatePhoto=useCallback(async(url:string)=>{if(!session)throw new Error('You are not signed in.');const p=await updateProfileData(session,{photoURL:url});setUser(profileFallback(session,p));},[session]);
 const changePassword=useCallback(async(current:string,next:string)=>{if(!session)throw new Error('You are not signed in.');const {error:re}=await supabase.auth.signInWithPassword({email:session.email,password:current});if(re)throw new Error('Current password is incorrect.');const {error}=await supabase.auth.updateUser({password:next});if(error)throw new Error(error.message);},[session]);
 const setNewPassword=useCallback(async(next:string)=>{const {error}=await supabase.auth.updateUser({password:next});if(error)throw new Error(error.message);},[]);
 const signOut=useCallback(async()=>{await supabase.auth.signOut();setSession(null);setUser(null);},[]);
 const completeProfileSetup=useCallback(async(name:string)=>{if(!session)throw new Error('Session expired.');await updateName(name);const { error } = await supabase.from('profiles').update({onboarding_complete:true}).eq('id',session.localId); if(error) throw new Error(error.message);setPendingProfileSetup(false);},[session,updateName]);
 const recoverAccount=useCallback(async(change:boolean)=>{if(!session||!user)throw new Error('Account information is unavailable.');const response=await fetch('/.netlify/functions/account-actions',{method:'POST',headers:{Authorization:`Bearer ${session.idToken}`,'Content-Type':'application/json'},body:JSON.stringify({action:'recover'})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data?.error||'Could not recover the account.');setDeactivatedAccount(false);setUser(u=>u?{...u,status:'active'}:u);if(change)await supabase.auth.resetPasswordForEmail(user.email,{redirectTo:`${env.siteUrl}/password/reset`});},[session,user]);
 const value=useMemo(()=>({session,user,loading,configured:supabaseConfigured,signIn,signUp,signInWithGoogle,resetPassword,updateName,updatePhoto,changePassword,setNewPassword,signOut,pendingProfileSetup,completeProfileSetup,deactivatedAccount,recoverAccount}),[session,user,loading,signIn,signUp,signInWithGoogle,resetPassword,updateName,updatePhoto,changePassword,setNewPassword,signOut,pendingProfileSetup,completeProfileSetup,deactivatedAccount,recoverAccount]);
 return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth(){const c=useContext(AuthContext);if(!c)throw new Error('useAuth must be used inside AuthProvider');return c;}
