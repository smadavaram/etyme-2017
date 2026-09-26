/* Dashboards for the four positions in a supply chain, one per product area.
   Level 1 is the client, level 2 the prime supplier, level 3 a subcontractor, level 4 the employer.
   Each screen shows what that company sees and names what it does not. */
(function(){
  var P={
    home:'<path d="M4 11l8-7 8 7"/><path d="M6 10v10h5v-6h2v6h5V10"/>',
    req:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6"/>',
    sub:'<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.3 2.6-5 5.5-5s4.9 1.7 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.4c2.5.2 4.2 1.7 4.8 4.6"/>',
    con:'<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 13l2 2 4-4"/>',
    ts:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    inv:'<path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    comp:'<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
    chain:'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    gov:'<path d="M12 4v16M5 20h14M12 6l-6 2 6-2 6 2"/><path d="M3.5 13.5L6 8l2.5 5.5a2.5 2.5 0 0 1-5 0zM15.5 13.5L18 8l2.5 5.5a2.5 2.5 0 0 1-5 0z"/>',
    set:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    search:'<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    bell:'<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    building:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h3M13 7h3M8 11h3M13 11h3M8 15h3M13 15h3M10 21v-3h4v3"/>',
    briefcase:'<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12h18"/>',
    factory:'<path d="M3 21V10l6 3V10l6 3V10l6 3v8z"/><path d="M7 21v-4M12 21v-4M17 21v-4"/>',
    idcard:'<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2.2"/><path d="M6 16c.4-1.6 1.6-2.5 3-2.5s2.6.9 3 2.5M14 10h4M14 13h4"/>',
    eyeoff:'<path d="M3 3l18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.1A9.8 9.8 0 0 1 12 5c6 0 9.5 7 9.5 7a15.6 15.6 0 0 1-3.2 4.1M6.6 6.6C4 8.4 2.5 12 2.5 12s3.5 7 9.5 7a9.6 9.6 0 0 0 4.4-1"/>'
  };
  function ic(n,s){ s=s||16; return '<svg class="ic" width="'+s+'" height="'+s+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+P[n]+'</svg>'; }
  var LEVELS=[
    {id:'client',   n:1, who:'Client',          org:'Northbend Athletic',  role:'Program office',      ini:'NA', icon:'building'},
    {id:'prime',    n:2, who:'Prime supplier',   org:'Brightmoor Staffing', role:'Sales and delivery',  ini:'BS', icon:'briefcase'},
    {id:'sub',      n:3, who:'Subcontractor',    org:'Keystone Talent',     role:'Delivery',            ini:'KT', icon:'factory'},
    {id:'employer', n:4, who:'Employer',         org:'Southline Employment',role:'Payroll and HR',      ini:'SE', icon:'idcard'}
  ];
  var NAV=[['home','Home','index.html'],['requisitions','Requisitions','requisitions.html'],['submissions','Submissions','submissions.html'],['contracts','Contracts','contracts.html'],['timesheets','Timesheets','timesheets.html'],['invoices','Invoices','invoices.html'],['compliance','Compliance','compliance.html'],['chain','Supply chain','chain.html'],['governance','Governance','governance.html']];
  var NI={home:'home',requisitions:'req',submissions:'sub',contracts:'con',timesheets:'ts',invoices:'inv',compliance:'comp',chain:'chain',governance:'gov'};
  var TITLE={requisitions:'Requisitions',submissions:'Submissions',contracts:'Contracts',timesheets:'Timesheets',invoices:'Invoices',compliance:'Compliance',chain:'Supply chain',governance:'Governance'};

  /* cell syntax: "ok:Text" / "warn:Text" / "bad:Text" / "off:Text" chips; "#123" mono number; "@RA:Name" person with initials */
  var D={
  requisitions:{
    client:{sub:'Every role your managers need, cleared by rule or waiting on a person.',
      tiles:[['Open','4','requisitions'],['Cleared by rule','3','opened the moment they were raised'],['Waiting on a person','1','rate above the going rate'],['Candidates in','11','from 3 suppliers']],
      cols:['Requirement','Status','Positions','Needed by','Max rate','Candidates'],
      rows:[['Senior data engineer','ok:Published','#2','Oct 14','#$118/h','#5'],['Warehouse lead, Reno','ok:Published','#1','Oct 1','#$41/h','#3'],['Solutions architect','warn:Waiting on approval','#1','Nov 3','#$165/h','—'],['QA analyst','off:Draft','#1','—','#$62/h','—']],
      hide:'Supplier rates below the prime. The client sees the rate it pays and nothing under it.',
      cap:'Three requisitions cleared by rule. The fourth asked $165 an hour against a going rate of $140, so a person has to approve it before it is released.'},
    prime:{sub:'Roles the client released to Brightmoor, each with your rate band.',
      tiles:[['Released to you','3','from Northbend Athletic'],['Submitted','4','candidates'],['Closing soon','1','in 2 days']],
      cols:['Requirement','Client','Your max rate','Submitted','Closes'],
      rows:[['Senior data engineer','Northbend Athletic','#$104/h','#2','Oct 14'],['Warehouse lead, Reno','Northbend Athletic','#$36/h','#1','Oct 1'],['Site reliability engineer','Northbend Athletic','#$98/h','#1','warn:Closes in 2 days'],['Solutions architect','Northbend Athletic','off:Not released','—','—']],
      hide:'Other suppliers’ rates and candidates, and any requisition the client did not release to you.',
      cap:'Brightmoor sees only the roles Procurement released to it, at its own band. The solutions architect role is still with a person at the client, so it shows as not released.'},
    sub:{sub:'Roles Brightmoor passed down to Keystone, at the rate Brightmoor pays you.',
      tiles:[['Passed to you','2','through Brightmoor Staffing'],['Submitted','1','candidate'],['Closes','5 days','earliest']],
      cols:['Requirement','From','Your max rate','Submitted','Closes'],
      rows:[['Senior data engineer','Brightmoor Staffing','#$92/h','#1','Oct 14'],['Warehouse lead, Reno','Brightmoor Staffing','#$31/h','#0','Oct 1']],
      hide:'The rate Brightmoor charges the client. The end client is named only if the prime chose to name it.',
      cap:'Keystone works one level down. It sees the role, the date and its own rate, and nothing about what the prime earns above it.'},
    employer:{sub:'Roles Keystone asked you to fill from the people you employ.',
      tiles:[['Asked to fill','1','role'],['People available','3','on your books'],['Placed this quarter','2','people']],
      cols:['Requirement','From','Your pay rate','Available','Needed by'],
      rows:[['Senior data engineer','Keystone Talent','#$84/h','@DR:D. Reyes','Oct 14'],['Senior data engineer','Keystone Talent','#$84/h','@LC:L. Chen','Oct 14']],
      hide:'Any rate above the one Keystone pays you, and every company above Keystone.',
      cap:'The employer sees the role and its own pay rate. Whether D. Reyes or L. Chen is put forward is its decision; the levels above only see the candidate.'}
  },
  submissions:{
    client:{sub:'Every supplier’s candidates for one role, on one screen, each at its own rate.',
      tiles:[['Candidates','11','across 3 suppliers'],['Checks passed','9 of 9','for 8 candidates'],['Duplicates stopped','1','same person, two suppliers'],['Interviews this week','2','']],
      cols:['Candidate','Supplier','Rate to you','Screening','Step'],
      rows:[['@RA:R. Adebayo','Brightmoor Staffing','#$112/h','ok:9 of 9 checks','Interview Oct 8'],['@MO:M. Okafor','Pinnacle Resourcing','#$118/h','ok:9 of 9 checks','Shortlisted'],['@SL:S. Lindqvist','Keystone Talent','#$109/h','warn:Right to work pending','On hold'],['@PR:P. Raghunathan','Brightmoor Staffing','—','bad:Duplicate of Pinnacle’s','Stopped']],
      hide:'What each supplier pays its people, and any company below a prime.',
      cap:'Four candidates for the senior data engineer role. The same person submitted by two suppliers is stopped the second time, so no manager has to spot it.'},
    prime:{sub:'Your candidates and where each one is in the client’s process.',
      tiles:[['Your candidates','4','on open roles'],['Interviewing','1','Oct 8'],['Stopped','1','with the reason']],
      cols:['Candidate','Requirement','Your rate','Screening','Step'],
      rows:[['@RA:R. Adebayo','Senior data engineer','#$104/h','ok:9 of 9 checks','Interview Oct 8'],['@JP:J. Park','Warehouse lead, Reno','#$34/h','warn:1 check open','Screening'],['@PR:P. Raghunathan','Senior data engineer','—','bad:Already submitted by another firm','Stopped']],
      hide:'Other suppliers’ candidates and rates, and the client’s maximum rate above your band.',
      cap:'Brightmoor sees its own people only. The stopped row says why, so the recruiter does not chase a candidate who is already in.'},
    sub:{sub:'Candidates you sent up through Brightmoor.',
      tiles:[['Submitted','1','through Brightmoor'],['Checks','8 of 9','one waiting'],['Waiting on','1','right-to-work document']],
      cols:['Candidate','Requirement','Your rate','Screening','Step'],
      rows:[['@SL:S. Lindqvist','Senior data engineer','#$92/h','warn:Right to work pending','On hold']],
      hide:'The client’s shortlist and every other company’s candidates.',
      cap:'Keystone can see that its candidate is on hold and exactly which document is missing. Nothing else about the role’s competition is shown.'},
    employer:{sub:'The people you employ who were put forward, and the papers each one needs.',
      tiles:[['Put forward','2','people'],['Papers complete','1',''],['Papers due','1','insurance certificate']],
      cols:['Person','Requirement','Through','Papers','Step'],
      rows:[['@DR:D. Reyes','Senior data engineer','Keystone Talent','ok:Complete','Submitted'],['@LC:L. Chen','Warehouse lead, Reno','Keystone Talent','warn:Insurance certificate due','Held until received']],
      hide:'Rates above your pay rate, and the client’s other candidates.',
      cap:'The employer owns the paperwork. L. Chen cannot move forward until the certificate arrives, and the screen says so before anyone above asks.'}
  },
  contracts:{
    client:{sub:'Every active contract, the order behind it, and how much of the order is used.',
      tiles:[['Active contracts','12',''],['Starting this month','2',''],['Order value used','61%','across all orders'],['Onboarding checks open','1','']],
      cols:['Person','Supplier','Contract','Order','Start'],
      rows:[['@RA:R. Adebayo','Brightmoor Staffing','ok:Signed','#$120,000 · 38% used','Oct 15'],['@MO:M. Okafor','Pinnacle Resourcing','ok:Signed','#$96,000 · 12% used','Oct 20'],['@SL:S. Lindqvist','Keystone Talent','warn:Waiting on work authorization','#$88,000 · 0% used','Nov 1'],['@DR:D. Reyes','Brightmoor Staffing','ok:Active','#$210,000 · 71% used','Mar 3']],
      hide:'Contracts between companies below the prime.',
      cap:'The award wrote each contract. One start is held because the work authorization has not been checked yet; the order exists but nothing can be billed against it.'},
    prime:{sub:'Your contracts with the client and with the companies you buy from.',
      tiles:[['With the client','6','contracts'],['With subcontractors','3',''],['Onboarding open','2','checks']],
      cols:['Person','Counterparty','Contract','Rates','Start'],
      rows:[['@RA:R. Adebayo','Northbend Athletic','ok:Signed','#$104/h to you','Oct 15'],['@DR:D. Reyes','Northbend Athletic → Keystone Talent','ok:Active','#$112/h in · $98/h out','Mar 3'],['@SL:S. Lindqvist','Northbend Athletic → Keystone Talent','warn:Work authorization pending','#$109/h in · $92/h out','Nov 1']],
      hide:'The client’s order value and budget, and the employer below your subcontractor.',
      cap:'Brightmoor sees both sides of its own contracts: what the client pays it and what it pays Keystone. It does not see Keystone’s side with the employer.'},
    sub:{sub:'Your contracts with Brightmoor and with the employer you buy from.',
      tiles:[['With the prime','2','contracts'],['With employers','1',''],['Onboarding open','1','']],
      cols:['Person','Counterparty','Contract','Rates','Start'],
      rows:[['@DR:D. Reyes','Brightmoor Staffing → Southline Employment','ok:Active','#$98/h in · $88/h out','Mar 3'],['@SL:S. Lindqvist','Brightmoor Staffing','warn:Work authorization pending','#$92/h in','Nov 1']],
      hide:'The client contract, and the rate Brightmoor charges the client.',
      cap:'One level down, the same contract shows only Keystone’s own two rates.'},
    employer:{sub:'Employment contracts, pay setup, and the papers each person must hold.',
      tiles:[['Employment contracts','2',''],['Pay setup complete','2',''],['Papers expiring','1','within 60 days']],
      cols:['Person','Employment','Contract','Pay rate','Papers'],
      rows:[['@DR:D. Reyes','Employee, W-2','ok:Active','#$84/h','ok:In date'],['@LC:L. Chen','Contractor, 1099','ok:Active','#$52/h','warn:Certificate expires Nov 30']],
      hide:'Anything above what Keystone pays you.',
      cap:'The employer records how each person is employed and what they are paid. The four ways to be employed are set here and travel up as a classification, never as a rate.'}
  },
  timesheets:{
    client:{sub:'Weeks filed by contractors, waiting on the manager who has to sign them.',
      tiles:[['Waiting on managers','3','weeks'],['Flagged','1','over 40 hours'],['Signed this week','22',''],['Refused','1','contract not active']],
      cols:['Person','Week','Hours','Flag','Status'],
      rows:[['@RA:R. Adebayo','Sep 22–28','#40.0','—','ok:Signed'],['@MO:M. Okafor','Sep 22–28','#44.5','warn:Over 40 hours','Waiting on manager'],['@DR:D. Reyes','Sep 22–28','#38.0','—','Waiting on manager'],['@SL:S. Lindqvist','Sep 22–28','#40.0','bad:Contract not yet active','Refused']],
      hide:'Rates below the prime. The client signs hours, not money.',
      cap:'Flags come before signatures. The manager sees the 44.5-hour week marked before signing it, and the week filed against a contract that has not started is refused, not parked.'},
    prime:{sub:'Signed weeks ready to invoice, and the ones still waiting on the client.',
      tiles:[['Ready to invoice','18','signed weeks'],['Waiting on client','3',''],['Refused','1','with the reason']],
      cols:['Person','Week','Hours','Client signature','Next'],
      rows:[['@RA:R. Adebayo','Sep 22–28','#40.0','ok:Signed','Invoice BS-2043'],['@DR:D. Reyes','Sep 22–28','#38.0','Waiting on manager','—'],['@SL:S. Lindqvist','Sep 22–28','#40.0','bad:Refused · contract not active','Fix the contract first']],
      hide:'The hours themselves cannot be edited here. The person files them once; every company above sees the same number.',
      cap:'Brightmoor can invoice only from weeks the client signed. The refused week tells it what to fix instead of letting an invoice go out and bounce.'},
    sub:{sub:'Weeks passing through Keystone on their way to the prime.',
      tiles:[['Passing through','4','weeks'],['Signed by client','3',''],['Waiting','1','']],
      cols:['Person','Week','Hours','Client signature','Sent up to'],
      rows:[['@DR:D. Reyes','Sep 22–28','#38.0','Waiting on manager','Brightmoor Staffing'],['@DR:D. Reyes','Sep 15–21','#40.0','ok:Signed','Brightmoor Staffing']],
      hide:'The client’s manager, and any reason given at the client.',
      cap:'Keystone never re-keys hours. One row travels the whole chain, and Keystone sees the same 38.0 the client will sign.'},
    employer:{sub:'Signed weeks and expenses ready for payroll.',
      tiles:[['Weeks for payroll','2',''],['Hours','78.0','this pay period'],['Expenses','$146.20','receipt attached']],
      cols:['Person','Week','Hours','Expenses','Status'],
      rows:[['@DR:D. Reyes','Sep 22–28','#38.0','#$146.20 · receipt','Waiting on client'],['@LC:L. Chen','Sep 22–28','#40.0','—','ok:Signed → payroll']],
      hide:'The client’s rate and the prime’s rate. You see hours and your own pay rate.',
      cap:'Payroll runs from signed hours and the employer’s pay rate. The expense receipt is attached to the week, so it is approved once, by the client, and paid by the employer.'}
  },
  invoices:{
    client:{sub:'Supplier invoices checked against the signed week and the order before anything is paid.',
      tiles:[['Invoices this month','9',''],['Matched and paid','6',''],['Held','2','for Procurement'],['Refused','1','no signed week']],
      cols:['Invoice','Supplier','Amount','Three-way match','Status'],
      rows:[['#BS-2041','Brightmoor Staffing','#$17,920.00','ok:Week, order and invoice agree','Paid Sep 30'],['#PR-0778','Pinnacle Resourcing','#$9,440.00','warn:Over the order by $1,200','Held · Procurement'],['#KT-0312','Keystone Talent','#$8,720.00','bad:No signed week behind it','Refused'],['#BS-2042','Brightmoor Staffing','#$4,256.00','ok:Agree','Due Oct 14']],
      hide:'Bills between companies below the prime.',
      cap:'Three documents have to agree: the signed week, the order line, and the invoice. Two of the four do not, and each held row names the team that owns the next step.'},
    prime:{sub:'What you invoiced the client, and the bills coming up from your subcontractors.',
      tiles:[['Invoiced to client','$22,176','this month'],['Paid','$17,920',''],['Bills from subcontractors','2','matched']],
      cols:['Invoice','Direction','Amount','Match','Status'],
      rows:[['#BS-2041','To Northbend Athletic','#$17,920.00','ok:Agree','Paid Sep 30'],['#BS-2042','To Northbend Athletic','#$4,256.00','ok:Agree','Due Oct 14'],['#KT-IN-88','From Keystone Talent','#$3,724.00','ok:Matched to signed week','Pay Oct 10']],
      hide:'Invoices from the client’s other suppliers.',
      cap:'The same signed week produces both directions: Brightmoor’s invoice up to the client and Keystone’s invoice up to Brightmoor. Neither can be issued without it.'},
    sub:{sub:'What you invoiced Brightmoor, and the employer’s bill to you.',
      tiles:[['Invoiced to prime','$3,724','this month'],['Matched','1',''],['Bills from employer','1','']],
      cols:['Invoice','Direction','Amount','Match','Status'],
      rows:[['#KT-IN-88','To Brightmoor Staffing','#$3,724.00','ok:Matched to signed week','Due Oct 10'],['#SE-IN-19','From Southline Employment','#$3,344.00','ok:Matched','Due Oct 12']],
      hide:'What Brightmoor bills the client.',
      cap:'Keystone’s margin is the difference between two matched invoices. Nobody above or below sees both.'},
    employer:{sub:'Your invoice to Keystone and the payroll run behind it.',
      tiles:[['Invoiced to Keystone','$3,344','this month'],['Payroll run','Oct 4',''],['Net to D. Reyes','$2,486.40','38.0 h']],
      cols:['Document','Detail','Amount','Behind it','Status'],
      rows:[['#SE-IN-19','To Keystone Talent','#$3,344.00','ok:Signed week','Due Oct 12'],['Payroll Oct 4','D. Reyes · 38.0 h × $84','#$3,192.00 gross','ok:Signed week','Submitted to payroll']],
      hide:'Every rate and invoice above yours.',
      cap:'An employee is paid through payroll from the signed week. They never see the rate a company above them charges.'}
  },
  compliance:{
    client:{sub:'Tenure counted per person across every supplier, and the papers behind each start.',
      tiles:[['Near the tenure cap','2','people at 75% or more'],['Blocked at cap','1',''],['Papers expiring','3','within 30 days'],['Right to work verified','14 of 15','']],
      cols:['Person','Supplier','Tenure','Papers','Status'],
      rows:[['@DR:D. Reyes','Brightmoor Staffing','#412 of 540 days · 76%','ok:Complete','warn:Notice sent at 75%'],['@RA:R. Adebayo','Brightmoor Staffing','#12 of 540 days','ok:Complete','ok:Clear'],['@MO:M. Okafor','Pinnacle Resourcing','#538 of 540 days','ok:Complete','bad:Blocked · no new contract'],['@SL:S. Lindqvist','Keystone Talent','#0 days','warn:Right to work pending','Not started']],
      hide:'The names of companies below the prime. You see that papers exist and are in date, not who holds them.',
      cap:'Tenure follows the person, not the supplier. M. Okafor reached the cap through two suppliers and is blocked from a new contract; the warning went out at three quarters.'},
    prime:{sub:'Your people’s papers and tenure, and what is due next.',
      tiles:[['Your people','6','on site'],['Papers due','2','within 30 days'],['Tenure notices','1','']],
      cols:['Person','Tenure','Papers','Due','Status'],
      rows:[['@DR:D. Reyes','#412 of 540 days','ok:Complete','—','warn:Notice sent at 75%'],['@RA:R. Adebayo','#12 of 540 days','ok:Complete','Visa notice 90 days','ok:Clear'],['@JP:J. Park','#0 days','warn:Insurance certificate','Sep 30','Held']],
      hide:'The client’s tenure policy as it applies to other suppliers’ people.',
      cap:'Brightmoor gets the same tenure count the client sees, so nobody is surprised at the cap. Visa notices go out at 90, 60 and 30 days.'},
    sub:{sub:'Papers for the people you supply, and your own certificate.',
      tiles:[['Your people','2',''],['Your insurance certificate','62 days','until expiry'],['Papers due','1','']],
      cols:['Person','Papers','Due','Status'],
      rows:[['@DR:D. Reyes','ok:Complete','—','ok:Clear'],['@SL:S. Lindqvist','warn:Right to work pending','Before Nov 1','Held'],['Keystone Talent','Certificate of insurance','Nov 27','warn:Renew within 62 days']],
      hide:'The client’s policy set and other suppliers’ people.',
      cap:'The subcontractor’s own certificate is tracked next to its people’s papers, because both can stop a start.'},
    employer:{sub:'Work authorization and insurance for the people you employ.',
      tiles:[['Employees placed','2',''],['Authorization renewals','1','next 12 months'],['Insurance','In date','company certificate']],
      cols:['Person','Employment','Work authorization','Insurance','Status'],
      rows:[['@DR:D. Reyes','Employee, W-2','ok:Verified · renews Mar 2027','ok:In date','ok:Clear'],['@LC:L. Chen','Contractor, 1099','ok:Verified','warn:Certificate expires Nov 30','Renew']],
      hide:'The client’s tenure count and every rate above yours.',
      cap:'The employer holds the papers. What travels up the chain is a status — verified, in date — never the document itself.'}
  },
  chain:{
    client:{sub:'Every person on site, the prime that sent them, how many companies sit below, and the rate you pay.',
      tiles:[['People on site','14',''],['Companies between you and a person','up to 3',''],['Insurance in date at every level','14 of 14',''],['Rate you pay, all in','$1.42M','this year']],
      cols:['Person','Prime supplier','Companies below the prime','Rate to you','Insurance'],
      rows:[['@DR:D. Reyes','Brightmoor Staffing','#2 · names not shown','#$112/h','ok:In date at every level'],['@RA:R. Adebayo','Brightmoor Staffing','#0','#$112/h','ok:In date'],['@MO:M. Okafor','Pinnacle Resourcing','#1 · name not shown','#$118/h','warn:One certificate expires in 30 days'],['@SL:S. Lindqvist','Keystone Talent','#0','#$109/h','ok:In date']],
      hide:'Names and rates below the prime. The client sees how many companies there are and that each is insured.',
      cap:'D. Reyes reaches Northbend Athletic through three companies. The client sees the count and the insurance status at every level, and only the rate it pays.'},
    prime:{sub:'Who you buy each person from and who you sell them to.',
      tiles:[['You buy from','2','companies'],['You sell to','1','client'],['Levels below you','up to 2','']],
      cols:['Person','You buy from','You sell to','Insurance'],
      rows:[['@DR:D. Reyes','Keystone Talent · #$98/h','Northbend Athletic · #$112/h','ok:In date'],['@RA:R. Adebayo','Your own employee','Northbend Athletic · #$112/h','ok:In date'],['@SL:S. Lindqvist','Keystone Talent · #$92/h','Northbend Athletic · #$109/h','ok:In date']],
      hide:'The employer below Keystone, and what Keystone pays it.',
      cap:'Each company sees exactly one level up and one level down. Brightmoor knows it buys D. Reyes from Keystone; it does not know who employs him.'},
    sub:{sub:'Your one level up and one level down.',
      tiles:[['You buy from','1','employer'],['You sell to','1','prime'],['People through you','2','']],
      cols:['Person','You buy from','You sell to','Insurance'],
      rows:[['@DR:D. Reyes','Southline Employment · #$88/h','Brightmoor Staffing · #$98/h','ok:In date'],['@SL:S. Lindqvist','Your own contractor','Brightmoor Staffing · #$92/h','ok:In date']],
      hide:'The client, and the rate Brightmoor charges it.',
      cap:'Keystone’s screen has the same shape as Brightmoor’s, one level lower. Nothing about the client is visible unless the prime chose to name it.'},
    employer:{sub:'The people you employ and the one company you sell their time to.',
      tiles:[['People placed','2',''],['You sell to','1','company'],['Your certificate','In date','']],
      cols:['Person','You pay','You sell to','Insurance'],
      rows:[['@DR:D. Reyes','#$84/h','Keystone Talent · #$88/h','ok:In date'],['@LC:L. Chen','#$52/h','Keystone Talent · #$58/h','warn:Certificate expires Nov 30']],
      hide:'Everything above Keystone.',
      cap:'The bottom of the chain sees its own pay rates and its one customer. The person being placed sees only what they are paid.'}
  },
  governance:{
    client:{sub:'Every rule in force, and every time one blocked, warned or passed.',
      tiles:[['Rules in force','23',''],['Blocked this month','4',''],['Warned','17','then went to a person'],['Automatic actions logged','212','']],
      cols:['Rule','Kind','Applied to','Result','When'],
      rows:[['Nobody signs their own week','Block · law','R. Adebayo, week of Sep 22','bad:Blocked','Sep 29'],['Invoice within the order','Block · policy','PR-0778, Pinnacle Resourcing','bad:Held for Procurement','Sep 27'],['Rate within the going rate','Warn','Solutions architect, $165/h','warn:Went to a person','Sep 25'],['Tenure at 75%','Warn','D. Reyes','warn:Notice sent','Sep 20'],['One submission per person','Block · policy','P. Raghunathan','bad:Stopped','Sep 18']],
      hide:'Nothing. The client sees every rule and every result, including passes.',
      cap:'Where the law is behind a rule it blocks; everywhere else it warns and a person decides. Every result is a row, including the ones that passed.'},
    prime:{sub:'The rules that apply to you, and what they did this month.',
      tiles:[['Rules that apply to you','14',''],['Blocked','2',''],['Warned','3','']],
      cols:['Rule','Kind','Applied to','Result','When'],
      rows:[['Submit within your rate band','Block · policy','J. Park at $38/h, band $36/h','bad:Stopped','Sep 26'],['Invoice only signed weeks','Block · policy','S. Lindqvist, week of Sep 22','bad:Refused','Sep 29'],['Insurance certificate current','Warn','Keystone Talent, 62 days','warn:Notice sent','Sep 26']],
      hide:'Rules that apply only to the client’s own staff.',
      cap:'Brightmoor sees the rules it can break and the ones it broke, with the reason. The stopped submission names the band so the recruiter fixes the rate, not the candidate.'},
    sub:{sub:'The rules that reach one level down.',
      tiles:[['Rules that apply to you','9',''],['Blocked','0',''],['Warned','1','']],
      cols:['Rule','Kind','Applied to','Result','When'],
      rows:[['Hours pass through unchanged','Block · policy','D. Reyes, week of Sep 22','ok:Passed','Sep 29'],['Insurance certificate current','Warn','Keystone Talent','warn:Renew within 62 days','Sep 26'],['Work authorization before start','Block · law','S. Lindqvist','bad:Start held','Sep 24']],
      hide:'The client’s policy set and the prime’s rules.',
      cap:'A pass is recorded too. The unchanged-hours rule ran and passed, and the row proves it.'},
    employer:{sub:'The rules that reach the employer, and the payroll rule that cannot be turned off.',
      tiles:[['Rules that apply to you','7',''],['Blocked','1',''],['Passed','12','this month']],
      cols:['Rule','Kind','Applied to','Result','When'],
      rows:[['Work authorization before day one','Block · law','S. Lindqvist','bad:Start held','Sep 24'],['Payroll only from signed weeks','Block · policy','Payroll run Oct 4','ok:Passed','Oct 4'],['Insurance certificate current','Warn','L. Chen, 1099','warn:Expires Nov 30','Sep 30']],
      hide:'Every rule above the employer’s own.',
      cap:'The employer cannot run payroll on an unsigned week, and cannot start a person whose authorization is unverified. Both are blocks, and both are logged.'}
  }};

  function cell(v){
    if(v==null||v==='') return '<td></td>';
    var m=/^(ok|warn|bad|off):(.*)$/.exec(v);
    if(m){ var cls={ok:'chip--verified',warn:'chip--attention',bad:'chip--danger',off:'chip--passive'}[m[1]]; return '<td><span class="chip '+cls+'">'+esc(m[2])+'</span></td>'; }
    var p=/^@([A-Z]{2}):(.*)$/.exec(v);
    if(p) return '<td><span class="who"><span class="av av-s">'+p[1]+'</span>'+esc(p[2])+'</span></td>';
    /* "#" marks a number in the mono face; it may appear mid-cell too */
    return '<td>'+esc(v).replace(/#([^·<]+)/g,'<span class="num">$1</span>')+'</td>';
  }
  function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;'); }

  function render(box, area, lv){
    var L=LEVELS.filter(function(l){return l.id===lv;})[0], d=D[area][lv];
    var tabs='<div class="tabs dash-tabs" role="tablist">'+LEVELS.map(function(l){ return '<button role="tab" data-level="'+l.id+'" aria-selected="'+(l.id===lv)+'">'+ic(l.icon,15)+'Level '+l.n+' · '+l.who+'</button>'; }).join('')+'</div>';
    var side='<aside class="d-side"><div class="d-who"><span class="av">'+L.ini+'</span><div><b>'+esc(L.org)+'</b><span>'+esc(L.role)+'</span></div></div><p class="grp">Program</p>'+
      NAV.map(function(n){ return '<a class="d-nav" href="'+n[2]+'"'+(n[0]===area?' aria-current="page"':'')+'>'+ic(NI[n[0]],16)+esc(n[1])+'</a>'; }).join('')+
      '<p class="grp">Account</p><a class="d-nav" href="signin.html">'+ic('set',16)+'Settings</a></aside>';
    var bar='<div class="d-bar"><div class="d-search">'+ic('search',15)+'Search '+esc(L.org)+'</div><span class="d-ic" aria-label="Notifications">'+ic('bell',18)+'<i></i></span><span class="av">'+L.ini+'</span></div>';
    var head='<div class="dash-head"><h3>'+TITLE[area]+'</h3><p>'+esc(d.sub)+'</p></div>';
    var tiles='<div class="d-tiles'+(d.tiles.length===3?' three':'')+'">'+d.tiles.map(function(t){ return '<div class="d-tile"><div class="k">'+esc(t[0])+'</div><div class="v">'+esc(t[1])+'</div>'+(t[2]?'<div class="s">'+esc(t[2])+'</div>':'')+'</div>'; }).join('')+'</div>';
    var table='<div class="scrollx"><table class="tabular"><thead><tr>'+d.cols.map(function(c){return '<th>'+esc(c)+'</th>';}).join('')+'</tr></thead><tbody>'+d.rows.map(function(r){ return '<tr>'+r.map(cell).join('')+'</tr>'; }).join('')+'</tbody></table></div>';
    var note='<div class="callout">'+ic('eyeoff',18)+'<div><b>Not shown at this level</b><p>'+esc(d.hide)+'</p></div></div>';
    var cap='<p class="dash-cap"><b>Level '+L.n+' · '+L.who+', '+esc(L.org)+'</b>'+esc(d.cap)+'</p>';
    box.innerHTML=tabs+'<div class="d-shell dash-shell">'+side+'<div class="d-main">'+bar+head+tiles+table+note+'</div></div>'+cap;
    box.querySelectorAll('.dash-tabs button').forEach(function(b){ b.addEventListener('click',function(){ render(box, area, b.dataset.level); var sel=box.querySelector('.dash-tabs [aria-selected="true"]'); if(sel&&sel.scrollIntoView) sel.scrollIntoView({block:'nearest',inline:'center'}); }); });
  }
  document.querySelectorAll('.dash[data-area]').forEach(function(box){
    var area=box.dataset.area; if(!D[area]) return;
    render(box, area, box.dataset.level||'client');
  });
})();
