"""Regressões transacionais e concorrentes em PostgreSQL descartável (sem rede de provedores)."""
import concurrent.futures
import os
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parent.parent
if os.environ.get('PGDATABASE') != 'nexus_audit_test':
    raise SystemExit('Use somente PGDATABASE=nexus_audit_test em um PostgreSQL descartável vazio.')


def sql(code):
    p = subprocess.run(['psql', '-X', '-v', 'ON_ERROR_STOP=1', '-At'], input=code,
                       text=True, capture_output=True)
    if p.returncode:
        raise RuntimeError(p.stderr)
    return p.stdout.strip()


if sql("select count(*) from pg_tables where schemaname='public'") != '0':
    raise SystemExit('O banco de teste precisa estar vazio; nenhum schema será apagado automaticamente.')
sql((ROOT/'supabase/tests/fixtures/auditoria_schema.sql').read_text())
base = (ROOT/'supabase/migrations/20261022090000_fundacao_plataforma.sql').read_text()
for name in ['enqueue_job', 'emit_event', 'notify_user']:
    definition = re.search(r'create or replace function public\.'+name+r'\(.*?\$\$;', base, re.S).group()
    sql(definition)
old = (ROOT/'supabase/migrations/20261102090000_captacao_atomica_e_telefone.sql').read_text()
sql(re.search(r'create or replace function public\.capture_form_submission\(.*?\$\$;', old, re.S).group())
sql((ROOT/'supabase/migrations/20261102164904_corrigir_auditoria_nexus.sql').read_text())
sql((ROOT/'supabase/tests/auditoria_regressao.sql').read_text())

# Dez conexões independentes, mesmo formulário e cursor; contatos e visitantes distintos.
def submit(i):
    return sql(f"""select capture_form_submission('10000000-0000-0000-0000-000000000001',
      '{{"name":"concorrente {i}","email":"parallel{i}@example.invalid"}}', '{{}}','{{}}','form',
      '{{"atomic_version":2,"payload":{{"n":{i}}},"source":"form","confirm_token":"{i:036x}"}}',
      '[]','parallel-{i}');""")

with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
    list(pool.map(submit, range(1, 21)))
counts = sql("""select string_agg(n::text,',' order by owner_user_id) from
 (select owner_user_id,count(*) n from contacts where email like 'parallel%@example.invalid'
 group by owner_user_id) x""")
assert counts == '10,10', counts
before = sql('select count(*) from domain_events')
submit(1)
assert sql('select count(*) from domain_events') == before
print('PASS: captura atômica, consentimento/rollback/retry, confirmação idempotente, '
      'autorização, isolamento do responsável, monitor e rodízio concorrente 10/10.')
