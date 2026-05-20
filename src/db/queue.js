const { supabase } = require('./supabase');

const TABLE = 'message_queue';

async function getPendingForContact(contactId) {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('contact_id', contactId)
    .eq('processed', false)
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) {
    console.error('[QUEUE] getPendingForContact error:', error.message);
    return null;
  }

  return (data && data[0]) || null;
}

async function countProcessedForContact(contactId) {
  if (!supabase) return 0;

  const { count, error } = await supabase
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('contact_id', contactId)
    .eq('processed', true);

  if (error) {
    console.error('[QUEUE] countProcessedForContact error:', error.message);
    return 0;
  }

  return count || 0;
}

async function enqueueMessage({
  contactId,
  manychatContactId,
  message,
  replyNumber,
  scheduledAt,
}) {
  if (!supabase) {
    console.error('[QUEUE] enqueueMessage skipped: no supabase client');
    return null;
  }

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      contact_id: contactId,
      manychat_contact_id: manychatContactId,
      message,
      reply_number: replyNumber,
      scheduled_at: scheduledAt,
      processed: false,
    })
    .select()
    .single();

  if (error) {
    console.error('[QUEUE] enqueueMessage error:', error.message);
    return null;
  }

  return data;
}

async function fetchDueRows(limit = 25) {
  if (!supabase) return [];

  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .lte('scheduled_at', nowIso)
    .eq('processed', false)
    .order('scheduled_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('[QUEUE] fetchDueRows error:', error.message);
    return [];
  }

  return data || [];
}

async function markProcessed(rowId) {
  if (!supabase) return;

  const { error } = await supabase
    .from(TABLE)
    .update({ processed: true })
    .eq('id', rowId);

  if (error) {
    console.error('[QUEUE] markProcessed error:', error.message);
  }
}

async function claimRow(rowId) {
  if (!supabase) return false;

  const { data, error } = await supabase
    .from(TABLE)
    .update({ processed: true })
    .eq('id', rowId)
    .eq('processed', false)
    .select();

  if (error) {
    console.error('[QUEUE] claimRow error:', error.message);
    return false;
  }

  return Array.isArray(data) && data.length > 0;
}

module.exports = {
  getPendingForContact,
  countProcessedForContact,
  enqueueMessage,
  fetchDueRows,
  markProcessed,
  claimRow,
};
