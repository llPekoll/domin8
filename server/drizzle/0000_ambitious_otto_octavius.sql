CREATE TABLE "bot_configurations" (
	"id" serial PRIMARY KEY NOT NULL,
	"wallet_address" text NOT NULL,
	"tier" text NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"fixed_bet_amount" bigint,
	"selected_character" integer,
	"budget_limit" bigint,
	"current_spent" bigint DEFAULT 0,
	"bet_min" bigint,
	"bet_max" bigint,
	"stop_loss" bigint,
	"win_streak_multiplier" real,
	"cooldown_rounds" integer,
	"character_rotation" json,
	"take_profit" bigint,
	"martingale_enabled" boolean DEFAULT false,
	"anti_martingale_enabled" boolean DEFAULT false,
	"schedule_start" integer,
	"schedule_end" integer,
	"smart_sizing" boolean DEFAULT false,
	"smart_sizing_threshold" bigint,
	"consecutive_wins" integer DEFAULT 0,
	"consecutive_losses" integer DEFAULT 0,
	"last_bet_amount" bigint,
	"rounds_skipped" integer DEFAULT 0,
	"total_profit" bigint DEFAULT 0,
	"total_bets" integer DEFAULT 0,
	"total_wins" integer DEFAULT 0,
	"session_signer_enabled" boolean DEFAULT false,
	"last_updated" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_performance_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"wallet_address" text NOT NULL,
	"round_id" integer NOT NULL,
	"bet_amount" bigint NOT NULL,
	"result" text DEFAULT 'pending' NOT NULL,
	"prize_amount" bigint,
	"profit" bigint DEFAULT 0 NOT NULL,
	"timestamp" bigint NOT NULL,
	"strategy" text
);
--> statement-breakpoint
CREATE TABLE "bot_purchases" (
	"id" serial PRIMARY KEY NOT NULL,
	"wallet_address" text NOT NULL,
	"tier" text NOT NULL,
	"purchased_at" bigint NOT NULL,
	"transaction_signature" text NOT NULL,
	"purchase_amount" bigint NOT NULL,
	"is_active_bot" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "characters" (
	"id" serial PRIMARY KEY NOT NULL,
	"character_id" integer NOT NULL,
	"name" text NOT NULL,
	"asset_path" text,
	"description" text,
	"nft_collection" text,
	"nft_collection_name" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sprite_offset_y" real DEFAULT 0,
	"base_scale" real DEFAULT 1,
	"preview_offset_y" real DEFAULT 0,
	"preview_scale" real DEFAULT 1
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"sender_wallet" text,
	"sender_name" text,
	"message" text NOT NULL,
	"type" text DEFAULT 'user' NOT NULL,
	"game_type" text,
	"timestamp" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "current_game_participants" (
	"id" serial PRIMARY KEY NOT NULL,
	"odid" text NOT NULL,
	"wallet_address" text NOT NULL,
	"display_name" text NOT NULL,
	"game_round" integer NOT NULL,
	"character_id" integer NOT NULL,
	"character_key" text NOT NULL,
	"bet_index" integer NOT NULL,
	"bet_amount" real NOT NULL,
	"position" json NOT NULL,
	"is_boss" boolean DEFAULT false NOT NULL,
	"spawn_index" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_round_states" (
	"id" serial PRIMARY KEY NOT NULL,
	"round_id" integer NOT NULL,
	"status" text NOT NULL,
	"start_timestamp" bigint DEFAULT 0 NOT NULL,
	"end_timestamp" bigint DEFAULT 0 NOT NULL,
	"captured_at" bigint DEFAULT 0 NOT NULL,
	"map_id" integer,
	"bet_count" integer,
	"bet_amounts" json,
	"bet_skin" json,
	"bet_position" json,
	"bet_wallet_index" json,
	"wallets" json,
	"total_pot" bigint,
	"winner" text,
	"winning_bet_index" integer DEFAULT 0,
	"prize_sent" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "maps" (
	"id" serial PRIMARY KEY NOT NULL,
	"map_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"spawn_configuration" json,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nft_collection_holders" (
	"id" serial PRIMARY KEY NOT NULL,
	"collection_address" text NOT NULL,
	"wallet_address" text NOT NULL,
	"nft_count" integer DEFAULT 0 NOT NULL,
	"last_verified" bigint NOT NULL,
	"added_by" text DEFAULT 'cron' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nft_refresh_limits" (
	"id" serial PRIMARY KEY NOT NULL,
	"wallet_address" text NOT NULL,
	"last_refresh_at" bigint NOT NULL,
	"refresh_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "one_v_one_lobbies" (
	"id" serial PRIMARY KEY NOT NULL,
	"lobby_id" integer NOT NULL,
	"lobby_pda" text,
	"share_token" text NOT NULL,
	"player_a" text NOT NULL,
	"player_b" text,
	"amount" bigint NOT NULL,
	"status" integer DEFAULT 0 NOT NULL,
	"winner" text,
	"is_private" boolean DEFAULT false,
	"character_a" integer NOT NULL,
	"character_b" integer,
	"map_id" integer NOT NULL,
	"created_at" bigint NOT NULL,
	"resolved_at" bigint,
	"settle_tx_hash" text,
	"prize_amount" bigint,
	"win_streak" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "payout_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"wallet_address" text NOT NULL,
	"amount" bigint NOT NULL,
	"paid_at" bigint NOT NULL,
	"tx_hash" text,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "platform_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text DEFAULT 'global' NOT NULL,
	"total_pot_lamports" bigint DEFAULT 0 NOT NULL,
	"earnings_lamports" bigint DEFAULT 0 NOT NULL,
	"games_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" serial PRIMARY KEY NOT NULL,
	"wallet_address" text NOT NULL,
	"external_wallet_address" text,
	"display_name" text,
	"last_active" bigint DEFAULT 0 NOT NULL,
	"total_games_played" integer DEFAULT 0 NOT NULL,
	"total_wins" integer DEFAULT 0 NOT NULL,
	"total_points" integer DEFAULT 0,
	"achievements" json DEFAULT '[]'::json,
	"xp" integer DEFAULT 0,
	"level" integer DEFAULT 1,
	"current_win_streak" integer DEFAULT 0,
	"last_daily_login_date" text,
	"last_daily_bet_date" text
);
--> statement-breakpoint
CREATE TABLE "presence_bot_spawns" (
	"id" serial PRIMARY KEY NOT NULL,
	"round_id" integer NOT NULL,
	"spawned_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"wallet_address" text,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" bigint NOT NULL,
	"last_used" bigint,
	"user_agent" text,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referral_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"wallet_address" text NOT NULL,
	"referral_code" text NOT NULL,
	"total_referred" integer DEFAULT 0 NOT NULL,
	"total_revenue" bigint DEFAULT 0 NOT NULL,
	"accumulated_rewards" bigint DEFAULT 0 NOT NULL,
	"total_paid_out" bigint DEFAULT 0,
	"last_payout_date" bigint,
	"last_payout_amount" bigint,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" serial PRIMARY KEY NOT NULL,
	"referrer_id" text NOT NULL,
	"referred_user_id" text NOT NULL,
	"referral_code" text NOT NULL,
	"signup_date" bigint NOT NULL,
	"total_bet_volume" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"round_id" integer NOT NULL,
	"action" text NOT NULL,
	"scheduled_time" bigint NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" bigint NOT NULL,
	"completed_at" bigint,
	"error" text
);
--> statement-breakpoint
CREATE INDEX "idx_bc_wallet" ON "bot_configurations" USING btree ("wallet_address");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_bc_wallet_tier" ON "bot_configurations" USING btree ("wallet_address","tier");--> statement-breakpoint
CREATE INDEX "idx_bc_active" ON "bot_configurations" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_bps_wallet" ON "bot_performance_stats" USING btree ("wallet_address");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_bps_wallet_round" ON "bot_performance_stats" USING btree ("wallet_address","round_id");--> statement-breakpoint
CREATE INDEX "idx_bps_timestamp" ON "bot_performance_stats" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_bp_wallet" ON "bot_purchases" USING btree ("wallet_address");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_bp_wallet_tier" ON "bot_purchases" USING btree ("wallet_address","tier");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_chars_character_id" ON "characters" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "idx_chars_active" ON "characters" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_chat_timestamp" ON "chat_messages" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_chat_sender_time" ON "chat_messages" USING btree ("sender_wallet","timestamp");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_cgp_odid" ON "current_game_participants" USING btree ("odid");--> statement-breakpoint
CREATE INDEX "idx_cgp_game_round" ON "current_game_participants" USING btree ("game_round");--> statement-breakpoint
CREATE INDEX "idx_cgp_wallet" ON "current_game_participants" USING btree ("wallet_address");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_grs_round_status" ON "game_round_states" USING btree ("round_id","status");--> statement-breakpoint
CREATE INDEX "idx_grs_round_id" ON "game_round_states" USING btree ("round_id");--> statement-breakpoint
CREATE INDEX "idx_grs_status" ON "game_round_states" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_grs_status_round" ON "game_round_states" USING btree ("status","round_id");--> statement-breakpoint
CREATE INDEX "idx_grs_captured_at" ON "game_round_states" USING btree ("captured_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_maps_map_id" ON "maps" USING btree ("map_id");--> statement-breakpoint
CREATE INDEX "idx_maps_active" ON "maps" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_nfth_collection" ON "nft_collection_holders" USING btree ("collection_address");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_nfth_collection_wallet" ON "nft_collection_holders" USING btree ("collection_address","wallet_address");--> statement-breakpoint
CREATE INDEX "idx_nfth_wallet" ON "nft_collection_holders" USING btree ("wallet_address");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_nrl_wallet" ON "nft_refresh_limits" USING btree ("wallet_address");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_1v1_lobby_id" ON "one_v_one_lobbies" USING btree ("lobby_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_1v1_share_token" ON "one_v_one_lobbies" USING btree ("share_token");--> statement-breakpoint
CREATE INDEX "idx_1v1_status" ON "one_v_one_lobbies" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_1v1_player_a" ON "one_v_one_lobbies" USING btree ("player_a");--> statement-breakpoint
CREATE INDEX "idx_1v1_player_b" ON "one_v_one_lobbies" USING btree ("player_b");--> statement-breakpoint
CREATE INDEX "idx_1v1_status_created" ON "one_v_one_lobbies" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_ph_wallet" ON "payout_history" USING btree ("wallet_address");--> statement-breakpoint
CREATE INDEX "idx_ph_paid_at" ON "payout_history" USING btree ("paid_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_ps_key" ON "platform_stats" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_players_wallet" ON "players" USING btree ("wallet_address");--> statement-breakpoint
CREATE INDEX "idx_players_xp" ON "players" USING btree ("xp");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_pbs_round" ON "presence_bot_spawns" USING btree ("round_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_push_endpoint" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "idx_push_wallet" ON "push_subscriptions" USING btree ("wallet_address");--> statement-breakpoint
CREATE INDEX "idx_push_active" ON "push_subscriptions" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_rs_wallet" ON "referral_stats" USING btree ("wallet_address");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_rs_code" ON "referral_stats" USING btree ("referral_code");--> statement-breakpoint
CREATE INDEX "idx_rs_revenue" ON "referral_stats" USING btree ("total_revenue");--> statement-breakpoint
CREATE INDEX "idx_ref_referrer" ON "referrals" USING btree ("referrer_id");--> statement-breakpoint
CREATE INDEX "idx_ref_referred_user" ON "referrals" USING btree ("referred_user_id");--> statement-breakpoint
CREATE INDEX "idx_ref_code" ON "referrals" USING btree ("referral_code");--> statement-breakpoint
CREATE INDEX "idx_sj_round_status" ON "scheduled_jobs" USING btree ("round_id","status");--> statement-breakpoint
CREATE INDEX "idx_sj_status" ON "scheduled_jobs" USING btree ("status");