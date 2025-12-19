use anchor_lang::prelude::*;
use crate::error::Domin81v1Error;

/// Utility functions for the domin8_1v1 program
pub struct Utils;

impl Utils {
    /// Convert bytes array to hex string for display
    pub fn bytes_to_hex(bytes: &[u8; 32]) -> String {
        bytes
            .iter()
            .map(|b| format!("{:02x}", b))
            .collect::<Vec<_>>()
            .join("")
    }

    /// Convert Switchboard randomness bytes to a winner determination
    /// 
    /// Takes the raw randomness bytes [u8; 32] and uses modulo 2 to determine winner:
    /// - Even (0) → Player A wins
    /// - Odd (1) → Player B wins
    /// 
    /// Converts the first 8 bytes to a u64 in little-endian format,
    /// then uses modulo 2 for fair coin flip outcome.
    /// 
    /// @param randomness - Raw [u8; 32] randomness bytes from Switchboard
    /// @return true if Player A wins, false if Player B wins
    pub fn determine_winner_from_randomness(randomness: &[u8; 32]) -> Result<bool> {
        // Convert first 8 bytes to u64 in little-endian
        let mut bytes_array = [0u8; 8];
        bytes_array.copy_from_slice(&randomness[0..8]);
        let randomness_int = u64::from_le_bytes(bytes_array);

        // Use modulo 2 to determine winner
        // Even (0) = Player A wins (true)
        // Odd (1) = Player B wins (false)
        Ok(randomness_int % 2 == 0)
    }

    /// Alternative winner determination using XOR of all bytes for better distribution
    /// This provides a more uniform distribution across the full randomness range
    /// 
    /// XORs all 32 bytes together, then uses modulo 2 to determine winner
    pub fn determine_winner_from_randomness_xor(randomness: &[u8; 32]) -> Result<bool> {
        // XOR all bytes together for better distribution
        let xor_result = randomness.iter().fold(0u8, |acc, &b| acc ^ b);

        // Use modulo 2 to determine winner
        Ok(xor_result % 2 == 0)
    }
}
