// Личный кабинет получает заказы только после проверки сервером.
const form=document.querySelector('#login'),status=document.querySelector('#status'),list=document.querySelector('#orders');
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=value=>new Intl.NumberFormat('ru-RU').format(value)+' ₽';
form.addEventListener('submit',async event=>{
  event.preventDefault();status.className='';status.textContent='Загружаем…';list.innerHTML='';
  try{
    const response=await fetch('./api/orders',{headers:{Authorization:'Bearer '+document.querySelector('#token').value}});
    if(!response.ok)throw new Error('Доступ запрещён или сервер недоступен');
    const data=await response.json();status.textContent=`Заказов: ${data.orders.length}`;
    list.innerHTML=data.orders.map(o=>`<article class="order"><h2>Заказ №${esc(o.number)} · ${money(o.total)}</h2><p class="muted">${new Date(o.date).toLocaleString('ru-RU')}</p><p>${esc(o.name)} · <a href="tel:${esc(o.phone.replace(/[^+\d]/g,''))}">${esc(o.phone)}</a></p><p>${esc(o.address)}</p>${o.comment?`<p>${esc(o.comment)}</p>`:''}<p>Товары: ${o.items.map(i=>`№${esc(i.id)} × ${esc(i.qty)} м²`).join(', ')}</p></article>`).join('');
  }catch(error){status.className='error';status.textContent=error.message}
});
