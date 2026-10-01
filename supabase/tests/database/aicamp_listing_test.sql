begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select no_plan();

select is(public.public_listing_url('https://www.aicamp.ai/event/eventdetails/W2099010101/?token=private&utm_source=test#private'), 'https://aicamp.ai/event/eventdetails/W2099010101', 'AICamp canonicalizes and strips private parameters');
select is(public.public_listing_url('https://aicamp.ai/event/eventdetails/W2099010102'), 'https://aicamp.ai/event/eventdetails/W2099010102', 'distinct AICamp IDs remain distinct');
select is(public.public_listing_url('https://aicamp.ai/event/eventdetails/'), null::text, 'AICamp directory is not a listing');
select is(public.public_listing_url('https://aicamp.ai/event/eventdetails/login'), null::text, 'AICamp login is not a listing');
select is(public.public_listing_url('https://aicamp.ai/event/eventdetails/w2099010101'), null::text, 'AICamp ID case is significant');
select is(public.public_listing_url('https://aicamp.ai/event/eventdetails/W209901010'), null::text, 'short AICamp ID is rejected');
select is(public.public_listing_url('https://aicamp.ai/event/eventdetails/W20990101012'), null::text, 'long AICamp ID is rejected');
select is(public.public_listing_url('https://aicamp.ai/event/eventdetails/%572099010101'), null::text, 'encoded AICamp ID is rejected');
select is(public.public_listing_url('https://aicamp.ai/event/eventdetails/W2099010101/extra'), null::text, 'nested AICamp listing is rejected');
select is(public.public_listing_url('https://events.aicamp.ai/event/eventdetails/W2099010101'), null::text, 'unverified AICamp subdomain is rejected');
select is(public.public_listing_url('https://user:private@aicamp.ai/event/eventdetails/W2099010101'), null::text, 'AICamp credentials are rejected');

select * from finish();
rollback;
