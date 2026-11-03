# Creates an institution in a revU database and invites its first
# administrator (docs/DEPLOY.md, "The first institution").
#
# Run from the repository root:  powershell -File scripts/create-org.ps1
#
# It asks for the database address, the app account password and the Clerk
# key without showing them, and passes them only to the container, so they
# stay out of files, history and chat. It runs the server image in Docker,
# so it works where Windows blocks local builds.
#
# The password must be the APP_DB_PASSWORD the live server uses: the command
# applies any new migrations and sets the revu_app password, and a different
# one would lock the running server out of its database.

$ErrorActionPreference = 'Stop'

function Read-Secret($prompt) {
  $s = Read-Host -Prompt $prompt -AsSecureString
  [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
}

Write-Host 'Building the server image from this checkout...'
docker compose build api | Out-Null
if (-not $?) { throw 'The image did not build.' }

$db = Read-Secret "Database public address (Railway, Postgres card, Variables, DATABASE_PUBLIC_URL)"
$pw = Read-Secret "APP_DB_PASSWORD, exactly as on the revu service"
$key = Read-Secret "CLERK_SECRET_KEY, as on the revu service (sk_test_ or sk_live_)"
$name = Read-Host -Prompt 'Institution name'
$kind = Read-Host -Prompt 'Type (school, college or university)'
$email = Read-Host -Prompt "Administrator's email (the address they sign in with)"
$url = Read-Host -Prompt 'App address [https://revu.bhusku.com]'
if (-not $url) { $url = 'https://revu.bhusku.com' }

if ($db -notmatch '^postgres(ql)?://') { throw 'The database address should start with postgresql://' }
if ($pw.Length -lt 12) { throw 'APP_DB_PASSWORD is at least 12 characters; copy it from the revu service.' }
if ($key -notmatch '^sk_(test|live)_') { throw 'The Clerk secret key starts with sk_test_ or sk_live_ (no brackets or quotes).' }

# Values go to the container through the environment of this process only.
$env:MIGRATE_DATABASE_URL = $db
$env:APP_DB_PASSWORD = $pw
$env:CLERK_SECRET_KEY = $key
$env:APP_URL = $url
try {
  docker run --rm -e MIGRATE_DATABASE_URL -e APP_DB_PASSWORD -e CLERK_SECRET_KEY -e APP_URL -e ALLOWED_ORIGINS=$url revu-api create-org $name $kind $email
  if (-not $?) { throw 'create-org failed; see the message above.' }
} finally {
  Remove-Item Env:MIGRATE_DATABASE_URL, Env:APP_DB_PASSWORD, Env:CLERK_SECRET_KEY, Env:APP_URL -ErrorAction SilentlyContinue
}
Write-Host "Done. $email can now sign in at $url and will be the administrator."
