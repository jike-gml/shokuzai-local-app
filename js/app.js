import { DB_VERSION, getAllIngredients, putIngredient, deleteIngredient as deleteIngredientDB, clearIngredients, getConfig, setConfig, getMeta } from './db.js';
import { mapSheetCSV, importSheetCSV } from './import.js';
import { downloadBackup, restoreBackupFile } from './backup.js';

const APP_VERSION = '1.0.0';
const DEFAULT_CATEGORIES = ['肉','魚','野菜','乾物','調味料','加工品','その他'];
const COLORS = {肉:'#e99191',魚:'#77addb',野菜:'#81c98a',乾物:'#d3ad74',調味料:'#ba91ce',加工品:'#efa369',その他:'#aab2b8'};
const state = {inventory:[],categories:[],stores:[],selectedCategory:'すべて',detailItem:null,editItem:null,pendingImport:null,registration:null};
const el = id => document.getElementById(id);
let toastTimer = null;

document.addEventListener('DOMContentLoaded', init, {once:true});

async function init(){
  bindEvents();
  el('versionLabel').textContent = `v${APP_VERSION}`;
  el('settingsAppVersion').textContent = APP_VERSION;
  el('settingsDbVersion').textContent = DB_VERSION;
  if(!history.state?.view) history.replaceState({view:'main'},'','#main');
  showView(history.state.view || 'main', false);
  await initializeConfig();
  await reloadInventory();
  await updateBackupLabel();
  registerServiceWorker();
}

function bindEvents(){
  el('submitBtn').onclick = addIngredient;
  el('openInventoryBtn').onclick = () => showView('inventory', true);
  el('backBtn').onclick = () => history.back();
  el('addStoreBtn').onclick = openStoreModal;
  el('cancelStoreBtn').onclick = closeStoreModal;
  el('saveStoreBtn').onclick = saveStore;
  el('storeInput').onkeydown = e => { if(e.key === 'Enter') saveStore(); };
  el('categoryFilters').onclick = handleCategoryFilterClick;
  el('inventoryList').onclick = handleInventoryClick;
  el('inventoryList').onchange = handleInventoryChange;
  el('closeDetailBtn').onclick = closeDetail;
  el('detailEditBtn').onclick = editDetailItem;
  el('cancelEditBtn').onclick = closeEdit;
  el('saveEditBtn').onclick = saveEdit;
  el('consultBtn').onclick = createConsult;
  el('copyConsultBtn').onclick = () => copyOutput('consultText', createConsult);
  el('shoppingListBtn').onclick = createShoppingList;
  el('copyShoppingBtn').onclick = () => copyOutput('shoppingText', createShoppingList);
  el('settingsBtn').onclick = openSettings;
  el('closeSettingsBtn').onclick = closeSettings;
  el('importCsvBtn').onclick = () => el('csvFileInput').click();
  el('csvFileInput').onchange = handleCSVFile;
  el('exportJsonBtn').onclick = exportBackup;
  el('restoreJsonBtn').onclick = () => el('jsonFileInput').click();
  el('jsonFileInput').onchange = handleJSONFile;
  el('cancelImportBtn').onclick = closeImportModal;
  el('confirmImportBtn').onclick = confirmImport;
  el('clearDataBtn').onclick = clearAllData;
  el('checkUpdateBtn').onclick = checkForUpdate;
  el('applyUpdateBtn').onclick = applyUpdate;
  ['detailModal','editModal','storeModal','settingsModal','importModal'].forEach(id => {
    el(id).onclick = e => { if(e.target === el(id)) el(id).classList.remove('show'); };
  });
  window.onpopstate = e => showView(e.state?.view || 'main', false);
}

async function initializeConfig(){
  state.categories = await getConfig('categories', null);
  state.stores = await getConfig('stores', null);
  if(!Array.isArray(state.categories) || !state.categories.length){
    state.categories = [...DEFAULT_CATEGORIES];
    await setConfig('categories', state.categories);
  }
  if(!Array.isArray(state.stores)){
    state.stores = [];
    await setConfig('stores', state.stores);
  }
  fillAllSelects();
  renderCategoryFilters();
}

async function reloadInventory(){
  state.inventory = await getAllIngredients();
  renderInventory();
  updateMainCount();
}

function showView(view,push){
  const inventoryMode = view === 'inventory';
  el('mainView').classList.toggle('active', !inventoryMode);
  el('inventoryView').classList.toggle('active', inventoryMode);
  if(push) history.pushState({view:inventoryMode?'inventory':'main'},'',inventoryMode?'#inventory':'#main');
  if(inventoryMode) renderInventory();
  scrollTo(0,0);
}

function fillAllSelects(){
  fillSelect(el('category'),state.categories,el('category').value,false);
  fillSelect(el('store'),state.stores,el('store').value,true);
  fillSelect(el('editCategory'),state.categories,'',false);
  fillSelect(el('editStore'),state.stores,'',true);
}

function fillSelect(select,values,selected,allowEmpty){
  const f=document.createDocumentFragment();
  if(allowEmpty) f.appendChild(new Option('未指定',''));
  values.forEach(v=>f.appendChild(new Option(v,v)));
  select.replaceChildren(f);
  if(selected && [...select.options].some(o=>o.value===selected)) select.value=selected;
}

function readForm(prefix=''){
  const id=s=>prefix?prefix+s[0].toUpperCase()+s.slice(1):s;
  return {
    name:el(id('name')).value.trim(),category:el(id('category')).value,
    amount:el(id('amount')).value.trim(),expiry:el(id('expiry')).value,
    store:el(id('store')).value,memo:el(id('memo')).value.trim()
  };
}

async function addIngredient(){
  const data=readForm();
  if(!data.name) return toast('品名を入力してください。');
  if(!data.category) return toast('カテゴリーを選択してください。');
  setButtonBusy('submitBtn',true,'登録中…');
  try{
    await putIngredient({id:crypto.randomUUID(),...data,status:'在庫あり',shopping:false,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
    ['name','amount','expiry','memo'].forEach(id=>el(id).value='');
    await reloadInventory();
    toast('登録しました。');
  }catch(e){showError(e);}finally{setButtonBusy('submitBtn',false,'入力');}
}

function openStoreModal(){el('storeInput').value='';el('storeModal').classList.add('show');setTimeout(()=>el('storeInput').focus(),100);}
function closeStoreModal(){el('storeModal').classList.remove('show');}

async function saveStore(){
  const value=el('storeInput').value.trim();
  if(!value) return toast('購入店名を入力してください。');
  if(!state.stores.includes(value)){
    state.stores.push(value);state.stores.sort((a,b)=>a.localeCompare(b,'ja'));
    await setConfig('stores',state.stores);
  }
  fillAllSelects();el('store').value=value;closeStoreModal();toast('購入店を追加しました。');
}

function renderCategoryFilters(){
  const categories=['すべて',...state.categories];
  if(!categories.includes(state.selectedCategory)) state.selectedCategory='すべて';
  const f=document.createDocumentFragment();
  categories.forEach(c=>{const b=document.createElement('button');b.type='button';b.className='category-filter-btn'+(c===state.selectedCategory?' active':'');b.textContent=c;b.dataset.category=c;f.appendChild(b);});
  el('categoryFilters').replaceChildren(f);
}

function handleCategoryFilterClick(e){const b=e.target.closest('[data-category]');if(!b)return;state.selectedCategory=b.dataset.category;renderCategoryFilters();renderInventory();}
function getDisplayItems(){return state.inventory.filter(i=>state.selectedCategory==='すべて'||i.category===state.selectedCategory).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));}

function renderInventory(){
  const items=getDisplayItems();el('inventoryCount').textContent=`${items.length}件`;
  const f=document.createDocumentFragment();
  if(!items.length){const d=document.createElement('div');d.className='empty';d.textContent=state.selectedCategory==='すべて'?'登録されている食材はありません。':`${state.selectedCategory}の食材はありません。`;f.appendChild(d);}
  else items.forEach((item,index)=>{const row=createInventoryRow(item);row.style.animationDelay=`${Math.min(index,10)*24}ms`;f.appendChild(row);});
  el('inventoryList').replaceChildren(f);
}

function createInventoryRow(item){
  const row=document.createElement('div');row.className='inventory-item'+(item.shopping?' is-shopping':'');row.style.borderLeftColor=COLORS[item.category]||'#b9c0c4';row.dataset.id=item.id;
  const info=document.createElement('div');info.className='item-info';info.dataset.action='detail';
  const name=document.createElement('div');name.className='item-name';name.textContent=item.name;
  const sub=document.createElement('div');sub.className='item-sub';sub.textContent=[item.amount,item.category,item.expiry?`期限 ${item.expiry}`:''].filter(Boolean).join(' ・ ');info.append(name,sub);
  const buttons=document.createElement('div');buttons.className='item-buttons';buttons.append(makeMiniButton('編集','edit','edit-btn'),makeMiniButton('削除','delete','delete-btn'));
  const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.className='shopping-check';checkbox.checked=!!item.shopping;checkbox.dataset.action='shopping';buttons.appendChild(checkbox);
  row.append(info,buttons);return row;
}
function makeMiniButton(text,action,className){const b=document.createElement('button');b.type='button';b.className=`mini-btn ${className}`;b.textContent=text;b.dataset.action=action;return b;}
function findItemFromTarget(target){const row=target.closest('.inventory-item');return row?state.inventory.find(i=>i.id===row.dataset.id):null;}

function handleInventoryClick(e){
  const t=e.target.closest('[data-action]');if(!t||t.dataset.action==='shopping')return;
  const item=findItemFromTarget(t);if(!item)return;
  if(t.dataset.action==='detail')openDetail(item);if(t.dataset.action==='edit')openEdit(item);if(t.dataset.action==='delete')deleteItem(item);
}

async function handleInventoryChange(e){
  if(!e.target.matches('[data-action="shopping"]'))return;
  const item=findItemFromTarget(e.target);if(!item)return;
  item.shopping=e.target.checked;item.updatedAt=new Date().toISOString();
  try{await putIngredient(item);e.target.closest('.inventory-item').classList.toggle('is-shopping',item.shopping);if(el('shoppingText').value)createShoppingList(false);}catch(err){e.target.checked=!e.target.checked;showError(err);}
}

function openDetail(item){state.detailItem=item;el('detailName').textContent=item.name||'';el('detailCategory').textContent=item.category||'—';el('detailAmount').textContent=item.amount||'—';el('detailExpiry').textContent=item.expiry||'—';el('detailStore').textContent=item.store||'—';el('detailMemo').textContent=item.memo||'—';el('detailModal').classList.add('show');}
function closeDetail(){el('detailModal').classList.remove('show');state.detailItem=null;}
function editDetailItem(){if(!state.detailItem)return;const item=state.detailItem;closeDetail();openEdit(item);}

function openEdit(item){state.editItem=item;fillSelect(el('editCategory'),state.categories,item.category,false);fillSelect(el('editStore'),state.stores,item.store,true);el('editName').value=item.name||'';el('editAmount').value=item.amount||'';el('editExpiry').value=item.expiry||'';el('editMemo').value=item.memo||'';el('editModal').classList.add('show');}
function closeEdit(){el('editModal').classList.remove('show');state.editItem=null;}

async function saveEdit(){
  if(!state.editItem)return;const data=readForm('edit');
  if(!data.name)return toast('品名を入力してください。');if(!data.category)return toast('カテゴリーを選択してください。');
  setButtonBusy('saveEditBtn',true,'保存中…');
  try{await putIngredient({...state.editItem,...data,updatedAt:new Date().toISOString()});closeEdit();await reloadInventory();toast('更新しました。');}catch(e){showError(e);}finally{setButtonBusy('saveEditBtn',false,'保存');}
}

async function deleteItem(item){if(!confirm(`「${item.name}」を削除しますか？\nこの操作は元に戻せません。`))return;try{await deleteIngredientDB(item.id);await reloadInventory();if(el('shoppingText').value)createShoppingList(false);toast('削除しました。');}catch(e){showError(e);}}

function createConsult(){
  const items=state.inventory.filter(i=>!['調味料','その他'].includes(i.category)).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  const lines=items.length?items.map(i=>i.amount?`- ${i.name}（${i.amount}）`:`- ${i.name}`).join('\n'):'（対象となる食材はありません）';
  const text=`献立相談テキスト\n\n\n日分の夕食の献立を考えてください。\n今ある材料は下記のものです。全てを使い切る必要はありません。\n最低限不足する材料は買い足しの指示をしてください。基本的な調味料はあるものとします。\n主菜のみの提案で大丈夫です、副菜はあるものを使って作ります。\n\n\n現在の食材\n\n\n${lines}\n\n\n\n希望のメニューは　です。\n\n\n\nなるべく被らず、同じような調理法が続かないようにしてほしいです。\n\n作り方を教えて欲しい献立がある場合はあとで指示します。`;
  showOutput('consultText',text);toast('相談文を作成しました。');return text;
}

function createShoppingList(showNotice=true){const text=state.inventory.filter(i=>i.shopping).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))).map(i=>i.name).join('\n');showOutput('shoppingText',text);if(showNotice)toast(text?'買い物リストを作成しました。':'チェックされた品目はありません。');return text;}
function showOutput(id,text){el(id).value=text;el(id).style.display='block';}
async function copyOutput(id,createFunction){const ta=el(id);if(!ta.value)createFunction();if(!ta.value)return;try{await navigator.clipboard.writeText(ta.value);}catch{ta.style.display='block';ta.select();document.execCommand('copy');}toast('コピーしました。');}
function updateMainCount(){el('inventoryCountMain').textContent=`${state.inventory.length}件`;}

function openSettings(){updateBackupLabel();el('settingsModal').classList.add('show');}
function closeSettings(){el('settingsModal').classList.remove('show');}

async function handleCSVFile(e){
  const file=e.target.files?.[0];e.target.value='';if(!file)return;
  try{const text=await file.text();const parsed=mapSheetCSV(text);state.pendingImport={text,parsed};el('importSummary').innerHTML=`読み込み対象 <strong>${parsed.items.length}件</strong><br>スキップ <strong>${parsed.skipped.length}件</strong><br>既存IDは維持します。`;el('importModal').classList.add('show');}catch(err){showError(err);}
}
function closeImportModal(){state.pendingImport=null;el('importModal').classList.remove('show');}
async function confirmImport(){if(!state.pendingImport)return;const mode=document.querySelector('input[name="importMode"]:checked')?.value||'merge';setButtonBusy('confirmImportBtn',true,'取込中…');try{const r=await importSheetCSV(state.pendingImport.text,mode);closeImportModal();await reloadInventory();toast(`${r.items.length}件をインポートしました。`);}catch(e){showError(e);}finally{setButtonBusy('confirmImportBtn',false,'インポート');}}

async function exportBackup(){try{const time=await downloadBackup();await updateBackupLabel(time);toast('バックアップを書き出しました。');}catch(e){showError(e);}}
async function handleJSONFile(e){const file=e.target.files?.[0];e.target.value='';if(!file)return;if(!confirm('現在のデータをバックアップ内容で置き換えます。続けますか？'))return;try{await restoreBackupFile(file);await initializeConfig();await reloadInventory();toast('バックアップを復元しました。');}catch(err){showError(err);}}
async function clearAllData(){if(!confirm('この端末の在庫データをすべて削除します。\nこの操作は元に戻せません。'))return;if(!confirm('本当に削除しますか？'))return;try{await clearIngredients();await reloadInventory();closeSettings();toast('在庫データを削除しました。');}catch(e){showError(e);}}
async function updateBackupLabel(value=null){const saved=value||await getMeta('lastBackup',null);el('lastBackupLabel').textContent=saved?new Date(saved).toLocaleString('ja-JP'):'未実施';}

async function registerServiceWorker(){
  if(!('serviceWorker' in navigator))return;
  try{
    const reg=await navigator.serviceWorker.register('./service-worker.js');state.registration=reg;
    if(reg.waiting)showUpdateBanner();
    reg.addEventListener('updatefound',()=>{const worker=reg.installing;if(!worker)return;worker.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)showUpdateBanner();});});
    navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload());
  }catch(e){console.warn('Service Worker registration failed',e);}
}
function showUpdateBanner(){el('updateBanner').hidden=false;el('updateStatus').textContent='新しいバージョンがあります';}
async function checkForUpdate(){if(!state.registration){el('updateStatus').textContent='更新機能を利用できません';return;}el('updateStatus').textContent='確認中…';try{await state.registration.update();if(state.registration.waiting)showUpdateBanner();else{el('updateStatus').textContent='最新版です';toast('最新版です。');}}catch{el('updateStatus').textContent='更新確認に失敗しました';}}
function applyUpdate(){if(state.registration?.waiting)state.registration.waiting.postMessage({type:'SKIP_WAITING'});else location.reload();}

function setButtonBusy(id,busy,text){const b=el(id);b.disabled=busy;b.textContent=text;}
function showError(error){console.error(error);toast(error?.message||String(error||'エラーが発生しました。'));}
function toast(message){const box=el('toast');box.textContent=message;box.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>box.classList.remove('show'),2400);}
