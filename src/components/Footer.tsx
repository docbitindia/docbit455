import React from 'react';
import { Logo } from './Logo';
import { navigate } from '../router/useRoute';

const groups = [
  ['Product', [['Workspace','/workspace'],['History','/history'],['Documentation','/documentation']]],
  ['Resources', [['Documentation','/documentation'],['Support','/support']]],
  ['Company', [['About','/about']]],
  ['Legal', [['Privacy','/privacy'],['Terms','/terms']]]
];

export function Footer({ mobileNavReserve = false }: { mobileNavReserve?: boolean }) {
  return <footer className={`border-t border-slate-200 bg-slate-50 ${mobileNavReserve ? 'pb-24 md:pb-0' : ''}`}>
    <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 lg:py-16">
      <div className="grid gap-10 lg:grid-cols-[1.5fr_repeat(4,1fr)]">
        <div><Logo/><p className="mt-4 max-w-xs text-sm leading-6 text-slate-500">Prepare, edit and export Excel, CSV and JSON data without losing control of the original source.</p></div>
        {groups.map(([title, links]) => <div key={title as string}><h3 className="text-sm font-semibold text-slate-900">{title}</h3><div className="mt-4 grid gap-3">{(links as string[][]).map(([label, href]) => <button key={label} onClick={() => navigate(href)} className="w-fit text-left text-sm text-slate-500 hover:text-slate-950">{label}</button>)}</div></div>)}
      </div>
      <div className="mt-12 flex flex-col gap-3 border-t border-slate-200 pt-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between"><span>© {new Date().getFullYear()} DocBit. All rights reserved.</span><div className="flex gap-5"><button onClick={() => navigate('/privacy')}>Privacy</button><button onClick={() => navigate('/terms')}>Terms</button></div></div>
    </div>
  </footer>;
}
