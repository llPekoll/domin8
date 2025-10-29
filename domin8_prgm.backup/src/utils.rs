use anchor_lang::prelude::*;
use crate::errors::Domin8Error;

/// Utility functions for the Domin8 battle royale program
pub struct GameUtils;

impl GameUtils {
    /// Select winner based on weighted random selection using VRF randomness
    ///
    /// This function implements a provably fair winner selection algorithm:
    /// 1. Uses VRF randomness to generate a random position in the total pot
    /// 2. Finds which bet this position falls into based on cumulative bet amounts
    /// 3. Returns the winner's bet index
    ///
    /// # Arguments
    /// * `bet_amounts` - Fixed array of bet amounts (max 64)
    /// * `bet_count` - Number of active bets in the array
    /// * `randomness` - VRF randomness value
    ///
    /// # Returns
    /// * `winning_bet_index` - The index of the winning bet
    ///
    /// # Example
    /// If we have bets: [2 SOL, 3 SOL, 5 SOL], Total: 10 SOL
    /// Random position 0-1.99 → Index 0 wins
    /// Random position 2-4.99 → Index 1 wins
    /// Random position 5-9.99 → Index 2 wins
    pub fn select_weighted_winner(
        bet_amounts: &[u64; 64],
        bet_count: usize,
        randomness: u64
    ) -> Result<usize> {
        require!(bet_count > 0, Domin8Error::NoPlayers);
        require!(bet_count <= 64, Domin8Error::MaxBetsReached);

        // Calculate total weight from active bets only
        let total_weight: u64 = bet_amounts[..bet_count].iter().sum();
        require!(total_weight > 0, Domin8Error::InvalidBetAmount);

        // Use randomness to select a position in the weight range
        let winning_position = randomness % total_weight;

        msg!("🎲 Winner Selection:");
        msg!("  VRF randomness: {}", randomness);
        msg!("  Total pot: {} lamports", total_weight);
        msg!("  Winning position: {} lamports", winning_position);
        msg!("  Total bets: {}", bet_count);

        // Find winner based on cumulative weights
        let mut cumulative = 0u64;
        for index in 0..bet_count {
            let previous_cumulative = cumulative;
            cumulative = cumulative.saturating_add(bet_amounts[index]);

            msg!("  Bet {}: {} lamports (range: {}-{})",
                index, bet_amounts[index], previous_cumulative, cumulative - 1);

            if winning_position < cumulative {
                msg!("✓ Winner found! Bet index {}", index);
                return Ok(index);
            }
        }

        // Fallback to last bet (should never reach here if math is correct)
        msg!("⚠️ Fallback to last bet (index {})", bet_count - 1);
        Ok(bet_count - 1)
    }

    /// Calculate win probability for a specific bet
    ///
    /// # Arguments
    /// * `bet_amount` - The bet amount in lamports
    /// * `total_pot` - Total pot amount in lamports
    ///
    /// # Returns
    /// * Probability as percentage (e.g., 35.5 = 35.5%)
    pub fn calculate_win_probability(bet_amount: u64, total_pot: u64) -> Result<f64> {
        require!(total_pot > 0, Domin8Error::InvalidBetAmount);
        Ok((bet_amount as f64 / total_pot as f64) * 100.0)
    }

    /// Calculate win probability in basis points (for events)
    ///
    /// # Arguments
    /// * `bet_amount` - The bet amount in lamports
    /// * `total_pot` - Total pot amount in lamports
    ///
    /// # Returns
    /// * Probability in basis points (e.g., 3550 = 35.5%)
    pub fn calculate_win_probability_bps(bet_amount: u64, total_pot: u64) -> Result<u64> {
        require!(total_pot > 0, Domin8Error::InvalidBetAmount);

        // Calculate: (bet_amount * 10000) / total_pot
        let probability_bps = (bet_amount as u128)
            .checked_mul(10000)
            .ok_or(Domin8Error::ArithmeticOverflow)?
            .checked_div(total_pot as u128)
            .ok_or(Domin8Error::ArithmeticOverflow)? as u64;

        Ok(probability_bps)
    }

    /// Calculate house fee from total pot and basis points
    ///
    /// # Arguments
    /// * `total_pot` - The total amount in the pot (in lamports)
    /// * `fee_bps` - Fee percentage in basis points (500 = 5%)
    ///
    /// # Returns
    /// * Fee amount in lamports
    ///
    /// # Examples
    /// * calculate_house_fee(1_000_000, 500) = 50_000 (5% of 1M lamports)
    /// * calculate_house_fee(2_000_000, 250) = 50_000 (2.5% of 2M lamports)
    pub fn calculate_house_fee(total_pot: u64, fee_bps: u16) -> Result<u64> {
        // Validate fee percentage is within bounds
        require!(fee_bps <= 10000, Domin8Error::InvalidBetAmount); // Max 100%

        // Calculate: (total_pot * fee_bps) / 10000
        let fee_amount = (total_pot as u128)
            .checked_mul(fee_bps as u128)
            .ok_or(Domin8Error::ArithmeticOverflow)?
            .checked_div(10000)
            .ok_or(Domin8Error::ArithmeticOverflow)? as u64;

        Ok(fee_amount)
    }

    /// Calculate winner payout after house fee
    ///
    /// # Arguments
    /// * `total_pot` - The total amount in the pot
    /// * `fee_bps` - Fee percentage in basis points
    ///
    /// # Returns
    /// * Winner payout amount in lamports
    pub fn calculate_winner_payout(total_pot: u64, fee_bps: u16) -> Result<u64> {
        let house_fee = Self::calculate_house_fee(total_pot, fee_bps)?;
        Ok(total_pot.saturating_sub(house_fee))
    }

    /// Convert basis points to percentage for display
    ///
    /// # Arguments
    /// * `bps` - Basis points (500 = 5%)
    ///
    /// # Returns
    /// * Percentage as f64 (e.g., 5.0)
    pub fn bps_to_percentage(bps: u64) -> f64 {
        bps as f64 / 100.0
    }

    /// Convert bytes array to hex string for display
    pub fn bytes_to_hex(bytes: &[u8; 32]) -> String {
        bytes.iter()
            .map(|b| format!("{:02x}", b))
            .collect()
    }

    /// Count unique users from bet entries (for analytics)
    ///
    /// # Arguments
    /// * `bet_entries` - Slice of BetEntry accounts
    ///
    /// # Returns
    /// * Number of unique wallet addresses
    pub fn count_unique_users(wallets: &[Pubkey]) -> usize {
        let mut unique: Vec<Pubkey> = Vec::new();
        for wallet in wallets {
            if !unique.contains(wallet) {
                unique.push(*wallet);
            }
        }
        unique.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_win_probability_bps() {
        // 35% probability
        let result = GameUtils::calculate_win_probability_bps(350_000_000, 1_000_000_000).unwrap();
        assert_eq!(result, 3500); // 35.00%

        // 50% probability
        let result = GameUtils::calculate_win_probability_bps(500_000_000, 1_000_000_000).unwrap();
        assert_eq!(result, 5000); // 50.00%

        // 100% probability
        let result = GameUtils::calculate_win_probability_bps(1_000_000_000, 1_000_000_000).unwrap();
        assert_eq!(result, 10000); // 100.00%
    }

    #[test]
    fn test_calculate_house_fee() {
        // 5% fee on 1 SOL
        let result = GameUtils::calculate_house_fee(1_000_000_000, 500).unwrap();
        assert_eq!(result, 50_000_000);

        // 2.5% fee on 2 SOL
        let result = GameUtils::calculate_house_fee(2_000_000_000, 250).unwrap();
        assert_eq!(result, 50_000_000);
    }

    #[test]
    fn test_winner_payout() {
        // 1 SOL pot, 5% fee = 0.95 SOL payout
        let result = GameUtils::calculate_winner_payout(1_000_000_000, 500).unwrap();
        assert_eq!(result, 950_000_000);
    }
}
