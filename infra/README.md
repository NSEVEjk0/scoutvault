# ScoutVault services

ScoutVault runs its own Supabase PostgreSQL, PostgREST, Realtime, and Storage services. Wallet login supplies a short-lived JWT. Public map rows contain approximate locations. Private bounty details and photos are restricted to the buyer and assigned scout.

The images and initialization scripts follow the official Supabase Docker setup at revision `fbd1e34128b7f1afe53d7a721272eb781469de35`. Their source is available in the [Supabase repository](https://github.com/supabase/supabase/tree/fbd1e34128b7f1afe53d7a721272eb781469de35/docker).

Run `node scripts/setup-infra.mjs`, then `docker compose --env-file .local/deployment.env -f infra/compose.yml up -d`. The setup script creates private credentials and retains them on repeat runs. Every service binds to loopback. The application gateway supplies the public TLS endpoint.

Database and file storage use named Docker volumes. Restarting a process does not erase a bounty or its report. Back up both volumes and the private environment file together.
